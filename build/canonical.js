// ══════════════════════════════════════════════════════════════
// The client side of mingle-write-v1
// ══════════════════════════════════════════════════════════════
// Every product action that changes a connection is a signed envelope. This module is
// the only place that builds one, and it is written to agree with the server byte for
// byte rather than approximately, because a client that is nearly right produces
// signatures that verify against nothing.
//
// The envelope, fields fixed by decision:
//
//   { domain: "mingle-write-v1", operation, actor_key, resource: { type, id },
//     issued_at, nonce, payload_digest }
//
//   payload_digest = SHA-256(JCS({ domain: "mingle-payload-v1", operation, resource, payload }))
//   the actor signs JCS(envelope)
//   write_ref      = SHA-256(JCS(envelope))
//
// FOUR THINGS THAT ARE EASY TO GET WRONG AND ARE NOT NEGOTIABLE.
//
// 1. JCS IS RFC 8785, from canonicalize@5.0.0. The `canonicalize` export of
//    agent-passport-system is NOT JCS equivalent: it deletes null valued members. The
//    server uses RFC 8785 for this envelope and APS canonicalization for the older
//    card_hash, approved_hash and sharedDigest preimages, and so does this module. Using
//    the wrong one produces a digest the server will not match.
//
// 2. THE PAYLOAD GATE RUNS HERE TOO. The server refuses null, a non finite number, a
//    control character, edge whitespace, malformed unicode and a payload deeper than 12.
//    Refusing locally turns a 400 into a message the agent can act on, and it means the
//    principal is never shown a preview of bytes that cannot be sent.
//
// 3. NORMALIZATION HAPPENS BEFORE THE PREVIEW, NEVER AFTER THE SIGNATURE. The client
//    produces the final bytes, shows those bytes, then signs those bytes. The server
//    never repairs, so anything this client would have fixed afterwards is a refusal.
//
// 4. NONCES ARE 16 CSPRNG BYTES AS UNPADDED BASE64URL, never randomUUID. A UUID carries
//    about 122 bits and a version nibble, and the server refuses one by shape.
import { createHash, randomBytes } from "node:crypto";
import { sign } from "agent-passport-system";
import canonicalizeJcs from "canonicalize";
export const WRITE_DOMAIN = "mingle-write-v1";
export const PAYLOAD_DOMAIN = "mingle-payload-v1";
export const PRIVATE_VALUE_DOMAIN = "mingle-private-value-v1";
export const MAX_PAYLOAD_DEPTH = 12;
/** The resource type each operation names. The server fixes this and refuses a mismatch
 *  with resource_type_mismatch, so getting it wrong here is a 400 rather than a subtle
 *  bug, and stating it once means no call site has to remember. */
export const OPERATION_RESOURCE_TYPE = {
    request_intro: "intro_request",
    block_pair: "card_pair",
    withdraw_request: "intro",
    express_interest: "intro",
    decline: "intro",
    withdraw_interest: "intro",
    share_contact: "intro",
    withdraw_contact: "intro",
    fit_request: "intro",
    fit_commit: "intro",
    fit_round2: "intro",
    fit_answers: "intro",
    release_exact: "intro",
    first_step_propose: "intro",
    first_step_approve: "intro",
    fit_exchange_round2: "fit_exchange",
    fit_exchange_custom: "fit_exchange",
    fit_exchange_answers: "fit_exchange",
    fit_exchange_close: "fit_exchange",
    autonomy_pause: "card",
};
/** The two operations that carry a value the server must never hold in a shared
 *  receipt, so the two that send an opening beside the signed payload. */
export const PRIVATE_VALUE_OPERATIONS = ["share_contact", "release_exact"];
// ── JCS, and the gate the server applies to a payload ─────────────────────
export function jcs(value) {
    const out = canonicalizeJcs(value);
    if (typeof out !== "string") {
        throw new CanonicalError("unsupported_value", "this value has no canonical JSON form");
    }
    return out;
}
export function sha256Hex(text) {
    return createHash("sha256").update(text, "utf8").digest("hex");
}
export class CanonicalError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "CanonicalError";
    }
}
function isPlainObject(v) {
    if (v === null || typeof v !== "object")
        return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** The server's payload gate, run before the preview. Every refusal here is a refusal
 *  the server would also make, with the same code, so a caller sees one answer rather
 *  than a local guess followed by a remote correction. */
export function checkPayload(value, path = "payload", depth = 0) {
    if (depth > MAX_PAYLOAD_DEPTH) {
        throw new CanonicalError("payload_too_deep", `${path} nests deeper than ${MAX_PAYLOAD_DEPTH}`);
    }
    // null and undefined share ONE code, which is what the server's own walk does. They are
    // the same problem from the caller's side, and a client that split them would report a
    // code the server never sends.
    if (value === null || value === undefined) {
        throw new CanonicalError("null_in_payload", `${path} is null or undefined, and a signed payload carries neither`);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new CanonicalError("non_finite_number", `${path} is ${String(value)}, which has no JSON form`);
        }
        return;
    }
    if (typeof value === "boolean")
        return;
    if (typeof value === "string") {
        checkString(value, path);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v, i) => checkPayload(v, `${path}[${i}]`, depth + 1));
        return;
    }
    // A PLAIN object only, which is the server's own test. A Date, a Map or a class instance
    // is `typeof "object"` and has no own enumerable entries, so a plain typeof check would
    // walk nothing and accept it. The server refuses each one as unsupported_value, because a
    // Date serializes to a string and a Map to {}, so neither survives as the value the
    // principal approved.
    if (isPlainObject(value)) {
        for (const [k, v] of Object.entries(value)) {
            checkString(k, `${path} key "${k}"`, "key");
            checkPayload(v, `${path}.${k}`, depth + 1);
        }
        return;
    }
    throw new CanonicalError("unsupported_value", `${path} is a ${Object.prototype.toString.call(value)}, which has no canonical JSON form`);
}
function checkString(text, path, kind = "value") {
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code < 0x20 || code === 0x7f) {
            throw new CanonicalError("control_character", `${path} contains a control character, which a signed ${kind} may not carry`);
        }
    }
    if (LONE_SURROGATE.test(text)) {
        throw new CanonicalError("malformed_unicode", `${path} contains an unpaired surrogate`);
    }
    if (kind === "value" && text !== text.trim()) {
        throw new CanonicalError("edge_whitespace", `${path} has leading or trailing whitespace. Trim it before the principal approves it, because the server refuses rather than repairs.`);
    }
}
// ── Nonces, salts, times, ids ─────────────────────────────────────────────
/** 16 CSPRNG bytes as unpadded base64url. Never randomUUID: the server refuses a UUID
 *  by shape, because a UUID carries a version nibble and less entropy. */
export function newWriteNonce() {
    return randomBytes(16).toString("base64url");
}
/** 32 CSPRNG bytes as unpadded base64url, for a private value commitment. */
export function newSalt() {
    return randomBytes(32).toString("base64url");
}
/** 16 CSPRNG bytes as 32 lowercase hex, which is the shape the server requires for a
 *  create's request_id. It is the second idempotency key: a client whose request timed
 *  out mints a fresh nonce, so write_ref differs and the nonce store sees a new write,
 *  and request_id is what stops that producing a second introduction. */
export function newRequestId() {
    return randomBytes(16).toString("hex");
}
/** ISO 8601 with milliseconds and a trailing Z, which is the one shape the server
 *  accepts, round tripped so two implementations cannot disagree about the instant. */
export function isoNow(at = new Date()) {
    return new Date(at.getTime()).toISOString();
}
/** The signed resource id for a card pair: the two ids sorted by code unit, then JCS,
 *  then SHA-256. Hashed rather than joined so there is no separator question. */
export function cardPairResourceId(cardA, cardB) {
    return sha256Hex(jcs([cardA, cardB].sort()));
}
/** The commitment behind a private value. Binds the operation and the resource as well
 *  as the value, so a commitment lifted from one act cannot be replayed into another. */
export function privateValueCommitment(operation, resource, salt, value) {
    return sha256Hex(jcs({ domain: PRIVATE_VALUE_DOMAIN, operation, resource, salt, value }));
}
export function buildEnvelope(args) {
    checkPayload(args.payload);
    const resource = { type: OPERATION_RESOURCE_TYPE[args.operation], id: args.resourceId };
    const payloadDigest = sha256Hex(jcs({
        domain: PAYLOAD_DOMAIN, operation: args.operation, resource, payload: args.payload,
    }));
    const envelope = {
        domain: WRITE_DOMAIN,
        operation: args.operation,
        actor_key: args.actorKey,
        resource,
        issued_at: args.issuedAt ?? isoNow(),
        nonce: args.nonce ?? newWriteNonce(),
        payload_digest: payloadDigest,
    };
    const envelopeBytes = jcs(envelope);
    return { envelope, envelopeBytes, writeRef: sha256Hex(envelopeBytes), payloadDigest };
}
/** Build and sign one write. The opening travels beside the signed payload, never
 *  inside it, so the value is never covered by a signature anyone else can read. */
export function signedWrite(args) {
    const wantsOpening = PRIVATE_VALUE_OPERATIONS.includes(args.operation);
    if (wantsOpening && args.opening === undefined) {
        throw new CanonicalError("missing_opening", `${args.operation} carries a private value, so it needs an opening`);
    }
    if (!wantsOpening && args.opening !== undefined) {
        throw new CanonicalError("unexpected_opening", `${args.operation} carries no private value, so it takes no opening`);
    }
    if (args.opening !== undefined)
        checkPayload({ value: args.opening.value, salt: args.opening.salt }, "opening");
    const built = buildEnvelope(args);
    const body = {
        envelope: built.envelope,
        signature: sign(built.envelopeBytes, args.privateKey),
        payload: args.payload,
    };
    if (args.opening !== undefined)
        body.opening = args.opening;
    return { body, built };
}
// ── What the server can answer, and what it means for the user ────────────
/** The approved user text for the 426. It is the server's own string, repeated here so
 *  the client shows the same sentence whether it read the body or fell back. */
export const UPGRADE_REQUIRED_TEXT = "Update Mingle to continue this connection.";
/** Read the capability field from the root index.
 *
 *  A client has to be able to tell "this server does not know about canonical writes"
 *  from "this server has not answered yet", and an absent field cannot make that
 *  distinction, which is why the server always sends it. An absent field here therefore
 *  means a server older than 2B.
 */
export function readCapability(rootIndex) {
    const field = rootIndex?.write_authorization;
    if (field === undefined || field === null || typeof field !== "object") {
        return { domain: null, preferred: false, legacy_accepted: true, legacy_cutoff_at: null };
    }
    return {
        domain: typeof field.domain === "string" ? field.domain : null,
        preferred: field.preferred === true,
        legacy_accepted: field.legacy_accepted !== false,
        legacy_cutoff_at: typeof field.legacy_cutoff_at === "string" ? field.legacy_cutoff_at : null,
    };
}
/** Turn one response into an outcome. Separate from the transport so a test can drive
 *  every shape the server can answer without a socket. */
export function interpretWrite(status, body) {
    const code = typeof body?.code === "string" ? body.code : null;
    const error = typeof body?.error === "string" ? body.error : null;
    const upgrade = status === 426 || code === "client_upgrade_required";
    return {
        ok: status >= 200 && status < 300,
        status,
        code,
        error: upgrade ? (error ?? UPGRADE_REQUIRED_TEXT) : error,
        write_ref: typeof body?.write_ref === "string" ? body.write_ref : null,
        idempotent: body?.idempotent === true,
        body,
        upgrade_required: upgrade,
    };
}

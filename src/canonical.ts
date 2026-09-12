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

export type ResourceType = "intro" | "intro_request" | "card_pair" | "card" | "fit_exchange";
export interface Resource { type: ResourceType; id: string }

/** Every operation this client can name. The thirteen product actions plus the protocol
 *  sub-actions, exactly as the server's ENVELOPE_OPERATIONS lists them. */
export type Operation =
  | "request_intro" | "withdraw_request" | "express_interest" | "decline" | "block_pair"
  | "withdraw_interest" | "share_contact" | "withdraw_contact"
  | "fit_request" | "fit_commit" | "release_exact" | "first_step_propose" | "first_step_approve"
  | "fit_round2" | "fit_answers"
  | "fit_exchange_round2" | "fit_exchange_custom" | "fit_exchange_answers" | "fit_exchange_close"
  | "autonomy_pause";

/** The resource type each operation names. The server fixes this and refuses a mismatch
 *  with resource_type_mismatch, so getting it wrong here is a 400 rather than a subtle
 *  bug, and stating it once means no call site has to remember. */
export const OPERATION_RESOURCE_TYPE: Record<Operation, ResourceType> = {
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
export const PRIVATE_VALUE_OPERATIONS: readonly Operation[] = ["share_contact", "release_exact"];

// ── JCS, and the gate the server applies to a payload ─────────────────────

export function jcs(value: unknown): string {
  const out = canonicalizeJcs(value as any);
  if (typeof out !== "string") {
    throw new CanonicalError("unsupported_value", "this value has no canonical JSON form");
  }
  return out;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export class CanonicalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** The server's own resource id rule, write-envelope.ts:166, copied rather than approximated. */
const RESOURCE_ID_RE = /^[A-Za-z0-9_.:@+-]{1,200}$/;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** The server's payload gate, run before the preview. Every refusal here is a refusal
 *  the server would also make, with the same code, so a caller sees one answer rather
 *  than a local guess followed by a remote correction. */
export function checkPayload(value: unknown, path = "payload", depth = 0): void {
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
  if (typeof value === "boolean") return;
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
  throw new CanonicalError("unsupported_value",
    `${path} is a ${Object.prototype.toString.call(value)}, which has no canonical JSON form`);
}

function checkString(text: string, path: string, kind: "key" | "value" = "value"): void {
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    // C0 AND C1. The C1 range 0x80 to 0x9f was missing, so a note carrying U+0085, or the
    // cp1252 mojibake U+0092 that a pasted curly quote turns into, previewed cleanly, was
    // approved, was signed, and was then refused by the server as control_character. That is
    // the exact failure invariant 2 of this module forbids: the principal must never be shown
    // a preview of bytes that cannot be sent. The server's rule is
    // /[\u0000-\u001f\u007f-\u009f]/ at canonical-write.ts:111 and this now matches it.
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      throw new CanonicalError("control_character",
        `${path} contains a control character, which a signed ${kind} may not carry`);
    }
  }
  if (LONE_SURROGATE.test(text)) {
    throw new CanonicalError("malformed_unicode", `${path} contains an unpaired surrogate`);
  }
  // KEYS TOO, not values only. The server applies all three string rules to keys
  // unconditionally, so a key with edge whitespace previewed here and was refused there.
  if (text !== text.trim()) {
    throw new CanonicalError("edge_whitespace",
      `${path} has leading or trailing whitespace. Trim it before the principal approves it, because the server refuses rather than repairs.`);
  }
}

// ── Nonces, salts, times, ids ─────────────────────────────────────────────

/** 16 CSPRNG bytes as unpadded base64url. Never randomUUID: the server refuses a UUID
 *  by shape, because a UUID carries a version nibble and less entropy. */
export function newWriteNonce(): string {
  return randomBytes(16).toString("base64url");
}

/** 32 CSPRNG bytes as unpadded base64url, for a private value commitment. */
export function newSalt(): string {
  return randomBytes(32).toString("base64url");
}

/** 16 CSPRNG bytes as 32 lowercase hex, which is the shape the server requires for a
 *  create's request_id. It is the second idempotency key: a client whose request timed
 *  out mints a fresh nonce, so write_ref differs and the nonce store sees a new write,
 *  and request_id is what stops that producing a second introduction. */
export function newRequestId(): string {
  return randomBytes(16).toString("hex");
}

/** ISO 8601 with milliseconds and a trailing Z, which is the one shape the server
 *  accepts, round tripped so two implementations cannot disagree about the instant. */
export function isoNow(at: Date = new Date()): string {
  return new Date(at.getTime()).toISOString();
}

/** The signed resource id for a card pair: the two ids sorted by code unit, then JCS,
 *  then SHA-256. Hashed rather than joined so there is no separator question. */
export function cardPairResourceId(cardA: string, cardB: string): string {
  return sha256Hex(jcs([cardA, cardB].sort()));
}

/** The commitment behind a private value. Binds the operation and the resource as well
 *  as the value, so a commitment lifted from one act cannot be replayed into another. */
export function privateValueCommitment(operation: Operation, resource: Resource, salt: string, value: unknown): string {
  return sha256Hex(jcs({ domain: PRIVATE_VALUE_DOMAIN, operation, resource, salt, value }));
}

// ── Building and signing ──────────────────────────────────────────────────

export interface WriteEnvelope {
  domain: typeof WRITE_DOMAIN;
  operation: Operation;
  actor_key: string;
  resource: Resource;
  issued_at: string;
  nonce: string;
  payload_digest: string;
}

export interface BuiltWrite {
  envelope: WriteEnvelope;
  envelopeBytes: string;
  writeRef: string;
  payloadDigest: string;
}

export function buildEnvelope(args: {
  operation: Operation;
  actorKey: string;
  resourceId: string;
  payload: Record<string, unknown>;
  issuedAt?: string;
  nonce?: string;
}): BuiltWrite {
  checkPayload(args.payload);
  // The resource id, by the server's own rule at write-envelope.ts:166. Checked here rather
  // than left to the server, for the same reason as every other local gate: an id the server
  // will refuse must not reach a preview the principal approves.
  if (!RESOURCE_ID_RE.test(args.resourceId)) {
    throw new CanonicalError("malformed_resource_id",
      `resource.id must be 1 to 200 characters from A-Z a-z 0-9 _ . : @ + and -, and "${args.resourceId}" is not`);
  }
  const resource: Resource = { type: OPERATION_RESOURCE_TYPE[args.operation], id: args.resourceId };
  const payloadDigest = sha256Hex(jcs({
    domain: PAYLOAD_DOMAIN, operation: args.operation, resource, payload: args.payload,
  }));
  const envelope: WriteEnvelope = {
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

export interface WireBody {
  envelope: WriteEnvelope;
  signature: string;
  payload: Record<string, unknown>;
  opening?: { value: unknown; salt: string };
}

/** Build and sign one write. The opening travels beside the signed payload, never
 *  inside it, so the value is never covered by a signature anyone else can read. */
export function signedWrite(args: {
  operation: Operation;
  actorKey: string;
  privateKey: string;
  resourceId: string;
  payload: Record<string, unknown>;
  opening?: { value: unknown; salt: string };
  issuedAt?: string;
  nonce?: string;
}): { body: WireBody; built: BuiltWrite } {
  const wantsOpening = PRIVATE_VALUE_OPERATIONS.includes(args.operation);
  if (wantsOpening && args.opening === undefined) {
    throw new CanonicalError("missing_opening", `${args.operation} carries a private value, so it needs an opening`);
  }
  if (!wantsOpening && args.opening !== undefined) {
    throw new CanonicalError("unexpected_opening", `${args.operation} carries no private value, so it takes no opening`);
  }
  if (args.opening !== undefined) checkPayload({ value: args.opening.value, salt: args.opening.salt }, "opening");
  const built = buildEnvelope(args);
  const body: WireBody = {
    envelope: built.envelope,
    signature: sign(built.envelopeBytes, args.privateKey),
    payload: args.payload,
  };
  if (args.opening !== undefined) body.opening = args.opening;
  return { body, built };
}

// ── What the server can answer, and what it means for the user ────────────

/** The approved user text for the 426. It is the server's own string, repeated here because
 *  it is what the principal is shown for any 426 whose body did not identify itself as
 *  Mingle's own refusal, and the fallback when Mingle's refusal carried no text. */
export const UPGRADE_REQUIRED_TEXT = "Update Mingle to continue this connection.";

export interface WriteCapability {
  /** The envelope domain the server speaks, or null when the field is absent, which
   *  means a server old enough not to know about canonical writes at all. */
  domain: string | null;
  preferred: boolean;
  /** Whether a published 3.2.x body is still accepted. False after the cutoff. */
  legacy_accepted: boolean;
  /** The absolute instant the legacy window closes, or null while it is open. */
  legacy_cutoff_at: string | null;
}

/** Read the capability field from the root index.
 *
 *  A client has to be able to tell "this server does not know about canonical writes"
 *  from "this server has not answered yet", and an absent field cannot make that
 *  distinction, which is why the server always sends it. An absent field here therefore
 *  means a server older than 2B.
 */
export function readCapability(rootIndex: unknown): WriteCapability {
  const field = (rootIndex as { write_authorization?: Record<string, unknown> } | null)?.write_authorization;
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

export interface WriteOutcome {
  ok: boolean;
  status: number;
  /** The server's machine code, for a caller that branches. */
  code: string | null;
  /** The server's user facing sentence. */
  error: string | null;
  /** Present on success: this exact signed act's identifier. */
  write_ref: string | null;
  /** True when the server answered from a stored result rather than acting again. */
  idempotent: boolean;
  body: any;
  /** True for the one refusal a client must handle rather than report: the caller is
   *  too old, or has already used canonical authorization and sent a legacy body. */
  upgrade_required: boolean;
}

/** Turn one response into an outcome. Separate from the transport so a test can drive
 *  every shape the server can answer without a socket. */
export function interpretWrite(status: number, body: any): WriteOutcome {
  const code = typeof body?.code === "string" ? body.code : null;
  const error = typeof body?.error === "string" ? body.error : null;
  const upgrade = status === 426 || code === "client_upgrade_required";
  // ON AN UPGRADE THE APPROVED SENTENCE WINS, and the body's text is used only when the body
  // identified itself as Mingle's own refusal by carrying the code.
  //
  // A 426 is a status anything on the path can return: a WAF, a captive portal, a proxy doing
  // upgrade signalling. Preferring `body.error` on any 426 meant such a body could put
  // arbitrary text in front of the principal with Mingle's authority behind it, next to this
  // client's own reassurance that nothing was recorded. Demonstrated before the fix with a 426
  // carrying a shell command as its error string.
  const upgradeText = code === "client_upgrade_required" ? (error ?? UPGRADE_REQUIRED_TEXT) : UPGRADE_REQUIRED_TEXT;
  // ok AND upgrade_required ARE MUTUALLY EXCLUSIVE. A 2xx carrying
  // code: "client_upgrade_required" used to set both, and canonicalAct checks upgrade_required
  // first, so a write that DID land would have been reported as "nothing was recorded". A
  // success is a success: the code on a 2xx body is not a refusal.
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    code,
    error: ok ? null : (upgrade ? upgradeText : error),
    write_ref: typeof body?.write_ref === "string" ? body.write_ref : null,
    idempotent: body?.idempotent === true,
    body,
    upgrade_required: ok ? false : upgrade,
  };
}

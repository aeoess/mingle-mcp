export declare const WRITE_DOMAIN = "mingle-write-v1";
export declare const PAYLOAD_DOMAIN = "mingle-payload-v1";
export declare const PRIVATE_VALUE_DOMAIN = "mingle-private-value-v1";
export declare const MAX_PAYLOAD_DEPTH = 12;
export type ResourceType = "intro" | "intro_request" | "card_pair" | "card" | "fit_exchange";
export interface Resource {
    type: ResourceType;
    id: string;
}
/** Every operation this client can name. The thirteen product actions plus the protocol
 *  sub-actions, exactly as the server's ENVELOPE_OPERATIONS lists them. */
export type Operation = "request_intro" | "withdraw_request" | "express_interest" | "decline" | "block_pair" | "withdraw_interest" | "share_contact" | "withdraw_contact" | "fit_request" | "fit_commit" | "release_exact" | "first_step_propose" | "first_step_approve" | "fit_round2" | "fit_answers" | "fit_exchange_round2" | "fit_exchange_custom" | "fit_exchange_answers" | "fit_exchange_close" | "autonomy_pause";
/** The resource type each operation names. The server fixes this and refuses a mismatch
 *  with resource_type_mismatch, so getting it wrong here is a 400 rather than a subtle
 *  bug, and stating it once means no call site has to remember. */
export declare const OPERATION_RESOURCE_TYPE: Record<Operation, ResourceType>;
/** The two operations that carry a value the server must never hold in a shared
 *  receipt, so the two that send an opening beside the signed payload. */
export declare const PRIVATE_VALUE_OPERATIONS: readonly Operation[];
export declare function jcs(value: unknown): string;
export declare function sha256Hex(text: string): string;
export declare class CanonicalError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** The server's payload gate, run before the preview. Every refusal here is a refusal
 *  the server would also make, with the same code, so a caller sees one answer rather
 *  than a local guess followed by a remote correction. */
export declare function checkPayload(value: unknown, path?: string, depth?: number): void;
/** 16 CSPRNG bytes as unpadded base64url. Never randomUUID: the server refuses a UUID
 *  by shape, because a UUID carries a version nibble and less entropy. */
export declare function newWriteNonce(): string;
/** 32 CSPRNG bytes as unpadded base64url, for a private value commitment. */
export declare function newSalt(): string;
/** 16 CSPRNG bytes as 32 lowercase hex, which is the shape the server requires for a
 *  create's request_id. It is the second idempotency key: a client whose request timed
 *  out mints a fresh nonce, so write_ref differs and the nonce store sees a new write,
 *  and request_id is what stops that producing a second introduction. */
export declare function newRequestId(): string;
/** ISO 8601 with milliseconds and a trailing Z, which is the one shape the server
 *  accepts, round tripped so two implementations cannot disagree about the instant. */
export declare function isoNow(at?: Date): string;
/** The signed resource id for a card pair: the two ids sorted by code unit, then JCS,
 *  then SHA-256. Hashed rather than joined so there is no separator question. */
export declare function cardPairResourceId(cardA: string, cardB: string): string;
/** The commitment behind a private value. Binds the operation and the resource as well
 *  as the value, so a commitment lifted from one act cannot be replayed into another. */
export declare function privateValueCommitment(operation: Operation, resource: Resource, salt: string, value: unknown): string;
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
export declare function buildEnvelope(args: {
    operation: Operation;
    actorKey: string;
    resourceId: string;
    payload: Record<string, unknown>;
    issuedAt?: string;
    nonce?: string;
}): BuiltWrite;
export interface WireBody {
    envelope: WriteEnvelope;
    signature: string;
    payload: Record<string, unknown>;
    opening?: {
        value: unknown;
        salt: string;
    };
}
/** Build and sign one write. The opening travels beside the signed payload, never
 *  inside it, so the value is never covered by a signature anyone else can read. */
export declare function signedWrite(args: {
    operation: Operation;
    actorKey: string;
    privateKey: string;
    resourceId: string;
    payload: Record<string, unknown>;
    opening?: {
        value: unknown;
        salt: string;
    };
    issuedAt?: string;
    nonce?: string;
}): {
    body: WireBody;
    built: BuiltWrite;
};
/** The approved user text for the 426. It is the server's own string, repeated here so
 *  the client shows the same sentence whether it read the body or fell back. */
export declare const UPGRADE_REQUIRED_TEXT = "Update Mingle to continue this connection.";
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
export declare function readCapability(rootIndex: unknown): WriteCapability;
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
export declare function interpretWrite(status: number, body: any): WriteOutcome;

// ══════════════════════════════════════════════════════════════
// The client side of mingle-write-v1, against the SHARED corpus
// ══════════════════════════════════════════════════════════════
// test/fixtures/mingle-write-v1-canonical.json is copied unchanged from the API repo,
// where it is generated and never hand edited. Its own note says "2C copies this file
// into mingle-mcp unchanged and asserts the same bytes there", and this is that
// assertion. Two implementations that agree on a corpus agree on the wire.
//
// THE CORPUS ANSWERS TWO DIFFERENT QUESTIONS and the file separates them, so this test
// does too. `accepted` is about the SERIALIZER: these inputs reproduce these exact bytes
// and these digests under RFC 8785. `rejected` is about the PAYLOAD GATE: these inputs
// are refused before anything is signed, with these codes. One accepted case is refused
// by the gate, which is not a contradiction and has its own case below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verify, generateKeyPair } from "agent-passport-system";
import * as c from "../src/canonical.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/mingle-write-v1-canonical.json", import.meta.url), "utf8"),
);

test("CORPUS: every accepted case reproduces its exact bytes and its digest", () => {
  assert.equal(fixtures.serializer, "canonicalize@5.0.0", "the corpus names the serializer this client must use");
  assert.ok(fixtures.accepted.length >= 15, `only ${fixtures.accepted.length} accepted cases, so the corpus is not the real one`);
  for (const f of fixtures.accepted) {
    assert.equal(c.jcs(f.input), f.canonical, f.name);
    assert.equal(c.sha256Hex(c.jcs(f.input)), f.digest, `${f.name} digest`);
  }
});

test("CORPUS: every rejected case is refused by the payload gate with the SAME code the server uses", () => {
  assert.ok(fixtures.rejected.length >= 6, "the rejection corpus must be real too");
  for (const f of fixtures.rejected) {
    let code: string | null = null;
    try { c.checkPayload(f.input) } catch (e: any) { code = e.code }
    assert.equal(code, f.code, f.name);
  }
});

test("CORPUS: the serializer and the gate answer different questions, and one case shows it", () => {
  // "null inside an array is kept" is an ACCEPTED serializer case, because RFC 8785 keeps
  // the null where the agent-passport-system canonicalize would delete a null member. It
  // is still refused by the payload gate, because the server's own walk refuses null
  // anywhere including inside an array. Both are true and neither is a bug.
  const arrayNull = fixtures.accepted.find((f: any) => f.name === "null inside an array is kept");
  assert.ok(arrayNull, "the corpus no longer carries the case this distinction rests on");
  assert.equal(c.jcs(arrayNull.input), arrayNull.canonical, "the serializer keeps it");
  assert.throws(() => c.checkPayload(arrayNull.input), (e: any) => e.code === "null_in_payload",
    "and the gate refuses it, exactly as the server does");
});

test("CORPUS: the cases no JSON file can carry are asserted here, in code", () => {
  // The corpus lists five inputs a generated file cannot hold, and says 2C must assert two
  // of them in its own code because the round trip destroys the interesting input.
  const named = new Map<string, any>(fixtures.not_representable.map((n: any) => [n.name, n]));
  assert.equal(named.size, 5);

  // RFC 8785 requires negative zero to serialize as "0".
  assert.equal(c.jcs({ e: -0 }), '{"e":0}');
  assert.equal(named.get("negative zero").expected, "0");

  // A JS literal of 2^53+1 already IS 2^53, so the rounded value is what serializes.
  assert.equal(c.jcs({ n: 9007199254740993 }), '{"n":9007199254740992}');
  assert.equal(named.get("an integer past 2^53").expected, "9007199254740992");

  // And the three the gate refuses, which a file cannot carry because JSON.stringify
  // rewrites each one into something that tests a different rule.
  const refuses = (input: unknown, code: string) => {
    let got: string | null = null;
    try { c.checkPayload(input) } catch (e: any) { got = e.code }
    assert.equal(got, code);
  };
  refuses({ a: 1, b: undefined }, "null_in_payload");
  refuses({ a: NaN }, "non_finite_number");
  refuses({ a: Infinity }, "non_finite_number");
  refuses({ a: new Date() }, "unsupported_value");
  refuses({ a: new Map() }, "unsupported_value");
});

test("GATE: it refuses exactly what the server refuses, and no more", () => {
  // Control characters, in a value and in a KEY.
  assert.throws(() => c.checkPayload({ a: "line\nbreak" }), (e: any) => e.code === "control_character");
  assert.throws(() => c.checkPayload({ ["bad\u0000key"]: 1 }), (e: any) => e.code === "control_character");
  assert.throws(() => c.checkPayload({ a: "tab\there" }), (e: any) => e.code === "control_character");
  // A lone surrogate, which would throw out of the serializer if it got that far.
  assert.throws(() => c.checkPayload({ a: "\uD800" }), (e: any) => e.code === "malformed_unicode");
  assert.throws(() => c.checkPayload({ "\uDC00": 1 }), (e: any) => e.code === "malformed_unicode");
  // Edge whitespace on a VALUE is refused, because the server refuses rather than trims,
  // so the client has to trim before the principal approves the bytes.
  assert.throws(() => c.checkPayload({ a: " padded " }), (e: any) => e.code === "edge_whitespace");
  assert.throws(() => c.checkPayload({ a: "trailing " }), (e: any) => e.code === "edge_whitespace");
  // A depth bomb.
  let deep: any = 1;
  for (let i = 0; i < 40; i++) deep = { n: deep };
  assert.throws(() => c.checkPayload(deep), (e: any) => e.code === "payload_too_deep");

  // And what it must NOT refuse: ordinary prose with internal whitespace, a non-breaking
  // space inside the text, an empty object, an empty array and a false.
  for (const ok of [
    { a: "two  spaces inside" }, { a: "non breaking inside" },
    { a: {} }, { a: [] }, { a: false }, { a: 0 }, { a: "" },
  ]) {
    c.checkPayload(ok);
  }
});

test("ENVELOPE: the built envelope is the corpus envelope, and the signature verifies over its bytes", () => {
  // The corpus carries a real mingle-write-v1 envelope as an accepted serializer case, so
  // the client's own construction is checked against the same bytes the server produced.
  const fromCorpus = fixtures.accepted.find((f: any) => f.name === "mingle-write-v1 envelope");
  assert.ok(fromCorpus, "the corpus no longer carries an envelope case");
  assert.equal(c.jcs(fromCorpus.input), fromCorpus.canonical);
  assert.equal(c.sha256Hex(c.jcs(fromCorpus.input)), fromCorpus.digest, "which is the write_ref of that envelope");
  // Field for field, the shape this client builds.
  assert.deepEqual(Object.keys(fromCorpus.input).sort(),
    ["actor_key", "domain", "issued_at", "nonce", "operation", "payload_digest", "resource"]);

  const real = generateKeyPair();
  const { body, built } = c.signedWrite({
    operation: "express_interest",
    actorKey: real.publicKey,
    privateKey: real.privateKey,
    resourceId: "intro-v3-1700000000000-abcd",
    payload: {},
  });
  assert.equal(body.envelope.domain, "mingle-write-v1");
  assert.equal(body.envelope.resource.type, "intro", "express_interest names an intro");
  assert.equal(built.writeRef, c.sha256Hex(built.envelopeBytes));
  assert.equal(built.envelopeBytes, c.jcs(body.envelope));
  assert.equal(verify(built.envelopeBytes, body.signature, real.publicKey), true,
    "the signature is over JCS(envelope) and nothing else");
  assert.equal(body.opening, undefined, "express_interest carries no private value");
  // The payload digest is over the payload domain, not over the payload alone.
  assert.equal(body.envelope.payload_digest, c.sha256Hex(c.jcs({
    domain: "mingle-payload-v1", operation: "express_interest",
    resource: { type: "intro", id: "intro-v3-1700000000000-abcd" }, payload: {},
  })));
});

test("ENVELOPE: every operation names exactly one resource type, and the table is total", () => {
  const ops = Object.keys(c.OPERATION_RESOURCE_TYPE);
  assert.equal(ops.length, 20, "thirteen product actions plus seven protocol sub-actions");
  assert.equal(c.OPERATION_RESOURCE_TYPE.request_intro, "intro_request", "a create names the request it is idempotent on");
  assert.equal(c.OPERATION_RESOURCE_TYPE.block_pair, "card_pair", "a block names the pair");
  assert.equal(c.OPERATION_RESOURCE_TYPE.autonomy_pause, "card", "autonomy is card scoped");
  assert.equal(c.OPERATION_RESOURCE_TYPE.fit_exchange_close, "fit_exchange");
  for (const op of ["withdraw_request", "express_interest", "decline", "withdraw_interest",
    "share_contact", "withdraw_contact", "fit_request", "fit_commit", "release_exact",
    "first_step_propose", "first_step_approve", "fit_round2", "fit_answers"] as const) {
    assert.equal(c.OPERATION_RESOURCE_TYPE[op], "intro", `${op} names the intro`);
  }
});

test("ENVELOPE: the opening travels beside the signed payload, and only for the two operations that carry a value", () => {
  const real = generateKeyPair();
  const salt = c.newSalt();
  const resource = { type: "intro" as const, id: "intro-v3-1700000000000-abcd" };
  const commitment = c.privateValueCommitment("share_contact", resource, salt, "me@example.com");
  const { body } = c.signedWrite({
    operation: "share_contact", actorKey: real.publicKey, privateKey: real.privateKey,
    resourceId: resource.id, payload: { private_value_commitment: commitment },
    opening: { value: "me@example.com", salt },
  });
  assert.deepEqual(Object.keys(body.payload), ["private_value_commitment"],
    "the value is NOT in the signed payload, only its commitment");
  assert.deepEqual(body.opening, { value: "me@example.com", salt });
  // Recomputing the commitment from the opening is what the server does before any write.
  assert.equal(c.privateValueCommitment("share_contact", resource, salt, "me@example.com"), commitment);
  // It binds the operation and the resource, so a commitment cannot be lifted between acts.
  assert.notEqual(c.privateValueCommitment("release_exact", resource, salt, "me@example.com"), commitment);
  assert.notEqual(c.privateValueCommitment("share_contact", { type: "intro", id: "intro-other" }, salt, "me@example.com"), commitment);
  assert.notEqual(c.privateValueCommitment("share_contact", resource, c.newSalt(), "me@example.com"), commitment);

  // An operation with no private value refuses an opening, and one with a value requires it.
  assert.throws(() => c.signedWrite({
    operation: "express_interest", actorKey: real.publicKey, privateKey: real.privateKey,
    resourceId: resource.id, payload: {}, opening: { value: "x", salt },
  }), (e: any) => e.code === "unexpected_opening");
  assert.throws(() => c.signedWrite({
    operation: "share_contact", actorKey: real.publicKey, privateKey: real.privateKey,
    resourceId: resource.id, payload: { private_value_commitment: commitment },
  }), (e: any) => e.code === "missing_opening");
});

test("SHAPES: nonces, salts, request ids and timestamps are the shapes the server accepts", () => {
  const nonces = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const n = c.newWriteNonce();
    assert.match(n, /^[A-Za-z0-9_-]{22}$/, "16 bytes as unpadded base64url");
    assert.equal(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(n), false, "never a UUID, which the server refuses by shape");
    nonces.add(n);
  }
  assert.equal(nonces.size, 400, "400 nonces, none repeated");
  assert.match(c.newSalt(), /^[A-Za-z0-9_-]{43}$/, "32 bytes as unpadded base64url");
  assert.match(c.newRequestId(), /^[0-9a-f]{32}$/, "16 bytes as 32 lowercase hex");
  // The one timestamp shape, round tripped, so no calendar invalid instant can be signed.
  const iso = c.isoNow(new Date(Date.UTC(2026, 8, 12, 1, 2, 3, 45)));
  assert.equal(iso, "2026-09-12T01:02:03.045Z");
  assert.equal(new Date(Date.parse(iso)).toISOString(), iso);
});

test("PAIR ID: a card pair id is order independent and hashed rather than joined", () => {
  const a = c.cardPairResourceId("card-aaa", "card-bbb");
  assert.equal(a, c.cardPairResourceId("card-bbb", "card-aaa"), "sorted before hashing, so either order gives one id");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, c.cardPairResourceId("card-aaa", "card-ccc"));
  // Hashed rather than joined, so there is no separator question and no pair of ids can
  // collide by containing the separator.
  assert.equal(a, c.sha256Hex(c.jcs(["card-aaa", "card-bbb"])));
});

test("RESPONSES: every shape the server can answer is interpreted, including the 426", () => {
  const created = c.interpretWrite(201, { intro_id: "i1", state: "interested", write_ref: "w1", idempotent: false });
  assert.equal(created.ok, true);
  assert.equal(created.write_ref, "w1");
  assert.equal(created.idempotent, false);
  assert.equal(created.upgrade_required, false);

  const replayed = c.interpretWrite(200, { intro_id: "i1", write_ref: "w1", idempotent: true });
  assert.equal(replayed.ok, true);
  assert.equal(replayed.idempotent, true, "a replay is not a second act");

  const refused = c.interpretWrite(409, { code: "wrong_state", error: "decline does not apply to an introduction that is interested" });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "wrong_state");
  assert.equal(refused.upgrade_required, false);

  // THE ONE REFUSAL A CLIENT MUST HANDLE RATHER THAN REPORT. Both the status and the code
  // are recognised, because a proxy can rewrite one and not the other.
  const byStatus = c.interpretWrite(426, { code: "client_upgrade_required", error: c.UPGRADE_REQUIRED_TEXT });
  assert.equal(byStatus.upgrade_required, true);
  assert.equal(byStatus.error, "Update Mingle to continue this connection.");
  const byCode = c.interpretWrite(400, { code: "client_upgrade_required" });
  assert.equal(byCode.upgrade_required, true);
  assert.equal(byCode.error, c.UPGRADE_REQUIRED_TEXT, "and the approved sentence is shown even when the body carried none");
  // The approved text is exactly the server's, character for character.
  assert.equal(c.UPGRADE_REQUIRED_TEXT, "Update Mingle to continue this connection.");
});

test("CAPABILITY: the root index field is read, and an ABSENT field means an older server", () => {
  const modern = c.readCapability({
    write_authorization: { domain: "mingle-write-v1", preferred: true, legacy_accepted: true, legacy_cutoff_at: null },
  });
  assert.equal(modern.domain, "mingle-write-v1");
  assert.equal(modern.preferred, true);
  assert.equal(modern.legacy_accepted, true);
  assert.equal(modern.legacy_cutoff_at, null, "null means the window is open, never that it has closed");

  const afterCutoff = c.readCapability({
    write_authorization: { domain: "mingle-write-v1", preferred: true, legacy_accepted: false, legacy_cutoff_at: "2026-10-12T00:00:00.000Z" },
  });
  assert.equal(afterCutoff.legacy_accepted, false);
  assert.equal(afterCutoff.legacy_cutoff_at, "2026-10-12T00:00:00.000Z");

  // A server old enough not to carry the field at all. domain null is what distinguishes
  // "does not know about canonical writes" from "has not answered yet", which an absent
  // field alone could not.
  for (const old of [{}, { write_authorization: null }, null, undefined, { write_authorization: "nonsense" }]) {
    const cap = c.readCapability(old);
    assert.equal(cap.domain, null);
    assert.equal(cap.preferred, false);
    assert.equal(cap.legacy_accepted, true, "an old server still takes the old bodies");
  }
});

// readOwnCard: renew reads the full card through owner-read, and falls back to the
// public fetch only when the server has no owner-read route at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, sign, verify } from "agent-passport-system";
import { readOwnCard } from "../src/owner-read.js";

const keys = generateKeyPair();
const fixed = () => new Date("2026-11-01T06:00:00.000Z");
const OWNER = { card_id: "v3-connection-1", projection: "owner_full", card: { headline: "full", subject_key: keys.publicKey } };

function stubs(ownerRead: () => Promise<{ status: number; body: any }>) {
  const calls: Array<{ path: string; body: any }> = [];
  const apiRaw = async (path: string, opts?: RequestInit) => {
    calls.push({ path, body: opts?.body ? JSON.parse(String(opts.body)) : null });
    return ownerRead();
  };
  const api = async (path: string) => {
    calls.push({ path, body: null });
    return { card_id: "v3-connection-1", projection: "network_visible", card: { headline: "public", subject_key: keys.publicKey } };
  };
  return { calls, apiRaw, api };
}

test("uses owner-read, signed over owner-read:<cardId>:<issued_at> for that card", async () => {
  const s = stubs(async () => ({ status: 200, body: OWNER }));
  const r = await readOwnCard(s.apiRaw, s.api, sign, keys, "v3-connection-1", fixed);
  assert.equal(r.projection, "owner_full");
  assert.equal(s.calls.length, 1, "no public fetch when owner-read answers");
  assert.equal(s.calls[0].path, "/api/v3/cards/v3-connection-1/owner-read");
  assert.equal(s.calls[0].body.issued_at, "2026-11-01T06:00:00.000Z");
  assert.ok(verify("owner-read:v3-connection-1:2026-11-01T06:00:00.000Z", s.calls[0].body.signature, keys.publicKey));
  assert.equal(verify("owner-read:v3-connection-2:2026-11-01T06:00:00.000Z", s.calls[0].body.signature, keys.publicKey), false, "the signature does not cover another card");
});

test("falls back to the public fetch only for a server without the route (404, no JSON body)", async () => {
  const s = stubs(async () => ({ status: 404, body: null }));
  const r = await readOwnCard(s.apiRaw, s.api, sign, keys, "v3-connection-1", fixed);
  assert.equal(r.card.headline, "public");
  assert.deepEqual(s.calls.map(c => c.path), ["/api/v3/cards/v3-connection-1/owner-read", "/api/v3/cards/v3-connection-1"]);
});

for (const [name, answer] of [
  ["401", { status: 401, body: { error: "issued_at must be an ISO time within 5 minutes of server time" } }],
  ["403", { status: 403, body: { error: "not the card subject" } }],
  ["404 card not found", { status: 404, body: { error: "card not found" } }],
  ["500", { status: 500, body: null }],
  ["200 without a full owner card", { status: 200, body: { card_id: "v3-connection-1", projection: "network_visible", card: { headline: "public" } } }],
] as const) {
  test(`never falls back after ${name}`, async () => {
    const s = stubs(async () => answer as { status: number; body: any });
    const r = await readOwnCard(s.apiRaw, s.api, sign, keys, "v3-connection-1", fixed);
    assert.ok(r.error, JSON.stringify(r));
    assert.equal(r.card, undefined);
    assert.equal(s.calls.length, 1, "no public fetch");
  });
}

test("never falls back after a network error or timeout", async () => {
  const s = stubs(async () => { throw new Error("The operation was aborted due to timeout"); });
  const r = await readOwnCard(s.apiRaw, s.api, sign, keys, "v3-connection-1", fixed);
  assert.match(r.error, /owner read failed/);
  assert.equal(s.calls.length, 1);
});

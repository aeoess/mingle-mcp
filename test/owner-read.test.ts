// readOwnCard: renew and assess read the full card through owner-read, and fall back
// to the public fetch when the server has no owner-read route.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, sign, verify } from "agent-passport-system";
import { readOwnCard } from "../src/owner-read.js";

const keys = generateKeyPair();
const fixed = () => new Date("2026-11-01T06:00:00.000Z");

test("uses owner-read with a signature over owner-read:<cardId>:<issued_at>", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const api = async (path: string, opts?: RequestInit) => {
    calls.push({ path, body: opts?.body ? JSON.parse(String(opts.body)) : null });
    return { card_id: "v3-connection-1", projection: "owner_full", card: { headline: "full", subject_key: keys.publicKey } };
  };
  const r = await readOwnCard(api, sign, keys, "v3-connection-1", fixed);
  assert.equal(r.projection, "owner_full");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/v3/cards/v3-connection-1/owner-read");
  assert.equal(calls[0].body.public_key, keys.publicKey);
  assert.equal(calls[0].body.issued_at, "2026-11-01T06:00:00.000Z");
  assert.ok(verify("owner-read:v3-connection-1:2026-11-01T06:00:00.000Z", calls[0].body.signature, keys.publicKey));
});

test("falls back to the public fetch when owner-read is not on the server", async () => {
  const paths: string[] = [];
  const api = async (path: string) => {
    paths.push(path);
    if (path.endsWith("/owner-read")) throw new SyntaxError("Unexpected token '<'");
    return { card_id: "v3-connection-2", card: { headline: "public" } };
  };
  const r = await readOwnCard(api, sign, keys, "v3-connection-2", fixed);
  assert.equal(r.card.headline, "public");
  assert.deepEqual(paths, ["/api/v3/cards/v3-connection-2/owner-read", "/api/v3/cards/v3-connection-2"]);
});

test("falls back when owner-read refuses, so the caller's own ownership check decides", async () => {
  const api = async (path: string) =>
    path.endsWith("/owner-read") ? { error: "not the card subject" } : { card_id: "v3-connection-3", card: { subject_key: "someone-else" } };
  const r = await readOwnCard(api, sign, keys, "v3-connection-3", fixed);
  assert.equal(r.card.subject_key, "someone-else");
});

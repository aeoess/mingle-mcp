// ══════════════════════════════════════════════════════════════
// Mingle MCP identity file permissions
// ══════════════════════════════════════════════════════════════
// The private key lives in ~/.mingle/identity.json. It must be readable by
// the owner only (0600) inside an owner-only directory (0700), on a fresh
// create and also when an older version already wrote it wider. Node applies
// a mode only when it creates a path, so the repair on load is what fixes an
// existing install.
//
// HOME points at a temp dir before identity.ts loads, so this suite never
// reads, writes or chmods the real ~/.mingle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, chmodSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const realMingle = join(homedir(), ".mingle");
const fakeHome = mkdtempSync(join(tmpdir(), "mingle-perms-home-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

const { loadIdentity, MINGLE_DIR, IDENTITY_PATH } = await import("../src/identity.js");
const { trackV3Card } = await import("../src/v3.js");

const mode = (p: string): number => statSync(p).mode & 0o777;
const posixOnly = { skip: process.platform === "win32" ? "POSIX permission bits" : false };

test("isolation: MINGLE_DIR is inside the temp HOME, never the real ~/.mingle", () => {
  assert.ok(MINGLE_DIR.startsWith(fakeHome), `${MINGLE_DIR} must live under ${fakeHome}`);
  assert.notEqual(MINGLE_DIR, realMingle);
});

test("a fresh identity is created as 0600 inside a 0700 directory", posixOnly, () => {
  rmSync(MINGLE_DIR, { recursive: true, force: true });
  loadIdentity();
  assert.equal(mode(MINGLE_DIR).toString(8), "700");
  assert.equal(mode(IDENTITY_PATH).toString(8), "600");
});

test("an existing 0644 identity in a 0755 directory is tightened on load, same key", posixOnly, () => {
  const before = loadIdentity();
  chmodSync(IDENTITY_PATH, 0o644);
  chmodSync(MINGLE_DIR, 0o755);
  const after = loadIdentity();
  assert.equal(mode(IDENTITY_PATH).toString(8), "600");
  assert.equal(mode(MINGLE_DIR).toString(8), "700");
  assert.equal(after.publicKey, before.publicKey, "repairing permissions never regenerates the key");
  assert.equal(after.privateKey, before.privateKey);
});

test("a mode already narrower than the target is left alone", posixOnly, () => {
  loadIdentity();
  chmodSync(IDENTITY_PATH, 0o400);
  loadIdentity();
  assert.equal(mode(IDENTITY_PATH).toString(8), "400");
  chmodSync(IDENTITY_PATH, 0o600);
});

test("the card tracker also creates a missing ~/.mingle as 0700", posixOnly, () => {
  rmSync(MINGLE_DIR, { recursive: true, force: true });
  trackV3Card({ card_id: "c1", card_type: "connection", headline: "h", card_hash: "x", published_at: new Date().toISOString() });
  assert.equal(mode(MINGLE_DIR).toString(8), "700");
});

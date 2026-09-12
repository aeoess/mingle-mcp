// ══════════════════════════════════════════════════════════════
// The default tool surface is EXACTLY eight, and this holds it there
// ══════════════════════════════════════════════════════════════
// The decision is eight product tools by default, legacy and protocol tools behind an
// explicit env switch, and no version suffix in any default name. All three are asserted
// here against the real server over stdio, which is how an MCP client sees it, rather than
// against a list in the source.
//
// This is the test that catches the most likely regression: someone adds a ninth tool, or
// a legacy registration escapes the gate, and the surface a host model sees grows without
// anyone deciding that it should.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const homes: string[] = [];

/** Spawn the real server the way a host launches it and ask it what it has. HOME is a
 *  throwaway so the developer's own ~/.mingle is never touched, and the API url points at
 *  a closed port because nothing here makes a call. */
async function toolsWith(env: Record<string, string>): Promise<{ name: string; description: string; inputSchema?: any }[]> {
  const home = mkdtempSync(join(tmpdir(), "mingle-surface-home-"));
  homes.push(home);
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", join(root, "src/index.ts")],
    env: { ...process.env, HOME: home, MINGLE_API_URL: "http://127.0.0.1:1", ...env } as any,
  });
  const client = new Client({ name: "surface-test", version: "1" });
  await client.connect(transport);
  const r = await client.listTools();
  await client.close();
  return r.tools.map(t => ({ name: t.name, description: t.description ?? "", inputSchema: (t as any).inputSchema }));
}

process.on("exit", () => { for (const h of homes) rmSync(h, { recursive: true, force: true }) });

/** The decided eight, in the decided order. Written out as literals, which is the point:
 *  a change to the product surface is a change to this list and shows as one. */
const EIGHT = [
  "publish_intent",
  "find_people",
  "mingle_inbox",
  "request_intro",
  "respond_intro",
  "continue_connection",
  "manage_intent",
  "mingle_settings",
];

test("DEFAULT SURFACE: exactly eight tools, and exactly these eight", async () => {
  const tools = await toolsWith({});
  assert.deepEqual(tools.map(t => t.name), EIGHT,
    "the default surface is the eight product tools, in order, and nothing else");
  assert.equal(tools.length, 8);
});

test("DEFAULT SURFACE: no default name carries a version suffix", async () => {
  const tools = await toolsWith({});
  for (const t of tools) {
    assert.equal(/_v[0-9]+$/.test(t.name), false, `${t.name} carries a version suffix`);
    assert.equal(/_legacy$/.test(t.name), false, `${t.name} is a legacy name`);
    assert.equal(/v[0-9]/.test(t.name), false, `${t.name} names a version`);
  }
});

test("DEFAULT SURFACE: every tool says what it does in product words, with no protocol nouns", async () => {
  // A host model reads these descriptions and nothing else. Cards, receipts, policies,
  // ledgers, handshakes, embeddings and signatures are implementation machinery, and the
  // product definition says they are not product vocabulary. `card` survives, because a
  // person's own card is the one piece of machinery the product surface names.
  const banned = [
    /\breceipt\b/i, /\bledger\b/i, /\bhandshake\b/i, /\bembedding/i, /\benvelope\b/i,
    /\bnonce\b/i, /\bEd25519\b/i, /\bpayload\b/i, /\bcommitment\b/i, /\bJCS\b/,
    /\bpredicate\b/i, /\bpolicy\b/i,
  ];
  const tools = await toolsWith({});
  for (const t of tools) {
    assert.ok(t.description.length > 60, `${t.name} needs a real description`);
    for (const re of banned) {
      assert.equal(re.test(t.description), false, `${t.name} description uses protocol vocabulary: ${re}`);
    }
  }
});

test("SWITCH: the legacy and protocol tools appear only when MINGLE_LEGACY_TOOLS is exactly 1", async () => {
  const off = await toolsWith({});
  assert.equal(off.length, 8);
  // Every other value, and unset, mean off. Same shape as the server's own containment
  // flags, so there is one rule to remember rather than two.
  for (const value of ["true", "yes", "0", "", "01", " 1"]) {
    const tools = await toolsWith({ MINGLE_LEGACY_TOOLS: value });
    assert.equal(tools.length, 8, `MINGLE_LEGACY_TOOLS=${JSON.stringify(value)} must mean off`);
  }
  const on = await toolsWith({ MINGLE_LEGACY_TOOLS: "1" });
  assert.ok(on.length > 40, `only ${on.length} tools with the switch on, so the legacy surface did not register`);
  // The eight are still there and still unsuffixed.
  for (const name of EIGHT) {
    assert.ok(on.some(t => t.name === name), `${name} disappeared when the switch turned on`);
  }
  // And a sample of the legacy surface really is reachable.
  for (const name of ["publish_intent_card", "search_matches", "complete_intro", "set_fit_policy", "propose_first_step"]) {
    assert.ok(on.some(t => t.name === name), `${name} is missing from the legacy surface`);
  }
});

test("SWITCH: the two colliding legacy names are suffixed rather than shadowing the product tools", async () => {
  // The published surface already had `request_intro` (v2) and `respond_intro` (v3), and the
  // product surface now owns both names. With the switch on, both exist: the product tool
  // under the plain name and the legacy one under an explicit suffix.
  const on = await toolsWith({ MINGLE_LEGACY_TOOLS: "1" });
  const names = on.map(t => t.name);
  assert.ok(names.includes("request_intro"));
  assert.ok(names.includes("request_intro_legacy"));
  assert.ok(names.includes("respond_intro"));
  assert.ok(names.includes("respond_intro_legacy"));
  assert.equal(new Set(names).size, names.length, "no name is registered twice");
  // Nothing else was renamed, so the suffix is the exception it is meant to be.
  assert.deepEqual(names.filter(n => n.endsWith("_legacy")).sort(), ["request_intro_legacy", "respond_intro_legacy"]);
});

test("DEFAULT SURFACE: every write tool takes confirm and approved_digest, so nothing is signed unapproved", async () => {
  // The exact-approval echo is not optional on a write. A write tool that did not take
  // approved_digest could sign something the principal never saw.
  const tools = await toolsWith({});
  const writes = ["publish_intent", "request_intro", "respond_intro", "continue_connection", "manage_intent", "mingle_settings"];
  const byName = new Map(tools.map(t => [t.name, t]));
  for (const name of writes) {
    const schema = (byName.get(name) as any).inputSchema ?? {};
    const props = Object.keys(schema.properties ?? {});
    assert.ok(props.includes("confirm"), `${name} takes no confirm`);
    assert.ok(props.includes("approved_digest"), `${name} takes no approved_digest`);
  }
  // And the two read tools do not, because there is nothing to approve.
  for (const name of ["find_people", "mingle_inbox"]) {
    const props = Object.keys(((byName.get(name) as any).inputSchema ?? {}).properties ?? {});
    assert.equal(props.includes("approved_digest"), false, `${name} is a read and needs no approval`);
  }
});

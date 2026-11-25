// ══════════════════════════════════════════════════════════════
// The tools/list input schemas are held to a committed snapshot
// ══════════════════════════════════════════════════════════════
// The JSON schema a client reads in tools/list is the tool contract. It is built by the SDK
// from the zod schemas, so a zod or SDK release can change it without any change in this
// package. This test starts the real server over stdio, as a host does, on the default
// surface and on the legacy surface, and compares every tool's name and inputSchema with
// test/fixtures/tools-list-schemas.json.
//
// When a schema change is intended, regenerate the snapshot and review the diff:
//   MINGLE_UPDATE_TOOLS_SNAPSHOT=1 npx tsx --test test/tools-list-snapshot.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = join(root, "test", "fixtures", "tools-list-schemas.json");

type Listed = { name: string; inputSchema: unknown };

/** tools/list from the real server. HOME is a throwaway and the API url is a closed port,
 *  because listing tools makes no call. */
async function listTools(env: Record<string, string>): Promise<Listed[]> {
  const home = mkdtempSync(join(tmpdir(), "mingle-snapshot-home-"));
  try {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", join(root, "src/index.ts")],
      env: { ...process.env, HOME: home, MINGLE_API_URL: "http://127.0.0.1:1", ...env } as any,
    });
    const client = new Client({ name: "snapshot-test", version: "1" });
    await client.connect(transport);
    const r = await client.listTools();
    await client.close();
    return r.tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("TOOLS/LIST: every input schema on both surfaces matches the committed snapshot", async () => {
  const actual = {
    default: await listTools({}),
    legacy: await listTools({ MINGLE_LEGACY_TOOLS: "1" }),
  };
  if (process.env.MINGLE_UPDATE_TOOLS_SNAPSHOT === "1") {
    writeFileSync(snapshotPath, JSON.stringify(actual, null, 2) + "\n");
  }
  const expected = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert.deepEqual(actual.default.map((t) => t.name), expected.default.map((t: Listed) => t.name), "default tool names and order");
  assert.deepEqual(actual.legacy.map((t) => t.name), expected.legacy.map((t: Listed) => t.name), "legacy tool names and order");
  for (const surface of ["default", "legacy"] as const) {
    for (const [i, tool] of actual[surface].entries()) {
      assert.deepEqual(tool.inputSchema, expected[surface][i].inputSchema, `${surface} surface, ${tool.name}: inputSchema differs from the snapshot`);
    }
  }
});

test("TOOLS/LIST: every object with named properties is closed, except a tool that takes no input", async () => {
  // This holds independently of the snapshot, so a snapshot regenerated after a zod or SDK
  // change cannot quietly drop additionalProperties: false. A tool with no input at all is
  // published as { type: "object", properties: {} }, as it was under zod 3.
  const open: string[] = [];
  const visit = (node: unknown, path: string) => {
    if (Array.isArray(node)) return node.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties && n.additionalProperties !== false) open.push(path);
    for (const [k, v] of Object.entries(n)) visit(v, `${path}/${k}`);
  };
  for (const tool of await listTools({ MINGLE_LEGACY_TOOLS: "1" })) {
    const s = tool.inputSchema as Record<string, unknown>;
    const noInput = Object.keys((s.properties as object) ?? {}).length === 0;
    if (noInput) {
      assert.equal(s.additionalProperties, undefined, `${tool.name} takes no input and stays as published under zod 3`);
      continue;
    }
    visit(s, tool.name);
  }
  assert.deepEqual(open, [], "objects that advertise extra keys as welcome");
});

// ══════════════════════════════════════════════════════════════
// Bounded integers: same inputs refused, one more issue for huge values
// ══════════════════════════════════════════════════════════════
// Every z.number().int() in a tool schema also has .min() and .max(). In zod 4, .int() means
// a safe integer, so a value past Number.MAX_SAFE_INTEGER raises its own issue next to the
// .max() one. Zod 3 raised only the .max() issue. Both versions refuse the same values, so
// the contract is the same. Only the error text a client reads is longer. Validation
// messages are zod 4 English text and are not held to zod 3 wording.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { z as z3 } from "zod/v3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HUGE = 1e20;

test("BOUNDS: zod 4 adds a safe-integer issue for a huge value, zod 3 did not, and both refuse it", () => {
  const four = z.number().int().min(1).max(25).safeParse(HUGE);
  const three = z3.number().int().min(1).max(25).safeParse(HUGE);
  assert.equal(four.success, false);
  assert.equal(three.success, false);
  assert.deepEqual(three.error!.issues.map((i) => [i.code, (i as any).maximum]), [["too_big", 25]]);
  assert.deepEqual(four.error!.issues.map((i) => [i.code, (i as any).origin, (i as any).maximum]), [
    ["too_big", "int", Number.MAX_SAFE_INTEGER],
    ["too_big", "number", 25],
  ]);
  // A value just past the bound gives one issue in both.
  assert.equal(z.number().int().min(1).max(25).safeParse(26).error!.issues.length, 1);
  assert.equal(z3.number().int().min(1).max(25).safeParse(26).error!.issues.length, 1);
  // And both accept the same values inside the bounds.
  for (const v of [1, 25]) {
    assert.equal(z.number().int().min(1).max(25).safeParse(v).success, true);
    assert.equal(z3.number().int().min(1).max(25).safeParse(v).success, true);
  }
});

test("BOUNDS: find_people refuses a huge limit with both issues in the -32602 text", async () => {
  const home = mkdtempSync(join(tmpdir(), "mingle-bounds-home-"));
  try {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", join(root, "src/index.ts")],
      env: { ...process.env, HOME: home, MINGLE_API_URL: "http://127.0.0.1:1" } as any,
    });
    const client = new Client({ name: "bounds-test", version: "1" });
    await client.connect(transport);
    const call = async (limit: number) => {
      const r = (await client.callTool({ name: "find_people", arguments: { limit } })) as any;
      return { isError: !!r.isError, text: String(r.content?.[0]?.text ?? "") };
    };
    const huge = await call(HUGE);
    const past = await call(26);
    await client.close();
    for (const r of [huge, past]) {
      assert.equal(r.isError, true);
      assert.match(r.text, /^MCP error -32602: Input validation error: Invalid arguments for tool find_people:/);
    }
    // The huge value names both the safe-integer bound and the schema's own bound.
    assert.match(huge.text, new RegExp(`${Number.MAX_SAFE_INTEGER} at limit`));
    assert.match(huge.text, /<=25 at limit/);
    // A value just past the bound names only the schema's bound.
    assert.match(past.text, /<=25 at limit/);
    assert.doesNotMatch(past.text, new RegExp(String(Number.MAX_SAFE_INTEGER)));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

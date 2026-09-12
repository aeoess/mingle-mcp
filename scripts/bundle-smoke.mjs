#!/usr/bin/env node
// Mingle bundle smoke proof.
// Launches the MCP server exactly as openclaw-bundle/.mcp.json declares it
// (same command, args, env) and asks it for tools/list over stdio JSON-RPC.
// Exits 0 only when the handshake succeeds and the tool count matches
// skills/mingle/_meta.json "tools".

import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceBundle = join(root, "openclaw-bundle");

// OpenClaw installs a bundle under its own state dir, not inside the source
// repo. Stage a copy outside ~/mingle-mcp so `npx` resolves the published
// package instead of shadowing it with this repo's own node_modules.
const stage = mkdtempSync(join(tmpdir(), "mingle-bundle-smoke-"));
cpSync(sourceBundle, join(stage, "openclaw-bundle"), { recursive: true });
const bundleRoot = join(stage, "openclaw-bundle");
process.on("exit", () => rmSync(stage, { recursive: true, force: true }));
console.log(`staged plugin root: ${bundleRoot}`);
const mcp = JSON.parse(readFileSync(join(bundleRoot, ".mcp.json"), "utf-8"));
const meta = JSON.parse(readFileSync(join(root, "skills", "mingle", "_meta.json"), "utf-8"));
const expected = meta.tools;

const entry = mcp.mcpServers.mingle;
if (!entry) fail(".mcp.json has no mcpServers.mingle entry");

// PLUGIN_ROOT / PLUGIN_DATA are supplied by OpenClaw for Agent Plugins stdio
// servers (docs/plugins/bundles.md). Reproduce them here so the launch matches.
const pluginData = join(stage, "plugin-data");
const expand = (s) =>
  s.replaceAll("${PLUGIN_ROOT}", bundleRoot).replaceAll("${PLUGIN_DATA}", pluginData);

// LOCAL MODE, for the window before a release is published.
//
// .mcp.json pins an exact version, which is the point: the launch is reproducible. But between
// the version bump and the npm publish, that version does not exist, so the npm form cannot
// run and this gate would be red for a reason that is not drift. MINGLE_SMOKE_LOCAL=1 launches
// build/index.js from this checkout, which is the artifact the package will ship, so the
// comparison against _meta.json still means what it says.
const LOCAL = process.env.MINGLE_SMOKE_LOCAL === "1";
const command = LOCAL ? process.execPath : entry.command;
const args = LOCAL ? [join(root, "build", "index.js")] : (entry.args ?? []).map(expand);
const env = { ...process.env, PLUGIN_ROOT: bundleRoot, PLUGIN_DATA: pluginData };
for (const [k, v] of Object.entries(entry.env ?? {})) env[k] = expand(v);
// A throwaway HOME, so a smoke run never touches the developer's own ~/.mingle.
env.HOME = join(stage, "home");
env.USERPROFILE = env.HOME;
mkdirSync(env.HOME, { recursive: true });
if (LOCAL) console.log(`MINGLE_SMOKE_LOCAL=1, so launching this checkout's build rather than ${entry.args?.join(" ")}`);

console.log(`launching: ${command} ${args.join(" ")}`);
console.log(`env from .mcp.json: ${JSON.stringify(entry.env ?? {})}`);

// .mcp.json declares no cwd, so OpenClaw defaults it to the plugin root
// (src/plugins/bundle-mcp.ts:151-157, baseDir = dirname(.mcp.json) at :427).
const cwd = entry.cwd ? expand(entry.cwd) : bundleRoot;
console.log(`cwd: ${cwd} (plugin root; .mcp.json declares no cwd)`);

const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

let stdout = "";
let stderr = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
  let idx;
  while ((idx = stdout.indexOf("\n")) >= 0) {
    const line = stdout.slice(0, idx).trim();
    stdout = stdout.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const resolve = pending.get(msg.id);
    if (resolve) { pending.delete(msg.id); resolve(msg); }
  }
});
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
child.on("error", (err) => fail(`spawn failed: ${err.message}`));

function send(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 60000);
  });
}

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  if (stderr.trim()) console.error(`server stderr:\n${stderr.trim()}`);
  child.kill();
  process.exit(1);
}

try {
  const init = await send(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mingle-bundle-smoke", version: "1.0.0" },
  });
  const info = init.result?.serverInfo ?? {};
  console.log(`initialize ok: serverInfo ${JSON.stringify(info)}`);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const listed = await send(2, "tools/list", {});
  const tools = listed.result?.tools ?? [];
  console.log(`tools/list returned ${tools.length} tools (expected ${expected})`);
  for (const t of tools.map((t) => t.name).sort()) console.log(`  ${t}`);
  if (tools.length !== expected) fail(`tool count ${tools.length} != expected ${expected}`);
  console.log(`SMOKE PASS: ${tools.length} tools`);
  child.kill();
  process.exit(0);
} catch (err) {
  fail(err.message);
}

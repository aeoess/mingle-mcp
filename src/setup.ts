#!/usr/bin/env node
// Configure Mingle MCP for Claude Desktop and Cursor. Those two clients and
// nothing else: no other file on the machine is read or written.
//
// Consent first. This prints the exact path of every file it would change and
// the exact JSON it would add, then waits for y/N. Nothing is written before
// the answer. `--yes` skips the prompt for scripted installs and is the only
// way to run it non-interactively.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";

const MINGLE_CONFIG = {
  command: "npx",
  args: ["mingle-mcp@4.0.1"],
};

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function getConfigPaths(): { name: string; path: string }[] {
  const home = homedir();
  const paths: { name: string; path: string }[] = [];

  if (platform() === "darwin") {
    paths.push({
      name: "Claude Desktop",
      path: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    });
    paths.push({
      name: "Cursor",
      path: join(home, ".cursor", "mcp.json"),
    });
  } else if (platform() === "win32") {
    const appdata = process.env.APPDATA || join(home, "AppData", "Roaming");
    paths.push({
      name: "Claude Desktop",
      path: join(appdata, "Claude", "claude_desktop_config.json"),
    });
    paths.push({
      name: "Cursor",
      path: join(home, ".cursor", "mcp.json"),
    });
  } else {
    paths.push({
      name: "Claude Desktop",
      path: join(home, ".config", "Claude", "claude_desktop_config.json"),
    });
    paths.push({
      name: "Cursor",
      path: join(home, ".cursor", "mcp.json"),
    });
  }
  return paths;
}

interface PlannedChange { name: string; path: string; exists: boolean; action: "create" | "add" | "already" }

/** Work out what would change, touching nothing. */
function plan(): PlannedChange[] {
  const out: PlannedChange[] = [];
  for (const { name, path } of getConfigPaths()) {
    if (!existsSync(path)) { out.push({ name, path, exists: false, action: "create" }); continue; }
    try {
      const config = JSON.parse(readFileSync(path, "utf-8")) as McpConfig;
      out.push({ name, path, exists: true, action: config.mcpServers?.["mingle"] ? "already" : "add" });
    } catch {
      // Unreadable or not JSON: report it and refuse to touch it.
      out.push({ name, path, exists: true, action: "already" });
    }
  }
  return out;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

function apply(change: PlannedChange): boolean {
  try {
    let config: McpConfig = {};
    if (existsSync(change.path)) config = JSON.parse(readFileSync(change.path, "utf-8")) as McpConfig;
    else mkdirSync(dirname(change.path), { recursive: true });
    if (!config.mcpServers) config.mcpServers = {};
    if (config.mcpServers["mingle"]) return false;
    config.mcpServers["mingle"] = MINGLE_CONFIG;
    writeFileSync(change.path, JSON.stringify(config, null, 2) + "\n");
    return true;
  } catch (e) {
    console.log(`  could not write ${change.path}: ${(e as Error).message}`);
    return false;
  }
}

async function setup(): Promise<void> {
  const autoYes = process.argv.includes("--yes") || process.argv.includes("-y");
  console.log("\nMingle MCP setup\n");
  console.log("This configures two MCP clients and touches nothing else:");
  console.log("  Claude Desktop, Cursor\n");

  const changes = plan();
  const todo = changes.filter(c => c.action !== "already");

  console.log("Exactly what would change:\n");
  for (const c of changes) {
    if (c.action === "already") { console.log(`  ${c.name}: already configured, leaving alone`); continue; }
    console.log(`  ${c.name}: ${c.action === "create" ? "CREATE" : "EDIT"} ${c.path}`);
  }
  if (todo.length === 0) {
    console.log("\nNothing to do.");
    return;
  }
  console.log("\nThe exact JSON added under mcpServers:\n");
  console.log(JSON.stringify({ mingle: MINGLE_CONFIG }, null, 2).split("\n").map(l => "    " + l).join("\n"));
  console.log("\nNo other key in those files is read, changed or removed.\n");

  if (!autoYes) {
    if (!process.stdin.isTTY) {
      console.log("Not a terminal, so there is nobody to ask. Re-run with --yes to accept the above,");
      console.log("or copy the JSON into your client config by hand.");
      process.exitCode = 1;
      return;
    }
    const answer = (await ask("Write these changes? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log("\nNothing was written.");
      return;
    }
  }

  let configured = 0;
  for (const c of todo) {
    if (apply(c)) { console.log(`  wrote ${c.path}`); configured++; }
  }

  if (configured === 0) {
    console.log("\nNo supported MCP clients were configured. Add this to your MCP config by hand:\n");
    console.log(JSON.stringify({ mcpServers: { mingle: MINGLE_CONFIG } }, null, 2));
  } else {
    console.log("\nRestart your AI client to activate Mingle.");
    console.log('Then say: "I am looking for a senior Rust engineer"\n');
  }
}

void setup();

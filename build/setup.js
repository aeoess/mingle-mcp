#!/usr/bin/env node
// Auto-configure Mingle MCP for Claude Desktop, Cursor, Windsurf
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
const MINGLE_CONFIG = {
    command: "npx",
    args: ["mingle-mcp"],
};
function getConfigPaths() {
    const home = homedir();
    const paths = [];
    if (platform() === "darwin") {
        paths.push({
            name: "Claude Desktop",
            path: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
        });
        paths.push({
            name: "Cursor",
            path: join(home, ".cursor", "mcp.json"),
        });
    }
    else if (platform() === "win32") {
        const appdata = process.env.APPDATA || join(home, "AppData", "Roaming");
        paths.push({
            name: "Claude Desktop",
            path: join(appdata, "Claude", "claude_desktop_config.json"),
        });
        paths.push({
            name: "Cursor",
            path: join(home, ".cursor", "mcp.json"),
        });
    }
    else {
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
function setup() {
    console.log("\n🤝 Mingle MCP Setup\n");
    const configs = getConfigPaths();
    let configured = 0;
    for (const { name, path } of configs) {
        try {
            let config = {};
            if (existsSync(path)) {
                const raw = readFileSync(path, "utf-8");
                config = JSON.parse(raw);
            }
            else {
                // Create directory if needed
                const dir = path.substring(0, path.lastIndexOf("/"));
                mkdirSync(dir, { recursive: true });
            }
            if (!config.mcpServers)
                config.mcpServers = {};
            if (config.mcpServers["mingle"]) {
                console.log(`  ✓ ${name} — already configured`);
                configured++;
                continue;
            }
            config.mcpServers["mingle"] = MINGLE_CONFIG;
            writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
            console.log(`  ✓ ${name} — configured at ${path}`);
            configured++;
        }
        catch {
            // Config dir doesn't exist = app not installed, skip
        }
    }
    if (configured === 0) {
        console.log("  No supported MCP clients found.");
        console.log("  Manual setup: add this to your MCP config:\n");
        console.log(JSON.stringify({ mcpServers: { mingle: MINGLE_CONFIG } }, null, 2));
    }
    else {
        console.log("\n  Restart your AI client to activate Mingle.");
        console.log('  Then say: "I\'m looking for a senior Rust engineer"\n');
    }
}
setup();

#!/usr/bin/env node
// Thin wrapper — checks argv BEFORE loading any MCP modules
// Dynamic import() avoids ESM static import hoisting

if (process.argv[2] === "setup") {
  await import("./setup.js");
  process.exit(0);
} else {
  await import("./index.js");
}

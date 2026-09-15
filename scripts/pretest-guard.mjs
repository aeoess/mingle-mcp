// Refuses to let `npm test` report a green run that proved nothing.
//
// Two ways that can happen. The test directory can be empty, which the original
// inline guard already caught. Or the end to end lane can silently skip, which
// is worse, because the suite still prints a full pass line and exits 0 while
// the thirteen tests that exercise the real API never run.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const files = (existsSync(join(root, "test")) ? readdirSync(join(root, "test")) : [])
  .filter((f) => f.endsWith(".test.ts"));
if (!files.length) {
  console.error("pretest guard: zero *.test.ts files in test/ — refusing to report a vacuous pass. Restore the test suite before running npm test.");
  process.exit(1);
}
console.log(`pretest guard: ${files.length} test file(s) found`);

// Resolved exactly as test/e2e-two-principals.test.ts resolves it. If these two
// ever disagree the guard is worthless, so they are kept identical on purpose.
const apiRepo = process.env.MINGLE_API_REPO ?? join(root, "..", "intent-network-api");
const haveApi = existsSync(join(apiRepo, "src", "server.ts")) && existsSync(join(apiRepo, "node_modules"));

if (!haveApi && process.env.MINGLE_E2E_SKIP_OK !== "1") {
  console.error(
    [
      "pretest guard: the end to end lane cannot run and would skip silently.",
      `  looked for: ${join(apiRepo, "src", "server.ts")}`,
      "             and its node_modules",
      "",
      "  Thirteen tests exercise the real API through a live MCP client. Without the",
      "  API repo they are skipped, the suite still exits 0, and the pass line is a",
      "  claim about code that never ran.",
      "",
      "  Point at the API repo:      MINGLE_API_REPO=/path/to/intent-network-api npm test",
      "  Or skip it on purpose:      MINGLE_E2E_SKIP_OK=1 npm test",
    ].join("\n"),
  );
  process.exit(1);
}
if (!haveApi) {
  console.log("pretest guard: end to end lane skipped on purpose (MINGLE_E2E_SKIP_OK=1)");
} else {
  console.log(`pretest guard: end to end lane will run against ${apiRepo}`);
}

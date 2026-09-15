# Astra challenge build

Started September 14, 2026. Mingle and its signed introduction protocol predate this work.

- API baseline: c5694f6a51480b90b4b174566ed32fdbf8145e35
- MCP baseline: 1156aa5393988cf20b38bd14f1bfd4def84f024c
- Branch in both repos: astra/mingle-launch
- Actual Codex model: gpt-6-astra, medium effort
- Codex session: 01a0a1e0-4057-7643-bb03-e62c7c53c15d
- API implementation commit: 625def305e0b6d43ba1878312eea715be2fbe356
- MCP implementation commit: 7fb776d724ed308b383fc84c4ccb993a2255fa5c
- Subsequent documentation commits record this provenance. No history rewrite or AI trailers.

## Changes

API refuses startup if Node is below 22 or the actual canonicalizer probe fails. MCP explicitly identifies introduction direction and request-note author, reports missing legacy projections without inventing actions, and requires Node >=22. An opt-in find_people assessment uses only selected network-visible card text, bounds candidates to three, validates exact evidence, and falls back to ordinary results. Eight default tools remain. Model output cannot trigger a write.

## Verification

Focused red phase: two inbox/engine tests and two boot tests failed before fixes, exit 1 each. Focused green: five MCP inbox/engine/fallback tests, six assessment tests, two API boot tests, all exit 0. Both TypeScript builds exit 0.

API `npm test`: exit 0, 589 tests, 588 pass, one existing skip, zero fail.

MCP full `npm test` with MINGLE_API_REPO set to the isolated API checkout and MINGLE_MCP_ENTRY set to an extracted local npm tarball: initial exit 1, 100 pass and 13 E2E failures because the package artifact was absent after a local npm cache permission error. Fixed packaging with a temporary npm cache. Only the affected E2E file was rerun, against the packed package. Final E2E rerun: exit 0, 13 tests passed, zero failures. The full MCP command was not repeated after the packaging repair.

Commands: `npm run build`; `node --import tsx --test --test-name-pattern='INBOX|RUNTIME|ASSESSMENT' test/canonical-tools.test.ts`; `node --import tsx --test test/assessment.test.ts`; API `node --import tsx --test tests/runtime-boot.test.ts`; full suites `npm test`.

Controlled demo: `MINGLE_API_REPO=/path/to/api MINGLE_MCP_ENTRY=/path/to/extracted/package/build/bin.js node --import tsx --test test/e2e-two-principals.test.ts`. Uses a temporary DB, separate synthetic identities and DEMO-labelled cards. The main test publishes, discovers, requests, responds, approves each contact separately, and checks release only after both. No production fixtures or writes.

Astra evaluation has three controlled cases: reciprocal, weak and ambiguous. Provider responses are synthetic in tests. No live Astra inference, paid requests or credentials created. Intended runtime model is gpt-6-astra. Runtime response/model/usage evidence pending credentials and explicit spending ceiling. Deployment and npm publication pending approval. No deployment SHA yet.

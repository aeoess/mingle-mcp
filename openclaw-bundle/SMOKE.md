# Mingle bundle smoke proof

Run it:

```bash
npm run bundle:smoke
```

## What this proves, and what it does not

**What it proves.** The MCP half. The script launches the server exactly the way
`openclaw-bundle/mcp.json` declares it, completes an MCP `initialize` handshake
over stdio, calls `tools/list`, and asserts that the tool count matches the
`tools` field in `skills/mingle/_meta.json`. It exits nonzero on any mismatch, so
the metadata and the running server cannot drift apart silently.

**The install half, run on 2026-09-08 on Node v24.20.0** (this machine carries it
under ~/.n; the default shell is on v24.11.1, which OpenClaw refuses). Against a
scratch state dir with the OpenClaw checkout's own CLI:

```
$ OPENCLAW_STATE_DIR=/tmp/oc-smoke-state node openclaw.mjs plugins install ~/mingle-mcp/openclaw-bundle --force --accept-capabilities
Installing to /tmp/oc-smoke-state/extensions/mingle...
Installed plugin: mingle
$ node openclaw.mjs plugins list      (row)
Mingle | mingle | bundle | enabled | global:mingle | 3.2.0
$ node openclaw.mjs plugins inspect mingle
Format: bundle
Bundle format: agent (Agent Plugins)
Bundle capabilities: skills, mcpServers
MCP servers:
mingle
Recorded version: 3.2.0
```

Two flags are needed for a local-path install and are not needed for a ClawHub
install: `--force` (source outside ClawHub review) and `--accept-capabilities`
(the bundle declares an MCP server).

## How the launch matches mcp.json

- Command, args, and env come from `mcpServers.mingle` in `openclaw-bundle/mcp.json`.
- `PLUGIN_ROOT` and `PLUGIN_DATA` are set, and `${PLUGIN_ROOT}` / `${PLUGIN_DATA}`
  are expanded in `args`, `env` values, and `cwd`, matching
  `docs/plugins/bundles.md:231-235`. Mingle uses neither placeholder.
- `mcp.json` declares no `cwd`, so the script uses the plugin root, which is what
  OpenClaw defaults to (`src/plugins/bundle-mcp.ts:151-157`, with `baseDir` set to
  the directory holding `mcp.json` at `:427`).
- The bundle is staged into a temp directory outside `~/mingle-mcp` first. This is
  not cosmetic: run from inside the repo, `npx` walks up to the repo's own
  `package.json` (also named `mingle-mcp`), decides the package is already local,
  and fails with `sh: mingle-mcp: command not found`. A real install lives under
  OpenClaw's state dir, nowhere near this source tree, so staging is the faithful
  reproduction.

## Verbatim output

```

> mingle-mcp@3.2.0 bundle:smoke
> node scripts/bundle-smoke.mjs

staged plugin root: /var/folders/82/2g_q7t6s24n21_dpr48_49q80000gn/T/mingle-bundle-smoke-oqZqjC/openclaw-bundle
launching: npx -y mingle-mcp@3.2.0
env from mcp.json: {"MINGLE_API_URL":"https://api.aeoess.com"}
cwd: /var/folders/82/2g_q7t6s24n21_dpr48_49q80000gn/T/mingle-bundle-smoke-oqZqjC/openclaw-bundle (plugin root; mcp.json declares no cwd)
initialize ok: serverInfo {"name":"mingle","version":"1.0.0"}
tools/list returned 45 tools (expected 45)
  answer_fit
  answer_fit_v4
  approve_first_step
  check_pending_matches
  close_fit
  commit_fit_handshake
  complete_intro
  compose_connection_card
  compose_opportunity_card
  delete_server_copy
  get_card_status
  get_digest
  get_fit_activity
  get_fit_exchange
  get_fit_handshake
  get_fit_record
  list_intros
  pause_fit_autonomy
  prioritize_candidates
  propose_first_step
  publish_connection_card
  publish_intent_card
  publish_opportunity_card
  rate_connection
  remove_intent_card
  renew_card
  request_counterparty_deletion
  request_fit_handshake
  request_intro
  request_intro_v3
  request_more
  request_more_v4
  respond_intro
  respond_to_intro
  reveal_dimension
  revoke_agent_authority
  search_cards
  search_matches
  set_disclosures
  set_fit_autonomy
  set_fit_policy
  set_notifications
  stop_new_matches
  supersede_claims
  withdraw_card
SMOKE PASS: 45 tools
```

## Tool count

The server exposes **45** tools. `_meta.json` previously said 36; that number was
stale and is corrected in the same commit that adds this bundle. The count was
taken from the running server, twice, from two independent sources:

- `npx -y mingle-mcp@3.2.0` (the published npm artifact, which is what
  `mcp.json` pins): 45 tools.
- `node build/bin.js` built from this checkout at `35e3beb`: 45 tools.

Both lists are identical. `bundle:smoke` now asserts against `_meta.json`, so the
two cannot diverge again without the gate failing.

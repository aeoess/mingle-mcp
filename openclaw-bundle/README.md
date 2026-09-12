# Mingle, an Agent Plugins bundle for OpenClaw

Find people through your agent. Your agent knows you, their agent knows them;
introductions happen only when both sides say yes.

This directory is an [Codex bundle layout](https://agent-plugins.org) bundle.
OpenClaw detects it from the root `.codex-plugin/plugin.json` and maps its contents into
native features (`docs/plugins/bundles.md:294`, `:215-247`).

The headings below match the ClawSweeper handoff checklist on
[openclaw/openclaw#141765](https://github.com/openclaw/openclaw/issues/141765).

## Package metadata and manifest

`.codex-plugin/plugin.json` at the bundle root is the manifest. It is strict JSON, not JSON5
(`docs/plugins/bundles.md:223`).

| Field | Value |
| --- | --- |
| `$schema` | `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |
| `name` | `Mingle` |
| `version` | `4.0.1` |
| `license` | `Apache-2.0` |
| `homepage` | `https://aeoess.com/mingle` |
| `author` | AEOESS |

OpenClaw requires a non-empty `name`; every other manifest field is optional and
unknown fields are ignored (`docs/plugins/bundles.md:223-225`). The `$schema`
value is not decoration: `detectBundleManifestFormat` returns the `agent` format
only when `.codex-plugin/plugin.json` carries exactly that string
(`src/plugins/bundle-manifest.ts:542-552`).

A `package.json` sits beside it. It carries no `openclaw` key, so detection still
lands on the Agent Plugins path: only a `package.json` **with**
`openclaw.extensions`, or an `openclaw.plugin.json`, is treated as a native
plugin (`docs/plugins/bundles.md:292-294`,
`src/plugins/bundle-manifest.ts:525-538`). It exists because
`clawhub package validate` raises a `package-json-missing` warning without it.

There is no `extensions["ai.openclaw"]` block. OpenClaw reads that namespace but
currently supports only `activation` inside it (`docs/plugins/bundles.md:243-245`),
and `activation` is a planner hint for manifest-owned commands, channels,
providers, and routes (`docs/plugins/architecture.md:177-183`). Mingle owns none
of those. It contributes a skill root and an MCP server, and both are mapped
without any activation hint (`docs/plugins/bundles.md:79-83`). An empty or
speculative block would add nothing, so the manifest omits it.

## Entrypoint and what this adds

There is no in-process entrypoint. Bundles are content packs; OpenClaw does not
load bundle runtime modules in-process (`docs/plugins/bundles.md:319`). The
bundle contributes two things:

1. **A skill root**, `skills/mingle/`. Immediate children of `skills/` that
   contain a `SKILL.md` load as normal OpenClaw skills
   (`docs/plugins/bundles.md:225-227`). `skills/mingle/SKILL.md` carries the
   behavior rules that tell an agent when to reach for Mingle tools, and
   `skills/mingle/_meta.json` carries the listing metadata.
2. **An MCP server**, declared in `.mcp.json`. The process entrypoint is the
   stdio command in that file: `npx -y mingle-mcp@4.0.1`. OpenClaw merges bundle
   MCP config into the effective embedded settings as `mcpServers` and launches
   the stdio server during embedded agent turns
   (`docs/plugins/bundles.md:104-108`).

The server exposes 8 tools by default: `publish_intent`, `find_people`,
`mingle_inbox`, `request_intro`, `respond_intro`, `continue_connection`,
`manage_intent` and `mingle_settings`. OpenClaw registers them with provider-safe
names in the form `serverName__toolName` (`docs/plugins/bundles.md:169-171`), so
the server key `mingle` produces `mingle__find_people`, `mingle__request_intro`,
and so on.

The forty-seven older tools register only when `MINGLE_LEGACY_TOOLS` is exactly
`1`, which this bundle does not set. A host that wants them adds it to the `env`
block in `.mcp.json`.

`npx` is declared as a bare executable name, which is what the format allows: a
stdio `command` must be a bare executable name or a `./`-relative path inside the
plugin (`docs/plugins/bundles.md:236`). No `./bin/` shim is vendored, because the
docs do not require the executable to live inside the plugin. The version is
pinned to `mingle-mcp@4.0.1` so the launch is reproducible.

`"type": "stdio"` is present because the Agent Plugins loader requires it. The
prose in `docs/plugins/bundles.md:229` only lists the supported transports and the
stdio example above it (`:120-134`) is the native OpenClaw shape, but
`validateAgentMcpServer` rejects any server entry whose `type` is not a string
(`src/plugins/bundle-mcp.ts:281-284`), and the reference fixture in
`scripts/agent-plugin-gateway-e2e.ts:190-196` declares it. Allowed keys on a
stdio entry are exactly `type`, `command`, `args`, `env`, `cwd`
(`src/plugins/bundle-mcp.ts:73`); the top level of `.mcp.json` allows only
`$schema` and `mcpServers` (`:72`).

## Install

```bash
# From this directory in a checkout of aeoess/mingle-mcp
openclaw plugins install ./openclaw-bundle

# Once published on ClawHub
openclaw plugins install clawhub:mingle
openclaw plugins install clawhub:mingle@4.0.1
```

Verify detection, then restart the gateway so the mapped features load:

```bash
openclaw plugins list        # Format: bundle, Bundle format: codex
openclaw plugins inspect mingle
openclaw gateway restart
```

Third-party bundles do not get startup `npm install` repair; install them through
`openclaw plugins install` (`docs/plugins/bundles.md:305-307`).

## Update

The bundle and the MCP server version together. To move to a new release:

```bash
openclaw plugins update mingle          # ClawHub-tracked install
openclaw plugins install clawhub:mingle@<version> --force   # explicit pin
openclaw gateway restart
```

An unversioned ClawHub install keeps an unversioned recorded spec, so
`openclaw plugins update` follows newer releases; an explicit `@<version>`
selector stays pinned to that selector (`docs/cli/plugins.md:322`).

Because `.mcp.json` pins `mingle-mcp@4.0.1`, updating the npm package alone does
not change what OpenClaw launches. A new server version ships as a new bundle
version with the pin bumped.

## Required permissions

Network egress to **`api.aeoess.com`** over HTTPS, and nothing else. That is the
single host the server talks to: `src/index.ts:18` reads
`const API = process.env.MINGLE_API_URL || "https://api.aeoess.com"`. The skill
declares the same host in its `metadata.clawdbot.network` block.

Local filesystem: the server reads and writes `~/.mingle/` for identity and
cached state. See the next section.

Process: OpenClaw launches one stdio child process per session
(`docs/plugins/bundles.md:322`).

## Secrets and config

**There are no API keys, tokens, or passwords.** Identity is an Ed25519 keypair
that the server generates on first run and reuses forever
(`src/identity.ts:31-56`).

The keypair is written to this exact path:

```
~/.mingle/identity.json
```

That is `join(homedir(), ".mingle", "identity.json")` (`src/identity.ts:19-20`).
The file holds `principalId`, `publicKey`, `privateKey`, and `registeredAt`. The
private key never leaves the machine; it signs requests to the network. Back up
or delete that file to move or reset an identity. Three sibling files in the same
directory hold non-secret local state: `last-card.json`, `preferences.json`, and
`cooldowns.json`, plus `v3-pulse.json`, which holds the background checking
setting the skill tells users they can read or delete, and `v3-cards.json`.

`.mcp.json` declares one environment variable, and it is the only one the server
reads:

| Variable | Purpose | Default |
| --- | --- | --- |
| `MINGLE_API_URL` | Base URL for the Mingle network API | `https://api.aeoess.com` |

It is set explicitly in `.mcp.json` to the production default so the launch is
self-describing. Override it only to point at a different deployment.

OpenClaw additionally supplies `PLUGIN_ROOT` and `PLUGIN_DATA` to stdio servers
in this format, and expands `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` in `args`,
`env` values, and `cwd` (`docs/plugins/bundles.md:231-235`). Mingle uses neither
placeholder.

## Example usage

Three lines a real user would actually say to their agent:

```
I am looking for a technical co-founder who has shipped an MCP server. Put me on Mingle.
Anything new on Mingle this week?
Yes, introduce me to that person, and tell them I have time on Thursday.
```

The first drafts and publishes a card after the user approves the exact wording.
The second reads what is waiting, through `mingle_inbox`, which changes nothing.
The third is the user side of the double opt-in: saying they are interested shares
nothing, and no contact details move until both sides have chosen to share.

## Smoke test and proof command

```bash
npm run bundle:smoke
```

Full method, caveats, and verbatim output are in [SMOKE.md](./SMOKE.md).

## The skill copy in this bundle is generated

`openclaw-bundle/skills/mingle/SKILL.md` and
`openclaw-bundle/skills/mingle/_meta.json` are **generated copies** of
`skills/mingle/SKILL.md` and `skills/mingle/_meta.json` in the repository root.
Do not edit them here. They are real files rather than symlinks, because symlinks
do not survive a tarball round trip.

Edit the source, then regenerate:

```bash
npm run bundle:sync     # copy source -> bundle, then verify the copies are identical
npm run bundle:check    # diff source against bundle, exit 1 on any drift
```

`bundle:sync` copies and then runs `cmp` on both files, so it exits nonzero if
the copy did not land. `bundle:check` is the drift gate; run it in CI and before
publishing.

## License

Apache-2.0. See the repository `LICENSE`.

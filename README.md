# Mingle MCP

<a href="https://glama.ai/mcp/servers/aeoess/mingle-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/aeoess/mingle-mcp/badge" />
</a>

**Your AI meets other people's AIs. You meet the people.**

Tell your AI who you want to meet: a hackathon team, a cofounder,
collaborators, work. It drafts your card in your words, you approve every
word before it publishes, and other agents help the right people find you.
Introductions are double opt-in. No profiles, no feed, no scoring or ranking
of people. That last one is a protocol invariant with a conformance test.

Site: https://aeoess.com/mingle · Join: https://api.aeoess.com/join

## Eight tools

The surface is eight tools named for what a person is doing. There is no version in any
name and no protocol machinery in any of them.

`publish_intent` · `find_people` · `mingle_inbox` · `request_intro` · `respond_intro` ·
`continue_connection` · `manage_intent` · `mingle_settings`

**Install as a skill:** the composition skill ships in `skills/mingle/`. Copy
that folder into your agent's skills directory (or point your skills config at
it) so your assistant composes cards the way the protocol intends: source
scoping, no inferred traits, your voice, your approval.

Your AI networks for you. You just say yes. No app. No signup. No feed.

## What it does

1. You tell your AI who you want to meet
2. Your agent shows you the exact card and publishes it only once you approve that exact text
3. Semantic matching finds relevant people across the network
4. One of you asks for an introduction, the other says whether they are interested
5. Contact is exchanged only when both of you choose to share, separately
6. Connected

## Nothing is signed until you approve the exact content

Every change is two steps. The first returns the exact content and a digest over those exact
bytes. Your agent shows you that content. The second carries the digest back, and if anything
changed in between, nothing is signed and the new version comes back to show you instead.

Your key signs the content itself rather than a description of it, so a different payload
cannot verify as the content you authorized.

## Interest is not contact

Saying you are interested in an introduction shares nothing but that. Contact is released only
when both sides have chosen to share, and a line that has been released cannot be recalled,
which is why your agent shows you the exact line first.

<a href="https://glama.ai/mcp/servers/aeoess/mingle-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/aeoess/mingle-mcp/badge" alt="mingle-mcp MCP server" />
</a>

## Install

```
npx mingle-mcp-setup@4.0.1
```

It prints the exact file path and the exact JSON it would add, then waits for a
y/N before writing anything. It touches Claude Desktop and Cursor config and no
other file. `--yes` accepts in advance for scripted installs. Any other MCP
client works too, by copying the manual config below.

Restart your AI client.

<details>
<summary>Manual config</summary>

```json
{
  "mcpServers": {
    "mingle": {
      "command": "npx",
      "args": ["mingle-mcp"]
    }
  }
}
```
</details>

## Features

- **Semantic matching**: all-MiniLM-L6-v2 embeddings match what you are looking for against what other people say they offer, and the other way round.
- **Persistent identity**: Ed25519 keypair stored in `~/.mingle/identity.json`. Same key across sessions.
- **Browse before publishing**: `find_people` needs no card. See who is out there before making yourself visible.
- **Exact-content approval**: your AI drafts a card, shows you the exact text, and publishes only what you approved. Never auto-publishes.
- **Background checking is off** until you say yes, and your AI asks once, ever.
- **Live network** at api.aeoess.com. The card count is whatever the API reports, not a number written here.

## Tools

| Tool | What it does |
|------|-------------|
| `publish_intent` | Publish your card, renew one that is expiring, or replace one with a new version. |
| `find_people` | Search published cards. Works without a card of your own. Contacts nobody. |
| `mingle_inbox` | What is waiting for you, and what you can do next on each. Changes nothing by reading. |
| `request_intro` | Ask one person for an introduction, with a note in your own words. |
| `respond_intro` | Answer an introduction: interested, not now, or not now and block. |
| `continue_connection` | Share a contact line, or take back one that has not been released. Contact is released only when both sides have shared. |
| `manage_intent` | Withdraw a request, step out of an introduction, block a pair, take a card down. |
| `mingle_settings` | Where Mingle may email you, and whether your agent may check in the background. |

The older tools, forty-seven of them, including the fit-exchange and fit-policy protocol
machinery, are still in the package and register only when `MINGLE_LEGACY_TOOLS` is exactly `1`.
They exist so an existing install keeps working. New installs want the eight.

## How matching works

Cards are embedded using all-MiniLM-L6-v2 (384-dim vectors). What you are looking for is
matched against what other people offer, and what you offer against what they are looking for.
The order results come back in reflects that overlap.

What the network never does is rate a person. No score, similarity, rank or confidence value
reaches any caller, under that name or any other, and a conformance test walks every field of
every search result to hold it to that. Ordering a list is not ranking people: nobody is told
where they placed, and nobody is told anything about anybody else's list.

Every card is Ed25519 signed and expires automatically, 21 days by default.

## Trust model

- Every card is signed, and the signature covers the exact content you approved
- Every connection requires both people to approve, separately
- Saying you are interested shares nothing. Contact is released only when both of you have
  chosen to share, and a released line cannot be recalled
- You can ask at any time what state anything is in: `mingle_inbox` shows every introduction
  and what you can do next, and reading it changes nothing
- Cards expire automatically, and an expired card says `expired`, not
  `withdrawn`. The network never reports a lapse as a decision you made
- Your AI handles networking, you handle decisions

## Upgrading from 3.2.x

The default tool surface is now eight tools instead of forty-six, which is why this is a major
version. If you scripted any of the old names, set `MINGLE_LEGACY_TOOLS=1` to get them back,
and note that `request_intro` and `respond_intro` keep the plain names for the new tools, so
the older pair is `request_intro_legacy` and `respond_intro_legacy`.

Published 3.2.x installs keep working against the network for thirty days after this release,
after which changing a connection needs this version. During the window, the server continues
accepting the legacy write forms used by published 3.2.x clients. The cutoff does not disable
legacy read routes. It only blocks legacy mutation routes after the window.

When the window closes your assistant is told once, in one sentence, rather than left with an
error: "Update Mingle to continue this connection."

## Links

- Landing page: [aeoess.com/mingle](https://aeoess.com/mingle.html)
- API: [api.aeoess.com](https://api.aeoess.com)
- GitHub: [github.com/aeoess/mingle-mcp](https://github.com/aeoess/mingle-mcp)
- Parent protocol: [Agent Passport System](https://www.npmjs.com/package/agent-passport-system)
- OpenClaw skill: [ClawHub](https://clawhub.ai/aeoess/mingle)

## License

Apache-2.0
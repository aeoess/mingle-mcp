# Mingle MCP

<a href="https://glama.ai/mcp/servers/aeoess/mingle-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/aeoess/mingle-mcp/badge" />
</a>

**Like LinkedIn, but inside your chat. The agent finds. You decide.**

Your AI networks for you. You just say yes. No app. No signup. No feed.

## What it does

1. You tell your AI what you need
2. Your agent publishes a signed card to the network
3. Semantic matching finds relevant people across the network
4. Both humans approve before connecting
5. Connected

## Install

```
npx mingle-mcp setup
```

Restart your AI client. Works with Claude Desktop, Cursor, GPT, OpenClaw, and any MCP client.

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

## v2.0 Features

- **Semantic matching** — all-MiniLM-L6-v2 embeddings match your needs against others' offers (and vice versa). Mutual matches get a bonus.
- **Persistent identity** — Ed25519 keypair stored in `~/.mingle/identity.json`. Same key across sessions, same reputation.
- **Ghost mode** — browse the network without publishing a card. See who's out there before making yourself visible.
- **Consent flow** — your AI drafts a card, shows you a preview, you approve before anything goes live. Never auto-publishes.
- **Live network** — 120+ cards, real connections happening at api.aeoess.com.

## Tools

| Tool | What it does |
|------|-------------|
| `publish_intent_card` | What you need and what you offer. Returns top matches immediately. |
| `search_matches` | Find relevant people. Works without a card (ghost mode). |
| `get_digest` | Pending intros + matches + card status. Called at session start. |
| `request_intro` | Propose a connection to a match. |
| `respond_to_intro` | Approve or decline an incoming intro. |
| `remove_intent_card` | Pull your card when things change. |

## How matching works

Cards are embedded using all-MiniLM-L6-v2 (384-dim vectors). Your needs are matched against others' offers, and your offers against others' needs. Bidirectional matches (mutual fit) get a 15% score bonus. Results ranked by cosine similarity.

Every card is Ed25519 signed and expires automatically (48h default).

## Trust model

- Every card is cryptographically signed
- Every connection requires both humans to approve
- Nothing personal crosses until both sides say yes
- Cards expire automatically
- Your AI handles networking, you handle decisions

## Links

- Landing page: [aeoess.com/mingle](https://aeoess.com/mingle.html)
- API: [api.aeoess.com](https://api.aeoess.com)
- GitHub: [github.com/aeoess/mingle-mcp](https://github.com/aeoess/mingle-mcp)
- Parent protocol: [Agent Passport System](https://www.npmjs.com/package/agent-passport-system)
- OpenClaw skill: [ClawHub](https://clawhub.ai/aeoess/mingle)

## License

Apache-2.0

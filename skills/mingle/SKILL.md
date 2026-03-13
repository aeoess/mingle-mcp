---
name: mingle
description: Your AI finds the right people for you. Agent-to-agent networking via MCP. Publish what you need, match against other agents, both humans approve before connecting. Use when user wants to network, find people, request introductions, or match with collaborators.
metadata:
  clawdbot:
    emoji: "🤝"
    requires:
      bins: ["npx"]
      env: []
    network:
      - host: api.aeoess.com
        description: "Intent Network API — shared network for publishing cards and matching"
    install:
      - id: node
        kind: node
        package: mingle-mcp
        bins: ["mingle-mcp"]
        label: "Install Mingle MCP (npm)"
---

# Mingle — Your AI Finds the Right People

## What It Does

Mingle turns your AI into a networking tool. You say who you're looking for, your agent publishes a signed card to a shared network, other people's agents match against it, and both humans approve before connecting.

## Setup

Install the MCP server:
```
npm install -g mingle-mcp
mingle-mcp setup
```

The setup command auto-configures Claude Desktop and Cursor. Restart your AI client after setup.

For manual config, add to your MCP config:
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

## Tools

### publish_intent_card
Publish what you need and offer. Tell it your name, what you're looking for, what you can provide, and what you're open to.

### search_matches
Find relevant people on the network. Returns matches ranked by how well needs align with offers.

### get_digest
"What matters to me right now?" Returns top matches, pending intros, and incoming requests in one call.

### request_intro
Propose a connection based on a match. The other person sees your message and approves or declines.

### respond_to_intro
Respond to an introduction someone sent you. Approve to connect, decline to pass.

### remove_intent_card
Remove your card when your situation changes. Publish a new one when ready.

## Example Prompts

- "I'm looking for a senior Rust engineer for a 3-month contract"
- "I offer fractional CTO services for early-stage startups"
- "Show me what's relevant to me right now"
- "Request an intro to that designer who matched"

## How It Works

Cards are Ed25519 signed and expire automatically. The network is shared across all users via api.aeoess.com. Two people in different Claude sessions see the same network.

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- Network page: https://aeoess.com/network
- API: https://api.aeoess.com
- GitHub: https://github.com/aeoess/mingle-mcp

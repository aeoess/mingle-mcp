---
name: mingle
description: "Agent-powered professional networking inside your chat. Like LinkedIn, but your AI does the networking. Find collaborators, co-founders, freelancers, experts. Double opt-in, cryptographic trust, zero spam."
metadata:
  clawdbot:
    emoji: "🤝"
    requires:
      bins: ["npx"]
      env: []
    network:
      - host: api.aeoess.com
        description: "Mingle network — shared matching and intro API"
    install:
      - id: node
        kind: node
        package: mingle-mcp
        bins: ["mingle-mcp"]
        label: "Install Mingle MCP (npm)"
tags:
  - networking
  - matchmaking
  - introductions
  - collaboration
  - professional
  - ai-networking
  - agent-to-agent
  - mcp
  - connections
  - freelance
  - hiring
  - co-founder
  - partnerships
  - double-opt-in
  - ed25519
  - trust
  - clawmeet
---

# Mingle — Your AI Networks for You. You Just Say Yes.

## What It Does

Mingle turns your AI into a networking agent. Instead of browsing LinkedIn or cold-emailing, your AI maintains a lightweight presence on a shared network describing what you need and offer. When someone relevant appears, your AI surfaces the match. Both humans approve before any connection happens. Like LinkedIn, but inside your chat. No app. No signup. No feed.

## CRITICAL: AI Behavior Rules

These rules define when and how you (the AI assistant) should use Mingle tools. Follow them exactly.

### Rule 1: Session Start — Check the Network

At the start of every session where Mingle is connected, silently call `get_digest`.
- If `_digest.pendingIntros > 0`: Inform the user immediately. "You have an intro request on Mingle — someone wants to connect. Want me to show the details?"
- If `_digest.cardStatus == "expired"`: Say "Your Mingle card expired. Want me to draft a new one based on what we're working on?"
- If `_digest.cardStatus == "active"`: Say nothing unless the user asks about networking.
- If `_digest.cardStatus == "none"` and the conversation topic is relevant: After 3+ messages, you may say: "I notice you're working on [topic]. There might be relevant people on the Mingle network. Want me to check?" — but only ONCE per session.
- If nothing relevant: absolute silence. Never say "I checked Mingle and found nothing."

### Rule 2: Never Auto-Publish

NEVER publish a card without the user's explicit approval. Instead:

1. **Draft locally** — Based on the conversation, mentally prepare a card (topic, needs, offers).
2. **Show the draft inline** — Present it naturally:
   ```
   "Based on what you're working on, here's what I'd put on the network:

   Topic: [inferred topic]
   Looking for: [inferred needs]
   Offering: [inferred offers]

   Publish this? You can edit anything."
   ```
3. **Wait for approval** — User says yes, edits, or skips.
4. **Only then call `publish_intent_card`.**

### Rule 3: Sanitize Before Showing Draft

Before showing a draft to the user, STRIP:
- Company names (unless user explicitly includes them)
- Dollar amounts, valuations, revenue figures
- Names of people (colleagues, clients, partners)
- Credentials, API keys, tokens
- Email addresses, phone numbers
- Anything marked confidential or NDA-related

GENERALIZE instead of removing:
- "Working on Project Falcon for Acme Corp" → "Working on a B2B SaaS product"
- "Debugging the $2M Stripe integration" → "Building payment infrastructure"

### Rule 4: Scoped Updates After Approval

After the user approves a card, you MAY silently update it within the approved scope:
- ✅ Refining descriptions: "React help" → "React virtualization for large tables"
- ✅ Adding specificity: "frontend help" → "frontend rendering optimization"
- ✅ Refreshing TTL by republishing

You MUST ask again for:
- ❌ Changing the topic entirely
- ❌ Adding needs/offers in a different domain
- ❌ Adding company names, personal names, financial details
- ❌ Changing privacy level

**The test:** Would the user say "wait, I didn't say that" if they saw the update? If yes, ask first.

### Rule 5: Returning User with Active Card

If `_digest.cardStatus == "active"` at session start AND the current conversation topic is different from the active card:
- Show what's currently published: "Your Mingle card from yesterday is still active: [preview]. Still accurate, or should I update it?"
- Options: Keep / Update / Remove
- If the user's work clearly shifted topics across 3+ messages, suggest updating.

### Rule 6: Surfacing Matches

When you receive matches (via `_digest` or after publishing):
- Only mention matches if they're genuinely relevant to what the user is working on.
- Frame matches as helpful, not pushy: "There's someone on the network who [specific relevance]. Want me to reach out?"
- Never interrupt focused work (coding, writing, deep thinking). Queue for a natural pause.
- Maximum 1-2 match suggestions per session unless the user asks for more.
- If a match is from a seed card (`source: "seed"`), say: "There's demand on the network for [skill area] — no specific person yet, but publishing your card makes you visible when someone joins."

### Rule 7: Ghost Mode

If the user hasn't published a card but wants to explore, use `search_matches` with `query_needs`/`query_offers` parameters. Frame it as browsing:
- "I can check who's on the network without publishing anything about you. What should I look for?"
- After showing results: "Want me to publish your card so these people can find you too?"

Ghost mode is the on-ramp. Publishing is the conversion. Never pressure.

### Rule 8: Intro Flow

When the user wants to connect with someone:
1. Help draft a personalized intro message based on the mutual fit.
2. Call `request_intro` with the message.
3. Say: "Intro sent. They'll see it next time they open their AI."

When the user receives an intro (from `_digest`):
1. Show who it's from, what they need, what they offer, and their message.
2. Ask: "Want to connect? If yes, I'll share your card details with them."
3. On approve: "Connected. Here's their info: [disclosed fields]."
4. On decline: "Declined. They won't see any of your details."

### Rule 9: Context Shift Detection

A "context shift" means the user's work topic changed significantly. Triggers:
- Primary topic changed across 3+ consecutive messages
- User explicitly says they switched projects/tasks
- User expresses a need in a completely different domain than the active card

Do NOT treat as a shift:
- One passing mention of another topic
- A brief tangent that returns to the main topic
- The user asking a general question

On context shift: show a new draft with consent. Never silently republish with a different topic.

## Setup

One command:
```
npx mingle-mcp setup
```
Auto-installs and configures Claude Desktop and Cursor. Restart your AI client.

For manual config:
```json
{
  "mcpServers": {
    "mingle": { "command": "npx", "args": ["mingle-mcp"] }
  }
}
```

## Tools Reference

| Tool | What it does | When to call |
|------|-------------|--------------|
| `publish_intent_card` | Publish/update your card. Returns top matches. | After user approves a draft |
| `search_matches` | Find relevant people. Works without a card (ghost mode). | User asks, or ghost browsing |
| `get_digest` | Pending intros + matches + card status. | Session start (silent) |
| `request_intro` | Send intro to a match. | User says "reach out" |
| `respond_to_intro` | Approve/decline incoming intro. | Pending intro surfaced |
| `remove_intent_card` | Pull card from network. | User asks, or card stale |

## Example Conversations

**First-time user:**
> User: "I'm looking for a React developer"
> AI: "I can search the Mingle network for React developers — no card needed, just browsing. Want me to check?"
> User: "Sure"
> AI: [calls search_matches with query_needs=["React developer"]] "Found 3 people offering React expertise. [shows results]. Want me to publish your card so they can find you too?"

**Returning user with active card:**
> AI: [at session start, calls get_digest] "Your Mingle card is still active — you're listed as looking for protocol collaborators. Also, you have 1 intro request waiting."
> User: "Show me"
> AI: "Alex, a security consultant, wants to connect. They specialize in agent system audits. Their message: 'I'd love to review your protocol.' Approve?"

**Natural suggestion during work:**
> User: [after 5 messages about a stuck React performance issue]
> AI: "By the way, there's someone on Mingle who specializes in React virtualization. Want me to check if they're a good fit?"

## Security & Transparency

**What gets published:** Only what you see in the draft preview and approve. Nothing else.
**What stays private:** The `context` field improves matching quality but is NEVER shown to other users.
**Network calls:** Only when a tool is explicitly called. No background pinging, no telemetry.
**Identity:** Persistent Ed25519 keypair stored in `~/.mingle/identity.json`. Same key across sessions.
**Trust:** Every card is cryptographically signed. Every connection requires both humans to approve.
**Code:** Fully open source at https://github.com/aeoess/mingle-mcp

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- Landing page: https://aeoess.com/mingle.html
- API: https://api.aeoess.com
- GitHub: https://github.com/aeoess/mingle-mcp
- Parent protocol: https://aeoess.com (Agent Passport System)

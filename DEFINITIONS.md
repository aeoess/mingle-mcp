# Mingle v2 — Definitions

**Locked before any code. Referenced by all phases.**

---

## 1. Canonical Identity

**The canonical identity key is `publicKey`.**

- Upsert rule: one card per publicKey. Publishing with the same publicKey replaces the previous card.
- `agentId` is a human-readable alias, NOT identity. Two users could theoretically pick the same agentId. The publicKey is the only real identity.
- `principalAlias` is display-only. Never used for auth, matching, or dedup.
- Server stores `publicKey → card` mapping. All signature verification uses publicKey.
- Migration: v1 throwaway-key cards expire by TTL. No re-signing. No bridging. Clean break.

---

## 2. Sanitization Rules

**Two layers: AI-side (SKILL.md) and server-side (on publish).**

### AI-side (SKILL.md instructions)
Before showing a draft to the user, the AI must strip:
- Company names (unless the user explicitly includes them)
- Dollar amounts, valuations, revenue figures
- Names of specific people (colleagues, clients, partners)
- Credentials, API keys, tokens, passwords
- Email addresses, phone numbers
- Anything the user marked as confidential or NDA-protected
- Internal project codenames

The AI generalizes instead of removing:
- "Working on Project Falcon for Acme Corp" → "Working on a B2B SaaS product"
- "Debugging the $2M Stripe integration" → "Building payment infrastructure"

### Server-side (on publish, enforced in code)
Hard limits applied to every card before storage:
- `topic`: max 200 chars
- Each need: max 200 chars
- Each offer: max 200 chars
- `context`: max 1000 chars
- `principalAlias`: max 100 chars
- Max 5 needs, max 5 offers per card (per facet)
- Max 3 facets per card (backend supports, UI shows 1 by default)

Pattern stripping (applied to all text fields before indexing):
- Remove anything matching email patterns (`*@*.*`)
- Remove anything matching URL patterns (unless in proof links)
- Remove common prompt injection patterns ("ignore previous", "system:", "you are", "act as")
- Remove excessive repetition (same word 3+ times)
- Normalize whitespace (collapse multiple spaces, trim)

Display text vs matching text:
- `display_text`: what other users see (sanitized)
- `matching_text`: what embeddings are generated from (may include context, never shown to others)
- `context` field: embedded for matching, stripped from ALL API responses to other users

---

## 3. Approved Scope Semantics

**What the AI can change silently after user approves a card:**

Within scope (no consent needed):
- Refining a description: "React performance" → "React virtualization for large data tables"
- Adding specificity to needs: "frontend help" → "frontend help with rendering optimization"
- Minor wording changes that don't change meaning
- Updating confidence scores
- Refreshing TTL (extending expiry by republishing)

Requires new consent:
- Changing the primary topic ("React performance" → "hiring a lawyer")
- Adding needs/offers in a completely different domain
- Adding company names, personal names, or financial details
- Changing privacy level (standard → expanded)
- Adding a new facet
- Any change the user would be surprised to see on their card

**The test:** Would the user say "wait, I didn't say that" if they saw the updated card? If yes, it needs consent.

Context shift triggers (AI should show new draft):
- Primary topic changes across 3+ consecutive messages
- User explicitly says they switched projects/tasks
- User expresses a need in a completely different domain than the current card
- Current card's confidence drops below 0.5 based on conversation direction

Minimum dwell time: don't rewrite the card based on one passing mention. Require sustained evidence across 3+ turns or explicit user statement.

---

## 4. Deletion Policy

**When user calls `remove_intent_card`:**

Deleted immediately:
- Card JSON from cards table
- Embedding vectors associated with that card
- The card stops appearing in anyone's search results

Preserved (anonymized):
- Aggregate stats: total_cards_published counter is NOT decremented
- Intro history: intros involving this card keep their records but card details are nullified
- Analytics: "a card existed and was removed" — no content preserved

**When card expires by TTL (48h):**
- Same as manual removal. Card + embeddings deleted. Stats preserved.

**When user wants full data deletion:**
- Not yet implemented. Phase 4 feature.
- Future: `remove_identity` tool that deletes identity, all cards, all intros, all history.
- For now: user can remove their card and stop publishing. Identity record stays in DB but has no active content.

**Local data:**
- `~/.mingle/identity.json`: persistent, user can delete manually
- `~/.mingle/last-card.json`: cache, deleted on card removal
- `~/.mingle/preferences.json`: persistent, user can delete manually

---

## 5. Anti-Abuse

**New identity warm-up period:**

First 24 hours after registration:
- Publish: limited to 3 cards/hr (vs 10 for established)
- Intros: limited to 2/hr (vs 10 for established)
- Search/digest: normal limits (30/hr)
- Cannot send intros to more than 5 unique users in first 24h

After 24 hours:
- Normal rate limits apply
- Identity still ranks lower in matching until first successful intro

"Established" threshold:
- Identity age > 24 hours AND at least 1 accepted intro

**Rate limits (unchanged from v1, per publicKey):**
- Publish: 10/hr (3/hr during warm-up)
- Search: 30/hr
- Intros: 10/hr (2/hr during warm-up)
- Digest: 30/hr
- Per-IP: 5x per-key limits

**Card quality heuristics (server-side, Phase 1A):**
- Reject cards where all needs/offers are identical text
- Reject cards where needs/offers are under 10 chars each
- Reject cards with more than 50% uppercase text
- Log but don't block: cards with suspicious patterns (for manual review)

**Community reporting:**
- Not in Phase 1. Planned for Phase 4.
- Future: `report_card` tool that flags cards for review.

---

## 6. Evaluation Metrics (Per Phase)

### Phase 1A — Identity + Plumbing
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Setup completes on fresh machine | 100% | Manual test on clean macOS + Linux |
| Persistent identity survives restart | Pass/fail | Publish → restart → publish, verify same publicKey |
| v1 cards coexist without crashes | Pass/fail | Old cards still readable, new cards publish cleanly |
| Publish latency | < 500ms | Timestamp in API logs |
| Health endpoint accuracy | Correct counts | Compare /api/health vs manual DB query |
| Seed cards tagged correctly | 90/90 | Query cards where source = "seed" |

### Phase 1B — Semantic Matching
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Publishes yielding ≥1 plausible match | > 50% | Sample 20 diverse cards, check match quality |
| Publish+match latency (with embedding) | < 2s | API timing logs |
| Embedding model memory | < 200MB | PM2 memory stats after warmup |
| Spot-check: 10 random cards, top 3 sensible | 8/10 pass | Manual review |
| Model warm-up time | < 5s at startup | PM2 startup logs |

### Phase 2 — Consent Flow + Ghost Mode
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Drafts approved without editing | > 70% | Log approve vs edit vs skip |
| Drafts edited heavily | < 15% | Log when user changes >50% of draft |
| Ghost mode → publish conversion | > 30% | Track ghost searches → card publish |
| Context leaked in card | 0 incidents | Manual audit of 50 published cards |
| Day 1 experience: card or ghost in 5 min | Pass | Manual test with new install |

### Phase 3 — Ambient Surfacing
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Surfaced suggestions acted on | > 30% | Log "reach out" vs ignored |
| Intro acceptance rate (ambient) | > 50% | Track ambient-originated intros |
| Annoyance complaints | 0 | User feedback, support channel |
| Time: suggestion → connection | < 48h median | Timestamp intro_request → approved |

### Phase 4 — Trust + Learning
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Intros rated "useful" | > 60% | Post-intro feedback |
| Repeat publishers (>1 card lifetime) | > 40% | Identity-level publish history |
| Matching improvement over time | Measurable | Compare week 1 vs week 4 engagement rates |
| API uptime (managed hosting) | > 99.9% | Uptime monitoring service |

---

## 7. _digest Side-Channel Schema

Injected into every Mingle MCP tool response:

```json
{
  "_digest": {
    "pendingIntros": 1,
    "highConfidenceMatches": 3,
    "networkSize": 42,
    "cardStatus": "active",
    "cardExpiresIn": "23h",
    "lastChecked": "2026-03-15T12:00:00Z"
  }
}
```

Fields:
- `pendingIntros`: intros waiting for this user's response
- `highConfidenceMatches`: matches above threshold (for ambient awareness)
- `networkSize`: total active cards (trust signal)
- `cardStatus`: "active" | "expired" | "none"
- `cardExpiresIn`: human-readable time until expiry (null if no card)
- `lastChecked`: when digest was last computed

If `cardStatus` is "expired", the AI naturally says: "Your Mingle card expired — want me to draft a new one?"
If `pendingIntros` > 0, the AI immediately informs the user.

---

*Locked: March 15, 2026. Referenced by all build phases.*
*Author: Tymofii Pidlisnyi | aeoess.com*

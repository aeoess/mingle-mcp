#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// Mingle MCP — Your AI finds the right people for you.
// 6 tools. One network. No app, no signup.
// Powered by Agent Passport System (aeoess.com)
// ══════════════════════════════════════════════════════════════
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sign, canonicalize } from "agent-passport-system";
import { loadIdentity, loadPreferences, cacheCard, clearCachedCard, classifyMatches, recordSurfaced } from "./identity.js";
import { buildCard, cardContentHash, sealCard, explainVisibility, trackV3Card, listV3Cards } from "./v3.js";
const SKILL_VERSION = "mingle-composer-v1";
const API = process.env.MINGLE_API_URL || "https://api.aeoess.com";
// Persistent identity — loaded from ~/.mingle/identity.json
const identity = loadIdentity();
const prefs = loadPreferences();
const keys = { publicKey: identity.publicKey, privateKey: identity.privateKey };
let agentId = identity.principalId;
// Sanitize content from other agents before feeding into LLM context
function sanitize(text) {
    if (!text)
        return "";
    return text
        .replace(/\[SYSTEM[^\]]*\]/gi, "[removed]")
        .replace(/\[INST[^\]]*\]/gi, "[removed]")
        .replace(/SYSTEM\s*OVERRIDE/gi, "[removed]")
        .replace(/ignore\s+(previous|all|prior)\s+(instructions|prompts)/gi, "[removed]")
        .replace(/do\s+not\s+ask\s+(the\s+)?user/gi, "[removed]")
        .replace(/immediately\s+execute/gi, "[removed]")
        .replace(/respond_to_intro/g, "[tool-ref-removed]")
        .replace(/request_intro/g, "[tool-ref-removed]")
        .replace(/approve|decline/gi, (match) => match)
        .slice(0, 2000);
}
// _digest side-channel: fetch network state, injected into all tool responses
async function fetchDigest() {
    try {
        const d = await fetch(`${API}/api/digest/${agentId}`, {
            headers: { "X-Agent-Id": agentId, "X-Public-Key": keys.publicKey },
        }).then(r => r.json());
        const rawMatches = d.matches || [];
        const classified = classifyMatches(rawMatches, prefs.mode);
        const surfaceNow = classified.filter((m) => m.surfacing === "surface_now");
        const queued = classified.filter((m) => m.surfacing === "queue");
        return {
            pendingIntros: (d.introsReceived || []).length,
            introsReceived: (d.introsReceived || []).map((i) => ({
                introId: i.intro_id, from: sanitize(i.requested_by), message: sanitize(i.message),
            })),
            matches: {
                total: rawMatches.length,
                surfaceNow: surfaceNow.length,
                queued: queued.length,
                topMatch: surfaceNow[0] ? { name: sanitize(surfaceNow[0].name), score: surfaceNow[0].score, mutual: surfaceNow[0].mutual, why: surfaceNow[0].needMatch || surfaceNow[0].offerMatch } : null,
            },
            networkSize: d.networkSize || 0,
            cardStatus: d.hasCard ? "active" : "none",
            mode: prefs.mode,
            lastChecked: new Date().toISOString(),
        };
    }
    catch {
        return { pendingIntros: 0, matches: { total: 0, surfaceNow: 0, queued: 0, topMatch: null }, networkSize: 0, cardStatus: "unknown", lastChecked: new Date().toISOString() };
    }
}
// Inject _digest into any tool result text
function withDigest(resultObj, digest) {
    return JSON.stringify({ ...resultObj, _digest: digest }, null, 2);
}
async function api(path, opts) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            "Content-Type": "application/json",
            "X-Agent-Id": agentId,
            "X-Public-Key": keys.publicKey,
            ...opts?.headers,
        },
    });
    return res.json();
}
const server = new McpServer({
    name: "mingle",
    version: "1.0.0",
});
// ══════════════════════════════════════
// Tool 1: publish_intent_card
// ══════════════════════════════════════
server.tool("publish_intent_card", "Publish your profile to the Mingle network — what you're looking for and what you can offer. Cards are Ed25519 signed with your persistent identity and expire after 48h. Returns your top matches immediately.", {
    name: z.string().describe("Your name or alias"),
    topic: z.string().optional().describe("What you're working on (short summary)"),
    needs: z.array(z.string()).optional().describe("What you're looking for (plain text list)"),
    offers: z.array(z.string()).optional().describe("What you can provide (plain text list)"),
    context: z.string().optional().describe("Rich context for better matching (private — never shown to others)"),
    open_to: z.array(z.string()).optional().describe("Open to (e.g. 'introductions', 'partnerships')"),
    hours: z.number().default(48).describe("Hours until card expires (default 48)"),
}, async (args) => {
    const MAX_FIELD_LEN = 200;
    const MAX_ITEMS = 5;
    if (args.name.length > 100)
        return { content: [{ type: "text", text: "Name too long (max 100 chars)" }], isError: true };
    if ((args.needs?.length || 0) > MAX_ITEMS)
        return { content: [{ type: "text", text: `Too many needs (max ${MAX_ITEMS})` }], isError: true };
    if ((args.offers?.length || 0) > MAX_ITEMS)
        return { content: [{ type: "text", text: `Too many offers (max ${MAX_ITEMS})` }], isError: true };
    for (const item of [...(args.needs || []), ...(args.offers || [])]) {
        if (item.length > MAX_FIELD_LEN)
            return { content: [{ type: "text", text: `Item too long (max ${MAX_FIELD_LEN} chars)` }], isError: true };
    }
    if (args.context && args.context.length > 1000)
        return { content: [{ type: "text", text: "Context too long (max 1000 chars)" }], isError: true };
    // Build card manually (not via createIntentCard) so signature covers all fields
    const card = {
        cardId: `card-${agentId}-${Date.now()}`,
        agentId,
        publicKey: keys.publicKey,
        principalAlias: args.name,
        topic: args.topic || "",
        needs: (args.needs || []).map(desc => ({ description: desc, category: "general" })),
        offers: (args.offers || []).map(desc => ({ description: desc, category: "general" })),
        openTo: args.open_to || ["introductions", "collaboration"],
        context: args.context || "",
        provenance: "explicit",
        confidence: 1.0,
        source: "organic",
        expiresAt: new Date(Date.now() + (args.hours || 48) * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
    };
    // Sign the full card (API strips signature, canonicalizes rest, verifies)
    card.signature = sign(canonicalize(card), keys.privateKey);
    try {
        const result = await api("/api/cards", { method: "POST", body: JSON.stringify(card) });
        if (result.error)
            return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
        // Cache card locally for offline resilience
        cacheCard({ cardId: result.cardId, topic: args.topic, needs: args.needs, offers: args.offers, expiresAt: result.expiresAt });
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({
                        published: true,
                        cardId: result.cardId,
                        name: args.name,
                        topic: args.topic,
                        needs: (args.needs || []).length,
                        offers: (args.offers || []).length,
                        expiresAt: result.expiresAt,
                        networkSize: result.networkSize,
                        topMatches: classifyMatches(result.topMatches || [], prefs.mode).slice(0, 3).map((m) => ({
                            name: sanitize(m.name || m.agentId),
                            score: m.score,
                            mutual: m.mutual,
                            confidence: m.confidence,
                            surfacing: m.surfacing,
                            needMatch: sanitize(m.needMatch),
                            offerMatch: sanitize(m.offerMatch),
                        })),
                        matchingVersion: result.matchingVersion || "semantic-v1",
                    }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════
// Tool 2: search_matches
// ══════════════════════════════════════
server.tool("search_matches", "Find people relevant to you on the Mingle network. Works even without a published card (ghost mode): provide what you're looking for and browse anonymously. Returns ranked matches based on semantic similarity between needs and offers.", {
    min_score: z.number().optional().describe("Minimum relevance score 0-1 (default: 0.3)"),
    max_results: z.number().optional().describe("Max results (default: 15)"),
    query_needs: z.array(z.string()).optional().describe("Ghost mode: describe what you need without a published card"),
    query_offers: z.array(z.string()).optional().describe("Ghost mode: describe what you offer without a published card"),
}, async (args) => {
    try {
        let result;
        // Ghost mode: search without a published card
        if (args.query_needs?.length || args.query_offers?.length) {
            result = await api("/api/matches/ghost", {
                method: "POST",
                body: JSON.stringify({
                    needs: (args.query_needs || []).map(d => ({ description: d })),
                    offers: (args.query_offers || []).map(d => ({ description: d })),
                    max: args.max_results || 15,
                }),
            });
        }
        else {
            // Normal mode: search against published card
            const params = new URLSearchParams();
            if (args.min_score)
                params.set("minScore", String(args.min_score));
            if (args.max_results)
                params.set("max", String(args.max_results));
            result = await api(`/api/matches/${agentId}?${params}`);
        }
        if (result.error)
            return { content: [{ type: "text", text: result.error }], isError: true };
        // Classify matches with confidence + surfacing metadata
        const classified = classifyMatches(result.matches || [], prefs.mode);
        // Record surfaced matches for cooldown tracking
        for (const m of classified.filter((c) => c.surfacing === "surface_now")) {
            recordSurfaced(m.agentId);
        }
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({
                        matchCount: result.matchCount,
                        totalPeople: result.totalCandidates,
                        matches: classified.map((m) => ({
                            matchId: m.matchId || `match_${m.agentId}`,
                            agentId: m.agentId,
                            name: sanitize(m.name),
                            score: m.score,
                            mutual: m.mutual,
                            confidence: m.confidence,
                            surfacing: m.surfacing,
                            needMatch: sanitize(m.needMatch),
                            offerMatch: sanitize(m.offerMatch),
                        })),
                    }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════
// Tool 3: get_digest
// ══════════════════════════════════════
server.tool("get_digest", "Check what's happening on the Mingle network for you. Returns pending intro requests, top matches, and card status. Call this at session start to surface anything important.", {}, async () => {
    try {
        const d = await api(`/api/digest/${agentId}`);
        if (d.error)
            return { content: [{ type: "text", text: d.error }], isError: true };
        // Classify matches with confidence + surfacing
        const classified = classifyMatches(d.matches || [], prefs.mode);
        const surfaceNow = classified.filter((m) => m.surfacing === "surface_now");
        const queued = classified.filter((m) => m.surfacing === "queue");
        // Record surfaced matches for cooldown
        for (const m of surfaceNow)
            recordSurfaced(m.agentId);
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({
                        summary: d.summary,
                        networkSize: d.networkSize,
                        hasCard: d.hasCard,
                        mode: prefs.mode,
                        matches: {
                            surfaceNow: surfaceNow.slice(0, 3).map((m) => ({
                                agentId: m.agentId,
                                name: sanitize(m.name),
                                score: m.score,
                                mutual: m.mutual,
                                confidence: m.confidence,
                                needMatch: sanitize(m.needMatch),
                                offerMatch: sanitize(m.offerMatch),
                            })),
                            queued: queued.length,
                            total: classified.length,
                        },
                        introsSent: (d.introsPending || []).length,
                        introsWaiting: (d.introsReceived || []).length,
                        introsDetail: (d.introsReceived || []).map((i) => ({
                            introId: i.introId || i.intro_id,
                            from: sanitize(i.requestedBy || i.requested_by),
                            message: sanitize(i.message),
                        })),
                        note: !d.hasCard ? "No card published. Use publish_intent_card or try ghost mode with search_matches." : undefined,
                    }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════
// Tool 4: request_intro
// ══════════════════════════════════════
server.tool("request_intro", "Reach out to someone you matched with on Mingle. Send a message explaining why you'd be a good connection. Nothing personal crosses until both sides say yes.", {
    match_id: z.string().describe("Match ID from search_matches"),
    to: z.string().describe("Agent ID of the person you want to meet"),
    message: z.string().describe("Short message explaining why this intro would be valuable"),
}, async (args) => {
    try {
        const introBody = {
            matchId: args.match_id,
            targetAgentId: args.to,
            message: args.message,
            fieldsToDisclose: ["needs", "offers"],
            agentId,
            publicKey: keys.publicKey,
        };
        introBody.signature = sign(canonicalize(introBody), keys.privateKey);
        const result = await api("/api/intros", {
            method: "POST",
            body: JSON.stringify(introBody),
        });
        if (result.error)
            return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({
                        introId: result.introId,
                        status: "pending",
                        to: args.to,
                        note: "Intro request sent. They'll see it in their digest.",
                    }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════
// Tool 5: respond_to_intro
// ══════════════════════════════════════
server.tool("respond_to_intro", "Respond to an introduction on Mingle. Someone's AI reached out because they think you'd be a good match. Approve to connect, decline to pass. No details shared unless both sides say yes.", {
    intro_id: z.string().describe("Intro ID from your digest"),
    approve: z.boolean().describe("true to approve, false to decline"),
    message: z.string().optional().describe("Optional response message"),
}, async (args) => {
    try {
        const respondBody = {
            verdict: args.approve ? "approve" : "decline",
            message: args.message,
            agentId,
            publicKey: keys.publicKey,
        };
        respondBody.signature = sign(canonicalize(respondBody), keys.privateKey);
        const result = await api(`/api/intros/${args.intro_id}`, {
            method: "PUT",
            body: JSON.stringify(respondBody),
        });
        if (result.error)
            return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({
                        introId: args.intro_id,
                        approved: args.approve,
                        note: args.approve ? "Connected. Both sides can now see each other's info." : "Declined.",
                    }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════
// Tool 6: remove_intent_card
// ══════════════════════════════════════
server.tool("remove_intent_card", "Remove your card from the Mingle network. Your identity and connection history are preserved. Publish a fresh card anytime.", {
    card_id: z.string().describe("Card ID to remove"),
}, async (args) => {
    try {
        const removeBody = {
            agentId,
            publicKey: keys.publicKey,
        };
        removeBody.signature = sign(canonicalize(removeBody), keys.privateKey);
        const result = await api(`/api/cards/${args.card_id}`, {
            method: "DELETE",
            body: JSON.stringify(removeBody),
        });
        clearCachedCard();
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({
                        removed: result.removed || false,
                        cardId: args.card_id,
                        error: result.error,
                    }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════
// Tool 7: rate_connection
// ══════════════════════════════════════
server.tool("rate_connection", "Rate a connection you made through Mingle. After an intro is approved and you've interacted with the person, let the network know how it went. This helps improve matching for everyone.", {
    intro_id: z.string().describe("Intro ID of the connection to rate"),
    rating: z.enum(["useful", "neutral", "not_useful"]).describe("How useful was this connection?"),
    comment: z.string().optional().describe("Optional: brief note on why"),
}, async (args) => {
    try {
        const result = await api(`/api/feedback/${args.intro_id}`, {
            method: "POST",
            body: JSON.stringify({
                rating: args.rating,
                comment: args.comment,
            }),
        });
        if (result.error)
            return { content: [{ type: "text", text: result.error }], isError: true };
        const digest = await fetchDigest();
        return {
            content: [{
                    type: "text",
                    text: withDigest({ rated: true, introId: args.intro_id, rating: args.rating }, digest),
                }],
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ══════════════════════════════════════════════════════════════
// Mingle v3 tools (publish + discover). Additive; the 7 tools above
// keep serving the live 48h IntentCard path unchanged.
// ══════════════════════════════════════════════════════════════
const evidenceSchema = z.object({
    claim: z.string().describe("The exact claim this evidence supports"),
    source: z.enum(["principal_statement", "artifact_link", "subject_binding", "third_party_attestation"]),
    method: z.string().describe("How it was checked, in plain words"),
    verified_fact: z.string().describe("Precisely what is verified now, no more"),
    date: z.string().describe("ISO date"),
}).strict();
const composeShape = {
    headline: z.string().describe("Headline in the principal's voice"),
    intents: z.array(z.enum(["meet", "collaborate", "team_up", "work", "advise", "mentor", "cofound"])).min(1),
    seeking: z.array(z.object({ description: z.string(), topics: z.array(z.string()).optional(), engagement: z.string().optional() })).optional(),
    offering: z.array(z.object({ description: z.string(), topics: z.array(z.string()).optional() })).optional(),
    preferences: z.array(z.object({ key: z.string(), value: z.string() })).optional().describe("Explicit self-declared values only, never inferred traits"),
    artifacts: z.array(evidenceSchema).optional(),
    event_ref: z.object({ event_id: z.string(), dates: z.string().optional() }).optional(),
    team_size_sought: z.number().int().min(1).max(100).optional(),
    visibility: z.record(z.enum(["private", "network", "intro_request", "mutual_intro", "thread_only"])).optional().describe("Per-field audience; unlisted content fields default to network"),
    ttl_days: z.number().int().min(1).max(60).optional().describe("Days until auto-expiry (default 21)"),
};
function argsToCard(cardType, a) {
    const build = {
        card_type: cardType, subject_key: keys.publicKey,
        headline: a.headline, intents: a.intents, seeking: a.seeking, offering: a.offering,
        preferences: a.preferences, artifacts: a.artifacts, event_ref: a.event_ref ?? null,
        team_size_sought: a.team_size_sought ?? null, visibility: a.visibility, skill_version: SKILL_VERSION,
        ttl_days: a.ttl_days,
    };
    return buildCard(build);
}
const COMPOSE_DESC = "Step 1 of publishing. Build the exact card the principal approves. Returns the full card content plus its sha256 approval token (card_hash) and a per-field visibility explanation. Nothing is published. Show the rendered card to the principal, then call the matching publish tool echoing card_hash back once they say yes.";
for (const cardType of ["connection", "opportunity"]) {
    server.tool(`compose_${cardType}_card`, COMPOSE_DESC, composeShape, async (a) => {
        const card = argsToCard(cardType, a);
        const card_hash = cardContentHash(card);
        return { content: [{ type: "text", text: JSON.stringify({
                        step: "preview",
                        card,
                        card_hash,
                        visibility_explained: explainVisibility(card),
                        note: `To publish, call publish_${cardType}_card with this exact card and approved_hash="${card_hash}". Any edit changes the hash and needs re-approval.`,
                    }, null, 2) }] };
    });
    server.tool(`publish_${cardType}_card`, `Step 2 of publishing. Publish the ${cardType} card the principal approved in compose_${cardType}_card. Requires the exact card object and the approved_hash returned by compose; a mismatch is refused so only approved content is published.`, { card: z.any().describe("The exact card object returned by compose"), approved_hash: z.string().describe("The card_hash the principal approved") }, async (a) => {
        try {
            const card = a.card;
            if (!card || card.card_type !== cardType)
                return { content: [{ type: "text", text: `card_type must be ${cardType}` }], isError: true };
            const recomputed = cardContentHash(card);
            if (recomputed !== a.approved_hash) {
                return { content: [{ type: "text", text: `Approval mismatch: the card content changed since it was approved (approved ${a.approved_hash}, now ${recomputed}). Re-run compose and re-approve.` }], isError: true };
            }
            const sealed = sealCard(card, keys.privateKey);
            const result = await api("/api/v3/cards", { method: "POST", body: JSON.stringify({ card: sealed }) });
            if (result.error)
                return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
            trackV3Card({ card_id: result.card_id, card_type: cardType, headline: card.headline, card_hash: recomputed, published_at: new Date().toISOString() });
            return { content: [{ type: "text", text: JSON.stringify({ published: true, card_id: result.card_id, card_hash: result.card_hash, expires_at: result.expires_at, revocation_status: result.revocation_status }, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
        }
    });
}
// ── search_cards: explicit fields plus semantic over published text ──────
server.tool("search_cards", "Search Mingle v3 cards by explicit fields (card_type, intents, topics, engagement, location, event_ref) and, when a query is given, semantic similarity over published card text. Returns network-visible fields only; private fields never appear. Relevance ordering for your own query is search, not a judgment of people.", {
    query: z.string().optional().describe("Free-text query for semantic ranking over published text"),
    card_type: z.enum(["connection", "opportunity"]).optional(),
    intents: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
    engagement: z.string().optional(),
    location: z.string().optional(),
    event_ref: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
}, async (a) => {
    try {
        const result = await api("/api/v3/cards/search", { method: "POST", body: JSON.stringify(a) });
        if (result.error)
            return { content: [{ type: "text", text: result.error }], isError: true };
        const results = (result.results || []).map((r) => ({
            card_id: r.card_id, card_type: r.card_type, revocation_status: r.revocation_status,
            headline: r.headline ? sanitize(r.headline) : undefined,
            intents: r.intents,
            seeking: (r.seeking || []).map((s) => ({ ...s, description: sanitize(s.description) })),
            offering: (r.offering || []).map((o) => ({ ...o, description: sanitize(o.description) })),
            event_ref: r.event_ref, team_size_sought: r.team_size_sought,
        }));
        return { content: [{ type: "text", text: JSON.stringify({ count: result.count, results }, null, 2) }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
    }
});
// ── Revocation verbs (spec invariant 7) ──────────────────────────────────
const V3_VERBS = [
    { tool: "withdraw_card", path: "withdraw", desc: "Withdraw a v3 card from the network. It stops appearing in search and its status shows withdrawn on any retained copy." },
    { tool: "supersede_claims", path: "supersede", desc: "Mark a v3 card superseded (its claims are replaced by a newer card). Status shows superseded." },
    { tool: "revoke_agent_authority", path: "revoke-authority", desc: "Revoke all future agent authority tied to a v3 card. The card leaves search and its status shows authority_revoked." },
    { tool: "delete_server_copy", path: "delete-server-copy", desc: "Ask the server to delete its stored copy of a v3 card. Content is blanked; status shows deleted. Counterparties may retain what they already received." },
    { tool: "stop_new_matches", path: "stop-new-matches", desc: "Stop new matches against a v3 card without withdrawing it. Status shows stopped_new_matches." },
];
for (const v of V3_VERBS) {
    server.tool(v.tool, v.desc, { card_id: z.string().describe("The v3 card_id to act on") }, async (a) => {
        try {
            const signature = sign(`${v.path}:${a.card_id}`, keys.privateKey);
            const result = await api(`/api/v3/cards/${a.card_id}/${v.path}`, { method: "POST", body: JSON.stringify({ public_key: keys.publicKey, signature }) });
            if (result.error)
                return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
            return { content: [{ type: "text", text: JSON.stringify({ card_id: a.card_id, revocation_status: result.revocation_status }, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Network error: ${e.message}` }], isError: true };
        }
    });
}
// P2: request_counterparty_deletion is a separate phase. Stubbed so the verb
// set is discoverable but does not silently pretend to act.
server.tool("request_counterparty_deletion", "Ask counterparties who received your card to delete their copy. Phase 2 feature; not yet active. Counterparties may retain what they already received.", { card_id: z.string() }, async (a) => ({ content: [{ type: "text", text: JSON.stringify({ card_id: a.card_id, status: "not_available_p1", note: "request_counterparty_deletion ships in Mingle P2. In P1, delete_server_copy removes the server copy; retained counterparty copies are outside protocol reach." }, null, 2) }] }));
// ── get_card_status: v3 status for the principal's tracked cards ──────────
server.tool("get_card_status", "Show the current server status of the v3 cards you have published (adapts the digest to v3 card types). Reads each tracked card_id and reports its revocation_status and expiry.", {}, async () => {
    const tracked = listV3Cards();
    const rows = [];
    for (const t of tracked.slice(0, 20)) {
        try {
            const r = await api(`/api/v3/cards/${t.card_id}`);
            rows.push({ card_id: t.card_id, card_type: t.card_type, headline: sanitize(t.headline), revocation_status: r.revocation_status ?? "unknown", expires_at: r.expires_at ?? null });
        }
        catch {
            rows.push({ card_id: t.card_id, card_type: t.card_type, headline: sanitize(t.headline), revocation_status: "unreachable", expires_at: null });
        }
    }
    return { content: [{ type: "text", text: JSON.stringify({ v3_cards: rows.length, cards: rows }, null, 2) }] };
});
// ══════════════════════════════════════
// Start
// ══════════════════════════════════════
const transport = new StdioServerTransport();
server.connect(transport);

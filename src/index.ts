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

const API = process.env.MINGLE_API_URL || "https://api.aeoess.com";

// Persistent identity — loaded from ~/.mingle/identity.json
const identity = loadIdentity();
const prefs = loadPreferences();
const keys = { publicKey: identity.publicKey, privateKey: identity.privateKey };
let agentId = identity.principalId;

// Sanitize content from other agents before feeding into LLM context
function sanitize(text: string | undefined): string {
  if (!text) return "";
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
async function fetchDigest(): Promise<any> {
  try {
    const d = await fetch(`${API}/api/digest/${agentId}`, {
      headers: { "X-Agent-Id": agentId, "X-Public-Key": keys.publicKey },
    }).then(r => r.json());

    const rawMatches = d.matches || [];
    const classified = classifyMatches(rawMatches, prefs.mode);
    const surfaceNow = classified.filter((m: any) => m.surfacing === "surface_now");
    const queued = classified.filter((m: any) => m.surfacing === "queue");

    return {
      pendingIntros: (d.introsReceived || []).length,
      introsReceived: (d.introsReceived || []).map((i: any) => ({
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
  } catch {
    return { pendingIntros: 0, matches: { total: 0, surfaceNow: 0, queued: 0, topMatch: null }, networkSize: 0, cardStatus: "unknown", lastChecked: new Date().toISOString() };
  }
}

// Inject _digest into any tool result text
function withDigest(resultObj: any, digest: any): string {
  return JSON.stringify({ ...resultObj, _digest: digest }, null, 2);
}

async function api(path: string, opts?: RequestInit): Promise<any> {
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

server.tool(
  "publish_intent_card",
  "Publish your profile to the Mingle network — what you're looking for and what you can offer. Cards are Ed25519 signed with your persistent identity and expire after 48h. Returns your top matches immediately.",
  {
    name: z.string().describe("Your name or alias"),
    topic: z.string().optional().describe("What you're working on (short summary)"),
    needs: z.array(z.string()).optional().describe("What you're looking for (plain text list)"),
    offers: z.array(z.string()).optional().describe("What you can provide (plain text list)"),
    context: z.string().optional().describe("Rich context for better matching (private — never shown to others)"),
    open_to: z.array(z.string()).optional().describe("Open to (e.g. 'introductions', 'partnerships')"),
    hours: z.number().default(48).describe("Hours until card expires (default 48)"),
  },
  async (args) => {
    const MAX_FIELD_LEN = 200;
    const MAX_ITEMS = 5;
    if (args.name.length > 100) return { content: [{ type: "text" as const, text: "Name too long (max 100 chars)" }], isError: true };
    if ((args.needs?.length || 0) > MAX_ITEMS) return { content: [{ type: "text" as const, text: `Too many needs (max ${MAX_ITEMS})` }], isError: true };
    if ((args.offers?.length || 0) > MAX_ITEMS) return { content: [{ type: "text" as const, text: `Too many offers (max ${MAX_ITEMS})` }], isError: true };
    for (const item of [...(args.needs || []), ...(args.offers || [])]) {
      if (item.length > MAX_FIELD_LEN) return { content: [{ type: "text" as const, text: `Item too long (max ${MAX_FIELD_LEN} chars)` }], isError: true };
    }
    if (args.context && args.context.length > 1000) return { content: [{ type: "text" as const, text: "Context too long (max 1000 chars)" }], isError: true };

    // Build card manually (not via createIntentCard) so signature covers all fields
    const card: Record<string, any> = {
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
      if (result.error) return { content: [{ type: "text" as const, text: `Failed: ${result.error}` }], isError: true };

      // Cache card locally for offline resilience
      cacheCard({ cardId: result.cardId, topic: args.topic, needs: args.needs, offers: args.offers, expiresAt: result.expiresAt });

      const digest = await fetchDigest();

      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            published: true,
            cardId: result.cardId,
            name: args.name,
            topic: args.topic,
            needs: (args.needs || []).length,
            offers: (args.offers || []).length,
            expiresAt: result.expiresAt,
            networkSize: result.networkSize,
            topMatches: classifyMatches(result.topMatches || [], prefs.mode).slice(0, 3).map((m: any) => ({
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
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Tool 2: search_matches
// ══════════════════════════════════════

server.tool(
  "search_matches",
  "Find people relevant to you on the Mingle network. Works even without a published card (ghost mode): provide what you're looking for and browse anonymously. Returns ranked matches based on semantic similarity between needs and offers.",
  {
    min_score: z.number().optional().describe("Minimum relevance score 0-1 (default: 0.3)"),
    max_results: z.number().optional().describe("Max results (default: 15)"),
    query_needs: z.array(z.string()).optional().describe("Ghost mode: describe what you need without a published card"),
    query_offers: z.array(z.string()).optional().describe("Ghost mode: describe what you offer without a published card"),
  },
  async (args) => {
    try {
      let result: any;

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
      } else {
        // Normal mode: search against published card
        const params = new URLSearchParams();
        if (args.min_score) params.set("minScore", String(args.min_score));
        if (args.max_results) params.set("max", String(args.max_results));
        result = await api(`/api/matches/${agentId}?${params}`);
      }

      if (result.error) return { content: [{ type: "text" as const, text: result.error }], isError: true };

      // Classify matches with confidence + surfacing metadata
      const classified = classifyMatches(result.matches || [], prefs.mode);

      // Record surfaced matches for cooldown tracking
      for (const m of classified.filter((c: any) => c.surfacing === "surface_now")) {
        recordSurfaced(m.agentId);
      }

      const digest = await fetchDigest();
      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            matchCount: result.matchCount,
            totalPeople: result.totalCandidates,
            matches: classified.map((m: any) => ({
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
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Tool 3: get_digest
// ══════════════════════════════════════

server.tool(
  "get_digest",
  "Check what's happening on the Mingle network for you. Returns pending intro requests, top matches, and card status. Call this at session start to surface anything important.",
  {},
  async () => {
    try {
      const d = await api(`/api/digest/${agentId}`);
      if (d.error) return { content: [{ type: "text" as const, text: d.error }], isError: true };

      // Classify matches with confidence + surfacing
      const classified = classifyMatches(d.matches || [], prefs.mode);
      const surfaceNow = classified.filter((m: any) => m.surfacing === "surface_now");
      const queued = classified.filter((m: any) => m.surfacing === "queue");

      // Record surfaced matches for cooldown
      for (const m of surfaceNow) recordSurfaced(m.agentId);

      const digest = await fetchDigest();

      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            summary: d.summary,
            networkSize: d.networkSize,
            hasCard: d.hasCard,
            mode: prefs.mode,
            matches: {
              surfaceNow: surfaceNow.slice(0, 3).map((m: any) => ({
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
            introsDetail: (d.introsReceived || []).map((i: any) => ({
              introId: i.introId || i.intro_id,
              from: sanitize(i.requestedBy || i.requested_by),
              message: sanitize(i.message),
            })),
            note: !d.hasCard ? "No card published. Use publish_intent_card or try ghost mode with search_matches." : undefined,
          }, digest),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Tool 4: request_intro
// ══════════════════════════════════════

server.tool(
  "request_intro",
  "Reach out to someone you matched with on Mingle. Send a message explaining why you'd be a good connection. Nothing personal crosses until both sides say yes.",
  {
    match_id: z.string().describe("Match ID from search_matches"),
    to: z.string().describe("Agent ID of the person you want to meet"),
    message: z.string().describe("Short message explaining why this intro would be valuable"),
  },
  async (args) => {
    try {
      const introBody: Record<string, any> = {
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

      if (result.error) return { content: [{ type: "text" as const, text: `Failed: ${result.error}` }], isError: true };

      const digest = await fetchDigest();
      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            introId: result.introId,
            status: "pending",
            to: args.to,
            note: "Intro request sent. They'll see it in their digest.",
          }, digest),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Tool 5: respond_to_intro
// ══════════════════════════════════════

server.tool(
  "respond_to_intro",
  "Respond to an introduction on Mingle. Someone's AI reached out because they think you'd be a good match. Approve to connect, decline to pass. No details shared unless both sides say yes.",
  {
    intro_id: z.string().describe("Intro ID from your digest"),
    approve: z.boolean().describe("true to approve, false to decline"),
    message: z.string().optional().describe("Optional response message"),
  },
  async (args) => {
    try {
      const respondBody: Record<string, any> = {
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

      if (result.error) return { content: [{ type: "text" as const, text: `Failed: ${result.error}` }], isError: true };

      const digest = await fetchDigest();
      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            introId: args.intro_id,
            approved: args.approve,
            note: args.approve ? "Connected. Both sides can now see each other's info." : "Declined.",
          }, digest),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Tool 6: remove_intent_card
// ══════════════════════════════════════

server.tool(
  "remove_intent_card",
  "Remove your card from the Mingle network. Your identity and connection history are preserved. Publish a fresh card anytime.",
  {
    card_id: z.string().describe("Card ID to remove"),
  },
  async (args) => {
    try {
      const removeBody: Record<string, any> = {
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
          type: "text" as const,
          text: withDigest({
            removed: result.removed || false,
            cardId: args.card_id,
            error: result.error,
          }, digest),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Tool 7: rate_connection
// ══════════════════════════════════════

server.tool(
  "rate_connection",
  "Rate a connection you made through Mingle. After an intro is approved and you've interacted with the person, let the network know how it went. This helps improve matching for everyone.",
  {
    intro_id: z.string().describe("Intro ID of the connection to rate"),
    rating: z.enum(["useful", "neutral", "not_useful"]).describe("How useful was this connection?"),
    comment: z.string().optional().describe("Optional: brief note on why"),
  },
  async (args) => {
    try {
      const result = await api(`/api/feedback/${args.intro_id}`, {
        method: "POST",
        body: JSON.stringify({
          rating: args.rating,
          comment: args.comment,
        }),
      });
      if (result.error) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      const digest = await fetchDigest();
      return {
        content: [{
          type: "text" as const,
          text: withDigest({ rated: true, introId: args.intro_id, rating: args.rating }, digest),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Network error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════
// Start
// ══════════════════════════════════════

const transport = new StdioServerTransport();
server.connect(transport);

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
import { loadIdentity, cacheCard, clearCachedCard } from "./identity.js";

const API = process.env.MINGLE_API_URL || "https://api.aeoess.com";

// Persistent identity — loaded from ~/.mingle/identity.json
const identity = loadIdentity();
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
    return {
      pendingIntros: (d.introsReceived || []).length,
      highConfidenceMatches: (d.matches || []).length,
      networkSize: d.networkSize || 0,
      cardStatus: d.hasCard ? "active" : "none",
      cardExpiresIn: null, // TODO: compute from card TTL
      lastChecked: new Date().toISOString(),
    };
  } catch {
    return { pendingIntros: 0, highConfidenceMatches: 0, networkSize: 0, cardStatus: "unknown", lastChecked: new Date().toISOString() };
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
  "Publish what you need and offer to the Mingle network. Accepts plain text needs/offers. Cards are Ed25519 signed with your persistent identity.",
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
            topMatches: [],
            matchingVersion: "pending-1b",
            note: "Card published. Semantic matching coming in next update.",
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
  "Find people relevant to you on the Mingle network. Returns ranked matches based on how well your needs align with their offers and vice versa.",
  {
    min_score: z.number().optional().describe("Minimum relevance score (default: 0)"),
    max_results: z.number().optional().describe("Max results (default: 10)"),
  },
  async (args) => {
    try {
      const params = new URLSearchParams();
      if (args.min_score) params.set("minScore", String(args.min_score));
      if (args.max_results) params.set("max", String(args.max_results));
      const result = await api(`/api/matches/${agentId}?${params}`);

      if (result.error) return { content: [{ type: "text" as const, text: result.error }], isError: true };

      const digest = await fetchDigest();
      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            matchCount: result.matchCount,
            totalPeople: result.totalCandidates,
            matches: (result.matches || []).map((m: any) => ({
              matchId: m.matchId,
              person: m.agentA === agentId ? m.agentB : m.agentA,
              score: m.score,
              mutual: m.mutual,
              explanation: sanitize(m.explanation),
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
  "What matters to you right now? Returns your top matches, pending intros you've sent, and incoming intro requests. One call, everything relevant.",
  {},
  async () => {
    try {
      const d = await api(`/api/digest/${agentId}`);
      if (d.error) return { content: [{ type: "text" as const, text: d.error }], isError: true };

      return {
        content: [{
          type: "text" as const,
          text: withDigest({
            summary: d.summary,
            networkSize: d.networkSize,
            hasCard: d.hasCard,
            matches: (d.matches || []).slice(0, 5).map((m: any) => ({
              person: m.agentA === agentId ? m.agentB : m.agentA,
              score: m.score,
              explanation: sanitize(m.explanation),
            })),
            introsSent: (d.introsPending || []).length,
            introsWaiting: (d.introsReceived || []).length,
            introsDetail: (d.introsReceived || []).map((i: any) => ({
              introId: i.introId,
              from: i.requestedBy,
              message: sanitize(i.message),
            })),
            note: !d.hasCard ? "No card published yet. Use publish_intent_card to join the network." : undefined,
          }, {
            pendingIntros: (d.introsReceived || []).length,
            highConfidenceMatches: (d.matches || []).length,
            networkSize: d.networkSize || 0,
            cardStatus: d.hasCard ? "active" : "none",
            cardExpiresIn: null,
            lastChecked: new Date().toISOString(),
          }),
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
  "Propose an introduction to someone you matched with. They'll see your message and can approve or decline. Nothing happens without both sides saying yes.",
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
  "Respond to an introduction request. Approve to connect, or decline. Your choice.",
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
  "Remove your card from the network. Use when your situation changed. Publish a new one when ready.",
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
// Start
// ══════════════════════════════════════

const transport = new StdioServerTransport();
server.connect(transport);

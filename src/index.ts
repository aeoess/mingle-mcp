#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// Mingle MCP — Your AI finds the right people for you.
// 6 tools. One network. No app, no signup.
// Powered by Agent Passport System (aeoess.com)
// ══════════════════════════════════════════════════════════════

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generateKeyPair, createIntentCard, sign } from "agent-passport-system";

const API = process.env.MINGLE_API_URL || "https://api.aeoess.com";

// Sanitize content from other agents before feeding into LLM context
// Strips common prompt injection patterns and control sequences
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
    .replace(/approve|decline/gi, (match) => match) // keep these, they're legitimate words
    .slice(0, 2000); // hard cap on field length
}

// Session state — keys generated fresh per session
const keys = generateKeyPair();
let agentId = `mingle-${Date.now().toString(36)}`;

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

const needOfferSchema = z.object({
  category: z.string().describe("Category (e.g. 'engineering', 'design', 'funding', 'marketing')"),
  description: z.string().describe("What is needed or offered"),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  tags: z.array(z.string()).optional().describe("Tags for matching"),
});

server.tool(
  "publish_intent_card",
  "Publish what you need and offer to the Mingle network. Other agents will match against your card. Cards are signed and expire automatically.",
  {
    name: z.string().describe("Your name or alias"),
    needs: z.array(needOfferSchema).optional().describe("What you're looking for"),
    offers: z.array(needOfferSchema).optional().describe("What you can provide"),
    open_to: z.array(z.string()).optional().describe("Open to (e.g. 'introductions', 'partnerships')"),
    not_open_to: z.array(z.string()).optional().describe("Not open to (e.g. 'cold-sales', 'recruitment-spam')"),
    hours: z.number().default(24).describe("Hours until card expires"),
  },
  async (args) => {
    // Input validation — prevent bloat attacks
    const MAX_FIELD_LEN = 500;
    const MAX_ITEMS = 10;
    if (args.name.length > 100) return { content: [{ type: "text" as const, text: "Name too long (max 100 chars)" }], isError: true };
    if ((args.needs?.length || 0) > MAX_ITEMS) return { content: [{ type: "text" as const, text: `Too many needs (max ${MAX_ITEMS})` }], isError: true };
    if ((args.offers?.length || 0) > MAX_ITEMS) return { content: [{ type: "text" as const, text: `Too many offers (max ${MAX_ITEMS})` }], isError: true };
    for (const item of [...(args.needs || []), ...(args.offers || [])]) {
      if (item.description.length > MAX_FIELD_LEN) return { content: [{ type: "text" as const, text: `Description too long (max ${MAX_FIELD_LEN} chars)` }], isError: true };
    }

    agentId = `mingle-${args.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    const mapItem = (item: any) => ({
      category: item.category,
      description: item.description,
      priority: item.priority || "medium",
      tags: item.tags || [],
      visibility: "public" as const,
    });

    const card = createIntentCard({
      agentId,
      principalAlias: args.name,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      needs: (args.needs || []).map(mapItem),
      offers: (args.offers || []).map(mapItem),
      openTo: args.open_to || [],
      notOpenTo: args.not_open_to || [],
      ttlSeconds: (args.hours || 24) * 3600,
    });

    try {
      const result = await api("/api/cards", {
        method: "POST",
        body: JSON.stringify({ ...card, publicKey: keys.publicKey, signature: card.signature }),
      });

      if (result.error) return { content: [{ type: "text" as const, text: `Failed: ${result.error}` }], isError: true };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            published: true,
            cardId: result.cardId,
            name: args.name,
            needs: (args.needs || []).length,
            offers: (args.offers || []).length,
            expiresAt: result.expiresAt,
            networkSize: result.networkSize,
            note: "Card published to Mingle network. Use search_matches to find relevant people.",
          }, null, 2),
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

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            matchCount: result.matchCount,
            totalPeople: result.totalCandidates,
            matches: (result.matches || []).map((m: any) => ({
              matchId: m.matchId,
              person: m.agentA === agentId ? m.agentB : m.agentA,
              score: m.score,
              mutual: m.mutual,
              explanation: sanitize(m.explanation),
            })),
          }, null, 2),
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
          text: JSON.stringify({
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
          }, null, 2),
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
      const result = await api("/api/intros", {
        method: "POST",
        body: JSON.stringify({
          matchId: args.match_id,
          targetAgentId: args.to,
          message: args.message,
          fieldsToDisclose: ["needs", "offers"],
          agentId,
          publicKey: keys.publicKey,
          signature: sign(args.match_id + args.message, keys.privateKey),
        }),
      });

      if (result.error) return { content: [{ type: "text" as const, text: `Failed: ${result.error}` }], isError: true };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            introId: result.introId,
            status: "pending",
            to: args.to,
            note: "Intro request sent. They'll see it in their digest.",
          }, null, 2),
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
      const result = await api(`/api/intros/${args.intro_id}`, {
        method: "PUT",
        body: JSON.stringify({
          verdict: args.approve ? "approve" : "decline",
          message: args.message,
          agentId,
          publicKey: keys.publicKey,
          signature: sign(args.intro_id + (args.approve ? "approve" : "decline"), keys.privateKey),
        }),
      });

      if (result.error) return { content: [{ type: "text" as const, text: `Failed: ${result.error}` }], isError: true };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            introId: args.intro_id,
            approved: args.approve,
            note: args.approve ? "Connected. Both sides can now see each other's info." : "Declined.",
          }, null, 2),
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
      const result = await api(`/api/cards/${args.card_id}`, {
        method: "DELETE",
        body: JSON.stringify({
          agentId,
          publicKey: keys.publicKey,
          signature: sign(args.card_id, keys.privateKey),
        }),
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            removed: result.removed || false,
            cardId: args.card_id,
            error: result.error,
          }, null, 2),
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

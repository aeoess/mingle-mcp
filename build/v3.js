// ══════════════════════════════════════════════════════════════
// Mingle v3 (client) — card build, canonical hash, exact-hash approval
// ══════════════════════════════════════════════════════════════
// The exact-content approval flow (spec invariant 4): compose returns the
// canonical serialized card plus its sha256 approval token; publish requires
// that hash echoed back, then this key signs both the content hash and the
// card, and the server re-verifies both bindings. The hash construction here
// mirrors the server's cardContentHash exactly (strip signature, approval,
// revocation_status, then canonicalize).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { canonicalize, sign } from "agent-passport-system";
const MINGLE_DIR = join(homedir(), ".mingle");
const V3_CARDS_PATH = join(MINGLE_DIR, "v3-cards.json");
export const DEFAULT_TTL_DAYS = 21;
/** Build the card object minus approval and signature, with timestamps fixed
 *  now so compose and publish agree on the exact bytes. */
export function buildCard(args) {
    const now = Date.now();
    const ttl = (args.ttl_days ?? DEFAULT_TTL_DAYS) * 24 * 3600 * 1000;
    return {
        card_type: args.card_type,
        subject_key: args.subject_key,
        version: 1,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + ttl).toISOString(),
        headline: args.headline,
        intents: args.intents,
        seeking: (args.seeking ?? []).map(s => ({ description: s.description, ...(s.topics ? { topics: s.topics } : {}), ...(s.engagement ? { engagement: s.engagement } : {}) })),
        offering: (args.offering ?? []).map(o => ({ description: o.description, ...(o.topics ? { topics: o.topics } : {}), provenance: "principal_statement" })),
        preferences: args.preferences ?? [],
        artifacts: args.artifacts ?? [],
        event_ref: args.event_ref ?? null,
        team_size_sought: args.team_size_sought ?? null,
        visibility: args.visibility ?? {},
        composition: { agent_assisted: true, skill_version: args.skill_version },
        delegation_ref: args.delegation_ref ?? null,
        revocation_status: "active",
    };
}
export function cardContentHash(card) {
    const { signature, approval, revocation_status, ...content } = card;
    return createHash("sha256").update(canonicalize(content), "utf8").digest("hex");
}
/** Attach the approval (bound to the exact content hash) and the card
 *  signature, both by the principal's key. */
export function sealCard(card, privateKey) {
    const card_hash = cardContentHash(card);
    const sealed = {
        ...card,
        approval: { card_hash, approved_at: new Date().toISOString(), principal_signature: sign(card_hash, privateKey) },
    };
    const { signature, ...unsigned } = sealed;
    sealed.signature = sign(canonicalize(unsigned), privateKey);
    return sealed;
}
// ── Per-field visibility explanation for the approval step ────────────────
const VISIBILITY_MEANING = {
    private: "only you; never leaves your device in search",
    network: "visible in search results to anyone on the network",
    intro_request: "shared only inside an intro request you approve",
    mutual_intro: "shared only after both sides accept an intro",
    thread_only: "shared only inside an approved message thread",
};
export function explainVisibility(card) {
    const out = {};
    const fields = ["headline", "intents", "seeking", "offering", "preferences", "artifacts", "event_ref", "team_size_sought"];
    for (const f of fields) {
        if (card[f] == null || (Array.isArray(card[f]) && card[f].length === 0))
            continue;
        const level = card.visibility?.[f] ?? "network";
        out[f] = `${level}: ${VISIBILITY_MEANING[level] ?? "network"}`;
    }
    return out;
}
export function trackV3Card(entry) {
    if (!existsSync(MINGLE_DIR))
        mkdirSync(MINGLE_DIR, { recursive: true });
    const list = listV3Cards();
    list.unshift(entry);
    writeFileSync(V3_CARDS_PATH, JSON.stringify(list.slice(0, 50), null, 2));
}
export function listV3Cards() {
    if (!existsSync(V3_CARDS_PATH))
        return [];
    try {
        return JSON.parse(readFileSync(V3_CARDS_PATH, "utf-8"));
    }
    catch {
        return [];
    }
}

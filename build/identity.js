// ══════════════════════════════════════════════════════════════
// Mingle MCP — Identity Manager
// Persistent APS-compatible Ed25519 keypair stored in ~/.mingle/
// ══════════════════════════════════════════════════════════════
import { generateKeyPair } from "agent-passport-system";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
const MINGLE_DIR = join(homedir(), ".mingle");
const IDENTITY_PATH = join(MINGLE_DIR, "identity.json");
const LAST_CARD_PATH = join(MINGLE_DIR, "last-card.json");
const PREFS_PATH = join(MINGLE_DIR, "preferences.json");
function ensureDir() {
    if (!existsSync(MINGLE_DIR)) {
        mkdirSync(MINGLE_DIR, { recursive: true });
    }
}
/**
 * Load or create persistent identity.
 * Generated once at first run, reused forever.
 */
export function loadIdentity() {
    ensureDir();
    if (existsSync(IDENTITY_PATH)) {
        const raw = readFileSync(IDENTITY_PATH, "utf-8");
        const identity = JSON.parse(raw);
        // Derive agentId from publicKey for consistency
        identity.principalId = identity.principalId || `mingle-${identity.publicKey.slice(0, 12)}`;
        return identity;
    }
    // First run: generate new persistent identity
    const kp = generateKeyPair();
    const identity = {
        principalId: `mingle-${kp.publicKey.slice(0, 12)}`,
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        registeredAt: new Date().toISOString(),
    };
    writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2));
    return identity;
}
/**
 * Cache last successful card for offline resilience.
 */
export function cacheCard(card) {
    ensureDir();
    writeFileSync(LAST_CARD_PATH, JSON.stringify(card, null, 2));
}
export function getCachedCard() {
    if (existsSync(LAST_CARD_PATH)) {
        try {
            return JSON.parse(readFileSync(LAST_CARD_PATH, "utf-8"));
        }
        catch {
            return null;
        }
    }
    return null;
}
export function clearCachedCard() {
    if (existsSync(LAST_CARD_PATH)) {
        writeFileSync(LAST_CARD_PATH, "{}");
    }
}
const DEFAULT_PREFS = {
    mode: "balanced",
    privacyLevel: "standard",
    maxFacets: 3,
};
export function loadPreferences() {
    ensureDir();
    if (existsSync(PREFS_PATH)) {
        try {
            return { ...DEFAULT_PREFS, ...JSON.parse(readFileSync(PREFS_PATH, "utf-8")) };
        }
        catch {
            return DEFAULT_PREFS;
        }
    }
    return DEFAULT_PREFS;
}
export { MINGLE_DIR, IDENTITY_PATH };
// ══════════════════════════════════════
// Phase 3: Cooldown Tracking
// Don't suggest the same person twice within 48h
// ══════════════════════════════════════
const COOLDOWNS_PATH = join(MINGLE_DIR, "cooldowns.json");
const COOLDOWN_HOURS = 48;
function loadCooldowns() {
    ensureDir();
    if (existsSync(COOLDOWNS_PATH)) {
        try {
            return JSON.parse(readFileSync(COOLDOWNS_PATH, "utf-8"));
        }
        catch {
            return {};
        }
    }
    return {};
}
function saveCooldowns(map) {
    ensureDir();
    writeFileSync(COOLDOWNS_PATH, JSON.stringify(map, null, 2));
}
/** Record that a match was surfaced to the user. */
export function recordSurfaced(agentId) {
    const map = loadCooldowns();
    map[agentId] = new Date().toISOString();
    // Prune expired cooldowns
    const cutoff = Date.now() - COOLDOWN_HOURS * 3600 * 1000;
    for (const [k, v] of Object.entries(map)) {
        if (new Date(v).getTime() < cutoff)
            delete map[k];
    }
    saveCooldowns(map);
}
/** Check if a match is in cooldown (was surfaced recently). */
export function isInCooldown(agentId) {
    const map = loadCooldowns();
    const ts = map[agentId];
    if (!ts)
        return false;
    return Date.now() - new Date(ts).getTime() < COOLDOWN_HOURS * 3600 * 1000;
}
/** Filter matches through cooldown, classify confidence, add surfacing metadata. */
export function classifyMatches(matches, mode) {
    return matches.map(m => {
        const cooled = isInCooldown(m.agentId);
        const score = m.score || 0;
        const mutual = m.mutual || false;
        // Classify confidence
        let confidence;
        if (score >= 0.7 || (score >= 0.6 && mutual))
            confidence = "high";
        else if (score >= 0.45 || (score >= 0.35 && mutual))
            confidence = "medium";
        else
            confidence = "low";
        // Determine surfacing action based on mode + confidence + cooldown
        let surfacing;
        if (cooled) {
            surfacing = "silent";
        }
        else if (mode === "quiet") {
            surfacing = confidence === "high" ? "queue" : "silent";
        }
        else if (mode === "balanced") {
            surfacing = confidence === "high" ? "surface_now" : confidence === "medium" ? "queue" : "silent";
        }
        else { // active
            surfacing = confidence === "low" ? "queue" : "surface_now";
        }
        return { ...m, confidence, surfacing, inCooldown: cooled };
    });
}

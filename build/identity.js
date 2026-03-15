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

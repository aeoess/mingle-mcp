// ══════════════════════════════════════════════════════════════
// Mingle MCP — Identity Manager
// Persistent APS-compatible Ed25519 keypair stored in ~/.mingle/
// ══════════════════════════════════════════════════════════════

import { generateKeyPair } from "agent-passport-system";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface MingleIdentity {
  principalId: string;
  publicKey: string;
  privateKey: string;
  registeredAt: string;
}

const MINGLE_DIR = join(homedir(), ".mingle");
const IDENTITY_PATH = join(MINGLE_DIR, "identity.json");
const LAST_CARD_PATH = join(MINGLE_DIR, "last-card.json");
const PREFS_PATH = join(MINGLE_DIR, "preferences.json");

function ensureDir(): void {
  if (!existsSync(MINGLE_DIR)) {
    mkdirSync(MINGLE_DIR, { recursive: true });
  }
}

/**
 * Load or create persistent identity.
 * Generated once at first run, reused forever.
 */
export function loadIdentity(): MingleIdentity {
  ensureDir();

  if (existsSync(IDENTITY_PATH)) {
    const raw = readFileSync(IDENTITY_PATH, "utf-8");
    const identity = JSON.parse(raw) as MingleIdentity;
    // Derive agentId from publicKey for consistency
    identity.principalId = identity.principalId || `mingle-${identity.publicKey.slice(0, 12)}`;
    return identity;
  }

  // First run: generate new persistent identity
  const kp = generateKeyPair();
  const identity: MingleIdentity = {
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
export function cacheCard(card: any): void {
  ensureDir();
  writeFileSync(LAST_CARD_PATH, JSON.stringify(card, null, 2));
}

export function getCachedCard(): any | null {
  if (existsSync(LAST_CARD_PATH)) {
    try {
      return JSON.parse(readFileSync(LAST_CARD_PATH, "utf-8"));
    } catch { return null; }
  }
  return null;
}

export function clearCachedCard(): void {
  if (existsSync(LAST_CARD_PATH)) {
    writeFileSync(LAST_CARD_PATH, "{}");
  }
}

/**
 * User preferences (notification mode, privacy level).
 */
export interface MinglePreferences {
  mode: "quiet" | "balanced" | "active";
  privacyLevel: "minimal" | "standard" | "expanded";
  maxFacets: number;
}

const DEFAULT_PREFS: MinglePreferences = {
  mode: "balanced",
  privacyLevel: "standard",
  maxFacets: 3,
};

export function loadPreferences(): MinglePreferences {
  ensureDir();
  if (existsSync(PREFS_PATH)) {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(readFileSync(PREFS_PATH, "utf-8")) };
    } catch { return DEFAULT_PREFS; }
  }
  return DEFAULT_PREFS;
}

export { MINGLE_DIR, IDENTITY_PATH };

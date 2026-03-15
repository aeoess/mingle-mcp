export interface MingleIdentity {
    principalId: string;
    publicKey: string;
    privateKey: string;
    registeredAt: string;
}
declare const MINGLE_DIR: string;
declare const IDENTITY_PATH: string;
/**
 * Load or create persistent identity.
 * Generated once at first run, reused forever.
 */
export declare function loadIdentity(): MingleIdentity;
/**
 * Cache last successful card for offline resilience.
 */
export declare function cacheCard(card: any): void;
export declare function getCachedCard(): any | null;
export declare function clearCachedCard(): void;
/**
 * User preferences (notification mode, privacy level).
 */
export interface MinglePreferences {
    mode: "quiet" | "balanced" | "active";
    privacyLevel: "minimal" | "standard" | "expanded";
    maxFacets: number;
}
export declare function loadPreferences(): MinglePreferences;
export { MINGLE_DIR, IDENTITY_PATH };
/** Record that a match was surfaced to the user. */
export declare function recordSurfaced(agentId: string): void;
/** Check if a match is in cooldown (was surfaced recently). */
export declare function isInCooldown(agentId: string): boolean;
/** Filter matches through cooldown, classify confidence, add surfacing metadata. */
export declare function classifyMatches(matches: any[], mode: "quiet" | "balanced" | "active"): any[];

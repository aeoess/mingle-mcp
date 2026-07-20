export declare const DEFAULT_TTL_DAYS = 21;
export interface EvidenceRecord {
    claim: string;
    source: "principal_statement" | "artifact_link" | "subject_binding" | "third_party_attestation";
    method: string;
    verified_fact: string;
    date: string;
}
export interface BuildCardArgs {
    card_type: "connection" | "opportunity";
    subject_key: string;
    headline: string;
    intents: string[];
    seeking?: {
        description: string;
        topics?: string[];
        engagement?: string;
    }[];
    offering?: {
        description: string;
        topics?: string[];
    }[];
    preferences?: {
        key: string;
        value: string;
    }[];
    artifacts?: EvidenceRecord[];
    event_ref?: {
        event_id: string;
        dates?: string;
    } | null;
    team_size_sought?: number | null;
    visibility?: Record<string, string>;
    skill_version: string;
    delegation_ref?: string | null;
    ttl_days?: number;
}
/** Build the card object minus approval and signature, with timestamps fixed
 *  now so compose and publish agree on the exact bytes. */
export declare function buildCard(args: BuildCardArgs): Record<string, any>;
export declare function cardContentHash(card: Record<string, any>): string;
/** Attach the approval (bound to the exact content hash) and the card
 *  signature, both by the principal's key. */
export declare function sealCard(card: Record<string, any>, privateKey: string): Record<string, any>;
export declare function explainVisibility(card: Record<string, any>): Record<string, string>;
interface TrackedCard {
    card_id: string;
    card_type: string;
    headline: string;
    card_hash: string;
    published_at: string;
}
export declare function trackV3Card(entry: TrackedCard): void;
export declare function listV3Cards(): TrackedCard[];
export {};

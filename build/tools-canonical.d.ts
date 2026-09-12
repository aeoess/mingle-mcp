/** What the tools need from the host module. Passed in rather than imported, so this
 *  module holds no global state and a test can drive it with a fake transport. */
export interface ToolContext {
    api: (path: string, opts?: RequestInit, timeoutMs?: number) => Promise<any>;
    /** A raw call that keeps the status, which every canonical write needs. */
    apiRaw: (path: string, opts?: RequestInit) => Promise<{
        status: number;
        body: any;
    }>;
    keys: {
        publicKey: string;
        privateKey: string;
    };
    agentId: string;
    asText: (obj: unknown, isError?: boolean) => any;
    /** The legacy nonce for the old preimages, which is not a canonical write nonce. */
    legacyNonce: () => string;
    /** The composer version stamped into every card, from the one place that owns it. */
    skillVersion: string;
    sign: (payload: string, privateKey: string) => string;
}
export declare const CANONICAL_TOOL_NAMES: readonly ["publish_intent", "find_people", "mingle_inbox", "request_intro", "respond_intro", "continue_connection", "manage_intent", "mingle_settings"];
export declare function registerCanonicalTools(server: any, ctx: ToolContext): void;
/** The approved block copy, verbatim. One string, one home. */
export declare const BLOCK_PAIR_REVIEW_COPY = "You won't be matched or introduced through these two cards again.";

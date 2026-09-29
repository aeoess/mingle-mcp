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
/** Mirrors MAX_NOTE at intros-routes.ts:53 on the server. Exported so index.ts's legacy
 *  request_intro_v3 reuses the same number rather than carrying its own literal 200. A
 *  request_intro note over this length was previewed clean and only refused at confirm,
 *  after a digest was already issued for a note the server would never accept: this
 *  constant plus the check in request_intro's handler below is the fix, so the preview
 *  never approves a note that confirm would then refuse. */
export declare const NOTE_MAX_LENGTH = 200;
export declare function registerCanonicalTools(server: any, ctx: ToolContext): void;
/** The approved block copy, verbatim. One string, one home. */
export declare const BLOCK_PAIR_REVIEW_COPY = "You won't be matched or introduced through these two cards again.";

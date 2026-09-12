// ══════════════════════════════════════════════════════════════
// Mingle MCP — Sanitizer
// Scrub content from other agents before feeding into LLM context.
// Extracted from index.ts so it is testable without starting the
// stdio server (index.ts connects a transport at module load).
// ══════════════════════════════════════════════════════════════
/** Scrub a few known injection phrasings out of disposable discovery snippets
 *  (search_cards, the digest and the session-start pulse).
 *  This is NOT a security boundary. A pattern list cannot stop a determined
 *  injection, and the defense that holds is structural: text from other people
 *  arrives in a quoted field with a relay rule. Never pass signed, approved,
 *  exact-review or record content through this, because it rewrites text and
 *  the principal would then approve words they were never shown. */
export function sanitize(text) {
    if (!text)
        return "";
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

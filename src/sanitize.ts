// ══════════════════════════════════════════════════════════════
// Mingle MCP — Sanitizer
// Scrub content from other agents before feeding into LLM context.
// Extracted from index.ts so it is testable without starting the
// stdio server (index.ts connects a transport at module load).
// ══════════════════════════════════════════════════════════════

/** Sanitize content from other agents before feeding into LLM context. */
export function sanitize(text: string | undefined): string {
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
    .replace(/approve|decline/gi, (match) => match)
    .slice(0, 2000);
}

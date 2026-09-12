/** Scrub a few known injection phrasings out of disposable discovery snippets
 *  (search_cards, the digest and the session-start pulse).
 *  This is NOT a security boundary. A pattern list cannot stop a determined
 *  injection, and the defense that holds is structural: text from other people
 *  arrives in a quoted field with a relay rule. Never pass signed, approved,
 *  exact-review or record content through this, because it rewrites text and
 *  the principal would then approve words they were never shown. */
export declare function sanitize(text: string | undefined): string;

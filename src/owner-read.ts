/**
 * Read one of this principal's own cards in full.
 *
 * The public card fetch returns a network-visible projection: fields the person
 * marked private or intro-only are withheld. Renew reseals the stored content with
 * new timestamps, so it needs the full card, which the server returns only to the
 * card's subject through owner-read, signed over "owner-read:<cardId>:<issued_at>".
 *
 * A server that predates owner-read answers with a non-JSON 404, so the read falls
 * back to the public fetch. The caller still checks subject_key and status, and a
 * fallback card with withheld fields fails renew at the server as changed content
 * rather than silently dropping those fields.
 */
export type ApiFn = (path: string, opts?: RequestInit) => Promise<any>;
export type SignFn = (payload: string, privateKey: string) => string;

export async function readOwnCard(
  api: ApiFn,
  sign: SignFn,
  keys: { publicKey: string; privateKey: string },
  cardId: string,
  now: () => Date = () => new Date(),
): Promise<any> {
  const issued_at = now().toISOString();
  try {
    const r = await api(`/api/v3/cards/${encodeURIComponent(cardId)}/owner-read`, {
      method: "POST",
      body: JSON.stringify({
        public_key: keys.publicKey,
        issued_at,
        signature: sign(`owner-read:${cardId}:${issued_at}`, keys.privateKey),
      }),
    });
    if (r && !r.error && r.card) return r;
  } catch {
    // Older server without the route, or a network error. Fall through.
  }
  return api(`/api/v3/cards/${encodeURIComponent(cardId)}`);
}

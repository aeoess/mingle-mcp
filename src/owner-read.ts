/**
 * Read one of this principal's own cards in full.
 *
 * The public card fetch returns a network-visible projection: fields the person
 * marked private or intro-only are withheld. Renew reseals the stored content with
 * new timestamps, so it needs the full card, which the server returns only to the
 * card's subject through owner-read, signed over "owner-read:<cardId>:<issued_at>".
 *
 * Fallback is narrow on purpose. Only a server without the route at all (a 404 with
 * no JSON body, which is what Express sends for an unknown route) gets the public
 * fetch. Any other failure, including 401, 403, 404 "card not found", 5xx, a timeout
 * or a 200 that is not a full owner card, returns an error, so an authorization
 * failure can never turn into a renewal built from incomplete public content.
 */
export type ApiRawFn = (path: string, opts?: RequestInit) => Promise<{ status: number; body: any }>;
export type ApiFn = (path: string, opts?: RequestInit) => Promise<any>;
export type SignFn = (payload: string, privateKey: string) => string;

export async function readOwnCard(
  apiRaw: ApiRawFn,
  api: ApiFn,
  sign: SignFn,
  keys: { publicKey: string; privateKey: string },
  cardId: string,
  now: () => Date = () => new Date(),
): Promise<any> {
  const issued_at = now().toISOString();
  let r: { status: number; body: any };
  try {
    r = await apiRaw(`/api/v3/cards/${encodeURIComponent(cardId)}/owner-read`, {
      method: "POST",
      body: JSON.stringify({
        public_key: keys.publicKey,
        issued_at,
        signature: sign(`owner-read:${cardId}:${issued_at}`, keys.privateKey),
      }),
    });
  } catch (e) {
    return { error: `owner read failed: ${(e as Error).message}` };
  }
  if (r.status === 200 && r.body?.projection === "owner_full" && r.body?.card && typeof r.body.card === "object") {
    return r.body;
  }
  if (r.status === 404 && r.body === null) {
    // The server predates owner-read. Its public fetch is the full card minus the envelope.
    return api(`/api/v3/cards/${encodeURIComponent(cardId)}`);
  }
  return { error: `owner read refused (${r.status}): ${r.body?.error ?? "unexpected response"}` };
}

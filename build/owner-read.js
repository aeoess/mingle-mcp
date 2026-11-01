export async function readOwnCard(apiRaw, api, sign, keys, cardId, now = () => new Date()) {
    const issued_at = now().toISOString();
    let r;
    try {
        r = await apiRaw(`/api/v3/cards/${encodeURIComponent(cardId)}/owner-read`, {
            method: "POST",
            body: JSON.stringify({
                public_key: keys.publicKey,
                issued_at,
                signature: sign(`owner-read:${cardId}:${issued_at}`, keys.privateKey),
            }),
        });
    }
    catch (e) {
        return { error: `owner read failed: ${e.message}` };
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

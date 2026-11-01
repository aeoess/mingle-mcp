# mingle-mcp 5.0.1

A patch release. Nothing a host reads from the tools changes shape. Two fixes, one test change.

## Renew reads the full card before resealing it

The server's public card fetch now returns the network-visible projection of a card, so
fields marked private or intro-only are withheld from anyone who is not the card's subject.
Renew reseals the stored card with new timestamps and needs every field. 5.0.0 rebuilt the
card from the public fetch, so against the current server a renewal could drop the fields it
was not shown.

5.0.1 reads the card through `POST /api/v3/cards/:id/owner-read`, signed by the card's own
key over `owner-read:<card_id>:<issued_at>`, and reseals what that returns.

The fallback is narrow on purpose. The client falls back to the public fetch only when the
server answers 404 with no JSON body, which is what a server without the route sends. A 401,
a 403, a 404 for a missing card, a 5xx, a timeout, or a 200 that is not a full owner card all
stop the renewal and show the error. An authorization failure never becomes a renewal built
from incomplete content.

`find_people` with assess still uses the public projection. It sends your person's own card to
an outside model, so the withheld fields stay withheld there.

## Intro note length is checked at preview

A `request_intro` note longer than 200 characters was previewed as fine and only refused at
confirm, after a digest had been issued for a note the server would never accept. The length
is now checked on the trimmed note at preview, with the same limit the server uses, so a
preview never approves a note that confirm would refuse.

## Test change

The end to end suite signs up `example.com` addresses against a spawned server. The server
now refuses confirmation email to reserved test domains, so the spawned server gets the
server's own test switch, `MINGLE_ALLOW_RESERVED_EMAIL_DOMAINS=1`. This touches the test
harness only.

## Compatibility

No tool was added, removed, or renamed. The default surface is still eight tools. Output
shapes are unchanged from 5.0.0.

The 3.2.x legacy write window described in RELEASE-5.0.0 closed at
`2026-10-12T20:37:47.269Z`. This release does not reopen or move it.

## Upgrading

```
npx mingle-mcp setup
```

The skill text is unchanged apart from the version in its install line.

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- GitHub: https://github.com/aeoess/mingle-mcp
- API: https://api.aeoess.com

# mingle-mcp 5.1.0

A minor release. One optional argument on two tools, so a card can be published for an event
and people at that event can find each other. Nothing is removed or renamed, and a call that
does not use the new argument behaves exactly as in 5.0.1.

## Events

`publish_intent` takes `event`, the short id an event gives out, such as `mcp-night-sf`. The
card is then listed on that event's public wall page, `https://api.aeoess.com/e/<event>`, which
anyone with the link can open. The preview returns that address as `event_wall` with a note to
tell the person before they approve, and the event id is part of the content the approval
digest covers, so adding or changing it after a preview publishes nothing.

`find_people` takes the same `event` and searches only the cards published for it.

An event id is lowercase letters, digits and hyphens, at most 64 characters, starting with a
letter or digit. Anything else is refused before a request is sent.

The server has supported events on cards, event search and the wall page since before 5.0.0.
Until this release the eight-tool client had no way to set one, so a card published from it
never appeared on a wall.

## Compatibility

A card published without `event` has the same approved content, the same digest and the same
sealed card as in 5.0.1, with `event_ref` null. Renew keeps a card's event, because renew
reseals the stored card unchanged. Replace publishes exactly what the new preview showed, so a
replacement without `event` is not on the wall.

The default surface is still eight tools. The 3.2.x legacy write window closed at
`2026-10-12T20:37:47.269Z`, and this release does not reopen or move it.

## Upgrading

```
npx mingle-mcp setup
```

The skill's section on what the eight tools can express now describes `event`. Replace your
copy of `skills/mingle/SKILL.md` if you installed the skill.

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- GitHub: https://github.com/aeoess/mingle-mcp
- API: https://api.aeoess.com

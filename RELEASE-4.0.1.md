# mingle-mcp 4.0.1

A copy-only patch. Six corrections to the skill, the tool descriptions and the release notes.
No behavior change: not one line of logic, no tool, no argument and no return field differs
from 4.0.0.

## What changed

1. The skill's publish flow and its asking flow no longer tell an agent to call a write tool
   with `confirm: true` as its first call, so Mingle's own preview is never skipped.
2. `continue_connection` no longer advertises the first-conversation plan in its one-line
   description, because the surface behind it is off on the network.
3. The skill states what a background check actually sends rather than naming one field, and
   the bare claim of no telemetry is gone.
4. The compatibility notes say what the cutoff does, which is to stop accepting legacy write
   forms, and say plainly that legacy reads are not disabled.
5. The signing claim says that a different payload cannot verify as what you authorized,
   rather than that two things cannot differ.
6. The skill's summary line names what is actually withheld, which is contact details until
   both sides choose to share, rather than cold messages.

## The compatibility window is unchanged

4.0.0 started the thirty day window for published 3.2.x clients at its own npm publication
instant, `2026-10-12T20:37:47.269Z`. A patch release does not move it and this one does not.
The window still closes thirty days after that instant.

## Upgrading

```
npx mingle-mcp-setup@4.0.1
```

If you installed the skill, replace your copy of `skills/mingle/SKILL.md`. That is where five
of the six corrections are.

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- GitHub: https://github.com/aeoess/mingle-mcp
- API: https://api.aeoess.com
- 4.0.0 release notes: RELEASE-4.0.0.md

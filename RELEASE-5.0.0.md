# mingle-mcp 5.0.0

A breaking release. `mingle_inbox` returns a different shape, because the shape it returned
before was wrong about the thing the product exists to get right: who asked whom.

## The defect

An introduction your person requested was reported back to them as an introduction someone
else had requested of them, and the note they had written themselves was attributed to the
other person. On a network whose whole subject is who wants to meet whom, that is not a
display bug.

The server always knew the direction. The client re-labelled it on the way out, and the
labels it used were the ones published in 4.x.

## What `mingle_inbox` returns now

| 4.x | 5.0.0 | what it means |
| --- | --- | --- |
| `waiting_on_your_person` | `introductions` | Every live introduction on this person's cards, in both directions. The old name described a subset that the field never actually held. |
| `direction: "asked_of_them"` | `direction: "incoming"` | Someone else asked to be introduced to your person. Your person is the one being asked. |
| `direction: "they_asked"` | `direction: "outgoing"` | Your person asked to be introduced to someone else. Your person is the one who started it. |
| (none) | `initiated_by: "you"` \| `"counterparty"` | The same fact stated from your person's side, for a reader that would rather not interpret a direction word. |
| `note_written_by_the_other_side` | `request_note` | The note attached to the request. The old name asserted an author. The new one does not. |
| (none) | `request_note_author: "you"` \| `"counterparty"` | Who wrote that note. `you` means your own person wrote it, so it must not be read back to them as a stranger's words. |
| `state` falling back to `status` | `state`, or `null` | The server's derived state. `null` means the server did not derive one, rather than a compatibility column standing in for it. |
| (none) | `projection_status`, `projection_note`, `legacy_status` | Present on an introduction the server cannot project. See below. |

Both `direction` and `initiated_by` come from the server's own projection. Neither is derived
from list membership, which is what produced the original defect.

## Why there is no compatibility alias

The previous direction values were themselves incorrect, so preserving them as aliases would
preserve the attribution bug in exactly the clients still reading them.

## An introduction the server cannot project

Introductions created before the canonical write migration carry no request authorization
record, so the server does not derive a state for them. A 4.x client showed those rows with
an empty action list and a legacy status, which reads as nothing to do here.

On those rows `state` is `null`, `projection_status` is `"unavailable"`, and `projection_note`
says in words that the empty `can_do_now` does not establish that no action is possible and
that no action was inferred from legacy status. The legacy value is still available under
`legacy_status`, and only on those rows.

## `find_people` gains an optional assessment

Additive and off unless asked for. Call `find_people` with `assess: true` and `my_card_id`
and it asks OpenAI's `gpt-6-astra` whether there is a reciprocal reason for two people to
meet, with evidence quoted from both cards and one question to resolve first. Up to three
candidates per call.

Assessments run from the process hosting Mingle, using the OpenAI API key configured for that
process. The key is read from that process's environment and sent only to OpenAI. Requests go
directly to OpenAI rather than through the Mingle API. Mingle does not persist the generated
assessment and does not return it to anyone but the caller.

The request includes only your own card's and each candidate's network-visible headline and
network-visible seeking and offering descriptions. It does not include contact details,
identity keys, notes, or anything about an introduction. The request sets `store: false`,
which asks OpenAI not to retain the response as application state. That is a statement about
one API parameter, not a claim about OpenAI's data handling generally.

Without a key configured, the call returns `status: "unavailable"` with
`reason: "not_configured"` and the search result itself is unchanged. Every other part of
Mingle works with no key at all.

The output is checked before it reaches the caller. Every quote the model offers as evidence
must match the exact field value that was sent, and a verdict of `plausible_reciprocal_fit`
must carry evidence from both cards. Anything that fails those checks returns as unavailable
rather than as an assessment. The result is advisory. It does not request an introduction,
grant permission, rank people, or establish anyone's consent.

## Node 22

`engines` is now `>=22.0.0`, raised from `>=18.0.0`. The canonical write path serializes with
RFC 8785 JCS and needs runtime behavior Node 18 does not provide. A client that starts and
then produces wrong canonical bytes is worse than one that does not start, so the requirement
is stated rather than hoped for.

## The 3.2.x compatibility window

The promise made in 4.0.0 was this:

> Installs on 3.2.x keep working against the network for **thirty days** from the moment this
> version is published to npm. During the window, the server continues accepting the legacy
> write forms used by published 3.2.x clients.
>
> When the window closes, changing a connection needs 4.0.0 or later.

That promise is about what the server accepts from published 3.2.x clients. It is anchored to
4.0.0's own publication instant, and 5.0.0 does not move it. 5.0.0 changes what this client
returns to its host and changes nothing the server accepts, so a 3.2.x install's remaining
window is exactly what it was. An upgrade taken during the window satisfies "4.0.0 or later"
whether it lands on 4.0.x or on 5.0.0.

Being exact about what is not covered. That window was only ever a promise to 3.2.x. No
compatibility promise was made to 4.x, and 5.0.0 breaks the 4.x inbox contract two days after
4.0.0 published it. Nothing here is a promise broken. It is a contract changed fast, and the
reason is that the contract was wrong from the moment it shipped. A 4.x install that does not
upgrade keeps working against the network and keeps showing every introduction's direction
backwards.

### Errata for RELEASE-4.0.1

RELEASE-4.0.1 gave 4.0.0's npm publication instant as `2026-10-12T20:37:47.269Z`. That
timestamp is the thirty day cutoff, not the publication. 4.0.0 was published to npm at
`2026-09-12T20:37:47.269Z`. The window itself is unchanged and RELEASE-4.0.1 is left as it
was published.

## Upgrading

```
npx mingle-mcp setup
```

If you installed the skill, replace your copy of `skills/mingle/SKILL.md`. The 4.x copy tells
an agent to read fields that no longer exist and to match direction values that no longer
appear, so an agent following it will report an empty inbox.

If you read `mingle_inbox` output directly, the table above is the whole change. Reading
`direction` without remapping the values will invert every introduction.

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- GitHub: https://github.com/aeoess/mingle-mcp
- API: https://api.aeoess.com
- 4.0.1 release notes: RELEASE-4.0.1.md

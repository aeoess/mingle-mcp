# mingle-mcp 4.0.0

Eight tools instead of forty-six, and every change signed over the exact content you
approved.

## Why this is a major version

The default tool surface is eight tools. It was forty-six. If you scripted any of the old
names, they are still in the package and register when `MINGLE_LEGACY_TOOLS=1`, so nothing is
deleted, but a host that launches Mingle with no environment set now sees eight.

That is the whole breaking change. Everything else here is additive or an improvement to
something that was already there.

## The eight

| Tool | What it does |
|------|-------------|
| `publish_intent` | Publish your card, renew one that is expiring, or replace one with a new version. |
| `find_people` | Search published cards. Works without a card of your own. Contacts nobody. |
| `mingle_inbox` | What is waiting for you, and what you can do next on each. Changes nothing by reading. |
| `request_intro` | Ask one person for an introduction, with a note in your own words. |
| `respond_intro` | Answer an introduction: interested, not now, or not now and block. |
| `continue_connection` | Share a contact line, take an unreleased one back, or agree a plan for the first conversation. |
| `manage_intent` | Withdraw a request, step out of an introduction, block a pair, take a card down. |
| `mingle_settings` | Where Mingle may email you, and whether your agent may check in the background. |

No version suffix in any name. No protocol vocabulary in any description. A host model reads
these eight and needs nothing else.

## Nothing is signed until you approve the exact content

Every change is two calls. The first returns the exact content and a digest over those exact
bytes. Your agent shows you that content. The second carries the digest back, and if anything
changed in between, nothing is signed and the new version comes back to show you instead.

Your key signs the content itself rather than a description of it. Before this, several
actions were signed over a short preimage that named the action and left the content outside
the signature, which meant the record proved that you acted and not what you agreed to.

## Interest is not contact

Saying you are interested in an introduction shares nothing but that. Contact is released
only when both sides have chosen to share, separately, and the release is decided by the
server from what both of you signed rather than by either agent asking for it.

A contact line that has been released cannot be recalled. A line that has not been released
yet can be taken back. Both facts are said out loud before you approve the line.

## Stepping out takes one action

Withdrawing from an introduction is one action, right up until contact is released, and it
ends the whole thing: any unfinished plan is closed with it, and a contact line you shared
that has not been released is taken back with it. After a release there is nothing left to
withdraw, and the tool says so and points at blocking the pair instead.

## Compatibility with 3.2.x

Installs on 3.2.x keep working against the network for **thirty days** from the moment this
version is published to npm. During the window a published client can still change a
connection exactly as before.

When the window closes, changing a connection needs 4.0.0 or later. An older client is told
once, in one sentence, rather than left with an error:

> Update Mingle to continue this connection.

Reading is not affected at any point.

## Agent fit

The structured fit conversation, the fit policies, the predicate handshakes and the graduated
autonomy scopes are not available on the network right now. Their tools are in the package
behind `MINGLE_LEGACY_TOOLS=1`, and the network answers:

> Agent fit is temporarily unavailable. You can still continue the introduction directly.

An introduction does not need it.

## Upgrading

```
npx mingle-mcp-setup@4.0.0
```

Restart your AI client. Your identity is unchanged: the same Ed25519 keypair in
`~/.mingle/identity.json`, the same cards, the same introductions.

If you need the older tools back, set `MINGLE_LEGACY_TOOLS=1` in the server's environment.
Two names exist on both surfaces, so with the switch on the older pair is
`request_intro_legacy` and `respond_intro_legacy` while `request_intro` and `respond_intro`
are the new tools.

## The skill

`skills/mingle/SKILL.md` is rewritten for the eight tools. If you installed it, replace your
copy: the old one instructs an agent to call tools a 4.0.0 install does not offer.

## Links

- npm: https://www.npmjs.com/package/mingle-mcp
- GitHub: https://github.com/aeoess/mingle-mcp
- API: https://api.aeoess.com
- Parent protocol: https://aeoess.com

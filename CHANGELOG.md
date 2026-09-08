## 3.2.2 - 2026-09-08

- The client config the installer writes launches `mingle-mcp@3.2.2`, pinned to the exact version, so a client never resolves a release that was not reviewed; re-run `npx mingle-mcp-setup@<version>` to move to a newer one.

Answers the ClawHub security review of 3.2.1 (outcome: Review). Two findings.

**T01, silent session-start network calls.** The skill told the agent to call
Mingle at the start of every session where Mingle was connected, without asking
anyone. That is now an explicit, stored, revocable per-user choice.

- New tool `set_background_checks`. The answer is stored in
  `~/.mingle/v3-pulse.json` as `background_checks`, next to the read marker that
  was already there rather than in a second store. Absent until the user answers,
  and absent behaves as off.
- `check_pending_matches` and `get_card_status` take a `pulse: true` flag. That
  flag marks a call as the automatic session-start one, and with the preference
  off or unset those calls return `{ skipped: true, reason:
  "background_checks_off" }` and make no network request at all. Called without
  the flag, which is the user asking, they behave exactly as before.
- Rule 1 and the session-pulse section now state the same condition in the same
  words: a live card AND background checks on. They disagreed before, which is
  what the audit caught.
- The agent asks once, ever, and only when there is a live card. No answer is
  not a yes. "Stop checking Mingle" turns it off.
- The skill states what a check sends: the user's Mingle public key, to
  api.aeoess.com, nothing else. `get_card_status` reports the current setting and
  where it is stored, so the state is visible without reading source.

**T08, unpinned installer that edits client config.** The setup command is
`npx mingle-mcp-setup@3.2.2` everywhere, pinned.

- `mingle-mcp-setup` now prints the exact path of every file it would change and
  the exact JSON it would add, then waits for y/N. Nothing is written before the
  answer. `--yes` accepts in advance for scripted installs; with no terminal and
  no `--yes` it refuses and exits 1 rather than writing unattended.
- It names the two clients it touches, Claude Desktop and Cursor, and touches
  nothing else. The header comment claimed Windsurf, which it never configured.
- The `postinstall` lifecycle script is removed. It printed a line and was not
  needed to install anything.

# Changelog

Releases were previously recorded only in the release commit subject; this file
starts from those and carries forward in the same style.

## 3.2.0 - 2026-09-08

Live-loop activation against intent-network-api PROTOCOL.md 3.2.0.

- `check_pending_matches`: new tool reading `GET /api/v3/matches/pending`, which
  does not advance the digest read marker. The session-start check no longer
  burns the principal's "new since you last looked" window before they have
  looked. Returns the counterpart's headline and their own quoted words, an
  overlap summary (never a score), and whether an introduction or fit handshake
  already exists for the pair. Suggest mode surfaces at most one match per
  session and never starts a handshake.
- `expired` is not `withdrawn`. `get_card_status` now reports what each
  `revocation_status` means alongside the raw value. A card whose clock ran out
  is worth mentioning and offering to renew; a card the principal deliberately
  pulled is not raised unless they ask. Skill Rule 1 stopped keying on
  `_digest.cardStatus == "expired"`, which the legacy digest could never return.
- Expiry nudge before the fact: an active card within five days of running out
  produces a one-time `expiry_nudge` with the card's own intent line, answered
  by `renew_card` (identical content, fresh expiry). Nothing new is stored;
  once-per-card-per-session is held in the server process's own memory.
- The trust promise says what is actually true: the agent shares only what the
  principal allowed for that connection, dimension by dimension under their fit
  policy, and `get_fit_activity` / `get_fit_handshake` / `get_fit_record` answer
  what was shared with whom.

## 3.1.1

Drop retired ClawMeet name, align homepage to /mingle, fix skill metadata
version and em-dashes. Registry manifest bumped to match.

## 3.1.0

v4 private fit: policy, predicate handshake, airlock, graduated autonomy, first
step artifact.

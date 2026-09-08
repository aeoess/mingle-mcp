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

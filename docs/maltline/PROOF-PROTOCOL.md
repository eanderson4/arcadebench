# Maltline ranked proof protocol

Maltline uses a fixed, registered generation-2 campaign. Scenario RNG seeds are
part of the authority configuration digest; a challenge does not alter them.

## Envelope version 3 challenge

The server-owned challenge contains exactly `runId`, `seasonId`, `boardId`,
`nonce`, and `authority`. `nonce` is an unsigned 32-bit integer minted by the
server. It binds the retained envelope and its SHA-256 hash to a particular
submission challenge. Changing it changes the envelope hash, but the same input
proof remains valid because simulation uses only the registered authority.

The nonce is not gameplay entropy, does not make an input proof fresh, and is
not evidence that a human played after challenge issuance. A fixed-campaign
proof can be precomputed and transferred. Platform security must separately
enforce authenticated ownership, expiry, atomic one-use challenge consumption,
rate limits, and any bot policy.

Envelope version 3 replaces the misleading version-2 challenge field `seed`
with `nonce`. Version-2 envelopes and challenges are not accepted by this
verifier. The input-only proof remains version 1, ruleset 2, and campaign
generation 2 because its simulation meaning did not change.

## Browser recovery error contract

The score-submission route gives the two HTTP 400 outcomes that require
different browser recovery policies stable machine-readable codes:

- `maltline_callsign_rejected` means the proof is still usable and only the
  callsign form may reopen for editing.
- `maltline_proof_invalid` means the attempt is terminally rank-ineligible.

Coded responses contain exactly `error` and `code`. The strict browser client
rejects unknown codes, extra fields, and either code under a status other than
400. Existing uncoded service and Partition API errors retain their exact
legacy `{ error }` envelope; an uncoded 400 fails closed rather than being
mistaken for editable moderation.

## Retained proof inspection

Ready score IDs address retained envelopes at
`GET /api/v1/games/maltline/replays/:scoreId`; `HEAD` exposes the same
availability and integrity metadata without a body. The Worker serves only a
ready, unexpired D1 row whose bounded R2 bytes still match its stored SHA-256,
with `private, no-store` caching so the five-day deletion boundary is not
extended by intermediaries.

The browser does not trust the retained summary. It strictly parses the
envelope, resolves the embedded registered authority, replays the input-only
proof, rebuilds the canonical envelope, and requires an exact canonical match
before showing `INPUTS REPRODUCED`. It also requires every locally derived
summary field—score, lives, stage progress, completion, ticks, and all customer
counters—to equal the selected leaderboard row. This reproduces the listed
gameplay result; it does not independently prove entrant identity or human play.
Missing, corrupted, malformed, or mismatched proof data never enters the
verified inspection state. Leaderboard rows derive `proofAvailable` from the
authoritative deletion/expiry state: ended windows expose no Inspect action,
and a racing 404/410 becomes a terminal unavailable detail while transient
network/storage failures retain an explicit retry.

The animated inspection cursor can only be constructed from that same unknown
retained envelope. Construction performs the strict verification and hashing
once, then exposes immutable verifier-derived stage descriptors and frames; it
does not accept a caller-authored summary, scenario, run context, or pre-parsed
proof. Replay positions are canonical stage-local `{ stageIndex, stageTick }`
coordinates. Tick zero is the initial state of each stage, so the global frame
ordinal includes one additional stage-start frame per recorded stage while
`runTick` counts proof inputs and is intentionally duplicated at stage
boundaries. Playback never auto-crosses a stage boundary. Backward or
cross-stage seeks rebuild the engine from the verifier-derived stage run
context, while forward seeks reuse the live engine. The scrubber owns only an
isolated renderer and animation cursor—no audio, storage, gameplay input,
submission, or rank state—and is paused and destroyed with its inspection
surface. Presentation effects are also deterministic for a logical frame: an
explicit seek reconstructs at most the preceding 1.4 seconds of verified frame
history, adjacent playback maintains that bounded ring without rewinding, and
painting rebuilds effects from the ring using tick-derived time and stable
proof/stage/tick entropy. Browser animation cadence therefore chooses when a
frame is painted, not its state or effect age.

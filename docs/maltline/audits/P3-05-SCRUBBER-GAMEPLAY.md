# P3-05 — Animated retained-proof scrubber gameplay brief

**Review date:** 2026-09-10
**Scope:** player-facing playback of an already verified Shift Board proof. This
is an implementation brief, not a proposal to change proof, scoring, campaign,
or ranking semantics.

## Recommendation

Add an optional, muted replay canvas inside the existing proof-detail view. It
should open **paused at tick 0 of the last recorded stage**, with a visible
default speed of **4x**. A canonical 6:01 winning run would therefore take about
1:30 to watch end-to-end, but a player can immediately inspect the decisive
final stage, jump among stages, or seek to any moment. Do not autoplay, loop, or
automatically cross a stage boundary.

This keeps inspection subordinate to a 5–15 minute arcade loop: the verified
score card stays first, animation begins only on request, and `Back to board`
remains one action away. Playback must remain isolated from the live engine,
ranked recorder, terminal submission, eligibility, and audio.

## Current boundaries and smallest implementation seam

- A retained envelope has canonical RLE input runs, authority identity, and a
  replay-derived summary, but no per-tick states
  (`games/maltline/src/core/proof.ts:56-71,142-153`). `loadReplay()` returns only
  after resolving trusted authority, replaying all inputs, requiring canonical
  envelope equality, and hashing it
  (`games/maltline/src/viewer/competition-client.ts:508-528`;
  `games/maltline/src/core/proof.ts:735-798`). The scrubber must consume this
  verified result, never the unverified response body.
- `MaltlineEngine` already provides the exact cursor primitives: normalized
  scenario/run construction, normalized `setInput`, deterministic `step`, and
  defensive `snapshot` (`games/maltline/src/core/engine.ts:27-32,69-140`). The
  renderer accepts arbitrary scenario/state snapshots and has explicit
  `setScenario`, `resetPresentation`, `pushEvents`, `update`, and `draw` seams
  (`games/maltline/src/viewer/renderer.ts:95-105,167-181,191-214,287-314`). Use a
  dedicated renderer and canvas; do not borrow the live-game renderer.
- The existing rich `replayMaltline()` helper expands an input array and stores
  tick/input/events but still does not store tick states
  (`games/maltline/src/core/replay.ts:9-26`; `games/maltline/src/core/types.ts:167-179`).
  It is useful as an oracle in tests, not as the scrubber model.
- Verification limits the whole proof and each stage to 60,000 ticks
  (`games/maltline/src/core/proof.ts:31-34`). Authored winning stages are only
  1,558–3,766 ticks, with 21,662 ticks total
  (`games/maltline/tests/proof.test.ts:428-452`). A selected-stage replay from
  zero is therefore cheap today, but input runs should still be traversed lazily
  rather than expanded into one object per tick.

Implement a viewer-owned, versioned `MaltlineProofPlayback`/cursor that accepts
only the verified hashed proof and its resolved registered authority. Retain an
engine and RLE run/repetition cursor for forward playback. On a backward seek or
stage selection, construct a new engine at that stage's carried run context and
replay forward to the target. Derive each stage's starting lives/score once
during verified preparation (or expose immutable verified-stage results from
the verification boundary); do not add mutable state restoration to the core
engine for v1 and do not store a full `MaltlineState` at every tick.

The playback model should expose immutable presentation snapshots such as:

```text
stage index/name, tick/total ticks, playing/paused/ended, speed,
MaltlineState, current-tick GameEvent[], and latest meaningful event
```

Seeking to tick `t` means the state after exactly `t` engine steps; tick zero is
the stage's initial state. Reset presentation effects on any discontinuous seek
or stage change, then draw the exact state without replaying old particles.

## Player behavior

### Stage navigation

- Show only stages actually present in the terminal proof, in authority order.
  Use authored names—`Lunch Rush`, not a machine ID—and include each stage's
  active duration and terminal result.
- Initially select the last recorded stage because it contains the campaign
  finish or the loss the player is most likely trying to understand. Start that
  stage at 0:00, paused.
- Provide explicit `Previous stage` and `Next stage` controls plus the compact
  stage list. Selecting any stage resets it to tick zero and pauses. Disable
  navigation beyond the recorded prefix.
- At stage end, pause and announce the result. Offer `Replay stage` and, when
  applicable, `Next stage`; never advance silently. This preserves orientation
  and avoids hiding the failure/clear moment.

### Play, pause, speed, and seek

- Do not autoplay. The primary control is `Play replay`; while running it is
  `Pause replay`. Closing the panel, going back to the board, losing page
  visibility, or destroying/replacing the inspection pauses immediately and
  discards accumulated wall time.
- Default to **4x** with four explicit choices: **1x, 2x, 4x, 8x**. A speed
  change affects only future wall-time advancement and cannot skip or duplicate
  simulation ticks. Cap work per animation frame (32 ticks is safely above an
  ordinary 8x/60 Hz frame); carry remaining replay work instead of dropping
  truth or blocking a long frame.
- Use a stage-local range labelled `Replay position`, from tick 0 through the
  verified stage tick count. Show `0:27 / 0:52 active` as its visible value and
  accessible value text. Keep tick precision internally, but add `Back 5
  seconds` and `Forward 5 seconds` controls so keyboard use does not require
  hundreds of single-tick presses; Home/End should reach exact boundaries.
- Starting a pointer/keyboard seek pauses playback. Committing the seek stays
  paused and announces the new time and stage summary; require an explicit Play
  to resume. Clamp pointer-derived targets, reject non-finite programmatic
  targets, and never process proof input after its verified terminal tick.

### Meaningful status

Keep the current verified score/outcome card above the player. For the replay,
lead with a stable visual status, for example:

```text
Stage 7 of 8 · Happy Hour
Paused at 0:31 / 0:55 active · 4x
18 of 27 orders resolved · 18 served · 0 walkouts · 4 lives · 27,125 points
```

While playing, add only the latest meaningful event in plain language: flavor
and lane for a serve, jar caught/missed, shake missed, walkout/life lost, stage
clear, or game over. The existing event vocabulary already distinguishes these
causes (`games/maltline/src/core/types.ts:138-160`). Do not reuse
`semanticPlayStatus()` verbatim because it gives live control instructions such
as “Press F” and “Hold Space” (`games/maltline/src/viewer/semantic-status.ts:9-32`).
Create a replay-specific pure formatter.

Throttle ordinary visual status to a few updates per second. The polite live
region should announce user actions (play, pause, seek, stage selection), life
loss, and terminal results—not every service or animation tick. Honor reduced
motion through the renderer's existing presentation dependency. Replay is
muted in v1: sounds would be dense at 4x/8x and could be mistaken for live play.

## Do not expose in v1

- Raw RLE runs, seeds, fixed-point positions, exact tick numbers as the primary
  display, internal stage IDs, full state arrays, or the proof hash beside the
  transport controls. The existing fingerprint disclosure remains sufficient.
- Input editing, branching, “what-if” scoring, ghost races, or live gameplay
  controls. This is inspection of immutable evidence, not a sandbox.
- A single six-minute campaign slider. Stage-local time gives useful seek
  precision and makes the stage progression legible.
- Autoplay, auto-loop, automatic stage transitions, playback audio, or network
  work after the verified artifact has loaded.
- Any playback or verification work during active gameplay. Keep the Shift
  Board's existing safe-screen and inert-shell boundary.
- Serialization or browser storage of generated playback state. Retained proof
  and competition lifecycle are currently memory-only and should remain so.

## Acceptance tests

### Determinism and integrity

1. For every recorded stage, advancing the cursor to its terminal tick produces
   the verifier's stage lives, score, status, and counters; the final stage
   matches the retained summary. Inputs crossing RLE boundaries, including a
   serve false-to-true edge, reproduce direct `MaltlineEngine` execution.
2. Seek sequences `0 → t → earlier → t → end` produce byte-equal state at each
   repeated target. Stage changes derive the exact carried lives/score. Tick 0,
   final tick, lost-stage endings, and a full eight-stage proof are covered.
3. Construction and playback do not mutate the hashed proof, canonical input
   runs, authority, live engine, ranked recorder, terminal proof/submission, or
   protocol/hash bytes. Unverified, malformed, mismatched, expired, or aborted
   responses never create a cursor.

### Controls and lifecycle

4. The initial state is the last recorded stage at tick 0, paused, 4x. Fake-RAF
   tests prove 1x/2x/4x/8x advancement without skipped/duplicated ticks; pause
   freezes; speed changes retain position; the per-frame cap preserves pending
   work; end pauses exactly once.
5. Scrubbing pauses and stays paused, reconstructs the exact target, resets
   transient renderer effects, and handles 0/end/invalid targets. Five-second,
   Home, and End actions map through the selected scenario's `ticksPerSecond`.
6. Previous/next/list selection follows authority order, resets to tick zero,
   and cannot enter an unrecorded stage. Panel close, Back, inspection
   replacement, destroy, and `visibilitychange` pause and cancel all scheduled
   playback with no catch-up on reopen.

### Product and accessibility

7. At 700x600 and the existing 390px browse-only boundary, score context,
   canvas, Play/Pause, stage navigation, slider, speed, and Back remain reachable
   without obscuring terminal submission on return. Focus stays trapped and
   Back restores the initiating leaderboard Inspect button.
8. Controls have unambiguous accessible names and the range reports authored
   stage name plus elapsed/total active time. Keyboard-only play, pause, stage
   navigation, single-tick seeking, five-second jumps, Home, and End work.
9. Live-region tests prove no per-tick/service announcement flood. Life loss and
   terminal cause remain understandable after normal playback and after a seek;
   reduced-motion mode has no shake/particle motion and playback never emits
   audio.
10. Player copy never implies live control, wall-clock duration, human
    authorship, or stronger identity binding than the existing locally
    reproduced/server-associated proof provides.

## Evidence check

```text
npm test --workspace @arcadebench/maltline -- --run \
  tests/proof.test.ts tests/competition-client.test.ts \
  tests/competition-controller.test.ts tests/renderer-presentation.test.ts \
  tests/viewer-session.test.ts
  5 files, 120 tests passed
```

Only this implementation brief was added.

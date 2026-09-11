# TD-08 — Post-P3-05 replay scrubber gameplay audit

**Review date:** 2026-09-10
**Scope:** the actual retained-envelope verification, playback cursor,
competition-controller/panel integration, replay controls and timing, player
comprehension, accessibility, and lifecycle in the current tree. Product code
was reviewed and exercised read-only; this report is the only file added.

## Closure recommendation

**Do not close P3-05 yet.** No proof-integrity, scoring, ranking, cross-stage, or
terminal-submission defect was found. The core execution model is strong, but
the integrated player surface has two definite closure blockers:

1. replaying a finished stage carries its terminal event text back to tick zero;
2. the only nonvisual description of an `aria-hidden` canvas omits the player's
   window, selected station, and held/blending action.

The unthrottled range-input reconstruction is a third conditional P1 item: close
it by coalescing seeks as designed, or by supplying representative slow-device
evidence and an explicit interaction budget. TD8-G04/G05 are later polish.

## What is sound

- `MaltlineCompetitionClient.loadReplay()` exposes playback only through
  `createVerifiedMaltlinePlayback()` (`competition-client.ts:510-529`). That
  factory accepts the retained envelope, re-verifies it against registered
  authority, and builds scenarios/run carry internally; callers cannot provide
  simulation parameters or outcome state (`core/playback.ts:196-249,372-387`).
- Playback has an exact `(stageIndex, stageTick)` coordinate, a distinct frame
  at both sides of a stage boundary, immutable frames/descriptors, and strict
  position validation (`core/playback.ts:16-58,101-137,282-369`). Engine replay
  tests cover RLE boundaries, arbitrary forward/backward seeks, terminal losses,
  carried lives/score, and final-summary equality (`tests/playback.test.ts`).
- The controller still compares every listed summary field before exposing the
  verified detail (`viewer/competition-controller.ts:346-387`). Intermediate
  replay state cannot enter score submission or replace the leaderboard result.
- Playback starts paused at the decisive last recorded stage, defaults to 4x,
  caps one animation callback at 32 ticks while retaining backlog, and stops at
  the current stage terminal frame (`viewer/replay-scrubber.ts:268-277,373-417`).
  It neither autoplays nor crosses a stage boundary.
- Back, Escape, panel rerender/replacement, visibility loss, and destroy cancel
  playback. The panel owns exactly one active scrubber and destroys it before
  replacing content (`viewer/competition-panel.ts:192-200,318-331,546-588,
  628-641`; `viewer/replay-scrubber.ts:486-493,533-539`). No audio, browser
  storage, or gameplay-key listener is present.
- The proof view is contained at 700×600 and 390×720, uses native controls, and
  keeps the verified summary, stage breakdown, and fingerprint available. A
  missing canvas context degrades to semantic controls rather than failing the
  inspection (`tests/visual/competition-panel.visual.spec.ts:145-276`).

## Findings

### TD8-G01 — Replay restart shows a terminal event at tick zero

**Severity:** P1 player-trust/semantic correctness; **P3-05 closure blocker**.

`latestEventText` persists independently of the playback frame
(`viewer/replay-scrubber.ts:268-277,282-315`). When a finished stage's Replay
button is activated, `play()` moves the playback frame to tick zero and resets
the renderer, but does not reset `latestEventText`
(`viewer/replay-scrubber.ts:444-455`). The old terminal event remains visible
until some later meaningful event replaces it.

The integrated headless-browser reproduction on the canonical win was exact:

```text
Closing Time terminal tick: 3301
terminal event: Stage cleared, +1,000 bonus points.
activate Replay stage
position: 0
summary: Playing at 4x. 0 of 31 orders resolved ... 28,830 points.
event: Stage cleared, +1,000 bonus points.
```

A lost run is worse: its fatal cause can appear beside the healthy opening
state. This is future information presented as the current moment, not cosmetic
particle drift.

**Bounded fix:** in the terminal restart branch, reset latest-event text from
the new tick-zero frame (normally “No major event at this moment”) before
redrawing and announcing Play. Centralize all discontinuities—seek, stage
selection, replay restart—through one method so semantic and renderer reset
cannot diverge.

**Acceptance:** finish both a won stage and a fatal lost stage, activate Replay,
and assert tick zero, initial state, no terminal event text, one Play
announcement, and no stale terminal particles. Add the missing terminal→Replay
unit and browser path.

### TD8-G02 — The nonvisual replay omits the player's actual action state

**Severity:** P1 accessibility/player comprehension; **P3-05 closure blocker**.

The canvas is intentionally `aria-hidden` (`viewer/replay-scrubber.ts:196-205`).
Its external summary reports stage, mode, resolved/served/walkouts, lives, and
score, while the event line reports the most recent discrete event
(`:282-315`). It never reports the player's current window, selected flavor
station, held shake, blending flavor/progress, or idle action. At quiet ticks,
“No major event at this moment” plus outcome counters cannot explain what the
recorded player is doing. The picture-unavailable path has the same omission.

This fails the pre-implementation requirement that lane, selected station,
held/blending state, and current event exist as real text outside the canvas
(`P3-05-SCRUBBER-VISUAL.md:160-168`). It also makes keyboard scrubbing much less
useful to a screen-reader user even though the transport itself is accessible.

**Bounded fix:** add replay-specific state copy to the non-live summary, for
example: “Window 2 · Chocolate station · blending 65%,” “Vanilla shake ready,”
or “idle.” Reuse flavor labels and state, not `semanticPlayStatus()`'s live-play
instructions. Keep per-frame text non-live; announce only explicit transport
actions and major outcomes as today.

**Acceptance:** fixtures at idle, blending, holding, serving, jar-return, and
fatal frames expose stage/time, window, station/flavor, action, score/lives, and
the meaningful event without inspecting canvas pixels. Canvas failure retains
the same facts, and normal 4x playback does not flood the live region.

### TD8-G03 — Range dragging reconstructs synchronously on every input event

**Severity:** P1 conditional responsiveness; **close before P3-05 unless a
representative budget explicitly accepts it**.

Every native range `input` calls `seek()` immediately
(`viewer/replay-scrubber.ts:419-430,477-480`). A backward target reconstructs a
fresh engine from stage start (`core/playback.ts:303-354`). Browser pointer
movement can therefore request many full-stage replays in one rendering frame;
there is no latest-only queue or one-seek-per-RAF bound. This is the exact CPU
amplification called out before implementation
(`P3-05-SCRUBBER-VERIFICATION.md:376-381`).

On this machine, 20 alternating tick-0/tick-3301 input events took 23.4 ms total
with a 3.3 ms maximum individual dispatch. That is reassuring for this desktop
and authored generation, but it is not evidence for the supported narrow/mobile
surface or slow-device profile. It also measures scripted serial dispatch, not
input latency under an active pointer stream.

**Bounded fix:** pause on the first input, retain only the latest requested tick,
and perform at most one reconstruction per animation frame; commit the final
`change` target exactly. Alternatively, first record an agreed input/long-task
budget on representative minimum hardware and document why immediate seeks are
safe for every registered generation-2 stage.

**Acceptance:** a burst of 100 range inputs before one fake RAF causes at most
one `frameAt` reconstruction and lands on the last target. Browser tests cover
drag responsiveness at the longest stage on the low-end profile, with no
incorrect intermediate announcement and exact state on commit.

### TD8-G04 — One-tick controls appear to do nothing

**Severity:** P2 player-facing polish; not a closure blocker after G01–G03.

The compact controls expose `−1t`/`+1t` and accessible names “Back/Forward 1
tick” (`viewer/replay-scrubber.ts:217-225,481-484`). At 60 Hz the adjacent time
display floors to whole seconds (`:69-72,294`), the summary often does not
change, and the slider moves roughly 1/3,000 of its track. The current browser
test demonstrates the result: tick 0→1 while the live status still reads 0:00
(`tests/visual/competition-panel.visual.spec.ts:163-177`). For an arcade player,
`t` is unexplained and the action can look broken.

**Bounded improvement:** prefer ±1 second beside ±5 seconds. If exact proof
stepping is a real product requirement, label the buttons “Previous/Next frame”
and expose a small secondary `tick 1 of 3301` value so each press has perceptible
feedback; keep ticks subordinate to active time.

### TD8-G05 — Reduced-motion preference is captured only at renderer creation

**Severity:** P2 accessibility lifecycle cleanup.

Default renderer dependencies read the media preference when a renderer is
created, but the scrubber has no media-query change listener. Its only document
lifecycle listener is `visibilitychange` (`viewer/replay-scrubber.ts:171-180,
486-493`). A preference change during playback does not pause or rebuild the
same logical frame until another discontinuity happens. Current coverage checks
reduced motion only at initial render
(`tests/visual/competition-panel.visual.spec.ts:145-160`).

**Bounded improvement:** subscribe to the reduced-motion query for the mounted
lifetime; on change, pause, recreate presentation at the same stage/tick, retain
focus, and remove the listener on destroy. This is not a release blocker because
there is no autoplay and Play/Pause is always available.

## Timing and arcade-context assessment

The 4x default is appropriate. A canonical 6:01 run takes about 1:30 if watched
in full, while the last-stage-first default makes an authored stage's roughly
26–63 seconds of action a 7–16 second review. Explicit stage
selection and no cross-stage autoplay keep inspection optional and bounded.
Replay runs only inside the inert, safe-screen Shift Board, so it cannot add
ranked ticks or change the 5–15 minute gameplay duration.

The cumulative score at stage tick zero is correct carried-run state, but “0
served” beside “28,830 points” can initially look contradictory. When addressing
TD8-G02, label it “campaign score” or “score carried into this stage.” This is
copy polish, not a separate blocker.

## Evidence run

```text
npm test --workspace @arcadebench/maltline -- --run \
  tests/playback.test.ts tests/replay-scrubber.test.ts \
  tests/competition-client.test.ts tests/competition-controller.test.ts
  4 files, 81 tests passed

npm run build --workspace @arcadebench/maltline
  TypeScript and Vite build passed
```

The focused Playwright command initially encountered the shared port while
another process owned it. Existing integrated browser coverage was inspected,
and a separate headless browser against the current fixture reproduced TD8-G01
and measured TD8-G03 as reported above. No product or test file was changed.

## Required order to close P3-05

1. Reset semantic event state on terminal replay and add win/loss regression
   coverage (TD8-G01).
2. Expose the current player action outside the hidden canvas (TD8-G02).
3. Coalesce range seeks or approve them against a real slow-device budget
   (TD8-G03).
4. Close P3-05. Track tick-control clarity and live reduced-motion changes as
   P2 follow-up work (TD8-G04/G05).

## Superseding repair closure — 2026-09-10

This note preserves the findings above as historical evidence and supersedes
their original P3-05 closure recommendation. TD8-G01, TD8-G02, and TD8-G03 are
closed in the current tree.

- **TD8-G01 closed:** terminal Replay now seeks to tick zero and redraws from
  deterministic bounded presentation history, which also derives the latest
  event text for that frame (`viewer/replay-scrubber.ts:342-378,483-489`). The
  focused unit regression covers both won and lost terminal stages
  (`tests/replay-scrubber.test.ts:446-460`), and the integrated browser test
  confirms that a cleared-stage event is replaced by “No major event at this
  moment” at tick zero (`tests/visual/competition-panel.visual.spec.ts:228-243`).
- **TD8-G02 closed:** the semantic summary now identifies the active window,
  selected station, player action (hands free, blending progress, or held
  shake), and clean/washing/outbound/returning jar state outside the
  `aria-hidden` canvas (`viewer/replay-scrubber.ts:137-157,330-338`). Focused
  coverage locates and asserts blending, holding, outbound, and returning
  states (`tests/replay-scrubber.test.ts:411-444`); the no-canvas browser path
  also exposes the window and selected station.
- **TD8-G03 closed:** range `input` retains only the latest requested tick and
  schedules at most one seek per animation frame; `change` flushes the pending
  value, and stage selection, playback, and destruction cancel pending work
  (`viewer/replay-scrubber.ts:385-389,471-489,517-537,589-595`). The focused
  test sends 100 input events, observes one scheduled callback, and lands on
  the last value; lifecycle coverage proves destroy cancels the queued seek
  (`tests/replay-scrubber.test.ts:313-346,528-551`).

No gameplay/product blocker remains for closing P3-05. TD8-G04 (one-tick
control clarity) and TD8-G05 (live reduced-motion preference changes) remain
P2 follow-up polish; neither compromises proof fidelity, replay control, or
the optional replay's arcade pacing.

Repair verification run:

```text
npm test --workspace @arcadebench/maltline -- --run \
  tests/playback.test.ts tests/replay-scrubber.test.ts \
  tests/competition-client.test.ts tests/competition-controller.test.ts
  4 files, 85 tests passed

npm run test:visual --workspace @arcadebench/maltline -- \
  tests/visual/competition-panel.visual.spec.ts \
  --grep "replaying a terminal stage|canvas context"
  2 browser tests passed
```

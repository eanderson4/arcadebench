# TD-08: Retained-proof scrubber verification audit

Date: 2026-09-10

Scope: the settled P3-05 core playback implementation, composed browser client,
competition controller/panel, replay scrubber, public exports, and their focused
unit/browser/Worker integration evidence. Product code was reviewed read-only;
this report is the only audit change.

## Verdict and closure recommendation

**No retained-proof integrity, deterministic-coordinate, score-authority, or
stale-state correctness blocker was found. Close P3-05's deterministic/security
acceptance.**

The production path admits network data only through
`createVerifiedMaltlinePlayback(retainedEnvelope: unknown)`. That factory shares
the exact retained-envelope verifier, receives its authority and derived stage
results privately, and constructs playback only after canonical equality has
passed (`games/maltline/src/core/proof.ts:743-826`;
`games/maltline/src/core/playback.ts:372-386`). The competition client calls the
factory directly rather than casting a local replay or hashed wrapper
(`games/maltline/src/viewer/competition-client.ts:510-530`).

The core mapping is exact and bounded. Canonical RLE remains per-run, cumulative
run ends are indexed without per-tick expansion, stage start lives/score come
from verifier-derived terminal stages, frame count includes every distinct
stage-start state, and one private engine is rebuilt on a backward or cross-stage
seek (`games/maltline/src/core/playback.ts:139-248,251-369`). A terminal `step()`
returns `null`; it cannot silently enter the next stage.

Before the panel shows `INPUTS REPRODUCED`, the controller compares all eleven
current verifier-derived summary fields with the selected strict leaderboard
entry (`games/maltline/src/viewer/competition-controller.ts:346-387`). Panel
close, inspection replacement/dismissal, screen transition, and controller
destroy abort or generation-invalidate outstanding inspection and destroy the
active scrubber (`games/maltline/src/viewer/competition-controller.ts:197-221,
291-301,346-411,574-584`; `games/maltline/src/viewer/competition-panel.ts:192-200,
579-640`). A stale async result can consume bounded local work but cannot become
visible state.

TD8-R1 below should remain open as browser performance/availability hardening
before materially raising retained proof or campaign limits. TD8-C1 and TD8-T1
are cleanup/assurance items. None is a reason to keep P3-05 open, and none
permits an invalid proof or client-selected score to rank or display as
reproduced in the current product path.

## Verified properties

### Trust boundary and exports

- Retained input is an `unknown` envelope. The public factory has no scenario,
  run, summary, authority context, rich replay, or “already verified” overload
  (`games/maltline/src/core/playback.ts:372-386`).
- The internal detailed verifier is not re-exported by the package root. The
  root exposes the playback factory and immutable view types, while
  `proof.ts` is selectively exported (`games/maltline/src/index.ts:1-24`). The
  package exposes only root, competition-client, and test fixture subpaths
  (`games/maltline/package.json:7-11`).
- Passing the outer `HashedMaltlineProof` object instead of its envelope is
  rejected. Extra keys, outcome/input tampering, noncanonical adjacent RLE,
  continuation after loss, and one-over tick limits are also negative vectors
  (`games/maltline/tests/playback.test.ts:233-256`).
- The old rich local replay remains exported for local tooling, but neither
  client nor playback imports or parses it. Its caller-owned scenario/events/
  final state therefore do not cross the retained-proof boundary.

### Coordinate, RLE, and stage continuity

- Each reached stage has `ticks + 1` frames: tick zero plus one post-input frame
  per proof tick. `frameStart` advances by that value, while `runStartTick`
  advances by input ticks only (`games/maltline/src/core/playback.ts:207-248`).
  Thus prior-stage terminal and next-stage initial states have distinct frame
  ordinals but deliberately share the same consumed-input `runTick`.
- The frame-to-stage binary search selects the greatest stage start not after
  the frame. Both frame ordinal and exact `{stageIndex, stageTick}` coordinates
  reject non-safe or out-of-range values; coordinate objects reject extra keys,
  accessors, symbols by shape, arrays, and exotic prototypes
  (`games/maltline/src/core/playback.ts:92-137,282-301`).
- RLE lookup is one-based for applied inputs and chooses the first cumulative
  run end greater than or equal to the requested stage tick
  (`games/maltline/src/core/playback.ts:139-175`). Tick zero has null input and
  no events. A jump retains only the target step's events, preventing skipped
  presentation effects from being replayed.
- Playback constructs a stage directly from the frozen authority scenario and
  verifier-derived `{lives, score}`. It never attempts to restore an incomplete
  public `MaltlineState` snapshot (`games/maltline/src/core/playback.ts:196-248,
  303-354`).
- Static win/loss/mistake vectors pin all stage lengths, boundary uniqueness,
  full frame round trips, RLE-edge seeks, backward reconstruction, loss stage
  count, life carry, and terminal summary/state equivalence
  (`games/maltline/tests/playback.test.ts:101-231`).

### Mutation and score authority

- The canonical envelope was already deeply frozen by proof verification.
  Playback additionally freezes RLE inputs/offsets, stage sources/descriptors,
  returned positions, events, applied input, and complete state trees
  (`games/maltline/src/core/playback.ts:82-90,139-160,177-193,245-263`). Its
  mutable engine/cursor is held in ECMAScript private fields on a non-extensible
  instance.
- Mutation tests traverse and assert the full frozen result, attempt changes to
  score, position, and stage ticks, and then reproduce the same state/hash
  (`games/maltline/tests/playback.test.ts:279-292`).
- The scrubber displays intermediate `frame.state` as replay state only. The
  verified inspection heading and final result use the locally derived envelope
  summary after exact leaderboard comparison
  (`games/maltline/src/viewer/competition-panel.ts:370-395`;
  `games/maltline/src/viewer/replay-scrubber.ts:282-315`). The cursor has no
  storage, ranking, or submission operation.

### Async and presentation lifecycle

- Client fetch/read has a strict JSON media type, declared and streamed 128 KiB
  bounds, fatal UTF-8 decoding, timeout, AbortSignal relay, reader cancellation,
  and timer/listener cleanup (`games/maltline/src/viewer/competition-client.ts:
  399-458,562-607`).
- Inspection results are guarded by both the operation AbortSignal and an
  incrementing generation after local verification completes
  (`games/maltline/src/viewer/competition-controller.ts:346-411`).
- The scrubber preserves tick backlog but processes at most 32 simulation ticks
  per animation frame, stops at terminal stage state, never auto-crosses a
  stage, pauses on visibility loss, and cancels its animation/listener on
  destroy (`games/maltline/src/viewer/replay-scrubber.ts:335-417,444-493,
  533-539`).
- Discontinuous seeks recreate the presentation renderer instead of replaying
  skipped events; continuous adjacent playback feeds each step's events once
  (`games/maltline/src/viewer/replay-scrubber.ts:317-331,389-405,419-440`).

## Severity-ranked residual findings

### TD8-R1 — Verification and backward range seeks remain synchronous and non-abortable

Severity: **medium availability/interaction debt; not proof correctness and not
a current release blocker**

The verifier's bounded tick loop is synchronous
(`games/maltline/src/core/proof.ts:562-595`). The playback factory cannot observe
an AbortSignal (`games/maltline/src/core/playback.ts:372-386`), and the client's
network timeout/listener is cleared when bounded JSON reading returns, before
local proof verification begins (`games/maltline/src/viewer/competition-client.ts:
510-530,562-607`). A close/replacement is still safely ignored afterward by the
controller generation check, but it cannot interrupt CPU work already running.

Backward seek reconstructs from stage tick zero. The range `input` handler calls
that operation immediately for every browser event, without requestAnimationFrame
coalescing (`games/maltline/src/core/playback.ts:303-354`;
`games/maltline/src/viewer/replay-scrubber.ts:419-430,477-484`). Dragging backward
near a long stage can therefore request `O(event count * target tick)` engine
steps and temporarily prevent the close/abort event itself from running.
Protocol work is bounded—60,000 ticks/runs overall—and production retained JSON
has tighter transport/storage byte limits, so this is local responsiveness
rather than an unbounded memory or authority issue.

A diagnostic on this host (Node 22, 20 generation-2 win samples, not a CI
threshold) measured retained verification at 17.55 ms median/33.26 ms maximum
and a cold stage-5 terminal seek at 2.32 ms median/4.93 ms maximum. This is
healthy on the audit machine but does not establish low-end browser behavior or
adversarial repeated-drag cost.

Bounded fix/acceptance:

- coalesce range `input` to the latest value once per animation frame and cancel
  pending presentation work on close/destroy;
- measure retained verification, longest cold backward seek, and a sustained
  slider drag on the minimum supported device profile;
- if one operation exceeds the chosen interaction budget, move verification/
  seek to a module Worker or make replay execution cooperatively chunked without
  allowing wall time to affect engine results; and
- add a test that 100 rapid range updates simulate only the last scheduled
  target, plus a close-before-flush test.

Do not add restorable `MaltlineState` checkpoints as a shortcut; current state
snapshots omit transition-relevant private engine/RNG data.

### TD8-C1 — `frame.discontinuity` is cached traversal metadata with unstable semantics

Severity: **low contract debt; unused by the current viewer**

`frameAt` returns the previously cached frame unchanged when asked for the same
position (`games/maltline/src/core/playback.ts:303-311`). That frame's
`discontinuity` bit was computed from the operation that originally reached it
(`games/maltline/src/core/playback.ts:312-346`). Concrete counterexample:
`frameAt(tick 0)`, `step()` to tick 1, then `frameAt(tick 1)` again returns the
same object with `discontinuity: false`, even though the last call was not an
adjacent `+1` transition. A future presentation consumer could use the false
bit to apply tick-1 events twice.

The actual scrubber does not read this field; it explicitly passes `true` for
seek/stage operations and handles `step()` events in the adjacent playback loop
(`games/maltline/src/viewer/replay-scrubber.ts:317-331,389-405,419-448`). There
is therefore no current duplicate effect or integrity failure.

Bounded fix/acceptance: preferably remove `discontinuity` from immutable frame
data and return transition metadata from a separate cursor operation. Otherwise
return a fresh wrapper whose bit describes the current call. Test repeated same-
tick access after an adjacent step, backward seek, and explicit stage selection.

### TD8-T1 — The composed Worker-to-browser playback test stops at the loss vector

Severity: **low assurance gap**

Core tests exercise the static eight-stage win and mistake proofs, and scrubber
tests use the full winning playback. The real Worker/D1/R2/browser-client
composition currently submits, reloads, and seeks only the one-stage loss proof
(`apps/platform/tests/maltline-worker.integration.test.ts:233-273`). The Worker
budget suite separately verifies win/mistake proofs, but it does not compose a
retained full-campaign object through `client.loadReplay`.

This does not undermine the shared verifier or deterministic tests, but one
static full-win composed case would protect future serialization/export wiring.

Bounded acceptance: retain and retrieve the static generation-2 win through the
real Worker test, assert its existing canonical hash and all summary fields,
then seek the first stage boundary, a later RLE boundary, and final frame through
the returned public playback object. Keep performance ceilings in the dedicated
budget suite rather than adding a tight stopwatch assertion.

## Non-findings and deferred boundaries

- The duplicate `runTick` at a stage transition is intentional and not an
  off-by-one error; unique `frameOrdinal` distinguishes both states.
- The root still exports engine and rich local replay utilities, but neither can
  instantiate the private playback cursor or enter the competition inspection
  state. Removing those unrelated APIs is unnecessary.
- `mountMaltlineReplayScrubber` accepts a structural
  `VerifiedMaltlinePlayback`, but it is a viewer-internal source module and not a
  package export. The production caller supplies only the client's factory
  result. Keep it internal; if it ever becomes a public subpath, add an opaque
  core-created capability/brand or accept an unknown envelope there instead.
- A structurally valid envelope for a different entrant with the same summary
  is not independently attributable by browser simulation alone. D1/R2 binds
  score ID to proof hash on the server; UI/docs correctly claim inputs were
  reproduced, not that local replay proves entrant identity or human play.
- No proof/envelope/ruleset/campaign version bump is warranted. The playback
  view is derived and not serialized.

## Audit evidence

Executed against the current shared tree:

- focused Vitest: `playback`, `replay-scrubber`, `competition-client`, and
  `competition-controller` — **4 files, 81 tests passed**;
- full Maltline Vitest — **25 files, 416 tests passed**;
- focused Chromium Playwright: competition-controller and competition-panel —
  **23 tests passed**;
- Maltline TypeScript/Vite build — **passed**; and
- Node diagnostic described in TD8-R1 — completed without modifying artifacts.

The first Playwright invocation encountered the already-occupied fixed Vite
port; after the concurrent process exited, the exact command was rerun and all
23 tests passed. No product or test file was changed by this audit.

## Repair verification — 2026-09-10 (superseding note)

This note re-audits the subsequent TD8-R1/TD8-C1 repairs against the current
tree. It supersedes the status of those findings without removing their
historical evidence.

### Verdict

**TD8-C1 is closed. The range-input portion of TD8-R1 is closed. TD8-R1 remains
partially open because deterministic presentation reconstruction introduces a
different per-frame CPU multiplier.** No cursor corruption, stale proof state,
score-authority regression, or lifecycle correctness blocker was found. The
earlier recommendation to close P3-05's deterministic/security acceptance
stands, but the new presentation work should be bounded before calling the
interaction/resource finding fully closed.

### TD8-C1 — closed

`discontinuity` has been removed from `MaltlinePlaybackFrame` and from frame
construction (`games/maltline/src/core/playback.ts:35-45,176-191`). The cursor
now returns only immutable deterministic frame facts; traversal/presentation
policy is owned by the viewer. Repeated same-position access can no longer
return stale transition metadata. Core RLE, backward rebuild, terminal-step,
coordinate, and deep-freeze tests remain intact
(`games/maltline/tests/playback.test.ts:150-176,276-289`).

### TD8-R1 range admission — closed

Range `input` stores only the latest finite value and schedules at most one
animation callback. `change` synchronously flushes the pending value before it
announces the committed frame. Programmatic seek, stage selection, playback
restart, and destroy cancel any pending range operation
(`games/maltline/src/viewer/replay-scrubber.ts:380-402,454-489,517-541,
589-596`). A canceled callback that executes non-cooperatively sees a cleared
pending value and cannot restore an older tick.

The focused test sends 100 range inputs, observes one pending callback, and
commits only tick 123; destroy separately cancels a queued range callback and
is idempotent (`games/maltline/tests/replay-scrubber.test.ts:313-346,528-551`).
This removes the original `O(raw input events * target tick)` drag path. The
factory's bounded verification pass remains synchronous/non-abortable as
previously documented, but normal generation-2 measurements did not make that
a correctness or current launch blocker.

### Residual TD8-R1 — presentation history is time-bounded but replay work is not

The new 1,400 ms presentation reconstruction correctly makes canvas output
independent of display cadence and bounds retained visual-effect history to 84
ticks at the current 60 Hz campaign (or 168 ticks at the ranked 120 Hz policy
ceiling). Tests compare direct seek with 60 Hz and 144 Hz playback in both
normal and reduced motion (`games/maltline/src/viewer/replay-scrubber.ts:12-17,
342-378`; `games/maltline/tests/replay-scrubber.test.ts:348-408`). It does not
retain an unbounded snapshot or event history.

However, every `draw()` first asks the sole playback cursor for
`targetTick - historyTicks` and then steps back to the target
(`games/maltline/src/viewer/replay-scrubber.ts:342-370`). When the cursor is
already at the target, that is a backward seek. The core must construct a fresh
engine and replay from stage tick zero for any backward seek
(`games/maltline/src/core/playback.ts:300-347`). Therefore the actual simulation
cost of each draw is approximately `targetTick`, not `historyTicks`.

Concrete counterexample: at stage tick 3,000 and 60 rendered frames per second,
continuous playback re-executes roughly 180,000 engine ticks per second before
canvas drawing. At the 60,000-tick protocol ceiling the shape is materially
larger. The cursor is restored to the exact target at the end of the history
loop, so subsequent `step()` remains correct; this is a CPU/interaction issue,
not state corruption.

Treat this as a **medium resource hardening blocker for closing TD8-R1**, not a
proof/security release blocker. The bounded repair is to keep one persistent
renderer during adjacent playback and advance its presentation clock by one
fixed simulation-tick duration for every `playback.step()`. Rebuild the renderer
from the bounded history window only after a discontinuous seek, stage change,
or replay restart. That preserves cadence-independent visuals while making
continuous cost `O(new simulation ticks)` rather than `O(elapsed stage ticks per
display frame)`.

Acceptance:

- instrument a late-stage 60/90/120/144 Hz playback and prove engine-step count
  is bounded by initial reconstruction plus newly advanced ticks, not target
  tick multiplied by rendered frames;
- retain exact direct-seek versus continuous-play canvas equality in normal and
  reduced motion;
- retain latest-only range scheduling, pending-change flush, destroy
  cancellation, terminal stop, and no automatic cross-stage step; and
- keep presentation reconstruction derived from verified frames only—do not
  add incomplete `MaltlineState` restoration checkpoints.

### Recheck evidence

- focused Vitest (`playback.test.ts`, `replay-scrubber.test.ts`) — **2 files,
  24 tests passed**;
- Maltline TypeScript/Vite build — **passed**; and
- read-only control-flow audit confirmed each presentation rebuild leaves the
  private cursor at the selected target and every teardown clears animation and
  range handles.

No product or test file was changed during this repair verification.

## Repair verification — 2026-09-10 (second superseding note)

This note supersedes the provisional **Residual TD8-R1** conclusion immediately
above. That conclusion described an intermediate implementation and is no
longer true in the current tree.

### Final verdict for TD8-R1/TD8-C1

**TD8-R1 and TD8-C1 are closed.** No cursor-corruption, unbounded-history, or
scrubber lifecycle correctness blocker remains in this tranche. The original
P3-05 deterministic/security closure recommendation therefore stands without
the provisional presentation-CPU qualification.

The previous counterexample—one backward `frameAt()` plus replay from stage
start on every display frame—cannot occur now. `draw()` iterates only the
already-materialized `presentationFrames` ring and never calls
`playback.frameAt()` or `playback.step()`
(`games/maltline/src/viewer/replay-scrubber.ts:372-394`). Continuous playback
advances the sole verified cursor exactly once per simulation tick and appends
that returned frame to the ring (`:434-468`). Thus drawing cannot move the core
cursor behind the displayed frame, and the next continuous step starts at the
correct successor.

`moveToFrame()` is now confined to explicit seek, stage selection, and terminal
restart paths (`:347-361,471-505`). It performs one authoritative `frameAt()` at
the bounded presentation-history start and advances at most that history
window to the selected target. `appendPresentationFrame()` evicts older frames
as playback advances (`:363-370`). The frozen generation-2 campaign therefore
retains at most 84 presentation frames (1,400 ms at 60 Hz); the policy remains
formula-bounded for a registered scenario with a different permitted tick
rate. A seek may still pay the already-documented bounded cold-rebuild cost
once, but neither a range-event burst nor subsequent display frames multiply
that cost.

Range admission and teardown also retain the first superseding note's closure:
the latest value is committed once per scheduled callback, while explicit
operations and `destroy()` cancel pending range work. The current
instrumentation sends 100 range events, observes exactly one `frameAt()` call,
then runs continuous playback and observes zero `frameAt()` rewinds
(`games/maltline/tests/replay-scrubber.test.ts:348-386`). Existing tests retain
seek/play drawing equivalence at 60 Hz and 144 Hz in normal and reduced-motion
modes, plus cancellation and terminal/stage boundary coverage.

Recheck evidence:

- focused Vitest (`playback.test.ts`, `replay-scrubber.test.ts`) — **2 files,
  25 tests passed**; and
- Maltline TypeScript/Vite build — **passed**.

Only this audit document was changed during the second repair verification.

# P3-05: Retained-proof tick scrubber verification design

Date: 2026-09-10

Status: design recommendation; no product code changed

## Decision

Build the scrubber as a view over a **fully re-verified retained envelope**, not
as a richer replay parser. Its only public creation path should accept
`unknown`, call `verifyAndHashMaltlineProofEnvelope`, resolve the frozen campaign
authority, and finish canonical proof/outcome validation before it creates a
playback cursor or exposes a frame. The cursor should retain canonical RLE,
verified stage metadata, and at most one live `MaltlineEngine`; it must not
expand the proof into per-tick inputs or retain a full-state snapshot for every
tick.

This design preserves the existing security statement: the server and local
facade derive the ranked outcome from the registered campaign, while the
scrubber only reproduces that already-verified execution at a selected tick.
It does not create a second score authority.

No proof, envelope, ruleset, campaign, or authority version should change for
this feature. A future serialized playback index or restorable engine
checkpoint would need its own version bound to the authority configuration
digest.

## Current facts that constrain the design

- The retained format is input-only RLE. A proof supplies stage IDs and input
  runs, while the authority supplies the ordered campaign and initial run
  (`games/maltline/src/core/proof.ts:56-87`).
- The core verifier already strictly normalizes the proof, enforces stage
  order, replays every input, rejects input after terminal state and nonterminal
  prefixes, and derives stage/summary fields
  (`games/maltline/src/core/proof.ts:490-643`).
- The retained-envelope facade resolves and self-checks the registered
  authority, rebuilds the canonical envelope, and requires exact canonical
  equality with the retained value (`games/maltline/src/core/proof.ts:735-798`).
- Ranked limits are 32 stages, 60,000 RLE records, 60,000 ticks per stage, and
  60,000 ticks overall (`games/maltline/src/core/proof.ts:29-54`). The fixed
  generation-2 authority contains eight normalized stages, its exact initial
  run, rules, RNG identity, and configuration digest
  (`games/maltline/src/core/authority.ts:39-67,99-170`).
- The browser reads at most 128 KiB of JSON and `loadReplay` already invokes the
  retained-envelope verifier (`games/maltline/src/viewer/competition-client.ts:397-439,508-528`).
  The production Worker retains at most 75,000 canonical bytes. The core bounds
  remain necessary for non-HTTP callers.
- `MaltlineEngine.snapshot()` is a renderable state, not a resumable engine
  checkpoint. It omits at least RNG position, `prevServe`, and `nextId`, all of
  which affect future execution (`games/maltline/src/core/engine.ts:33-69,95-124`).
  Restoring from `MaltlineState` would therefore silently fork the simulation.
- The rich local replay is unsuitable for this trust boundary. It embeds a
  caller-supplied scenario, run, events, and final state, and its parser only
  normalizes tick inputs (`games/maltline/src/core/replay.ts:6-52`). It must not
  be used to inspect a retained ranked proof.

For scale, the checked-in generation-2 fixtures currently have these shapes:

| Vector | JSON bytes (proof only) | Stages | RLE records | Input ticks | Playback frames |
| --- | ---: | ---: | ---: | ---: | ---: |
| win | 58,016 | 8 | 857 | 21,662 | 21,670 |
| loss | 187 | 1 | 1 | 1,854 | 1,855 |
| one-walkout win | 60,064 | 8 | 888 | 22,400 | 22,408 |

“Playback frames” includes one initial state for every reached stage; those
stage-boundary states are not input ticks.

## Trust flow and invariants

The required order is:

1. bounded HTTP byte read and JSON parse;
2. strict retained-envelope verification and canonical reconstruction;
3. exact comparison of every derived summary field with the selected
   leaderboard entry;
4. construction of private playback metadata from the verified canonical proof
   and resolved authority;
5. deterministic seek/replay; and
6. rendering with language such as “reproduced state” or “reproduced score.”

No cursor, frame, stage index, renderer state, or event effect may become
observable before steps 1-3 complete. The current controller performs the full
summary comparison at `games/maltline/src/viewer/competition-controller.ts:346-385`;
the scrubber integration must retain that gate.

The implementation should enforce these invariants:

1. The untrusted envelope cannot provide scenarios, RNG, rules, initial lives,
   initial score, events, snapshots, stage summaries, or checkpoint state.
2. Only `verifyAndHashMaltlineProofEnvelope` semantics can admit retained data.
   `parseMaltlineReplay`, a TypeScript cast, or a caller-constructed
   `HashedMaltlineProof` is not an admission boundary.
3. Playback uses the exact resolved authority whose identity is embedded in and
   covered by the retained envelope hash.
4. Every displayed state is either a fresh stage tick-zero engine snapshot or
   the result of applying exactly the first *n* canonical stage inputs in the
   engine's protocol order.
5. Stage *i + 1* starts from `{ lives, score }` derived at the terminal state of
   stage *i*. It never starts from a submitted or leaderboard value.
6. A proof ending in loss has no later stage. A winning stage has a following
   stage unless it is the last registered campaign stage; these properties have
   already been checked before playback metadata is built.
7. The canonical proof stays RLE. No API returns or internally creates an
   array with one object per input tick.
8. Returned states/events cannot be mutated to corrupt later seeks. Return a
   fresh detached snapshot, or deep-freeze a snapshot that is never used as
   mutable engine state.
9. Seeking and presentation have no effect on ranked submission, leaderboard
   order, the retained envelope, its SHA-256, or the authoritative summary.
10. Nonce remains an envelope/submission binding only; it is not simulation
    input, freshness, entrant identity, or proof of human play.

## Exact timeline model

A scalar “global tick” alone is insufficient. At a stage boundary, the prior
stage's terminal state and the next stage's initial state have consumed the
same number of run inputs but are different states and scenarios. The core API
must use `{ stageIndex, stageTick }` as its canonical coordinate and may offer a
unique frame ordinal for a whole-run slider.

For stage `i`, let:

- `T[i]` be its verified number of input ticks;
- `runStart[i] = sum(T[j])` for `j < i`; and
- `frameStart[i] = sum(T[j] + 1)` for `j < i`.

Then a position with `0 <= stageTick <= T[i]` maps to:

- `runTick = runStart[i] + stageTick`;
- `frameOrdinal = frameStart[i] + stageTick`; and
- total `frameCount = verifiedSummary.totalTicks + reachedStageCount`.

`frameOrdinal` is zero-based and unique. `runTick` is the count of inputs
consumed and intentionally duplicates at a stage boundary. The API must not
pretend otherwise.

Frame semantics are also exact:

- `stageTick === 0`: initial engine snapshot, `appliedInput: null`, `events: []`;
- `stageTick === n > 0`: state **after** the `n`th stage input and the events
  emitted by that step; and
- `stageTick === T[i]`: the terminal state. There is no post-terminal input or
  synthetic transition tick.

For the static win, stage 1 ends at frame 1,558 with `runTick` 1,558. Stage 2
begins at frame 1,559, also with `runTick` 1,558. The final state is frame
21,669 (`frameCount` 21,670), stage index 7, stage tick 3,301, and `runTick`
21,662. This should be a pinned regression vector.

Elapsed time, if displayed, must sum `stageTick / scenario.ticksPerSecond` per
stage. It must not divide a whole-run tick by a presumed global rate.

## Recommended API shape

Keep construction and authority resolution inside `core`; do not export a
constructor that accepts a structurally forgeable “verified” object.

```ts
export interface MaltlinePlaybackPosition {
  readonly stageIndex: number;
  readonly stageTick: number;
}

export interface MaltlinePlaybackStage {
  readonly stageIndex: number;
  readonly stageId: string;
  readonly name: string;
  readonly ticks: number;
  readonly runStartTick: number;
  readonly frameStart: number;
  readonly terminalStatus: 'won' | 'lost';
  readonly startLives: number;
  readonly startScore: number;
  readonly endLives: number;
  readonly endScore: number;
}

export interface MaltlinePlaybackFrame {
  readonly position: MaltlinePlaybackPosition;
  readonly frameOrdinal: number;
  readonly runTick: number;
  readonly appliedInput: Readonly<MaltlineInput> | null;
  readonly events: readonly GameEvent[];
  readonly state: Readonly<MaltlineState>;
  readonly discontinuity: boolean;
}

export interface VerifiedMaltlinePlayback {
  readonly verification: HashedMaltlineProof;
  readonly stages: readonly MaltlinePlaybackStage[];
  readonly frameCount: number;
  readonly totalInputTicks: number;
  positionAtFrame(frameOrdinal: number): MaltlinePlaybackPosition;
  frameAt(position: MaltlinePlaybackPosition): MaltlinePlaybackFrame;
  frameAtOrdinal(frameOrdinal: number): MaltlinePlaybackFrame;
}

export async function createVerifiedMaltlinePlayback(
  retainedEnvelope: unknown,
): Promise<VerifiedMaltlinePlayback>;
```

All numeric method arguments require runtime checks for finite safe integers
and exact bounds. If position objects cross an untrusted/message boundary,
require exactly `stageIndex` and `stageTick`, enumerable data properties, with
no symbols or accessors.

Internally, factor a private detailed verification operation shared by
`verifyAndHashMaltlineProofEnvelope` and the new factory. It may return the
existing `VerifiedMaltlineStage[]` and resolved authority to trusted core code
after verification. It must not expose a public helper that turns arbitrary
`HashedMaltlineProof`, `VerifiedMaltlineSummary`, or stage objects into a
cursor. This avoids both a second full validation replay and the mistaken idea
that a structural TypeScript type is a security capability.

The competition client can eventually expose a composed `loadPlayback` method
that performs the bounded read and calls this factory. Existing `loadReplay`
may remain for summary inspection. The controller must still compare the
factory's verified envelope summary with the chosen leaderboard row before it
reveals scrubber controls.

## Cursor algorithm

After validation, build only small stage descriptors and cumulative RLE end
offsets. Use binary search over a stage's RLE end offsets to locate an input;
do not call `replayMaltline` and do not expand `ticks` repeats.

Maintain one private cursor:

- On first access, stage change, or a backward seek, construct a new
  `MaltlineEngine(authority.campaign[stageIndex], derivedStageStartRun)` and
  replay from stage tick zero to the target.
- On a forward seek in the current stage, advance the existing engine by the
  delta.
- Retain only the target step's events. Intermediate events traversed by a jump
  are not presentation events and must not be replayed into audio, particles,
  announcements, or vibration.
- Mark a non-adjacent move or stage change as a discontinuity. The viewer must
  call the renderer's existing `resetPresentation()` before drawing it; only an
  adjacent `+1` playback step may feed `pushEvents` normally
  (`games/maltline/src/viewer/renderer.ts:167-181,191-241`).
- Never resume from `MaltlineState`. Current snapshots are safe render values
  but incomplete transition state.

This yields `O(R)` metadata memory for `R` canonical input runs, `O(log R)`
input lookup, `O(delta)` forward stepping, and `O(target stageTick)` rebuilds
for backward seeks. Switching stages can start directly from the verifier-
derived run context; it need not replay prior stages.

For responsive UI, coalesce pointer/keyboard seek requests to the newest target
and guard completions with the same generation/abort pattern used by retained
inspection. A dedicated module Worker is preferable if measured worst-case
60,000-tick rebuilds block the main thread. Worker scheduling must not enter
simulation inputs or results. If initially kept on the main thread, ship only
after a low-end-device benchmark establishes an interaction budget and the UI
does not execute a full backward rebuild for every raw pointer event.

## Resource and checkpoint policy

The scrubber must inherit, never loosen, all proof verifier limits. Additionally:

- retain canonical input runs and cumulative integer offsets only;
- keep one live engine and one detached result frame;
- cap outstanding seek work at one operation and replace it with the latest
  request;
- do not retain event history, per-tick inputs, or per-tick snapshots;
- discard all cursor/renderer state when the inspection closes, the selected
  score changes, verification aborts, or the retained object becomes
  unavailable; and
- benchmark exact-limit shapes as well as normal static fixtures.

A snapshot cache is not a checkpoint cache. Full-state resume would first
require a core-owned, versioned `MaltlineEngineCheckpoint` containing every
transition-relevant private field, including serializable RNG state. Its schema
would need strict validation, authority/rules/RNG binding, a byte/count budget,
and equivalence tests against uninterrupted execution. Until that separate work
exists, stage boundaries are the only safe random-access anchors.

## Score and verification language

The retained envelope's locally re-derived summary remains the inspection
verdict. The selected frame's `state.score`, `state.lives`, and counters are
deterministic intermediate observations, not a new leaderboard result. UI code
must not:

- overwrite the selected leaderboard row from a scrubbed frame;
- describe a frame as server-authoritative or independently authenticated;
- enable submission from retained playback state; or
- imply that the nonce proves recency, identity, or human play.

Recommended labels are “Inputs reproduced,” “Reproduced score at this tick,”
and “Final verified result.” Keep callsign/score-ID metadata outside the core
cursor; the browser's exact row-summary comparison is the binding between the
selected listing and the verified retained result.

## Required tests

### Admission and canonicalization

1. Each static retained win/loss/mistake envelope passes the public factory and
   yields the already-pinned SHA-256 and summary.
2. Summary tampering, proof tampering, extra/missing keys, unsupported envelope
   or authority identity, wrong stage order, input after terminal, nonterminal
   prefixes, cycles, accessors, exotic prototypes, nonfinite values, and
   one-over resource limits reject before any frame/cursor becomes observable.
3. A noncanonical retained envelope with split adjacent identical runs rejects
   exact canonical equality. The equivalent unretained submission proof may be
   canonicalized by `verifyAndHashMaltlineProof`; do not conflate these paths.
4. Spy/instrumentation proves the playback metadata builder and renderer are
   not called when retained verification fails.

### Coordinate and determinism vectors

5. Pin the generation-2 win stage tick vector
   `[1558, 1621, 1881, 3120, 3766, 3103, 3312, 3301]`, total input ticks
   `21,662`, frame count `21,670`, the first boundary mapping above, and the
   final frame mapping.
6. Round-trip every valid `(stageIndex, stageTick)` through frame ordinal and
   back for all three static fixtures. Assert monotonic frame ordinals and the
   intentional duplicate `runTick` at every stage transition.
7. For every stage, assert tick-zero input/events, first post-input state,
   terminal state, and rejection at `-1` and `T[i] + 1`.
8. Seek the same targets in ascending, descending, random, and repeated order;
   compare complete states and target-step events with uninterrupted fresh
   engine execution.
9. Place RLE boundaries around `serve: false -> true`, movement repeats, blend
   completion, life loss, and stage terminal ticks. This catches off-by-one and
   edge-trigger errors involving `prevServe`.
10. The loss vector exposes exactly one stage and 1,855 frames; later-stage
    coordinates reject. The mistake vector carries its verified reduced lives
    and accumulated score into the next stage's tick-zero state.
11. Mutating a returned state, event, input, position, or stage descriptor does
    not change any subsequent frame, canonical envelope, or hash.
12. Run identical coordinate vectors in Node/Vitest and a real browser. Compare
    canonical selected state/event fixtures rather than screenshots alone.

### Viewer and resource behavior

13. Rapid seeks, score changes, panel close, abort, and late worker responses
    cannot display a stale frame or trigger stale audio/effects.
14. Non-adjacent seeks reset presentation and emit no intermediate effects;
    adjacent play emits the target tick's events exactly once.
15. Exact verifier limits are accepted where a terminal proof can validly meet
    them, one-over shapes reject, and no expanded per-tick array or state trace
    is allocated. Record peak heap for canonical worst-case RLE and maximum-
    entity engine state.
16. Record worst-case verification, forward play, last-tick cold seek, and
    repeated backward-scrub timings in production-equivalent browser hardware.
    Use a generous CI regression ceiling; reserve interaction-jank assertions
    for browser performance coverage rather than a flaky unit-test stopwatch.

## Prioritized risks and acceptance order

### P0 — Trust-boundary bypass

Do not build playback from `parseMaltlineReplay`, caller-supplied scenarios,
caller-supplied summaries, or a public constructor taking
`HashedMaltlineProof`. Acceptance is one public async factory from `unknown`
retained data through exact envelope verification, with negative tests proving
zero observable playback on rejection.

### P0 — Ambiguous stage boundaries

A whole-run slider based only on total input ticks cannot represent both the
terminal prior-stage state and next-stage tick zero. Acceptance is the dual
coordinate/frame-ordinal model, pinned boundary vectors, and runtime rejection
of invalid positions.

### P1 — Invalid checkpoint restoration

`MaltlineState` cannot resume the engine. Acceptance for the first tranche is
stage-boundary reconstruction only. Any finer checkpoint work is a separate,
versioned engine feature with uninterrupted-equivalence tests.

### P1 — Main-thread CPU amplification

Verification already performs up to 60,000 engine ticks, and adversarial slider
movement could multiply that cost with repeated backward seeks. Acceptance is
latest-only seek scheduling, one in-flight operation, measured low-end budgets,
and a Worker boundary if the measurement shows interaction blocking.

### P1 — Score-authority ambiguity

Intermediate frames must never replace or re-rank the verified final summary.
Acceptance is exact selected-row comparison before controls appear, explicit
reproduction labels, and tests showing playback cannot enter the submission
path.

### P2 — Presentation nondeterminism

Renderer particles use presentation time/randomness and accumulate event
effects. That is acceptable visual decoration, but it is not proof state.
Acceptance is reset-on-discontinuity and deterministic state/event assertions
separate from screenshot effects.

## Recommended implementation sequence

1. Factor a private detailed retained-verification result without broadening the
   public low-level verifier surface.
2. Add the core playback factory, exact coordinate model, RLE index, and
   stage-boundary cursor with unit/adversarial tests.
3. Add a composed competition-client method and preserve the controller's full
   leaderboard-summary comparison and stale-operation guards.
4. Add the viewer scrubber with discontinuity resets and no submission path.
5. Benchmark maximum work in browser conditions; move seek execution to a
   module Worker if the measured budget requires it.

This is sufficient for a strict first retained-proof scrubber. Arbitrary engine
checkpoints, serialized trace caches, and proof-authorship or proof-of-human
claims are explicitly out of scope.

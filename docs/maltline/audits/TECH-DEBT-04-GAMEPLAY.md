# TD-04 — Maltline Gameplay and Control Review

**Review date:** 2026-09-10
**Scope:** settled EXP-036/037 generation-2 gameplay, the viewer input adapter,
engine/proof fidelity, deferred serve buffering, campaign/player-model evidence,
scoring/recovery, and readiness for human playtests.
**Disposition:** review only. This report is the only file created; no product,
test, task, experiment, viewer, proof, or sitemap file was changed.

## Verdict

There is no new deterministic-engine or proof-correctness blocker. The viewer
now plays the same deeply frozen campaign as telemetry and verification. Its
direction adapter fixes phase-dependent lost taps, is driven only by simulation
ticks, emits ordinary `MaltlineInput`, and records the exact emitted input before
each engine step. A replay therefore reconstructs the engine path without
needing to understand physical keys. Fatal resolution, finite re-service,
score-ledger, counter, and terminal-immutability tests remain green.

The build is suitable for an **exploratory, observed** human session, but not yet
for decision-grade balance conclusions. Two issues block interpreting a miss or
loss as campaign difficulty:

1. serve remains an unbuffered level feeding an edge-triggered engine action, so
   a quick tap can disappear and a press held shortly before `READY` can consume
   its edge without launching the completed shake; and
2. all current player-model distributions bypass the physical-key adapter. The
   adapter's delayed hold-repeat policy is behaviorally material, so the bot
   results validate the core campaign, not the shipped controls.

There is no gameplay reason to block local prototype use or input-only proof
verification. Public leaderboard/platform readiness still depends on the
separate Worker findings and is outside this audit.

## Fresh evidence

```text
npm test --workspace games/maltline -- --run \
  tests/viewer-input-adapter.test.ts tests/engine.test.ts \
  tests/scoring-resolution.test.ts tests/campaign-telemetry.test.ts \
  tests/player-models.test.ts tests/proof.test.ts tests/authority.test.ts
  7 files, 104 tests passed

npm run --silent telemetry --workspace games/maltline | sha256sum
  450e81685c2934dbefb15ae4f233f2970b7a950cb117cfea20c9ee07aa499aa7

npx tsx games/maltline/tools/player-model-comparison.ts | sha256sum
  51dbc5dfd99435426f6e90eb78b7d3159e5f4e3a3b3561240a441ca6acf1a745
```

The focused checks preserve the registered canonical result: 8/8 stages,
21,662 ticks, 361.033 active seconds, score 36,255, four lives, 145 fulfilled
and resolved customers, and no losses. The 33-run distributions also retain
reactive 33/33 wins, delayed-competent 31/33, and novice 0/33.

Three small public-API diagnostics reproduced the outstanding semantics:

- Holding Space from tick 1 and pressing/holding F at tick 45 completes the
  shake on tick 46, but produces zero `shake_launched` events. State at tick 46
  has `holding: "vanilla"` and `currentInput.serve: true`; the serve edge was
  consumed on tick 45 while nothing was held. A subsequent F down/up entirely
  between ticks also produces no launch.
- A raw held station direction reaches station 2 at tick 10. The same intended
  hold through the viewer adapter is at station 1 on ticks 5, 10, and 15, and
  reaches station 2 on tick 20. This matches the authored 15-tick initial
  repeat delay, but proves the core controller and physical control policies
  are not interchangeable.
- A reachable one-customer late-service scenario finishes with
  `fulfilled: 1`, `walkouts: 1`, `resolved: 1`, and `exited: 0`: the fulfilled
  customer returned to the line and then walked out. Current stage-clear copy
  would render this as “1 served, 1 walked out” for one authored order.

For an audit-only sensitivity check, I mapped each reference controller's
desired levels to key down/up transitions and passed those through the actual
viewer adapter before stepping the engine. This is not a human model or a new
canonical result; it isolates the adapter boundary:

| Controller intent through viewer adapter | Outcome | Active ticks / seconds | Losses |
| --- | --- | ---: | --- |
| Reactive v1 | Lost in Stage 7, 17/27 fulfilled there | 17,627 / 293.783 | Stage 5: 1 shake + 2 jars; Stage 7: 1 fatal jar |
| Delayed competent v1 | Won 8/8, score 36,005, 3 lives | 22,613 / 376.883 | 1 walkout |

The surprising inversion—perfect raw reactive play loses while the nominally
delayed profile wins—does not show that the adapter is wrong. It shows that bot
distributions which never traverse the adapter cannot validate its feel or be
used as control-adjusted human difficulty evidence.

## What is sound and should be preserved

- `src/viewer/main.ts:29-51,122-139` selects the registered authority campaign,
  creates the adapter from the same scenario cadence, and records adapted input.
- `src/viewer/main.ts:116-120,141-176,269-305,365-408` resets queued and held
  input across cards, countdown, stage changes, interruption, focus, visibility,
  width changes, and restart.
- `src/viewer/viewer-input-adapter.ts:32-40,98-164` bases navigation only on the
  requested simulation tick: a fresh tap survives to the next eligible tick,
  held input waits three repeat intervals, and native keyboard repeat cannot
  perturb the schedule.
- `src/viewer/main.ts:428-445` obtains one adapted input for every stepped tick,
  copies it into the stage trace, then steps exactly once. `src/core/replay.ts:9-26`
  and `src/core/proof.ts:554-613` replay those same per-tick primitives.
- `src/core/engine.ts:126-140,220-386` stops score/life resolution on the fatal
  event and treats terminal steps as immutable. `tests/scoring-resolution.test.ts`
  covers first-only score, one requeue, finite resolution, walkouts, fatal event
  order, no post-death score, and terminal calls.
- Telemetry and player-model defaults now use
  `MALTLINE_GENERATION_2_AUTHORITY.campaign` (`src/telemetry/campaign-telemetry.ts:291-305`,
  `src/telemetry/player-model-comparison.ts:152-178`), closing the prior mutable
  campaign split.

## Blockers before decision-grade human tuning

### TD4-G01 — Serve edges are still lossy at the physical-input boundary

**Severity:** P1 control fairness. **True blocker before attributing human
failures to difficulty; not a core/proof release blocker.**

**Evidence:** `src/core/types.ts:6-16`, `src/core/engine.ts:155-180`,
`src/viewer/viewer-input-adapter.ts:32-40,98-117`,
`docs/maltline/GAMEPLAY-FLOW.md:37-41`

Directions are latched, but blend and serve remain sampled held levels. The
engine consumes every false-to-true serve transition even when `holding` is
null. A press one tick before blend completion sets `prevServe`; when completion
creates `holding` on the next tick, the still-held button has no new edge. A
down/up pair between sampled ticks is invisible. Both cases feel like a dropped
button, and a player can lose an order or life despite acting near the visually
correct moment.

**Bounded fix:** keep core proof semantics unchanged and add a viewer-owned
one-shot serve latch. Arm only on a fresh physical keydown during a current
blend or while a shake is held; preserve a released tap across sampling; emit
exactly one `serve: true` tick once pre-step state has `holding !== null`, then
force a false tick before another edge. Explicitly discard a press made while
neither blending nor holding so it cannot auto-launch a future shake. Reset it
on every boundary already handled by `reset()`.

**Acceptance tests:** tap wholly between frames; press on each of the final
blend ticks; hold through completion; press while idle; hold F while beginning a
later blend; F/Enter aliases; native repeat; simultaneous direction/blend;
countdown skip; stage/restart/blur/hidden/width resets; one and only one launch.
Record the emitted trace and prove direct replay reaches the identical state.

### TD4-G02 — Player-model evidence does not include the shipped adapter

**Severity:** P1 evidence validity. **True blocker before closing campaign
duration/difficulty or control-buffering tasks from bot data.**

**Evidence:** `src/telemetry/campaign-telemetry.ts:223-260`,
`src/telemetry/reactive-controller.ts:35-101`,
`src/telemetry/player-model-controllers.ts:44-70`,
`src/viewer/viewer-input-adapter.ts:143-164`,
`audits/PLAYER-MODEL-BASELINE.md:28-47`

Telemetry passes controller output directly to `engine.setInput`. A held bot
direction is therefore observed at every engine cadence tick. Physical holds
instead move once, wait 15 ticks, then repeat every five. Current controller
fingerprints describe reaction/hesitation/error logic but contain no adapter ID
or repeat policy. The baseline correctly says profiles are not human estimates,
yet it still uses them to motivate the six-minute target and currently retains
a stale claim that short direction taps can disappear.

**Bounded fix/evidence pass:** preserve existing raw controller profiles and
their fingerprints as engine stress probes. Add separate, versioned
“physical-intent through viewer adapter” definitions or a shared key-transition
harness. Bind controller version, adapter algorithm/version, repeat multiplier,
scenario cadence, serve-buffer policy, and seed set into the artifact identity.
Run canonical plus 32 shadows and report the same stage, duration, score,
pressure, and loss distributions. Do not tune campaign values merely to make
this synthetic wrapper win; use the result to choose scenarios for human
observation.

**Acceptance:** repeated adapter-aware runs are byte-identical; changing any
adapter parameter changes identity; emitted inputs replay identically; raw
historical profiles remain unchanged; documentation distinguishes core-policy,
physical-intent, and actual-human evidence.

## Must resolve before final scoring/recovery decisions

### TD4-G03 — Fulfillment and walkout totals overlap but presentation reads as disjoint

**Severity:** P1 feedback correctness. **Human-test instrumentation/copy blocker,
not an engine-resolution blocker.**

**Evidence:** `src/core/engine.ts:220-260,278-307,378-386`,
`src/core/types.ts:123-133`, `src/viewer/presentation-copy.ts:3-10`,
`tests/presentation-copy.test.ts:5-14`

The engine correctly tracks non-equivalent facts: first fulfillment, terminal
walkout, successful exit, and total resolution. Because the one permitted
late-service requeue can later walk out, `fulfilled` and `walkouts` are not
disjoint. Stage-clear copy joins them like two populations, while its test uses
only mutually exclusive synthetic counts. This can show totals apparently
larger than the stage's order count and makes a recovery failure hard to read.

**Bounded fix:** label the aggregates as non-additive (“1 order fulfilled · 1
walkout · 1 resolved”), or derive an explicit terminal breakdown. At stage end,
`fulfilled - exited` identifies fulfilled customers who later walked out;
`resolved - fulfilled` identifies never-fulfilled walkouts. Prefer a shared
presentation/telemetry helper so Canvas, semantic copy, result cards, and future
score submissions use the same definitions.

**Acceptance:** reachable tests cover never-served walkout, served-then-walkout,
successful exit, mixed stage, and repeat service. Displayed totals reconcile to
`resolved === exited + walkouts === customerCount` at a survived clear without
implying `fulfilled + walkouts === customerCount`.

### TD4-G04 — The carried-life bonus dominates recovery after an early error

**Severity:** P1 design/ranking decision. **Blocks final score tuning, not the
first exploratory playtest or deterministic correctness.**

**Evidence:** `src/core/rules.ts:9-18`, `src/core/engine.ts:368-386`,
`src/core/types.ts:60-64`, `tests/authority.test.ts:205-273`

The perfect score is 36,255: 24,630 serve points, 3,625 catch points, and 8,000
stage bonuses. The static one-walkout proof scores 34,060, a 2,195 deficit. Only
445 points arise in Stage 1 (missed serve/catch value plus that stage's smaller
bonus); the lost life then removes another 250 points from each of the seven
later clears, or 1,750 points. Thus 79.7% of the final deficit persists after
seven otherwise successful recoveries.

This is internally authoritative and may be a valid mastery curve, but it is not
explained to players and works against a strong recovery fantasy.

**Bounded experiment:** derive a named score ledger from the already explicit
events and compare the current cumulative-life bonus with two prospective
alternatives using identical early- and late-error traces—for example a
stage-local survival bonus and a one-time campaign-end life bonus. Ask human
players whether the score consequence is visible and attributable. Do not alter
generation 2 in place; a numeric rule change requires a ruleset/version,
authority digest, proofs, and telemetry identity update.

**Acceptance:** every score reconciles into serve, catch, and bonus categories;
early versus late single errors have pinned deltas; ranking copy states the
ordering; the chosen recovery curve is supported by human observations rather
than bot completion alone.

## Cleanup and future-proofing

### TD4-G05 — Adapter/proof integration coverage is narrower than its contract

**Severity:** P2 test brittleness. **Cleanup, not a current blocker.**

**Evidence:** `tests/viewer-input-adapter.test.ts:25-193`,
`tests/visual/maltline.visual.spec.ts:115-164,297-330,402-424`

Unit coverage is strong for phases, holds, aliases, chords, resets, cadence
changes, invalid ticks, and 30/60/144 Hz frame grouping. The production browser
proof driver, however, hard-codes `% 5` for both axes and proves only the first
stage through the viewer. It synthesizes key transitions from an existing proof
rather than proving that an organically adapted trace verifies.

**Bounded fix:** make the browser helper consume the active scenario's separate
station/lane cadences. Add one small integration case that starts with physical
events, records viewer-emitted input, replays it directly, RLE-encodes it, and
verifies equal terminal summary. Include a scenario whose two cadence values
differ. Keep exhaustive combinatorics in the fast unit test.

### TD4-G06 — Two descriptions no longer match settled behavior

**Severity:** P2 documentation/lever cleanup. **Not a blocker.**

- `audits/PLAYER-MODEL-BASELINE.md:40-47` still says short directional taps can
  disappear, despite EXP-036 and the new adapter tests.
- `src/core/types.ts:37-42` says spawn cadence accelerates per customer served,
  while `src/core/engine.ts:182-216` subtracts acceleration using `spawned`.

The measured campaign is valid because fingerprints and tests bind actual engine
behavior. The stale descriptions can still misdirect a playtest moderator or a
future tuning change. Update the baseline sentence after adapter-aware evidence,
and rename/document the spawn field according to current behavior unless a new
ruleset intentionally changes the mechanic.

## Recommended order

1. Implement and replay-test G01's bounded serve latch.
2. Add G02's versioned adapter-aware evidence path; do not overwrite the raw
   historical controller meanings.
3. Run several observed first-session and informed-repeat human sessions,
   recording wall time versus active time, stage reached, press timing, wrong
   serves, jar misses, walkouts, restarts, and perceived idle/overload.
4. Fix G03's result semantics before treating those counters as player feedback.
5. Use those sessions plus a score ledger to decide G04; change rules only in a
   versioned generation.
6. Complete G05/G06 as bounded cleanup before the next cadence/campaign edit.

This sequence preserves generation-2 proofs while ensuring that the next tuning
decision measures the controls people actually use.

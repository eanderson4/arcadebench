# TD-03 — Maltline Gameplay/Engine Review

**Review date:** 2026-09-10
**Scope:** the post-EXP-034 tree: strict runtime input normalization and its
controller cache, generation-2 campaign authority, the first-time arcade flow,
current score/timer semantics, tuning evidence, and human-playtest readiness.
**Disposition:** review only. No product code, task log, experiment log, or
sitemap was changed.

## Verdict

The combined tree is stable enough for a controlled human session. The engine
still reproduces the registered generation-2 win/loss/mistake vectors, the
first-time overlays do not advance simulation, fatal ticks remain bounded, and
the full unit, build, and browser gates are green. I found no new score-farming,
life-underflow, customer-resolution, or terminal-mutation regression.

It is not yet ready to connect to a public ranked Worker. The live viewer and
default telemetry still select a mutable campaign export rather than the frozen
registered campaign, while the server facade verifies against the authority
snapshot. The challenge `seed` also remains envelope metadata rather than a
gameplay input. Those are the two true ranked-release blockers in this review.

Before using first-session results to tune the campaign, fix two smaller but
material validity problems: the lesson implies that the serve key catches jars,
although catching is positional and automatic, and a short direction tap works
or disappears according to the engine's global five-tick phase. The latter is
already represented by queued input-buffer/repeat work; it should precede human
balance conclusions so control misses are not misclassified as difficulty.

The strict input normalizer itself is sound for ordinary and adversarial engine
inputs. Its built-in controller cache has one validation-order bug, reproduced
below, but current typed built-in controllers do not generate the invalid tuples
that trigger it.

## Fresh evidence

```text
npm test --workspace=@arcadebench/maltline -- --run
  17 files, 270 tests passed

npm run build --workspace=@arcadebench/maltline
  TypeScript and Vite build passed

npm run test:visual --workspace=@arcadebench/maltline
  33/33 Playwright checks passed

npm run --silent telemetry --workspace=@arcadebench/maltline
  won 8/8; 21,662 ticks; 361.033 active seconds
  score 36,255; 145 fulfilled/resolved; 4 lives; no losses
```

The current canonical pressure curve remains sparse through stage 6 and only
becomes materially concurrent in stages 7–8:

| Stage | Active seconds | Live / marching max | Jars committed max | Clean jars min |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 25.967 | 2 / 1 | 3 | 2 |
| 2 | 27.017 | 2 / 1 | 3 | 2 |
| 3 | 31.350 | 2 / 1 | 3 | 2 |
| 4 | 52.000 | 2 / 1 | 3 | 2 |
| 5 | 62.767 | 2 / 1 | 3 | 1 |
| 6 | 51.717 | 2 / 1 | 3 | 2 |
| 7 | 55.200 | 3 / 2 | 4 | 2 |
| 8 | 55.017 | 3 / 2 | 5 | 1 |

The current 33-seed player comparison, run directly from
`tools/player-model-comparison.ts`, reports:

| Profile | Wins | Winning active seconds | Aggregate losses |
| --- | ---: | --- | --- |
| Reactive | 33/33 | 360.600–361.033; 360.775 mean | none |
| Delayed competent | 31/33 | 365.117–376.217; 369.449 mean | 14 walkouts, 2 jar smashes |
| Novice/error injection | 0/33 | — | 108 shake smashes, 24 jar smashes |

These models are deterministic stress probes, not human skill estimates. The
delayed model adds only a two-tick decision delay, and the novice deliberately
mis-serves every eighth observed serve opportunity
(`src/telemetry/player-model-controllers.ts:20-30,44-69,125-140`).

## Release blockers

### TD3-G01 — Live play and registered verification do not share one campaign object

**Severity:** P0 for ranked/public-Worker release. **True release blocker.**

**Evidence:** `src/core/campaign.ts:32-132`, `src/core/authority.ts:77-110`,
`src/viewer/main.ts:1,38-45,133-148,171-176`,
`src/telemetry/campaign-telemetry.ts:291-305`,
`src/core/proof.ts:735-749`

`MALTLINE_CAMPAIGN` is a mutable array of mutable scenarios. Authority creation
normalizes and freezes a separate snapshot once at module initialization. The
viewer starts and advances stages from the mutable export; default campaign
telemetry and player-model comparison do the same. Only verification resolves
the registered frozen snapshot.

An isolated process reproduced the split without private engine access:

```text
registered Stage 1 customerCount: 8
mutate MALTLINE_CAMPAIGN[0].customerCount to 1
new live MaltlineEngine from viewer source: 1
registered authority remains: 8
```

The active engine still protects itself from mutation after construction, and a
rich replay embeds its normalized scenario. That does not solve the integration
failure: a client can play and record a valid run against parameters the public
facade will never accept under the displayed generation-2 identity.

**Bounded fix:** expose one frozen generation-2 runtime campaign and use it for
viewer play, default telemetry, proof creation, and authority registration.
Either make authored literals private and export normalized snapshots, or make
runtime consumers select `MALTLINE_GENERATION_2_AUTHORITY.campaign`. Keep
historical/tuning baselines explicit rather than implicit defaults.

**Acceptance criteria:**

1. The package's runtime campaign array, every stage, and every station array
   are deeply frozen.
2. Viewer stage IDs/parameters, default telemetry campaign fingerprint, and the
   registered authority configuration are derived from the same snapshot.
3. Attempted source/consumer mutation before and after engine construction
   cannot change live play, telemetry, proof verification, or copy.
4. A browser-produced canonical proof verifies through the public facade under
   the authority identity exposed to that browser.

### TD3-G02 — Challenge seed still does not select gameplay

**Severity:** P0 if the public challenge claims freshness or seed-specific play.
**True release blocker for that claim; not a local-play blocker.**

**Evidence:** `src/core/proof.ts:126-136,685-700,735-753`,
`src/core/authority.ts:54-70`, `src/core/campaign.ts:42-130`,
`tests/authority.test.ts:246-278`

The public facade now correctly binds a registered configuration digest and
hashes every challenge field. However, `challenge.seed` is copied only into the
retained envelope. Engines are created from the authority's fixed per-stage
seeds. The test proves that changing the challenge seed changes the envelope
hash, not that it changes or invalidates the input proof. A precomputed winning
proof is therefore reusable across arbitrary challenge seeds.

This is the unresolved gameplay half of TD-02 R2, not a regression in EXP-033.

**Bounded decision:** choose and name one policy before the Worker route:

- derive effective registered scenario seeds from a challenge/season seed and
  include that derivation policy in authority, then tune across that seed space;
  or
- call the field a nonce and document that it binds a submission but provides
  no gameplay freshness, relying on expiry, session binding, one-use storage,
  and bot policy.

**Acceptance criteria:** under a gameplay-seed policy, proof A fails challenge
B during replay; under a nonce policy, API types/copy/tests make no seed-freshness
claim and test atomic replay/expiry controls at the Worker boundary.

## Must fix before interpreting human or tuning evidence

### TD3-G03 — The controller-input cache can return a valid input for an invalid tuple

**Severity:** P1 correctness and tuning provenance. **Not a current authored-play
release blocker, but fix before adding controllers or relying on the strict-cache
contract.**

**Evidence:** `src/telemetry/controller-input.ts:4-21`,
`src/core/input.ts:16-57`, `src/telemetry/player-model-controllers.ts:33-69`

The shared normalizer validates before branding and freezes every branded
object. That fast path is safe. The telemetry cache is not: it calculates a
numeric slot and returns a cached object before validating the four primitive
arguments. Invalid runtime values can collide with a legal warmed slot. I
reproduced this sequence:

```text
maltlineControllerInput(0, 0, false, false)  -> legal idle, warms slot 16
maltlineControllerInput(-1, 3, false, false) -> returns the legal idle object
                                                instead of rejecting laneDir 3
```

TypeScript prevents that call in current typed source, but the purpose of the
runtime boundary is to survive type erasure, casts, refactors, and external data.
The result is especially confusing because behavior becomes dependent on cache
warm-up order.

**Bounded fix:** validate directions and booleans before computing or reading a
slot, then retain the 36-object frozen cache. Do not make the hot path allocate.

**Acceptance criteria:** warm all legal slots, then test every out-of-domain
number, `NaN`, infinity, string, missing value, and wrong boolean type in every
argument position; all must throw independently of call order. Legal built-in
telemetry must remain byte-identical and within the existing tuning-test budget.

### TD3-G04 — The first lesson teaches the wrong jar-catching action

**Severity:** P1 player-facing correctness. **Blocker before first-session human
playtests, not a deterministic-core blocker.**

**Evidence:** `src/viewer/gameplay-flow.ts:73-86`,
`src/core/engine.ts:324-353`, `tests/gameplay-flow.test.ts:13-29`,
`tests/visual/maltline.visual.spec.ts:558-563`

The lesson's final step reads `F / ENTER  slide shake · catch jar`. The engine
never reads an action button when a jar reaches the counter; it catches solely
when `playerLane === jar.lane`. Pressing F/Enter while holding another shake can
instead launch that shake, creating exactly the miss/life-loss behavior the
lesson is meant to prevent. Existing tests require the misleading phrase but do
not compare it with the engine contract.

**Bounded fix:** split the step into “F / ENTER — slide held shake” and “Face the
returning window — jar catches automatically.” Align footer, semantic status,
and README language in the same change.

**Acceptance criteria:** a first-time copy test names automatic positional
catching; an engine test proves catch with idle input in the matching lane and
miss with a pressed action in the wrong lane; the instruction ARIA/pixel golden
is intentionally reviewed.

### TD3-G05 — Direction taps are phase-dependent and can disappear

**Severity:** P1 control correctness. **Blocker before balance conclusions from
human playtests; queued P1-03/P1-07 work, not a new engine regression.**

**Evidence:** `src/core/engine.ts:143-153`, `src/core/campaign.ts:23-24`,
`src/viewer/main.ts:70-82,315-367`, `tests/engine.test.ts:13-39`

Authored stages move station/lane only when the global engine tick is divisible
by five. The viewer samples held keys per tick and has no edge latch or delayed
repeat adapter. A one-tick tap at tick 1 produced no station movement; the same
tap aligned to tick 5 moved exactly once. Existing engine movement scenarios set
both repeat intervals to 1, so this phase dependency is not covered.

This can make a short physical or keyboard tap feel dropped, while a slightly
later identical tap succeeds. It contaminates difficulty and failure-fairness
observations, especially when a player rapidly changes lane to catch a jar.

**Bounded fix:** prefer a deterministic viewer/input adapter that queues one
immediate directional step on a fresh press and implements an explicit initial
hold delay plus repeat cadence. Emit ordinary per-tick `MaltlineInput`, so proof
format and core tick determinism remain unchanged. If the core cadence itself is
changed, treat it as a ruleset change and regenerate static proofs.

**Acceptance criteria:** taps beginning at every phase modulo five cause exactly
one move; holds have the same initial delay/repeat count at 30–144 Hz; opposite
directions, chords, blur, width interruption, countdown, stage change, and keyup
clear queued state; replayed emitted inputs reproduce the same path.

### TD3-G06 — Current player-model baseline documentation is stale and no human baseline exists

**Severity:** P1 evidence integrity. **Blocks closing P1-02/P1-04/P1-08, not
shipping an explicitly experimental prototype.**

**Evidence:** `audits/PLAYER-MODEL-BASELINE.md:13-16,40-81`,
`src/telemetry/player-model-comparison.ts:18-31,152-217`,
`audits/TUNING-01.md:60-131`, `README.md:8-11`

The player-model report still describes five generation-1 runs, a 235.333 s
canonical campaign, three lives, and comparison fingerprint
`fnv1a64:3e9139aa1e54c617`. The current tool defaults to canonical plus 32 shadow
seeds and emits `fnv1a64:dd75527c636fb0ab`; canonical generation 2 is 361.033 s
reactive and 374.283 s delayed. TUNING-01 contains the promoted candidate's
correct historical evidence, but the nominal “baseline” document now presents
obsolete values as current.

Machine evidence also cannot establish the README's “Human arcade run” feel.
Reactive has perfect state precision; delayed reaction is only 33 ms; novice is
guaranteed to spend four lives after repeated injected misses and wins 0/33.

**Bounded fix/evidence pass:** archive the generation-1 table explicitly and add
a generation-2 current section generated from the checked-in runner. Then run a
small first-session protocol only after G04/G05: record wall time and active
time separately, overlay dwell, stage reached, restarts, wrong serves, return
misses, walkouts, perceived idle/overload, and input-device type.

**Acceptance criteria:** checked-in values/fingerprint match byte-repeated tool
output; at least several first-session and several informed-repeat players are
represented; medians/ranges and loss reasons are reported without presenting
controller profiles as human percentiles.

### TD3-G07 — Score rewards are authoritative but not yet an authored player contract

**Severity:** P1 game-design/ranking decision. **Blocks final scoring and
recovery tuning; not a code-correctness blocker.**

**Evidence:** `src/core/rules.ts:9-18`, `src/core/engine.ts:278-307,324-340,368-386`,
`src/core/authority.ts:21-30`, `src/viewer/gameplay-flow.ts:63-157`,
`tests/authority.test.ts:175-243`

Perfect generation-2 score decomposes to 24,630 serve points, 3,625 first-return
catch points, and 8,000 stage-clear life bonus. The life bonus is 22.1% of the
36,255 total. Because lives carry while `250 × remaining lives` is awarded at
every stage, one early lost life suppresses 250 points on every later clear in
addition to losing order/catch/combo points. The checked-in mistake vector has
one walkout and finishes with three lives, yet scores 34,060: 2,195 below perfect
and 738 ticks slower.

That may be a desirable arcade mastery gradient, but it conflicts with the open
recovery-pacing question: an early mistake keeps taxing the player after every
subsequent successful stage. Neither lesson nor README explains serve ramp,
catch points, repeated-rescue zero points, stage bonus, or the score-first
ranking policy.

**Bounded next experiment:** do not change rules blindly. Add a score-breakdown
telemetry/result model and compare current cumulative life bonus against one or
two explicit recovery alternatives using otherwise identical early- and
late-mistake proofs. Human sessions should ask whether score consequences feel
attributable and whether players understand what improves a score.

**Acceptance criteria:** every final score reconciles into named categories;
controlled early/late single-error cases have documented deltas; ranking copy
states the meaningful priorities; any numeric change bumps ruleset, authority
digest, static proofs, and telemetry identity.

## Later cleanup / ruleset-freeze decisions

### TD3-G08 — Timer field names do not share one interval convention

**Severity:** P2 today; P1 before a new ruleset is frozen. **Cleanup/semantic
decision, not a generation-2 regression.**

**Evidence:** `src/core/engine.ts:155-171,182-217,237-250,324-365`,
`tests/engine.test.ts:57-83`, `tests/scoring-resolution.test.ts:91-117`

Observed/source semantics are internally deterministic but not uniform:

- `blendTicks: 45` completes on engine tick 46 when held from tick 1, because
  acquisition sets progress to zero and increments begin on the next tick;
- `drinkTicks` begins decrementing on the tick after service;
- a caught jar is pushed into washing and decremented in the same tick, so
  `washTicks: 1` has no post-catch unavailable tick;
- `initialSpawnDelayTicks: 30` spawns on tick 30, while the next spawn countdown
  is computed after the previous spawn.

Existing proofs pin these outcomes, but tests use padding (`12` held ticks for a
`blendTicks: 10` scenario) or implicitly encode them rather than defining a
common “elapsed intervals” contract. The practical one-tick differences are
small; the debt is ambiguity during future tuning.

**Bounded fix:** write a timer-semantics table and parameterized tests for values
1, 2, and N covering first/last active tick and elapsed ticks. Decide whether to
rename fields to match current inclusive behavior or normalize behavior in a
new ruleset. Do not silently alter generation 2.

### TD3-G09 — Fatal simultaneous-event coverage still mutates private engine state

**Severity:** P2 maintainability. **Cleanup; queued P0-17, not a release
blocker while current tests remain green.**

**Evidence:** `tests/scoring-resolution.test.ts:55-79,166-205,208-253`

The most important fatal-ordering tests cast `MaltlineEngine` to a hand-written
`EngineInternals` interface and replace `customers`, `slides`, `jars`, and
`spawned`. This creates states without exercising jar-pool accounting, ID
allocation, prior events, or normal phase transitions. It is effective branch
coverage, but private renames can break tests mechanically and invalid injected
states can either conceal or invent invariant failures.

**Bounded fix:** add a test-only state builder/harness owned next to the engine,
or find short reachable deterministic scenarios for each fatal ordering. The
harness should validate jar conservation, IDs, phases, counters, and scenario
bounds before constructing state; it must not ship from the public package root.

**Acceptance criteria:** fatal customer/slide/jar ordering and terminal
immutability retain exact event/state assertions with no `as unknown as
EngineInternals`; malformed test states reject before stepping.

## Recommended order

1. **Before the Worker route:** G01 and the explicit G02 policy.
2. **Before new controller/tuning evidence:** G03 and refresh G06.
3. **Before first-session balance conclusions:** G04 and G05, then collect the
   human evidence described in G06.
4. **Before finalizing recovery/scoring:** G07.
5. **Before the next ruleset/refactor tranche:** G08 and G09.

This order preserves generation-2 proof compatibility while separating actual
release blockers from gameplay experiments and maintainability cleanup.

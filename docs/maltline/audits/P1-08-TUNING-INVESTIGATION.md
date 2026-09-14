# P1-08: Mid-Campaign Tuning Investigation

**Date:** 2026-09-10
**Scope:** P1-02, P1-04, and P1-08 on ruleset 2 / campaign generation 2
**Disposition:** evidence and proposed experiments only; no authored campaign,
rules, controller, viewer, proof, task-log, or experiment-log change

## Recommendation

Do not promote another campaign generation yet. First extend checked-in
telemetry with decision-load, quiet-time, jar-scarcity, score-ledger, and
fulfilled-walkout attribution. Existing maxima establish the broad shape, but
they cannot tell whether two live customers are actionable orders, customers
already served and drinking, or orders already covered by outbound shakes.

The current evidence nevertheless supports two high-confidence diagnoses:

1. **Stage 5 is an accidental pressure valley.** It is the longest mid-game
   stage, but the delayed model has no simultaneous uncommitted orders, commits
   only three of four jars, never reaches zero clean jars, and spends about
   one-fifth of the stage in quiet arrival-window ticks.
2. **The wall is the Stage 7 → 8 transition, not Stage 7 itself.** Delayed mean
   maximum marching demand rises from 2.182 to 4.061, multi-order time rises
   from 3.101% to 23.267%, and all raw delayed life loss occurs in Stage 8.

A minimal 2×2 shadow experiment should therefore test one Stage 5 resource-
cadence change and one Stage 7 bridge change. Audit-only sensitivity runs show
the combined candidate remains near six active minutes and does not change the
raw or adapter-mediated delayed completion counts. Those results select the
next experiment; they do not authorize an authored change without human play.

## Authority and evidence classes

The registered campaign fingerprint is `fnv1a64:adc596f1154aeafa`; canonical
reactive configuration is `fnv1a64:28ac8864373bc650`. The canonical engine
probe clears 145 orders in 21,662 ticks / 361.033 active seconds, scores 36,255,
and retains all four lives.

Current 33-seed campaign-level evidence remains:

| Evidence class | Wins | Attempt seconds, mean (range where available) | Losses |
| --- | ---: | --- | --- |
| Raw reactive | 33/33 | 360.775 (360.600–361.033) | none |
| Raw delayed competent | 31/33 | 369.629; winning mean 369.449 | 14 walkouts, 2 jar smashes |
| Raw novice/error injection | 0/33 | 100.312 (49.617–175.383) | 108 shake, 24 jar smashes |
| Adapter-mediated reactive intent | 0/33 | 207.106 mean | 8 walkouts, 33 shake, 91 jar smashes |
| Adapter-mediated delayed intent | 30/33 | 369.631; winning mean 369.322 | 14 walkouts, 6 jar smashes |
| Adapter-mediated novice intent | 0/33 | 99.132 mean | 105 shake, 27 jar smashes |

Raw profiles are engine stress probes. Mediated profiles traverse the shipped
keyboard adapter but are still synthetic desired-key transitions. The
mediated-reactive inversion is especially unsuitable as a tuning target: its
state-perfect level policy interacts pathologically with physical repeat
semantics. The delayed raw/mediated agreement is useful sensitivity evidence;
neither distribution is a human percentile. The novice profile usually dies
before Stage 5, so it cannot evaluate the Stage 5–8 curve.

## Current Stage 4–8 shape

The table below uses the 33 raw delayed runs. “Live / marching / jars” is the
mean of each run's stage maximum. “Open,” “multi,” and “quiet” are audit-only
state-derived probes defined below; they are not yet stable telemetry fields.
The final loss column is raw / adapter-mediated delayed life losses.

| Stage | Mean seconds | Live / marching / jars | Open-order ticks | Multi-order ticks | Quiet pacing ticks | Clears | Life losses |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 4 — Lunch Rush | 52.137 | 2.727 / 2.000 / 3.697 | 49.340% | 0.770% | 11.843% | 33/33 | 0 / 0 |
| 5 — Jar Shortage | 62.827 | 2.000 / 1.879 / 3.000 | 42.215% | 0.000% | 20.465% | 33/33 | 0 / 0 |
| 6 — Thick Shakes | 53.127 | 2.909 / 2.000 / 3.545 | 72.769% | 6.077% | 4.656% | 33/33 | 0 / 0 |
| 7 — Happy Hour | 56.294 | 3.182 / 2.182 / 4.667 | 58.523% | 3.101% | 3.935% | 33/33 | 0 / 3 jar |
| 8 — Closing Time | 60.197 | 5.242 / 4.061 / 5.030 | 71.786% | 23.267% | 1.749% | 31/33 | 16 / 17 |

The audit-only probe also found the following delayed cross-lane order/return
conflict rates: Stage 4 15.483%, Stage 5 14.229%, Stage 6 16.438%, Stage 7
18.372%, and Stage 8 25.349%. Adapter-mediated delayed results are within about
1.4 percentage points of the raw values throughout.

### Stage 4 — a visible ramp, but a weak “rush”

Stage 4 increases duration by about 20.2 seconds over Stage 3 and raises mean
maximum live customers from 2.061 to 2.727. That is a real step. However, fewer
than 1% of delayed ticks contain two uncommitted orders, and no reference run
loses a life. The card's proximity-triage lesson is rarely exercised by these
models. Do not add more customers first; Stage 4 already has 20 and its length
is adequate. Human observation should decide whether visual scanning across
served/drinking customers supplies enough perceived rush despite low open
demand.

### Stage 5 — longest stage, lowest actionable pressure

Stage 5 backs away from Stage 4 on open-order time, cross-lane conflict, live
crowd, and marching crowd. Its 60-tick longest quiet pacing run is a full
second, and delayed runs average 20.465% quiet pacing ticks. Reactive and
delayed probes commit at most three of the four jars and record zero zero-jar
ticks. The authored four-jar/160-tick-wash identity therefore reads in the card
but is not materially tested by successful model play.

### Stage 6 — the clearest existing authored beat

The 75-tick blend commitment lifts delayed open-order time to 72.769% and
multi-order time to 6.077%, despite only 17 orders and slower marching. This is
the strongest distinct mid-campaign beat. It is commitment timing, not a narrow
release-skill window: the engine completes the blend once the dwell is met and
early release merely cancels it. Keep this stage stable in the first matrix so
Stage 5/7 effects remain attributable. Human sessions must establish whether
the long hold feels tense or merely slow.

### Stage 7 — continuous, but not yet a bridge to Closing Time

Stage 7 removes much of the quiet time and raises jar concurrency; three
adapter-mediated jar misses across 33 runs show a small catch boundary.
However, its multi-order rate is lower than Stage 6's, and Stage 8 multiplies it
by 7.5. Stage 8 then records all 16 raw delayed losses (14 walkouts, two jar
smashes) and both fatal runs. Stage 7 needs a measured midpoint in open choices,
not merely more elapsed orders.

### Several advertised floor knobs are currently inert

Spawn interval is calculated from the number spawned
(`core/engine.ts:182-216`), and none of the Stage 4–8 floors binds before the
last authored spawn:

| Stage | Initial | Last used interval | Floor |
| ---: | ---: | ---: | ---: |
| 4 | 180 | 123 | 96 |
| 5 | 204 | 166 | 96 |
| 6 | 192 | 160 | 96 |
| 7 | 144 | 92 | 66 |
| 8 | 132 | 72 | 60 |

A floor-only candidate changes identity but not play. Future experiments should
report the first spawn tick, last used interval, total arrival-window ticks,
and whether the floor bound at least once. Theoretical stage-start-to-last-spawn
windows are 48.000, 58.767, 47.167, 51.200, and 51.000 seconds for Stages 4–8.
This explains why Stage 5 buys duration primarily through empty spacing.

## Required telemetry prerequisite

Promote the audit probe into a versioned telemetry schema before using it to
choose authored values. Observe state after each executed engine step. Define
an outbound slide's reserved order by processing slides in ascending ID order
and greedily assigning the nearest still-unassigned marching customer ahead of
that slide with the same lane and flavor. An **open demand** is a marching
customer not assigned to such a slide.

Add these stage fields:

- `maxOpenDemand`, `openDemandTicks`, and `openDemandCustomerTicks` (the last is
  the integral/sum of open-demand count);
- `multiOrderTicks`, `multiOrderLaneTicks`, and `multiOrderFlavorTicks` for at
  least two open demands, at least two represented lanes, and at least two
  represented flavors;
- `returningJarTicks`, `orderReturnConflictTicks`, and
  `crossLaneOrderReturnConflictTicks`; conflict means at least one open demand
  and one returning jar, while cross-lane compares the nearest demand and
  nearest returning jar by position then ID. Call this a conflict opportunity,
  not an “urgent” or forced conflict;
- `pacingWindowTicks`, `quietPacingTicks`, and `longestQuietPacingRunTicks`.
  The pacing window includes post-step states after at least one but fewer than
  all customers have spawned; a quiet tick has no open demand, held/blending shake, outbound slide, or
  returning jar. Drinking and washing alone remain non-actionable waiting;
- `ticksAtOneOrFewerJars` alongside the existing zero-jar count, plus
  `spawnFloorHitCount`;
- `repeatServiceActions = serviceActions - fulfilled`, and walkouts split into
  `neverFulfilledWalkouts` versus `fulfilledThenWalkout` using the pre-step
  customer state; and
- an event-derived score ledger with `servePoints`, `catchPoints`, and
  `stageBonusPoints`, whose sum exactly equals `scoreGained`.

This additive output change should bump the telemetry artifact schema. It does
not require a game/rules/campaign/proof version change because it observes
existing states and events only.

Acceptance tests should prove:

1. a slide reserves at most one matching customer and two slides cannot reserve
   the same order; wrong-lane/flavor and already-passed customers remain open;
2. `multiOrderLaneTicks` and `multiOrderFlavorTicks` never exceed
   `multiOrderTicks`, conflict never exceeds both open-demand and returning-jar
   ticks, and `maxOpenDemand <= maxMarchingCustomers <= maxLiveCustomers`;
3. quiet ticks occur only inside the declared pacing window, are mutually
   exclusive with every actionable category, and their longest run is exact in
   a handcrafted two-wave scenario;
4. one-jar, zero-jar, floor-binding/non-binding, first-service, re-service,
   never-served walkout, served-then-walkout, and each score category have
   deterministic fixtures;
5. duplicate runs remain byte-identical, schema/field order is golden-tested,
   and canonical plus 32-seed comparison output reports distributions rather
   than only maxima.

## Minimal campaign experiment matrix

After the telemetry prerequisite, run the same canonical plus 32 seed offsets
for a 2×2 matrix. Preserve Stages 1–4, 6, and 8 exactly.

| Candidate | Stage 5 change | Stage 7 change | Question |
| --- | --- | --- | --- |
| A — registered control | none | none | Current baseline |
| B — resource cadence | initial 204→180; acceleration 2→3 | none | Does the four-jar loop become active without unfair losses? |
| C — Closing Time bridge | none | orders 27→29; initial 144→138; march 0.120→0.125 | Does Stage 7 become a readable midpoint? |
| D — combined | B | C | Does the whole curve improve without losing the six-minute run? |

Keep both floors unchanged: they remain non-binding in these candidates. Do not
change movement globally, Stage 6 blend dwell, life count, scoring, or Stage 8,
so the causal comparison stays small.

Audit-only sensitivity results (not checked-in artifacts) are:

| Candidate | Reactive wins / mean s | Raw delayed wins / mean attempt s | Mediated delayed wins / mean attempt s |
| --- | --- | --- | --- |
| A | 33 / 360.775 | 31 / 369.629 | 30 / 369.631 |
| B | 33 / 350.017 | 31 / 358.875 | 30 / 358.880 |
| C | 33 / 360.894 | 31 / 371.060 | 30 / 371.018 |
| D | 33 / 350.137 | 31 / 360.306 | 30 / 360.267 |

Candidate B raises Stage 5 maximum committed jars from 3 to 4. Raw delayed
zero-jar time rises from 0 to 127.970 ticks (2.133 seconds) with no life loss;
ticks at one or fewer clean jars rise from 23.464% to 60.265%. Quiet pacing
falls from 20.465% to 11.890%. This may create useful resource planning, or it
may replace quiet with forced waiting—the new metrics and human observation
must distinguish those experiences.

Candidate C preserves Stage 7's roughly 51-second arrival window while adding
two orders. Raw delayed mean maximum live/marching customers becomes
4.545/3.242, multi-order time becomes 14.125%, and cross-lane order/return
conflict becomes 25.435%. Those values lie between current Stage 7 and Stage 8.
It adds no raw delayed loss; mediated delayed jar losses rise only from three to
four, with all 33 Stage 7 clears. Completion counts remain unchanged because
the fatal boundary is still Stage 8.

Candidate D is the best first human comparison if the instrumented rerun
repeats these results. It remains 5.836 active minutes for reactive play and
about 6.005 minutes for delayed attempts. Do not optimize those synthetic
numbers further: the target is human wall-clock experience.

If B feels like evenly spaced forced waiting, the next mechanic experiment—not
part of this matrix—should add deterministic `waveBreaks` after specified
customer numbers. For example, B's roughly 10.75-second shorter Stage 5 could
test two approximately five-second breaks after orders 7 and 14. That can pair
meaningful bursts with explicit breathers while preserving duration. It needs
a separately versioned scenario/engine proposal and must not be slipped into a
campaign-only tuning edit.

## Scoring, lives, and recovery implications

Successful raw runs have `serviceActions === fulfilled` throughout Stages 4–7,
no walkouts, and identical stage scores for every seed: 4,950 / 4,950 / 4,275 /
6,525. The models therefore do not exercise the one permitted re-service or
recovery loop, and score mostly reflects order count rather than alternate
mastery paths.

Four lives separate delayed success from Stage 8 failure, but give no evidence
for lives tuning in Stages 4–7 because the raw delayed profile loses none there.
The injected novice deliberately burns lives before reaching this slice. The
mediated delayed profile's three Stage 7 jar misses are the only current
survived-error sample.

Both shake and jar smashes also permanently remove that jar for the rest of the
stage. In Stage 5, a human error can therefore turn the four-jar resource beat
into a three-jar recovery problem while also resetting streak and consuming a
life. At stage clear, each missing carried life removes another 250 points from
that stage and every later clear (`core/engine.ts:368-386`). A Stage 5 error can
thus keep taxing four later bonuses even after clean recovery. Do not combine a
Stage 5 pressure increase with scoring/life changes in the same experiment.

Use the proposed score ledger and identical early/late mistake traces to
evaluate the existing cumulative-life bonus separately. A scoring change is a
ruleset/authority/proof change and needs human comprehension evidence; it is
not justified by current completion statistics.

## Human evidence still required

Model evidence can identify concurrency and deterministic failure boundaries.
It cannot establish fun, visual readability, physical timing, perceived
fairness, whether jar scarcity feels like agency or waiting, or whether a
six-minute active run feels like 5–15 minutes after cards and decisions.

Run observed sessions on A and D only after the instrumented matrix:

- separate first-session players from informed repeat players and record input
  device;
- record active ticks, wall time, card/countdown dwell, stage reached, restarts,
  every loss reason, input immediately before loss, and time to the next
  fulfilled order or terminal state;
- after each of Stages 4–7, ask for perceived idle time, overload, distinct
  lesson, and the decision that felt hardest without revealing knob values;
- after a loss, ask what happened before showing the event classification; and
- after the run, ask what generated score and whether recovery felt possible.

Close P1-02 only from successful human wall-time distributions in the 5–15
minute band; do not pad early failed attempts. Close P1-08 only if Stage 5 reads
as a resource decision, Stage 7 previews rather than duplicates Stage 8, and no
unexplained wall appears. Close P1-04 only when loss explanations agree with
observed events and the score/recovery contract is understood. A small
qualitative session can select the next candidate, but it cannot support broad
population or percentile claims.

## Checks run

```text
npx tsx games/maltline/tools/campaign-telemetry.ts
npx tsx games/maltline/tools/player-model-comparison.ts
audit-only 33-seed raw/adapter stage probes and four shadow candidates

npm test --workspace @arcadebench/maltline -- --run \
  tests/campaign-telemetry.test.ts tests/player-models.test.ts \
  tests/physical-intent-controller.test.ts tests/tuning-experiment.test.ts
  4 files, 30 tests passed
```

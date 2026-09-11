# Maltline Gameplay and Campaign Audit

**Audit date:** 2026-09-10
**Baseline:** `9058307` on `maltline-polish`
**Scope:** gameplay engine, scoring/lives, eight-stage campaign, run duration,
failure fairness, and the automation needed to tune them. This is an audit, not
a claim that the current game has been human-playtest validated.

## Executive verdict

Maltline already has a promising arcade loop: read an order, commit to a pour,
route it to the right lane, then divide attention between new orders and
returning jars. The deterministic fixed-tick core and authored scenario knobs
are a strong base for deliberate tuning.

It is not ready to tune by feel yet. Two P0 defects invalidate duration and
leaderboard conclusions:

1. The browser frame loop discards fractional tick time. A display refreshing
   faster than 60 Hz can run **zero simulation ticks indefinitely**; 30 Hz can
   effectively run the game near half speed. Wall-clock playtests are not
   comparable until the viewer uses a persistent accumulator.
2. A customer served on the counter-side of the threshold resumes marching and
   awards full serve/streak points again. A player can time shakes to re-serve
   that customer forever. A measured canonical stage-1 run remained healthy at
   tick 50,000 with 180,975 points, 807 serves, all 3 lives, and one customer
   deliberately kept active. Successful duration and score are therefore both
   unbounded, even if every submitted input is replay-verified honestly.

After those blockers, the largest design issue is the difficulty curve. A
reactive no-mistake controller cleared the campaign in 3:55 active simulation
time and approximately 4:11 to the victory overlay. Stages 5 and 6 are pressure
valleys, then stage 7 supplies most of the campaign's real throughput jump.
Three persistent lives across 108 customers and their jar returns create the
opposite problem for ordinary players: a small error rate can end a run early,
and early errors are never recovered.

The desired 5–15 minute range should be defined as a distribution, not just one
duration target. A useful initial contract is: a deterministic expert reference
controller completes in 6–8 minutes; competent human completions have a median
near 8–10 minutes and a 10th–90th percentile inside 5–15 minutes; a first-time
player sees enough recovery to learn for several minutes rather than losing all
lives in one cascade. Human sessions must validate the latter two criteria.

## Evidence and method

The audit inspected:

- `src/core/engine.ts`, `campaign.ts`, `types.ts`, `replay.ts`;
- the viewer input, campaign, and frame loop in `src/viewer/main.ts`;
- HUD/gameplay rendering relevant to player feedback in `renderer.ts`;
- all seven current engine tests and the README's stated rules.

Baseline checks passed on 2026-09-10:

```text
npm test --workspace=@arcadebench/maltline
  1 file, 7 tests passed

npm run build --workspace=@arcadebench/maltline
  TypeScript and Vite build passed
```

A temporary headless controller was used for measurement; no product code was
changed by the simulation. Each tick it:

- chose the nearest marching customer not already targeted by a shake;
- selected that flavor and held blend until complete;
- routed a held shake to the customer's lane and edge-triggered serve;
- prioritized a returning jar when its travel time approached lane-switch time;
- reacted only to current state (no seed/spawn foresight) and made no injected
  mistakes.

This controller is more precise than a human but is not a theoretical optimum.
It is an appropriate lower-end completion baseline and should become a checked-in
reference controller before campaign tuning begins.

## Duration findings

### Measured campaign

“Tight cadence” is the final/lowest spawn interval. “Jars committed” includes
blending/held shakes, outbound shakes, drinking customers, returning jars, and
washing jars. It excludes available and destroyed jars.

| Stage | Authored focus | Customers | Tight cadence | Blend | Bot clear | Max live customers | Max jars committed |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | one flavor, two lanes | 8 | 2.87 s | 0.77 s | 25.97 s | 2 | 3/5 |
| 2 | second flavor | 10 | 2.23 s | 0.77 s | 27.02 s | 2 | 3/5 |
| 3 | third flavor/lane | 12 | 2.10 s | 0.77 s | 31.35 s | 2 | 3/5 |
| 4 | faster rush | 14 | 1.42 s | 0.77 s | 29.33 s | 3 | 4/5 |
| 5 | four jars, slower wash | 14 | 1.97 s | 0.77 s | 35.35 s | 2 | 4/4 |
| 6 | longer blend | 12 | 1.93 s | 1.27 s | 29.85 s | 2 | 4/5 |
| 7 | high throughput | 18 | 0.92 s | 0.77 s | 28.38 s | 4 | 6/6 |
| 8 | final rush | 20 | 0.83 s | 0.77 s | 28.08 s | 4 | 6/6 |

Totals for the clean controller:

- active simulation: **14,120 ticks = 235.33 s = 3:55.3**;
- seven between-stage delays: **+14 s**, reaching the final clear at ~4:09.3;
- the final two-second clear overlay before victory: **~4:11.3** total;
- final state: 3 lives, 25,930 points, no misses, all 108 customers served
  exactly once.

The optimistic causal lower bound is about **13,266 ticks = 3:41.1 active**
(about 3:57.1 to the victory overlay). It assumes each final spawn can meet a
pre-positioned correct shake and adds only the mandatory drink/jar-resolution
tail. It is not necessarily achievable across every simultaneous jar conflict,
but its proximity to the reactive controller shows that the current spawn
schedules, rather than controller inefficiency, dominate duration.

### Bounds and failure timing

- **Successful upper bound: infinite.** A late-served customer can be frozen by
  repeated drink cycles while jars circulate, so neither the stage nor its score
  has a finite cap.
- **Idle game-over is very short.** Starting with three lives and providing no
  input loses a stage in 16.78–27.77 seconds depending on stage. A run entering
  a later stage with one life can fail on its first walkout.
- Customer travel time from door to counter ranges from 20.83 s in stage 1 to
  12.82 s in stage 8. This is generous compared with one 0.77 s blend in
  isolation; the actual late-game constraint is serialized blending plus jar
  occupancy and lane attention.
- Stage 8's 46-tick shake production cost is 92% of its 50-tick minimum arrival
  cadence before station selection, lane routing, or jar-catching work. Stage 7
  is 84%. Stage 4 is only 54%, stage 5 is 39%, and stage 6 is 66%. That explains
  the abrupt stage-7 wall.

### Browser time is currently non-authoritative

`viewer/main.ts` sets `owed = dtMs` inside every animation frame. Any remainder
smaller than one tick is discarded rather than carried to the next frame.

- At a stable 120/144 Hz, each frame is shorter than 16.67 ms and the loop can
  execute no simulation ticks at all.
- At 30 Hz, a frame can execute only one tick when floating-point timing lands
  just below two tick intervals, throwing away nearly half the elapsed time.
- Around 60 Hz, behavior depends on jitter around the tick threshold.

The engine tick count remains deterministic, but the mapping from real time to
ticks does not. Duration playtests, input feel, and replay elapsed time must wait
for a persistent fixed-step clock with explicit lag policy.

## Stage progression and fun

### What is working

- The scan/choose/commit/route/catch loop creates real divided-attention play.
- A held shake prevents another blend, which makes order selection meaningful.
- The closed jar pool gives successful catches a systemic consequence beyond
  points.
- Flavor count, lane count, production time, arrival rate, march rate, wash
  time, and pool size are independently authored and deterministic.
- Serving early removes a customer after drinking, so proactive play produces a
  clean, legible advantage.
- A walkout removes pressure from the active line, giving a limited recovery
  effect rather than leaving an impossible customer in place.

### Curve problems

1. **Stages 1–3 end before their ideas develop.** The controller sees at most
   two active customers and each stage lasts 26–31 seconds. They behave like
   brief tutorials, but there is no explicit teaching/countdown or challenge
   beat before transition.
2. **Stage 5 is a duration bump, not a clear difficulty step.** It restores the
   slower base spawn/march values after stage 4. The controller touches all four
   jars but carries only two active customers and clears without a mistake.
3. **Stage 6 remains a valley.** A 1.27-second blend sounds substantial, but the
   stage reduces customer count, slows marching below base, and leaves more
   production headroom than stage 7.
4. **Stage 7 makes several jumps at once.** Customer count, cadence, march speed,
   and pool size all increase. This creates a wall without isolating a newly
   learned skill.
5. **After stage 3, variety is mainly numerical.** The player has already seen
   every action and entity. More authored waves, customer behaviors, or
   short-lived rule twists would create richer decisions than simply increasing
   rate.
6. **Spawn acceleration is not performance-driven.** Types/README comments say
   it accelerates “per customer served,” but the engine subtracts acceleration
   from `spawned`. The result is a fixed wave schedule regardless of performance.
   Either make the implementation reward/pressure serving as documented or
   rename the lever and teach it as scheduled escalation.

The first campaign expansion should add meaningful beats, not merely enough
customers to push the stopwatch past five minutes. Good candidates are authored
mini-waves with breathing spaces, impatient/VIP orders, a temporarily unavailable
station, a multi-flavor order, or a jar that requires an explicit catch action.
Introduce one skill, test it, then combine it later.

## Failure fairness and lives

Three lives are initialized once and carried through all eight stages. There are
no score-based extra lives, stage refills, shields, or grace periods.

### Main risks

- A perfect run has at least 108 launches and 108 jar-return decisions. With
  three lives total, even a small independent mistake rate compounds severely.
  As a rough scale, 216 critical interactions at 1% error produces 2.16 expected
  errors; at 2%, it produces 4.32. Human errors are not actually independent,
  because overload makes them cluster.
- A missed returning jar costs both a life and permanent stage capacity. That
  can delay the next blend, cause a walkout, and consume another life: one input
  error can become a death spiral.
- Serving late is also anti-recovery. The customer returns to marching and must
  be served again precisely when the player is already behind. This can be an
  expert risk/reward mechanic, but it needs an explicit limit or compensating
  relief to avoid positive feedback toward failure.
- A life loss does not create a short freeze, clear dangerous projectiles, or
  grant invulnerability. Multiple failures may resolve close together without
  a readable recovery beat.
- Wrong-flavor shakes pass through nonmatching customers and may hit a farther
  matching customer; otherwise they smash at the door. This is mechanically
  deterministic but visually surprising unless the game clearly communicates
  rejection/trajectory.
- Releasing blend early refunds the jar immediately with no cleanup cost. This
  weakens the advertised production commitment and should be an explicit
  forgiveness decision, not an incidental rule.

### Control fairness

- Lane/station movement happens only when global `tick % repeatTicks === 0`.
  Initial response is therefore 0–4 ticks depending on when a key is pressed,
  not a consistent immediate step followed by repeat delay.
- Holding a direction repeats every five ticks (12 moves/second), which makes
  three-position selection easy to overshoot on keyboard and cabinet controls.
- A serve press made slightly before blend completion is lost if held: the edge
  is consumed while no shake is held, so completion does not launch until the
  button is released and pressed again.
- Lane and station can change while blending, enabling optimal multitasking but
  causing the visible active machine to diverge from the flavor actually being
  blended. Decide whether this is intended mastery or lock selection during a
  pour.

Recommended control contract: immediate first navigation step, a 150–250 ms
initial repeat delay, then a separately tuned repeat interval; a small serve
buffer around blend completion; and input tests using cabinet-like press lengths.

### Resolution/HUD mismatch

Walkouts remove customers but do not increment `exited`. Stage clear only checks
that all spawns occurred and no active customer/shake/jar remains. A stage can
therefore clear after walkouts while the HUD still shows phantom customers via
`customerCount - exited`, and the overlay says “Line served.” Define and track
`fulfilled`, `walkedOut`, and `resolved` separately, then choose whether a stage
is cleared by survival or complete service. Feedback must use the same rule.

## Scoring audit

Current scoring is:

- serve: 100 + 10 per current streak, capped at +100;
- jar catch: +25;
- life loss: streak resets;
- stage clear: +250 per remaining life;
- streak itself has no cap and resets at each stage because it is not carried in
  `RunContext`.

### P0 scoring exploit

At positions below the exit threshold, serving changes a customer to drinking
and awards the same serve/streak score. After drinking, the customer resumes.
By blending during the drink and timing the next slide to meet the customer on
the resume tick, its position can be held constant while jars recycle.

A measured run on the **canonical stage 1** seed produced:

```text
tick                 50,000 (13:53.3 simulation time)
status               running
lives                3
score                 180,975
customers exited     7 of 8
serve events          807
jar catches           805
farm customer x       42.824 / 100, drinking, exitAfterDrink=false
```

At steady state this awards roughly 225 points per repeated cycle, close to one
cycle per second, forever. This is not replay tampering: it is a legal input
sequence. Server replay verification alone cannot make this leaderboard fair.

At minimum:

1. score each customer's order only once, or sharply diminish/zero repeat-serve
   points;
2. bound how many times a customer may resume, or add a canonical stage time
   limit/overtime rule;
3. impose a verifier-enforced maximum campaign tick count and replay byte size;
4. make score ordering completion-aligned (stage progress/completion must outrank
   stalling for points);
5. define a finite theoretical maximum score and test it.

The HUD also displays an uncapped `STREAK ×N` while the score increment caps at
the eleventh serve. “×807” awarding +200 is not a multiplier and is misleading.
Rename it to combo, cap the displayed tier, or implement the displayed math.

The 25,930-point clean-controller result is a useful provisional perfect baseline
only if every customer scores once. An early life loss can remove 250 points from
every remaining stage-clear bonus, so an identical error is more costly early in
the campaign. Preserve that long-run tension only if extra-life/recovery tuning
makes completion realistic.

## Prioritized changes

| Priority | Change | Why it comes first | Evidence of completion |
| --- | --- | --- | --- |
| P0 | Extract/fix a persistent real-time tick accumulator | Current wall-clock play can slow or stall by refresh rate | Synthetic 30/60/90/120/144 Hz schedules all produce 600 ticks in 10 active seconds, within an explicit lag cap |
| P0 | Remove infinite re-serve scoring and bound stage/run ticks | Duration and leaderboard score are unbounded under legal play | Adversarial farmer terminates or stops gaining score; finite max-score proof/test |
| P0 | Define canonical resolution and leaderboard objective | “Clear,” HUD count, points, and optimal play currently disagree | One spec and tests cover served, requeued, walked-out, resolved, completed, and ranked outcomes |
| P1 | Check in campaign telemetry/reference controllers | Knob changes currently have no repeatable gameplay evidence | One command emits per-stage duration, backlog, jar pressure, score, and loss reasons |
| P1 | Rebuild stages 4–7 as a smooth skill curve | Stages 5/6 regress, stage 7 jumps | Expert/competent models show increasing pressure without a single discontinuity |
| P1 | Add fair recovery and tune persistent lives | Three clustered errors can end a long run with no comeback | Error-injection simulations and humans support intended completion/failure rates |
| P1 | Fix input onset/repeat and serve buffering | Timing variance creates preventable misses | Tick-level and browser input tests cover taps, holds, chords, and near-completion serve |
| P2 | Add new decision beats and breathing waves | More counts alone would pad rather than deepen the run | Stage skill map and playtest notes identify what each stage teaches/tests |
| P2 | Clarify score/combo feedback and danger cues | Current HUD misstates remaining customers and streak math | Visual tests cover requeue, walkout, max combo, imminent jar, and life-loss recovery |

## Automation recommendations

### 1. Headless campaign telemetry

Add a deterministic `maltline:telemetry` command with checked-in controller
versions. Output JSON/CSV per stage and campaign:

- ticks/seconds, first and last spawn, time after final spawn;
- active/marching/drinking/leaving maxima by lane;
- production idle time, blocked-on-jar ticks, jars in every lifecycle state;
- first response time per order, serve position, re-serve count;
- launches, unique fulfilled customers, walkouts, each smash/life-loss reason;
- score ledger by source, streak distribution, terminal outcome;
- input counts, navigation distance, simultaneous task pressure.

Provide at least these controllers:

- `reactive-perfect`: current-state-only reference used in this audit;
- `delayed-competent`: bounded reaction delay and imperfect prioritization;
- `novice`: slower flavor/lane choice with deterministic error injection;
- adversaries: score farmer, wrong-flavor spammer, max-tick idle/stall.

Use many shadow seeds for robustness but always report the canonical seed
separately. Never silently tune only to one lucky spawn layout.

### 2. Campaign regression tests

- Validate unique IDs and all numerical scenario domains.
- Assert every canonical stage is winnable by the reference controller before a
  verifier-enforced tick cap.
- Assert ordered pressure envelopes (arrival utilization, backlog, jar blocking,
  duration); allow intentional breathers only when labeled in stage metadata.
- Golden-test canonical spawn flavor/lane sequences and reference replay hashes
  once the protocol generation is frozen.
- Assert a finite campaign score and tick bound.

### 3. Engine/model-based tests

- Event-ledger test: recompute score/lives/counters only from events and compare
  with state after every tick.
- Property/fuzz tests for jar conservation, bounds, valid phases, monotonically
  increasing IDs, deterministic replay, and terminal immutability.
- Focused cases for threshold equality, requeue limit, first input response,
  held/early serve, canceled blends, simultaneous failures, wrong-flavor pass,
  final walkout, final jar/wash, and stage clear semantics.
- Metamorphic timing tests at alternate legal tick rates/speeds.
- A 100k-tick adversarial soak that proves no score farm, state growth, negative
  lives, or nonterminal campaign is possible beyond declared bounds.

### 4. Browser/gameplay integration tests

- Test the fixed-step clock with mocked animation timestamps at common refresh
  rates, jitter, a 100 ms hitch, visibility changes, and max-catchup truncation.
- Replay the same scheduled key transitions through headless engine and browser
  adapter; snapshots and recorded inputs must match.
- Exercise key rollover/chords, blur, held Enter from title, restart during each
  overlay, and stage transition input clearing.
- Visual snapshots should include a near-walkout customer, simultaneous order
  and returning jar, jar starvation, held/blending states, requeue, every failure
  reason, one life, and correct resolved-customer HUD counts.

### 5. Human playtest telemetry

For each consented session record only gameplay events and anonymous session
metadata: stage times, first confusion/error, loss reason, serve position,
unserved order age, jar misses, restarts, and short post-run ratings. Do not infer
“fun” from a perfect bot. Use at least five first-time and five returning players
before freezing campaign v1, with cabinet controls represented.

## Proposed first experiments

Append these to `docs/maltline/EXPERIMENTS.md` as they are run; do not rewrite
prior entries.

### G-001 — Clock invariance

- **Hypothesis:** A persistent accumulator makes engine time independent of
  display refresh without creating runaway catch-up.
- **Procedure:** Feed identical 10-second synthetic timestamp schedules at
  30/60/90/120/144 Hz plus jitter/hitches.
- **Gate:** 600 gameplay ticks for every uninterrupted schedule; identical final
  state for identical per-tick inputs; documented behavior when lag cap drops
  time.

### G-002 — Finite-score rule

- **Hypothesis:** Unique-order scoring plus a bounded requeue/overtime rule makes
  finishing dominate stalling without removing the rescue fantasy.
- **Procedure:** Compare (A) no repeat score + max one requeue, (B) diminishing
  repeat score + per-stage clock, and (C) every serve forces exit. Run clean,
  delayed, and farmer controllers.
- **Gate:** finite score/ticks; farmer never outranks clean completion; late
  rescues remain understandable in a short human A/B test.

### G-003 — Reference-controller baseline

- **Hypothesis:** Per-stage telemetry exposes meaningful pressure better than
  clear time alone.
- **Procedure:** Check in the reactive controller, instrument the metrics above,
  and run canonical plus at least 100 shadow seeds per stage.
- **Gate:** one reproducible command and machine-readable artifact; expected
  ranges documented rather than hidden in test code.

### G-004 — Input-feel matrix

- **Hypothesis:** Immediate navigation, delayed repeat, and a 3–6 tick serve
  buffer remove accidental misses without trivializing routing.
- **Procedure:** Test three repeat profiles on keyboard and cabinet controls;
  inject presses around blend completion and imminent jar arrival.
- **Gate:** no missed intentional press, low overshoot, deterministic recorded
  per-tick input, preferred profile selected from playtest evidence.

### G-005 — Curve and duration pass

- **Hypothesis:** Longer authored waves plus one new decision beat in stages 4–6
  can reach 6–8 expert minutes without padding.
- **Procedure:** First smooth production utilization across stages; then add
  wave/breather structure or one customer modifier at a time. Run controllers
  after every change.
- **Gate:** expert controller 6–8 minutes, no unlabeled pressure regression,
  gradual backlog/jar-pressure growth, no stage contributing only dead time.

### G-006 — Lives/recovery matrix

- **Hypothesis:** A short post-loss recovery plus either milestone extra lives or
  partial stage refills prevents cascades while retaining arcade stakes.
- **Procedure:** Deterministically inject 0.5%, 1%, and 2% action errors and
  compare persistent-three-lives against selected recovery variants.
- **Gate:** chosen completion curves and human reports support tension without
  helpless cascades; score ordering remains stable.

### G-007 — First human sessions

- **Hypothesis:** Players can learn the loop without README knowledge and can
  attribute every life loss.
- **Procedure:** Observe first-run and second-run sessions with no coaching;
  record first confusion, stage reached, duration, loss attribution, and desire
  to replay.
- **Gate:** every participant can state order/blend/serve/catch loop; at least 80%
  correctly identify each loss cause; second-run improvement is visible. Use the
  results to revise targets rather than treating this gate as proof of fun.

## Recommended immediate sequence

Fix and test the real-time clock first, then choose the finite-score/terminal
rule before changing campaign numbers. Check in telemetry next. Only then tune
controls, lives, stage content, and duration in short logged experiments. Run a
tech-debt/refactor review after the clock/scoring/telemetry tranche because those
changes will establish the long-lived runtime and protocol boundaries.

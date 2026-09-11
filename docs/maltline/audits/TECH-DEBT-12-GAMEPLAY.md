# Maltline Technical-Debt Audit 12 — Gameplay and Tuning Evidence

**Date:** 2026-09-11
**Scope:** Settled EXP-078 gameplay evidence, the registered generation-2
campaign, scoring/lives/recovery semantics, player-model duration, and the
remaining human-evidence boundary. Product code and experiment logs were read
only.

## Verdict

There is **no P0 gameplay correctness blocker** and no evidence-based reason to
change the engine, registered campaign, ruleset, proof schema, or ranked
authority now. EXP-078 is a strong deterministic sensitivity test: changing
only Closing Time's post-first-spawn interval sequence from the 132-tick base
to a 138-tick base removes the fixed delayed profiles' terminal Stage 8
failures, reduces modeled crowd pressure, and adds about three active seconds
to a clean run. It does not establish that the easier curve is more fun, that a
human can recover from its failures, or that complete human runs normally land
inside 5–15 minutes.

The P1 findings below block **candidate promotion and closure of P1-02/P1-04/
P1-08**, not continued use of the registered generation-2 game. Generation 2
remains the truthful ranked baseline. The P2 findings are interpretation and
test-maintenance debt, not release blockers.

| Severity | Count | Current blocker? |
| --- | ---: | --- |
| P0 | 0 | No gameplay/ranked-release blocker found. |
| P1 | 3 | Yes for a tuning/scoring promotion or closing the associated human-evidence tasks; no for generation 2. |
| P2 | 4 | No; preserve the caveats and add the bounded gates before extending the evidence. |

## P1 findings

### TD12-G01 — The 138-tick candidate proves relief, not an optimum

The authored Stage 8 base remains 132 ticks
(`games/maltline/src/core/campaign-source.ts:118-131`). The experiment's fixed
candidate changes only that value to 138 and rejects any other normalized diff
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:33-75,
326-356`). This is not merely a six-tick delay to the first customer: the first
spawn retains the ruleset's 30-tick delay, then the engine derives every next
interval from `spawnIntervalTicks - spawned * spawnAccelerationTicks`
(`games/maltline/src/core/engine.ts:183-215`). For this 31-customer stage, the
candidate therefore adds six ticks to each subsequent arrival interval and
adds exactly 180 ticks / 3.000 active seconds to the clean reactive runs.

The fixed 33-seed result is material:

| Profile | Control wins | Relief wins | Mean seconds, control → relief | Loss totals `(walkout, shake, jar)`, control → relief |
| --- | ---: | ---: | ---: | --- |
| Reactive | 33/33 | 33/33 | 360.775 → 363.775 | `(0,0,0)` → `(0,0,0)` |
| Delayed | 31/33 | 33/33 | 369.629 → 371.200 | `(14,0,2)` → `(6,0,2)` |
| Adapter-delayed | 30/33 | 33/33 | 369.631 → 371.298 | `(14,0,6)` → `(6,0,6)` |
| Novice/error injection | 0/33 | 0/33 | 100.312 → 100.312 | `(0,108,24)` unchanged |

For delayed play, mean maximum live customers fall 5.242→4.606 and mean
maximum open demand 3.758→3.061; adapter-delayed values fall 5.212→4.636 and
3.727→3.121. Fatal runs/cascades fall 2/2→0/0 and 3/3→0/0 respectively. Jar
smashes do not improve, and the novice model never reaches Stage 8. The result
therefore isolates an arrival/crowding sensitivity boundary; it neither tests
first-time Stage 8 learning nor demonstrates better return-jar control. Exact
distributions are pinned in
`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:130-190`, and the
artifact remains explicitly prospective/unranked with no proof emission
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:40-46,
624-638`).

There is also a plausible over-relief risk: all fixed competent variants become
perfect while reactive maximum crowd/open demand remain only 3/1, and reactive
mean one-or-fewer-jar exposure falls from 0.061 to 0.020. That is useful model
evidence, not a finding that the stage is too easy; only players can determine
whether Closing Time still feels like a culmination rather than extra waiting.

**Acceptance before promotion:** run a blinded human control-versus-relief
comparison that includes Stage 8, separates first-time from informed players,
and records completion, perceived pressure/fairness, hardest decision, loss
attribution, jar-return failures, recovery belief, and preference. Pre-register
the promotion threshold. Preserve the candidate as unranked if the evidence is
mixed. This finding is a promotion blocker, not a generation-2 defect.

### TD12-G02 — The numerical duration band is plausible; the human objective is unmeasured

The success criterion is a **complete human** fresh run normally lasting 5–15
minutes (`docs/maltline/TASKS.md:8-17`), and P1-02 correctly requires both
simulation and human distributions (`docs/maltline/TASKS.md:83-96`). Successful
fixed profiles occupy roughly 6.0–6.34 active minutes under control/relief, so
the campaign has a credible numerical foundation. Those values exclude title,
instructions, stage cards, countdowns, manual stage-clear dwell, human
hesitation, interruptions, and terminal review; the README labels the existing
6.0–6.2-minute claim as active model time before transitions
(`games/maltline/README.md:8-12`).

The only novice probe loses in 49.617–175.383 seconds and never reaches Stage 8.
It is an injected-error stress profile, not a novice-human percentile. The
existing human lab intentionally compares only Stages 4–7 and expressly cannot
close full-game duration (`docs/maltline/audits/P1-08-HUMAN-LAB-UX.md:31-32,
201-212,417-425`). Thus neither its 15–20-minute appointment nor EXP-078's
simulation seconds answers the product criterion.

**Acceptance:** collect successful, uninterrupted full eight-stage wall-clock
runs separately from active ticks for predeclared first-time and informed
strata. Retain stage reach, failed-attempt duration, restarts, card/countdown
dwell, interruptions, and voluntary stop/fatigue separately; do not pad a
short failed attempt into the completion distribution. Define the sample and
decision bounds before collection, and require the chosen successful-human
distribution to fall within 5–15 minutes. This blocks closing P1-02, not the
current ranked game.

### TD12-G03 — Lives and score are coherent, but the early-loss policy remains a product decision

The implementation is internally consistent. A customer's first fulfillment
earns `100 + 10 * min(chain, 10)`, a rescue service earns zero, and only first
fulfillment increments the chain and unique-fulfillment count
(`games/maltline/src/core/engine.ts:279-307`; constants at
`games/maltline/src/core/rules.ts:9-18`). An eligible first returned jar earns
25; misses lose a life (`games/maltline/src/core/engine.ts:324-350`). Any life
loss clamps lives to zero and resets the chain, while every cleared stage adds
250 points per **currently carried** life (`games/maltline/src/core/engine.ts:
368-386`).

That last rule compounds an early error across later stage bonuses. EXP-059's
same-cause first-return miss wins all 33 seeds in either Stage 4 or Stage 8, but
the authoritative score is 34,880 versus 35,880. Two unranked, budget-preserving
alternatives both remove the 1,000-point timing difference
(`games/maltline/tests/p1-04-recovery-experiment.test.ts:51-83`). Canonical
recovery to the next first fulfillment is 103 ticks after the Stage 4 miss and
92 after the Stage 8 miss; returning to the maximum serve tier takes 1,652 and
1,189 ticks (`:86-112`). EXP-078 adds evidence that arrival spacing reduces
walkouts, but it does not compare score policy or explain whether a human sees
the carried-life penalty as fair, motivating, or opaque. Unchanged jar-smash
counts also caution against treating arrival relief as a general recovery fix.

**Acceptance:** use observed loss explanations and score-belief responses to
decide whether carried lives should continue taxing every later stage. Compare
the already-defined ledgers without changing arrival pacing in the same test.
If the current policy is retained, players should accurately identify the life
loss, chain reset, jar consequence, and continuing bonus cost. If scoring
changes, make it a separately versioned rules/authority decision with new
goldens and retained generation-2 verification. This blocks closing P1-04; it
does not reveal an engine correctness bug.

## P2 findings

### TD12-G04 — Structural recovery/scarcity/cascade fields are honest but easy to overread

The experiment correctly preserves within-tick event order and greedily assigns
each later first-fulfillment event to at most one earlier life loss
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:374-415`).
That field means only “a later first fulfillment exists”; life-loss events do
not identify a recovered customer, and a pairing is not causal evidence. A
terminal cascade means at least two losses after the last first fulfillment in
a fatal run (`:417-459`), not losses within a general fixed time window. The
observed cascade spans happen to be short—50–146 ticks—but the definition itself
has no maximum gap. The artifact identity accurately states both definitions
and that callbacks are trusted (`:695-704`).

Scarcity retains raw counts and per-run rates, with each denominator equal to
that run's observed Stage 8 ticks (`:359-371,441-459`). Comparisons across a
control containing early fatal runs and an all-winning relief set are therefore
exposure/survivor-sensitive. In addition, the generic distribution helper
rounds rate means and medians to three decimals (`:285-297`): delayed control
reports mean zero-jar rate `0` even though its maximum is `0.006357`. The raw
run values preserve the truth, but the compact summary can hide rare scarcity.

**Acceptance before using these fields as promotion claims:** keep the present
structural wording; report reached-run counts and Stage 8 tick exposure by
terminal status; add winner-only and status-stratified scarcity summaries or a
predeclared common-exposure window; and retain at least six-decimal rate means
or include affected-run count plus pooled raw ticks. A causal recovery claim
requires customer/input linkage or human observation. A time-cluster claim
requires an explicit maximum-gap/window definition. No current artifact repair
is required because raw evidence and definitions are retained.

### TD12-G05 — Prefix reuse is sound for this experiment; its fresh-run oracle is historical

Only lives and score cross a stage boundary in normal campaign execution. The
optimized experiment clones/freezes those run counters, completion/loss totals,
and prefix duration, then creates a new engine and controller for Stage 8
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:462-576`). It
does not share engine or controller instances. The ledger explicitly separates
264 logical outcomes from 132 executed and 132 reused prefixes and reconciles
1,006 starts with 2,736,116 controller calls/engine steps (`:708-745`). Tests
prove equal prefix values, distinct references, stable fingerprints, and exact
work (`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:116-127,
212-220`). EXP-078 additionally records an independent fresh eight-stage run of
all 132 relief cases with matching terminal outcomes
(`docs/maltline/EXPERIMENTS.md:2917-2924`).

This is truthful for a Stage-8-only scenario change and stage-local controller
lifetime. The full-run oracle is review evidence rather than a checked-in gate.

**Acceptance before changing the optimization:** add an independent full-run
equivalence test over every profile/seed when prefix fields, controller
lifetime, carry state, or candidate scope changes. It must compare terminal
run fields and Stage 8 observation/event summaries, not merely compact prefix
fingerprints. A candidate touching Stages 1–7 must not reuse this prefix path
without a newly proved boundary.

### TD12-G06 — `CHAIN N` is truthful, but exact score comprehension remains unproved

`CHAIN N` now reports the raw first-fulfillment count since the last life loss
and deliberately avoids multiplier language
(`games/maltline/src/viewer/presentation-copy.ts:12-18`). The live semantic
status uses that shared label while served/catch announcements state exact
awarded points (`games/maltline/src/viewer/semantic-status.ts:12-27,35-73`).
Tests explicitly cover chains above the scoring cap, including `CHAIN 31`, and
reject `×`/`STREAK` wording
(`games/maltline/tests/presentation-copy.test.ts:4-10`; renderer coverage at
`games/maltline/tests/renderer-presentation.test.ts:332-340`).

The remaining ambiguity is product comprehension, not false copy: the visible
count keeps rising above 10 even though the serve bonus is capped, and the
instructions explain lives but not the +10 progression/cap
(`games/maltline/src/viewer/gameplay-flow.ts:63-90`).

**Acceptance:** retain exact event-point copy and ask participants what CHAIN
counts, what breaks it, and whether it changes score. Add a concise score hint
only if observed answers show a material misunderstanding; do not restore a
multiplier or alter scoring from automated copy evidence alone. This is a P2
comprehension follow-up under P1-04, not a release blocker.

### TD12-G07 — The P1-04 repeatability check remains wall-clock brittle under host contention

The focused P1-04 suite computes one shared artifact and then one fresh full
artifact inside a default five-second test for byte-repeat evidence
(`games/maltline/tests/p1-04-recovery-experiment.test.ts:115-129`). On this
heavily CPU-contended host, that assertion timed out twice: 6.173 seconds when
run beside player models and 6.857 seconds in isolation. The other semantic
assertions passed, as did the P1-02/scoring/presentation gate and Maltline
build. Process inspection showed many unrelated solver processes consuming the
host, so this is throughput brittleness rather than contradictory gameplay
evidence.

**Acceptance:** make the default test robust without increasing simulation
budgets or weakening repeatability—prefer a once-per-suite second artifact or a
bounded subprocess/CLI comparison whose outer gate owns an appropriate job
budget. A normal uncontended default-parallel Maltline run must pass repeatedly.
This blocks a claim that every independent local gate is currently green; it
does not block generation-2 gameplay or justify tuning changes.

## Authority decision

Do **not** edit the registered campaign now. The immutable authority still pins
ruleset 2, campaign generation 2, and configuration SHA-256
`e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`
(`games/maltline/src/core/version.ts:5-15`; `games/maltline/src/core/authority.ts:
99-111`). If human evidence later selects 138, it is a scenario-only change:
preserve generation 2 and introduce campaign generation 3 with a new authority,
configuration digest, season/storage context, campaign/scenario fingerprints,
and proof/verifier fixtures. Do not bump the ruleset or proof schema unless
their own semantics change. Any scoring-policy change is separate and does
require a ruleset/authority migration.

## Independent checks

- `npm test --workspace=@arcadebench/maltline -- --run tests/p1-02-stage8-relief-experiment.test.ts tests/scoring-resolution.test.ts tests/presentation-copy.test.ts` — **3 files, 22 tests passed** in 15.87 seconds.
- `npm run --silent relief:p1-02 --workspace=@arcadebench/maltline` — emitted exactly one 533,781-byte JSON document; SHA-256 **`442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`**. Parsed identities and all eight fixed summaries matched EXP-078; work reconciled to 2,736,116 ticks/calls/steps.
- `npm run build --workspace=@arcadebench/maltline` — **passed** (`tsc` plus Vite; 44 modules transformed).
- `npm test --workspace=@arcadebench/maltline -- --run tests/p1-04-recovery-experiment.test.ts tests/player-models.test.ts` — **12 passed, 1 timed out** at 6.173 seconds in the P1-04 fresh-repeat assertion.
- `npm test --workspace=@arcadebench/maltline -- --run tests/p1-04-recovery-experiment.test.ts` — **3 passed, 1 timed out** at 6.857 seconds in the same assertion. This is recorded as TD12-G07 rather than concealed as a green gate.

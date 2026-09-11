# TD-02 — Maltline Gameplay/Engine Review

**Review date:** 2026-09-10
**Scope:** the combined ruleset-2 engine and proof contracts, campaign generation
2, telemetry/player-model/tuning evidence, and the gameplay-facing UI/audio
boundaries added or exposed by EXP-022 through EXP-024.
**Disposition:** review only. No product code, task log, or experiment log was
changed.

## Verdict

The deterministic engine path is materially healthier than at TD-01. Scenario
and run normalization is centralized, the score-farming loop is finite, fatal
resolution stops immediately, proof summaries agree with engine counters, and
the generation-2 canonical campaign completes consistently. A fresh run passed
all 167 tests and the production build.

I found no release-blocking arithmetic or terminal-state defect in the core tick
simulation. There are, however, two true blockers for specific release claims:

1. **A ranked or benchmark release is blocked by discarded browser time.** A
   slow/throttled client gains wall-clock reaction time without making its proof
   ineligible.
2. **A production web release needs a font-load failure path.** One rejected
   bundled-font promise prevents the game loop from starting.

Separately, the promoted campaign's machine evidence is not sufficient to claim
that it is fun or that a human run lasts 5–15 minutes. The duration claim is
properly labeled “active” in the README, but generation 2 was selected using
synthetic controllers and a tuning fingerprint that does not bind the baseline
campaign or rules. Those are tuning/evidence blockers, not proof that the stage
numbers are bad.

## Fresh evidence

```text
npm test --workspace=@arcadebench/maltline
  12 files, 167 tests passed

npm run build --workspace=@arcadebench/maltline
  TypeScript and Vite build passed

npm run telemetry --workspace=@arcadebench/maltline
  won 8/8; 21,662 ticks; 361.033 active seconds; score 36,255
  145 fulfilled / 145 resolved; 4 lives; no losses
```

Canonical stage pressure is low through the middle of the campaign:

| Stage | Seconds | Max live customers | Max marching | Max jars committed |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 25.967 | 2 | 1 | 3 |
| 2 | 27.017 | 2 | 1 | 3 |
| 3 | 31.350 | 2 | 1 | 3 |
| 4 | 52.000 | 2 | 1 | 3 |
| 5 | 62.767 | 2 | 1 | 3 |
| 6 | 51.717 | 2 | 1 | 3 |
| 7 | 55.200 | 3 | 2 | 4 |
| 8 | 55.017 | 3 | 2 | 5 |

The existing 33-seed comparison remains a useful regression probe: reactive
wins 33/33, delayed-competent wins 31/33, and novice wins 0/33. It is not a
human-skill model: “delayed competent” adds only two ticks (33 ms at 60 Hz) per
changed decision, and “novice” injects a deterministic wrong-lane serve every
eight opportunities (`player-model-controllers.ts:19-30,43-69,99-139`).

## Release blockers

### TD2-G01 — Dropped wall time remains rank-eligible

**Severity:** P0 for ranked/benchmark release; P1 for an explicitly unranked
prototype
**Evidence:** `src/viewer/fixed-step-clock.ts:61-78`,
`src/viewer/main.ts:163-181`, `tests/fixed-step-clock.test.ts:60-73`

The fixed-step clock deliberately caps backlog at six ticks and returns the
discarded amount as `droppedMs`. The main loop reads only `.ticks` and throws
away `droppedMs`. A one-second hitch therefore executes 100 ms of simulation
and silently discards about 900 ms. The checked-in clock test confirms exactly
that behavior.

This protects rendering responsiveness but changes competitive fairness. A
slower browser receives more real time to observe and choose each recorded
input while the proof contains only the executed ticks. Intentional CPU
throttling can therefore make a valid proof easier without changing its
identity. It also makes the README's active duration diverge unpredictably from
human elapsed duration.

**Bounded repair:** preserve the six-tick render safety limit, but make any
discarded backlog an explicit session event. Pause behind a visible “timing
interrupted” overlay and either restart the stage or mark the run unranked.
Do not encode wall time into the deterministic engine.

**Acceptance criteria:**

- 30/60/90/120/144 Hz and bounded jitter produce the same tick/input outcome;
- any backlog drop changes proof eligibility before another input is recorded;
- blur/visibility reset is treated as an explicit pause, not a hidden time
  advantage;
- a browser integration test covers an ordinary schedule, a 1 s hitch, and a
  background/resume cycle.

### TD2-G02 — A font failure can prevent all gameplay initialization

**Severity:** P0 for production web release; safe to defer for a controlled
local prototype
**Evidence:** `src/viewer/main.ts:13-17`, `src/viewer/fonts.ts:30-41`,
`tests/viewer-boundary.test.ts:5-25`

The entry point awaits all four font loads before it creates the renderer or
starts `requestAnimationFrame`. `prepareMaltlineFonts` throws if any load returns
no face and has no timeout/fallback. The shell is mounted first, but the game
never becomes playable and no failure message is installed. The only production
boundary test proves that bundle strings are present; it does not exercise load
failure.

**Bounded repair:** keep the exact font bundle for visual capture, but let live
play fall back to the declared system font stack after a bounded failure. Mark
the document for diagnostics and show a nonblocking notice in development.

**Acceptance criteria:** reject one mocked font load and prove the title screen,
keyboard start, tick loop, and overlay remain functional; prove successful
loading still sets the expected bundle/readiness markers.

## Must fix before relying on the next tuning decision

### TD2-G03 — EXP-021's fingerprint does not bind its actual simulation inputs

**Severity:** P0 for tuning provenance; not a live-game blocker
**Evidence:** `src/telemetry/tuning-experiment.ts:203-239,315-366`,
`tests/tuning-experiment.test.ts:47-82`

`candidateFingerprint` hashes the transform description, lives, and late-stage
knobs. `experimentFingerprint` then hashes seed offsets plus candidate and
controller fingerprints. Neither binds the supplied baseline scenarios nor the
rules/game fingerprint from the telemetry runs.

I reproduced a real collision with one candidate, one profile, and one seed:

```text
baseline stage 1 customerCount=8:  235.333 s, score 25,930
changed  stage 1 customerCount=9:  238.133 s, score 26,135
experiment fingerprint in both:   fnv1a64:8ea46d61a975ae54
```

The checked-in repeatability and outcome tests remain green because they never
assert that baseline/rules changes alter experiment identity. This weakens the
audit trail used to promote generation 2.

**Bounded repair:** add the rules/game fingerprint, normalized baseline campaign
fingerprint, initial-run policy, tick limit, and each effective candidate
campaign fingerprint to the experiment's canonical identity. Bump the tuning
schema version. Preserve the old EXP-021 artifact/fingerprint as historical
data rather than silently rewriting its meaning.

**Acceptance criteria:** changing any normalized scenario field, rules manifest,
initial lives, controller metadata, tick limit, seed set, or candidate transform
changes identity; repeated identical runs remain byte-identical; a checked-in
golden identifies both historical generation 1 and promoted generation 2.

### TD2-G04 — Generation 2 has duration evidence, not human difficulty/flow evidence

**Severity:** P0 for declaring balance complete; no code-release blocker
**Evidence:** `src/core/campaign.ts:28-131`,
`src/telemetry/player-model-controllers.ts:19-30`,
`audits/TUNING-01.md:89-125`, `README.md:8-12`

The promoted counts and wider spawn intervals put successful bots inside the
300–420 active-second target, but the reactive trace never has more than one
marching customer in stages 4–6, never commits more than three jars there, and
never reaches zero clean jars anywhere. Stage 5 lasts 62.767 seconds despite
the same canonical live-crowd/jar maxima as stage 1. The EXP-021 report itself
correctly warned that stages 4–6 became longer more than denser.

The 33 shadow runs also add the same offset to every stage seed
(`player-model-comparison.ts:109-117,169-193`). That is deterministic coverage,
not an independent statistical sample of human campaigns. The exact-state bots
have perfect perception, fixed scripted errors, and no motor/attention model.

**Bounded next experiment:** do not tune again from bots alone. Run short human
sessions on the authored generation-2 campaign, collecting both active and
wall-clock seconds, stage restarts/exits, stage reached, loss cause, order
latency, idle/low-pressure periods, and a short perceived-flow rating.

**Acceptance criteria:** predeclare a small novice/competent/expert cohort and
decision thresholds; median successful wall-clock run remains within 5–15
minutes; stages 4–6 are not consistently rated as repetitive; stage 8 is hard
but attributable; bot regressions remain green after any human-led adjustment.

## High-priority correctness and architecture debt

### TD2-G05 — Campaign identity and progression have no single authority

**Severity:** P1; P0 before leaderboard/server integration
**Evidence:** `src/core/campaign.ts:8-32`, `src/core/version.ts:5-12`,
`src/viewer/main.ts:21-30,67-112`,
`src/telemetry/campaign-telemetry.ts:272-301`,
`src/core/proof.ts:393-425,457-555`

`MALTLINE_CAMPAIGN` is an exported mutable array of mutable scenario objects.
Each engine freezes the one stage it receives, but the viewer consults the
global array again for later stages. Accidental mutation after stage 1 can
therefore change stage 2 onward while the numeric campaign generation remains
2.

Viewer, telemetry, and verifier also each reimplement ordered progression,
carried lives/score, stop-on-loss, and completion. Four starting lives are
stored redundantly in every scenario even though only the first scenario's
default is used for a campaign start. The proof envelope carries numeric
generation but no campaign fingerprint (`proof.ts:125-133`), while telemetry
carries fingerprints but not the numeric ruleset/campaign generations
(`campaign-telemetry.ts:92-106`). The two evidence systems cannot directly join
on one canonical identity.

The proof API correctly documents its context as server-owned. This is not a
client injection vulnerability; it is a deployment invariant that is currently
easy to violate by supplying any valid campaign alongside generation 2.

**Bounded refactor:** introduce a deeply frozen `MaltlineCampaignDefinition`
with `{ generation, fingerprint, initialRun, stages }`, plus a small pure
campaign-session transition policy. A server registry must map generation 2 to
that exact definition; a client must never provide the catalog. Viewer,
telemetry, and proof should consume the same identity and transition outputs.

**Acceptance criteria:** source-array/object mutation cannot affect any later
stage; the generation-2 fingerprint is pinned once; the same input trace through
the session, telemetry, and verifier yields identical starts/finals; loss,
victory, zero-life, and carried-score transitions are cross-tested.

### TD2-G06 — Tick-duration semantics are inconsistent and under-specified

**Severity:** P1 before freezing ruleset 2 as a long-lived competitive protocol
**Evidence:** `src/core/types.ts:31-41`, `src/core/engine.ts:154-164,181-215,236-249,323-365`,
`tests/proof.test.ts:62-68`

Several fields described as a duration do not share one convention:

- `blendTicks: 1` requires two held input ticks: one starts blending at progress
  zero and the next completes it. The canonical proof helper explicitly holds
  for two ticks.
- a caught jar is inserted with `washTicks` and decremented later in the same
  engine step, so `washTicks: 1` returns it immediately;
- a customer's drink timer begins after the customer movement phase, so its
  first decrement is on the following tick;
- initial spawn delay counts down before spawning, while subsequent cadence is
  calculated after a spawn.

Additionally, the scenario comment says cadence accelerates “per customer
served,” but the engine subtracts `spawned * spawnAccelerationTicks`. The tuning
report uses the actual per-spawn behavior, so this is currently a contract/doc
mismatch, not an EXP-023 arithmetic error.

**Bounded repair:** write one phase/timer convention (“N full future ticks” or
“inclusive tick”) and table-test 1/2/N values for blend, drink, wash, first
spawn, and next spawn. Correct the acceleration wording if spawn-driven cadence
is intended. Any behavior correction needs a ruleset bump; documentation-only
clarification does not.

### TD2-G07 — Four lives are coupled to a large, timing-sensitive score change

**Severity:** P1 scoring decision before ranked leaderboards
**Evidence:** `src/core/campaign.ts:8-26`, `src/core/engine.ts:377-385`,
`src/core/scenario.ts:189-210`

The stage-clear bonus awards 250 points per *current* life at every stage. On
the generation-2 campaign, the reactive controller scores 36,255 with four
lives and 34,255 with three: the added starting life is worth 2,000 points on a
clean eight-stage run. Conversely, losing one life in stage 1 removes as much as
2,000 future bonus points, while the same loss in stage 8 removes 250. This may
be desirable arcade scoring, but EXP-023 describes four lives primarily as
forgiveness; it also changes score scale and makes identical mistakes depend
strongly on when they occur.

**Bounded repair:** make an explicit leaderboard decision: retain the
compounding survival bonus and document/test it, or award a campaign/end-stage
life bonus with a noncompounding policy at the next ruleset boundary.

**Acceptance criteria:** a table test covers zero through four lives at each
campaign stage, one early versus late loss, safe score headroom, and the exact
maximum generation-2 score.

### TD2-G08 — Runtime input is trusted outside the proof parser

**Severity:** P1 before exposing the core/controller API beyond trusted code
**Evidence:** `src/core/engine.ts:89-92,142-178`,
`src/telemetry/campaign-telemetry.ts:227-240`,
`src/core/proof.ts:507-521`

The proof verifier strictly sanitizes inputs, and the current keyboard adapter
constructs legal values. `MaltlineEngine.setInput`, however, merely spreads the
object. A JavaScript caller or telemetry controller can pass `NaN`, an invalid
direction, a string, missing fields, or extra getters. A `NaN` lane direction
can turn `playerLane` into `NaN`; JSON output then degrades that number to
`null` instead of failing near the bad controller.

**Bounded repair:** add a small shared `normalizeMaltlineInput` used by engine,
proof encoding, and controller telemetry. Copy exactly four primitive fields,
reject unsupported values, and never spread an untrusted input object.

**Acceptance criteria:** an adversarial table covers every field, getters,
extra keys, mutation after `setInput`, and malformed controller output; all fail
before a tick mutates state, while legal replay/proof goldens remain unchanged.

### TD2-G09 — Scenario fingerprinting is a second, manually maintained schema

**Severity:** P1 evidence maintainability
**Evidence:** `src/core/scenario.ts:75-187`,
`src/telemetry/campaign-telemetry.ts:128-157,313-333`,
`tests/campaign-telemetry.test.ts:130-180`

Normalization explicitly enumerates every scenario field, then telemetry
separately enumerates them again for canonical fingerprints. TypeScript does not
force the second list to grow when the scenario schema gains a field. A future
mechanic such as `waveBreaks` could affect the engine while being silently
absent from campaign/configuration identity. Current tests change only
`blendTicks`, not every field.

Telemetry identity also omits the explicit numeric ruleset and campaign
generation even though those are the public proof identity. The hashes contain
the current rules/scenario values, but this still makes artifact joins and
operator diagnosis harder.

**Bounded refactor:** return a canonical scenario data object from the normalizer
itself (or use an exhaustiveness-checked schema serializer), and make both proof
and telemetry consume a shared `{rulesetVersion, rulesFingerprint,
campaignGeneration, campaignFingerprint}` identity.

**Acceptance criteria:** a parameterized test changes every scenario field one
at a time and requires a scenario/campaign/configuration identity change; adding
a compile-time scenario field cannot omit it from canonical serialization.

## UI/audio boundary debt to schedule with those feature tranches

### TD2-G10 — Presentation sometimes reconstructs context from final tick state

**Severity:** P1 UI correctness; not an engine blocker
**Evidence:** `src/viewer/renderer.ts:191-240`

Score popups now correctly use `event.points`, and life-loss callouts use the
authoritative reason. The served popup still appends `state.streak`, which is the
final streak after all events in that tick. If two slides serve customers on the
same tick, both popups can show the same final streak even though their point
deltas differ. Failure-lane attribution similarly relies on the physical
failure event being directly followed by its `life_lost` event.

**Bounded repair:** presentation events should be self-contained for the facts
they display. Add `streakAfter` to `served` (a ruleset/event-schema change) or
omit the reconstructed streak suffix. Keep a small engine-to-presentation
adapter if UI and future audio need richer derived cues.

**Acceptance criteria:** cover two service events in one tick, zero-point rescue
plus first fulfillment, and multiple same-tick failures; displayed score/streak
and lane/reason must follow each event, not final aggregate state.

### TD2-G11 — Audio needs a typed presentation-cue contract before runtime work

**Severity:** P1 before P0 audio cues ship; currently deferred by design
**Evidence:** `docs/maltline/AUDIO.md:20-38,371-390`,
`tools/audio-production.mjs:60-123,170-255`

EXP-024 explicitly ships only an acquisition scaffold: no audio assets or
runtime exist, so absence of sound is not a regression in the deterministic
engine. The future mapping cannot be only `GameEvent -> file`, though. Station
move, lane move, blend loop, and final campaign victory are viewer/session
transitions, while physical failure, `life_lost`, and `game_lost` may all occur
on one tick. The plan validator currently accepts any nonempty `event` string,
so naming can drift from both engine and viewer contracts.

Create a typed presentation-cue vocabulary that can receive engine events plus
session/input transitions without importing audio into core. Validate plan
events against that vocabulary. Muted/audible parity and terminal cleanup gates
already specified in `AUDIO.md` should remain mandatory.

The production tool also writes source/master/runtime sequentially with
exclusive-create behavior and no transaction/resume cleanup
(`audio-production.mjs:147-167,170-205,251-255`). A normalization failure after
a paid response leaves a partial directory that a retry cannot overwrite. The
tool probes only the WAV master and records target loudness rather than measured
post-normalization loudness. These are acquisition-workflow blockers before a
paid release batch, not gameplay-release blockers while no asset is shipped.

## Later cleanup

### TD2-G12 — Tests mix protocol tripwires with brittle implementation probes

**Severity:** P2
**Evidence:** `tests/scoring-resolution.test.ts:55-64,166-253`,
`tests/campaign-telemetry.test.ts:54-88`, `tests/proof.test.ts:416-440,511-518`,
`tests/viewer-boundary.test.ts:5-25`

The exact campaign, telemetry, and proof hashes are valuable approval gates,
but they are scattered across several tests and all require manual updates for
an authored campaign promotion. Centralize expected generation identity and
canonical outcomes in one reviewed manifest/helper while preserving explicit
golden approval.

Fatal simultaneous-event tests still cast the engine to private internals and
construct unreachable entities. Keep them until a replacement exists, then
test an extracted ordered-resolution primitive or legal deterministic traces.
Add trace-wide invariant/property coverage for counter relationships, event
score ledger, jar conservation, unique/reference-valid IDs, and immutable
terminal states. The live viewer presently has only a bundle-content test; add
a browser-level campaign/session test rather than expanding string assertions.

### TD2-G13 — Current per-tick allocation is acceptable, but growth should be measured

**Severity:** P2
**Evidence:** `src/core/engine.ts:94-122,219-353`,
`src/telemetry/campaign-telemetry.ts:186-240`,
`src/telemetry/reactive-controller.ts:39-67`, `src/viewer/main.ts:79-82`

Snapshots clone all entity arrays every tick; telemetry and controllers filter,
sort, and scan those arrays again; the viewer re-simulates an entire stage to
build its rich replay at the terminal boundary. Current campaign maxima are tiny
and the full test suite completes quickly, so speculative optimization would be
premature. Benchmark before raising entity/tick limits or running large tuning
matrices, and avoid synchronous terminal replay work if browser traces show a
visible stage-clear hitch.

## Recommended order

1. Define rank eligibility for dropped clock time; add the browser hitch tests.
2. Add the font failure/fallback path before calling the viewer production-ready.
3. Repair tuning identity and preserve EXP-021 as an explicitly historical
   artifact.
4. Run the first generation-2 human playtest before changing campaign values.
5. Introduce the immutable campaign definition/session and shared proof/telemetry
   identity before leaderboard integration.
6. Decide timer and compounding-life-score semantics before the next ruleset
   freeze.
7. Harden runtime input and canonical scenario serialization.
8. Add the typed presentation cue layer when audio runtime work begins; defer
   allocation and test-fixture cleanup until profiling or feature growth
   justifies it.

The central conclusion is narrow: generation 2 is deterministic, finite, and
well covered on its canonical engine path. What remains risky is the boundary
around that path—browser time, production startup, campaign authority, and the
identity and human validity of the evidence used to tune it.

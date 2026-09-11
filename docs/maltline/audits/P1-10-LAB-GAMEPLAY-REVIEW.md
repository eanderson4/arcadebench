# P1-10 Human Lab Gameplay Review

**Date:** 2026-09-11
**Scope:** current development-only P1-10 browser lab, the pure session reducer,
the canonical A/D materializer, and the contract in
`P1-08-HUMAN-LAB-UX.md`
**Change made by this review:** this report only

## Verdict

The lab's isolation boundary and ordinary engine/run wiring are sound, but the
current artifact is **not ready to serve as EXP-049 human tuning evidence**.
Three blockers can make the evidence false or reveal the candidate difference:
practice retries are merged into a later win, the browser test driver can mint
indistinguishable zero-tick “human” artifacts, and the Stage 7 card exposes the
A/D order-count difference. In addition, the implemented three-question final
comparison omits the stage pulses and diagnostic fields needed to decide the
Stage 5/7 tuning hypothesis.

The current entry is suitable for a supervised interaction smoke test only.
Do not use its downloaded JSON to select A or D until G01–G04 are closed.

## Severity-ranked findings

### P1-10-G01 — Blocker: a practice loss is erased and its ticks are credited to a later win

The pure reducer implements the documented one-pass practice policy: any lost
practice stage is recorded and moves to Round 1
(`src/experiments/human-lab-session.ts:250-266`). The browser instead intercepts
that terminal result, does not dispatch `stage-terminal`, and constructs a new
engine for the same stage (`src/viewer/human-lab.ts:318-329`). `activeTicks` and
`activeInputSamples` remain in reducer state, so every failed attempt is folded
into the eventual successful attempt while the loss, zero lives, and failed
attempt score disappear. The copy promises “Retry practice stage”
(`human-lab.ts:296-308`), so the mismatch is deliberate UI behavior but is not
represented by the schema.

The browser test exercises a forged practice loss and checks only that Stage 1
reappears (`tests/visual/human-lab.visual.spec.ts:162-180`); it never inspects the
resulting artifact. This is both a one-attempt contract mismatch and an artifact
truthfulness failure.

**Bounded fix:** choose one policy and encode it in both reducer and UI. The
smallest contract-preserving fix is to dispatch the loss and proceed to Round 1,
with copy explaining that practice ended. If practice retries are retained,
introduce explicit attempt records and reset the reducer's per-attempt counters
before creating the replacement engine; do not collapse attempts.

**Acceptance:** lose Practice Stage 1 after N real engine ticks, continue, and
assert either (a) one lost N-tick practice record followed by fresh Round 1, or
(b) two separate attempt records. No winning record may contain ticks from the
failed engine.

### P1-10-G02 — Blocker: the development test driver can create an indistinguishable fabricated artifact

Because the lab itself runs under Vite development mode, adding
`labTestDriver=1` exposes a global whose `finishStage()` calls the browser
terminal handler with the current snapshot even when the engine is still
running (`src/viewer/human-lab.ts:618-634`). The visual flow uses that method for
all eleven stages (`tests/visual/human-lab.visual.spec.ts:104-143`). The artifact
normalizer permits a won stage with zero ticks, so that path can download a
schema-valid artifact in which every stage is won at tick zero. A direct reducer
counterexample produced eleven `status: "won"` records with eleven zero tick
counts and froze successfully.

The artifact has no acquisition/test-mode provenance, so a facilitator cannot
distinguish this from a human session after download. An accidentally retained
query parameter is enough to contaminate evidence.

**Bounded fix:** make terminal injection unavailable in the human-session
entry, or irreversibly mark any driver-influenced session synthetic and forbid
artifact download/normalization as human evidence. Prefer a browser test helper
that drives real engine ticks with deterministic physical intents over one that
forges terminal state.

**Acceptance:** no URL accepted for a human session can expose terminal
injection; if a test-only build retains it, invoking it must make the artifact
typed synthetic/unavailable. Add a real-engine browser path that reaches at
least one normal terminal without calling `terminal()` or `finishStage()`
directly.

### P1-10-G03 — Blocker: the Stage 7 card reveals the candidate's changed order count

The comparison-round card renders `scenario.customerCount` in visible text
(`src/viewer/human-lab.ts:248-265`). The frozen candidates have 27 Stage 7
orders for A and 29 for D (`src/experiments/p1-08-candidates.ts:63-67`). Thus an
observant participant can identify that the two round setups differ before
answers are frozen, contrary to the explicit ban on parameter values in visible
or accessible text. The existing hiding check searches only `body.outerHTML`
for candidate IDs/reveal phrases (`tests/visual/human-lab.visual.spec.ts:146-150`),
not for candidate-dependent presentation.

**Bounded fix:** use identical neutral comparison-stage card copy for A and D;
do not expose customer count or other candidate-varying authored values before
debrief.

**Acceptance:** capture visible text, accessible names, title/head metadata,
and ordinary DOM attributes at every Round 1/2 surface for both assignment
orders. After replacing only `Round 1`/`Round 2`, the structures must be equal.

### P1-10-G04 — Blocker for tuning decisions: the artifact does not measure the question EXP-049 needs answered

The UX contract calls for a three-response pulse after each cleared Stage 4–7,
a loss explanation, and final questions about jar scarcity, recovery, and score
understanding (`P1-08-HUMAN-LAB-UX.md:173-193`). The implementation has no stage
pulse; the image named `human-lab-stage-pulse-1280.png` is actually an ordinary
terminal card (`src/viewer/human-lab.ts:286-315`; visual test at
`tests/visual/human-lab.visual.spec.ts:256-265`). The only responses are clearer
ramp, fairness, and enjoyment (`human-lab.ts:360-425`).

The schema also omits wall/pause time, engine-classified loss reasons,
fulfilled/resolved/walkout counters, input transitions, bounded pre-loss
context, viewport/reduced-motion metadata, participant stratum/token digest,
and authority/candidate/campaign fingerprints
(`src/experiments/human-lab-session.ts:12-45`). Stage `score` is a cumulative
terminal score rather than the requested named stage delta. Consequently the
artifact can report preference but cannot attribute it to Stage 5 resource
cadence, Stage 7 pressure, waiting versus planning, recovery, or score
comprehension.

**Answer to the explicit sufficiency question:** the three-question artifact is
not sufficient for the next decision-bearing human session. It is sufficient
only for a usability pilot whose preferences are discarded.

**Minimum next-session slice:** add the Stage 4–7 pressure/pacing/optional-hardest-
moment pulse, a loss explanation, the two final jar-scarcity/recovery questions,
the score-belief prompt, exact engine terminal counters/loss reasons, active and
paused timing, viewport/reduced-motion metadata, and immutable materializer
provenance. Preserve response order in the artifact.

### P1-10-G05 — High: `candidateExposure` misclassifies losses after exposure

`finishRound()` marks every loss `partial`, while `full` requires clearing Stage
7 (`src/experiments/human-lab-session.ts:225-230`). Normalization enforces that
equivalence (`human-lab-session.ts:157-175`). The UX definition is narrower:
partial means the participant never reaches a changed stage. D already changes
Stage 5, so a player who reaches Stage 5 and then loses has received candidate
exposure; a player who loses late in Stage 7 has certainly seen the changed
Stage 5 cadence and Stage 7 pressure. Labeling both partial would wrongly
exclude useful paired evidence and obscure dose differences.

**Bounded fix:** define exposure from the stages actually entered and the
candidate's declared change set, recording at least `none`/`partial`/`full` or a
reached-stage list. Derive comparison eligibility from that explicit exposure,
not from terminal status.

**Acceptance:** losses in Stages 4, 5, 6, and 7 under both orders produce the
documented exposure classification; Stage 5/7 entry is distinguishable from a
Stage 4 loss.

### P1-10-G06 — Medium: interruption restoration is mostly safe, but comparison drafts are lost and interruption evidence is absent

All pause entries clear physical input and clock backlog, and resume requires an
explicit action (`src/viewer/human-lab.ts:168-172,490-530`). Stage/card,
terminal, intermission, frozen, and debrief surfaces are reconstructed from
state; normal stage boundaries also create a fresh input adapter and engine
(`human-lab.ts:226-240`). Native repeated presentation actions are rejected
(`human-lab.ts:532-550`). I found no stale key, serve latch, or catch-up path
across those boundaries.

However, pausing on the comparison surface removes its DOM form, and resume
calls `comparison()` to construct a blank form (`human-lab.ts:526-528,366-425`).
Answers selected before blur/resize are silently discarded. No interruption
kind or duration is recorded anywhere in the reducer/artifact, despite the UI
claim that interruptions record no ticks.

**Acceptance:** exercise blur, hidden document, 699/700 width, and manual pause
from welcome, card, playing, terminal, intermission, partially answered
comparison, frozen, and debrief. Resume must preserve meaningful surface state,
form drafts, terminal result, and zero catch-up; the artifact must record the
interruption interval without gameplay inputs.

### P1-10-G07 — Medium: browser coverage does not prove real gameplay or both required orders/sizes

The browser's real mapping is internally consistent: scenario lookup is
`activeStage - 1`, practice always uses control, round lookup follows the
injected order, and the engine receives the reducer's current run
(`src/viewer/human-lab.ts:143-155,226-233`). The reducer carries terminal
score/lives between won stages and creates fresh `{ lives: 4, score: 0 }`
contexts for each comparison round
(`src/experiments/human-lab-session.ts:222-280`). A read-only real-engine run of
canonical Stages 4–7 confirmed both A and D clear in order under the reactive
controller, with score/lives carried and each round starting 4/0.

But the browser suite advances every terminal synthetically. The test titled
“runs both hidden orders” actually completes only the D→A token
(`tests/visual/human-lab.visual.spec.ts:183-226`); the 700px test reaches the
comparison but does not freeze/download (`human-lab.visual.spec.ts:292-316`).
There is no browser assertion that practice score/lives do not carry, that
Round 1 never carries into Round 2, or that a real fatal engine result enforces
one attempt.

**Acceptance:** run complete A→D and D→A sessions at both 1280 and 700, assert
actual engine terminal provenance and stage scenario IDs, and inspect every
stage record plus fresh Round 1/2 contexts. Include normal round loss in each
position and the practice-loss policy selected for G01.

### P1-10-G08 — Later cleanup: welcome is an action, not auditable informed consent

`Start practice` immediately dispatches a reducer event named `consent`
(`src/viewer/human-lab.ts:200-245`), but there is no explicit affirmative
consent value, first-session/informed stratum, participant code, width stratum,
or token digest. The opaque token order map is even and deterministic, and the
candidate IDs remain absent from the ordinary body until debrief, aside from
the G03 parameter leak. Token reuse within a mounted session is not presently a
practical path because only one session can be started, but the artifact cannot
support the planned stratification or allocation audit.

This does not threaten engine correctness. It does block treating the output
as the fully specified study artifact.

## Confirmed sound behavior

- The materializer verifies the exact generation-2 authority, accepts only A or
  D at seed offset zero, returns normalized/frozen campaigns, and binds source,
  candidate, campaign, and scenario fingerprints
  (`src/experiments/p1-08-candidates.ts:147-240`).
- Scenario/run indexing in the browser is correct for Practice 1–3 and Round
  Stages 4–7. The materialized initial contexts are both exactly 4 lives and
  score 0.
- Normal comparison rounds have one attempt: a real or injected loss is
  committed once and transitions to intermission/comparison; terminal surfaces
  do not advance the engine.
- Input adapters, renderer presentation, event announcer, and fixed-step clock
  are reset at stage and round boundaries. Pauses clear held inputs and discard
  clock backlog before explicit resume.
- The lab graph remains out of the production build and contains no proof,
  competition, network, or persistent-storage dependency. The downloaded
  schema is explicitly unranked and forbids ranked protocol keys.

## Evidence run

- `npx vitest run tests/human-lab-session.test.ts tests/p1-08-candidates.test.ts tests/human-lab-boundary.test.ts tests/viewer-input-adapter.test.ts tests/fixed-step-clock.test.ts` — **5 files, 47 tests passed**.
- `npx playwright test --config=playwright.config.ts tests/visual/human-lab.visual.spec.ts` — **8 tests passed**.
- Direct materializer inspection — A/D both return initial `{lives:4, score:0}`;
  Stage 7 is A `27 / 144 / 0.12` versus D `29 / 138 / 0.125` for customer count,
  spawn interval, and march speed.
- Direct real-engine telemetry for canonical Stages 4–7 — both candidates won
  all four stages with carried score/lives. A tick counts were
  `3120, 3766, 3103, 3312`; D tick counts were
  `3120, 3121, 3103, 3321`; both retained four lives.
- Direct reducer counterexample — eleven terminal-win events with no tick
  events normalized and froze as eleven won stages with `ticks: 0`.

Passing gates do not supersede the findings: the browser tests intentionally
use the terminal-forging path and do not assert the missing evidence semantics.

## Recommended order and closure

1. Eliminate or unmistakably quarantine test-driver artifacts (G02).
2. Reconcile practice-loss behavior and artifact accounting (G01).
3. remove candidate-dependent card values and add cross-candidate DOM/ARIA
   equality tests (G03).
4. Add the minimum diagnostic artifact/pulse slice and correct exposure
   semantics (G04/G05).
5. Preserve comparison drafts and record interruptions (G06).
6. Run real-engine AD/DA flows at both supported sizes (G07), then conduct two
   disposable internal pilots before collecting decision data.

Close the P1-10 implementation tranche only after G01–G05 are fixed and the
real-engine/counterbalance acceptance matrix passes. Keep P1-08 tuning open
until the enriched, trustworthy human artifact supplies paired observations.

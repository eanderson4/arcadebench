# P1-10 Human Lab Repair Verification

**Date:** 2026-09-11
**Scope:** independent re-audit of the current P1-10 lab implementation, artifact
contract, unit/browser isolation gates, and repairs to P1-10-G01 through G08 in
`P1-10-LAB-GAMEPLAY-REVIEW.md`
**Change made by this audit:** this report only; the historical review is
preserved unchanged

## Verdict

The repaired lab is safely isolated as a development-only, local, unranked
pilot, and G01-G05's minimum evidence-integrity blockers are closed. Synthetic
sessions are now unmistakable, candidate presentation is blinded, stage pulses
and engine diagnostics are retained, exposure is derived from the highest
stage entered, and interruption/draft handling is materially stronger.

The full P1-10 study is **not yet closed**. G07 still lacks complete
actual-engine A→D and D→A sessions at both supported widths. G08 still lacks
participant/experience strata, auditable affirmative consent, a fixed width
stratum, and the specified countdown. Those gaps do not make the dev-only lab
unsafe, but they block treating its artifacts as the complete declared human
study or using them alone for a promotion decision.

## Finding disposition

| Finding | Status | Current evidence and residual |
| --- | --- | --- |
| **G01 practice loss accounting** | **Fully closed** | Practice terminal results now pass through the reducer once and lead to a fresh Round 1 rather than a retry whose ticks can be merged (`src/viewer/human-lab.ts:471-527`). The browser artifact test records an N-tick practice loss and fresh 4-life/zero-score round contexts (`tests/visual/human-lab.visual.spec.ts:506-554`). A natural-engine practice-loss case remains desirable as part of G07, but the prior erasure path is gone. |
| **G02 test-driver provenance** | **Fully closed** | Artifact schema 2/revision 3 distinguishes `human` from `test-driver`, uses distinct artifact kinds, and binds execution mode at creation (`src/experiments/human-lab-session.ts:11-18,68-130`). Human artifacts require `engine-observed` stages with real ticks (`human-lab-session.ts:404-429,577-579`). The driver is DEV/query gated, marks injected terminals `test-driver-synthetic`, and is absent on an ordinary assignment URL (`src/viewer/human-lab.ts:136-184,1061-1079`; visual spec `:295-300,375-493`). |
| **G03 candidate blinding** | **Fully closed** | Comparison cards use candidate-neutral copy; customer/order counts remain practice-only (`src/viewer/human-lab.ts:428-447`). Cross-order tests compare visible text, accessible content, head metadata, and DOM attributes across card, play, terminal, pulse, and survey surfaces (`tests/visual/human-lab.visual.spec.ts:191-260,654-670`). |
| **G04 decision evidence** | **Minimum blocker closed; residual** | Every comparison terminal now requires an ordered pulse. Artifacts contain pressure/pacing, conditional loss explanation, jar/recovery/score-belief answers, score delta, service/outcome/loss/interaction counters, aggregate active/paused timing, interruptions, environment, authority, candidate, campaign, and scenario fingerprints (`src/experiments/human-lab-session.ts:25-130,285-363,500-586`; `src/experiments/human-lab-observation.ts`; `src/experiments/human-lab-timing.ts`). Strict normalization, reconciliation, bounds, and mutation tests pass. Residual research depth: no per-stage/card/survey/intermission duration or bounded pre-loss input/event window is retained, and engine loss causes are not shown after the participant commits their explanation. These are follow-up instrumentation, not a truthfulness blocker for the present pilot. |
| **G05 candidate exposure** | **Fully closed** | Exposure is derived only from highest comparison stage entered: Stage 4 `none`, Stage 5/6 `partial`, Stage 7 `full`, independent of candidate and terminal result (`src/experiments/human-lab-session.ts:503-528,600-612`). Unit tests cover both assignment orders and candidates at every boundary (`tests/human-lab-session.test.ts:232-273`). |
| **G06 drafts/interruption/accessibility** | **Minimum blocker closed; residual** | Pulse and final drafts survive pause/reconstruction; resume is explicit and records bounded monotonic interruption kind/phase/surface/duration without catch-up (`src/viewer/human-lab.ts:220-221,906-951`; `src/experiments/human-lab-timing.ts`). Survey controls use native required/max-length behavior, the dialog description contains the full current question, focus returns to the first unanswered control, and focus is trapped on survey surfaces (`src/viewer/human-lab.ts:340-372,545-829,973-991`). Browser tests cover partial pulse/final drafts, whitespace rejection, blur, test-request, unsupported-width 699/700, focus order, and descriptions (`tests/visual/human-lab.visual.spec.ts:556-652`). Residual coverage: hidden-document and clock-backlog restoration are not exercised across every welcome/card/play/terminal/intermission/survey/frozen/debrief surface. The shared implementation appears correct; add the matrix before declaring exhaustive lifecycle coverage. |
| **G07 real-engine browser evidence** | **Still open** | A useful new browser case reaches a natural fixed-clock Stage 4 loss in both assignment orders and asserts 1,458 real ticks, engine-derived counters, scenario identity, and fresh round contexts (`tests/visual/human-lab.visual.spec.ts:302-373`). It still completes the other round synthetically, and therefore does not prove a full actual-engine A→D or D→A session. The 700px paths are layout/synthetic coverage rather than full real-engine sessions. Missing acceptance remains: complete both orders at 1280 and 700; inspect every Stage 4-7 record/context; include actual round loss in both round positions and an actual practice loss. |
| **G08 study controls** | **Still open** | Assignment-token SHA-256 and entry viewport/DPR/reduced-motion provenance are now present (`src/experiments/human-lab-session.ts:25-66,285-363`). However `Start practice` still directly dispatches a fieldless `consent` event (`src/viewer/human-lab.ts:386-425`; `human-lab-session.ts:152,620-623`). There is no participant code, first-session/informed experience stratum, explicit affirmative consent value/timestamp/version, declared/fixed width stratum, or countdown. Width consistency and participant strata are therefore facilitator procedure rather than artifact-enforced study controls. |

## Isolation and trust-boundary result

Production isolation is closed for the current tree:

- The normal Vite graph excludes the lab entry/runtime and the isolated lab
  graph excludes proof, playback, testing, competition, ranked-recorder,
  replay-scrubber, root, and telemetry barrels
  (`tests/human-lab-boundary.test.ts:68-127`).
- The package and assembled-site smoke scans reject lab filenames/text and both
  `/maltline/human-lab.html` and `/maltline/src/viewer/human-lab.html` return 404
  (`tools/built-site-smoke.mjs:11-17,38-49,92-105`).
- The browser test observes no network/storage escape and an ordinary human URL
  exposes no test-driver global.
- The artifact is explicitly unranked and cannot contain proof/challenge/ranked
  submission keys. Score and diagnostic fields come from local engine
  observation; they are research evidence, not leaderboard authority.

Small gate-maintenance residual: `human-lab-boundary.test.ts:12-27` explicitly
enumerates the session/materializer but not the newer
`human-lab-observation.ts` and `human-lab-timing.ts` helpers for its direct
source scan/presence assertion. They are currently pulled into the inspected
lab graph and absent from both production outputs, so this is not a current
escape, but adding them would prevent a future helper-local network/storage
regression from bypassing that source scan.

## Independent evidence run

Commands below were run by this audit against the settled shared tree:

- `npm exec --workspace @arcadebench/maltline -- vitest run tests/human-lab-session.test.ts tests/human-lab-timing.test.ts tests/human-lab-observation.test.ts tests/p1-08-candidates.test.ts tests/human-lab-boundary.test.ts` — **5 files, 35 tests passed** (313 ms).
- `npm exec --workspace @arcadebench/maltline -- playwright test tests/visual/human-lab.visual.spec.ts` — **14 tests passed** (10.4 s).
- `npm run --workspace @arcadebench/maltline build` — TypeScript and production Vite build passed; Vite emitted only the production entry graph.
- `npm run build:site` — complete site assembly passed.
- `npm run --workspace @arcadebench/maltline test:site` — built Maltline browser/resource/font/fixture smoke passed, including dev-lab route 404 checks.
- Explicit recursive filename/text scan of `games/maltline/dist` and
  `dist/site/maltline` for `human-lab`, `maltline-human-lab-session`,
  `d-combined`, and `EXP-049` — **no matches**.
- `git diff --check` — **passed**.

The parent integration run separately reports **592 unit tests, 98 Playwright
tests, workspace/site builds, explicit 404/sentinel scans, and diff-check all
green**. Those broader totals are corroborating gate evidence, not part of the
independent focused counts above.

## Remaining closure order

1. Add artifact-bound participant code and experience stratum, explicit
   affirmative consent evidence, and an assigned/enforced 700-or-1280 width
   stratum. Bump the artifact revision/schema if the wire shape changes.
2. Add the specified pre-play countdown and test pause/resume during it.
3. Run complete actual-engine A→D and D→A sessions at both widths, with
   record-by-record artifact assertions and real practice/round loss cases.
4. Extend timing/pre-loss evidence only if the next tuning decision needs that
   attribution, and fill the hidden/clock-backlog lifecycle matrix.
5. Extend the boundary test's explicit helper enumeration.

**Closure recommendation:** retain P1-10 as open for G07/G08. The current lab is
acceptable for supervised, disposable, unranked pilots, but artifacts should
not be represented as the complete stratified study dataset until those two
findings close.

## Post-audit maintenance addendum

The parent repair pass immediately closed the small boundary-test maintenance
residual above by adding `human-lab-observation.ts` and `human-lab-timing.ts` to
both the explicit source scan and required lab-runtime module list. The focused
boundary suite passes 4/4 and `git diff --check` remains clean. This does not
change the independent G01–G08 disposition or close G07/G08.

# P1-08 Human A-vs-D Lab UX

**Date:** 2026-09-10
**Experiment:** EXP-049 / P1-08
**Purpose:** a small, local, unmistakably unranked paired human comparison of
candidate A against candidate D
**Change made by this review:** this document only

## Decision

Use a **separate development-only browser entry**. Do not put the lab behind a
query parameter in the production viewer and do not include it in the
production bundle.

The smallest useful entry is
`src/viewer/human-lab.html` loading `human-lab.ts`, served directly by the
existing Vite development server. Maltline's production build has one explicit
Rollup input, `src/viewer/index.html` (`vite.config.ts:14-19`), so the lab can be
type-checked with the package while remaining absent from `dist`. A convenience
script may open the direct URL, but there should be no navigation to it from the
production game or assembled arcade.

Reuse the real engine, fixed-step clock, input adapter, renderer, font loader,
semantic status/event announcer, shell, and presentation-copy helpers. Do not
import `main.ts`: it immediately creates the registered generation-2 campaign,
competition client/controller, proof lifecycle, and global RAF loop
(`main.ts:1-66`). A dedicated lab session controller should own only the
smaller flow described here. Shared components in a dev-only entry are good;
embedding candidate selection into the ranked entry is not acceptable.

This lab is decision evidence for the Stage 4–7 curve. It is not a release of a
new campaign, a ranked mode, or the final P1-02 full-run-duration study.

## Why the boundary must be separate

The production viewer binds the frozen registered authority at module load,
starts competition services, records every playing tick, and completes ranked
stages (`main.ts:36-66,153-170,261-289,480-499`). A `?candidate=d` branch in
that module would put experimental scenarios beside challenge acquisition and
proof recording. Hiding the Shift Board visually would not remove that coupling.

EXP-049 already supplies the correct experimental policy:

- the lab is `unranked`, has no authority registration or season, and forbids
  ranked-proof emission (`p1-08-tuning-experiment.ts:42-55`);
- A is the unchanged registered-campaign control, while D applies only the
  declared Stage 5 and Stage 7 transforms (`p1-08-tuning-experiment.ts:123-158`);
- candidate application copies every scenario and `stations` array, normalizes
  it, rejects stale values and stage-order changes, and freezes the result
  (`p1-08-tuning-experiment.ts:517-553`); and
- the runner re-verifies the exact generation-2 authority pin before deriving
  candidates (`p1-08-tuning-experiment.ts:733-760`).

Do not duplicate those transforms in viewer code. Extract the candidate
constants and `applyCandidate` logic into a small experiment-only module with no
proof, competition, controller, or browser side effects; have the telemetry
runner and lab both import it. Expose a narrow materializer which accepts only
candidate ID A or D and canonical seed offset zero, then returns a deeply frozen
campaign, initial run, source-authority identity, candidate/effective-campaign
fingerprints, and `P108_UNRANKED_BOUNDARY`. It must not run the synthetic
controller matrix.

The browser entry may use the rich local input/event replay shape for review;
that format embeds a cloned scenario and run (`core/replay.ts:6-26`) and is
already distinct from the ranked input-only proof. It must be wrapped in a lab
artifact with an explicit unranked type and must never be passed to the proof
recorder or verifier as a score claim.

## Smallest implementation shape

Recommended new files for the implementation tranche:

| File | Responsibility |
| --- | --- |
| `src/experiments/p1-08-candidates.ts` | Single source of A/D transforms plus a pure, frozen, unranked materializer shared by telemetry and lab |
| `src/viewer/human-lab.html` | Dev-only metadata and one module script; no duplicated shell HTML |
| `src/viewer/human-lab.ts` | Bootstrap fonts, assignment, lab session, and readiness; contains no competition/proof imports |
| `src/viewer/human-lab-session.ts` | Explicit warm-up/round/survey/intermission/debrief state machine and local artifact recorder |
| `src/viewer/human-lab.css` | Small banner, progress, survey, and 700px rules layered on shared `style.css` |
| `tests/visual/human-lab.visual.spec.ts` | Live flow, isolation, accessibility, geometry, and exact lab images |

If implementation size stays modest, `human-lab-session.ts` may remain inside
`human-lab.ts`; do not extract a general production `FlowController` merely to
land this experiment. The important boundary is a separately testable session
object with injected campaign assignment, presentation clock, wall-time
observer, and artifact sink. It should not depend on globals or local storage.

Reuse `mountMaltlineShell()` rather than copying the playfield. It already owns
the 960×540 canvas, keyboard footer, below-700 unsupported surface, accessible
surface switching, and focus restoration (`shell.ts:44-83,107-135`). Keep its
competition trigger hidden. Add lab chrome as a sibling inside the shell:

1. a persistent lab banner before the stage wrapper;
2. a compact round/progress label; and
3. an accessible survey/intermission panel that replaces or covers the play
   surface while the engine, clock, and input adapter are frozen.

Do not reuse the static `visual-fixtures.ts` states as playable campaigns. They
declare synthetic render-envelope provenance and are visual stress evidence,
not reachable game sessions. The lab must step real engines built from the
canonical A/D campaign snapshots.

## A/D definition and blinding

Only compare:

- **A:** `a-registered-control`, copied from the exact registered
  generation-2 campaign; and
- **D:** `d-combined`, changing Stage 5 spawn interval 204→180 and acceleration
  2→3, plus Stage 7 customer count 27→29, spawn interval 144→138, and march
  speed 0.120→0.125 (`p1-08-tuning-experiment.ts:123-158`).

Use a paired, within-participant design. Each participant plays both, and the
visible UI calls them only **Round 1** and **Round 2**. Candidate letters,
descriptions, parameter values, campaign fingerprints, and whether the current
round is the control must not appear in visible text, accessible names, page
title, URL parameters, or ordinary DOM data attributes before debrief.

### Assignment

Prepare an even deck of opaque local assignment tokens before sessions. Half
map to A→D and half to D→A. Keep separate decks for:

- first-session versus previously informed players; and
- 1280px versus 700px test width, if both widths contribute decision data.

The facilitator gives the entry one opaque token such as
`exp049-lab-k7m4q2`; the token-to-order map is local experiment configuration,
contains no participant identity, and is not shown in the UI. Do not use
`?order=AD`, candidate IDs, alternation derived from a visible participant
number, or runtime `Math.random()`. Reject missing, reused, or unknown tokens
before mounting gameplay. “Reused” means duplicate use within the current
in-memory session; cross-session reuse belongs to the facilitator's offline
allocation log because this entry deliberately has no persistent storage.
Record only a pseudonymous participant code and the assignment token's digest
in the artifact.

This is participant-blind, not a claim of double blinding: an operator who can
inspect source or the assignment deck can learn the mapping. Double blinding
would require separate allocation custody and is outside the bounded lab.

Freeze per-stage feedback before revealing the next stage and freeze final
preference/reason responses before revealing A/D. Ideally the artifact download
occurs before the debrief screen names the assignments.

## Session flow and what the player sees

### Persistent identity

At every supported-width screen, including active play, show a high-contrast
banner outside the canvas:

> LOCAL PLAYTEST · UNRANKED · NOTHING IS SUBMITTED

The document title begins `Maltline Local Playtest`. The banner is visible text,
not color or an icon alone, and is referenced by the main landmark's accessible
description. The Shift Board button stays hidden and absent from the tab order.
The normal score HUD remains useful moment-to-moment feedback, but terminal
copy calls it **local round score**, never a record, rank, verification, or
leaderboard score.

### Flow

1. **Welcome and consent.** Explain the paired local test, approximate duration,
   keyboard requirements, data recorded, no network submission, and the right
   to stop. Confirm first-session/informed stratum and test width. Do not explain
   candidate differences.
2. **Common warm-up.** Show the shipped control lesson, then run the unchanged
   generation-2 Stages 1–3 once. Label it `Practice`; do not score or carry its
   lives/score into either comparison round. This gives a first-time player the
   actual flavor, lane, blend, slide, and automatic-return vocabulary.
3. **Round 1.** Start at Stage 4 with the same frozen local context for both
   candidates: four lives and score zero. Play Stages 4–7 only. Preserve the
   existing stage card, countdown, manual stage-clear advance, game-over, input
   buffering, automatic jar catch, and interruption semantics. Replace `STAGE
   4/8` presentation with honest lab progress such as `ROUND 1 · STAGE 1/4 ·
   LUNCH RUSH`; do not imply that Stages 1–3 were completed in this round.
4. **Stage pulse.** After each Stage 4–7 clear, freeze simulation before the
   normal advance and collect three quick responses: perceived pressure
   (1–7), pacing (`too idle` / `balanced` / `too relentless`), and a short
   optional “hardest decision or confusing moment.” Add “What happened?” after
   a terminal loss before showing the engine-classified loss reasons.
5. **Intermission.** Show `Round 1 saved locally`, offer a short untimed rest,
   and require an explicit `Begin Round 2`. Reset engine, renderer presentation,
   input adapter, fixed-step anchor, announcements, local replays, and all held
   keys. Do not display the first round's score or metrics, which could anchor
   the second rating.
6. **Round 2.** Repeat the same Stage 4–7 slice and questions with the other
   candidate.
7. **Final comparison.** Before reveal, ask which round had the clearer ramp,
   which felt fairer, which was more enjoyable, whether jar scarcity felt like
   planning or waiting, and whether recovery after a mistake felt possible.
   Ask what the player believes generated score. Freeze answers, offer a local
   JSON download, then optionally reveal the A/D mapping and exact changes.

Use one attempt per comparison round. A loss ends that round; it should not
silently restart and add unequal exposure. A participant who never reaches a
changed stage remains valid usability evidence but is marked `candidateExposure:
partial` and excluded from paired Stage 5/7 preference claims.

### Timing budget

Expected active simulation is approximately:

- common practice: 1.5–2 minutes;
- each Stage 4–7 round: about 3.5–4.5 minutes; and
- cards, stage pulses, intermission, and final comparison: 5–8 minutes.

Target a 15–20 minute appointment and stop at 25 minutes. Record active ticks
separately from wall time; never infer simulation duration from RAF time. The
lab evaluates the mid-campaign curve, so its shortened round duration must not
be used to close the full-game 5–15 minute objective.

## Observation and artifact contract

Use `performance.now()` only for local relative durations and inject it into
the session recorder for deterministic tests. The engine remains tick-based.
For every practice/round/stage record:

- card, countdown, active-play, survey, interruption, and intermission wall
  durations;
- active ticks, terminal state, local score delta, lives entering/leaving,
  customers fulfilled/resolved/walked out, and each life-loss reason;
- input transition counts, lane/station changes, blend starts/cancels,
  launches, catches, and a bounded two-second input/event window before loss;
- the EXP-049 experiment/revision, exact source-authority SHA-256, candidate and
  effective-campaign fingerprints, canonical seed offset zero, fixed local run
  context, assignment-token digest, round position, viewport, DPR, and reduced-
  motion state;
- focus/visibility/unsupported-width interruptions and paused wall duration;
  and
- stage-pulse/final responses in their original order.

An observer may use a separate paper/local worksheet to note visual scanning,
hesitation before lane/station changes, missed jar/order identification, signs
of forced waiting, and whether the player can name a loss before reveal. Do not
add webcam, microphone, analytics, user-agent fingerprinting, names, email, or
remote collection to this tranche.

The downloadable artifact should be a new exact schema such as:

```text
kind: maltline-human-lab-session
schemaVersion: 1
experimentId: EXP-049
rankEligibility: unranked
authorityRegistration: null
seasonId: null
submission: forbidden
```

It may contain bounded rich local inputs/events, but must reject or omit keys
named `proof`, `envelope`, `challenge`, `nonce`, `scoreId`, or `submissionId`.
Keep it in memory until the player explicitly downloads it. Do not use
`localStorage`, `sessionStorage`, IndexedDB, cookies, `sendBeacon`, or `fetch`.
Reloading intentionally discards the unfinished session.

## Interruption, focus, and accessibility

Advance the adapter only on simulation ticks, exactly as the shipped viewer
does (`main.ts:480-499`). During welcome, cards, countdown, surveys,
intermission, terminal copy, and debrief:

- record no engine tick and no gameplay input;
- clear held keys on both entry and exit;
- cancel/reset the fixed-step anchor so there is no catch-up;
- ignore `KeyboardEvent.repeat` for advance/restart; and
- never let a serve key held at terminal cross into the survey or next stage.

Blur, hidden document, and width below 700 pause rather than invalidate a
ranked run—there is no ranked run—but must be recorded, clear input, cancel the
clock anchor, and require explicit resume. The existing viewer already defines
the no-catch-up mechanics and first-interruption handling
(`main.ts:293-345,423-461`). Reuse those policies without the rank-eligibility
or competition side effects.

Each survey is a named `dialog` with its complete question/instruction text in
`aria-describedby`. Focus begins on the heading or first unanswered control,
Tab remains inside, Escape does not discard answers, and submission returns
focus to the next explicit round/stage action. Use native radio groups and a
real text area; do not turn canvas regions into form controls. Announce only
discrete changes (`Round 1 ready`, `Stage 5 feedback`, `Round 2 complete`), not
timers or every tick. While a survey owns focus, the canvas, footer, and lab
advance shortcuts are inert and hidden from assistive technology.

The canvas keeps `semanticPlayStatus` and event-throttled announcements during
play. Add the persistent unranked identity and honest four-stage round position
to that semantic equivalent. Honor reduced motion in both renderer and new lab
CSS; timers and gameplay values remain unchanged.

## 1280px and 700px usability

### 1280×720

Keep the existing 980px shell and 960×540 canvas. The lab banner and round
progress should fit in one compact row above the current topline or replace its
tagline; they must not reduce the canvas or obscure the HUD. Surveys may use the
stage overlay but should remain narrower than the canvas and leave the
persistent unranked banner visible.

### 700×720

At the supported boundary the current canvas is 672×378 and the footer ends
near 450px, leaving adequate vertical room for one compact lab banner. Do not
shrink the canvas further. Hide the decorative prototype/tagline text before
wrapping the unranked banner, keep at least 44×44 CSS-pixel survey targets, and
allow the survey card—not the document—to scroll vertically if needed. The
pressure golden already demonstrates that order, jar, player, and machine cues
remain present at this scale; the lab must ensure its added chrome does not move
the footer below the viewport.

Below 700, use the shared unsupported-device surface. It must say the local
playtest is paused, preserve the unfinished in-memory session, and expose no
hidden gameplay or survey controls. Width restoration resets inputs/clock and
returns focus to an explicit Resume action.

Do not combine 1280 and 700 results as though viewport were irrelevant. Either
hold width constant for the first decision sample or counterbalance width in
its own strata. A player must never switch assigned width between Round 1 and
Round 2.

## Automated acceptance

### Isolation and identity — blockers

1. Production build output and module graph contain no `human-lab`, `EXP-049`,
   A/D candidate ID, assignment table, survey copy, or lab CSS. The assembled
   `/maltline/` route loads no lab resource; the lab HTML is absent from `dist`.
2. Static/import tests reject any lab dependency on `main.ts`,
   `ranked-proof-recorder.ts`, `competition-client.ts`,
   `competition-controller.ts`, or `core/proof.ts`. They also reject imports of
   lab modules from the production entry graph.
3. Browser tests intercept `/api/**`, XHR, WebSocket, `sendBeacon`, and storage
   writes. Completing A and D makes no request beyond the entry's static
   modules/fonts/assets, makes zero `/api/**` calls, and creates no cookies or
   persistent browser storage; Shift Board remains hidden and untabbable.
4. Candidate materialization proves A's canonical campaign fingerprint equals
   the registered generation-2 baseline, D differs, and an exact field diff is
   limited to the five declared values. Authority configuration and digest are
   byte-identical before/after both rounds; neither candidate is registered.
5. The downloadable artifact has the exact unranked lab schema and rejects all
   ranked-protocol keys. There is no callable path returning
   `MaltlineRunProof`, proof envelope, challenge request, or submission request.

### Assignment and flow — blockers

6. The token deck is even within every declared stratum; every token resolves
   deterministically to exactly A→D or D→A; missing/unknown/reused tokens fail
   before gameplay. Page title, visible text, ARIA snapshot, and ordinary DOM
   metadata do not disclose the mapping before frozen debrief.
7. The same scripted inputs run against A in either round position produce the
   same engine result, and likewise for D. Starting a round always resets to
   Stage 4, four lives, score zero, canonical seed offset zero, no held input,
   no renderer FX, no prior announcement, and an empty local replay buffer.
8. Warm-up never carries score/lives/input into Round 1. Round 1 never carries
   into Round 2. A loss ends one round; no implicit restart changes exposure.
9. Welcome, cards, countdown, stage pulse, intermission, terminal explanation,
   unsupported width, and debrief produce zero engine ticks and zero recorded
   gameplay inputs. Held Enter/F/Space and native repeat cannot cross any
   boundary.
10. Blur, hidden document, and 699px pause immediately, clear keys, log one
    interruption interval, and resume explicitly at 700px without catch-up.

### Accessibility and visual evidence

11. Keyboard-only traversal can consent, complete practice, play, answer every
    stage pulse, rest, start Round 2, finish comparison, and download/decline the
    artifact. Focus is visible and owned by the current surface; inactive
    canvas/footer/survey regions are inert and correctly hidden.
12. ARIA snapshots name the persistent local/unranked status, round/stage,
    survey groups, required state, loss-before-reveal question, intermission,
    and final comparison. One discrete live announcement occurs per transition;
    RAF and range-like input cannot spam it.
13. At 1280×720 and 700×720, assert no horizontal document overflow; canvas,
    footer, banner, round label, survey controls, and primary action remain
    inside the viewport; survey targets are at least 44×44; long/free-text input
    cannot expand the layout. At 699px only the pause surface is exposed.
14. Reduced-motion tests freeze banner/survey transitions and renderer ambient
    motion while preserving every action, timer, and recorded engine result.
15. Fail on console/page/resource/font errors. A font failure falls back to the
    diagnosed playable welcome screen rather than losing the unranked warning.

## Bounded visual matrix

Use four exact images, backed by geometry and accessibility assertions:

| Golden | Viewport | State protected |
| --- | --- | --- |
| `human-lab-welcome-1280.png` | 1280×720 | Persistent unranked identity, neutral Round 1/2 explanation, consent/start hierarchy |
| `human-lab-stage-pulse-1280.png` | 1280×720 | Frozen play surface, three feedback prompts, no A/D disclosure, explicit continue |
| `human-lab-active-700.png` | 700×720 | Full live canvas/footer plus compact unranked and round/stage chrome |
| `human-lab-final-700.png` | 700×720 | Final comparison, local artifact action, containment and target sizing |

Do not add exact images for every stage or candidate: the existing P1-08
pressure matrix already protects Stage 4–7 game pixels at desktop and Stage 7
at 700. Add deterministic lab fixture states by injecting exact presentation
time, renderer seed, session clock, assignment token, and engine snapshot.
Exact A and D live screenshots must use the same visible neutral round label so
tests cannot normalize away an accidental candidate disclosure.

In addition to the four goldens, run both assignment orders through complete
non-pixel browser flows at 1280 and 700, plus the 699/700, reduced-motion,
font-fallback, loss-before-reveal, refresh-discard, and artifact-schema cases.

## Recommended implementation order

1. Expose/test the narrow EXP-049 candidate materializer and exact A/D diff.
2. Add the dev-only HTML/entry plus production-bundle/import-graph denial tests.
3. Implement the deterministic session state machine and in-memory artifact.
4. Add shell-derived lab chrome, survey focus/semantics, and 699/700 policy.
5. Run complete AD/DA browser flows, then create and inspect the four exact
   lab images.
6. Pilot with two internal participants—one AD, one DA—to test instructions and
   session duration. Do not use pilot preferences as tuning evidence; revise the
   lab schema/UI once at most, bumping its revision before the decision sample.

## Closure recommendation

Proceed with the separate dev-only lab after the materializer and isolation
tests exist. Do not accept a production query mode, a shared import with the
ranked controller, candidate labels visible before debrief, unbalanced order,
or an artifact that resembles a ranked proof. Close the lab implementation
tranche when both AD and DA flows pass at 1280 and 700, all four images are
reviewed, and the production build contains no lab bytes. Keep P1-08 open until
paired human observations—not synthetic telemetry alone—select or reject D.

## Evidence checked for this plan

- `npx vitest run tests/p1-08-tuning-experiment.test.ts tests/viewer-input-adapter.test.ts tests/viewer-session.test.ts` from `games/maltline` — **3 files, 37 tests passed**.
- Current production viewer, shared shell, fixture entry, Vite production input,
  rich local replay, EXP-049 candidate runner, tuning investigation, tuning
  verification plan, and P1-08 pressure matrix were read in the current tree.

No product code, test, manifest, golden, task log, or experiment log was
changed.

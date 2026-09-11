# P1-10 study-controls verification

Date: 2026-09-11

## Verdict

The schema-3 / EXP-049 revision-4 lab is technically coherent and the former
P1-10-G07 real-gameplay gap is closed. The four-case browser matrix plays every
practice and comparison stage through the real engine, shipped input adapter,
fixed-step viewer path, observation helper, reducer, artifact freeze, download,
and public artifact normalizer. Assignment, exact-width, countdown, blinding,
synthetic-evidence labeling, privacy, and production-isolation checks pass.

Two participant-control residuals block treating a new session as fully informed
decision-bearing human evidence. They do **not** block the Maltline production
build or ordinary gameplay:

1. the affirmative consent statement omits the promised appointment duration
   and keyboard requirement; and
2. the lab promises that a participant may stop at any time, but exposes its
   only Stop action before consent.

Close both before facilitating the next P1-10 human session. No engine,
campaign, tuning, proof, or schema defect was found in this review.

## Residual findings

### P1-10-SCV01 — High, human-study blocker: consent does not disclose duration or keyboard burden

The UX contract requires the welcome/consent surface to explain the paired local
test, approximate duration, keyboard requirements, recorded data, lack of
network submission, and right to stop
(`P1-08-HUMAN-LAB-UX.md:162-167`). The participant-facing disclosure records
data/locality/voluntariness, but not the approximately 15–20 minute duration or
keyboard-only requirement (`src/viewer/human-lab.ts:69-74,441-531`). Those two
facts exist only in the test-driver welcome (`human-lab.ts:534-551`), which an
ordinary human URL never sees.

This matters because the frozen human artifact says the participant affirmed
`maltline-p108-local-consent-v1` (`src/experiments/human-lab-study.ts:1-2,134-155`).
The artifact therefore proves affirmative interaction with a versioned statement,
but that statement is materially narrower than the specified disclosure.

**Bounded repair:** add paired-round purpose, `Keyboard only`, and the expected
15–20 minute appointment (including the 25-minute facilitator stop rule if that
is participant-facing policy) to the human disclosure. Because an artifact binds
the statement by ID, version the statement ID rather than silently changing the
meaning of `...-v1`. Extend the human accessibility test to assert those facts in
the dialog's accessible description.

**Acceptance:** before the checkbox can be affirmed, visible and accessible text
states paired rounds, keyboard requirement, approximate duration, local fields
recorded, no network/storage submission, and voluntary withdrawal. The frozen
human artifact contains the new statement ID; old-ID and mismatched evidence are
rejected.

### P1-10-SCV02 — High, human-study blocker: “stop at any time” is actionable only before consent

The disclosure says, “You may stop at any time without saving”
(`src/viewer/human-lab.ts:73`), but `Stop without saving` is mounted only in the
consent form (`human-lab.ts:508-514`). `stopWithoutSaving()` is consequently
reachable only before the study starts and its terminal copy specifically says
the session stopped before consent (`human-lab.ts:588-603`). There is no Stop,
withdraw, or end-session control on stage cards, countdown, active play, stage
pulses, intermission, comparison, or pause surfaces. Closing the tab will discard
memory, but the UI neither presents that as the withdrawal mechanism nor gives a
keyboard-accessible explicit action after consent.

This is a consent/control mismatch rather than a data leak: current code keeps
the unfinished session in memory and the isolation tests show no network,
persistent storage, cookie, or implicit artifact write. Still, a participant
should not have to infer that closing the browser is the only way to exercise a
promised right.

**Bounded repair:** provide a persistent, keyboard-reachable `Stop playtest
without saving` action on every post-consent non-frozen surface. Require a simple
confirmation during active play, then cancel countdown/RAF participation, clear
input and clock anchors, revoke any object URL, discard the in-memory session,
and show a final `Nothing was saved or submitted` surface. Do not generate a
partial artifact unless the study protocol explicitly changes to request one.

**Acceptance:** invoke Stop with keyboard alone from practice card, countdown,
playing, pulse, intermission, and comparison. Each path records no further tick
or input, prevents resume/download/debrief, clears held input and scheduled
countdown work, performs no service/storage/cookie operation, and announces that
nothing was saved. Canceling an active-play confirmation resumes with no clock
catch-up.

## Finding dispositions

### P1-10-G07 — Closed

The dedicated matrix contains A→D and D→A at both 1280 and 700 CSS pixels
(`tests/visual/human-lab-real-engine.visual.spec.ts:60-65,571-599`). It constructs
deterministic stage tapes with the real `MaltlineEngine`, reactive controller,
and `MaltlineViewerInputAdapter` (`human-lab-real-engine.visual.spec.ts:97-147`),
then dispatches physical key levels through the mounted lab and advances its
fixed-step RAF path. It does not call `finishStage()` to reach terminals.

The downloaded artifact is normalized through the public strict boundary
(`human-lab-real-engine.visual.spec.ts:461-470`). Assertions cover all eleven
stage records, exact scenario-derived terminals, positive tick/input counts,
engine-observed acquisition, score/life carry within rounds, fresh `{lives: 4,
score: 0}` contexts for both comparison rounds, full exposure, source token
digest without raw token, and zero prohibited browser operations
(`human-lab-real-engine.visual.spec.ts:486-568`). Candidate A's real Stage 7 loss
occurs in both round positions across the matrix; candidate D clears. The normal
viewer flow separately verifies that a lost practice record is retained and
Round 1 starts fresh (`tests/visual/human-lab.visual.spec.ts:639-687`).

Using the test hook to complete presentation countdowns in the long real-engine
matrix is acceptable: the hook does not forge a terminal, the artifact is
unmistakably test-driver/synthetic, and production countdown cadence and
cancellation have independent browser coverage.

### P1-10-G08 — Core evidence closed; participant disclosure/control residuals remain

The original unauditable “Start practice” action has been replaced for human
URLs by a strict participant code, required affirmative checkbox, mode-bound
consent evidence, assigned experience/width display, and a complete local-data
section (`src/viewer/human-lab.ts:441-531`). Human URLs do not expose the test
driver (`tests/visual/human-lab.visual.spec.ts:420-425`). Schema 3/revision 4
strictly binds artifact kind to execution mode, participant to assignment,
consent to execution mode, assigned width to entry provenance, and the complete
authority/candidate/scenario provenance (`src/experiments/human-lab-session.ts:
554-613`). Test-driver artifacts have a different kind, consent bypass,
filename, on-screen warning, and announcement (`src/viewer/human-lab.ts:
1065-1094`).

That closes provenance, stratification, synthetic-evidence, and artifact
truthfulness aspects of G08. SCV01 and SCV02 above leave the participant-control
portion open.

## Integration evidence

### Assignment and width

- The checked-in deck has exactly eight opaque token cells: A→D and D→A for
  each combination of first-time/informed and 1280/700
  (`src/viewer/human-lab.ts:43-66`). The browser opens every cell at its assigned
  width and checks its rendered strata/mapping record
  (`tests/visual/human-lab.visual.spec.ts:305-329`).
- Missing/unknown tokens fail before Canvas mount, and a valid token at the wrong
  initial width also fails before shell/gameplay mount
  (`human-lab.visual.spec.ts:296-338`; runtime gate at
  `src/viewer/human-lab.ts:168-181`).
- During the session, exact equality—not only the 700-pixel minimum—is required
  (`src/viewer/human-lab.ts:315-317,1249-1257,1266-1285`). Both 699 and a
  supported-but-wrong 1000 width freeze ticks, clear timing/input state, require
  exact restoration plus explicit focused resume, and do not catch up
  (`human-lab.visual.spec.ts:806-854`).

### Countdown and input lifecycle

- The lab reuses production 650 ms countdown steps and 350 ms `SERVE` dwell
  (`src/viewer/gameplay-flow.ts:16-17`; `src/viewer/human-lab.ts:633-675`). A
  monotonic generation invalidates stale callbacks; entry/exit clear held input
  and the fixed-step anchor.
- Countdown accepts no gameplay/presentation shortcut, performs zero engine
  ticks, hides/inerts game controls, and announces only `3` and `SERVE`
  (`tests/visual/human-lab.visual.spec.ts:856-897`). Width interruption cancels
  the countdown, resumes to the stage card, and requires a fresh countdown from
  three (`human-lab.visual.spec.ts:899-928`). Reduced motion removes animation
  without changing timing (`human-lab.visual.spec.ts:930-940`).
- Runtime frames step only while playing, focused, visible, and exactly at the
  assigned width; every tick goes through the shipped input adapter, strict
  reducer tick boundary, engine step, and observation helper
  (`src/viewer/human-lab.ts:1266-1297`).

### Privacy, artifact, and isolation

- The raw assignment token is converted to SHA-256 before state creation; the
  artifact holds the digest, exact entry environment, source authority, ordered
  candidate/effective-campaign/scenario fingerprints, participant strata, and
  mode-bound consent (`src/viewer/human-lab.ts:163-165,219-243`).
- Artifacts are created only after comparison freeze, are held in a local Blob,
  and remain explicitly unranked/submission-forbidden. The strict normalizer
  rejects extra/accessor/ranked-protocol shapes and reconciles stage score,
  lives, resolution counters, loss reasons, scenario order, pulses, assignment,
  and provenance (`src/experiments/human-lab-session.ts:413-613,735-755`).
- The production Vite graph contains no lab module/sentinel, while the isolated
  lab graph contains no proof, playback, competition, ranked recorder, testing
  barrel, dynamic load, API, network, or persistent-storage path
  (`tests/human-lab-boundary.test.ts:74-133`). Browser interception likewise
  reports no API/XHR/beacon/storage/cookie operation in full flows.

## Checks run

- `npx vitest run games/maltline/tests/human-lab-study.test.ts games/maltline/tests/human-lab-session.test.ts games/maltline/tests/human-lab-boundary.test.ts games/maltline/tests/human-lab-observation.test.ts games/maltline/tests/human-lab-timing.test.ts games/maltline/tests/fixed-step-clock.test.ts games/maltline/tests/viewer-input-adapter.test.ts`
  — **7 files, 91 tests passed**.
- `npx playwright test --config=games/maltline/playwright.config.ts games/maltline/tests/visual/human-lab.visual.spec.ts games/maltline/tests/visual/human-lab-real-engine.visual.spec.ts`
  — **28 tests passed** in 32.3 seconds, including all four real-engine cases.
- `npm run build --workspace @arcadebench/maltline`
  — **passed** (`tsc` plus Vite production build); emitted production assets
  contain no human-lab entry or sentinel.

## Closure recommendation

Close P1-10-G07. Mark P1-10-G08's immutable identity, consent-evidence, privacy,
and synthetic-artifact requirements closed, but do not begin decision-bearing
human collection until SCV01 and SCV02 pass. Once those two bounded UI/control
repairs and focused browser checks are green, this integration is ready for the
planned facilitated human session. P1-08 tuning itself remains dependent on the
resulting human evidence; automated controller outcomes are not a substitute.

## Post-repair verification — 2026-09-11 (superseding disposition)

This section preserves the findings above as the state originally reviewed and
supersedes their open status after the bounded viewer repair.

### SCV01 — Closed

The human disclosure is now explicitly versioned as consent statement v2 and
states that the session is keyboard-only and expected to take approximately
15–20 minutes, alongside the already present data, locality, storage, ranking,
and voluntary-stop terms (`src/viewer/human-lab.ts:69-75`). The immutable study
boundary binds human affirmative evidence to the new
`maltline-p108-local-consent-v2` identifier
(`src/experiments/human-lab-study.ts:1-2,134-155`), so the old v1 statement was
not silently redefined. The artifact experiment revision was correspondingly
bumped from 4 to 5; the strict normalizer and tests reject revision 4
(`src/experiments/human-lab-session.ts:554-562,609-613`;
`tests/human-lab-session.test.ts:460-465`). The human browser test asserts the full sequence in the
dialog's accessible description and still proves that invalid code, absent
affirmation, Enter, and the test-driver URL flag cannot bypass consent
(`tests/visual/human-lab.visual.spec.ts:340-374`).

### SCV02 — Closed

A persistent, native button named `Stop playtest without saving` now joins the
local/unranked banner after consent (`src/viewer/human-lab.ts:202-218`). Its
visibility follows every unfinished practice, round, pulse, intermission, and
comparison phase (`human-lab.ts:303-323`), including stage card, countdown,
playing, terminal, survey, and paused presentations within those phases. Survey
focus trapping includes the external Stop action and cycles back to the first
form control (`human-lab.ts:1227-1257`).

Stopping cancels the countdown generation/timer, clears the viewer input and
fixed-step anchor, closes timing, discards pending terminal and pulse drafts,
resets announcements, keeps the candidate mapping hidden, and replaces the UI
with an irreversible nothing-saved surface (`human-lab.ts:606-625`). Stopped
guards prevent subsequent keyboard, focus, visibility, resize, RAF, resume, or
test-driver activity from restarting the session (`human-lab.ts:1203-1320`). No
artifact/download action is created.

Focused browser coverage now proves active-play tick immutability after Stop,
later key/frame/focus/resize inertness, Stop availability across the complete
flow, safe Stop from a paused width interruption and stage pulse, no mapping
reveal or download, and zero prohibited network/storage activity
(`tests/visual/human-lab.visual.spec.ts:397-497`). The action is deliberately
literal and immediate—its accessible name includes “without saving”—which is a
reasonable low-friction implementation of voluntary withdrawal; the UX contract
does not require a confirmation dialog.

### Post-repair gates

- `npx vitest run games/maltline/tests/human-lab-study.test.ts games/maltline/tests/human-lab-session.test.ts games/maltline/tests/human-lab-boundary.test.ts`
  — **3 files, 46 tests passed**.
- `npx playwright test --config=games/maltline/playwright.config.ts games/maltline/tests/visual/human-lab.visual.spec.ts games/maltline/tests/visual/human-lab-real-engine.visual.spec.ts`
  — **31 tests passed** in 34.0 seconds, including the four all-stage real-engine
  cases and three new persistent-stop cases.
- `npm run build --workspace @arcadebench/maltline`
  — **passed** (`tsc` and Vite production build); the production graph still
  emitted only the normal Maltline entry/assets.

### Final closure recommendation

SCV01 and SCV02 are closed. P1-10-G07 and P1-10-G08 are closed against the
reviewed acceptance criteria, and no residual gameplay, study-control,
artifact-truthfulness, countdown, exact-width, privacy, accessibility, or
isolation blocker remains in this slice. The schema-3 / EXP-049 revision-4 lab
has been superseded by schema 3 / EXP-049 revision 5, which is ready for the
planned facilitated human session. Interpret the resulting
evidence within its declared experience and viewport strata; it still does not,
by itself, close the full-game 5–15 minute objective.

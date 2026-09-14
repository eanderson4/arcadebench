# Maltline Shift Board proof visual/accessibility review 07

**Date:** 2026-09-10
**Scope:** the new Shift Board Proof column, retained-proof loading/error/verified
states, local replay controller path, responsive behavior at 1280, 700, and
390px, and the three updated/new exact baselines. This was a read-only product
audit; only this report was created.

## Verdict

The proof feature is sound on desktop and at the 700px gameplay boundary. A
selected retained envelope is replayed through the real verifier before the
card appears; replacement requests cannot overwrite a newer inspection; modal
focus remains owned; loading is marked busy without swallowing the separate
live status; and the inspected card has clear non-color verification copy. No
1280/700 visual, modal, keyboard, reduced-motion, or screen-reader blocker was
reproduced.

One P1 responsive issue remains in the deliberately supported 390px browse-only
experience: the entire Proof column is initially beyond the horizontally
clipped table viewport, with no visible cue that more columns exist. There is
also a conditional P1 truth-boundary gap: local replay proves that an envelope
is valid and matches the row's score, but does not fully bind that envelope to
the selected leaderboard record. Two P2 test/announcement gaps should follow
after those bounded fixes.

| ID | Severity | Classification | Finding |
| --- | --- | --- | --- |
| TDV7-01 | P1 responsive/accessibility | **Blocker before calling proof inspection discoverable at 390px** | The Proof header and every Inspect action are wholly outside the initial table viewport, without an overflow affordance. |
| TDV7-02 | P1 content truth | **Conditional blocker before claiming the locally replayed proof is cryptographically bound to the selected row** | The client verifies the envelope but compares only its score with the selected entry. |
| TDV7-03 | P2 visual evidence | Cleanup before relying on the inspected golden for responsive/full-campaign regressions | The exact inspected fixture contains two stage rows at 1280 only; it does not represent an eight-stage proof or the 700/390 layouts. |
| TDV7-04 | P2 screen-reader polish | Cleanup | Each inspection transition re-announces unchanged standings and submission status along with the new proof status. |

## Findings

### TDV7-01 — The Proof column is undiscoverable at 390px

**Severity:** P1 responsive/accessibility. **Blocker only for the supported
browse-only mobile policy; desktop and 700px gameplay are unaffected.**

The table deliberately uses a horizontal overflow container
(`src/viewer/style.css:470-480`), while the fifth Proof column and its actions
are appended after four numeric/text columns (`competition-panel.ts:227-270`).
There is no narrow-screen table treatment in either responsive rule
(`style.css:639-648,650-675`).

A live pinned-browser probe at 390×720 measured:

```text
table viewport: x=75..364, clientWidth=287
table content:  x=76..432.9, scrollWidth=357
first Inspect:  x=381.5..423.9
```

Thus none of the Proof action is initially visible. Keyboard users eventually
reach it: the third Tab moved the table to `scrollLeft=71` and exposed the
focused action. Pointer/touch users receive no comparable cue in the reviewed
frame. The existing mobile exact image is the empty-board state, so it contains
no table or Proof column (`maltline.visual.spec.ts:271-283`); the ranked mobile
test asserts only sheet bounds and document-level overflow
(`competition-panel.visual.spec.ts:148-157`).

**Bounded fix:** at `max-width: 699px`, keep Proof visible without a discovery
gesture. A compact row/card layout is clearest; a sticky final action column is
also acceptable if it does not obscure score/progress. If horizontal scrolling
remains, add a persistent, semantic “scroll for proof actions” cue that
disappears once the end is reached.

**Acceptance tests:**

1. At 390×720 with ranked rows, every row exposes an Inspect action without
   prior horizontal scrolling, or the visible/announced overflow cue is tested.
2. Pointer activation, Tab, Shift+Tab, and Escape preserve modal focus
   ownership; focusing an Inspect action does not create document overflow.
3. Add an exact ranked 390px frame containing the Proof actions, not only the
   empty state.

### TDV7-02 — Local verification is not fully bound to the selected row

**Severity:** P1 content truth. **Conditional blocker for a strong end-to-end
row-verification claim; not a blocker if the replay endpoint's record mapping is
explicitly trusted.**

`loadReplay()` correctly runs the retained envelope through
`verifyAndHashMaltlineProofEnvelope()` (`competition-client.ts:505-525`), whose
verification boundary replays inputs against registered authority and compares
the canonical retained envelope (`core/proof.ts:735-795`). The visible “LOCALLY
REPLAYED” claim is therefore accurate for the returned proof itself.

The association with the selected row is weaker. The table callback passes
only score ID, callsign, and score (`competition-panel.ts:254-263`), and the
controller accepts the replay when `summary.score === expectedScore`
(`competition-controller.ts:325-357`). A service/data bug that returned a
different valid proof with the same score would be presented under the selected
callsign and announced as that entrant's retained proof. Available row fields
such as `stagesCleared` are not compared, and there is no selected score ID or
expected digest in the verified envelope.

**Bounded fix:** pass the complete selected entry summary into inspection and
compare every available replay-derived field before rendering. For a strong
binding, publish a stable run ID or canonical proof digest with the leaderboard
entry and require it to match the locally derived envelope. Until then, copy
should distinguish “valid proof returned for this entry” from a cryptographic
identity guarantee.

**Acceptance tests:** return a valid envelope from a different run with (a) a
different score and (b) the same score but different stage/life/tick summary.
Both must render the inspection error and must never announce “independently
replayed and verified” for the selected callsign.

### TDV7-03 — The inspected golden is not a maximum or responsive fixture

**Severity:** P2 visual-regression completeness.

The exact inspected fixture includes only `first-pour` and
`two-lane-trouble` (`competition-panel-fixture.ts:100-119`), although the card
renders an arbitrary ordered stage list in two columns
(`competition-panel.ts:326-336`; `style.css:548-561`). Its sole exact assertion
uses the default 1280×720 viewport (`competition-panel.visual.spec.ts:143-146`).
The 700px exact frame covers the accepted submission, not inspection
(`competition-panel.visual.spec.ts:134-141`), and the 390px exact live frame is
empty-board only.

The current two-stage card already makes the 700×600 sheet scroll: the probe
measured `clientHeight=600`, `scrollHeight=714`, with the card at y=421..680.
At 390×720 it measured `scrollHeight=770`, with the card at y=477..736. This is
valid sheet scrolling, not a clipping defect, but an eight-stage winning proof
has materially different height, wrapping, and navigation behavior that no
golden currently protects.

**Bounded fix:** make the inspected fixture use the eight-stage retained winning
proof (or an equivalent deterministic maximum-shape state). Keep the 1280
golden and add geometry/scroll assertions at 700 and 390; add at most one
additional exact narrow frame if the responsive layout differs materially.

**Acceptance tests:** the final stage, full digest, verification label, and
selected callsign are reachable at 1280×720, 700×600, and 390×720; no content or
focus target escapes the sheet; opening inspection preserves the selected
Inspect control or moves focus to a deliberately labelled result target.

### TDV7-04 — Inspection updates repeat unchanged live-region context

**Severity:** P2 screen-reader polish.

Every render recomputes announcements for standings, inspection, and submission
and writes their concatenation to the one atomic status
(`competition-panel.ts:499-533`). In the 390 ranked fixture, changing directly
to verified inspection produced:

```text
Competition panel open. 4 ranked runs loaded. MALT-7's retained proof was
independently replayed and verified.
```

Loading and error/success transitions likewise repeat the unchanged board
count, and terminal panels additionally repeat unchanged submission copy. The
state-loop test checks that the status contains an inspection phrase but does
not assert transition-specific output (`competition-panel.visual.spec.ts:25-52`).
This is accurate and functional, but needlessly verbose for repeated proof
inspection.

**Bounded fix:** track the changed substate and announce only the meaningful
inspection transition after the initial dialog announcement. Keep visible
standings and submission semantics unchanged.

**Acceptance tests:** opening announces the board once; selecting a proof
announces replay start once; resolution announces verified/error once without
repeating board or submission copy; stale or aborted inspections produce no
announcement.

## Confirmed strengths

- Entrant callsigns remain text-only, while each Inspect control gets a specific
  accessible name (`competition-panel.ts:241-265`).
- The verified card uses a heading plus the textual “✓ LOCALLY REPLAYED” cue, so
  result meaning does not depend on green alone (`competition-panel.ts:277-338`).
- Inspection loading alone owns `aria-busy`; the polite atomic status is outside
  the changing content (`competition-panel.ts:153-170,282-291`).
- Re-rendering restores the selected Inspect/Retry focus key, the dialog traps
  Tab, and Escape restores the opener (`competition-panel.ts:469-546`).
- Abort controllers plus generation checks reject stale success and failure
  results (`competition-controller.ts:325-369,432-449`), with both replacement
  outcomes covered in the controller browser suite
  (`competition-controller.visual.spec.ts:32-61`).
- Reduced motion disables both panel entrance and spinner animation
  (`style.css:624-637`).

## Baseline inspection and test evidence

The three updated/new frames were inspected at full source resolution:

- `competition-eligible.png` — 1280×720, SHA-256
  `ec4dfc69ee482b637d4a615210f71e30622341a037f35d3b52f56010e80c7235`.
  The five-column board, active row, callsign form, and primary/secondary action
  hierarchy fit cleanly.
- `competition-accepted-700.png` — 700×600, SHA-256
  `be1c7c19c71dab48bca1cce38fec538c8084110df8ea34b51624afdfe301426b`.
  All five columns and Inspect actions remain visible at the gameplay minimum;
  the accepted card fits with no collision.
- `competition-inspected.png` — 1280×720, SHA-256
  `5dadab4374c19fa2b8f87ff1a4f4de6d1f3977283a49314c10af47c44606e463`.
  The locally replayed label, outcome summary, two-stage list, and full digest
  have clear hierarchy and do not clip.

Checks rerun against the reviewed tree:

- Focused Vitest (`competition-client`, `competition-controller`): **2 files /
  60 tests passed**.
- Focused Playwright covering competition states, exact frames, focus, retry,
  proof replay, stale replacement outcomes, 700/390 geometry, and live terminal
  submission: **17/17 passed**.
- Ad hoc pinned-browser geometry/focus probes at 1280, 700, and 390 confirmed
  the measurements and behavior cited above. No product or baseline file was
  changed.

## Repair verification

**Recheck date:** 2026-09-10
**Verdict:** TDV7-01, TDV7-02, and TDV7-04 are closed. TDV7-03's
maximum-shape fixture and desktop golden are repaired; one P2 automated
responsive-coverage residual remains. No product or golden was changed during
this verification.

- **TDV7-01 — Closed.** At `max-width: 480px`, the redundant Cleared column is
  removed and cell padding/callsign width are reduced
  (`style.css:772-785`). The 390px test now requires the first Inspect action
  to end inside the table viewport and captures the ranked board exactly
  (`competition-panel.visual.spec.ts:150-166`). Inspection is visible without
  horizontal scrolling in the reviewed `competition-ranked-390.png` frame.
- **TDV7-02 — Closed for the UI's stated claim.** The row model now retains all
  replay-derived outcome fields (`competition-panel.ts:1-18`;
  `competition-controller.ts:106-127`), and inspection compares score, lives,
  progress, completion, ticks, service, walkout, resolution, and exit totals
  before showing success (`competition-controller.ts:346-385`). A same-score,
  different-outcome proof is rejected in the browser
  (`competition-controller.visual.spec.ts:123-139`). Copy now says that this
  browser reproduced the listed result rather than claiming an unrepresented
  cryptographic row identity (`competition-panel.ts:354-392`). Publishing a
  score-record digest/run ID would still strengthen protocol identity, but it
  is no longer required for the narrower, truthful presentation claim.
- **TDV7-03 — Substantively repaired; P2 test residual.** The inspected fixture
  now represents all eight campaign stages and a completed outcome
  (`competition-panel-fixture.ts:114-152`), replaces the board with a bounded
  detail view, exposes Back to board, and collapses the fingerprint behind a
  disclosure. Its updated 1280 exact golden is representative. A live pinned
  probe also found the complete card fully reachable without sheet overflow at
  1280×720, 700×600, and 390×720: card bottoms were 462.7, 498.7, and 642.9px;
  each sheet's `scrollHeight` equalled its viewport height, all eight stages and
  the fingerprint disclosure were present, and document widths stayed bounded.
  The residual is evidence-only: no committed test renders this maximum-shape
  inspection at 700 or 390, so a later narrow-layout regression would not fail
  the suite. Add geometry assertions at both widths; another golden is needed
  only if the one-column 390 composition is intended as a pixel contract.
- **TDV7-04 — Closed.** While any inspection is selected, rendering suppresses
  unchanged standings and submission output and announces only the inspection
  transition (`competition-panel.ts:580-597`). The live probe's complete status
  was exactly “MALT-7's retained inputs reproduced the listed result in this
  browser.” Detail entry deliberately focuses `PROOF CHECK`; Back to board
  restores the initiating Inspect control, including a ten-row 700px board
  (`competition-controller.visual.spec.ts:33-57`).

Focused verification on the repaired tree:

- Vitest, `competition-client` plus `competition-controller`: **2 files / 61
  tests passed**.
- Playwright proof/competition focus, semantics, races, exact images, responsive
  geometry, and live submission: **21/21 passed**.
- Full-resolution visual inspection found no collision or clipping in the
  current proof-affected frames: `competition-eligible.png`
  (`a36d259b…70c`), `competition-accepted-700.png` (`e1453168…8df`),
  `competition-inspected.png` (`900eb2c2…feb`), and the new
  `competition-ranked-390.png` (`dd402e0d…644`). The 390 frame visibly exposes
  each available Inspect action; the inspected frame shows all eight named
  stages and a closed, keyboard-focusable fingerprint disclosure.

### Superseding TDV7-03 closure

TDV7-03 is now **fully closed**. The committed maximum-detail test renders the
eight-stage inspected fixture at both 700×600 and 390×720, requires the final
stage, fingerprint disclosure, and Back to board control, and asserts document,
sheet, detail-card, and scroll-content containment
(`competition-panel.visual.spec.ts:150-189`). The component visual spec was
rerun unchanged: **8/8 passed**, including both responsive sizes and all three
exact competition-image checks. This supersedes the P2 evidence residual above;
no open TD-07 visual/accessibility finding remains.

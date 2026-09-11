# P3-05 — Shift Board replay scrubber visual/accessibility design

**Date:** 2026-09-10
**Scope:** current verified-proof detail UI, controller/view-model seams, shared
renderer, responsive CSS, and deterministic visual fixtures. This is a design
audit only; no product code or golden image was changed.

## Recommendation

Add a viewer-only `MaltlineReplayScrubber` inside the existing Proof Check
detail view. It should own a dedicated canvas, deterministic replay cursor,
transport controls, and semantic frame summary. Do not connect it to the live
game canvas, live renderer, gameplay clock, input adapter, or ranked recorder.

The smallest useful first version has:

1. one stage selector;
2. Play/Pause;
3. one-tick Back and Forward controls;
4. one native range input for seeking within the selected stage;
5. current/total active time;
6. a visible, non-live textual frame summary; and
7. a polite status that announces only user actions, stage changes, pause, and
   replay completion.

Defer speed selection, full-run continuous playback across stage boundaries,
event bookmarks, downloadable proof data, picture-in-picture, and sound. They
increase state and accessibility surface without proving the core interaction.

## Current foundation and constraints

The existing proof detail is a good host:

- Verified detail replaces the standings rather than stacking below a long
  board, and entry focuses the `PROOF CHECK` heading
  (`competition-panel.ts:305-392,580-597`).
- Back to board restores the originating Inspect control, including after a
  ten-row board (`competition-controller.visual.spec.ts:33-57`).
- Retained inputs are replayed against registered authority and all listed
  outcome fields are compared before success (`competition-controller.ts:346-385`).
- The eight-stage fixture and responsive containment checks already establish a
  representative maximum proof shape (`competition-panel-fixture.ts:114-152`;
  `competition-panel.visual.spec.ts:145-189`).
- The renderer already accepts injected random, presentation time, and reduced
  motion (`renderer.ts:98-166`), which is the correct deterministic seam for
  replay frames.

The principal visual constraint is width. The normal sheet is at most 448px,
with 26px inline padding (`style.css:281-294`). A native 960×540 renderer frame
would display at about 395×222px on a 1280 viewport and about 290×163px in the
390 browse-only sheet. The latter is useful visual context, but its embedded HUD
cannot be treated as readable text or the only source of state.

The current verified view also retains only stage names/tick totals after
verification. Animation needs the verified stage input runs, authority-owned
scenario and run context, cursor state, and deterministic presentation state;
those belong in a dedicated viewer adapter, not in the panel's DOM rendering
logic.

## Proposed component boundary

Use three small viewer-only layers:

```text
Competition controller
  └─ verified replay payload + selected entry
       └─ Replay model/transport (pure state, injected scheduler)
            ├─ deterministic engine replay/seek adapter
            └─ Replay scrubber view
                 ├─ private MaltlineRenderer + canvas
                 └─ semantic controls/status
```

The panel should receive a typed scrubber state and callbacks, just as it does
for standings and submission. It should not instantiate an engine or own a
`requestAnimationFrame` loop. A dedicated scrubber controller should expose a
bounded API such as:

```ts
type ReplayScrubberState = Readonly<{
  mode: 'paused' | 'playing' | 'ended' | 'error';
  stageIndex: number;
  stageCount: number;
  tick: number;
  totalTicks: number;
  state: MaltlineState;
  frameSummary: string;
}>;

interface ReplayScrubberActions {
  play(): void;
  pause(reason?: 'user' | 'hidden' | 'focus-loss'): void;
  selectStage(index: number): void;
  seek(tick: number): void;
  step(delta: -1 | 1): void;
  destroy(): void;
}
```

Keep verified proof material immutable. Destroy or abort the scrubber when Back
to board, panel close, a replacement inspection, attempt restart, or controller
destruction occurs. Reopening proof detail should create a fresh paused cursor,
not retain an invisible animation loop.

## Visual composition

Within the existing bordered Proof Check card, order content as follows:

```text
PROOF CHECK                                  [Back to board]
✓ INPUTS REPRODUCED
Callsign · score · campaign result · lives · active time
Listed-result comparison sentence

STAGE [select: 3 of 8 — Three Windows]
┌──────────────── replay frame, 16:9 ────────────────┐
│ REPLAY · LOCAL                                      │
│            existing Maltline rendered scene         │
└──────────────────────────────────────────────────────┘
[Play] [Back 1 tick] [Forward 1 tick]       0:12 / 0:31
[──────────── native range / replay position ─────────]
Frame summary: lane 2 · chocolate selected · 2 lives · 4,280 points

▸ Stage breakdown                  ▸ Proof fingerprint
```

Use the current dark-green surface, cream type, strawberry focus, and mint
verified cue. The replay frame needs a one-pixel cream/mint border, 10–12px
corner radius, and a small persistent “REPLAY · LOCAL” badge outside the game's
own HUD. Do not imitate a video player chrome style or add a new art language.

The stage breakdown and fingerprint remain native `<details>` elements and are
collapsed initially. This protects vertical space while keeping the complete
proof inspectable. The transport must remain directly below the canvas; it may
not be separated from the frame by collapsed metadata or require a scroll to
pause.

### 1280×720

- Add a proof-detail modifier that widens only the inspected sheet to at most
  720px (`width: min(720px, calc(100vw - 48px))`). Keep board/submission views at
  their current 448px width.
- Bound the canvas by both axes: approximately 600×338px is the target, with
  `width: min(100%, calc((100vh - 340px) * 16 / 9))`, a minimum usable width,
  `aspect-ratio: 16 / 9`, and horizontal centering.
- Keep stage select, Play/Pause, step controls, timer, range, and frame summary
  visible in the initial 720px sheet. Expanded breakdown/fingerprint may scroll.

### 700×600

- The inspected sheet may widen to `calc(100vw - 24px)` (676px); it remains a
  modal sheet, so covering most of the dimmed game is acceptable.
- Height is the limiting axis. Target a canvas near 480×270px so the transport
  and range remain visible with the Proof Check header. Allow the detail body to
  scroll, but use a sticky transport only if it can remain below the frame and
  never cover semantic summary content.
- Stage select uses a full row. Transport controls wrap as one intentional row;
  none may shrink below 36px high or 44×44 CSS px where space allows.

### Browse-only 390×720

- Retain the current 342px sheet and 27px inline content margin. The canvas is
  approximately 289×163px and remains full-frame rather than cropped: customer,
  counter, machine, and return window relationships are more useful than
  readable in-canvas labels.
- Treat canvas text as visual texture at this size. Stage, elapsed time, score,
  lives, lane, held flavor, selected station, and current event must exist as
  real text outside the canvas.
- Stack the stage selector, canvas, Play/Pause row, range, timer, and frame
  summary. Hide no transport action. Step button labels may become accessible
  icon-plus-text controls (`−1`, `+1`) only when their full accessible names are
  “Back one replay tick” and “Forward one replay tick.”
- The full composition may scroll vertically, but Play/Pause must be reachable
  immediately after the canvas and no control may require horizontal scrolling.

## Canvas and deterministic presentation

- Use `<canvas width="960" height="540">` with CSS `width: 100%; height: auto;
  aspect-ratio: 16 / 9`. Keep a fixed logical resolution and DPR-independent
  screenshots, matching the production renderer.
- Create a private `MaltlineRenderer` per inspected replay. Inject a seed derived
  from stable proof identity plus stage index, `nowMs` derived from the replay
  tick, and the current reduced-motion preference. Never use wall time or live
  renderer presentation state to choose pixels.
- Sequential playback may feed tick events and renderer updates normally. An
  arbitrary seek must reset presentation lifecycle and reconstruct the target
  frame so arriving at tick N by play, step, or range produces the same frame.
  Transient FX may be reconstructed from a bounded preceding event window; it
  may not depend on how often `draw()` was called.
- Advance replay simulation only from recorded inputs. Animation scheduling is
  presentation-only: one RAF loop while playing, a fixed 60-tick simulation
  cursor, bounded catch-up, and no advancement while the document is hidden.
- Do not store a full `MaltlineState` object for every possible ranked tick by
  default. Start with sequential playback plus seek-on-commit from stage start,
  throttled to one computation per animation frame. If profiling shows seek
  latency above 50ms, add sparse viewer-only checkpoints or a compact frame
  projection; do not weaken proof limits or add wall time to core state.
- Canvas failure must leave all controls and semantic proof facts usable, with a
  visible “Replay picture unavailable; verified result remains readable” notice.

## Controls and keyboard behavior

- Do not autoplay. Entering Proof Check focuses its existing heading; the next
  Tab reaches Back to board, then stage selection and transport in DOM order.
- Use native `button`, `select`, and `input type="range"`. Avoid a custom ARIA
  slider.
- Play changes to Pause while active. One physical activation changes state
  once; ignore `KeyboardEvent.repeat` in any shortcut layer. Native button repeat
  behavior should not be replaced with global listeners.
- The range owns Left/Right (one tick), PageUp/PageDown (a documented larger
  jump), Home, and End through native behavior. Do not intercept arrow keys at
  the dialog or document level.
- Step buttons pause first, then move exactly one simulation tick. Disable Back
  at tick 0 and Forward at the terminal tick; disabled state is both visual and
  native.
- Stage selection pauses, resets to tick 0, redraws once, and announces the new
  stage. Initial implementation does not automatically cross a stage boundary.
- Escape retains its existing meaning: close the whole Shift Board. Back to
  board destroys replay playback and restores the originating Inspect control.
- Pause on `visibilitychange` and on modal close. Do not resume automatically
  when the tab returns.

## Semantics and announcements

- Keep Proof Check as a labelled section. Wrap the frame in `<figure>` with a
  visible `<figcaption>` containing stage and time.
- Mark the canvas `aria-hidden="true"`; an animated canvas is not a useful
  continuously changing accessibility node. Its information-equivalent is the
  frame summary immediately after the range.
- The range has a persistent label “Replay position” and a dynamic
  `aria-valuetext`, for example: “Three Windows, 12 seconds of 31 seconds, tick
  720 of 1,881.” The value update itself is not live.
- Put elapsed/total time in `<output for="…">`; use tabular numerals and
  `aria-live="off"`.
- Frame summary is normal text, not a live region. Update it at a readable visual
  cadence (at most 10 times per second during play) while the canvas may render
  at display cadence.
- Reuse the panel's polite atomic status for discrete events only: “Replay
  started,” “Replay paused at 0:12,” “Three Windows selected,” “Replay complete,”
  and error/interruption. Do not announce every tick, score change, customer
  event, or range `input` event. Announce the final value once on seek commit.
- Use real text for the non-color state cue: `PLAYING`, `PAUSED`, or `COMPLETE`,
  paired with icon shape if desired. Never communicate playback solely through
  color or canvas animation.

## Reduced motion

- Reduced motion does not remove replay inspection. It disables renderer shake,
  particles, drifting motes, animated transitions, and smooth seek effects by
  using the renderer's existing `reducedMotion` dependency and CSS media query.
- Playback remains user-initiated and essential to the feature, but reduced
  motion mode renders discrete deterministic states without presentation-only
  interpolation. Default remains paused, and Pause is always adjacent to the
  frame.
- Spinner and sheet entrance remain animation-free under the current media rule
  (`style.css:643-656`). Add no new CSS animation outside the same reduced-motion
  override.
- Test a preference change while detail is open. Pause, rebuild presentation
  state with the new motion setting, redraw the same logical tick, and retain
  focus; do not require reopening the panel.

## State and failure policy

| Event | Required result |
| --- | --- |
| Verified proof loads | Detail appears paused at stage 1, tick 0; heading receives focus. |
| Play reaches stage end | Cursor stops at terminal tick, state reads COMPLETE, one polite announcement fires. |
| User chooses another stage | Playback pauses; cursor resets; stable first frame renders; selection is announced once. |
| Range is dragged | Visible time and non-live summary may update; expensive replay work is throttled; commit renders exact target. |
| Tab becomes hidden | Playback pauses immediately; no catch-up; returning stays paused. |
| Back to board / Escape / close | RAF and listeners are removed, presentation state discarded, prior focus restored by existing panel policy. |
| Replacement inspection starts | Old scrubber is destroyed before loading state renders; late callbacks cannot paint into the new proof. |
| Canvas/context failure | Proof facts, stage breakdown, fingerprint, Back to board, and status remain available. |
| Reduced-motion preference changes | Same logical tick redraws with reduced FX; transport/focus do not reset. |

## Test plan

### Unit/component tests

1. Same verified proof, stage, tick, seed, time, and motion preference produce the
   same renderer command digest; play/seek/step routes agree at the same tick.
2. Play advances only under the injected scheduler; paused, hidden, destroyed,
   and closed states cannot advance or draw.
3. Seek clamps to stage bounds; step changes exactly one tick; stage selection
   resets; no implicit cross-stage playback occurs.
4. One physical button press causes one action; repeat keydowns cannot race
   Play/Pause or cross terminal state.
5. New inspection, Back, close, stale replay resolution, and destroy cancel RAF,
   event listeners, and outstanding seek work.
6. Reduced-motion redraw keeps the logical state/tick but removes transient
   presentation movement.

### Browser accessibility/interaction tests

1. Verify heading/figure/control labels, range min/max/now/value text, native
   disabled boundaries, visible playback state, and non-live frame summary.
2. Prove DOM focus order and trap at 1280, 700, and 390; Back restores the exact
   row action; Escape restores the Shift Board opener.
3. Assert one status mutation for play, pause, stage select, seek commit, end,
   hidden-tab pause, and error; assert zero per-tick announcement spam.
4. Exercise native range arrows, Home/End, pointer drag, Play/Pause, both step
   controls, stage selection, blur/hidden, and runtime reduced-motion change.
5. Fail on page, console, request, response, font, canvas-context, and unhandled
   promise errors under the existing visual harness policy.

### Exact and geometry coverage

Use deterministic proof input, manual presentation time/RAF, fixed seed, bundled
fonts, reduced motion, and the pinned browser. The smallest durable matrix is:

| Viewport | Exact frame | Geometry/behavior |
| --- | --- | --- |
| 1280×720 | Paused replay at a busy, legible mid-stage tick | Wide proof-only sheet, 16:9 canvas, transport and range above fold, focus ring, no overflow. |
| 700×600 | No additional golden initially | Canvas is height-bounded; transport immediately follows it; all controls/card stay inside scrollable sheet. |
| 390×720 | Paused replay at the same logical tick | One-column controls, full-width range, semantic summary visible, no horizontal overflow or hidden action. |

Add non-pixel assertions that a paused screenshot remains identical after real
wall-clock passage, manual advancement produces a deterministic next frame,
Play then seek to tick N equals direct seek to N, and reduced motion changes only
permitted presentation FX. Keep the current maximum-detail containment test and
extend it to include canvas, transport, range, final stage, and collapsed proof
details.

Golden updates should be deliberate: update the existing 1280 inspected image
only if the scrubber becomes part of its canonical paused state, and add one
`competition-replay-390.png`. Do not capture an actively advancing RAF; freeze
at an exact tick before screenshot comparison.

## Audit evidence

- Current `competition-panel.visual.spec.ts`: **8/8 passed**, including the
  1280 inspected golden and maximum-detail containment at 700×600 and 390×720.
- The current 1280 proof-detail and 390 ranked-board baselines were inspected at
  source resolution. The existing hierarchy, responsive Proof action, eight
  stage rows, focus treatment, Back to board, and collapsed fingerprint remain
  coherent; the proposed scrubber should extend rather than replace them.
- `git diff --check` passed for this report. No product, test, or golden file was
  edited.

## Recommended implementation order

1. Build and unit-test the pure transport/seek adapter with injected scheduler,
   cancellation, stage bounds, and deterministic tick snapshots.
2. Extend the verified inspection model with immutable replay material and mount
   a lifecycle-owned scrubber controller; keep competition panel rendering
   declarative.
3. Add semantic native controls and frame summary before adding canvas pixels.
4. Mount the private deterministic renderer and implement seek-reset semantics.
5. Add proof-detail sheet modifier and responsive layouts at 1280/700/390.
6. Land interaction/accessibility tests, then exact 1280/390 frames and 700
   geometry; inspect every changed image at full resolution.

This order keeps core proof outcomes and the live game loop untouched while
making each layer independently testable and removable if the experiment does
not improve proof comprehension.

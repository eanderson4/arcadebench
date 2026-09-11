# Maltline replay scrubber visual/accessibility review 08

**Date:** 2026-09-10
**Scope:** the post-P3-05 Shift Board proof detail, replay scrubber, latest
desktop height cap, regenerated `competition-inspected.png`, responsive
behavior at 1280×720, 700×600, and browse-only 390×720, and the focused unit and
Playwright evidence. This was a read-only audit; only this report was created.

## Verdict

The visual/layout tranche is successful. The replay opens paused at tick zero
of the final recorded stage, the 1280 height cap brings the complete primary
transport above the fold, 700 and 390 stay horizontally contained in the
scrolling modal sheet, all transport/seek inputs are native controls, canvas
failure preserves proof facts and controls, discrete announcements do not fire
on every animation tick, and all tested teardown paths cancel the active
scrubber. The regenerated desktop golden is coherent with Maltline and exact on
the pinned browser.

P3-05 should nevertheless **remain open for accessibility and deterministic
presentation**. Two user-facing accessibility defects and one reproducibility
gap remain. In particular, the dialog's focus trap skips both collapsed proof
disclosures, so keyboard-only users cannot open Stage breakdown or Proof
fingerprint. There is no P0 crash, proof-integrity, horizontal-overflow, or
modal-escape blocker.

| ID | Severity | Closure class | Finding |
| --- | --- | --- | --- |
| TDV8-01 | P1 keyboard accessibility | **Must fix before P3-05 accessibility closure** | The modal focus trap excludes native `summary` elements and wraps from Playback speed directly to Close, making both proof disclosures keyboard-inaccessible. |
| TDV8-02 | P1 semantic equivalence | **Must fix before claiming the hidden canvas has a real equivalent** | The textual frame summary omits the player's lane, selected station/flavor, held/blending state, and jar/slide activity needed to interpret the replay. |
| TDV8-03 | P1 presentation reproducibility | **Must fix or explicitly narrow the deterministic contract before closure** | Normal-motion pixels at a logical tick can differ between direct seek and autoplay/display-frame schedules. |
| TDV8-04 | P2 reduced-motion lifecycle | Follow-up | Reduced motion is sampled only when a renderer is constructed; a preference change while proof detail is open neither pauses nor rebuilds the current frame. |
| TDV8-05 | P2 focus/lifecycle polish | Follow-up | An idempotent verified-detail rerender destroys and resets playback but cannot restore a scrubber control and can silently move focus to the dialog. |
| TDV8-06 | P2 visual evidence resilience | Follow-up | The exact desktop frame ends immediately after primary transport; seek/speed/summary/fallback pixels and responsive scroll/focus behavior have geometry or functional checks but no reviewed pixel state. |

## Findings

### TDV8-01 — The focus trap makes the proof disclosures unreachable

**Severity:** P1 keyboard accessibility. **Closure blocker.**

The proof detail correctly renders Stage breakdown and Proof fingerprint as
collapsed native `details`/`summary` controls
(`competition-panel.ts:397-413`). However, `focusableElements()` includes
buttons, inputs, selects, textareas, links, and explicit non-negative tabindex,
but not the natively focusable `summary` element
(`competition-panel.ts:120-127`). The modal trap treats Playback speed as the
last focusable descendant and wraps it to Close
(`competition-panel.ts:560-575`).

A pinned-browser keyboard probe reproduced the failure at 1280×720: with
Playback speed focused, three successive Tabs moved to Close, Back to board,
and Replay stage. Neither disclosure received focus. The same trap code is used
at 700 and 390, so scrolling does not restore keyboard access.

**Bounded fix:** include visible native `summary` elements in the panel's
focusable query. Do not add tabindex to disclosure content or replace native
details behavior. Verify that Tab from Playback speed visits Stage breakdown
then Proof fingerprint, the next Tab wraps to Close, and Shift+Tab follows the
reverse order at all three widths.

**Acceptance tests:** open both disclosures using only Enter/Space after
keyboard navigation; require their stage list/digest to become visible; then
close the modal with Escape and require focus restoration to the board opener.

### TDV8-02 — The canvas equivalent does not describe the player's actions

**Severity:** P1 screen-reader equivalence. **Closure blocker for the stated
canvas contract.**

The canvas is correctly hidden from assistive technology
(`replay-scrubber.ts:196-199`) and the replay region is described by a normal
frame summary plus latest-event text (`replay-scrubber.ts:250-265`). The summary
currently exposes stage, playback mode, order counts, lives, and score only
(`replay-scrubber.ts:282-314`). It does not expose the operational state that
makes a replay understandable: player lane, selected station and its flavor,
held shake, active blend/progress, outbound shake, returning jar, or clean/wash
availability. Those values already exist in `MaltlineState.player`, `slides`,
`jars`, `washing`, and `jarsAvailable` (`core/types.ts:83-122`).

This matters most at 390px, where the 231px-wide canvas is useful spatial
context but its in-canvas labels are visual texture. The context-failure path
has the same abbreviated summary, so removing the picture also removes all
player-action information.

**Bounded fix:** extend the non-live summary with concise stable facts such as
“window 2; chocolate station selected; holding vanilla” or “blending strawberry
45%; 1 clean jar, 2 washing; 1 shake outbound, 1 jar returning.” Continue using
the existing polite panel status only for discrete actions/events.

**Acceptance tests:** seek to authored nontrivial frames for holding, blending,
outbound shake, and returning jar, and assert the visible text and accessible
description update. Repeat at least one state with `getContext()` returning
`null`; no canvas-derived fact may disappear from the semantic result.

### TDV8-03 — Same tick does not guarantee the same normal-motion frame

**Severity:** P1 presentation correctness/reproducibility. **Closure blocker
for the current deterministic claim; it does not affect verifier outcomes.**

Renderer time is correctly derived from stage tick, and a new renderer's RNG is
seeded by proof digest, stage, and the tick at which that renderer was created
(`replay-scrubber.ts:171-180,317-321`). The remaining paths are not equivalent:

- a direct seek creates a fresh renderer but does not push the target frame's
  events because `draw(true)` bypasses the event branch
  (`replay-scrubber.ts:317-325,419-426`);
- autoplay pushes every traversed event and retains transient particles,
  popups, flashes, and shake (`replay-scrubber.ts:381-415`);
- transient effects advance using RAF elapsed milliseconds, capped per display
  frame, rather than logical tick advancement (`replay-scrubber.ts:381-408`).

Consequently tick N reached by range/step can be a state-only frame while tick
N reached by play contains event FX; different display-frame subdivisions can
also integrate those FX differently. The current deterministic unit assertion
compares two discontinuous seeks only (`replay-scrubber.test.ts:340-368`), and
all exact browser screenshots run with reduced motion
(`playwright.config.ts:19-27`), which suppresses the most visible randomized FX.

**Bounded fix:** define a deterministic presentation reconstruction for a
target `(proof, stage, tick)`. Either replay a bounded logical-event window into
a renderer with per-event seeds and tick-derived effect ages, or explicitly
make every scrubber frame state-only. RAF should choose when to paint, not how
far presentation state advances.

**Acceptance tests:** compare recorded draw commands for the same event-bearing
tick reached by direct seek, one-tick steps, 60Hz play, and 144Hz play with
reduced motion both off and on. Commands and semantic text must match; no path
may cross to the next stage.

### TDV8-04 — Runtime reduced-motion changes are not observed

**Severity:** P2 accessibility lifecycle.

The initial preference is honored: `MaltlineRenderer` samples
`prefers-reduced-motion` at construction and stores it as readonly
(`renderer.ts:102-111,141-165`), CSS disables the sheet/spinner animation, and
the inspected test confirms a reduced media match with no subtree CSS
animations (`competition-panel.visual.spec.ts:156-160`). The scrubber does not
listen for a media-query change. A user who enables reduced motion while a
normal-motion replay is open keeps shake/particles until the component is
remounted.

**Bounded fix:** own one `MediaQueryList` change listener in the scrubber. On a
change, pause, recreate deterministic presentation at the same stage/tick with
the new motion mode, redraw, retain the focused control, and remove the listener
on destroy.

**Acceptance test:** switch Playwright media from no-preference to reduce while
playing; require a paused unchanged cursor, one discrete announcement, stable
focus, reduced renderer commands, and no remaining listener/RAF after close.

### TDV8-05 — Same-detail rerender has no deliberate focus/reset handoff

**Severity:** P2 accessibility/lifecycle polish.

The panel reliably destroys the active scrubber before every render and on
Back, close, and destroy (`competition-panel.ts:197-200,328-331,546-549,
579-599,634-640`). Back and Escape are covered in the browser, and idempotent
scrubber destruction/visibility pause are unit-tested
(`competition-panel.visual.spec.ts:163-200`; `replay-scrubber.test.ts:418-437`).

On a verified-to-verified rerender, however, focus in a scrubber control has no
`data-competition-focus` key. Both transition branches are false, so the new
dialog itself receives focus (`competition-panel.ts:579-625`). Playback resets
to the final stage's tick zero as required, but the focus move/reset is not
explicitly announced or tested. The current browser rerender case re-enters
inspection from the board instead of rerendering while a scrubber control owns
focus (`competition-panel.visual.spec.ts:188-195`).

**Bounded fix:** define same-proof replacement behavior. Given the existing
“destroy on every render” contract, focus the new Proof Check heading and
announce that replay returned to the stage start. A different proof should use
the same deliberate heading handoff. Do not try to preserve a now-detached
range/button node.

### TDV8-06 — Exact evidence protects the fold, not the whole control surface

**Severity:** P2 visual-regression completeness.

The new height cap is effective but deliberately tight. At 1280×720 the probe
measured canvas y=430.19..675.17 and primary transport y=685.17..719.17, leaving
less than one CSS pixel below the buttons. The exact test asserts only
`transport.bottom <= 720` before capturing the viewport
(`competition-panel.visual.spec.ts:145-160`). The seek row begins at y=729.17,
so range, ±tick/second controls, speed, semantic summary, failure treatment,
and disclosures are outside `competition-inspected.png`.

Responsive containment is real: the committed 700/390 case checks canvas,
transport, seek controls, range, proof facts, sheet scroll height, and
horizontal bounds (`competition-panel.visual.spec.ts:215-276`). It does not
scroll, keyboard-focus the below-fold controls, open disclosures, or inspect
their pixels. At 700×600 the measured canvas ended at y=672.06 and transport at
y=682.06..716.06, so the primary action needs vertical scrolling. At 390×720,
the narrower canvas let transport fit at y=659.31..701.31. These are acceptable
scrolling layouts, not clipping defects.

**Bounded follow-up:** retain the current 1280 golden, add one exact scrolled
proof-control frame (390 is the most materially different layout), and add
keyboard-driven scroll/visibility assertions at 700. Give the 1280 fold a small
explicit safety margin or test the longest permitted callsign/outcome copy so
the `<1px` success is not fixture-specific. Add a narrow fallback screenshot
only if the blank-canvas treatment is intended as a lasting visual contract.

## Confirmed strengths and closed concerns

- The proof payload and displayed SHA-256 are one retained artifact in the
  fixture (`competition-panel-fixture.ts:57-64,127-165`).
- Initial state is paused at tick zero of the last recorded stage and defaults
  to 4×; Play never crosses a stage boundary
  (`replay-scrubber.ts:268-277,353-371,444-455`).
- Replay position and speed are native labelled inputs; time is a non-live
  output/timer, one-tick controls move exactly one tick, and ±5-second controls
  clamp through the same seek seam (`replay-scrubber.ts:217-249,419-484`).
- Canvas `getContext()` null/throw leaves controls and facts mounted with a
  visible diagnosis (`replay-scrubber.ts:196-205,255-265`). The reviewed 390px
  fallback remained readable with no horizontal overflow.
- Panel status is outside the canvas and receives discrete play, pause, seek,
  stage, speed, important-event, hidden-page, and completion messages; routine
  ticks only update non-live text (`replay-scrubber.ts:282-315,365-415,
  419-493`).
- Stage breakdown and fingerprint follow the scrubber and remain collapsed by
  default (`competition-panel.ts:393-414`). Visually they are contained and
  reachable by pointer; TDV8-01 is specifically their keyboard-trap defect.
- The sheet owns vertical scrolling and the responsive probes found document
  widths exactly equal to 1280, 700, and 390 with no horizontal overflow
  (`style.css:281-298,803-815,822-825,948-971`).

## Visual and test evidence

The regenerated `competition-inspected.png` was inspected at its full
1280×720 source resolution. SHA-256 is
`edfd82f9b291f47849867d146ef52c1ff5525dce578db989c2b7f26d8a8b4072`.
It cleanly shows the verified outcome hierarchy, final-stage selector, complete
uncropped Maltline frame, and full primary transport above the fold. The
disabled Next stage state remains distinguishable without competing with Play.

Additional live pinned-browser inspections covered the unscrolled and scrolled
700×600 and 390×720 layouts plus the 390×720 null-context fallback. The seek
row, 4× selector, semantic summary, event text, and both collapsed disclosures
remain inside the bordered scrubber/card; no control overlaps the frame or
escapes the sheet.

Checks rerun against the audited tree:

- focused replay-scrubber Vitest: **10/10 passed**;
- competition-panel Playwright, including all three exact competition images,
  interaction/lifecycle, reduced motion, null canvas, and 700/390 containment:
  **10/10 passed**;
- pinned baseline runner/inventory check: **1/1 passed**;
- manual keyboard probe reproduced TDV8-01 exactly as described.

No product code or golden image was changed.

## Closure recommendation and order

1. Fix TDV8-01 first; it is a small selector/test change and currently blocks
   access to proof metadata for keyboard-only users.
2. Fix TDV8-02 next so the hidden/failed canvas has a meaningful operational
   equivalent, not only scorekeeping facts.
3. Resolve TDV8-03 before describing replay pixels as deterministic by proof,
   stage, and tick. This can be a presentation-only change and must not touch
   proof or engine outcomes.
4. Address TDV8-04 in the same presentation lifecycle tranche if feasible.
5. Treat TDV8-05 and TDV8-06 as bounded follow-up polish/evidence work.

After TDV8-01 through TDV8-03 have focused regression tests and the full exact
gate remains green, P3-05 can close with TDV8-04 recorded as accessibility
polish. Until then, close the **visual layout/fold** portion only, not the whole
visual/accessibility/deterministic objective.

## Superseding repair verification

**Recheck date:** 2026-09-10
**Verdict:** TDV8-01, TDV8-02, and TDV8-03 are closed on the current repaired
tree. There is no remaining P1 or P3-05 closure blocker. P3-05 can close, with
TDV8-04 and TDV8-05 retained as P2 lifecycle/accessibility follow-ups and the
remaining portion of TDV8-06 retained as evidence polish.

- **TDV8-01 — Closed.** The modal focus query now includes native `summary`
  elements (`competition-panel.ts:119-128`). The focused browser case starts on
  Playback speed, Tabs to Stage breakdown and Proof fingerprint, opens each
  with Enter, verifies the next Tab wraps to Close, verifies reverse traversal,
  and restores the opener after Escape
  (`competition-panel.visual.spec.ts:204-226`). The prior manual failure no
  longer reproduces.
- **TDV8-02 — Closed.** `frameActionText()` now names the player's window,
  selected flavor station, holding/blending state and progress, clean/washing
  jars, outbound shakes, and returning jars (`replay-scrubber.ts:137-157`). The
  non-live frame summary combines those action facts with order, life, and
  campaign-score facts (`replay-scrubber.ts:307-340`). Unit coverage locates
  authored blending, holding, outbound-shake, and returning-jar frames and
  verifies their copy (`replay-scrubber.test.ts:451-484`); the browser
  null-context case requires the action summary while the canvas is unavailable
  (`competition-panel.visual.spec.ts:245-256`). Visual inspection at 700 and
  390 found the longer copy readable and contained.
- **TDV8-03 — Closed.** Presentation reconstruction now owns a bounded 1.4s
  logical-frame ring, matching the renderer's longest transient lifetime
  (`replay-scrubber.ts:16,300-385`). Explicit seek/stage/restart builds that
  ring once; adjacent playback appends and trims it
  (`replay-scrubber.ts:343-370,434-468,471-506`). Every draw creates a renderer
  from proof/stage/target-tick seed and rebuilds transient age in fixed
  simulation-tick increments, so RAF cadence chooses when to draw rather than
  presentation age (`replay-scrubber.ts:372-393`). Command-recorder tests now
  require the same event-bearing frame through direct seek and 60Hz/144Hz
  playback with reduced motion both off and on
  (`replay-scrubber.test.ts:400-449`). Instrumentation also proves a 100-input
  range burst performs one `frameAt()` rebuild and subsequent continuous play
  performs zero rewinds (`replay-scrubber.test.ts:348-386`), closing the
  transient O(target tick) per-RAF implementation encountered during repair.

The safer desktop cap now reserves 490px outside the replay frame
(`style.css:629-638`). In the current 1280×720 probe the canvas measured
y=430.19..660.17 and primary transport y=670.17..704.17, leaving about 16px of
viewport reserve instead of less than one pixel. The regenerated
`competition-inspected.png` was inspected at its full 1280×720 source
resolution; its SHA-256 is
`d331133505e55f04282b20895fc3f3be894df7fdfd0c7a7a43deb629a5c7e1a0`.
The canvas remains uncropped, the complete primary transport is above the fold,
and the disabled Next stage state remains subordinate to Play. Scrolled
700×600 and 390×720 inspections found the expanded action summary, seek/speed
controls, and collapsed disclosures readable with document widths bounded to
their viewports.

Focused checks rerun on the final ring-buffer implementation:

- replay-scrubber Vitest: **15/15 passed**;
- competition-panel Playwright: **12/12 passed**, including exact desktop,
  keyboard disclosures, action summary, terminal replay reset, null canvas,
  lifecycle, and 700/390 containment;
- `git diff --check`: passed.

### Genuine residual debt

- **TDV8-04 remains P2.** The renderer still samples reduced motion only when
  constructed; no runtime media-query change listener or focus-preserving
  same-tick rebuild exists. The initial reduced-motion path remains correct and
  covered.
- **TDV8-05 remains P2.** A verified-to-verified panel rerender still destroys
  and resets the scrubber without a dedicated focus/reset handoff for a control
  that was inside the replaced scrubber. Normal Back, Escape, visibility, and
  destroy paths remain correct and covered.
- **TDV8-06 is partially closed.** The 490px cap removes the prior subpixel fold
  fragility, while exact pixels still protect only the initial desktop fold.
  A scrolled narrow control/fallback golden remains optional evidence work;
  committed geometry and functional assertions already cover those surfaces.

This note supersedes the earlier closure recommendation, while preserving the
historical findings above. None of the remaining P2 items should keep P3-05
open.

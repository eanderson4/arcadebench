# Maltline Technical-Debt Audit 10 — Visual, Accessibility, and Performance

**Date:** 2026-09-11
**Scope:** Settled EXP-062/063 production shell, Shift Board, verified replay,
responsive visual evidence, renderer structure, and the remaining P4-04/P2-11
work. This was a read-only product audit; this report is its only repository
change.

## Verdict

No P0/P1 visual-correctness or accessibility blocker was reproduced. The
EXP-062/063 replay work is coherent: player-visible frame ordinals match the
integer replay cursor, the panel preserves one verified detail without DOM or
announcement churn, changed identities reset visibly and accessibly, and live
motion-preference changes pause and reconstruct the committed frame. Current
1280, 700, and browse-only 390 surfaces are contained and retain a clear visual
hierarchy in the reviewed frames.

P4-04 is **not closed**. Maltline has deterministic correctness evidence, but
no target low-end-device frame-time, long-task, input-latency, or thermal
evidence. Source and a local workload probe expose two credible costs: the live
960×540 scene is repainted on every supported animation frame even while a
static overlay or Shift Board owns the screen, and an animating replay creates a
renderer and reconstructs up to 1.4 seconds of presentation history for every
paint. These are measurement blockers for a P4-04 performance claim, not proof
of a user-visible regression.

P2-11 also remains active. The recommended next pixel-neutral refactor is the
private transient-effects-store extraction proposed by the parallel gameplay
audit, not a leaf-painter extraction. It isolates the renderer's most stateful
and replay-sensitive responsibility while retaining the public renderer API,
draw order, and all Canvas painters. A stateless leaf painter would be easier,
but would mostly move lines and would not clarify reset/event/random/age
lifecycle or unlock a safer replay optimization.

## What is already closed

### Shell, focus, and semantic ownership

- Production and fixtures share one shell source. The play canvas, overlay
  dialog, unsupported surface, footer, flow status, semantic status, and event
  live region are created together (`shell.ts:44-83`).
- Only the current surface is exposed: overlay visibility and the 700px support
  boundary toggle `aria-hidden` and `inert` on the canvas-adjacent controls,
  flow status, gameplay statuses, overlay, and unsupported state
  (`shell.ts:107-137`).
- Live gameplay status is de-duplicated before writing to the DOM
  (`main.ts:121-129`), and event announcements select at most one prioritized
  event per tick and suppress repeated IDs (`semantic-status.ts:32-105`).
- Gameplay keyboard ownership ignores editable/interactive targets and repeated
  presentation presses; blur, visibility, and support-boundary transitions
  clear held input and reset the clock/frame anchor (`main.ts:355-469`).

### Shift Board and replay lifecycle

- The panel is a real modal dialog with labelled/described semantics and a
  discrete polite status (`competition-panel.ts:170-214`). Its focus query
  includes native `summary` controls (`competition-panel.ts:142-151`), and
  Escape plus forward/backward Tab containment are explicit
  (`competition-panel.ts:575-601`). The controller makes the game shell inert
  while the panel is open and restores it on close/destroy
  (`competition-controller.ts:291-301,335-343,574-584`).
- Same verified entry ID plus `playback.verification.sha256`, a connected active
  scrubber, and containment in the current panel takes a true render no-op;
  other identity/kind/back/close/destroy paths tear the scrubber down. A
  different verified detail scrolls to the top, focuses the visible Proof Check
  heading, and announces once (`competition-panel.ts:603-673`).
- Replay canvas is decorative to assistive technology, with a complete textual
  state/event equivalent and a usable context-failure path
  (`replay-scrubber.ts:247-337`). Stage/frame/time controls are native, tick zero
  is Frame 1, and stages play separately (`replay-scrubber.ts:247-325`).
- Replay owns its motion query. A preference change pauses playback, cancels
  pending range work, reconstructs the same stage/tick, retains focus, announces
  once, and unregisters on destroy (`replay-scrubber.ts:187-198,620-691`). Page
  hiding also pauses an active replay (`replay-scrubber.ts:620-627`).

Focused browser evidence passed the same-detail paused/playing cases, both
identity halves, all teardown paths, motion toggling, disclosures in keyboard
order, canvas fallback, maximum-detail containment, the focused 700px control
surface, 390px browse-only board behavior, and production shell smoke.

## Reviewed visual surfaces

| Surface | Evidence | Audit result |
| --- | --- | --- |
| 1280×720 live title | `ranked-title-trigger.png` (`0dcb808a…126a`) | Shift Board trigger is distinct from brand/tagline and does not overlap them. |
| 1280×720 verified detail | `competition-inspected.png` (`6f957934…0753`) | Proof Check, replay frame, and primary transport form one readable hierarchy; the sheet owns scrolling. |
| 700×600 replay controls | `competition-inspected-controls-700.png` (`728ed268…574e`) | Scrolled proof controls remain contained; `+1 FRAME` focus is unambiguous, frame/time/speed/summary/recent event/details remain visible. |
| 390×720 ranked board | `competition-ranked-390.png` (`dd402e0d…644`) | Browse-only board remains usable without document overflow; the least important table column is intentionally removed at this width. |
| 390×720 empty live board | `competition-live-empty-390.png` (`12243ceb…e7bb`) | Empty-state hierarchy, close action, and wrapped title remain contained. |
| 390×844 game shell | `unsupported-portrait.png` (`e3642295…ce38`) | Gameplay is truthfully replaced by the keyboard/700px requirement while Shift Board remains separately browseable. |

The visual suite currently pins 49 PNGs in
`tests/visual/baseline-manifest.json:1-62`. Exact-image CI is materially stronger
than in earlier audits: the workflow installs the pinned browser and runs both
the full Maltline Playwright suite and assembled-route smoke
(`.github/workflows/ci-cd.yml:45-55`). EXP-063 records 142 Playwright checks and
manifest-ordered raw-image SHA-256
`1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.

The assembled-site smoke additionally rejects leaked human-lab routes, checks
the `/maltline/` redirect, title, loaded fonts, shared shell marker, absence of
fixture markers, route-local resources, and asset headers
(`tools/built-site-smoke.mjs:92-155`). It is intentionally a 1280px title smoke,
not assembled-route proof-detail coverage.

## Findings

### TDV10-01 — Low-end performance remains unmeasured

**Severity:** P1 evidence blocker for closing P4-04; not a demonstrated release
correctness defect.

The production RAF updates presentation, snapshots the engine, redraws the
entire 960×540 canvas, recomputes semantic status, republishes viewer state, and
schedules again on every supported frame (`main.ts:479-519`). That continues on
title, instructions, stage cards, clear/terminal overlays, and while Shift Board
is open. The board can only open from non-playing safe screens
(`competition-controller.ts:24-32,335-343`), so this does not hide simulation
ticks; it is unnecessary paint/status work. `engine.snapshot()` allocates new
player/input objects and maps customers, slides, jars, and washing state
(`engine.ts:95-123`). `publishViewerStatus` also calls `competition.setScreen`,
freezes a new public status object, and rewrites root datasets
(`main.ts:97-119`); `setScreen` re-runs trigger updates
(`competition-controller.ts:554-558`).

Replay has a separate RAF. Each draw constructs a new `MaltlineRenderer`, binds
the scenario, replays every retained presentation frame through event ingestion
and update, then paints (`replay-scrubber.ts:397-448`). History is correctly
bounded to 1.4 seconds—84 frames at 60 ticks/s—and explicit seek is no longer
O(target tick), but normal playback still redraws after a RAF callback that
advances zero ticks (`replay-scrubber.ts:489-523`). On 120/144Hz displays that
can repeat identical reconstruction and Canvas work. A production proof replay
can therefore coexist with the still-running live-shell RAF.

A non-invasive local Chromium counter observed approximately 30 clears in
500ms on the title canvas and 26 while the empty Shift Board was open. The
isolated replay fixture observed 0 replay clears while paused and 30 while
playing. This confirms workload shape only; it does **not** substitute for a
combined verified production-detail trace or low-end hardware.

**Bounded exit evidence:** on the actual P4-04 reference device, record p50/p95
frame time, missed-frame percentage, long tasks, input-to-paint latency, memory
and five-minute thermal behavior for: title/overlay, peak Stage 7 gameplay,
Shift Board, range drag, and sustained verified replay at 1×/4×/8× under 60 and
high-refresh displays. Instrument live draws, replay draws, renderer
constructions, replayed history-frame count, snapshots, and status publications.
Set budgets before optimizing.

If evidence fails, first skip static live-shell paint/status publication when
state and presentation time cannot affect pixels, and skip replay reconstruction
on zero-tick RAF callbacks with no motion/lifecycle change. Exit tests must prove
the next committed Canvas command stream, replay cursor, focus, announcements,
proof facts, and all 49 PNG bytes are unchanged.

### TDV10-02 — The live renderer does not react to a mid-session motion change

**Severity:** P2 accessibility lifecycle debt. Initial reduced-motion behavior
is correct; replay behavior is already correct.

`MaltlineRenderer` samples `matchMedia('(prefers-reduced-motion: reduce)')` only
in construction and stores a readonly boolean (`renderer.ts:119-156`). The
production renderer is constructed once for the page, so changing the OS/browser
preference during a live session does not remove motes, particle motion, shake,
popup travel, or HUD pulse until reload. CSS correctly disables overlay,
spinner, and sheet animation (`style.css:802-815`), and the replay scrubber owns
a fully tested live listener, but the primary playfield has no equivalent.

This is not an initial-load WCAG blocker: the current exact browser project runs
under reduced motion, the reviewed reduced fixtures pin non-motion direction
cues, and initial construction honors the setting. It is a runtime preference
gap.

**Bounded fix and exit tests:** give the live renderer a presentation-only
motion mode setter or reconstruct it at the same bound scenario/state when the
query changes. Switching to reduced motion must clear/collapse motion-only
transients without changing engine state, clock, input, rank eligibility, or
static feedback; switching back must not resurrect expired effects. Test active
shake/particles/popup, hidden page, overlay, stage transition, listener cleanup,
and focus. Add a normal→reduced live-browser assertion; no existing reduced
golden should change.

### TDV10-03 — Renderer state and painters remain one 1,834-line unit

**Severity:** P2 P2-11 maintainability debt; no current pixel defect.

The prior layout extraction is sound: one deeply frozen scenario-derived layout
owns frame constants, lane endpoints/centers, station rectangles, action/gauge
regions, and finite/range admission (`renderer-layout.ts:20-115`). But
`MaltlineRenderer` still owns mutable particles, popups, flashes, failure
callouts, shake, random/time/motion dependencies, and binding
(`renderer.ts:133-175`); event-to-effect reduction and update/expiry
(`renderer.ts:200-325`); scene/environment (`renderer.ts:363-651`); entities
(`renderer.ts:670-1147`); station/action painting
(`renderer.ts:1149-1603`); player (`renderer.ts:1605-1695`); and effects/HUD
(`renderer.ts:1697-1825`). The fixed draw order itself remains clear
(`renderer.ts:327-359`).

#### Effects store versus leaf painter

The smallest **useful** next extraction is a private
`MaltlineRendererEffects` store:

- Move only effect records, event reduction, random consumption, age/expiry,
  shake evolution, and reset into the store.
- Supply the already-bound scenario/layout and state needed to project an
  event; expose readonly effect views to the existing renderer painter methods.
- Keep `MaltlineRenderer`'s public `setScenario`, `pushEvents`, `update`,
  `resetPresentation`, and `draw` contract unchanged. Keep every Canvas painter
  and the current draw order in `renderer.ts` for this tranche.

This is more behavior-sensitive than extracting a stateless wall/awning/counter
leaf painter: random call order, failure-lane association, TTL boundaries,
reduced-motion filtering, and shake phase must remain exact. However, it creates
a real ownership boundary around the mutable lifecycle that production, replay,
and the lab must reset/reconstruct. It also makes later profiling or reuse of an
effects history possible without entangling Canvas methods.

A leaf-painter extraction is lower risk but lower value today. Moving, for
example, `drawWall`/`drawAwning` to a function would reduce file length while
leaving lifecycle coupling, replay reconstruction, and public reset conventions
untouched. Do it later, one stateless family at a time, after effects are owned;
never mix either extraction with pixel polish.

**Pixel-neutral exit tests:** pin random call count/order for each event batch;
retain every-event, repeated-draw, update partition, 0/479/480/899/900/
1399/1400ms lifetime, reset, rebind, normal/reduced, and failed-admission tests;
compare exact Canvas command transcripts for idle, serve, catch, every loss,
and simultaneous-event frames. The complete 49-image exact suite and aggregate
hash must be byte-identical. Production/lab/replay imports must remain leaf-safe,
and no core, authority, proof, score, or lab revision may change.

### TDV10-04 — Exact replay evidence has two deliberate gaps

**Severity:** P3 visual-regression evidence cleanup; functional coverage exists.

The exact suite pins a normal 1280 verified detail and a focused/scrolled 700
control detail, while functional geometry covers maximum proof detail at both
700×600 and 390×720 (`competition-panel.visual.spec.ts:495-583`). It also tests
canvas-context failure semantically (`competition-panel.visual.spec.ts:482-493`)
and live normal↔reduced reconstruction (`competition-panel.visual.spec.ts:405-439`).
There is no exact 390 verified-replay frame, no exact canvas-failure frame, and
no exact event-bearing replay control frame. The pinned screenshot project uses
reduced motion, so normal-motion behavior is asserted functionally rather than
as an exact transient image. That is the correct default for stable goldens.

**Bounded evidence addition:** add at most one exact 390×720 maximum-detail
frame if browse-only proof inspection is a supported visual promise, and one
context-failure exact at 700 if fallback polish becomes a release requirement.
Keep normal-motion/event aging in deterministic command/lifecycle tests rather
than timing-sensitive PNGs. Do not add redundant viewport screenshots solely to
raise the count.

### TDV10-05 — Canvas and DOM presentation facts have multiple renderers

**Severity:** P3 semantic-maintainability debt. No current disagreement was
observed.

The Canvas HUD/action state, `semanticPlayStatus`, and replay frame summary each
render overlapping facts. Station truth now has a shared pure source through
`deriveMaltlineStationActionPresentation` (`renderer.ts:1176-1201`,
`semantic-status.ts:10-24`, `replay-scrubber.ts:154-176`), which materially
reduces drift. Event prioritization/copy remains independently expressed for
live announcements and replay recent-event history. Some difference is
intentional—replay needs durable lane/flavor detail—but exhaustive event facts
and priority have no shared owner.

**Bounded follow-up after P2-11:** introduce a pure structured event-presentation
policy, then keep separate live-announcement and replay-recent text adapters.
Cover every `GameEvent`, simultaneous fatal/clear/life batches, zero-point
rescue/catch, and all loss causes. Preserve all current player-facing strings in
the extraction tranche. This is not a reason to create DOM mirrors of every
Canvas object or expose high-frequency live regions.

## Automated correctness versus human/device validation

Automated evidence currently supports:

- deterministic renderer state, layout, replay seek/reconstruction, motion
  transitions, and teardown;
- focus trapping/restoration, same-identity focus/scroll preservation, changed
  identity reset, discrete live announcements, and semantic canvas fallback;
- exact pixels for the 49-image pinned environment, plus responsive containment
  at 700 and 390;
- production/fixture font and shell parity, browser/resource error hooks, and
  assembled `/maltline/` route isolation.

Automation cannot establish:

- cabinet-distance readability during moving Stage 4–7 traffic, focus-ring
  salience under glare, or screen-reader announcement usefulness under real
  play;
- native range/select usability across the actual browser/assistive-technology
  matrix;
- low-end GPU/CPU frame budgets, high-refresh duplication cost, memory/thermal
  behavior, or whether two concurrent canvases remain smooth;
- comprehension of Shift Board proof language or whether replay controls are
  discoverable without prompting.

Those require a short keyboard-only, screen-reader, cabinet-distance, and
reference-device protocol. Pixel goldens must not be cited as proof of human
comprehension or low-end performance.

## Recommended order

1. Measure P4-04 on the reference device before changing rendering cadence.
2. Extract the private transient-effects store with byte-identical pixels
   (TDV10-03/P2-11).
3. Add live motion-preference lifecycle support (TDV10-02).
4. Apply only performance changes justified by the P4-04 trace
   (TDV10-01).
5. Consolidate structured event facts, then extract stateless painter families
   one at a time (TDV10-05).
6. Add the two optional exact replay states only if their visual contract is
   adopted (TDV10-04).

## Commands and evidence run

```text
npm test -w @arcadebench/maltline -- --run \
  tests/replay-scrubber.test.ts \
  tests/renderer-presentation.test.ts \
  tests/renderer-layout.test.ts \
  tests/semantic-status.test.ts

Result: 3 discovered files passed; 44 tests passed.

npm run test:visual -w @arcadebench/maltline -- \
  competition-panel.visual.spec.ts maltline.visual.spec.ts \
  --grep "production entry loads|ranked public trigger|board remains browseable|same verified detail|verified identity changes|different inspection kind|live reduced-motion|proof disclosures|maximum proof detail|player-readable replay controls|portrait presents"

Result: 12 Playwright tests passed.

Temporary local Vite + pinned Chromium Canvas clear-count probe
Result over 500ms: title live 30; empty Shift Board live 26; isolated replay
paused 0; isolated replay playing 30. The temporary server was stopped and no
repository file was changed.

Source-resolution inspection:
  ranked-title-trigger.png
  competition-inspected.png
  competition-inspected-controls-700.png
  competition-ranked-390.png
  competition-live-empty-390.png
  unsupported-portrait.png
```

The named `semantic-status.test.ts` path does not exist; Vitest selected the
three matching renderer/replay files. The full settled gate is cited from
EXP-063 rather than rerun for this read-only audit.

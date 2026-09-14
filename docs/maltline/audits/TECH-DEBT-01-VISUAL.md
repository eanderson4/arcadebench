# TD-01 — Viewer and Visual-Test Technical-Debt Review

**Date:** 2026-09-10
**Scope:** Fixed-step viewer clock, renderer presentation dependencies,
deterministic fixture entry, Playwright configuration, screenshot baselines,
fixture CSS/fonts, and build/CI integration.
**Method:** Static contract review plus current unit, browser-visual, and build
execution. No product or test code was changed by this review.

## Gate decision

The new seams are a sound base, but the visual suite is not yet a trustworthy
polish gate. It is deterministic on this machine and catches full-frame pixel
changes, yet it can pass while the live HUD reports incorrect authoritative
game data, while production markup or typography diverges from the fixture,
and while CI never runs it.

Five items should be fixed before the visual-polish tranche begins:

1. consume authoritative scoring/resolution data in the renderer and cover it;
2. make `draw()` observationally pure and reset transient presentation state;
3. remove fixture/live shell and font divergence;
4. pin a CI browser/runtime and actually run the visual suite in CI;
5. add production-page smoke/error checks and the immediately missing contract
   fixtures.

The large renderer split, broad device/browser matrix, component goldens, and
leaderboard wall-clock policy can be deferred. They should not be mistaken for
completed coverage.

## Current evidence

At the reviewed state:

- `npm test --workspace=@arcadebench/maltline`: **50/50 tests passed** across
  six files.
- `npm run test:visual --workspace=@arcadebench/maltline`: **8/8 tests passed**
  using local Google Chrome 143.
- `npm run build --workspace=@arcadebench/maltline`: **passed**.
- Six 1280×720 PNG baselines total approximately 2.0 MB.

Those green results prove that the current unit contracts compile, fixture
renders match their local goldens, and the production entry bundles. They do
not prove the visual suite runs on CI, that fixture and production DOM are the
same, or that displayed values agree with the recently revised engine events.

## What is working well

- `FixedStepClock` is isolated from DOM code and retains fractional frame time.
  Its tests cover 30/60/90/120/144 Hz schedules, jitter, hitches, reset, and
  tick-rate changes.
- Engine catch-up is bounded to six ticks. The renderer's frame delta is also
  capped at 100 ms, so simulation and transient FX have the same nominal hitch
  ceiling at 60 Hz.
- Renderer time and entropy are injectable without changing the live call site.
  The command-recorder tests prove seeded event behavior and frozen-clock jar
  animation at their current scope.
- The visual page is test-only and not included in the production Rollup entry.
  Arbitrary fixture state is therefore not exposed by the shipped Maltline
  viewer.
- Fixtures wait for requested fonts, `document.fonts.ready`, a completed draw,
  and one animation frame before setting a stable readiness marker.
- Baseline updates have a distinct explicit command, exact pixel comparison is
  configured, generated failure output is ignored, and checked-in baseline
  provenance is documented.
- The authored fixtures obey most current resource accounting, and TypeScript
  forced them to follow the new state shape when engine fields changed. That is
  useful compile-time pressure.

## Must fix before polish

### TDV-01 — Renderer output has drifted from the authoritative engine contract

**Severity:** correctness; immediate.

The scoring/resolution refactor added authoritative values to events and state,
but the renderer still reconstructs old values:

- `jar_caught` events now carry `points`, which may be zero for a repeat
  service. The renderer always displays `+25`.
- `served` events carry `points` and `firstFulfillment`. The renderer ignores
  both and reconstructs a value from the post-event `state.streak`. A legal
  zero-point re-service will therefore display points it did not award.
- The HUD computes `IN LINE` as `customerCount - state.exited`. Walkouts now
  increment `state.resolved`, not `state.exited`, so the HUD can retain phantom
  customers and can disagree with a cleared stage.

The six browser fixtures contain no served success, jar catch, zero-point
re-service, walkout-with-lives-remaining, or cleared-stage count. The current
green screenshot suite cannot detect any of these errors.

**Required fix:** render `event.points` directly; define the intended visual
treatment for zero-point service/catch; derive remaining demand from the
authoritative resolution field selected by game design; add focused command
tests and browser fixtures for first fulfillment, re-service, catch bonus,
zero-point catch, and post-walkout count. Do this before updating visual
language so new art is not built around false data.

### TDV-02 — `draw()` consumes mutable RNG and samples time inside an item loop

**Severity:** reproducibility and maintainability; immediate.

Particle construction consumes seeded RNG only when events arrive, which is a
good lifecycle. Screen shake instead consumes two more random values on every
`draw()`. The same renderer, state, effect age, seed, and presentation time can
therefore produce a different frame merely because it was drawn an extra time.
Later particle layouts also depend on display refresh rate because screen-shake
draws advance the same RNG stream used by future bursts. The current recorder
test compares freshly constructed renderers; it does not test repeated draws
during shake.

The jar gauge calls `nowMs()` separately for each washing jar. A manual clock
normally returns one value, but the dependency contract does not require that;
an advancing source could put jars in different nominal frames.

**Required fix:** keep `draw()` free of RNG mutation. Precompute shake samples
when a failure event arrives, or derive a stateless offset from visual seed,
event identity, and quantized presentation time. Sample presentation time once
at the top of `draw()` and pass it down. Add a test that two draws of a frozen
renderer with active shake produce identical commands and that draw count does
not affect the next event burst.

### TDV-03 — Transient renderer state can leak across restart/scenario changes

**Severity:** correctness/UX; immediate.

`setScenario()` changes geometry but does not clear particles, popups, lane
flashes, or shake. The normal two-second stage-clear delay happens to outlive
current effect TTLs, but an immediate `R` after a failure can carry old miss FX
into a new run. That behavior is implicit and will become more fragile as the
polish pass lengthens effects.

**Required fix:** add an explicit `resetPresentation()` lifecycle and call it
for new run/stage according to a documented transition policy. Do not overload
`setScenario()` if replay scrubbing will need geometry changes without clearing
effects. Test restart immediately after each failure event.

### TDV-04 — The fixture can pass while production markup and fonts regress

**Severity:** false-positive test coverage; fix before UI structure changes.

The fixture HTML duplicates the production shell, overlay, and footer by hand.
There is no parity assertion. A production change to controls, ARIA, overlay
structure, or wrapper layout may not appear in the fixture at all.

Typography also differs by design: the fixture aliases bundled Noto Sans to
`Avenir Next`, while production uses an unbundled `Avenir Next`/Segoe/system
stack. On reviewed Linux both tend toward Noto, but a machine with actual
Avenir or Segoe can have different metrics, wrapping, and clipping from the
golden. In addition, the fixture maps static font files to weight ranges and
does not explicitly request every 600/italic face used by Canvas.

**Required fix:** share the shell markup through a small view/component builder
or run fixture injection against the actual production shell without exposing
fixture state in the production build. Use the same explicitly licensed,
bundled font in production and fixtures, with concrete files for required
weights/styles. Add a production-entry smoke screenshot or DOM parity test.

### TDV-05 — The visual suite is absent from CI and its browser is not pinned

**Severity:** release-process correctness; immediate.

Root `npm run check` runs workspace build and Vitest only. The GitHub workflow
calls that command but never invokes `test:visual`, so a pull request can change
or delete every golden without a browser gate.

Playwright Test is version-pinned, but the configured executable is a floating
system Chrome at `/opt/google/chrome/google-chrome`. `ubuntu-latest` and its
preinstalled Chrome move independently from the repository; the local README's
Chrome 143 note is provenance, not enforcement. An override still writes into
the same `chromium-system` snapshot directory. Exact zero-pixel comparison is
appropriate only after OS, browser revision, font files, color configuration,
and rendering backend are pinned. `--no-sandbox` should not be the default in a
CI job that can run Chrome as a non-root user.

**Required fix:** create a separate CI visual job with a pinned Playwright
Chromium revision or immutable container digest, explicit dependency install,
and uploaded actual/diff artifacts on failure. Fail early if the browser
revision differs from the baseline manifest. Keep deliberate snapshot updates
out of CI. Exact comparison and one worker can remain once the runtime is
fixed.

### TDV-06 — Browser tests do not fail on runtime errors or missing resources

**Severity:** test integrity; immediate.

Readiness proves the fixture reached its final line, but the suite does not
collect `pageerror`, unexpected console errors, request failures, or non-2xx
font/module responses. Font loading should also assert the expected faces are
actually available, not only await the `FontFaceSet` promise. The Vite
production build has only `index.html` as an input, so it type-checks fixture
source but does not bundle or resolve the fixture entry and font assets; only
the Playwright dev-server path exercises those imports.

**Required fix:** install per-page error/request collectors before navigation,
assert the font faces and fixture metadata, and add one live production-entry
smoke test. Keep the fixture out of the deploy artifact, but make explicit that
visual CI—not `npm run build`—is its integration gate.

## Deferred refactors

These are real debt but do not need to block the first visual changes once the
items above are addressed.

### TDV-07 — Separate renderer subsystems

The 1,324-line renderer owns scene, actors, machines, HUD, effects, palette,
geometry, and presentation timing. Split it incrementally into pure render-model
derivation, scene/entity primitives, semantic HUD, and transient FX. Avoid a
large rewrite now; extract along test-backed feature boundaries during the
scheduled next debt session.

### TDV-08 — Replace hand-authored raw states with validated fixture builders

`makeState()` guarantees TypeScript shape but not reachable engine semantics.
For example, the rush fixture contains an in-flight jar whose customer is no
longer present; normally that customer would still be leaving while the jar
travels. Positional campaign index 6 is also brittle if stages are reordered.

Add typed customer/jar builders with safe defaults, refer to scenarios by stable
ID, and validate fixture invariants. For complex states, prefer checked-in input
scripts replayed to a chosen tick, then add only presentation-only events that
cannot be recovered from state. Raw states remain useful for impossible/error
UI cases, but should be labeled as such.

### TDV-09 — Expand goldens by behavior, not by every frame

Current full-page goldens cover the title and a useful first six states, but
miss serve/catch success, all three failure causes, zero-point repeat service,
jar starvation/washing completion, one life, stage clear, game over, victory,
and stage transition. Add those as the corresponding features are polished.

Use smaller stage/HUD/component snapshots for dense state combinations; the
full-page files contain substantial unchanged background. Retain a few
full-page composition checks. A baseline manifest with fixture ID, scenario ID,
browser revision, font hash, effect seed/time, and image hash would make updates
auditable.

### TDV-10 — Broaden responsive and accessibility assertions

The laptop test checks viewport bounds but not overlap, clipping, effective text
size, or pixel appearance. The portrait test's `supportedDevice` result is set
by the fixture itself from the same width it tests, so that part is tautological;
it does not prove that production tells the player the device is unsupported.

When responsive work begins, add phone landscape, DPR 2, 200% text zoom, touch
targets, keyboard-only flow, focus/ARIA/live-region checks, and explicit
intersection/minimum-size assertions. Add automated contrast checks for DOM
tokens and authored non-color flavor cues for Canvas. Keep pixel goldens on one
browser, with Firefox/WebKit used for geometry/error smoke.

### TDV-11 — Do not confuse fixture motion suppression with reduced-motion UX

The Playwright context requests reduced motion, but fixture CSS unconditionally
disables every animation and transition. That is excellent for golden stability
but cannot test the production `prefers-reduced-motion` behavior; production CSS
currently has no such media rule. Once reduced motion is implemented, maintain
separate stable normal-motion and reduced-motion semantic assertions, using
explicit sampled presentation ages rather than real animation waits.

### TDV-12 — Clarify simulation time, presentation time, and competitive time

There are currently three relevant time notions:

- fixed engine ticks accumulated from animation-frame timestamps;
- transient FX time advanced from a capped frame delta;
- ambient jar time read from the renderer's wall clock.

The first two have aligned ceilings but are not one shared clock. `droppedMs` is
returned by `FixedStepClock` and discarded by `main.ts`, so hitches are invisible
to telemetry and the player. `blur` clears inputs but does not pause or reset the
clock while a visible unfocused window continues to run.

Add clock-drop telemetry and a documented pause/blur policy during game-feel
work. Before competitive launch, separately decide whether leaderboard fairness
is tick-only or includes real elapsed time. A replay proves a legal tick input
sequence but cannot prove the human did not throttle or pause between ticks.
That is a leaderboard/verifier policy issue, not a reason to block the first
visual pass.

### TDV-13 — Harden public presentation APIs at their boundaries

`MaltlineRenderer.update()` accepts negative, infinite, and `NaN` deltas, and
the presentation dependency interface permits a non-finite clock or RNG outside
`[0, 1)`. The current live caller sanitizes its delta and fixtures supply valid
sources. Add validation when renderer/replay integrations become public rather
than silently letting invalid values poison every effect.

## Recommended remediation order

| Order | Work | Exit evidence |
| --- | --- | --- |
| 1 | TDV-01 authoritative event/HUD mapping | Focused recorder tests plus success, zero-point, and walkout browser fixtures |
| 2 | TDV-02 pure draw and single frame-time sample | Frozen active-shake double-draw equality and draw-count-independent next burst |
| 3 | TDV-03 presentation lifecycle reset | Immediate-restart tests after each failure |
| 4 | TDV-04 shared shell and production font | Fixture/live parity test and identical computed font faces |
| 5 | TDV-06 runtime/resource and live-page smoke | Browser suite fails on injected page/resource error and production page reaches a stable smoke marker |
| 6 | TDV-05 pinned visual CI job | Clean CI run compares all goldens; intentional failure uploads actual/diff artifacts |
| 7 | Begin the planned legibility/feedback polish | Every visual change updates or extends a meaningful fixture, not just a broad golden |

After two substantial polish experiments, revisit TDV-07 through TDV-13 in the
next scheduled debt review.

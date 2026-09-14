# TD-02 — Visual and Viewer Technical-Debt Review

**Date:** 2026-09-10
**Scope:** The combined viewer after EXP-022, EXP-023, and EXP-024, with
particular attention to renderer boundaries, presentation lifecycle,
accessibility, responsive/layout coupling, runtime cost, visual-fixture parity,
and a pixel-preserving refactor path.
**Method:** Static contract review plus the current Maltline unit, production
build, and browser-visual suites. This review did not change product or test
code.

## Gate decision

The polished frame is in materially better shape than at TD-01: authoritative
score/resolution copy is now used; life-loss causes, action state, flavor cues,
and jar economy are visible; renderer time and entropy are injectable; transient
effects reset at stage boundaries; reduced motion has both Canvas and CSS paths;
production and fixtures share their shell and bundled fonts; browser hooks catch
runtime/resource failures; and thirteen exact PNGs cover the primary states.

The green visual suite is still a **local regression aid, not yet a release
gate**. Two product behaviors also need correction before calling the current
viewer complete:

| ID | Severity | Blocks | Decision |
| --- | --- | --- | --- |
| TDV2-01 | P0 correctness | Shipping the narrow-screen gate | The page says `COUNTER PAUSED`, but the game continues simulating and rendering behind it. Fix before release. |
| TDV2-02 | P0 accessibility/interaction | Claiming P2-05 accessibility complete | Live state remains Canvas-only, overlays are not announced or focus-managed, and window-global input captures keys without a game-focus contract. Fix the bounded semantic/input layer before release; a fully nonvisual real-time mode may remain separate work. |
| TDV2-03 | P0 release process | Treating screenshots as a required merge/release check | CI does not run Playwright and the exact goldens use a floating system Chrome path. Fix before relying on the suite as a gate. |
| TDV2-04 | P1 conditional correctness | Rendering arbitrary normalized or ranked scenarios in a browser | The core accepts dimensions far beyond the renderer's visual and work bounds. Define a viewer capability boundary before adding a public replay/custom-scenario viewer. It does not block the current authored 2–3 lane campaign. |
| TDV2-05 | P1 deployment robustness | Production integration under a restrictive CSP or non-root asset path | Font definitions are injected as inline CSS, font failure aborts initialization, and browser smoke covers Vite source rather than the built artifact. Resolve as part of site/launcher integration. |

The 1,602-line renderer is high-value debt but is **not a blocker by itself**.
Splitting it before the correctness gates would increase pixel churn without
fixing a player-visible defect. The safe order is to lock current commands and
pixels, repair viewer state/accessibility, then extract pure boundaries in small
steps.

## Current verification snapshot

At the reviewed combined tree:

- `npm test --workspace=@arcadebench/maltline`: **167/167 passed** across 12
  files.
- `npm run test:visual --workspace=@arcadebench/maltline`: **18/18 passed**
  with Google Chrome `143.0.7499.169`.
- `npm run build --workspace=@arcadebench/maltline`: **passed** with TypeScript
  and Vite 8.2.1.
- The viewer is 1,602 lines of renderer, 191 lines of controller/entry, 75 lines
  of shell, and 256 lines of CSS. The fixture is another 453 lines.
- The checked-in visual set is thirteen PNGs totaling approximately 4.2 MB:
  twelve 1280×720 full-page states plus the 390×844 unsupported state.

These results establish current local determinism and build health. They do not
exercise the false-pause transition, assistive output, the 699/700 boundary,
live motion-preference changes, a production `dist` server, or the CI/browser
provenance contract described below.

## Severity-ranked findings

### TDV2-01 — The unsupported-device “pause” is only CSS

**Severity:** P0, player-state correctness. **Blocker before release.**

Evidence:

- `src/viewer/shell.ts:37-42` promises `COUNTER PAUSED` and requires a window at
  least 700 px wide.
- `src/viewer/style.css:159-180` hides the Canvas, overlay, and controls below
  700 px; `style.css:189-197` shows the unsupported card.
- `src/viewer/shell.ts:56-63` only writes a `data-supported-device` attribute.
  It neither notifies the controller nor exposes disposal/transition hooks.
- `src/viewer/main.ts:168-180` continues fixed-step simulation whenever the
  screen is `playing` and the document is visible. Supported-device state is not
  part of the predicate.
- `src/viewer/main.ts:183-188` continues presentation updates, full Canvas
  draws, state snapshots, and RAF scheduling even while that Canvas is
  `display:none`.

A player who narrows or rotates the window during a run can lose lives and
orders while reading a claim that the counter is paused. Simply skipping
`engine.step()` is insufficient: unless `FixedStepClock.reset()` and held input
are applied at the width transition, widening the page can immediately run a
bounded catch-up burst from stale elapsed time.

**Bounded refactor:** make supported width an input to a small viewer/session
controller rather than a write-only DOM attribute. On either breakpoint
transition, clear held input and reset both simulation and presentation frame
anchors. While unsupported, do not step the engine; define whether transient FX
freeze or clear, and avoid redrawing the hidden Canvas. Keep the shell's current
markup and pixels.

**Focused acceptance tests:**

1. Start the production viewer, advance to a known engine tick, resize from
   700+ to 699, advance wall time, and assert tick, lives, score, and resolution
   counters remain unchanged.
2. Resize back to 700 and assert the first animation frame anchors at zero
   simulation ticks; subsequent frames resume normally without catch-up.
3. Hold a movement/blend key across the resize and prove it is cleared.
4. Assert Canvas/controls visibility and the controller's playable state agree
   at both 699 and 700 px.
5. Instrument Canvas drawing and assert hidden-width frames do no repeated draw
   work.

### TDV2-02 — Essential game state has no semantic mirror or focus contract

**Severity:** P0 accessibility and interaction integrity. **Blocker for the
current accessibility completion claim.**

Evidence:

- `src/viewer/shell.ts:29` gives the Canvas only the static accessible name
  “Maltline play field.” Score, lives, outstanding orders, current lane,
  selected flavor, blend/ready state, jar availability, and failures exist only
  as pixels (`renderer.ts:399-444`, `1068-1143`, `1329-1378`, and
  `1534-1592`).
- The title, stage-clear, game-over, and victory UI is a plain `div`
  (`shell.ts:30-36`). `main.ts:56-60` mutates its text without `role`,
  `aria-live`, focus movement, or a focused action.
- `hideOverlay()` only adds a class (`main.ts:63-65`), and that class changes
  opacity and pointer events only (`style.css:85-88`). During normal play the
  invisible title/transition copy remains in the accessibility tree unless the
  controller sets a semantic hidden state as well.
- `main.ts:126-138` listens on `window`, prevents arrow/Space defaults regardless
  of screen, focus target, or supported width, and restarts on `R` globally.
  This is harmless in today's input-free shell but becomes a conflict as soon
  as mute, name entry, launcher controls, or embedding is added.
- The Canvas is not focusable and there is no visible game-focus affordance.
  Footer `<kbd>` elements accurately describe keys but are static notation, not
  interactive controls (`shell.ts:45-51`).
- The unsupported section has `role=status` (`shell.ts:37`), but the same static
  node is only toggled by CSS. There is no explicit announcement/focus policy
  when it enters the accessibility tree.
- The current browser assertion called “keyboard semantics” checks one Canvas
  label and the count of `<kbd>` tags
  (`tests/visual/maltline.visual.spec.ts:140-146`); it does not test keyboard
  scope, focus, state names, or announcements.

This review does not require a screen-reader user to operate a timing-critical
arcade mode with no alternative. It does require honest semantics for current
state and transitions, plus keyboard behavior that composes with a host page.

**Bounded refactor:** add one visually hidden, event-throttled status surface
fed from a pure presentation model. Include score/lives/orders, lane/flavor,
blend/ready/no-jar state, and event-based failure/stage transitions; do not
rewrite it at 60 Hz. Give overlays deliberate dialog/status semantics and a
focus policy. Scope gameplay key suppression to active gameplay and ignore
interactive/editable targets; choose either a focusable game root or an
explicit host-level keyboard ownership contract. Mark hidden/inactive visual
surfaces consistently for assistive technology.

**Focused acceptance tests:**

1. ARIA snapshots for title, playing idle, 50% blend, ready, no clean jars, each
   life-loss reason, honest stage-clear-with-walkout, game over, and victory.
2. Keyboard-only start/play/restart with a visible focus target; arrows and
   Space must scroll/type normally when the game does not own input.
3. Event-count assertions proving a stable tick does not spam live regions and
   a life loss is announced exactly once.
4. At 699/700, assert the playable region and unsupported status have coherent
   `aria-hidden`/visibility state and a transition announcement.
5. Add an automated accessibility scan for the DOM layer, while retaining
   explicit tests for Canvas state that generic scanners cannot inspect.

### TDV2-03 — Exact visual baselines are neither pinned nor run by CI

**Severity:** P0 release-process correctness. **Blocker before making visual
approval mandatory.**

Evidence:

- `playwright.config.ts:3-4` defaults to the mutable system executable
  `/opt/google/chrome/google-chrome`; `MALTLINE_CHROMIUM_PATH` can select any
  other revision while retaining the same `chromium-system` baseline directory.
- Exact comparison is configured with `maxDiffPixels: 0`
  (`playwright.config.ts:13-20`). That is useful only when browser build, OS
  image, raster backend, fonts, locale, and color settings are reproducible.
- `tests/visual/README.md:28-41` records local Chrome 143 as prose provenance but
  does not enforce it.
- Root `package.json:13-16` runs workspace builds and each workspace's `test`
  script. Maltline's default `test` is Vitest, while Playwright is a separate
  `test:visual` script (`games/maltline/package.json:13-16`).
- `.github/workflows/ci-cd.yml:45-49` runs the root check and site build, but no
  Playwright command or browser install. A pull request can therefore regress
  or remove the screenshots while CI remains green.
- The browser server is Vite development source (`playwright.config.ts:46-50`),
  and the “production entry” smoke opens `/src/viewer/`
  (`tests/visual/maltline.visual.spec.ts:65-72`). It does not load the emitted
  `dist` artifact.

**Bounded refactor:** run visuals in a separate CI job using a locked Playwright
Chromium revision inside a digest-pinned Linux container (or an equivalently
immutable image). Record browser revision, image digest, Node version, font
bundle, fixture seed/time, and baseline hashes in a machine-checked manifest.
Upload actual/diff images on failure. Keep snapshot updates an explicit local
review operation. Add a small second server mode that builds and previews
`dist`; keep fixture screenshots on the test-only dev entry.

**Focused acceptance tests:**

1. CI fails before comparison if the browser/image identity differs from the
   baseline manifest.
2. An intentional one-pixel fixture change fails CI and uploads expected,
   actual, and diff artifacts.
3. A built-preview smoke loads the production HTML, JS, CSS, and all four font
   files with no console, page, request, or HTTP errors.
4. The built production resource list and chunks contain no fixture runtime
   marker or fixture-only module; retain `viewer-boundary.test.ts:5-25` as a
   fast unit-level guard.

### TDV2-04 — Renderer ownership is too broad and scenario ownership is split

**Severity:** P1 maintainability with a latent correctness seam. **Not a
current pixel/release blocker.**

Evidence:

- `renderer.ts` is 1,602 lines. One class owns palette and layout
  (`12-52`), transient state and dependencies (`141-165`), scenario geometry
  (`167-189`), event interpretation (`191-285`), FX integration (`287-312`),
  scene orchestration (`314-345`), environment, actors, action UI, inventory,
  failure feedback, and HUD through line 1594.
- `setScenario()` stores a scenario and derives `laneHeight`
  (`renderer.ts:167-170`), but `draw()` accepts a second scenario
  (`314-345`). `pushEvents()` uses the stored scenario for success-popup
  position (`223-229`), while most painters use the draw argument. A caller can
  set scenario A and draw scenario B, yielding internally inconsistent geometry.
  Current callers keep them aligned, so this is a dangerous API rather than a
  current screenshot defect.
- `drawWall(ctx, state)` accepts unused state (`renderer.ts:349-375`), one small
  symptom that painter interfaces do not express their real inputs.
- Visual policy and painting are interleaved. For example action priority and
  copy selection occur inside `drawActionStatus()` (`1106-1123`), and order
  semantics are derived inside the HUD painter (`1578-1586`). This makes the
  future semantic DOM mirror likely to duplicate logic.

**Bounded refactor:** do not rewrite the class. First introduce a pure,
serializable `MaltlinePresentationModel` that derives semantic labels, counts,
selection, and bounded display lists from `(scenario, state, meta)`. Make a
single scenario/layout object authoritative per draw. Then extract transient FX
storage/reduction. Finally move leaf painters by stable layers while the
top-level call order remains unchanged. The same presentation model should feed
Canvas and the hidden semantic surface; it should not become engine state.

**Focused acceptance tests:**

1. Add command-recorder digests for all named fixtures before extraction, not
   only equality between newly created renderers. Every pure extraction must
   preserve those digests and all thirteen exact screenshots.
2. Compile-time/API test makes a scenario mismatch impossible; a runtime guard
   is acceptable during migration.
3. Presentation-model tests cover action precedence, resolved-order count,
   flavor labels, jar categories, and stage copy without a Canvas mock.
4. Verify renderer refactors do not change engine replay/proof fingerprints.

### TDV2-05 — Presentation reset does not reset the whole presentation session

**Severity:** P1 reproducibility and lifecycle. **Fix before replay scrubbing,
hot preference changes, or renderer reuse becomes public.**

Evidence:

- `resetPresentation()` correctly clears particle, popup, flash, callout, and
  shake state (`renderer.ts:172-181`) and `beginStage()` calls it
  (`main.ts:67-76`). This resolves the TD-01 cross-stage FX leak.
- Entropy is still a forward-only opaque function stored at construction
  (`renderer.ts:151-164`). `resetPresentation()` does not reset or fork it. Two
  identical runs replayed through the same renderer after reset can therefore
  produce different particles because the prior run consumed the stream.
- Event FX are order-dependent: every burst consumes sequential values
  (`renderer.ts:264-280`). Adding an unrelated earlier visual event changes the
  appearance of all later events even when their logical event identity is
  unchanged.
- Reduced-motion preference is sampled once and stored readonly
  (`renderer.ts:153-164`). CSS responds to a live media-query change, but the
  Canvas continues using the old preference until a new renderer is created.
- Failure location is carried only by the local `failureLane` variable within
  one `pushEvents()` call (`renderer.ts:191-235`). It relies on each causal
  `walkout`/smash and `life_lost` arriving adjacent in the same batch. The live
  engine currently does this, but a streamed inspector calling once per event
  silently places the life callout on the player's lane.
- `update(dtMs)` accepts negative, `NaN`, or infinite deltas and directly mutates
  every effect (`renderer.ts:287-312`). The production frame clamps valid RAF
  differences, but the public presentation seam does not state its contract.

**Bounded refactor:** introduce a presentation-session dependency with explicit
`reset(seed/sessionId)`, keyed per-event entropy, a current motion-preference
provider, and a validated advancement method. Translate a complete event batch
to semantic presentation effects before painting. If events may be streamed,
key pending loss context by tick/cause or include resolved lane in the
presentation adapter; do not alter authoritative core events only to serve art.

**Focused acceptance tests:**

1. Same session seed plus same logical events after reset yields the same
   command digest as the first run on that renderer.
2. Inserting an unrelated event does not alter an existing later event's keyed
   particle layout.
3. Batched and individually streamed failure events produce the same lane and
   callout.
4. A live `prefers-reduced-motion` transition changes subsequent Canvas motion
   without reinstantiating the engine or leaking FX.
5. Nonfinite/negative advancement either throws or no-ops according to one
   documented contract; it must never poison retained effect state.

### TDV2-06 — The responsive contract is duplicated and its boundary is not proven playable

**Severity:** P1 UX/layout correctness. **Fix before broad device support is
claimed; not a blocker for the tested desktop/cabinet target.**

Evidence:

- Canvas dimensions and its scene coordinate system are independently fixed at
  960×540 in `shell.ts:29` and `renderer.ts:12-21`.
- The outer shell is `min(980px, 96vw)` (`style.css:29-35`). The CSS breakpoint
  is 699 px (`style.css:159`), while JavaScript separately compares `innerWidth
  >= 700` (`shell.ts:56-60`). There is no shared constant or parity test.
- At exactly 700 px, the shell is 672 CSS px wide and the Canvas scale is 0.70.
  Essential 10 px action text (`renderer.ts:1137-1140`) is therefore about 7
  CSS px, and 8 px flavor labels (`1095-1097`) are about 5.6 CSS px. The gate
  removes unreadable portrait scaling but does not establish its first supported
  width as readable.
- Action and jar panels use fixed pixel positions and widths
  (`renderer.ts:1125-1140`, `1335-1377`). Scene geometry depends on a set of
  file-level constants plus magic coordinates distributed across painters.
  Localized/expanded copy has no measurement or truncation contract.
- Browser geometry covers 1024×768 and 390×844 only
  (`tests/visual/maltline.visual.spec.ts:160-210`). It misses 699/700, short
  laptop windows, DPR 2, zoom/large text, and string expansion.

**Bounded refactor:** define one `VIEWPORT_CONTRACT` for internal dimensions,
aspect, supported width, and layout rectangles. CSS cannot directly import a TS
constant, so enforce the duplicated media-query value with a source/parity test
or generate both from a small build token; do not hide duplication. Extract
rectangles without changing numbers, then add measured text fitting only in a
separate, intentionally pixel-changing polish task. Re-evaluate whether 700 is
an honest playable minimum.

**Focused acceptance tests:**

1. Geometry and visibility at 699 and 700 px, plus 800×600, 1024×600, and the
   existing desktop/portrait profiles.
2. Assert the CSS and controller breakpoints match the declared contract.
3. Component rectangles for control rail, action status, flavor key, machines,
   jar gauge, and HUD neither overlap nor exceed Canvas bounds for every campaign
   stage.
4. Exercise DPR 2 and 200% browser zoom/text-size behavior; record whether fixed
   Canvas text is an accepted cabinet limitation or requires DOM alternatives.
5. A long 128-character legal scenario name cannot overwrite score/lives;
   define truncate, wrap, or reject behavior explicitly.

### TDV2-07 — Core validity is much broader than visual capability

**Severity:** P1 conditional correctness and performance. **Blocker only before
untrusted/custom/ranked scenarios reach this viewer.**

Evidence:

- Core normalization allows 64 lanes, 100,000 jars/customers, and 1,000,000
  lives (`src/core/scenario.ts:11-16`, `89-105`, `159`). Even the tighter ranked
  policy allows 8 lanes, 64 jars/customers, and 20 lives
  (`src/core/proof.ts:33-45`).
- Renderer work and layout scale directly with those values: lane environment
  loops (`renderer.ts:422-441`, `446-497`, `500-572`, `575-628`), customer,
  slide, and return-jar loops (`647-653`, `994-1023`), jar gauge
  (`1356-1370`), and one cup per life (`1588-1591`).
- The fixed lane region is only 290 internal pixels (`renderer.ts:16-17`). At 8
  lanes each lane is approximately 36 px before its 24 px inset; at 64 lanes
  laneHeight is approximately 4.5 px and counter height becomes negative. This
  is a visual failure before the worst-case CPU/memory cost is reached.
- The authored generation-2 campaign stays within 2–3 lanes, 4–6 jars, and 4
  initial lives, so current campaign frames are bounded.

**Bounded refactor:** create a viewer-only capability validator distinct from
fundamental scenario validity and ranked proof limits. Either reject unsupported
dimensions into an attractive error state or cap visual lists with summaries
such as `20+`; never silently draw a malformed scene. Keep the engine's broader
protocol boundary unchanged.

**Focused acceptance tests:**

1. Every authored campaign stage is accepted and preserves current pixels.
2. An 8-lane ranked-valid scenario gets a deliberate supported or unsupported
   result, never negative/offscreen geometry.
3. Maximum normalized counts fail fast before any O(count) Canvas loop, or draw
   a formally bounded command count.
4. Lives/jars above the visual cap render an accurate numeric summary without
   obscuring the stage label.

### TDV2-08 — Font startup and production-asset smoke assume a permissive host

**Severity:** P1 integration robustness. **Conditional blocker for site launch,
not local standalone play.**

Evidence:

- The shared font module is a real parity improvement: both entries import
  concrete Noto Sans 5.3.0 WOFF2 files and verify four weights
  (`src/viewer/fonts.ts:1-14`, `29-42`).
- It installs `@font-face` rules by appending an inline `<style>`
  (`fonts.ts:16-26`). A strict `style-src` without an allowed nonce/hash blocks
  that path.
- Production mounts the shell and then top-level-awaits font preparation before
  acquiring the context or starting RAF (`main.ts:13-17`). A rejected font
  request aborts viewer initialization with no explicit recovery/error panel;
  the browser hooks catch this in test but the player receives no designed
  fallback.
- Vite's build input is the production HTML (`vite.config.ts:11-16`), while the
  Playwright server is the dev server. Current tests prove imports resolve in
  those two separate paths, but never serve the emitted production directory.
- `vite.config.ts:4-17` declares no deployment `base`; the reviewed build emitted
  root-absolute `/assets/...` JS, CSS, and font URLs. That is valid at an origin
  root but will break if the launcher copies Maltline under a nested game path
  without rewriting or co-locating those root assets.

**Bounded refactor:** move static `@font-face` declarations to bundled CSS (or
adopt the host's nonce contract), keep the shared metadata/check helper, and
turn startup failure into a visible retry/fallback state. Add a built-preview
smoke under the deployment base path. Do not weaken exact fixture font checks.

**Focused acceptance tests:**

1. Load production under the intended CSP and prove no inline-style violation.
2. Abort one font response and assert a visible, accessible error/fallback
   state plus no unhandled rejection.
3. Preview `dist` at its final subpath and assert all hashed font/CSS/JS requests
   succeed.

### TDV2-09 — Fixtures are deterministic but their registry and state validity are brittle

**Severity:** P2 test maintainability. **Cleanup; fix while adding the next
fixture family.**

Evidence:

- `FixtureName` and `FIXTURE_NAMES` duplicate twelve names
  (`visual-fixtures.ts:18-30`, `52-65`); the Playwright suite duplicates the
  desktop list again (`tests/visual/maltline.visual.spec.ts:4-17`). A new fixture
  can be omitted from screenshots without a type or completeness failure.
- Fixture records identify campaign stages by positional `scenarioIndex`
  (`visual-fixtures.ts:32-46`, `166-399`). A harmless campaign reorder silently
  changes scenario and stage metadata.
- `makeState()` shallowly overlays a real initial snapshot
  (`visual-fixtures.ts:71-80`). This ensures TypeScript shape, not reachability,
  ID uniqueness, lane bounds, counter coherence, or conservation of the jar
  pool. The current authored states appear intentionally resource-accounted,
  but there is no validator proving that remains true.
- Full-page screenshots are exact and useful for composition, but fixture
  metadata, scenario IDs, browser identity, and PNG hashes are recorded in prose
  rather than checked together.

**Bounded refactor:** export one immutable fixture registry keyed by stable
scenario ID and derive the name union, URL validation, parameterized screenshot
tests, and manifest from it. Add small state builders plus invariant validation;
tag deliberately impossible UI states explicitly. Prefer replay-derived states
for complex reachable scenes, with presentation-only events added afterward.

**Focused acceptance tests:**

1. Registry names, expected PNG files, and manifest entries are exactly equal;
   no orphan or uncovered baseline.
2. Reordering `MALTLINE_CAMPAIGN` does not change any fixture's scenario.
3. Validate lane/station ranges, entity IDs, counters, and jar conservation for
   every reachable fixture.
4. Hash and record each screenshot together with scenario ID, seed, time,
   viewport, font bundle, and pinned browser identity.

### TDV2-10 — Reduced-motion browser coverage is partly circular

**Severity:** P2 test-integrity cleanup. **The implementation is useful; the
gap does not block current pixels.**

Evidence:

- Playwright globally requests reduced motion (`playwright.config.ts:22-30`).
  Fixture CSS also disables all animation and transition unconditionally
  (`visual-fixtures.css:1-9`). This is correct for stable screenshots but means
  no browser test covers normal production CSS motion.
- Most fixtures override the Canvas renderer to full motion despite the browser
  preference (`visual-fixtures.ts:422-426`); the one reduced fixture supplies
  `reducedMotion: true` itself.
- The browser test only asserts the fixture-written `data-motion-mode` value
  (`tests/visual/maltline.visual.spec.ts:148-151`). It therefore confirms
  configuration wiring, not that movement was actually suppressed.
- The command-recorder test is stronger: it proves tick changes do not change a
  reduced frame and that burst entropy is not consumed
  (`tests/renderer-presentation.test.ts:336-374`). It does not cover live media
  changes or CSS/Canvas agreement.

**Bounded refactor:** keep fixture-wide animation suppression for goldens, but
add explicit normal/reduced browser projects or non-golden temporal assertions
on production. Expose a read-only motion policy signal from the presentation
session so CSS and Canvas can be asserted together.

**Focused acceptance tests:**

1. In normal mode, two controlled presentation samples differ for one known
   moving element/effect; in reduced mode they are identical.
2. Emulate a preference change on the live page and assert CSS pulse/transition
   and Canvas presentation policy switch together.
3. Failure copy remains visible for the same readable duration even when burst
   and shake motion are suppressed.

### TDV2-11 — The frame loop allocates and paints more than the campaign needs

**Severity:** P2 performance. **Profile before optimizing; only the hidden-width
case in TDV2-01 is an immediate fix.**

Evidence:

- `engine.step()` already creates a deep render snapshot on every simulated tick
  (`src/core/engine.ts:125-139` with `snapshot()` at `94-122`). `main.ts:174-175`
  consumes that state for events, then `main.ts:184` creates another snapshot
  for the frame. A six-tick catch-up frame can therefore create seven snapshots.
- RAF always updates and repaints the full 960×540 scene
  (`main.ts:163-188`), including title and terminal overlays and the CSS-hidden
  unsupported width.
- Many Canvas gradients/paths are recreated per frame by design. One avoidable
  nested allocation filters all flashes separately for each lane
  (`renderer.ts:500-572`), and the flavor key creates a new `Set` every frame
  (`1068-1073`). At 2–3 campaign lanes these are negligible compared with full
  Canvas painting; premature micro-optimization would be noise.

**Bounded refactor:** retain the last `result.state` from stepping and snapshot
only when a frame has no fresh result. Stop or invalidate-on-demand painting for
hidden/static states after transient effects settle. Add a representative frame
budget/command-count benchmark before caching gradients or restructuring actor
draws.

**Focused acceptance tests:**

1. Instrument snapshots: a normal stepped frame performs no additional draw-only
   snapshot, and an idle frame performs at most one only when state is dirty.
2. After title/terminal/unsupported rendering stabilizes, ten RAF callbacks do
   not issue ten full Canvas paints.
3. Benchmark rush-three-lane plus the largest supported viewer state against an
   explicit desktop frame budget; record command count and allocation trend,
   not machine-specific FPS alone.
4. Performance changes must preserve fixture command digests and exact PNGs.

### TDV2-12 — Small shell and painter cleanup should follow, not lead, refactoring

**Severity:** P3/P4 cleanup. **No release block.**

- `mountMaltlineShell()` replaces every body child and installs an anonymous
  resize listener with no disposal (`shell.ts:20-63`). This is fine for one
  standalone mount, but not for hot remounts or launcher embedding.
- Fixed 960×540 backing resolution plus CSS scaling and
  `image-rendering: pixelated` (`style.css:66-72`) is an explicit low-resolution
  look on DPR 2. Decide whether that is art direction before adding DPR-aware
  backing-store work, because it would intentionally change text pixels and all
  goldens.
- The Canvas painter relies on disciplined `save()`/`restore()` and mutable
  context properties across many methods. Extraction should retain command
  order and style writes; a broad “clean up redundant commands” pass would make
  screenshot review unnecessarily large.

**Bounded refactor:** return a shell disposer and accept a mount root when host
integration begins. Treat DPR support and Canvas command minimization as
separate measured experiments, not incidental cleanup.

## Incremental exact-pixel refactor path

The following sequence keeps each review bounded and preserves current art
direction. “Exact pixels” applies to the current 1280×720 fixture runner and all
unchanged visible states; accessibility-only offscreen markup should not alter
those images.

### Phase 0 — Strengthen the lock before moving code

1. Export one fixture registry and baseline manifest.
2. Move the Canvas command recorder into a test helper and record a digest for
   every fixture, including active FX ages.
3. Add 699/700 geometry, unsupported pause, ARIA state, built-preview, and
   performance-count probes.
4. Pin the visual runner and add its CI job.

**Exit:** 13/13 PNGs and all command digests match; the manifest has no orphaned
fixture or image; CI reproduces them.

### Phase 1 — Repair controller truth and input ownership

Extract a small viewer session/controller from `main.ts` with explicit screen,
supported-width, visibility, held-input, simulation-clock, and last-render-state
transitions. Fix the false pause and global key capture there. Add the semantic
status surface from the same controller/presentation model.

**Exit:** TDV2-01 and TDV2-02 acceptance tests pass; gameplay Canvas PNGs and
commands are unchanged.

### Phase 2 — Extract immutable layout and pure presentation policy

Move the existing numbers, palette, flavor art, and geometry formulas unchanged
into typed theme/layout modules. Add `deriveMaltlinePresentationModel()` for
copy, counts, selected states, bounded lists, and component rectangles. Remove
the stored/draw scenario duality while retaining the exact painter invocation
order.

**Exit:** all fixture model snapshots, command digests, and PNGs are unchanged;
the semantic surface no longer duplicates Canvas policy.

### Phase 3 — Extract presentation effects as a session

Move event-to-effect reduction, keyed entropy, advancement, reset, and motion
preference into a tested presentation session. Keep effect arrays and their
iteration order identical for the existing fixture seed/event stream so current
pixels do not move; introduce the corrected reset/keying behavior behind new
tests before using it for new effects.

**Exit:** same-session reset, batch/stream equivalence, invalid-delta, and live
motion tests pass; existing event-frame goldens remain exact.

### Phase 4 — Move painters one stable layer at a time

Extract primitives (cup/jar/flavor cue), then actors, environment, machines,
effects, and HUD. The top-level renderer remains a thin ordered compositor.
Land one layer per change and reject any command-digest difference unless it is
an explicitly approved visual experiment with inspected goldens.

**Exit:** `MaltlineRenderer` owns orchestration only; leaf painters accept the
smallest typed model; current pixels, text, z-order, and replay/proof identity
remain unchanged.

### Phase 5 — Measure before intentional visual changes

Only after boundary extraction, decide whether to raise the playable-width
threshold, reflow Canvas UI into DOM, add DPR-aware backing resolution, fit long
scenario names, or cache Canvas resources. These are product/visual experiments,
not debt-only refactors, and should receive deliberate before/after screenshots.

## Deferred cleanup register

The following are explicitly deferred and should not be allowed to inflate the
blocker tranche:

- broad renderer file splitting before command/pixel locks exist;
- Canvas micro-optimizations without a failing frame-budget benchmark;
- Firefox/WebKit pixel goldens (use them for geometry/error smoke instead);
- a fully nonvisual alternative real-time control mode;
- touch gameplay rather than the current honest unsupported-device state;
- DPR-aware Canvas restyling and localized/variable copy layout;
- shell mount/dispose generalization before launcher integration;
- component-level crop goldens replacing the useful full-frame composition set.

The smallest safe next tranche is TDV2-01 plus the bounded portion of TDV2-02:
make pause truthful, reset clock/input on support transitions, scope keyboard
ownership, and add the event-throttled semantic status/overlay contract. Those
changes address player correctness without asking the art renderer to move a
single visible pixel.

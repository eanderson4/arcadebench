# TD-03 — Visual and Viewer Technical-Debt Review

**Date:** 2026-09-10
**Scope:** Maltline's combined viewer after the first-time flow and
session/accessibility tranches. This review covers flow timers and state races,
focus and semantics, stage/interruption/restart invariants, visual fixtures,
the built artifact and deployment boundary, and renderer decomposition. It does
not review or change campaign tuning, deterministic rules, proof, audio, or the
sitemap.

## Gate decision

The viewer is locally coherent and substantially safer than at TD-02. Width,
background, blur, and hitch interruptions stop simulation; gameplay owns keys
only within the focused shell; hidden surfaces are removed from the accessible
tree; the first-run cards freeze ticks and inputs; font failure reaches a
playable fallback; presentation entropy/time are injectable; and exact fixtures
cover the principal game and flow states.

No finding threatens deterministic engine, replay, or proof outcomes. Two
viewer issues are release blockers in their stated contexts:

| ID | Severity | Classification | Decision |
| --- | --- | --- | --- |
| TDV3-01 | P0 release integration | **Blocker before publishing Maltline** | The Maltline build is not assembled into `dist/site`, and its emitted root-absolute assets have no built/subpath smoke. A passing package build does not produce a deployable Maltline route. |
| TDV3-02 | P0 accessibility | **Blocker before claiming the first-run flow accessible** | Timed mutations replace content in an already-focused, non-live dialog; stage-clear content disappears after two seconds; and inactive footer controls remain exposed behind cards. Static ARIA snapshots do not prove transitions are announced. |
| TDV3-03 | P1 interruption correctness | **Must fix before ranked/session UI integration** | A second interruption overwrites the original cause and overlay while a run is already interrupted. |
| TDV3-04 | P1 flow correctness/testability | **Must fix before adding more timed flow** | Timer callbacks have no generation/stage identity, and the state machine is distributed through module globals and DOM handlers. The narrow stale-callback race and terminal transitions are not deterministically tested. |
| TDV3-05 | P1 presentation correctness | **Must fix before final copy approval** | The Closing Time card promises “all four lives” even though lives carry between stages; other teaching numbers are duplicated as prose. |
| TDV3-06 | P1 visual-test validity | **Must fix before treating goldens as a release gate** | Overlay fixtures deliberately do not focus their card, while production does. The goldens omit the visible user-agent focus outline present in the real flow. Browser provenance/CI remain unpinned. |
| TDV3-07 | P1 conditional startup/CSP | **Blocker only for a restrictive host policy** | Font setup injects inline CSS and viewer listeners wait behind a three-second font gate, leaving an apparently actionable but temporarily inert shell on a slow request. |
| TDV3-08 | P2 maintainability | Cleanup | The renderer remains a 1,602-line stateful scene, effects, UI, and HUD owner with two scenario authorities. Extract after flow correctness is locked. |
| TDV3-09 | P2 responsive/visual polish | Cleanup before broader device claims | “Supported” means width only; a wide touch-only device still receives keyboard gameplay, and the one-item stage facts grid is visibly left-heavy. |
| TDV3-10 | P2 performance | Measure, then clean up | Full scene repaint/snapshot work continues behind most overlays and stage replay reconstruction is synchronous. Current authored loads do not establish a player-visible regression. |

In short: TDV3-01 and TDV3-02 are the blockers. TDV3-03 through TDV3-07
are bounded correctness or test-validity fixes. Renderer splitting,
micro-optimization, and small responsive composition work should not delay
those fixes.

## Verification snapshot

At the reviewed combined tree:

- `npm test --workspace=@arcadebench/maltline`: **270/270 passed** across 17
  files.
- `npm run test:visual --workspace=@arcadebench/maltline`: **33/33 passed** with
  exact pixel comparison.
- `npm run build --workspace=@arcadebench/maltline`: **passed** with TypeScript
  and Vite 8.2.1; emitted JS is about 61.7 kB and CSS about 4.8 kB before gzip.
- `git diff --check`: **passed**.
- The visual set contains **19 PNGs / 6,141,723 bytes**. The flow montage and a
  separately captured live title/instruction/countdown montage were inspected.
  At 1280×720, card hierarchy and contrast are sound with no clipping.
- The live capture revealed an important parity gap: production's programmatic
  card focus produces a thin browser-default outline, while deterministic
  overlay fixtures omit it.
- A static-server subpath probe loaded the generated HTML at
  `/games/maltline/dist/src/viewer/index.html` with status 200, but the emitted
  `/assets/index-*.js` request returned 404; the physically nested asset was
  present at `/games/maltline/dist/assets/index-*.js`. Root hosting can work,
  but a route assembler or explicit base contract is required.

The green suites are meaningful local evidence, but they do not refute the
transition-announcement, interruption chaining, stale-timer generation, or
deployment findings below because those paths are not asserted.

## Severity-ranked findings

### TDV3-01 — The package build is not a deployable Maltline route

**Severity:** P0 release integration. **Blocker before publishing Maltline.**

Evidence:

- Maltline's Vite input is the nested production HTML and no deployment `base`
  is declared (`games/maltline/vite.config.ts:11-16`). The reviewed build emits
  `dist/src/viewer/index.html` with root-absolute JS and CSS references at
  generated lines 10-11; font URLs in the JS are root-absolute too.
- The site assembler knows only Partition: it validates and copies
  `games/partition/dist`, promotes Partition to `/`, and creates `/partition/`
  (`scripts/build-site.mjs:6-25`). It never reads or copies Maltline's HTML or
  hashed assets.
- Root `check` builds every workspace, but `build:site` rebuilds and assembles
  only Partition (`package.json:13-16`). CI uploads `dist/site`, so a green
  Maltline package build still contributes nothing to the deployable artifact.
- The Playwright “production” helper opens Vite source at `/src/viewer/`
  (`games/maltline/tests/visual/maltline.visual.spec.ts:78-82`), and its server
  is `npm run dev:visual` (`games/maltline/playwright.config.ts:46-50`).
- The fast boundary test builds in memory and searches chunk strings
  (`games/maltline/tests/viewer-boundary.test.ts:6-24`); it does not serve the
  written HTML or request its assets.

Root-absolute assets are not inherently wrong: ArcadeBench currently uses a
shared origin-root asset directory for Partition. The debt is that Maltline has
no declared integration strategy. Naively mounting its `dist` directory below
`/maltline/` fails; blindly merging two `assets/` trees also needs collision and
stale-file rules.

**Bounded fix:** add Maltline to the site assembler with an explicit permanent
route and one asset policy: either merge hashed assets into the shared root or
build with a route-specific base. Promote/copy the generated entry to
`/maltline/index.html`; do not publish `src/viewer` as the public contract. Add
a preview mode that serves the exact assembled artifact.

**Focused acceptance tests:**

1. `build:site` produces `/maltline/index.html`, its JS/CSS, and all four fonts.
2. Load `/maltline/` from the assembled preview and fail on every console error,
   page error, failed request, or HTTP 4xx/5xx.
3. Assert every resource URL resolves inside the artifact and no fixture entry
   or fixture runtime marker is shipped.
4. Run the same smoke with the actual redirect/header rules, a trailing slash,
   and a direct refresh of `/maltline/`.
5. Define asset collision/stale cleanup behavior when Partition and Maltline are
   assembled in either order.

### TDV3-02 — Focus exists, but timed flow changes are not an announcement contract

**Severity:** P0 accessibility. **Blocker before claiming the flow accessible.**

Evidence:

- The shell correctly gives the overlay card `role="dialog"`, a heading-based
  name, and programmatic focus (`games/maltline/src/viewer/shell.ts:51-58,98-101`).
  `showOverlay()` then mutates that same focused node in place
  (`shell.ts:147-163`). The card and its changing title have no `aria-live` or
  status role.
- Countdown changes `3 → 2 → 1 → SERVE` on 650/350 ms timers
  (`games/maltline/src/viewer/main.ts:194-210`). Refocusing an element that is
  already focused is not a reliable screen-reader announcement mechanism.
- Stage clear is replaced after two seconds (`main.ts:238-249`). A player using
  speech, magnification, cognitive accommodations, or simply slower reading
  may lose the score/walkout result before finishing it. Countdown timing is an
  essential game affordance; stage-clear disappearance is not.
- The card's `aria-describedby` names body and hint but not the instruction list
  (`shell.ts:52-57`). The list is present in the accessible subtree, but it is
  not guaranteed to be included in the initial focused-dialog announcement.
- `syncAccessibleSurfaces()` hides Canvas and semantic/live status during an
  overlay, but footer controls stay exposed whenever width is supported
  (`shell.ts:103-112`). On the title and stage cards, assistive technology can
  therefore encounter “F / ENTER slide shake” while Enter actually advances
  the flow (`shell.ts:68-76`; `main.ts:328-356`).
- Browser coverage checks static accessible names/content and focus
  (`tests/visual/maltline.visual.spec.ts:380-426,558-574`), not whether a timed
  mutation is announced or whether stage-clear remains available.
- Terminal events are not sent to the live announcer after the screen changes:
  event delivery is gated on `screen === 'playing'`
  (`main.ts:447-451`). The overlay must therefore carry the entire transition
  announcement, but currently has no live transition mechanism.

**Bounded fix:** keep one visible dialog and exact pixels, but add a dedicated
flow announcement/status node whose text changes once per meaningful screen or
countdown step. Include the instruction list in the dialog description or move
focus to a heading/list pattern that is demonstrably announced. Hide or relabel
the footer's inactive control semantics while an overlay owns input. Make stage
clear user-advanced; if auto-advance remains, provide a pause/extend mechanism
and a duration justified by the host accessibility policy.

**Focused acceptance tests:**

1. Observe exactly one semantic announcement for instructions, stage card,
   stage clear, game over, and victory; prove repainting does not repeat it.
2. Advance a fake countdown and assert one coherent announcement policy—either
   each number or a single “get ready/serve”—without live-region flooding.
3. Assert the focused instruction dialog's computed accessible description
   contains all four control rows.
4. Keep stage clear present beyond two seconds until explicit input, or test the
   selected accessible timing control.
5. During every overlay, assert Canvas, play status, and inactive footer
   semantics are absent; during play, assert the dialog is hidden and inert.
6. Add a focused overlay golden with a deliberate CSS focus treatment rather
   than relying on the browser default.

### TDV3-03 — Later interruptions erase the original cause

**Severity:** P1 viewer correctness. **Must fix before eligibility is surfaced
to ranked/session UI.**

Evidence:

- `interruptRun()` accepts both `playing` and already `interrupted` screens
  (`games/maltline/src/viewer/main.ts:283-302`). Blur, visibility, width, and
  clock-hitch paths can therefore invoke it repeatedly (`main.ts:379-417`).
- `MaltlineRunEligibility.interrupt()` always replaces `interruptionReason`
  (`games/maltline/src/viewer/viewer-session.ts:19-25`). A hitch followed by a
  blur changes the public status and overlay from “browser fell behind” to
  “window lost focus,” even though the hitch was the event that first made the
  run ineligible. `droppedMs` remains, creating a mixed snapshot.
- Existing tests cover one reason at a time
  (`tests/visual/maltline.visual.spec.ts:248-378`) and never chain hitch → blur,
  hidden → narrow, or repeated interruptions before resume.

This does not alter replay input or score, but it makes the diagnostic and any
future submission explanation unstable.

**Bounded fix:** define the invariant explicitly. Prefer preserving a primary
first cause plus accumulated diagnostics, or make interruption history an
ordered viewer-only list. An already-interrupted run should clear anchors/keys
without replacing its visible primary cause. `reset()` must clear the complete
viewer-only record.

**Focused acceptance tests:**

1. Trigger hitch, then blur, and assert the primary reason/dropped time remain
   attributable to the hitch.
2. Trigger hidden, unsupported width, and focus restoration in sequence; assert
   no duplicate overlay announcements and no eligibility reset.
3. Restart from the chained state and assert reason/history/dropped time, held
   keys, timer, tick, inputs, FX, and replays all return to their fresh values.

### TDV3-04 — Timers are cancelable, but not generation-safe or reducer-tested

**Severity:** P1 latent race and maintainability. **Must fix before adding more
timed states, pause menus, or asynchronous session submission.**

Evidence:

- `screen`, `stageIndex`, engine/run contexts, replay arrays, focus state, and a
  single timer handle are independent module globals
  (`games/maltline/src/viewer/main.ts:36-70`). State transitions are spread
  across `showStageCard`, `openInstructions`, `startFreshRun`, `enterPlaying`,
  countdown callbacks, stage-clear callbacks, and keyboard/environment handlers
  (`main.ts:151-266,315-417`).
- Countdown callbacks guard only `screen === 'countdown'`
  (`main.ts:194-210`). They do not capture a run generation, stage ID, or
  countdown generation.
- `clearTimeout()` normally prevents a pending callback, but a callback already
  queued near its deadline can outlive cancellation. If the player restarts and
  begins a new countdown before that stale task runs, the old callback sees the
  new `countdown` screen as valid, advances the wrong generation, and can
  overwrite `presentationTimer`, leaving two timer chains.
- Countdown cancellation on blur/hidden/width is duplicated in three listeners
  (`main.ts:379-417`). Stage-clear timers intentionally continue while hidden,
  so policies are state-specific but not represented in one transition table.
- The browser test proves ordinary automatic countdown and manual skipping
  (`tests/visual/maltline.visual.spec.ts:169-246`). There is no injected
  scheduler, queued-callback test, or direct live transition to stage clear,
  next-stage card, game over, or victory. Terminal fixtures call copy helpers
  directly and bypass the controller (`visual-fixtures.ts:235-255,514-516`).

**Bounded fix:** extract a small viewer-only `FlowController` or pure reducer.
Inputs should be semantic events (`ADVANCE`, `RESTART`, `COUNTDOWN_ELAPSED`,
`STAGE_WON`, `RUN_LOST`, `ENVIRONMENT_UNAVAILABLE`) and outputs should be
effects (`constructStage`, `showCard`, `schedule`, `cancel`, `beginSimulation`).
Inject a scheduler and attach a monotonic generation token to every scheduled
effect. Keep engine state and wall time outside each other.

**Focused acceptance tests:**

1. Exhaustively test legal screens/events and assert illegal/stale events no-op.
2. Queue a countdown callback, restart, begin a new countdown, then release the
   stale callback; it must not change the new number or timer ownership.
3. Repeat for stage-clear auto-advance followed by restart.
4. For every overlay/countdown state, advance fake RAF and fake timers and assert
   tick/input/replay counts remain frozen.
5. Drive real `stage_cleared` and `game_lost` events through the adapter; assert
   replay count, carried score/lives, next scenario, focus, and terminal copy.
6. Verify a final-stage clear shows stage clear once, then victory once, and
   restart reconstructs Stage 1 rather than reusing the won engine.

### TDV3-05 — Stage teaching copy can contradict carried run state

**Severity:** P1 player-facing correctness. **Must fix before final copy
approval.**

Evidence:

- Lives and score are deliberately carried into stages 2–8
  (`games/maltline/src/viewer/main.ts:227-245`).
- The Closing Time brief says “Protect all four lives through the final order”
  (`games/maltline/src/viewer/gameplay-flow.ts:53-56`), but a player may arrive
  with one, two, or three lives. The stage-card helper accepts scenario/index,
  not current state or run context (`gameplay-flow.ts:89-107`).
- Jar Shortage hardcodes “four jars,” and first-run copy hardcodes four lives
  (`gameplay-flow.ts:41-43,63-85`). Those values match the current authored
  campaign but duplicate authoritative scenario/run data.
- The copy test protects the literal duplication rather than the invariant:
  it expects “four jars” and the final-order phrase
  (`games/maltline/tests/gameplay-flow.test.ts:31-42`).

**Bounded fix:** keep authored qualitative briefs, but pass a small
presentation context containing current lives and derive numeric facts from
scenario/state. Closing Time should say “protect your remaining lives” or name
the actual count. Title/instructions may derive the new-run life count from
Stage 1.

**Focused acceptance tests:**

1. Render every stage card with 1, 2, 3, and 4 carried lives; no card may claim
   more lives than the state contains.
2. Change a cloned scenario's jar pool/lives and assert its copy follows the
   data without editing prose tables.
3. Preserve the current campaign's approved visible copy where the derived
   values are unchanged.

### TDV3-06 — Overlay goldens omit production focus and flow ownership

**Severity:** P1 visual-regression validity. **Must fix before screenshots are
a release gate.**

Evidence:

- Production's wrapper calls `shell.showOverlay(..., true)` by default
  (`games/maltline/src/viewer/main.ts:113-115`), and the shell focuses the card
  (`shell.ts:98-101,147-163`).
- Fixture rendering calls `shell.showOverlay(fixture.overlay)` without focus
  (`games/maltline/src/viewer/visual-fixtures.ts:514-516`). The inspected live
  frames show a thin default outline around title, instructions, and countdown;
  their fixture goldens do not.
- The parity signature checks shared source marker, fonts, outer structure, and
  gross layout only (`tests/visual/maltline.visual.spec.ts:509-548`). It omits
  active element, overlay variant, computed card/focus styles, accessible
  surface state, and pixels.
- Flow goldens are authored static records; only Stage 1 card and countdown `3`
  exist (`visual-fixtures.ts:216-234`). No golden covers `SERVE`, a later-stage
  card with carried lives, the timing-interrupted dialog, or the actual
  production transition output.
- Fixture names are repeated in a type, runtime list, and Playwright list
  (`visual-fixtures.ts:26-79`; `tests/visual/maltline.visual.spec.ts:4-22`).
- Exact comparison uses a mutable system Chrome executable
  (`games/maltline/playwright.config.ts:3-4,15-20`), and the root CI `check`
  does not invoke Maltline's separate `test:visual` script
  (`games/maltline/package.json:12-17`; `package.json:13-16`).

**Bounded fix:** define and style overlay focus deliberately, then make fixture
focus match production and regenerate only the overlay family. Export one typed
fixture registry and derive the URL validator, screenshot cases, and expected
baseline inventory. Add a live-flow screenshot or a controller-produced fixture
state so static fixtures cannot drift from flow ownership. Pin browser/image
identity before enabling CI gating.

**Focused acceptance tests:**

1. Assert production and fixture overlay active element, variant, computed
   outline, `aria-hidden`/`inert`, and screenshot are equal for title.
2. Add focused exact images for instruction, later-stage card, countdown
   `SERVE`, interruption, stage clear, game over, and victory.
3. Assert registry keys equal screenshot cases and PNG filenames exactly; reject
   orphan and missing baselines.
4. Fail before pixel comparison when browser version/container identity differs
   from a checked-in baseline manifest.

### TDV3-07 — Font readiness is resilient but still blocks interaction and strict CSP

**Severity:** P1 conditional startup/integration. **Blocker only when the host
adopts restrictive CSP/Trusted Types; otherwise bounded launch hardening.**

Evidence:

- The shell mounts, then module evaluation awaits font preparation before the
  renderer and every input/environment listener are created
  (`games/maltline/src/viewer/main.ts:28-34,315-423`).
- The shell's initial HTML already says “Press Enter to open the shop”
  (`games/maltline/src/viewer/shell.ts:51-58`). A slow font request can therefore
  present an apparently actionable dialog for up to the 3,000 ms timeout while
  no key handler exists (`games/maltline/src/viewer/fonts.ts:16,44-63`).
- Failure is now correctly caught and diagnosed, definitions are removed, and
  fallback play continues (`fonts.ts:71-89`; browser test at
  `tests/visual/maltline.visual.spec.ts:497-507`). This resolves TD-02's fatal
  font-failure concern, but the test simulates an immediate bad response, not a
  timeout with attempted input.
- Font definitions are installed with runtime `<style>.textContent`
  (`fonts.ts:27-38`). A CSP without `style-src 'unsafe-inline'` or a nonce blocks
  them. A Trusted Types policy with `require-trusted-types-for 'script'` can
  also block the shell's `template.innerHTML` sink (`shell.ts:41-79`).
- Current production headers do not set CSP (`deploy/_headers:1-8`), so this is
  a conditional boundary rather than a current outage.

**Bounded fix:** show an honest loading state until controls are owned, or attach
safe flow input before font verification and explicitly gate it. Move static
`@font-face` rules into Vite-bundled CSS; retain JS readiness checks and the
fallback diagnostic. Decide the platform CSP/Trusted Types contract before
launch rather than adding broad `unsafe-inline` exceptions later.

**Focused acceptance tests:**

1. Hold all font responses past three seconds, press Enter during the wait, and
   assert the UI either declares loading or handles the input exactly once after
   readiness—never silently ignores an apparently valid action.
2. Serve built production with the intended CSP and assert no violation events,
   console errors, or font fallback.
3. Block one font under CSP/network failure and assert the diagnosed fallback
   remains keyboard-playable.
4. If Trusted Types will be required, mount the shared shell under that policy
   without an unapproved HTML sink.

### TDV3-08 — Decompose flow first, then presentation policy, then leaf painters

**Severity:** P2 maintainability. **Cleanup, not a current pixel blocker.**

Evidence:

- `renderer.ts` remains 1,602 lines. One class owns retained effects and
  dependencies (`141-165`), scenario geometry (`167-189`), event translation
  (`191-285`), time integration (`287-312`), scene orchestration (`314-345`),
  every environment/actor/UI painter (`349-1532`), and HUD (`1534-1594`).
- Scenario ownership is duplicated: `setScenario()` stores scenario-derived
  lane height (`renderer.ts:167-170`), `pushEvents()` consults the stored
  scenario (`191-229`), while `draw()` accepts another scenario argument
  (`314-345`). The live callers align them, but the API permits inconsistent
  event geometry and painting.
- Semantic action priority is separately encoded in
  `semantic-status.ts:9-32` and Canvas UI painters around
  `renderer.ts:1068-1378`. Copy/priority can drift despite current focused
  tests.
- Command-recorder tests are useful, but most compare two renderings generated
  by the same implementation (`tests/renderer-presentation.test.ts:86-136,
  244-287`). They do not commit per-fixture command digests that would protect
  a large mechanical extraction independently of browser rasterization.

**Incremental, pixel-preserving path:**

1. Extract the viewer flow reducer/scheduler in TDV3-04 first. Renderer splitting
   cannot repair state races.
2. Derive a pure `MaltlinePresentationModel` containing action priority, labels,
   resolved-order count, jar summary, display lists, and meta from one
   `(scenario, state, meta)` input. Feed both Canvas and semantic status from it.
3. Make one immutable scenario/layout object authoritative. Remove either
   `setScenario` or the scenario argument from `draw`; make mismatch impossible.
4. Extract `PresentationEffects` as a bounded reducer plus update method. Keep
   effect ordering and keyed entropy intact.
5. Extract leaf painters in current draw order: background/environment,
   actors/projectiles, station/player/action/jars, transient effects, then HUD.
   Do not reorganize layers while moving code.

**Acceptance tests for every extraction:**

1. Preserve all exact screenshots, focused-overlay screenshots, semantic text,
   and replay/proof fingerprints.
2. Commit command digests for every renderer fixture before moving painters;
   fail on command order, coordinates, styles, and rendered text.
3. Add a compile-time or runtime test that scenario mismatch is impossible.
4. Exercise the presentation model without Canvas for idle, blending, ready,
   no-clean-jar, rescue, each loss, stage clear, game over, and victory.
5. Keep each extraction reviewable: one ownership boundary per change, no
   simultaneous art redesign.

### TDV3-09 — Device support and one-card composition need explicit contracts

**Severity:** P2 UX/responsive cleanup. **Not a desktop blocker.**

Evidence:

- Supported-device state is only `innerWidth >= 700`
  (`games/maltline/src/viewer/shell.ts:115-124`). The unsupported copy also says
  a keyboard is required (`shell.ts:60-65`), but no capability or alternate
  input path exists. A 700+ px touch-only tablet is classified playable and
  receives no usable controls.
- The width contract is duplicated between TypeScript's 700 constant
  (`shell.ts:1-2`) and CSS's 699 px query
  (`games/maltline/src/viewer/style.css:235-255`). Current 699/700 tests catch
  behavior but not source-token drift.
- Browser geometry covers 1280×720 screenshots, 1024×768, and the 699/700 and
  390×844 paths. It still omits short landscapes, DPR 2, 200% zoom, and wide
  touch-only environments (`tests/visual/maltline.visual.spec.ts:315-378,
  591-650`).
- `.overlay-steps` always uses two columns
  (`style.css:148-170`). Stage cards provide one facts row
  (`gameplay-flow.ts:103-105`), so the inspected card leaves its right half
  empty and looks unintentionally left-weighted.

**Bounded fix:** describe support as a layout contract plus required input, not
as device detection. Either add touch controls as a separately designed mode or
keep a clear keyboard-required gate/launcher choice for touch users. Enforce the
duplicated breakpoint with a source test. Let a one-item facts list span both
columns; preserve the established card style.

**Focused acceptance tests:**

1. Define behavior for 844×390 and 1024×600 touch-primary devices with no
   hardware keyboard assumption.
2. Add 700×500, 800×600, DPR 2, and zoom/large-text geometry checks.
3. Assert source CSS and TypeScript breakpoint values agree.
4. Add component geometry assertions that instruction rows and one-item stage
   facts do not overlap and use the intended card width.

### TDV3-10 — Runtime work is acceptable but not yet measured

**Severity:** P2 performance cleanup. **Profile before optimizing.**

Evidence:

- Every supported RAF updates presentation, snapshots state, redraws the full
  Canvas, derives semantic status, and republishes a frozen global status even
  on title/cards/terminal overlays (`games/maltline/src/viewer/main.ts:427-464`).
- A simulation frame can already receive a state snapshot from every engine
  step, then calls `engine.snapshot()` again for painting (`main.ts:441-457`).
- Stage completion synchronously reruns all recorded inputs through
  `replayMaltline()` before showing the card (`main.ts:146-149,238-245`). Long
  authored stages can therefore add transition latency exactly when feedback
  should appear.
- Renderer painters recreate gradients/paths on every frame and filter flashes
  per lane (`renderer.ts:349-375,446-572`). Counts are small in the authored
  campaign; optimization without profiling risks pixel churn for little gain.

**Bounded fix:** first record frame/transition budgets on representative low-end
hardware. If needed, render static background layers to an offscreen surface,
skip redundant semantic/global writes, use the latest step state instead of an
extra snapshot, and defer replay verification until after immediate stage
feedback. Keep replay generation deterministic and never move wall time into the
engine.

**Focused acceptance tests:**

1. Record p50/p95 frame time and allocations for Stage 1, Happy Hour rush,
   no-clean-jars, and failure bursts at 1280×720 and 700 px.
2. Measure stage-clear input replay reconstruction separately and set a bounded
   transition budget.
3. Assert title/card RAF does not rewrite unchanged semantic DOM or global
   status objects unnecessarily.
4. Require exact pixel and command-digest equality for any caching change.

## Recommended order

1. Integrate and smoke the assembled production artifact (TDV3-01), because no
   other viewer quality matters if the public route cannot load.
2. Repair overlay transition announcements, stage-clear timing, and inactive
   semantics (TDV3-02).
3. Preserve interruption causality and extract the generation-safe flow reducer
   with a fake scheduler (TDV3-03/04).
4. Derive numeric stage copy from the active run and bring focused fixtures into
   production parity (TDV3-05/06).
5. Resolve font/CSP startup against the actual host policy (TDV3-07).
6. Lock command digests, then decompose presentation/renderer incrementally
   (TDV3-08).
7. Treat wider device support and performance work as evidence-driven cleanup
   (TDV3-09/10).

This order preserves current desktop pixels except where the accessibility
focus state is deliberately styled and reviewed. It also keeps all changes in
the viewer/presentation boundary, leaving campaign numbers, engine rules,
replays, and proofs untouched.

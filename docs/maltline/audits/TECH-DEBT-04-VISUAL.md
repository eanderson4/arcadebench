# Maltline visual/viewer/site technical-debt review 04

**Date:** 2026-09-10
**Scope:** settled EXP-036/037 worktree; viewer flow and accessibility,
direction adapter integration, stage-clear advancement, deterministic visual
fixtures, assembled `/maltline/` route, font/CSP startup, device policy, and
renderer boundaries. This was a read-only product audit; only this report was
created.

## Verdict

EXP-036/037 closed the earlier obvious failures. Direction taps no longer
disappear between cadence ticks, interruptions reset queued input, timed cards
do not step the engine, stage clear no longer disappears after two seconds, the
flow has a dedicated throttled status region, and the assembled Maltline route
is correctly route-scoped in the build inspected here.

One viewer correctness blocker remains: presentation actions accept native
keyboard-repeat events. A single held Enter can cross several screens, and an
Enter held while the final shake resolves can advance a supposedly manual
stage-clear card without a fresh player action. Two release-process blockers
also remain before the exact screenshots and built route can be treated as
continuous gates: Playwright is not invoked by CI, and no checked test opens the
assembled `/maltline/` artifact.

The remaining FlowController and renderer extractions are worthwhile cleanup,
not reasons to withhold the current prototype. Font/CSP and wide touch-device
issues become blockers only if the site adopts restrictive CSP or claims those
devices/accessibility combinations as supported.

| ID | Severity | Classification | Finding |
| --- | --- | --- | --- |
| TDV4-01 | P0 viewer correctness | **Blocker before calling stage clear explicitly user-advanced** | Flow key handling accepts `KeyboardEvent.repeat`, so one held Enter cascades through screens. |
| TDV4-02 | P0 release evidence | **Blocker before treating goldens as a merge gate** | The exact Playwright suite is a separate script and is not run in CI; its system Chrome is documented but not provisioned or verified there. |
| TDV4-03 | P1 built-site evidence | **Blocker before public-route signoff** | CI assembles and structurally checks `/maltline`, but no automated browser opens that artifact or checks its deployed resource/header behavior. |
| TDV4-04 | P1 accessibility | **Conditional blocker before a screen-reader conformance claim** | The live-region policy is tested at DOM-mutation level, but the focused dialog's accessible name still changes for `3/2/1/SERVE`, which may create extra AT announcements. |
| TDV4-05 | P1 flow robustness | Latent correctness risk; bounded with FlowController work | Countdown callbacks use one mutable timer handle and screen-name guard, without a generation token or injected scheduler test. |
| TDV4-06 | P1 control feel | Known incomplete P1-07 work, not a regression | Direction buffering is sound; serve-before-READY remains unbuffered and can still be lost at the blend-completion edge. |
| TDV4-07 | P1 conditional startup/security | **Blocker only when strict CSP/startup responsiveness is required** | Font definitions are injected as inline style and all viewer input waits behind a three-second font gate. |
| TDV4-08 | P1 conditional device support | **Blocker for wide touch-only support; otherwise deferred** | “Supported” means only `innerWidth >= 700`, although the UI requires a keyboard; short-height/reflow coverage is also absent. |
| TDV4-09 | P2 visual-test maintenance | Cleanup | Live proof-driving helpers hard-code generation-2 timing, and all pixel goldens run under one reduced-motion/system-Chrome environment. |
| TDV4-10 | P2 architecture/performance | Cleanup | The 1,602-line renderer and 465-line viewer entry still combine layout, drawing, FX, scheduling, focus, replay capture, and flow transitions. |

## Evidence rerun

The following checks were rerun against the settled tree:

- Focused Vitest: `gameplay-flow`, `viewer-input-adapter`, `fonts`, and
  `viewer-boundary`: **4 files / 24 tests passed**.
- Full Playwright: **37/37 passed**, including all 19 exact PNG comparisons,
  production smoke, direction buffering, flow announcements, frozen stage
  clear, interruption/reset cases, parity, and responsive geometry. The seven
  highest-risk cases also passed as an isolated focused run.
- `npm run build:site`: **passed**. Partition and Maltline built, then the site
  assembled successfully.
- A browser opened the assembled `dist/site/maltline/index.html` through a
  static HTTP server. `/maltline/` returned **200**; CSS, JS, and all four Noto
  Sans weights returned without page, console, request, HTTP, or CSP violation;
  every resource path was under `/maltline/assets/`; fonts reported ready; no
  fixture runtime marker was present. `/maltline` redirected to
  `/maltline/` under the local static server.
- Representative full-size title plus a montage of instructions, first-pour
  play, truthful stage clear, and unsupported portrait were inspected. Copy,
  action hierarchy, focus-safe card bounds, and route rendering remain coherent.
- All 19 present PNGs have distinct SHA-256 hashes. The full exact run
  passed without updating them. The current documented raster environment is
  Google Chrome `143.0.7499.169`, Playwright `1.63.0`, Noto Sans `5.3.0`, DPR 1,
  UTC, en-US, sRGB, and reduced motion
  (`tests/visual/README.md:21-45`; `playwright.config.ts:13-44`).

## Blockers

### TDV4-01 — Held Enter defeats deliberate flow and stage-clear advancement

**Severity:** P0 viewer correctness. **True blocker before P2-14/manual stage
clear is considered complete.**

The root keydown handler transitions on every Enter or Space event without
checking `event.repeat` (`src/viewer/main.ts:307-349`). The direction adapter
correctly deduplicates native repeats because its held-code set ignores a second
keydown (`viewer-input-adapter.ts:60-77`), but overlay commands bypass that
adapter.

A live browser probe dispatched one initial Enter keydown followed by three
events with `repeat: true`; the observed screens were:

```text
title → instructions → stage-card → countdown → playing
```

The same mechanism affects stage clear. If Enter launches or is held while the
last order finishes, later OS repeat events can hit the `cleared` branch and
open the next stage even though the player never released and freshly pressed
the key. This is not a timer bug, but it violates the intended explicit-advance
contract. It can also skip readable instruction and stage cards.

**Bounded fix:** reject `event.repeat` for all presentation transitions and
restart commands. Prefer a tiny fresh-press latch shared by Enter and Space so
an alias chord cannot substitute repeat events across a transition. Do not
change live `serve` edge semantics in the same patch.

**Acceptance tests:**

1. Initial Enter moves title to instructions; any number of repeat keydowns
   leave it there. A keyup plus fresh keydown advances exactly once.
2. Repeat the assertion across instructions, stage card, countdown skip, game
   over, victory, interruption, and restart.
3. Hold Enter during the final successful input path: stage clear remains
   visible after repeat events and advances only after keyup plus a fresh
   keydown.
4. Confirm no ticks or replay inputs are added by rejected repeats.

### TDV4-02 — Exact goldens are local evidence, not a continuous gate

**Severity:** P0 release evidence. **True blocker before claiming exact visual
regression protection on pull requests. It does not block local play.**

The suite itself is strong: browser/page/request/HTTP failures are collected
for each test (`tests/visual/maltline.visual.spec.ts:25-77`), fixtures inject
time and seeded randomness (`visual-fixtures.ts:485-522`), and screenshots use
zero differing pixels (`playwright.config.ts:13-20`). Production and fixture
shell/font parity is also checked (`maltline.visual.spec.ts:738-777`).

However, the workspace's default `test` script runs only Vitest while
Playwright is separate (`games/maltline/package.json:11-18`). CI runs
`npm run check` and `npm run build:site`, but never `test:visual`
(`.github/workflows/ci-cd.yml:45-55`). The config launches a host executable at
`/opt/google/chrome/google-chrome` or an unrestricted environment override
(`playwright.config.ts:3-4,31-44`). The README records the current browser
version, but neither the config nor CI verifies it
(`tests/visual/README.md:32-45`). A green local exact run therefore does not
prevent a pull request from changing pixels or omitting baselines, and a future
runner browser update can create unexplained raster churn.

**Bounded fix:** add a CI visual job using one explicitly installed/pinned
Chrome-for-Testing or Playwright Chromium revision, verify its version before
the run, cache only immutable browser artifacts, and upload diff output on
failure. Keep deliberate baseline updates as a separate local command.

**Acceptance tests:**

1. A one-pixel fixture change fails a pull request with a retained diff image.
2. Missing or extra baselines fail rather than being silently generated.
3. Browser-version mismatch fails before comparisons begin.
4. The exact 19-image suite passes twice on a clean Linux checkout.

### TDV4-03 — The assembled route is not exercised by an automated browser

**Severity:** P1 release integration. **True blocker before signing off the
public `/maltline/` route, not a present runtime failure.**

The Vite build now emits root-absolute `/maltline/` URLs
(`games/maltline/vite.config.ts:4-19`). The assembler copies only the production
entry and route-specific assets, rejects a fixture marker, extracts route asset
references, and verifies each referenced file exists
(`scripts/build-site.mjs:35-75`). CI does execute this assembler. Hashed
Maltline assets also receive an immutable cache rule
(`deploy/_headers:1-10`). These are meaningful improvements, and the manual
browser smoke in this audit passed.

No committed test serves `dist/site`, opens `/maltline/`, follows `/maltline`
slash behavior, or verifies the browser-visible fonts/resources. Current
Playwright uses the Vite source server and `/src/viewer/`
(`playwright.config.ts:23-50`; `maltline.visual.spec.ts:79-83`). The structural
scan also cannot validate server MIME types, `_headers` behavior, CSP headers,
or Worker-first asset routing (`wrangler.jsonc:18-23`; platform worker fallback
at `apps/platform/src/worker.ts:557-576`).

**Bounded fix:** add one assembled-site Playwright project after `build:site`.
Serve with the closest practical Workers Assets/Wrangler preview, not only a
generic source server. Keep it a smoke test rather than duplicating all fixture
goldens.

**Acceptance tests:**

1. `/maltline` has a defined redirect/canonical result and `/maltline/` returns
   the production title on direct navigation and refresh.
2. JS, CSS, and four fonts return 200 with expected MIME/cache headers and only
   `/maltline/assets/` paths.
3. The viewer reaches `data-maltline-viewer-ready=true`, all font checks pass,
   the canvas paints, and no fixture marker or source-only path is requested.
4. Console, page, request, HTTP, CSP-violation, and mixed-content failures fail
   the job.

## Conditional blockers and bounded follow-ups

### TDV4-04 — Countdown announcement policy is not yet proven at the AT layer

**Severity:** P1 accessibility. **Conditional blocker before claiming tested
screen-reader behavior.**

The dedicated polite/atomic flow region is correctly exposed only while an
overlay owns interaction (`shell.ts:78-80,109-120`). Presentations provide one
message per screen; countdown `2` and `1` intentionally omit announcements
(`gameplay-flow.ts:115-130`). Browser coverage proves the region has zero writes
for `2/1` and one for `SERVE`, verifies full instruction description, and hides
the inactive footer (`maltline.visual.spec.ts:349-400`). This resolves the prior
static-only semantic gap.

The dialog remains focused while `overlay-title`, its accessible name source,
mutates from `3` to `2`, `1`, and `SERVE` (`shell.ts:156-183`; `main.ts:184-200`).
Some screen-reader/browser combinations may announce those focused-name changes
in addition to the live status, despite the status node itself being throttled.
Automated DOM mutation counts do not measure spoken output. Likewise, moving
from supported to unsupported and back exposes an existing live-region string
without a new content mutation (`shell.ts:109-134`), with AT-dependent results.

**Bounded fix:** keep the visual number unchanged, but give the countdown dialog
a stable accessible name and make its changing numeral presentation-only for
AT; let the dedicated status own “Get ready” and “Serve.” Focus the dialog once
on countdown entry rather than treating every numeral as a new focus request.

**Acceptance tests:** stable accessible name/description across all four steps,
exactly the intended live-region mutations, resize-away/back semantics, plus a
short manual NVDA/Firefox and VoiceOver/Safari matrix recording what was spoken.

### TDV4-05 — Countdown callbacks have no transition generation

**Severity:** P1 latent flow correctness. **Not a reproduced browser failure;
fix with the bounded FlowController tranche.**

`presentationTimer` is one mutable global. Each callback clears that global,
checks only `screen === 'countdown'`, then advances its captured step
(`main.ts:70,110-114,184-206`). Every exit currently calls cancellation, and
JavaScript run-to-completion makes ordinary input/timer ordering safe. The gap
is that a stale callback has no run/stage/countdown identity. If a scheduler
ever delivers a canceled/queued callback after a restart and a new countdown
has begun, the stale closure can clear the new handle and advance the new
countdown. Existing browser tests use real timers or skip countdown with Enter;
they cannot invoke a retained stale callback deliberately
(`maltline.visual.spec.ts:174-187,332-347`).

**Bounded fix:** before a broad extraction, add a monotonically increasing
presentation epoch. Capture it in each callback; cancellation/transition bumps
it; callbacks with the wrong epoch do nothing and cannot clear a newer handle.
Then extract a viewer-only FlowController with injected scheduler and transition
effects, preserving current pixels and engine boundaries.

**Acceptance tests:** retain old callbacks, restart/start another stage, invoke
them in every order, and prove screen, stage, timer ownership, focus,
announcements, engine tick, recorded inputs, and eligibility do not change.

### TDV4-06 — Direction navigation is repaired; serve buffering remains separate

**Severity:** P1 control feel. **Known unfinished P1-07 behavior, not a defect
introduced by the direction adapter.**

The adapter now latches taps until the next eligible engine tick, waits three
authored intervals before held repeat, handles aliases/chords, and emits only
ordinary per-tick input (`viewer-input-adapter.ts:32-165`). Main samples it once
for each simulation tick and resets it at every relevant lifecycle boundary
(`main.ts:116-133,269-305,350-409,428-446`). Unit tests cover all modulo-five
phases, 30/60/144 Hz grouping, keyup, aliases, chords, and resets
(`tests/viewer-input-adapter.test.ts:25-194`). Browser tests cover live cadence,
restart, blur, hidden state, and 699/700 transitions.

Two limits remain:

- A new direction still waits until the core's next global repeat phase—up to
  four ticks, about 67 ms in generation 2. Taps are reliable, but onset latency
  is not literally identical at every phase.
- Blend and serve intentionally remain held levels
  (`viewer-input-adapter.ts:115-116`). A serve pressed just before READY can
  still be consumed by the engine's false-to-true edge before a shake exists.

The latter should remain a separate experiment because changing edge retention
affects human input semantics and emitted replay bytes. Add a short, explicit
serve-window policy and test pre-completion offsets, holding, release,
double-press, restart/interruption reset, and replay equivalence before adopting
it. Do not change core movement cadence merely to erase the remaining bounded
navigation latency without a ruleset decision.

### TDV4-07 — Font readiness still blocks startup and conflicts with future CSP

**Severity:** P1 conditional startup/security. **Current deployment has no CSP,
so this is not a present route failure.**

The shell mounts and then top-level module evaluation awaits font preparation
before installing controls or marking the viewer ready (`main.ts:31-37,307-465`).
The timeout is three seconds (`fonts.ts:16,44-63`). During a slow request, the
title-like shell exists but Enter does nothing. Failure becomes diagnosed and
playable, which is covered by unit and browser tests; the unresponsive waiting
interval is not.

Font faces are injected through an inline `<style>` element
(`fonts.ts:27-38`). A future CSP without `style-src 'unsafe-inline'` or a nonce
will reject them. Current headers do not declare CSP (`deploy/_headers:7-11`),
and the assembled route loaded all four fonts in this audit, so this is a
policy-dependent issue rather than evidence of current breakage.

**Bounded fix:** move static `@font-face` declarations into Vite-bundled CSS;
retain the readiness/fallback diagnosis. Install safe flow listeners before the
font await and expose a truthful loading state, or deliberately keep the card
inert and say so. Establish the intended CSP first.

**Acceptance tests:** delay all fonts beyond three seconds and press Enter
during the wait; test the chosen queued/disabled behavior. Run the built route
under intended CSP, assert no violation, then block one font and prove the
diagnosed system-font title remains operable.

### TDV4-08 — Width is being used as a proxy for keyboard capability

**Severity:** P1 conditional device support. **Blocker only if wide touch-only
devices are claimed as playable.**

The shell's support decision is exclusively `innerWidth >= 700`
(`shell.ts:123-134`). Below 700, the designed unsupported state is strong and
the 390×844 golden is readable (`style.css:235-331`; visual test
`maltline.visual.spec.ts:852-880`). At 700 or wider, a touch-only tablet is
admitted even though the copy and implementation require a keyboard. The only
supported geometry assertion is 1024×768 (`maltline.visual.spec.ts:829-850`);
short laptop windows, browser zoom/reflow, and wide landscape tablets are not
covered.

**Bounded fix:** define supported input capability explicitly. Either add
on-screen controls, or present a keyboard-required state when no usable input
path is established. Base layout gating on the actual game container and both
dimensions, not only global width.

**Acceptance tests:** 699/700 remains exact; add 700×400 and 1024×500 reflow,
200% zoom, wide touch-only emulation, keyboard attachment/change if supported,
and embedded-container geometry. No unsupported surface may tick or draw behind
it.

## Cleanup that should preserve exact pixels

### TDV4-09 — Fixture helpers encode current generation timing

The live stage-clear test imports the static proof, but its browser translation
hard-codes `% 5` and `1000 / 60`, then asserts tick 1558
(`maltline.visual.spec.ts:115-164,402-423`). That is valid for generation 2 but
will fail opaquely if an authored cadence or tick rate changes. The visual
fixture registry also repeats its union and name list
(`visual-fixtures.ts:26-79`). All browser contexts use `reducedMotion: 'reduce'`
and one system-Chrome platform (`playwright.config.ts:22-44`); fixture-level
renderer motion variation is useful, but full-motion CSS/runtime behavior has
no corresponding browser project.

**Bounded refactor:** derive proof-driving tick rate/cadence from the selected
authority scenario, derive fixture names from one typed registry, and separate
“exact Linux reduced-motion goldens” from small nonpixel full-motion assertions.
Do not multiply pixel baselines across browsers unless a product requirement
justifies their maintenance.

**Acceptance tests:** a test scenario with unequal station/lane cadences drives
the correct proof path; registry additions cannot omit screenshot coverage;
full-motion mode reports enabled motion while reduced mode suppresses it.

### TDV4-10 — Renderer and viewer entry remain oversized ownership boundaries

`MaltlineRenderer` is 1,602 lines. One mutable class owns FX lifecycle,
presentation entropy/time, coordinate conversion, every environment/entity
primitive, control rail, station bank, jar economy, player, callouts, vignette,
and HUD (`renderer.ts:90-340`, with drawing methods through line 1602). The
465-line `main.ts` owns campaign/run/replay state, clocks, flow scheduling,
focus, accessibility publishing, input listeners, interruption eligibility,
rendering, and the frame loop. The current tests control these responsibilities
well enough for the prototype, so size alone is not a release blocker.

**Pixel-preserving refactor path:**

1. Fix repeat-event flow correctness and add the countdown epoch first.
2. Extract a pure viewer flow reducer/controller returning commands such as
   cancel/schedule timer, reset input/clock, show/hide/focus surface, and
   begin/record stage. Keep engine state and DOM execution outside it.
3. Freeze canvas geometry/constants into one layout object and extract stateless
   draw modules in order: background, lanes/actors, station/player, HUD, then FX.
4. Keep particles/popups/callouts in one presentation-effects owner and inject
   its snapshot into drawing; do not distribute mutable FX across draw modules.
5. At every step require renderer command-recorder equality, all 19 exact PNGs,
   and production/fixture parity before proceeding.

## Recommended order

1. **Now:** reject repeated flow keydowns and add the held-Enter stage-clear
   regression (TDV4-01).
2. **Next release gate:** provision/version the browser and run exact visuals in
   CI (TDV4-02).
3. **Same gate:** add one built-site/Wrangler browser smoke for `/maltline/`,
   resources, fonts, redirects, and headers (TDV4-03).
4. **Accessibility pass:** stabilize countdown accessible naming and perform the
   two-combination manual AT check (TDV4-04).
5. **Small flow hardening:** add the presentation epoch and stale-callback tests,
   then extract FlowController without pixel changes (TDV4-05/TDV4-10).
6. **Independent control experiment:** specify and test serve buffering
   (TDV4-06).
7. **Before CSP/mobile claims:** move font faces to bundled CSS, decide startup
   interaction, and define actual supported input/device geometry
   (TDV4-07/TDV4-08).
8. **Incremental cleanup:** de-hard-code fixture helpers and split renderer draw
   modules behind existing deterministic command/pixel tests (TDV4-09/TDV4-10).

The shortest safe tranche is TDV4-01 alone. It is presentation/input-boundary
only, needs no FlowController extraction, does not alter engine rules or replay
formats, and should preserve every existing pixel.

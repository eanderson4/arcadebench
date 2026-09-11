# Maltline Visual and UX Baseline Audit

**Date:** 2026-09-10
**Task:** P0-03
**Scope:** Current Maltline viewer at the inherited `9058307` product state. No
product code was changed for this audit.

## Executive judgment

Maltline already has a recognizable and unusually cohesive prototype look: a
warm green, cream, brass, wood, and strawberry palette; expressive procedural
customers; readable left-to-right motion; and a good amount of environmental
craft. At desktop size, it resembles a real game rather than an engine demo.

The main gap is not more decorative art. The game currently gives scenery more
visual weight than decisions. Orders, the active lane, blend readiness, jar
economy, urgency, and especially the cause of a lost life are either tiny,
subtle, color-dependent, or transient. The title explains the rules once, but
live play does not teach or diagnose them. Narrow screens scale the entire
960×540 canvas until key labels are only a few CSS pixels tall and provide no
touch controls. The render also contains wall-clock and random effects, which
prevents trustworthy screenshot baselines and exact visual replay.

The best first investment is therefore a legibility and feedback pass backed by
a deterministic render-fixture harness. A wholesale art replacement would be
premature.

## Evidence gathered

- Read the complete viewer HTML, CSS, input loop, 1,324-line renderer, campaign,
  and engine event model.
- Ran the Vite viewer and captured title and live-play frames in headless Chrome
  at 1280×720 and 390×844.
- At 1280×720 the canvas is displayed at 980×551 CSS pixels (approximately
  1.02× its internal size). At 390×844 it is displayed at 374×211 (0.39×).
  Consequently, a 10–12 px canvas label becomes approximately 3.9–4.7 CSS px;
  the 24 px score becomes approximately 9.4 CSS px.
- The narrow document itself did not horizontally scroll, but the title card is
  clipped slightly by the stage and the top line crowds/wraps awkwardly. The
  much larger failure is effective content size, not document overflow.
- In the desktop live frame, the player sprite overlaps the menu board and the
  `Vanilla`/`4.50` row runs outside the board into the counter. This follows
  directly from a roughly 72 px menu board trying to hold an icon, full flavor
  label, and price while the player occupies the same left rail.
- Sampled CSS page text colors are strong (`#9fc4b2` on `#0c2f25` is about
  7.60:1), but not all canvas combinations are. The small cream label on the
  strawberry machine is approximately 2.12:1, and the chocolate order symbol
  against its dark bubble is approximately 2.38:1. More importantly, customer
  flavor orders have no non-color identifier.

Temporary evidence captures were written outside the repository at:

- `/tmp/maltline-title-1280.png`
- `/tmp/maltline-playing-1280.png`
- `/tmp/maltline-title-390.png`
- `/tmp/maltline-playing-390.png`

They are observational evidence, not proposed golden files; animation and
font rendering are not stable enough yet for those files to be baselines.

## What should be preserved

- The malt-shop identity is immediate and specific. The palette, awning,
  counter, shake machines, glassware, and small character variations belong to
  one visual world.
- Shakes and empty jars have distinct silhouettes, fill treatments, and travel
  directions. Customers display their order spatially above themselves.
- The desktop HUD has a sensible broad hierarchy: score left, stage center,
  queue and lives right.
- Customer phases already have useful seeds of animation language: walking,
  drinking progress, leaving music notes, and impatience.
- Most artwork is procedural Canvas 2D. This makes the prototype self-contained,
  fast to load, resolution-independent at its source resolution, and easy to
  recolor. It is a good base for refinement.
- The engine emits distinct semantic events for serve, catch, each miss type,
  life loss, stage clear, and game loss. The renderer can improve feedback
  without contaminating deterministic game rules.

## Prioritized findings

Priority here means player/release impact, not implementation order. `P0`
blocks calling the viewer broadly playable; `P1` blocks a polished release;
`P2` is refinement after the interaction language is sound.

| ID | Priority | Finding and evidence | Required outcome |
| --- | --- | --- | --- |
| VUX-01 | P0 | Narrow screens shrink the full canvas uniformly. At 390 px, gameplay text is 4–9 CSS px and actors/order bubbles are too small to parse. There are no touch controls. | Define supported devices explicitly. Prefer a responsive composition (larger semantic HUD outside the canvas and a gameplay-focused crop/layout) plus touch controls. If mobile play is deferred, show a tested landscape/keyboard requirement instead of presenting an unusable scaled game. |
| VUX-02 | P0 | Life-loss causes are not named in live play. `life_lost` is ignored by the renderer; a miss gets only particles/shake, and a walkout gets a brief lane flash. Wrong-flavor shakes can pass through a customer without explaining why. | Give every failure a short, distinct callout and audiovisual signature: `WRONG FLAVOR`, `MISSED RETURN`, `CUSTOMER REACHED COUNTER`, with the affected lane/entity highlighted. Briefly slow or pause presentation without changing authoritative ticks. |
| VUX-03 | P0 | First-run learning depends on a paragraph and terse footer. There is no input rehearsal, countdown, contextual prompt, or feedback for releasing blend early. “Station” and “window” are not grounded before the game clock starts. | Add a skippable, in-play first-pour teaching sequence: select lane, hold to fill, show `READY`, serve the matching order, then catch a return. Do not begin real pressure until the player has acted or skipped. |
| VUX-04 | P0 | Visual output is nondeterministic: bursts and screen shake call `Math.random()`, washing jars pulse from `Date.now()`, CSS uses wall-clock animation, and particles/popups age by frame time. | Inject a presentation clock and seeded visual RNG (or disable effects in fixture mode). A fixed state, tick, viewport, font set, and effect seed must produce the same pixels on the baseline runner. Replay speed must not change event appearance. |
| VUX-05 | P1 | The menu board, player, service lip, and counter compete for an approximately 104 px left rail. Flavor label and price visibly clip/overlap even in stage 1. | Redesign the left rail as one intentional control area. Either reserve enough width for a real menu or remove the redundant prices/copy and use compact, tested flavor keys. No text or sprite may cross another component's bounds. |
| VUX-06 | P1 | The actionable hierarchy is too quiet. Active lane is a slim cream lip; active station is a small chevron/green lamp; a completed shake is only in the player's tiny hand. Decorative counters and machines dominate the frame. | Make the current lane, current station/flavor, blend progress, and `READY TO SERVE` state readable in peripheral vision. Use shape/position/text as well as color. Keep scenery subordinate near active entities. |
| VUX-07 | P1 | Orders are mostly color-coded. Chocolate has poor contrast in the dark bubble; station strawberry label contrast is also low. Flavor confusion becomes a life penalty. | Give every flavor a redundant glyph/letter/pattern and apply it consistently to order bubble, machine, held cup, and flying shake. Meet 4.5:1 for small essential text and 3:1 for essential graphical objects/boundaries. |
| VUX-08 | P1 | Jar economy is unexplained in the live UI. The jar row is unlabeled; washing is represented only by a subtle wall-clock opacity pulse; unavailable, in-flight, washing, and destroyed jars are hard to distinguish. | Label the gauge and show stable state categories plus wash progress. Warn before starvation. A player should be able to answer “why can’t I blend?” without consulting the README. |
| VUX-09 | P1 | Dynamic game state is inaccessible to assistive technology. Canvas has only a static label and no fallback description; overlay has no dialog/status semantics; lives, score, orders, failures, and stage changes have no live text. Controls are non-interactive spans. | Add a concise screen-reader status region, polite stage/score updates, assertive life-loss/game-over announcements, semantic overlay/dialog handling, and real controls where UI actions exist. Keep announcements event-based to avoid 60 Hz noise. |
| VUX-10 | P1 | Motion preferences are ignored. The pulsing title hint, bobbing/halos/motes, screen shake, and particles always run. Blur clears held keys but gameplay continues, so switching windows can also cause unexplained losses. | Honor `prefers-reduced-motion` by removing shake/pulse and reducing ambient movement. Pause on blur/visibility loss with an explicit resume state. Add a pause control that is excluded from score time only under a clearly specified authoritative rule. |
| VUX-11 | P1 | Stage transitions are functional but thin: stages after the first start immediately after a two-second clear card, with no stage-specific lesson or countdown. Game over/victory accept only `R`, while the title accepts Enter/Space. | Standardize start/continue/restart actions for cabinet buttons and keyboard. Introduce stage name, changed rule/pressure, and a short `3–2–1/SERVE` transition. Make auto-advance cancelable and deterministic in presentation tests. |
| VUX-12 | P1 | There is no audio, mute control, or audio-state feedback. Several visually similar events therefore have no second channel of attribution. | Add a small event-first audio language before music: station move, lane move, blend loop/ready, serve, correct hit, catch, three failures, life loss, stage clear, and game over. Include mute and saved volume preference only; this must not save game progress. |
| VUX-13 | P2 | The renderer is a single 1,324-line file with scene, actors, UI, FX, palette, and timing coupled together. Color literals and system font fallbacks make broad changes and stable snapshots risky. | Split semantic HUD, scene, entities, and effects behind a render-model/visual-theme boundary. Bundle or deliberately pin a redistributable font for baseline stability. Keep state-to-render mapping pure where possible. |
| VUX-14 | P2 | The procedural pipeline has no manifest or provenance mechanism for the planned raster/audio additions. There are currently no external game assets. | Add an asset manifest with stable IDs, preload/decode behavior, fallbacks, hashes, source/generator, prompt/model/version where relevant, author/date, license/rights notes, and loudness/duration for audio. Fail visibly in development when a required asset is missing. |
| VUX-15 | P2 | Two-lane stages occupy only about 184 of the 290 px lane region, leaving a large visual dead band while the customers remain small and high in the frame. | Let lane composition respond to lane count, increasing separation and actor/order scale for two-lane teaching stages while preserving consistent collision-to-pixel mapping. |

## Learnability and feedback target

A new player should be able to infer this loop from the live frame, without the
README:

1. Find the nearest/most urgent order and its flavor key.
2. Select the matching flavor station.
3. Hold blend while a clearly bounded fill meter advances; early release says
   what was canceled.
4. See and hear that the shake is ready.
5. Select the customer lane and serve.
6. Understand whether the result was correct, wrong flavor, or wrong lane.
7. Track the returning empty and occupy its lane to catch it.
8. See the jar enter washing and return to the available pool.

Critical signals should form a consistent grammar:

| Meaning | Shape/position | Color | Text | Motion/audio |
| --- | --- | --- | --- | --- |
| Selected | Bold lane/station frame and fixed pointer | Cream/green | Current flavor name | Short navigation tick |
| Ready | Filled cup/serve-button silhouette | Flavor color | `READY` | One-shot chime, no indefinite flashing |
| Urgent | Customer/lane danger bracket | Warm red/orange | Optional `HURRY` | Accelerating but reduced-motion-safe cue |
| Success | Impact ring at customer/catch point | Flavor/cream | Points and streak | Distinct serve/catch sounds |
| Failure | Mark the exact path and endpoint | Red plus unique icon | Cause in 1–3 words | Brief impact and life-loss sting |
| Resource blocked | Jar gauge and machine linked | Amber | `NO CLEAN JARS` | Dry lever/click sound |

## Proposed visual-regression architecture

### Deterministic fixture seam

Build a test-only viewer entry that accepts a named fixture and renders exactly
one frame from an authored `MaltlineState`, scenario, draw metadata, visual tick,
and effect seed. It should not reach into private lexical variables in
`main.ts`, depend on real timers, or make the production URL accept arbitrary
score state. Prefer a `MaltlineRenderModel`/fixture module imported directly by
the browser test.

For event frames, explicitly seed `pushEvents` and advance the presentation by
an exact number of milliseconds. Replace `Math.random()` and `Date.now()` with
injected sources. Load all fonts/assets, await `document.fonts.ready` and asset
decode, then set a `data-render-ready` marker. Disable CSS transitions in
fixture mode. Golden screenshots should come from one pinned Chromium/Linux
runner; Firefox/WebKit should run layout/console smoke tests rather than share
pixel goldens.

For each screenshot, also assert DOM geometry and metadata. Pixel diffs alone
will not reliably identify clipping, tiny effective type, missing accessible
names, or a canvas that silently failed to draw.

### State matrix

The minimum useful fixture set is:

| Fixture | Required contents / assertion |
| --- | --- |
| `title` | Brand, one-sentence objective, primary start action, controls; no clipping |
| `first-pour-idle` | One visible vanilla order; current lane and station unmistakable |
| `blend-half` | 50% deterministic progress and the jar-pool decrement |
| `ready` | Held vanilla shake and explicit ready state |
| `serve-flight` | Shake, matching order, direction, readable flavor redundancy |
| `return-flight` | Empty jar, catch lane, washing/available gauge states |
| `rush-three-lane` | Three flavors, at least four customers, slide and jar crossing, no occlusion of orders |
| `danger-one-life` | Near-counter customer, one life, near-starved jars, urgency signal |
| `serve-success` | Impact, score popup, and streak at a fixed effect age |
| `wrong-flavor` | Wrong shake passing/rejecting plus named failure feedback |
| `jar-miss` | Broken jar at a fixed effect age plus named failure feedback |
| `walkout` | Affected customer/lane plus named failure feedback |
| `stage-clear` | Bonus, cumulative score/lives, next action/countdown |
| `game-over` | Final score, stage reached, consistent restart action |
| `victory` | Campaign result and replay/restart affordances |

### Viewport and preference matrix

Run every core fixture at the desktop baseline and a smaller representative
subset across the remaining columns:

| Profile | Viewport / DPR | Fixtures | Additional checks |
| --- | --- | --- | --- |
| Cabinet/desktop golden | 1280×720 / 1 | All | Pixel diff, no clipping, stable font |
| Laptop | 1024×768 / 1 | Title, rush, overlays | Entire play surface and controls visible |
| Hi-DPI desktop | 1440×900 / 2 | Rush, success | Canvas backing resolution is not blurry |
| Tablet landscape | 1024×768 / 2 | Title, first pour, rush | Pointer/touch target layout |
| Phone landscape | 844×390 / 2 or 3 | Title, first pour, game over | Playable minimum size and touch controls |
| Phone portrait | 390×844 / 3 | Title plus supported-device state | Intentional reflow or explicit rotate requirement |
| Large text | 1280×720 at 200% text | Title and overlays | No clipped DOM text; essential state remains available |
| Reduced motion | 1280×720 / 1 | Ready, success, all failures | No shake/pulse/ambient motion; feedback persists |
| Forced/high contrast | 1280×720 / 1 | First pour, danger | DOM controls remain visible; documented canvas alternative |

Automated non-pixel assertions should include:

- no horizontal document scroll and no component intersection outside authored
  overlap pairs;
- minimum effective essential text size and minimum 44×44 CSS px touch targets;
- color-token contrast tests plus consistent V/C/S (or other) flavor glyphs;
- accessible names/roles, overlay focus behavior, and throttled live regions;
- keyboard-only start, pause/resume, play, and restart;
- no console errors, missing asset requests, or unresolved font loads;
- screenshots equal across two identical fixture renders in separate contexts;
- screenshot unchanged when real wall-clock time advances but visual tick does
  not;
- event FX equal at 1× and 4× replay when sampled at the same visual event age.

Use tight per-component snapshots for HUD/order/gauge states in addition to
full-frame goldens. A small global diff tolerance can hide the exact tiny
signals that matter here, so prefer deterministic pixels and explicit masks
only for browser-native antialiasing that cannot be pinned.

## Smallest useful first polish tranche

This tranche is intentionally one coherent loop, not a full art or audio
production pass.

1. **Make presentation testable.** Inject visual time/RNG, add the named fixture
   route, pin a font, and land six initial goldens: title, first-pour idle,
   blend-half, ready, rush-three-lane, and one failure. Add desktop, laptop, and
   portrait geometry checks.
2. **Repair the visible layout defect.** Recompose the left rail so the player,
   menu, counter, and text do not collide. Remove decorative price copy if it
   cannot earn readable space. Make two-lane composition use its available
   area.
3. **Strengthen the core action state.** Add a full-lane selection cue, a clear
   blend meter, persistent `READY`, labeled jar states, and one non-color flavor
   key used on orders/stations/cups.
4. **Make failure attributable.** Render the `life_lost` reason as a fixed-age
   callout attached to the lane/entity and briefly hold it long enough to read.
   Add reduced-motion behavior at the same time.
5. **Choose narrow-screen policy.** For this tranche, an honest tested
   rotate/use-keyboard screen is acceptable if mobile play is not yet in scope.
   Do not continue silently scaling to unreadability. Full touch play can follow
   as its own measured tranche.

Exit criteria:

- identical fixture inputs produce identical screenshots in two clean browser
  contexts;
- no known overlap/clipping at 1280×720, 1024×768, or 390×844;
- the selected lane, flavor, blend progress, ready shake, jar availability, and
  cause of life loss are identifiable in static screenshots without relying on
  hue alone;
- reduced-motion capture has no screen shake or pulsing instruction;
- a first-time human playtest can complete the first serve and catch, and can
  correctly explain one failure, without reading the repository README.

## Asset pipeline recommendation

Keep procedural scenery and entity primitives while the gameplay language is
changing; they are flexible and already cohesive. Introduce generated raster
art only where it materially improves identity (for example, title treatment,
portraits, background set pieces, or cabinet marketing art), not as a blanket
replacement for state-critical shapes.

Before adding generated visuals or ElevenLabs audio, establish:

- `assets/manifest` entries with immutable logical IDs and content hashes;
- source files separate from web-delivery derivatives;
- documented generator/provider, model/version, prompt or brief, generation
  date, editor, and rights/license status;
- deterministic sprite-sheet frame metadata and explicit animation timing;
- audio normalization targets, trim/loop points, duration, and concurrency
  policy;
- preload groups (`boot`, `stage`, `optional`) and tested missing/decode
  fallbacks;
- a player-facing mute/volume control and an automated muted-browser test.

Generated assets should be reviewed in representative gameplay frames. A good
isolated sprite that weakens order readability or disappears at the effective
mobile scale is not a usable game asset.

## Recommended implementation order after this audit

1. VUX-04 deterministic render seam and initial test harness.
2. VUX-05 left-rail layout repair.
3. VUX-06/VUX-07 action hierarchy and flavor redundancy.
4. VUX-02 failure attribution and VUX-10 reduced motion/pause behavior.
5. VUX-03 first-pour onboarding.
6. Decide and implement VUX-01 narrow-screen policy.
7. Run the first human learnability test, log results, then decide whether the
   next spend belongs in animation, external art, or audio.

This order deliberately makes each later visual decision observable and
regression-tested before expensive artifact production begins.

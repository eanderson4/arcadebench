# P1-08 Visual Pressure Audit

**Date:** 2026-09-10
**Scope:** current stages 4–7 campaign values, deterministic gameplay fixtures,
1280×720 goldens, and live fixture geometry at 1024×768 and the supported
700px boundary
**Change made by this audit:** this report only

## Verdict

The current presentation has a sound hierarchy for a moderate three-lane
state: lanes remain separable, the selected window and station are redundant,
and every flavor-bearing order, machine, and outgoing cup carries a V/C/S cue.
The checked-in `rush-three-lane` golden is therefore a useful control image.

It is **not yet sufficient evidence for P1-08 pressure tuning or art changes**.
It is the only gameplay golden mapped to stages 4–7, it represents Stage 7
rather than Stage 4, and it deliberately spaces its four open orders so that
none compete. Its outgoing shake and returning jar are in different lanes, the
player is neither blending nor holding, and the no-clean-jar example is a
two-lane Stage 1 state. The current 1024×768 test also does not exercise scaled
gameplay: the capped 980px shell and canvas still render at their full CSS
width there.

Before accepting tuning or art refinements, add one named exact fixture for
each of stages 4–7 and one exact image at the 700px supported boundary. This is
a visual-evidence blocker, not a blocker to running unranked numeric tuning
experiments.

## What was inspected

- Authored pressure changes in `campaign-source.ts:63-117`:
  Stage 4 introduces 20 faster customers; Stage 5 reduces the pool to four and
  lengthens washing to 160 ticks; Stage 6 lengthens blending to 75 ticks; Stage
  7 raises the queue to 27 and accelerates spawning to a 66-tick floor.
- `rush-three-lane` in `visual-fixtures.ts:298-332`, `no-clean-jars` in
  `visual-fixtures.ts:144-154,333-339`, and `reduced-motion` in
  `visual-fixtures.ts:155-181,340-347`.
- The source-resolution 1280×720 goldens. Their current SHA-256 values are:
  `rush-three-lane.png` `160a21cb4cc33bd1b4a21b03c7a39b69098ad5ad6d7ba71fa306ec2ca4e90726`,
  `no-clean-jars.png` `20e777204e19ea2d56b2e101953b2c40ae7eaf7d7af51029987bd14e58110e8c`,
  and `reduced-motion.png` `0059768ec3d01ae91729e1fc942cbd0da0beb067d70572cc87a5a6bdd66bfd06`.
- A fresh live `rush-three-lane` capture at 1024×768 and another at 700×720.
  At 1024, the canvas was 980×551.25 at `(22,45)` and controls ended at
  `y=623.25`; document scroll size remained 1024×768. At 700, the canvas was
  672×378 at `(14,45)` and controls ended at `y=450`; document scroll size
  remained 700×720.
- A sequential scan of the verified generation-2 winning playback as a
  reachability comparison. That successful trace peaked at only 2 simultaneous
  customers in stages 4–6 and 3 in Stage 7. Its Stage 7 maximum was 5 moving
  entities total (3 customers, 1 slide, 1 jar); stages 4–6 peaked at 3–4. The
  replay proves successful play, but it is too clean to be pressure evidence.
- Focused Playwright evidence: the three desktop exact tests plus laptop
  geometry passed, **4/4**.

## Current pressure coverage

| Stage | Authored pressure | Current exact visual evidence | Coverage judgment |
| --- | --- | --- | --- |
| 4 — Lunch Rush | Faster march and accelerating 20-customer service across three lanes | None. No fixture uses scenario index 3. | Missing |
| 5 — Jar Shortage | Four-jar pool and 160-tick wash cycle across three lanes | `no-clean-jars` shows zero clean, two washing, and three returns, but uses Stage 1/two lanes (`visual-fixtures.ts:144-154,333-339`). | Economy cue proven in isolation; Stage 5 contention missing |
| 6 — Thick Shakes | 75-tick blend dwell while three lanes continue advancing | `reduced-motion` shows 50% blending in Stage 7 with one customer per lane (`visual-fixtures.ts:155-181`). | Blend cue proven in isolation; Stage 6 dwell pressure missing |
| 7 — Happy Hour | 27 customers, 144-to-66-tick spawn cadence, faster march, six jars | `rush-three-lane`: 5 customers, 4 open order bubbles, 1 slide, 1 jar, 1 washing; `reduced-motion`: 3 customers and 1 slide. | Moderate rush control exists; peak/crossing state missing |

The baseline inventory makes every named gameplay fixture exact at desktop
(`maltline.visual.spec.ts:13-31,1330-1334`). Only `rush-three-lane` is exercised
at laptop size, and that case asserts outer containment rather than pixels or
entity separation (`maltline.visual.spec.ts:1337-1357`).

## Readability findings

### P1 — Order and traffic competition is not exercised

`rush-three-lane` places customers at lane positions 74/42, 55, and 25/82.
Only the 74/42 pair share a lane as open orders; they are 32 lane units apart,
about 255 internal canvas pixels. The lane-2 pair are 57 units apart and one is
already drinking. The 40×28 order bubbles (`renderer.ts:839-867`) therefore do
not approach overlap in either the 1280 or 700 inspection.

The jar at position 51 is in lane 1 between the widely spaced customers, while
the only shake is in lane 2 at position 31 (`visual-fixtures.ts:307-319`). They
never cross in the same lane. This falls short of the original fixture contract
of a “slide and jar crossing” (`VISUAL_UX.md:154-165`) and cannot catch draw
order, silhouette, or flavor-cue regressions at a genuine decision beat.

**Required before art refinement:** at least one exact state with two close open
orders in one lane, an impatient near-counter order, and opposing shake/jar
traffic in that same lane. Assert minimum center separation for bubbles that
must remain distinct and explicitly designate any intentional overlap.

### P1 — Stage-specific machine pressure is only shown in isolation

The selected-machine language is strong: an active cabinet gets a cream outline
(`renderer.ts:1162-1194`), a stationary chevron when not blending
(`renderer.ts:1316-1325`), a labeled V/C/S plate (`renderer.ts:1232-1241`), and
the action chip distinguishes selected, blending, ready, and no-clean states
(`renderer.ts:1101-1142`). The active lane is also reinforced by the player,
inverse lane number, service lip, and dashed counter boundary.

But no current fixture combines those cues with the pressure it is meant to
support:

- Stage 5 has no three-lane zero/one-clean state with multiple returns and a
  customer queue. The Stage 1 `no-clean-jars` image has large empty areas.
- Stage 6 has no 75-tick near-ready blend while multiple orders advance. The
  existing 50% blend image uses Stage 7 and only three customers.
- Stage 7's rush player is merely selected; it does not exercise `BLENDING`,
  `READY`, or the held cup against busy traffic.

Consequently a polish change could improve the isolated blend or jar fixture
while degrading the same information under crowding and still leave all exact
tests green.

### P2 — Returning jars are the first cue to become marginal at 700px

Outgoing cups retain a flavor band and letter (`renderer.ts:898-930`) plus a
40px motion trail (`renderer.ts:994-1009`). Returning jars use a translucent
glass fill, 1.4px rim, sparkle, and a short low-alpha trail
(`renderer.ts:970-990,1012-1023`). Against the glossy brown counter they remain
visible at 1280/1024, but at the 700px boundary the thin empty-jar silhouette and
the 9px-internal jar-economy label are materially quieter than customers,
orders, and shakes. The 700px screenshot remains playable; the weakness is
peripheral acquisition during simultaneous traffic, which no exact image tests.

**Acceptance target, not a prescribed redesign:** a returning jar must remain
distinguishable from a vanilla shake, counter gloss, and a customer silhouette
at 700px without motion. Protect it with the same-lane crossing fixture in both
normal and reduced-motion modes before tuning color, outline, or trail weight.

### P2 — The smallest supported width has no gameplay golden

The responsive policy is explicit: gameplay is visible at 700px and replaced
below 700 (`style.css:822-860`). At 700 the entire current frame and footer fit
without horizontal overflow, but the 960×540 canvas is scaled to 672×378. By
contrast, the existing “laptop” check at 1024 renders the canvas at 980px,
slightly larger than its 960px backing width. It tests page containment, not the
smallest effective order text, jars, player, or selection marks.

Add one exact 700×720 pressure golden. Keep 1024×768 as a geometry smoke test;
another full-page exact golden there would add little distinct coverage.

### P2 — Nonvisual status does not convey the live order field

The canvas has a real semantic equivalent for stage, score, lives, orders-left,
selected window/action, and jar counts (`semantic-status.ts:9-32`), and events
are throttled separately. It does not identify pending flavors or which lanes
contain urgent customers. That means the visual V/C/S and urgency hierarchy has
no equivalent during a pressure state.

This is not a blocker to a visual-only P1-08 experiment, but it is genuine
accessibility debt. Address it as a separate, deliberately rate-limited design;
do not make every simulation tick live. A focused test should prove the static
status exposes a compact per-lane order summary while event announcements
remain one per meaningful event.

## Bounded pre-tuning visual-test matrix

Create new fixture names so the existing generation-2 control images stay
unchanged. Each fixture should declare whether it is a replay-derived reachable
frame or a synthetic render envelope; synthetic states should be checked by a
fixture invariant helper and must not be described as observed gameplay.

| New fixture | Required deterministic contents | Exact coverage | Non-pixel assertions |
| --- | --- | --- | --- |
| `stage-4-lunch-rush-pressure` | Scenario index 3; all 3 flavors/lanes; at least 5 customers; 2 close open orders in one lane; 1 impatient near-counter order; 1 outgoing shake and 1 return occupying the same lane; player on that lane with a selected station | 1280×720 | Correct scenario/HUD; all open orders retain V/C/S; named entities inside lane/canvas; intentional overlaps allowlisted only |
| `stage-5-jar-shortage-pressure` | Scenario index 4; 0 clean, at least 2 washing, at least 2 returns across lanes; queued open orders; player facing a return window; one held or ready shake | 1280×720 | Four total jars accounted for; both no-clean cues visible; return and held shake have distinct silhouettes; no text clipping |
| `stage-6-thick-shakes-pressure` | Scenario index 5; active blend at 80–95% of its 75 ticks; multiple open flavors in at least 2 lanes; another lane near danger; at least 1 jar in wash/flight | 1280×720 | Action chip percent matches state; machine bar has nonzero readable geometry; active lane/station remain redundant |
| `stage-7-happy-hour-pressure` | Scenario index 6; maximum intended crowd envelope; 2 close same-lane orders; impatient customer; simultaneous same-lane shake/return; mix of marching/drinking; player holding or blending; reduced jar availability | 1280×720 **and 700×720** | No horizontal overflow; canvas/footer fit; order bubbles/cues are not fully occluded; jar, shake, player, lane, and selected station each retain a measurable visible region |

Keep `rush-three-lane`, `no-clean-jars`, and `reduced-motion` as isolated control
goldens. Add a reduced-motion geometry/assertion pass for the new Stage 7 state,
but not a second full-page golden unless the normal-motion cues prove dependent
on animation. Keep the existing 1024×768 containment case and run all four new
fixtures through it parametrically; its value is layout smoke, not unique
pixels.

This adds **five** exact images total: four desktop stage images and one 700px
Stage 7 pressure image. It is the smallest set that maps every tuned stage,
tests each distinct pressure mechanic, and observes the actual minimum supported
scale.

## Gate for P1-08 visual acceptance

1. Record the scenario index, fixture kind (reachable or synthetic), fixed
   state/tick, presentation time, RNG seed, viewport, browser, and font identity.
2. Review all five new source-resolution images before changing art or tuning;
   preserve them as the before set.
3. For candidate tuning, keep the render state equivalent when judging an art
   change. For campaign promotion, regenerate only new-generation pressure
   fixtures; any unexplained change to the current generation-2 goldens is a
   stop signal, consistent with `P1-08-TUNING-VERIFICATION-PLAN.md`.
4. Require exact pixels plus geometry/entity assertions. Pixel equality alone
   cannot say whether a small V/C/S glyph or translucent jar is actually
   readable.
5. Conduct one human play pass at 1280 and 700 using a deliberately late but
   surviving trace. The canonical winning replay is solvability evidence, not a
   substitute for a pressure read.

## Checks run

- `npx playwright test --config games/maltline/playwright.config.ts games/maltline/tests/visual/maltline.visual.spec.ts --grep "desktop (rush-three-lane|no-clean-jars|reduced-motion)|laptop geometry"` — **4 passed**.
- Fresh headless fixture inspection at 1024×768 and 700×720 — no page overflow
  or clipping; measurements recorded above.
- Verified generation-2 winning playback scan for stages 4–7 — completed; peak
  counts recorded above.

No product code, tests, manifests, or golden images were changed.

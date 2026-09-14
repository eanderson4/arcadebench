# Maltline visual direction: Counter After Dark

Status: P2-01 direction locked
Direction ID: `counter-after-dark-v1`
Reviewed: 2026-09-11

This document is the visual source of truth for the next Maltline presentation
work. It records the direction already visible in the shipped renderer and
turns it into testable constraints. It is not a redesign brief: future polish
should make the existing malt-shop identity clearer, not replace it.

> **North star:** a warm late-shift soda fountain rendered like a screen-printed
> cabinet marquee—cozy at rest, crisp and operational under pressure.

## Evidence used for the lock

The direction is grounded in the current implementation rather than a detached
mood board:

| Evidence | What it establishes |
| --- | --- |
| `games/maltline/src/viewer/visual-theme.ts` | Frozen direction identity, environment colors, flavor palettes, customer range, and V/C/S cues. |
| `games/maltline/src/viewer/renderer.ts` | The 960×540 composition, silhouettes, fixed draw order, state treatments, and Canvas painters. |
| `games/maltline/src/viewer/renderer-effects.ts` | Package-private event-to-effect reduction, deterministic entropy order, effect ages/expiry, camera shake, and presentation reset. |
| `games/maltline/src/viewer/viewer-motion-preference.ts` | Live-only, BFCache-safe motion-preference binding; fixtures, replay, and the human lab retain explicit deterministic modes. |
| `games/maltline/src/viewer/style.css` and `fonts.ts` | Shared shell materials, focus treatment, bundled Maltline UI font, 700px support boundary, and reduced-motion behavior. |
| `games/maltline/src/viewer/visual-fixtures.ts` | Authored static states and explicit synthetic pressure envelopes with fixed time and seed. |
| `games/maltline/tests/visual/maltline.visual.spec.ts` | Exact-pixel, geometry, entity-region, reduced-motion, accessibility, and supported-width checks. |
| `games/maltline/tests/visual/baseline-manifest.json` | Reproducible browser/font/image inventory for the visual contract. |
| `docs/maltline/audits/P1-08-VISUAL-PRESSURE.md` | The pressure-state rationale and missing-evidence analysis that produced the Stage 4–7 matrix. |

The representative frames reviewed at source resolution were `ready.png`,
`jar-miss.png`, `reduced-motion.png`,
`stage-7-happy-hour-pressure.png`, and
`stage-7-happy-hour-pressure-700.png`. Their reviewed hashes are recorded in
the acceptance recipe below.

## Direction principles

1. **Warm shop, hard signals.** The room may feel soft, worn, and hospitable;
   an action, hazard, or failure must be geometrically crisp.
2. **One focal cue per decision.** Lane, station, held shake, and jar status
   each get one dominant cue, reinforced by at most one quieter cue.
3. **Flavor is never color alone.** Vanilla, chocolate, and strawberry always
   carry V/C/S and a stable object location or silhouette in addition to hue.
4. **Pressure comes from game state, not visual noise.** More customers and
   crossings create tension; arbitrary flashing, bloom, and camera motion do
   not.
5. **Feedback explains the outcome, then leaves.** Effects identify what
   happened and where. They must not obscure the player's next decision.
6. **Atmosphere yields first.** At the 700px supported boundary, decorative
   detail may recede; gameplay cues may not shrink into ambiguity.

## Style board

### Palette

Use semantic tokens from `visual-theme.ts` instead of introducing near-match
colors in individual painters.

| Role | Token / color | Use |
| --- | --- | --- |
| Night wall | `#0e3a2c` → `#07211a` | Matte room field; the quietest large surface. |
| Shell background | `#0c2f25` | Page and canvas fallback. |
| Panel green | `#12503e` | Cards, shop fixtures, and large framed controls. |
| Cream | `#f3e9d2` | Primary type, enamel, active boundaries, paper-like UI. |
| Dim cream/green | `#d9c8a6` / `#9fc4b2` | Secondary labels only; never the sole urgent cue. |
| Counter wood | `#8a5a33`, `#b07a44`, `#5d3a20` | Thick horizontal work surfaces and structural rails. |
| Brass | `#c9a961`, `#8a6f3a` | Small fittings and period detail, not primary state. |
| Brand strawberry | `#f28cb4` | Maltline mark and keyboard focus. Keep it scarce. |
| Ready | `#7dffa8` | Completed held shake and positive action availability. |
| Blending | `#ffd76b` | Work in progress. Pair with fill/progress and text. |
| Blocked | `#ffb36b` | No-clean-jar economy. Pair with jar count and wording. |
| Urgent / walkout | `#ff6b5e` / `#ff8b73` | Imminent or realized customer loss, localized to its lane. |
| Shake miss | `#ffd06f` | Outgoing-product failure, named in the callout. |
| Return miss | `#dbe9e4` | Glass/return failure, named in the callout. |

Flavor identity is a separate palette and must not be borrowed for generic
success or danger:

| Flavor | Base / dark / light / glow | Required cue |
| --- | --- | --- |
| Vanilla | `#f6e7c9` / `#d6b98a` / `#fff8ea` / `#ffe9b8` | `V` |
| Chocolate | `#7a4a24` / `#54301a` / `#a06a38` / `#c98a4a` | `C` |
| Strawberry | `#f28cb4` / `#c9557f` / `#ffb3d0` / `#ff9ec4` | `S` |

Do not use a flavor fill as the only outline around same-flavor content. Keep a
dark keyline or cream separation so vanilla remains visible on paper and
chocolate remains visible on wood. New essential text must meet 4.5:1 contrast;
essential component boundaries and non-text state marks must meet 3:1 against
adjacent colors.

### Materials and rendering

- **Wall:** matte green tile or painted plaster, low-contrast seams, warm lamp
  falloff. It is a field, not a texture showcase.
- **Counter:** broad wood bands with dark undersides and one light edge. The
  counter should read as the lane's physical track before its grain is noticed.
- **Machines:** cream enamel body, colored flavor hopper, dark inset, minimal
  brass/steel fitting. Selection uses a cream boundary and chevron, not glow
  alone.
- **Worktop:** cool steel strip separating play lanes from the machine bank.
- **Jars:** transparent/blue-gray glass with a strong rim and base. Empty jars
  must not resemble filled shakes in silhouette or direction of travel.
- **UI:** cream ticket stock on deep green, rounded but not pill-heavy. Type is
  the bundled Noto Sans `Maltline UI`; use weight and spacing before shadows.

Objects should generally use a base, a dark side, a light side, and at most one
highlight. Keep outlines in the current 1–3 internal-pixel family. Avoid
photoreal textures, noisy film grain, neon/cyberpunk bloom, fake CRT damage,
and deliberate low-resolution pixel-art imitation. Maltline is graphic and
tactile, not grungy.

## Silhouette language

| Entity | Recognition silhouette | Invariant under pressure |
| --- | --- | --- |
| Customer | Head + capsule torso + short legs; order ticket floats above. | Face/order remains on top of lane furniture; order ticket is the highest entity layer. |
| Order | Dark speech-ticket, flavor border, soft-serve icon, large V/C/S. | Letter and border survive desaturation; urgency cannot hide the letter. |
| Outgoing shake | Filled tapered cup with cap/straw, moving counter → door. | Retains a filled center and straw even when crossing a jar. |
| Return jar | Clear rim/body/base, moving door → counter. | Retains an empty center and glass keyline; direction is also visible from context/trail. |
| Player | Green-capped worker anchored to the left service rail. | Selected lane is evident without relying on the player's small body alone. |
| Held shake | Flavor-filled cup at the player's working hand. | READY is reinforced by the action chip; the held flavor letter remains available elsewhere. |
| Station | Tall 74×96 dispenser with flavor hopper and letter plate. | Selected station gets a cream outline plus chevron; unselected machines stay quieter. |
| Door/window | Cream endpoint at the right edge of each lane. | Remains visible behind a dense queue and anchors travel direction. |
| Jar economy | Labeled gauge: dominant `CLEAN n`, then `WASH n · IN PLAY n`, with `W` on washing jars. | Zero clean jars changes label and state color; every jar is accounted for without relying on icons. |

When moving entities overlap, each must retain at least 60% of its defining
silhouette or be separated vertically. Decorative particles may be occluded or
omitted. The action chip, jar gauge, HUD, and failure callout must never cover
one another.

## Information hierarchy and state grammar

At cabinet distance the eye should resolve information in this order:

1. **Immediate decision:** active lane, requested flavor, selected station,
   blend/held/READY state.
2. **Imminent hazard:** nearest patience edge, returning jar, and clean-jar
   availability.
3. **Run context:** orders left, lives, stage, score, and first-fulfillment chain.
4. **Atmosphere:** lamps, tile, steam, clothing variation, and motes.

| State | Dominant cue | Redundant cue | Prohibited shortcut |
| --- | --- | --- | --- |
| Active lane | Cream/dashed service boundary and left rail | Player position | Color change alone |
| Selected station | Cream 2.5px outline | Down chevron + V/C/S plate | Flavor glow alone |
| Blending | Amber progress treatment | `BLENDING`/progress copy | Animation alone |
| Held and ready | Green action chip | Visible held cup + flavor cue | Generic success flash |
| No clean jars | Amber gauge/callout | `CLEAN 0`, wash count, and jar icons | Disabling action silently |
| Customer urgency | Local coral patience/lane treatment | Customer/order remains readable | Full-screen red wash |
| Serve/catch success | Localized burst and score popup | Semantic event announcement | Persistent celebratory obstruction |
| Life loss | Lane-local accent | Fixed-age callout naming walkout, shake miss, or return miss | Undifferentiated screen shake |

## Composition invariants

The current 960×540 canvas is divided into stable working bands. Refinement
must respect them until an explicit layout experiment replaces the contract:

- HUD: y `0–46`.
- Awning and queue label: immediately below the HUD.
- Service lanes: y `60–350`, counter x `104`, doors x `900`.
- Station/work bank: begins at y `372`; machine baseline y `478`.
- Player/control rail: left of the counter without overlapping machine labels,
  jar economy, or action copy.
- Failure feedback: above the machine bank and below live lane orders.

Atmosphere may cross these bands only at low contrast. Operational marks stay
inside the band they describe.

## Animation and effects language

Motion has three bands:

1. **Ambient:** slow lamp, steam, breathing, and mote motion. Low amplitude,
   low contrast, never informational.
2. **Operational:** customer gait, cup/jar travel, blend progress, selector
   float. Derived from simulation tick or injected presentation time.
3. **Feedback:** event-local bursts, lane flash, score popup, and named failure
   callout. Derived from logical event identity, deterministic seed, and age.

The current timing is the baseline language:

- event particles: 420–680ms;
- lane urgency flash: 480ms;
- score popup: 900ms;
- life-loss callout: 1,400ms, with short fade-in and 280ms fade-out.

Only one high-energy treatment should dominate a lane at a time. Prefer a
localized burst over camera movement. Screen shake is supplementary and must
never carry cause. Repeated draws at the same time must reproduce the same
frame; the same event, seed, and age must reproduce the same effect geometry.

With `prefers-reduced-motion: reduce`, remove walking bob, sway, wobble,
selector float, shake, and decorative particles. Preserve static outlines,
progress fill, labels, counts, and full-duration outcome copy. Reduced motion
must not reduce decision time or hide a state transition.

## Cabinet-distance and accessibility rules

The minimum playable viewport remains 700 CSS pixels wide. Below that, show the
purpose-built unsupported-device surface; do not scale gameplay into a false
supported mode.

At both the normal 1280×720 frame and the 700px boundary:

- A two-second glance must answer: **which lane, which requested flavor, which
  selected station, blending or held, and how many clean jars?**
- A one-second post-failure glance must answer: **what was lost and in which
  lane?**
- Do not shrink the current compact 8–9 internal-pixel labels. New essential
  canvas text should be at least 10 internal pixels; prefer 12–16 for actions,
  resource warnings, and failures.
- Keep critical object bodies at least 28 internal pixels in one dimension and
  critical boundaries at least 2.5 internal pixels where the current language
  permits it.
- Keep DOM interaction targets at least 44×44 CSS pixels unless an equivalent
  larger grouped target exists.
- Every flavor occurrence uses V/C/S plus color; every progress state uses fill
  or text plus color; every failure names its cause.
- Keyboard focus uses the scarce strawberry focus ring and must not be clipped
  by the stage wrapper.
- Canvas is decorative to assistive technology. The semantic status must expose
  the current lane, station/flavor, held/blend state, jars, lives, remaining
  orders, and discrete outcomes without announcing every tick.
- Modal flows own focus and keyboard input. Hidden/inactive gameplay and footer
  controls are hidden or inert to assistive technology.

Run a desaturated review and a 25% zoom/squint review in addition to exact
pixels. If a state disappears in either review, strengthen shape, placement, or
wording before increasing saturation.

## Representative gameplay-frame acceptance recipe

Use the existing `stage-7-happy-hour-pressure` fixture as the direction-lock
frame. It is explicitly a `synthetic-pressure-envelope`, not evidence of a
recorded run.

Fixture recipe:

- scenario: `maltline-07-happy-hour` (index 6);
- presentation time: `120000ms`; random seed: `1107`;
- tick `2860`, score `7320`, lives `1`, streak `6`;
- player: lane 1 visually (zero-based lane `0`), station `2` / strawberry,
  holding strawberry;
- customer density: 3 / 2 / 2 across the three lanes, including one drinking
  customer;
- lane 1 contains both an outgoing strawberry shake and a returning jar;
- jar economy: 1 clean, 1 washing, 4 in play; 17 orders left.

The frame passes only when a reviewer can answer, without fixture metadata:

1. Lane 1 is active.
2. Strawberry is selected and a strawberry shake is READY.
3. One clean jar remains and one is washing.
4. The nearby vanilla order is the most immediate customer hazard.
5. The outgoing shake and returning empty jar are distinct despite sharing a
   lane.
6. One life and 17 outstanding orders remain.

Required evidence:

| View | Contract | Reviewed SHA-256 |
| --- | --- | --- |
| 1280×720 | Exact pixel golden + entity-visible-region checks | `ca2e3213bd418bfccad358531ea3b50f94e4b53c974d3e776d405afb6faa6dd9` |
| 700×720 | Exact pixel golden + no overflow + essential cue containment | `e1cd2b6f098ced3561464da5eb8deb618ceb32efe13ef3bed7b45673d258d6c7` |
| 1024×768 | Parametric geometry/containment; no redundant golden required | n/a |
| Reduced motion | Same answers, stable static cues, no essential motion | `6bfd44f62f2ab5ab0fb7b6e30977aa24c3b6771c4ef751d434910a2e8d8ec594` (current reduced-motion state) |

The ready-state control hash is
`56caf63ebe1309a9ac53520f6633d3d680ad6d811f51711d2cdacc9cce35f5ae`;
the named return-miss feedback hash is
`ee17903de9fab23eb25a0b24c96d83ccc5f458362381d9953030929fae18c75e`.
Together they prevent a pressure polish from improving the hero frame while
weakening ordinary action or failure clarity.

Before accepting a visual-direction implementation, also verify:

- every visible order bubble has its V/C/S cue inside the bubble bounds;
- the selected station outline and chevron do not touch adjacent machines;
- READY/action copy and the jar gauge do not collide at 700px;
- each live customer, shake, and jar intersects the visible gameplay region;
- the simultaneous shake and jar retain distinguishable filled/empty centers;
- reduced motion and desaturation preserve all six glance-test answers;
- seeded/time-frozen rerenders are byte-identical; and
- all pre-existing generation-2 control goldens remain unchanged unless their
  change is explicitly named and reviewed.

## Bounded implementation order

The next presentation work should be reviewable as small experiments:

1. **P2-02 entity pass:** strengthen customer/order, shake/jar, station, and
   counter silhouettes without changing composition. Start with the five Stage
   4–7 pressure goldens plus `ready` and all three loss-reason states.
2. **P2-03 feedback pass:** unify serve, catch, miss, walkout,
   first-fulfillment chain, and life
   feedback against the timing and motion bands above. Add a deterministic
   event-age matrix before tuning particles.
3. **Token consolidation:** move remaining operational colors and effect timing
   into typed presentation tokens only as their painters are touched. Preserve
   exact command/pixel output during mechanical extraction.

Each tranche should name its intended pixel regions before updating a golden,
inspect 1280 and 700 at source resolution, exercise reduced motion, and retain
the existing exact manifest gate. Do not combine the first art pass with a
renderer decomposition, rules change, audio integration, or browser upgrade.

## Non-goals

- No new raster asset pipeline is required for this direction.
- No campaign numbers, rules, proof format, or input behavior change.
- No separate fixture-only art theme.
- No replacement of the malt-shop identity with a generic arcade skin.
- No use of animation, sound, or color as the only carrier of essential state.

P2-01 is closed: this direction was independently reviewed against the
representative Stage 7 frame at 1280px and 700px and is the accepted constraint
set for P2-02 and P2-03.

## Station-state truth refinement

The station bank now follows one explicit visual grammar without changing the
`counter-after-dark-v1` identity:

- **Selected:** a neutral cream outer frame plus an attached dark V/C/S tab.
  Selection is navigation context, not permission or readiness, so it never
  uses green.
- **Blocked selected:** the same fixed frame and tab turn amber and the station
  lamp gains a slash. The action chip says `NO CLEAN JARS · CATCH A RETURN`;
  it never resembles a completed blend.
- **Processing:** only the machine whose registered flavor equals
  `processingFlavor` receives the amber inner frame, active hopper, and five
  fixed divider marks around an exact continuous progress fill. Moving
  selection during a blend cannot transfer this treatment to another cabinet.
- **Holding:** the selected cabinet stays quiet cream. Green `READY` belongs to
  the action chip and held cup/player silhouette, where the actionable object
  actually is.

The frozen `visual-theme.ts` station tokens keep primary status text at least
4.5:1 against its panel and the cream/amber structural marks at least 3:1
against the cabinet field. At the 700px boundary, the selected tab remains at
least 18×23 CSS pixels, the processing meter at least 8×43 CSS pixels, and the
action chip at least 190×21 CSS pixels. Letters, frames, segmentation, and the
blocked slash preserve the state grammar without depending on hue or motion.

Three exact, deliberately synthetic and unranked Stage 6 controls pin the
important split case: Chocolate is selected while Strawberry continues
processing at 50%. `stage-6-station-tool-split.png`, its 700px counterpart,
and the 700px reduced-motion twin reuse one validated, jar-conserving pressure
state; the two minimum-width controls differ only in motion mode. Fixture
metadata records selected/tool flavors, mode, quantized percent,
lifecycle/accounting truth, IDs, cue regions, and CSS-scaled minimum sizes.
These images demonstrate deterministic visual separation; they are not
evidence of human comprehension.

Because these production-renderer changes are visible to participants, station
state repair artifacts use experiment revision 9 and the later truthful
`CHAIN N` HUD exposure uses revision 10, and the later visible numeric lives
role uses revision 11. The subsequent cabinet hierarchy, contrast, and crisp-overlay
presentation pass uses revision 12. Normalization accepts only revision 12.
The study schema, campaign/rules/proof generations, and ranked outcomes remain
unchanged.

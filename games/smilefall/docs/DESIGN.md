# Smilefall design system — "Sticker Arcade"

Partition is a cold instrument panel. Smilefall is the opposite cabinet: warm
paper, candy colours, and toys you want to press. The two games share the
ArcadeBench platform, not a look.

Live gallery: `/src/viewer/kit/` (run `npm run dev:smilefall`).

## The four rules

1. **Candy on warm paper.** The world is a bright daylight sky over cream
   paper. No dark mode; the game is a sunny afternoon.
2. **Fat ink outlines.** Everything is drawn with a 3px `--sf-ink` stroke —
   deep grape, never black. It applies to DOM components and canvas drawing
   alike, which is what makes the HUD and the playfield feel like one object.
3. **Hard toy shadows.** Controls sit on a solid offset shadow
   (`--sf-pop`) and press *down* into it when clicked. Nothing floats on a
   blurry glow.
4. **Nothing sits straight.** Panels tilt a degree or two, buttons rotate
   slightly on hover, full buckets shimmy, and smilies squash and stretch.

## Files

| File | Holds |
| --- | --- |
| `src/viewer/design/tokens.css` | Every colour, size, radius, shadow, font, and keyframe. Change the game's look here. |
| `src/viewer/design/system.css` | The component kit: buttons, panels, chips, pips, meters, picks, callouts, the CSS mascot. |
| `src/viewer/kit/` | The living gallery. Every component in this file appears there. |
| `src/viewer/style.css` | Layout only — screens, HUD, stage, overlays. |
| `src/viewer/renderer.ts` | Canvas drawing, using the same palette constants. |

## Palette

Ink `#2c1b47` · Paper `#fff8ec` · Yolk `#ffd23f` · Bubble `#ff5d8f` ·
Grape `#8b5cf6` · Mint `#2fd39b` · Tangerine `#ff8a3d` · Sky `#52c8ff` ·
Grass `#6fd66f` · Rock `#9aa0b8`.

Yolk is the smiley and the primary action. Mint means good (progress, next
stage), bubble means a mistake (frowns, splats), grape is the focus ring.
Buckets cycle through mint, bubble, grape, tangerine, sky so each one is
nameable at a glance.

## Type

Display is **Baloo 2** (700/800), body is **Nunito** (600/700). Both fall back
to `ui-rounded` / `SF Pro Rounded`, so the rounded personality survives without
the network. `.sf-hero--sticker` is the game's wordmark treatment: paper fill,
ink stroke, hard ink drop shadow.

## Components

Everything is prefixed `sf-`: `sf-btn` (jumbo/small, yolk/pink/mint/grape/paper/
ghost), `sf-panel` (+`--warm`, `sf-tilt-l/r`), `sf-chip`, `sf-badge`,
`sf-stat`, `sf-pips` (frowns and hop charges), `sf-meter`, `sf-pick`,
`sf-segment`, `sf-callout`, `sf-key`, `sf-wheel`, `sf-tags`, and `sf-face` —
the mascot, built from a single element and two pseudo-elements so it can
appear anywhere at any size (`--sad`, `--hurt`, `--rock`).

`sf-wheel` is the game's one bespoke control: a steering wheel that tilts with
the lean and prints how many smilies are currently taking the order. It exists
because the single hardest thing to communicate about Smilefall is that there
is exactly one wheel for the whole sky, so the HUD shows exactly one wheel.

## Canvas rules

The playfield follows the same system: sky gradient with drifting clouds, a
grass strip, pails with a rising "smiley juice" fill, lumpy rocks whose shape is
hashed from their id (so a rock keeps its face across a replay), and event
juice — floating points, splat stars, confetti, and a short screen shake on a
smash. All of it is cosmetic and reads only from state and events; it can never
change the simulation.

Four canvas layers exist purely to make the shared steering legible, and they
all fire together on the same input:

- **bank** — every smiley rotates by the same angle, taken from its own
  horizontal velocity, which is identical across the flock because the lean is.
  This is the one that carries the idea. An earlier version drew a tether
  between the smilies; it read as "tied together" rather than "steered
  together", which is the wrong idea, so it was cut.
- **speed lines** — three cartoon streaks behind each smiley, same length and
  angle for everyone;
- **wind** — streaks across the entire field in the lean direction, so the
  world itself signals that the input is global;
- **chevrons** — one over every smiley, all pointing the same way, clamped to
  stay on screen when the flock is pinned against a wall.

Knocks are colour-coded by cause so they never read the same: a rock is a
purple "ow!", the ground is a green "boing!" with a dust puff, a rim is an
orange "clang!". A hop adds one ring per smiley, all born on the same tick. A bruised smiley is
drawn duller, frowning, with a plaster and a purple blotch, and flashes while
its grace window is protecting it.

## Motion

`--sf-boing` is the house easing curve. Keyframes live in tokens:
`sf-wobble`, `sf-bob`, `sf-pop-in`, `sf-jelly`, `sf-drift`. Everything is
disabled under `prefers-reduced-motion`.

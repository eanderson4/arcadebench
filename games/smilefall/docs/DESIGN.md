# Smilefall design system — "Sticker Arcade"

Partition is a cold instrument panel. Smilefall is the warm, playful side of
ArcadeBench: candy colors, paper surfaces, thick ink, and controls that feel
like toys. The games share platform behavior while retaining distinct visual
identities.

Live gallery: `/src/viewer/kit/` (run `npm run dev:smilefall`).

## The four rules

1. **Candy on warm paper.** The world is a bright daylight sky over cream
   paper. The game reads as a sunny afternoon.
2. **Fat ink outlines.** Everything uses a 3px `--sf-ink` stroke in deep grape,
   never black. DOM components and canvas art belong to the same world.
3. **Hard toy shadows.** Controls sit on solid offset shadows (`--sf-pop`) and
   press down into them. Nothing floats on an indistinct glow.
4. **Nothing sits straight.** Panels tilt, buttons rotate slightly on hover,
   full buckets shimmy, and smiles squash and stretch.

## Files

| File | Responsibility |
| --- | --- |
| `src/viewer/design/tokens.css` | Colors, spacing, radii, shadows, type, timing, and keyframes |
| `src/viewer/design/system.css` | Buttons, panels, chips, meters, controls, and CSS faces |
| `src/viewer/kit/` | Living component gallery |
| `src/viewer/style.css` | Screen, HUD, catalog, board, overlay, and responsive layout |
| `src/viewer/renderer.ts` | State-driven canvas drawing and cosmetic event effects |

## Palette

Ink `#2c1b47` · Paper `#fff8ec` · Yolk `#ffd23f` · Bubble `#ff5d8f` ·
Grape `#8b5cf6` · Mint `#2fd39b` · Tangerine `#ff8a3d` · Sky `#52c8ff` ·
Grass `#6fd66f` · Rock `#9aa0b8`.

Yolk belongs to smiles and primary actions. Mint communicates progress and
completion. Bubble marks mistakes and pop effects. Grape is the focus color.
Buckets cycle through mint, bubble, grape, tangerine, and sky so each target is
easy to name while several are moving.

## Type

Display text uses **Baloo 2** at 700/800 and body text uses **Nunito** at
600/700, with rounded system fallbacks. `.sf-hero--sticker` is the Smilefall
wordmark treatment: paper fill, ink stroke, and a hard ink shadow.

## Components and screens

Every reusable class is prefixed `sf-`: `sf-btn`, `sf-panel`, `sf-chip`,
`sf-badge`, `sf-stat`, `sf-pips`, `sf-meter`, `sf-pick`, `sf-segment`,
`sf-callout`, `sf-key`, `sf-wheel`, `sf-tags`, and `sf-face`.

`sf-wheel` is the game's bespoke control. It tilts with the current lean and
counts the smiles following the command. One visible wheel reinforces the core
idea that the whole flock shares one instruction.

The title screen presents Arcade Run, Level Catalog, and Leaderboards as equal
parts of the game. Catalog cards keep Smilefall's handmade tilt while providing
consistent play, board, vote, and private-note actions. Gameplay keeps reserve,
bucket progress, score, combo, time, hops, and sound in one responsive HUD.

## Hazard language

The source of danger must be readable from the object before it arrives:

- **Plain rocks** are blunt, faceted chunks with uneven corners and broad
  shaded planes. They look heavy but do not carry teeth or hot tips.
- **Spiked rocks** strictly alternate teeth and notches. Their outer points
  glow in the same bubble-red used by fixed spike strips.
- **Spike strips** are irregular teeth bolted visibly to a surface. A slow
  glint keeps a static strip noticeable without changing its collision area.

Only the two spiked forms can pop a smile. Walls, floors, platforms, bucket
contact, and plain rocks use softer impact rings, dust, text, and smaller screen
shake. The collision shape stays close to the drawn silhouette so a near miss
looks like a near miss.

Smiles never switch to a separate lethal-stage design. They remain the same
round character everywhere. A safe impact dulls the color, turns the mouth
into a frown, adds a bruise and plaster, and flashes during plain-rock grace.
The hazard owns the large burst and shake when a pop occurs.

Rock and spike variations are generated from stable string hashes. A given id
therefore produces the same silhouette during live play and replay. The hash's
final avalanche step matters because nearby ids such as `rock:1` and `rock:2`
must not produce nearly identical vertices.

## Reading shared steering

Four canvas cues repeat the same instruction:

- every smile banks by the same commanded angle;
- matching speed lines trail the flock;
- wind streaks cross the field while lean is held;
- a chevron above each smile points in the shared direction.

The HUD wheel repeats that state outside the playfield. A hop creates one ring
per live smile on the same tick, making the shared action read as a synchronized
event rather than a series of unrelated jumps.

## Impact language

Safe impacts use cause-specific effects:

- plain rock: purple **ow!**, a bruise burst, and the strongest safe shake;
- wall or ceiling: slate **bonk!**;
- ground: green **boing!** with dust;
- bucket rim: orange **clang!**;
- full bucket: yellow **nope!**;
- bucket side: yellow **clonk!**;
- platform: brown **boing!**.

Catches use mint points and confetti. Pops use a large bubble-red burst, ring,
`POP!`, confetti fragments, and the strongest screen shake. These effects are
derived from engine events and remain cosmetic.

## Vertical rooms and camera

The last three arcade stages grow upward. Wood platforms form landings, roofs,
and stairs; buckets may stand on those surfaces; upward and downward teeth keep
their attachment direction obvious. The camera begins at each stage's authored
`viewHeight` and frames the flock, ground, and next unfinished bucket so the
route is revealed as the player climbs.

## Motion and accessibility

`--sf-boing` is the house easing curve. Shared keyframes include `sf-wobble`,
`sf-bob`, `sf-pop-in`, `sf-jelly`, and `sf-drift`. All animation and transition
durations collapse under `prefers-reduced-motion`.

Interactive controls retain a thick grape focus ring, leaderboard and catalog
state is expressed in text as well as color, touch controls expose labels, and
screen changes move focus to the new heading. Audio has a persistent on/off
control and never carries information that the screen omits.

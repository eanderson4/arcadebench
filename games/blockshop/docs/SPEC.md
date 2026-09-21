# Blockshop release rules

Status: **playable visual prototype; ranking authority not yet registered**.

## Field and run

The playfield is 1200 × 760 logical units and advances at 60 ticks per second.
The arcade run visits the eight registered stages in order. It begins with
three balls; score and balls carry forward. Losing the last ball ends the run.
Clearing every breakable block wins a stage. Steel blocks reflect the bearing
but do not count toward completion.

## Input

`move` is one of -1, 0, or 1. `action` is edge-triggered and launches every
waiting ball. A glued ball follows the tray until the next action edge.

The tray position changes by at most 15 logical units per tick. Where a bearing
lands on the tray determines its horizontal return velocity; moving the tray
at contact adds a small amount of English.

## Materials

- Painted blocks break in one hit.
- Hardwood blocks break in two hits and visibly crack after the first.
- Steel blocks never break.

## Power tags

- **Wide** enlarges the tray for 15 seconds.
- **Slow** runs bearing motion at three-quarter speed for 10 seconds.
- **Multiball** adds two live bearings.
- **Glue** catches the next two tray returns.
- **Heavy** lets bearings pass through breakable blocks for nine seconds.
- **Extra** adds one ball, capped at five. The first appears in Rack 2 so a
  new player can carry an additional chance into the harder materials.

Breaking a power block releases a labeled tag. The effect activates only when
the tray catches that tag. Missing a tag has no penalty.

## Score

Painted blocks start at 100 points and hardwood at 140. Every consecutive block
before the next tray contact adds 20 points, capped after ten combo steps.
Clearing a stage awards 500 points per remaining ball plus up to 4,200 points
for finishing early. This score is provisional until playtesting establishes a
ranked scoring version.

## Replay boundary

The stage catalog is immutable within a ranked version. An input-only replay
contains the stage identifier, starting score and balls, then one control input
per tick. Re-simulation derives all collisions, power drops, score, and outcome.

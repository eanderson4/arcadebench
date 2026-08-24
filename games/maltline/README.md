# Maltline

**Cabinet 02 (prototype).** A Tapper-lineage counter game: customers line up
at the windows, each wanting a specific shake. Blend the right flavor at the
right station, slide it down the counter, and catch the empty jars before
they hit the floor.

- **Human arcade run:** an 8-stage campaign that escalates every Tapper-style
  lever — spawn rate, march speed, menu breadth, blend dwell, jar pool.
- **Deterministic core:** fixed 60 Hz tick, seeded spawns, integer fixed-point
  positions; a recorded input list replays any stage byte-for-byte.
- **Model control (planned):** the whole state — order bubbles, station
  progress, jar pool, player position — serializes into compact ticks, so a
  controller can plan serving orders under the live clock.

## Play locally

From the repository root:

```sh
npm install
npm run dev --workspace=@arcadebench/maltline
```

Open <http://127.0.0.1:5184/src/viewer/>.

| Input | Action |
| --- | --- |
| `←` `→` | select station (which flavor to blend) |
| `↑` `↓` | select window (which lane you face) |
| hold `SPACE` | blend at the selected station |
| `F` / `ENTER` | slide the held shake down the current window |
| `R` | restart the run |

## Rules

- Customers march from the door toward your counter. Serve them their flavor
  before they reach you, or you lose a life (**walkout**).
- A shake nobody catches smashes at the end of the lane (**lose a life, lose
  the jar**).
- After drinking, the customer slides the empty jar back. Be facing their
  lane when it arrives to send it to the wash; miss it and it smashes
  (**lose a life, lose the jar**).
- Customers caught past the halfway mark finish and leave; closer ones drink,
  return their jar, and get right back in line.
- Jars are a closed pool: blending takes one, washing returns one. Stages can
  starve you of jars before they starve you of time.
- Clear the line — every customer served and gone — to clear the stage.
  Survive all eight stages to close the shop.

## Design levers

Every mechanic is a scenario field (`src/core/types.ts`), and each campaign
stage (`src/core/campaign.ts`) is just a knob setting on them, in the spirit
of Partition's authored boards. The Tapper heritage: spawn interval and its
acceleration, march speed, crowding, and lane count. The Maltline additions:
menu breadth (which stations exist), blend dwell, wash time, jar pool size,
and the resume threshold that decides whether a served customer leaves or
re-queues.

## Status

Prototype for gameplay iteration. The benchmark plugin, protocol generation,
and site/launcher wiring follow the Partition pattern once the feel is right.

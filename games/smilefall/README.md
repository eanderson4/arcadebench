# Smilefall

**Cabinet 02 of ArcadeBench.** The smilies are falling and they all share one
steering wheel. Lean the whole sky at once, hop the flock over incoming rocks,
and stuff every bucket before you run out of grins.

```sh
npm run dev:smilefall
```

- Game: <http://127.0.0.1:5184/src/viewer/>
- Design system gallery: <http://127.0.0.1:5184/src/viewer/kit/>

Arrow keys (or A/D) lean **every** falling smiley at the same time. Space hops
the whole flock over a rock. `P` pauses, `R` restarts.

## Layout

```text
src/core/       deterministic fixed-point simulation, physics constants, replays
src/levels/     authored stages, the authoring toolbox, and stage validation
src/runtime/    continuous session: real-time clock, controller install, watch
src/viewer/     human viewer, canvas renderer, and the Sticker Arcade design system
tests/          engine rules, catalog validation, replay integrity, playability
```

- [docs/SPEC.md](docs/SPEC.md) — rules, tuning, outcomes, scoring.
- [docs/DESIGN.md](docs/DESIGN.md) — the Sticker Arcade design system.

## Design notes

The simulation is pure integer arithmetic on fixed-point coordinates, so a
scenario plus an input stream reproduces tick for tick — the same rule the rest
of ArcadeBench relies on for replays and benchmark evidence. Rendering reads
state and events and never writes back.

`tests/playability.test.ts` flies every stage with two pilots and asserts the
shape of the curve. A deliberately **naive** pilot answers "is this fair":
stage 01 must fall to it, *Wobble Row* and *Swarm Hour* must not, at least
three stages must survive it, and the rock-heavy stages must actually land
hits. A **climbing** pilot — which hops on purpose when it is below the mouth
it is aiming for — answers "is this possible at all", because the naive one
never climbs. Both are the tuning yardstick when levels change.

## Stages

| # | Stage | What it is for |
|---|-------|----------------|
| 01 | First Giggle | Teaches that lean moves the whole sky at once |
| 02 | Rock Season | Hop timing against volleys, paired drops |
| 03 | Wobble Row | Leading drifting buckets with a chonk in the way |
| 04 | Bucket Brigade | Steering in isolation — no rocks, fast-sliding buckets |
| 05 | Rock Alley | Hop economy — rock walls with exactly one gap |
| 06 | Split Decision | The thesis: corner buckets, centre drops, pick a side |
| 07 | Chonk Parade | The control group for `rockRule: 'smash'` on a splat floor |
| 08 | Swarm Hour | Volleys of three into five narrow pails |
| 09 | Smiley Storm | Volume: 64 smilies, 49 rocks, 20+ in the sky at once |
| 10 | Bounce House | A race: fixed roster of 12, nothing breaks, only value and time |
| 11 | Stair Master | The stacked tower: fill the ground floor and the camera pulls back |
| 12 | Pin Cushion | Soft floor, sharp sky — balloons and spikes |
| 13 | Second Wind | A miss is a lap, not a loss. Two corner pails, scored on speed |
| 14 | Low Ceiling | Ledges as obstacles: every pail has a roof, and one roof bites |
| 15 | Sky Ladder | The finale: four tiers, a spiked stairwell, rocks that pop |

## Two ways to lose

`rockRule` and `floorRule` decide what a mistake actually costs, per stage.

## Rocks bruise

A rock knocks a smiley up and sideways, leaves it frowning and worth half, and
grants a few ticks of flashing grace. Two bruises in and the next rock is the
last one. A bonk costs the combo, never a frown. Stages opt out with
`rockRule: 'smash'`: *Chonk Parade* does it on a splat floor, *Pin Cushion* and
*Sky Ladder* on a bouncy one, so the two rules can be felt back to back.

## The ground can bounce

`floorRule: 'bounce'` removes death from a stage entirely. The floor and the
rim hand the smiley straight back, bruised; full buckets keep burping instead
of giving up; and buckets grow solid sides below the rim, so a grounded smiley
has to be hopped back over. With a fixed roster and no way to lose one, the
clock becomes the whole game — every bruise halves what that smiley will
eventually pay, so a sloppy run finishes with twelve nearly worthless smilies.
*Bounce House* is the stage built on it, and *Second Wind* is the pure version:
a miss is a lap, not a loss.

## Ledges, tiers, and a camera

`platforms` are solid ledges. Landing on one bounces **for free** — no bruise —
because the staircase is the route the stage wants you to take; only the dirt
charges rent. `baseY` stands a pail on a ledge, so a stage can stack tiers of
them, and `viewHeight` says how much of a tall field the camera frames to start
with.

The camera frames the flock, the ground, and only the **next** objective — the
lowest pail that still has room. Frame every unfilled pail at once and the
whole tower is in the opening shot with nothing left to reveal; frame just the
next one and finishing the ground floor is what makes the view pull back.
*Stair Master* is the introduction to it and *Sky Ladder* is the finale.

Two numbers decide whether a staircase is climbable, and both fall out of the
physics: a free bounce lifts 3.2 units, so a rise much over three needs a hop;
and a ledge directly above another blocks the bounce off it unless they are six
units apart. `ledges()` in the authoring toolbox lays them out as a table so
both are visible at a glance.

## The roster is the fail condition

The run ends the moment there are fewer smilies left — in the air plus still to
drop — than there are slots left to fill. On a bouncy stage that is the *only*
thing that can end a run early, which is what makes a limited roster mean
something, and the HUD trades the frown meter for a **spare** meter: how many
more you can afford to lose before the next one is the run.

`spikes` are what spend that budget. A fixed bed of teeth on a surface, fatal
on contact — no bruise, no bounce. *Stair Master* spikes the ground under the
stairwell, so falling off the climb costs a smiley, and puts a strip on the far
end of each landing, so overshooting in the direction you are already
travelling is the thing that gets punished.

## Pop or bruise, told in the art

The player should never have to read the HUD to know whether the thing coming
at them ends a smiley. So the rule is the shape:

- a stage where nothing kills on contact draws **round, dopey boulders** and
  rubber-ball smilies;
- a stage with `rockRule: 'smash'` or any spike strip draws **jagged shards**
  with hot tips, matching beds of teeth, and smilies as **balloons** — glossy,
  taut, tied off at the bottom;
- a balloon does not get bonked, it **pops**: burst ring, shredded latex, and
  the biggest screen shake on the board.

No rock is ever a circle. A bruising one is a broken chunk of stone: eight
corners, wide swings in radius, jittered angles, hard straight edges, and
shaded wedges that read as flat fractured planes. A killing one is built from
strictly alternating tooth-and-notch vertices — that is what makes it jagged
rather than lumpy — with every tooth given its own length, width, and angle so
no two are alike. Both keep their longest point near the collision radius, so a
near miss never looks like a hit.

All of that rides on `hashString`, and it was quietly broken for a long time.
Plain FNV-1a barely avalanches, so keys differing only in their last character
— which is exactly how every shape is seeded, `rock:0`, `rock:1`, `rock:2` —
came back within a thousandth of each other. Every vertex of a rock drew the
same radius and the whole thing rendered as a regular polygon no matter how
much variance the code asked for. The murmur3 finaliser is what actually
scrambles it.

## Reading the shared steering

Four cues all say the same thing, because "one wheel drives all of them" is the
thing a new player has to understand first:

- every smiley **banks by the same angle** at the same moment — the strongest
  cue by far, because it shows the shared *command* rather than a connection;
- identical **speed lines** trailing each one, same length, same angle;
- **wind streaks** across the whole field while a lean is held;
- a **chevron** over every smiley, all pointing the same way at once;
- a HUD **steering wheel** that tilts with the input and counts who is obeying.

A hop fires one identical ring per smiley on the same tick, so the flock reads
as a single synchronised pop.

## Next up

- A `BenchmarkPlugin` so models can drive the game through the harness. The
  continuous session, controller install, telemetry sampling, and replay
  recording it needs are already here.
- Site routing: `scripts/build-site.mjs` still assembles Partition only.

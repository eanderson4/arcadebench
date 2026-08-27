# Smilefall specification (v0.1, unfrozen)

Smilefall is cabinet 02 of ArcadeBench. Smilies fall from the top of the field
and the player steers **all of them at once**. Buckets sit on the ground; rocks
fly in from the right. Fill every bucket before the smilies, the frowns, or the
clock run out.

## Field

- The field is a rectangle measured in **units**. Flat stages use 32 x 20;
  stacked ones are taller (up to 32 x 36) and set `viewHeight` to say how much
  of themselves the camera should frame to begin with.
- The engine runs at a fixed 30 ticks per second and never pauses for a
  controller or a model.
- Every simulated coordinate is fixed-point (`FIXED_SCALE = 1024`) integer
  arithmetic, so a scenario plus an input stream always reproduces tick for
  tick. See `src/core/physics.ts` for the tuning constants.

## Control

A tick of input is `{ lean: 'left' | 'right' | 'none', hop: boolean }`.

- **Lean** applies horizontal acceleration to *every* live smiley. There is one
  steering wheel for the whole sky; that shared control is the game.
- **Hop** is edge-triggered. On the rising edge it spends one hop charge and
  gives every live smiley the same upward impulse — the dodge verb against
  rocks. Charges refill on a fixed tick cadence.
- Releasing hop re-arms it. Holding hop does nothing after the first tick.

## Smilies

- Spawn from an authored drop schedule, at the top of the field or at the
  stage's `dropY` — a tall stage drops them partway down so the opening shot
  has somewhere to put them.
- Fall under gravity up to a terminal speed so a drop is always readable.
- Bounce off the side walls with damping and cannot leave the ceiling.
- A smiley is removed when it is caught, splatted, or smashed. A **bruised**
  smiley stays in play (see Rocks).

## Buckets

- A bucket stands `BUCKET_HEIGHT` tall on a base line and has a mouth line, a
  capacity, and optionally a horizontal drift range. The base is the field
  floor unless the stage sets `baseY`, which stands the pail on a ledge — that
  is what lets a stage stack tiers of them.
- A smiley whose centre crosses the mouth line:
  - inside the mouth and the bucket has room → **caught**;
  - inside the mouth and the bucket is full → **burped** back up with a
    sideways kick, and splats after `MAX_BOUNCES` burps;
  - on the rim (within `BUCKET_RIM` of either edge) → **splat**.
- A smiley that reaches the floor between buckets splats, unless the stage sets
  `floorRule: 'bounce'` (below).
- A drifting bucket does not scoop up smilies that are already below its mouth.

## Ledges

- A stage may place `platforms`: solid boxes with a top surface, an underside
  and two sides.
- Landing on top bounces at `LEDGE_BOUNCE` and emits `smiley_bounced`. Ledges
  **never bruise** — they are the route the stage wants you to take, and only
  the dirt charges rent for a landing.
- Bonking the underside kills upward velocity; the sides push a smiley clear
  with half its horizontal speed reversed.
- Two numbers govern whether a staircase is climbable, both falling out of the
  physics: a free bounce lifts `FLOOR_BOUNCE^2 / (2 * GRAVITY)` = 3.2 units, so
  a rise much over three needs a hop; and a ledge directly above another one
  blocks the bounce off it unless they are at least six units apart.

## Spike strips

- A stage may place `spikes`: fixed beds of teeth on a surface, pointing `up`
  or `down`, reaching `SPIKE_HEIGHT` off their line.
- Contact is fatal — no bruise, no bounce. It emits
  `smiley_splatted` with `reason: 'spikes'` and spends the smiley.
- Resolved before landings, so a bed on top of a ledge beats the ledge.
- Validation rejects a strip laid across a bucket mouth, which no amount of
  skill could work around.
- Spikes are the thing that gives a bouncy stage a real fail condition: with
  them, the roster means something.

## Rocks

- Rocks enter from the right edge on an authored schedule with a speed, a lane,
  an optional vertical drift, and a size (`pebble`, `boulder`, `chonk`).
- They bounce off the ceiling and the bucket line, so they never disturb the
  buckets, and despawn once they leave the left edge.
- Rock/smiley overlap is settled by the stage's `rockRule`. Rocks are
  unbothered either way.

### `rockRule: 'bruise'` (the default)

A rock knocks the smiley around instead of deleting it:

- upward `BONK_LIFT` and a `BONK_PUSH` shove along the rock's travel;
- `BONK_GRACE_TICKS` of invulnerability, so one rock cannot chain-hit;
- the smiley is now **bruised** — it frowns, and it is worth
  `BRUISED_CATCH_NUMERATOR / BRUISED_CATCH_DENOMINATOR` of the normal catch;
- a bonk **breaks the combo but costs no frown**;
- after `BRUISE_LIMIT` bonks the next rock smashes it for real.

### `floorRule: 'bounce'`

An opt-in rule that changes what a miss costs. Nothing on a bouncy stage can
remove a smiley:

- the **floor** throws it back up at `FLOOR_BOUNCE` and bruises it;
- the **rim** clonks it back up at `RIM_BOUNCE` and bruises it;
- a **full bucket** keeps burping it instead of eventually splatting it;
- buckets gain **solid sides** below the mouth line, so a grounded smiley
  cannot slide through a pail — it has to be hopped back over the rim.

The frown economy is therefore unreachable by construction and the clock is the
only threat, which is what makes a speed stage possible. The HUD swaps its
frown meter for a bruise tally on these stages.

### `rockRule: 'smash'`

The original rule: any rock contact removes the smiley and spends a frown. Only
stage 07 *Chonk Parade* uses it, deliberately, as the control group.

## Value

A catch pays `CATCH_BASE_POINTS` plus the combo bonus, then **halves once per
bruise** the smiley is carrying, down to `MIN_CATCH_POINTS`. Bruises cap at
`MAX_BRUISES`. So a battered smiley always still fills its slot — it just stops
being worth chasing.

A stage may override `TIME_BONUS_PER_TICK` with `timeBonusPerTick`. Stage 10
*Bounce House* sets it to 6, which makes finishing early worth several times
the catches themselves and turns the stage into a race.

## Outcome

Checked in this order at the end of every tick:

1. **Won** — every bucket is at capacity. A stage with a clock adds
   `TIME_BONUS_PER_TICK` per remaining tick.
2. **Lost / `too_grumpy`** — missed smilies reached the stage frown limit.
3. **Lost / `out_of_smilies`** — there are fewer smilies left, in the air plus
   still to drop, than there are slots left to fill. The run is arithmetically
   over, so it ends there rather than playing out the clock.
4. **Lost / `timeout`** — the tick clock ran out.

Rule 3 is the real budget on a stage where nothing splats: the roster. The
state exposes `smiliesRemaining`, `slotsRemaining` and `spareSmilies` so the
HUD can show how many more you can afford to lose, and authored stages set
`frownLimit` to agree with that arithmetic rather than run a second, quieter
budget underneath it.

## Score

- A catch is worth `100 + 25 x min(combo - 1, 8)`.
- The combo counts consecutive catches and resets on any miss.
- Winning adds the remaining clock as bonus points.

## Moods

The authored tier of a stage and the player-selected difficulty use the same
four ids: `giggle`, `chuckle`, `guffaw`, `cackle`. `applyMood` re-tunes the
frown limit and hop charges without touching the authored drop or rock
schedules, so the stage keeps its shape at every difficulty.

## Replays

`ContinuousSmilefallSession` records `{ tick, input, controllerVersion,
controlEvents, events }` per tick. `replaySmilefall` re-runs the scenario,
asserts that every recorded event matches, and validates the recorded final
state field by field. A replay is the evidence artifact for a run.

## Not built yet

- The `BenchmarkPlugin` (protocol, tools, system prompt, scoring) that would let
  a model drive the game through the harness. The engine, the continuous
  session, controller install, `watchGameplay` sampling, and replays are all in
  place for it.
- Leaderboard submission and the shared platform verifier.
- More stages: the catalog holds fifteen while the mechanics settle.

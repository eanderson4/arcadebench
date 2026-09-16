# Smilefall specification (v1.0)

Smilefall is ArcadeBench's third game. Smiles fall from the top of a field, and
one input steers every live smile at once. The player fills all buckets while
managing a shared hop meter, a limited smile reserve, and the clock.

## Play modes

### Arcade Run

The ranked arcade run contains ten stages in this fixed order:

1. First Giggle
2. Wobble Season
3. Bucket Brigade
4. Pin Cushion
5. Rock Alley
6. Split Decision
7. Swarm Hour
8. Stair Master
9. Low Ceiling
10. Sky Ladder

Stage score accumulates across the run. Winning opens the next stage; losing
ends the run. The first three stages have no lethal objects, stage four
introduces fixed spikes, stage five mixes plain and spiked rocks, and the final
three stages use tall rooms, walkways, spikes, and vertical routing.

Progression validation tracks each stage's declared mechanics. After the
opening lesson, a stage may introduce at most two mechanics that were not
present earlier in the run. The validator also enforces the early safe stages,
the stage-four lethal introduction, the stage-five hazard mix, and the three
vertical closing stages.

### Level Catalog

The catalog contains the ten arcade stages plus Bounce House, Second Wind,
Smiley Storm, and Chonk Parade. A catalog attempt runs one selected stage and
reports to that level's board. Catalog ordering and arcade ordering are
separate, so catalog additions do not silently change the ranked progression.

## Field and clock

- Coordinates are measured in field units. Standard stages are 32 x 20; tall
  stages reach 32 x 36 and use `viewHeight` as a renderer hint.
- The engine runs at 30 fixed ticks per second.
- Every simulated coordinate and velocity uses integer fixed-point arithmetic
  with `FIXED_SCALE = 1024`.
- Authored drop and rock schedules are sorted once, then consumed by cursors.
- Rendering, audio, camera motion, and visual effects read state and events but
  have no authority over simulation.

## Input

One tick of input is:

```ts
{ lean: 'left' | 'right' | 'none', hop: boolean }
```

- **Lean** applies horizontal acceleration to every live smile. Releasing lean
  lets horizontal motion decay, and side walls return motion with damping.
- **Hop** is edge-triggered. Its rising edge spends one shared charge and gives
  every live smile the same upward impulse. The input must be released before
  it can trigger again.
- Hop charges refill on a fixed tick cadence up to the stage's maximum.

The human viewer maps Left/Right and A/D to lean; Space, Up, and W to hop; and
P or Escape to pause. Equivalent pointer controls appear on touch layouts.

## Smiles and safe impacts

Smiles spawn from the authored schedule and fall under gravity up to a terminal
speed. Every smile uses the same round visual form throughout the game.

Ordinary geometry and plain rocks are nonlethal. The following contacts record
a `smiley_bruised` event and add one visible frown to that smile:

- a side wall or the ceiling;
- plain-rock contact;
- ordinary ground;
- a bucket rim;
- a full bucket returning the smile;
- a bucket body struck from the side;
- the top, underside, or side of a platform when struck.

A safe impact resets the combo and lowers the value of that smile's eventual
catch. It never removes the smile, regardless of how many previous impacts it
has taken. Plain-rock contact also grants a short grace period so one rock
cannot repeatedly collide with the same smile.

## Buckets

- A bucket has a mouth, capacity, fill count, and optional horizontal range.
- `baseY` may place a bucket on an authored platform; otherwise it stands on
  the ground.
- Crossing an open mouth inside its rim catches and removes the smile.
- Crossing near the rim returns the smile upward and records a safe impact.
- A full bucket returns subsequent smiles upward and records a safe impact.
- Bucket bodies are solid below their mouths, so a grounded smile must travel
  around or over them. Striking one from the side adds a frown.
- Moving buckets do not catch a smile that is already below the mouth line.

## Platforms and vertical rooms

Platforms are solid boxes with a top, underside, and sides. Contact resolves
along the nearest face. Landing on top bounces the smile upward; hitting another
face redirects or stops the relevant velocity. Every such impact is safe and
adds a frown.

Platforms can support elevated buckets and form stairs, roofs, and landings.
Tall stages use a shorter initial `viewHeight`; the renderer follows the flock,
the ground, and the next unfinished bucket to reveal the route progressively.

`LEDGE_BOUNCE` equals the ground impulse. At the release physics values, a
bounce rises about 3.2 units; a larger rise requires a hop. Platform thickness
also means vertically aligned steps need enough separation to avoid blocking
the route from below.

## Rocks and spikes

Every rock spawn has a size and a `hazard` value:

```ts
hazard: 'plain' | 'spiked'
```

Rocks enter from the right, can drift vertically, reflect between the ceiling
and the ground-level bucket line, and leave through the left edge.

- A **plain rock** has a blunt, faceted silhouette. Contact knocks the smile
  upward and sideways, adds a frown, lowers value, and breaks the combo.
- A **spiked rock** has alternating sharp teeth with hot tips. Contact emits
  `smiley_popped` and removes the smile immediately.
- A **spike strip** is a fixed bed of teeth attached to a surface. It may face
  up or down. Contact also emits `smiley_popped` and removes the smile.

Spike contact resolves before a platform landing, so visible teeth on a
landing own the collision. Level validation rejects a strip that blocks a
bucket mouth. Plain and spiked rocks can appear in the same stage; the object's
silhouette, rather than a stage-wide mode, communicates the result.

## Reserve and outcomes

For the current state:

```text
slots remaining  = sum(bucket capacity - bucket fill)
smiles remaining = live smiles + scheduled smiles not yet dropped
reserve          = smiles remaining - slots remaining
```

Each stage is authored with at least one reserve smile. A catch decreases both
remaining values, so reserve stays constant. A pop decreases only smiles
remaining, spending one reserve.

The engine checks terminal conditions after every tick in this order:

1. **Won:** every bucket is full. The remaining clock is converted to bonus
   points.
2. **Lost / `out_of_smilies`:** reserve has reached zero. The remaining roster
   can no longer absorb another loss while filling every slot.
3. **Lost / `timeout`:** the stage clock has expired.

Completion wins a same-tick tie because it is checked first.

## Score

A clean catch pays:

```text
100 + 25 x min(combo - 1, 8)
```

Each safe impact carried by that smile halves its catch value, down to
`MIN_CATCH_POINTS = 10`. Any safe impact or pop resets the live combo. Winning
adds `timeBonusPerTick x remaining ticks`; stages without an override use one
point per remaining tick.

## Difficulty moods

The four selectable difficulty ids are `giggle`, `chuckle`, `guffaw`, and
`cackle`. `applyMood` returns a retuned authored scenario and adjusts only:

- the number of scheduled smiles, which changes reserve;
- the time limit;
- the initial and maximum hop charges.

Giggle adds reserve, time, and a hop. Chuckle is the authored baseline. Guffaw
removes one reserve and tightens time. Cackle removes two reserve, removes a
hop, and tightens time further. The helper always retains at least one reserve
smile and leaves buckets, platforms, spikes, and rock schedules unchanged.

## Replay v2

`ContinuousSmilefallSession` records a version-2 replay tick after each engine
step. A replay contains:

- the scenario used for playback;
- contiguous tick numbers and applied inputs;
- the resident controller version and controller-install events;
- the engine events recorded on each tick;
- the recorded final state.

`replaySmilefall` constructs a fresh engine, applies every input, and requires
the regenerated events to match. It also requires every recorded final-state
field to match the reconstructed state. This format supports local playback,
tests, and agent evidence; its embedded scenario is never ranking authority.

## Ranked proof and platform contract

A ranked attempt begins with a shared ArcadeBench challenge that binds a run
identifier and nonce to the current game version, competition, board,
difficulty, and optional level id. The client submits an input-only proof:

- an arcade proof contains one contiguous input stream per attempted stage;
- a level proof contains exactly its challenged catalog level;
- no client-authored scenario, events, final state, or derived score is trusted.

The platform verifier reconstructs each registered scenario, applies the
selected mood, simulates the submitted inputs, and derives the authoritative
result. Arcade stages must follow the official order, stop at the first loss,
and include all ten stages to claim completion. Tick and stage limits bound
verification work. The claimed score must exactly match the derived summary.

The challenge nonce deterministically chooses whether each ranked level uses
its authored layout or a full horizontal mirror. Drops, pails, platforms,
spikes, drift ranges, and rock entry direction mirror together. This preserves
the geometry and scoring opportunity while making the required input stream
specific to the issued challenge.

The shared platform exposes two current board families:

- `arcade`, keyed by difficulty;
- `level`, keyed by difficulty and level id.

Arcade results rank completion, stages cleared, score, elapsed ticks, and pops.
Level results rank completion, score, elapsed ticks, pops, and catches. Every
catalog level is also a registered feedback subject with an overall
thumbs-up/down vote and an optional private note. Notes are never public
comments and expire after 90 days.

The launch competition does not roll over on a calendar schedule. Monthly
seasons remain disabled until automatic rollover and historical board browsing
ship together under ArcadeBench's leaderboard versioning policy.

## Continuous agent runtime

`ContinuousSmilefallSession` can run from a real-time interval or explicit
ticks. A resident `SmilefallController` receives the latest state and events
and remains responsible for input between external model calls. Installing a
controller increments its version and records the change in replay evidence.

`watchGameplay` observes a bounded future window, samples immutable state at a
requested cadence, returns all events in that window, and caps responses at
120 state samples. Terminal sessions resolve immediately. This keeps the
deterministic engine useful to both the human viewer and future benchmark
harnesses without giving either one a separate rules implementation.

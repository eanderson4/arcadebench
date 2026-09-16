# Smilefall

**ArcadeBench's third game.** One steering wheel controls every falling smile.
Lean the flock around hazards, spend shared hop charges, and fill every bucket
before the clock or the smile reserve runs out.

```sh
npm run dev:smilefall
```

- Game: <http://127.0.0.1:5186/src/viewer/>
- Design system gallery: <http://127.0.0.1:5186/src/viewer/kit/>

## Controls

- **Lean:** Left/Right or A/D moves every live smile together.
- **Hop:** Space, Up, or W bumps the whole flock upward. Hop charges refill.
- **Pause:** P or Escape.
- **Touch:** the play screen provides left, hop, and right controls.

Enter starts an arcade run from the title screen. Leaving an active run asks
for confirmation before discarding its unsaved result.

## Ways to play

- **Arcade Run** is the official ten-stage progression. Score carries across
  its stages, and losing a stage ends the run.
- **Level Catalog** exposes all fourteen release stages as individual games.
  Each level has its own leaderboard and community feedback controls.

Both modes can be played at Giggle, Chuckle, Guffaw, or Cackle difficulty.
The selected mood adjusts the number of reserve smiles, the clock, and the
initial hop charges while keeping authored geometry and hazard schedules intact.

## The readable rule

The object tells the player what a collision will do:

- Walls, floors, buckets, platforms, and plain rocks are safe. An impact
  redirects the smile, turns it into a frown, breaks the combo, and lowers that
  smile's eventual catch value.
- Spike strips and visibly spiked rocks pop a smile immediately.
- Smiles keep one consistent round design. Damage changes their expression;
  lethality is always shown by the object they hit.

Every level begins with more smiles than open bucket slots. The difference is
the **reserve** shown in the HUD. Each popped smile spends one reserve; reaching
zero ends the level unless the final bucket was completed on that tick. Time is
the other way to lose.

## Release catalog

| # | Stage | Role |
|---:|---|---|
| 01 | First Giggle | Shared steering, hopping, wide buckets, and safe ground |
| 02 | Wobble Season | Gently moving buckets and the first plain rocks |
| 03 | Bucket Brigade | Paired drops and faster moving targets, with no lethal hazards |
| 04 | Pin Cushion | The first spike strips and an explicit reserve budget |
| 05 | Rock Alley | Plain and spiked rocks mixed into walls with readable gaps |
| 06 | Split Decision | Corner buckets, central streams, and early route commitment |
| 07 | Swarm Hour | Three-wide volleys, narrow buckets, and mixed rock traffic |
| 08 | Stair Master | The first vertical room, walkways, and spiked landings |
| 09 | Low Ceiling | Low roofs, downward spikes, and a folded vertical route |
| 10 | Sky Ladder | Stacked buckets and a final climb through every hazard family |
| 11 | Bounce House | Catalog time trial for fast, clean catches |
| 12 | Second Wind | Long safe traversals between two deep corner buckets |
| 13 | Smiley Storm | Four-wide crowd control through a dense plain-rock field |
| 14 | Chonk Parade | A silhouette-reading challenge with giant plain and spiked rocks |

Stages 1–10 form the arcade run. Stages 11–14 are catalog challenges and do
not lengthen the official progression.

## Scoring and public boards

A clean catch pays 100 points plus 25 for each combo step, capped after eight
steps. Every safe impact halves that smile's catch value down to a ten-point
minimum and resets the combo. Winning also converts remaining clock ticks into
a stage-specific time bonus.

Smilefall uses the shared ArcadeBench platform:

- a current public competition board for the arcade run, split by difficulty;
- current level boards, split by level and difficulty;
- server verification from an official level plus the submitted input stream;
- thumbs-up/down feedback and an optional private note on every catalog level;
- optional permission to use a saved replay in ArcadeBench social media.

There is no public comment system. Private notes are visible only to
ArcadeBench maintainers and expire after 90 days. Local development uses a
device-only score preview. If a production challenge is unavailable, the game
remains playable as an unranked attempt.

Monthly rollover stays disabled until automatic rollover and historical board
browsing ship together, as required by ArcadeBench's leaderboard policy.

## Determinism, replays, and agents

The engine uses integer fixed-point coordinates and advances at 30 ticks per
second. Given the same official scenario and inputs, it reproduces state and
events tick for tick. Rendering consumes snapshots and events but cannot write
back into simulation state.

Version-2 replay artifacts are self-contained records for playback and tests:
they include the scenario, applied input and controller version for each tick,
recorded events, and the final state. Playback re-simulates the run and rejects
event or final-state mismatches.

Ranked submissions use a narrower, input-only proof. The server ignores any
client-authored level or score, reconstructs the registered game version and
difficulty, simulates the contiguous inputs, derives the result, and then
compares it with the claimed score. Arcade proofs must follow the official
ten-stage order and stop at the first failed stage. The unsigned 32-bit run
nonce feeds the challenge-v2 per-level transform: it may mirror the complete
field, shifts each drop wave by at most 0.6 units and ten ticks, and similarly
varies bounded rock-wave timing, height, and entry side. Same-tick formations
stay together, nearby rock walls keep their spacing, and every ranked clock
receives the same ten-tick extension. This binds the input stream to the issued
challenge without changing the authored routes or response window.

`ContinuousSmilefallSession` supplies the agent-facing runtime. A resident
controller can keep acting while an external model thinks, `watchGameplay`
returns bounded state samples and events, and `replay()` exports the version-2
evidence artifact.

## Layout

```text
src/core/       deterministic engine, fixed-point physics, replay playback
src/levels/     14-stage catalog, 10-stage arcade progression, validation
src/runtime/    continuous clock, resident controller, bounded observation
src/viewer/     title, catalog, game, audio, boards, feedback, canvas renderer
src/verifier.ts input-only ranked proof validation and official simulation
tests/          rules, progression, replay, verifier, and playability checks
```

- [docs/SPEC.md](docs/SPEC.md) documents the release rules and platform contract.
- [docs/DESIGN.md](docs/DESIGN.md) documents the Sticker Arcade visual system.

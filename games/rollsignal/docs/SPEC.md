# Roll Signal specification

## Play rule

The marble begins on an authored deck. A run clears when it enters the goal. Tone rings are optional score opportunities; missed rings award no points and never lock the goal. Checkpoints update the deterministic respawn point. Leaving all deck geometry causes an immediate fall, adds the course's fall penalty to effective time, and respawns the marble with zero velocity. A run ends when effective time reaches the course limit.

The two steering axes are discrete. Steering accelerates the marble, while drag preserves useful momentum. Brace reduces acceleration and maximum speed and greatly increases drag. Slick decks retain more momentum. Wind and conveyor zones apply integer acceleration. Rails, closed relay gates, and deterministic moving obstacles use circle-versus-rectangle collision.

## Determinism boundary

- The engine advances exactly 60 ticks per second.
- Position, velocity, obstacle geometry, and acceleration use integer fixed point with `FIXED_SCALE = 1000`.
- Authored course geometry uses world units and is converted once at the engine boundary.
- Moving obstacles use an integer triangle wave. There is no random source or wall-clock read.
- The engine has no projection, canvas, audio, DOM, or animation-frame dependency.
- `snapshot()` deep clones every nested mutable value.

The viewer divides fixed-point values by `FIXED_SCALE`, then projects the resulting 2D world coordinate onto its isometric presentation plane.

## Course contract

Each course provides decks, optional rails, checkpoints, tone rings, one goal, and reference waypoints. Optional systems are force zones, moving obstacles, relay pads, and gates. Gate collision disappears after all of its required pads activate. A course validation pass checks geometry, IDs, references, limits, bounds, and waypoint support.

The eight-course campaign is:

1. **First Chime** — momentum, brace, rails, and checkpoints.
2. **Silver Switchbacks** — braking through a zigzag line.
3. **Glass Current** — low-drag slick deck.
4. **Crosswind Causeway** — opposed fan zones.
5. **Brass Transit** — angled conveyor forces.
6. **Clockwork Crossing** — deterministic moving bars.
7. **Relay Run** — paired signal pads and a retracting gate.
8. **Signal Crown** — a combined final exam.

Every course stores reference waypoints and a maximum reference time. The deterministic reference controller test clears all eight without a fall.

## Replay contract

Replay version 1 embeds the complete course plus one validated input and the emitted events for every contiguous tick. Artifacts are capped at 2 MB and 36,000 ticks. Playback reconstructs the run through a fresh engine and rejects any event or final-state mismatch. These rules keep replays portable and make tampering or incompatible formats fail closed.

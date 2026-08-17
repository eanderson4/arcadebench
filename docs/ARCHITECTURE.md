# ArcadeBench architecture

ArcadeBench separates model orchestration from game semantics. The harness
knows how to talk to a model, route tools, track usage, and persist a run. A
game adapter knows how to create a session, describe its tools, handle a tool
call, score the result, and produce replay artifacts.

## Process model

```text
model provider <-> harness <-> game session
                     |             |
                     |             +-> authoritative simulation
                     |             +-> resident controller (when supported)
                     |
                     +-> run manifest / transcript / event log / artifacts

viewer/board <---------- read-only replay and run consumers
```

Turn-based games advance only through accepted game actions. Continuous games
such as Partition own a fixed-tick clock that keeps advancing while the
harness waits for the model. This difference is declared as a game capability;
it is not embedded into the generic model loop.

## Package responsibilities

### `@arcadebench/bench-core`

- Stable TypeScript contracts for games, protocols, runs, usage, scores, and
  artifacts.
- Validation and serialization of immutable run manifests.
- Append-only event recording and resumable run indexing.
- Protocol identity and compatibility checks.

### `@arcadebench/harness`

- Provider-neutral conversation driver.
- Tool-call routing into a game session.
- Retry, timeout, checkpoint, and context policies.
- Transcript and token/cost accounting.
- No game-specific scoring or lifecycle assumptions.

### Game packages

Each game supplies a `BenchmarkPlugin`. The plugin owns:

- Protocol generations and scenario configuration.
- System instructions and function-tool definitions.
- Session creation and game-specific tool handling.
- Score calculation and replay artifacts.
- A viewer that consumes artifacts without influencing simulation.

## Continuous control

Partition uses three logical actors:

1. The engine owns the clock, game state, score, and applied-input log.
2. A sandboxed resident controller consumes state and produces control input
   within a per-tick budget.
3. The slower LLM observes sampled telemetry and atomically replaces the
   resident controller while the old controller continues to run.

All state, input, and controller-update messages carry ticks. Live runs record
the tick at which asynchronous updates actually took effect. Locked-controller
evaluation runs a fixed controller across hidden scenarios without model calls.

## Compatibility rule

A published protocol is immutable. Changes to prompts, tool schemas, game
rules, scoring, seeds, attempt policy, or uncertainty/dynamics create a new
generation. Code may move between packages only when compatibility tests prove
that the published behavior and artifacts are unchanged.

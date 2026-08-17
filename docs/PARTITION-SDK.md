# Partition SDK (`dev-0`)

Partition is a continuous benchmark. Creating a session starts its fixed-tick
clock immediately. The engine keeps advancing while a provider request is in
flight, while a model reasons, and after a watch request returns.

## Tools

### `get_status`

Returns a tick-stamped current state. The result can already be stale when the
model reads it.

### `set_input`

Sets the latched joystick directly:

```json
{ "direction": "left", "draw": "off" }
```

The signal remains active until replaced. Direct control is possible but model
latency makes it deliberately weak for precise play.

### `update_controller`

Atomically installs a resident timed program. The old controller remains
active until the new version is installed at a tick boundary.

```json
{
  "program": {
    "steps": [
      { "ticks": 12, "input": { "direction": "left", "draw": "off" } },
      { "ticks": 30, "input": { "direction": "up", "draw": "fast" } }
    ],
    "fallback": { "direction": "idle", "draw": "off" }
  }
}
```

This is the first controller format. A sandboxed source-controller format will
add state-dependent arbitrary policies without changing the asynchronous game
contract.

### `watch_gameplay`

Subscribes to an already-running interval:

```json
{ "ticks": 120, "sampleEveryTicks": 10 }
```

The resident controller receives every control tick. The model receives only
the requested samples plus exact events. A request may return at most 120 state
samples to prevent accidental context floods.

## Timing evidence

Controller installation results include `installedAtTick`. Watch results
include `fromTick`, `toTick`, and `controllerVersion`. Every applied joystick
input is stored in the deterministic replay, while model/tool latency is stored
in the family-wide run event log.

## Planned controller source contract

The source controller will implement:

```ts
interface PartitionController<Memory> {
  reset(state: Readonly<PartitionState>): Memory;
  onTick(
    state: Readonly<PartitionState>,
    events: readonly GameEvent[],
    memory: Memory,
  ): ControlInput | null;
}
```

It will run in a separately terminable sandbox with no network, filesystem,
wall clock, process environment, or hidden seed access.


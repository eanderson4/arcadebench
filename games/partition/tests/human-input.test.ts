import { describe, expect, it } from 'vitest';
import { PartitionEngine } from '../src/core/engine';
import { replayPartitionFrames } from '../src/core/replay';
import type { PartitionReplay, PartitionScenario, ReplayTick } from '../src/core/types';
import { PartitionHumanInput } from '../src/viewer/human-input';

const scenario: PartitionScenario = {
  id: 'press-trace', name: 'Press trace', width: 6, height: 6,
  ticksPerSecond: 30, sparkMoveEveryTicks: 2, integrity: 3, targetFraction: 0.99,
  anomalies: [
    { id: 'left', position: [1, 1], velocity: [0, 0] },
    { id: 'right', position: [5, 5], velocity: [0, 0] },
  ],
};
function setup(config = scenario) {
  const engine = new PartitionEngine(config);
  const input = new PartitionHumanInput();
  const ticks: ReplayTick[] = [];
  const step = () => {
    const applied = input.sample(engine.snapshot());
    engine.setInput(applied);
    const result = engine.step();
    input.observe(result);
    ticks.push({ tick: result.state.tick, input: applied, controllerVersion: 0, controlEvents: [], events: result.events });
    return result;
  };
  return { engine, input, ticks, step };
}

describe('Partition press-to-start human input', () => {
  it('buffers a released Space press until a valid directional move, and replays exact engine inputs', () => {
    const { engine, input, step, ticks } = setup();
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    for (let i = 0; i < 120; i++) step();
    expect(engine.snapshot().spark.drawing).toBe(false);
    expect(input.isTraceArmed()).toBe(true);
    input.keyDown('ArrowUp', engine.snapshot());
    expect(step().events.some(event => event.type === 'trace_started')).toBe(true);
    expect(input.isTraceArmed()).toBe(false);
    for (let i = 0; i < 10; i++) step();
    expect(engine.snapshot().spark.drawing).toBe(false);
    expect(engine.snapshot().spark.position).toEqual({ x: 3, y: 0 });
    const replay: PartitionReplay = { version: 1, scenario, ticks, finalState: engine.snapshot() };
    expect(replayPartitionFrames(replay).at(-1)!.state).toEqual(engine.snapshot());
    expect(ticks.filter(tick => tick.input.direction === 'up' && tick.input.draw === 'fast')).toHaveLength(1);
  });

  it('preserves arming during safe wall movement and a short direction tap between movement ticks', () => {
    const { engine, input, step } = setup();
    step();
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    input.keyDown('ArrowLeft', engine.snapshot()); input.keyUp('ArrowLeft');
    step(); step();
    expect(engine.snapshot().spark.position).toEqual({ x: 2, y: 6 });
    expect(input.isTraceArmed()).toBe(true);
    input.keyDown('ArrowUp', engine.snapshot());
    step(); step();
    expect(engine.snapshot().spark.drawing).toBe(true);
  });

  it('does not repeatedly arm from holding/repeat or queue Space presses made during a trace', () => {
    const { engine, input, step } = setup();
    input.keyDown('Space', engine.snapshot()); input.keyDown('ArrowUp', engine.snapshot());
    step();
    input.keyDown('Space', engine.snapshot(), true);
    input.keyUp('Space'); input.keyDown('Space', engine.snapshot());
    for (let i = 0; i < 10; i++) step();
    input.keyUp('ArrowUp'); input.keyDown('ArrowRight', engine.snapshot()); step(); step();
    input.keyUp('ArrowRight'); input.keyDown('ArrowDown', engine.snapshot());
    step(); step();
    expect(engine.snapshot().spark.drawing).toBe(false);
    expect(engine.snapshot().spark.position).toEqual({ x: 4, y: 0 });
  });

  it('accepts a new press immediately after reconnection without the engine release latch swallowing it', () => {
    const { engine, input, step } = setup({ ...scenario, sparkMoveEveryTicks: 1 });
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    input.keyDown('ArrowUp', engine.snapshot());
    for (let i = 0; i < 6; i++) step();
    input.keyUp('ArrowUp'); input.keyDown('ArrowRight', engine.snapshot());
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    expect(step().state.spark.position).toEqual({ x: 3, y: 0 });
    expect(step().state.spark.position).toEqual({ x: 4, y: 0 });
    input.keyUp('ArrowRight'); input.keyDown('ArrowDown', engine.snapshot());
    expect(step().state.spark.drawing).toBe(true);
  });

  it('retains a short direction tap through the required post-reconnection release tick', () => {
    const { engine, input, step } = setup({ ...scenario, sparkMoveEveryTicks: 1,
      initialWalls: Array.from({ length: 6 }, (_, x) => ({ ax: x, ay: 3, bx: x + 1, by: 3 })),
    });
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    input.keyDown('ArrowUp', engine.snapshot());
    for (let i = 0; i < 3; i++) step();
    input.keyUp('ArrowUp');
    expect(engine.snapshot().spark.drawing).toBe(false);
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    input.keyDown('ArrowUp', engine.snapshot()); input.keyUp('ArrowUp');
    expect(step().state.spark.drawing).toBe(false);
    expect(step().state.spark.drawing).toBe(true);
    expect(engine.snapshot().spark.position).toEqual({ x: 3, y: 2 });
  });

  it('clears trace intent after a severed cut and permits a fresh press', () => {
    const { engine, input, step } = setup({ ...scenario, sparkMoveEveryTicks: 1,
      anomalies: [{ id: 'hit', position: [3, 5], velocity: [0, 0] }] });
    input.keyDown('Space', engine.snapshot()); input.keyDown('ArrowUp', engine.snapshot());
    expect(step().events.some(event => event.type === 'trace_hit')).toBe(true);
    expect(input.isTraceArmed()).toBe(false);
    input.keyDown('Space', engine.snapshot(), true);
    expect(step().state.spark.drawing).toBe(false);
    input.keyUp('Space'); input.keyDown('Space', engine.snapshot());
    expect(input.isTraceArmed()).toBe(true);
  });

  it.each(['keyboard', 'touch'] as const)('carries held %s controls through a won stage into a fresh stage without another press', device => {
    const { engine, input, step } = setup({ ...scenario, sparkMoveEveryTicks: 1,
      targetFraction: 0.5, anomalies: [{ id: 'left', position: [1, 1], velocity: [0, 0] }] });
    if (device === 'keyboard') {
      input.keyDown('Space', engine.snapshot()); input.keyDown('ArrowUp', engine.snapshot());
    } else {
      input.pointerDown(1, 'trace', engine.snapshot()); input.pointerDown(2, 'up', engine.snapshot());
    }
    for (let i = 0; i < 6; i++) step();
    expect(engine.snapshot().status).toBe('won');
    expect(input.isTraceArmed()).toBe(false);
    const next = new PartitionEngine({ ...scenario, id: 'stage-2' });
    input.nextStage();
    next.setInput(input.sample(next.snapshot()));
    const result = next.step(); input.observe(result);
    expect(result.state.spark.position).toEqual({ x: 3, y: 5 });
    expect(result.state.spark.drawing).toBe(true);
    if (device === 'keyboard') { input.keyUp('Space'); input.keyUp('ArrowUp'); }
    else { input.pointerUp(1); input.pointerUp(2); }
    expect(input.sample(result.state)).toEqual({ direction: 'idle', draw: 'off' });
  });

  it('carries a held direction without implicitly arming; drops old queued taps at stage changes', () => {
    const { engine, input } = setup();
    input.keyDown('ArrowLeft', engine.snapshot());
    input.keyDown('Space', engine.snapshot()); input.keyUp('Space');
    input.nextStage();
    expect(input.sample(engine.snapshot())).toEqual({ direction: 'left', draw: 'off' });
    input.keyUp('ArrowLeft');
    input.keyDown('ArrowUp', engine.snapshot()); input.keyUp('ArrowUp');
    input.nextStage();
    expect(input.sample(engine.snapshot())).toEqual({ direction: 'idle', draw: 'off' });
  });

  it('uses the latest held direction and falls back when it is released', () => {
    const { engine, input } = setup();
    input.keyDown('ArrowLeft', engine.snapshot()); input.keyDown('ArrowUp', engine.snapshot());
    expect(input.sample(engine.snapshot()).direction).toBe('up');
    input.keyUp('ArrowUp'); expect(input.sample(engine.snapshot()).direction).toBe('left');
  });

  it('touch taps and native button activation arm without holding, while cancel discards intent', () => {
    const { engine, input, step } = setup();
    input.pointerDown(4, 'trace', engine.snapshot()); input.pointerUp(4);
    input.pointerDown(5, 'up', engine.snapshot()); input.pointerUp(5);
    expect(step().state.spark.drawing).toBe(true);
    input.reset();
    const fresh = new PartitionEngine(scenario).snapshot();
    input.pointerDown(6, 'trace', fresh); input.pointerCancel(6);
    expect(input.isTraceArmed()).toBe(false);
    input.tapTrace(fresh); expect(input.isTraceArmed()).toBe(true);
  });

  it('hard resets for restart, mode changes, and focus loss clear all devices and stale repeats', () => {
    const { engine, input } = setup();
    input.keyDown('Space', engine.snapshot()); input.keyDown('ArrowUp', engine.snapshot());
    input.pointerDown(4, 'left', engine.snapshot());
    input.reset(); input.keyDown('Space', engine.snapshot(), true); input.keyDown('ArrowUp', engine.snapshot(), true);
    input.nextStage();
    expect(input.sample(engine.snapshot())).toEqual({ direction: 'idle', draw: 'off' });
  });
});

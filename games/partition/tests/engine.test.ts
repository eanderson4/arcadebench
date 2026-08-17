import { describe, expect, it } from 'vitest';
import { PartitionEngine } from '../src/core/engine';
import { createClassicScenario } from '../src/core/scenarios';
import type { PartitionScenario } from '../src/core/types';

describe('PartitionEngine', () => {
  it('is deterministic for a scenario and input stream', () => {
    const a = new PartitionEngine(createClassicScenario(11));
    const b = new PartitionEngine(createClassicScenario(11));
    const inputs = [
      { direction: 'left', draw: 'off' },
      { direction: 'left', draw: 'off' },
      { direction: 'up', draw: 'fast' },
      ...Array.from({ length: 15 }, () => ({ direction: 'up', draw: 'fast' } as const)),
    ] as const;
    for (const input of inputs) {
      a.setInput(input);
      b.setInput(input);
      expect(a.step()).toEqual(b.step());
    }
  });

  it('does not move off a safe wall without drawing', () => {
    const engine = new PartitionEngine(createClassicScenario(11));
    const start = engine.snapshot().spark.position;
    engine.setInput({ direction: 'up', draw: 'off' });
    engine.step();
    expect(engine.snapshot().spark.position).toEqual(start);
    expect(engine.snapshot().spark.drawing).toBe(false);
  });

  it('starts a vulnerable trace when draw is held into the field', () => {
    const engine = new PartitionEngine(createClassicScenario(11));
    engine.setInput({ direction: 'up', draw: 'fast' });
    const result = engine.step();
    expect(result.state.spark.drawing).toBe(true);
    expect(result.state.trace).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'trace_started')).toBe(true);
  });

  it('completes a partition and stabilizes the empty component', () => {
    const scenario: PartitionScenario = {
      id: 'capture-test',
      name: 'Capture test',
      width: 4,
      height: 4,
      ticksPerSecond: 30,
      targetFraction: 0.5,
      integrity: 1,
      anomalies: [{ id: 'a1', position: [1, 2], velocity: [0, 0] }],
    };
    const engine = new PartitionEngine(scenario);
    engine.setInput({ direction: 'up', draw: 'fast' });
    const events = Array.from({ length: 4 }, () => engine.step()).flatMap((result) => result.events);
    expect(engine.snapshot().capturedFraction).toBe(0.5);
    expect(engine.snapshot().status).toBe('won');
    expect(events.some((event) => event.type === 'trace_completed')).toBe(true);
  });

  it('stops at an existing wall until draw is released and rearmed', () => {
    const scenario: PartitionScenario = {
      id: 'wall-stop-test',
      name: 'Wall stop test',
      width: 6,
      height: 6,
      ticksPerSecond: 30,
      targetFraction: 0.99,
      integrity: 1,
      anomalies: [
        { id: 'a1', position: [1, 1], velocity: [0, 0] },
        { id: 'a2', position: [5, 5], velocity: [0, 0] },
      ],
    };
    const engine = new PartitionEngine(scenario);

    // Build the first permanent wall from bottom to top at x=3.
    engine.setInput({ direction: 'up', draw: 'fast' });
    for (let index = 0; index < 6; index++) engine.step();
    engine.setInput({ direction: 'idle', draw: 'off' });
    engine.step();

    // Travel to the left boundary, then cut right into that previous wall.
    engine.setInput({ direction: 'left', draw: 'off' });
    for (let index = 0; index < 3; index++) engine.step();
    engine.setInput({ direction: 'down', draw: 'off' });
    for (let index = 0; index < 3; index++) engine.step();
    engine.setInput({ direction: 'right', draw: 'fast' });
    for (let index = 0; index < 3; index++) engine.step();

    expect(engine.snapshot().spark.position).toEqual({ x: 3, y: 3 });
    expect(engine.snapshot().trace).toHaveLength(0);

    // A held/reapplied draw signal must not continue through the wall.
    engine.setInput({ direction: 'right', draw: 'fast' });
    engine.step();
    expect(engine.snapshot().spark.position).toEqual({ x: 3, y: 3 });
    expect(engine.snapshot().spark.drawing).toBe(false);
    expect(engine.snapshot().trace).toHaveLength(0);

    // Releasing draw rearms it for a deliberate new cut on the other side.
    engine.setInput({ direction: 'idle', draw: 'off' });
    engine.step();
    engine.setInput({ direction: 'right', draw: 'fast' });
    engine.step();
    expect(engine.snapshot().spark.position).toEqual({ x: 4, y: 3 });
    expect(engine.snapshot().spark.drawing).toBe(true);
  });

  it('loses integrity when an anomaly crosses the active trace', () => {
    const scenario: PartitionScenario = {
      id: 'collision-test',
      name: 'Collision test',
      width: 4,
      height: 4,
      ticksPerSecond: 30,
      targetFraction: 0.75,
      integrity: 2,
      anomalies: [{ id: 'a1', position: [1.7, 2.5], velocity: [0.2, 0] }],
    };
    const engine = new PartitionEngine(scenario);
    engine.setInput({ direction: 'up', draw: 'fast' });
    engine.step();
    const result = engine.step();
    expect(result.events.some((event) => event.type === 'trace_hit')).toBe(true);
    expect(result.state.spark.integrity).toBe(1);
    expect(result.state.trace).toHaveLength(0);
  });

  it('enters the terminal failure state at zero integrity', () => {
    const scenario: PartitionScenario = {
      id: 'failure-test',
      name: 'Failure test',
      width: 4,
      height: 4,
      ticksPerSecond: 30,
      targetFraction: 0.75,
      integrity: 1,
      anomalies: [{ id: 'a1', position: [2, 3.2], velocity: [0, 0] }],
    };
    const engine = new PartitionEngine(scenario);
    engine.setInput({ direction: 'up', draw: 'fast' });
    const result = engine.step();

    expect(result.state.spark.integrity).toBe(0);
    expect(result.state.status).toBe('lost');
    expect(result.events.map((event) => event.type)).toEqual([
      'trace_started',
      'trace_hit',
      'game_lost',
    ]);
  });
});

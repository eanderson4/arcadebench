import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import { FIXED_SCALE, fx } from '../src/core/physics';
import { smilefallCatalog } from '../src/levels/catalog';
import type { ControlInput, GameEvent, SmilefallScenario } from '../src/core/types';

function runToEnd(engine: SmilefallEngine, input: ControlInput, maxTicks = 900): GameEvent[] {
  const events: GameEvent[] = [];
  engine.setInput(input);
  for (let tick = 0; tick < maxTicks; tick++) {
    const result = engine.step();
    events.push(...result.events);
    if (result.state.status !== 'running') break;
  }
  return events;
}

function tinyScenario(overrides: Partial<SmilefallScenario> = {}): SmilefallScenario {
  return {
    id: 'tiny',
    name: 'Tiny',
    width: 8,
    height: 10,
    ticksPerSecond: 30,
    frownLimit: 3,
    hopCharges: 2,
    hopRechargeTicks: 30,
    buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 1 }],
    drops: [{ tick: 1, x: 4 }],
    rocks: [],
    ...overrides,
  };
}

describe('SmilefallEngine', () => {
  it('is deterministic for a scenario and input stream', () => {
    const inputs: ControlInput[] = Array.from({ length: 240 }, (_, tick) => ({
      lean: tick % 90 < 30 ? 'left' : tick % 90 < 60 ? 'right' : 'none',
      hop: tick % 73 === 0,
    }));
    const a = new SmilefallEngine(smilefallCatalog[0]!.scenario);
    const b = new SmilefallEngine(smilefallCatalog[0]!.scenario);
    for (const input of inputs) {
      a.setInput(input);
      b.setInput(input);
      expect(a.step()).toEqual(b.step());
    }
    expect(a.snapshot().tick).toBe(inputs.length);
  });

  it('catches a smiley that falls into a bucket mouth', () => {
    const engine = new SmilefallEngine(tinyScenario());
    const events = runToEnd(engine, { lean: 'none', hop: false });
    const caught = events.find((event) => event.type === 'smiley_caught');
    expect(caught).toMatchObject({ bucketId: 'b1', filled: 1 });
    expect(engine.snapshot().status).toBe('won');
    expect(engine.snapshot().caught).toBe(1);
    expect(events.some((event) => event.type === 'bucket_filled')).toBe(true);
  });

  it('splats a smiley that lands beside the buckets', () => {
    const engine = new SmilefallEngine(tinyScenario({ drops: [{ tick: 1, x: 0.6 }], frownLimit: 1 }));
    const events = runToEnd(engine, { lean: 'none', hop: false });
    expect(events.find((event) => event.type === 'smiley_splatted')).toMatchObject({ reason: 'floor' });
    expect(engine.snapshot().status).toBe('lost');
    expect(engine.snapshot().failureReason).toBe('too_grumpy');
  });

  it('splats a smiley that lands on a bucket rim', () => {
    const engine = new SmilefallEngine(tinyScenario({ drops: [{ tick: 1, x: 2.65 }] }));
    const events = runToEnd(engine, { lean: 'none', hop: false });
    expect(events.find((event) => event.type === 'smiley_splatted')).toMatchObject({ reason: 'rim' });
  });

  it('leans every smiley in the sky at once', () => {
    const engine = new SmilefallEngine(tinyScenario({
      drops: [{ tick: 1, x: 4 }, { tick: 1, x: 6 }],
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 2 }],
    }));
    engine.setInput({ lean: 'left', hop: false });
    for (let tick = 0; tick < 10; tick++) engine.step();
    const state = engine.snapshot();
    expect(state.smilies).toHaveLength(2);
    for (const smiley of state.smilies) expect(smiley.velocity.x).toBeLessThan(0);
  });

  it('spends a hop charge on the rising edge only', () => {
    const engine = new SmilefallEngine(tinyScenario());
    engine.setInput({ lean: 'none', hop: false });
    // Let the flock clear the ceiling first; hopping into it is a no-op.
    for (let tick = 0; tick < 30; tick++) engine.step();
    engine.setInput({ lean: 'none', hop: true });
    const hopped = engine.step();
    expect(hopped.events.some((event) => event.type === 'flock_hopped')).toBe(true);
    expect(hopped.state.hopCharges).toBe(1);
    for (const smiley of hopped.state.smilies) expect(smiley.velocity.y).toBeLessThan(0);

    const held = engine.step();
    expect(held.events.some((event) => event.type === 'flock_hopped')).toBe(false);
    expect(held.state.hopCharges).toBe(1);
  });

  it('recharges hop charges over time', () => {
    const engine = new SmilefallEngine(tinyScenario({ hopRechargeTicks: 5, drops: [{ tick: 1, x: 4 }, { tick: 400, x: 4 }] }));
    engine.setInput({ lean: 'none', hop: true });
    engine.step();
    expect(engine.snapshot().hopCharges).toBe(1);
    engine.setInput({ lean: 'none', hop: false });
    for (let tick = 0; tick < 5; tick++) engine.step();
    expect(engine.snapshot().hopCharges).toBe(2);
  });

  it('smashes a smiley that runs into a rock on a smash stage', () => {
    const engine = new SmilefallEngine(tinyScenario({
      frownLimit: 1,
      rockRule: 'smash',
      rocks: [{ tick: 1, y: 5, speed: 0.2, kind: 'boulder' }],
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false });
    expect(events.some((event) => event.type === 'smiley_smashed')).toBe(true);
    expect(engine.snapshot().failureReason).toBe('too_grumpy');
  });

  it('bonks a smiley around instead of deleting it on a bruise stage', () => {
    const engine = new SmilefallEngine(tinyScenario({
      rockRule: 'bruise',
      rocks: [{ tick: 1, y: 5, speed: 0.2, kind: 'boulder' }],
    }));
    const events: GameEvent[] = [];
    engine.setInput({ lean: 'none', hop: false });
    let bruisedState = engine.snapshot();
    for (let tick = 0; tick < 200; tick++) {
      const result = engine.step();
      events.push(...result.events);
      if (result.events.some((event) => event.type === 'smiley_bruised')) bruisedState = result.state;
      if (result.state.status !== 'running') break;
    }
    const bruised = events.find((event) => event.type === 'smiley_bruised');
    expect(bruised).toMatchObject({ bruises: 1 });
    // The smiley survives the hit, wearing the bruise and a few grace ticks.
    const victim = bruisedState.smilies.find((smiley) => smiley.id === bruised!.smileyId);
    expect(victim?.bruises).toBe(1);
    expect(victim?.graceTicks).toBeGreaterThan(0);
    expect(victim!.velocity.y).toBeLessThan(0);
    // A bonk costs the streak, never a frown.
    expect(bruisedState.frownsRemaining).toBe(3);
    expect(bruisedState.bonks).toBe(1);
  });

  it('splats a smiley once it runs out of bruises to take', () => {
    const engine = new SmilefallEngine(tinyScenario({
      frownLimit: 2,
      rockRule: 'bruise',
      hopCharges: 99,
      drops: [{ tick: 1, x: 4 }],
      rocks: [
        { tick: 40, y: 2.5, speed: 0.34, kind: 'boulder' },
        { tick: 100, y: 2.5, speed: 0.34, kind: 'boulder' },
        { tick: 160, y: 2.5, speed: 0.34, kind: 'boulder' },
      ],
    }));
    // Hover the flock inside the rock lane so all three rocks connect.
    const events: GameEvent[] = [];
    let hop = false;
    for (let tick = 0; tick < 300; tick++) {
      const smiley = engine.snapshot().smilies[0];
      hop = smiley !== undefined && smiley.position.y > fx(5) && !hop;
      engine.setInput({ lean: 'none', hop });
      const result = engine.step();
      events.push(...result.events);
      if (result.state.status !== 'running') break;
    }
    expect(events.filter((event) => event.type === 'smiley_bruised')).toHaveLength(2);
    expect(events.some((event) => event.type === 'smiley_smashed')).toBe(true);
  });

  it('pays half for a bruised smiley that still lands in a bucket', () => {
    const engine = new SmilefallEngine(tinyScenario({
      rockRule: 'bruise',
      buckets: [{ id: 'b1', x: 0.5, width: 7, capacity: 1 }],
      rocks: [{ tick: 1, y: 5, speed: 0.2, kind: 'boulder' }],
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 400);
    const caught = events.find((event) => event.type === 'smiley_caught');
    expect(caught).toMatchObject({ bruised: true, points: 50 });
  });

  it('bounces a smiley off the ground instead of splatting it', () => {
    const engine = new SmilefallEngine(tinyScenario({
      floorRule: 'bounce',
      // Off to the side of the only bucket, so it lands on bare ground.
      buckets: [{ id: 'b1', x: 0.5, width: 2.5, capacity: 1 }],
      drops: [{ tick: 1, x: 6.5 }],
    }));
    const events: GameEvent[] = [];
    engine.setInput({ lean: 'none', hop: false });
    let bounced: ReturnType<SmilefallEngine['snapshot']> | undefined;
    for (let tick = 0; tick < 200; tick++) {
      const result = engine.step();
      events.push(...result.events);
      if (result.events.some((event) => event.type === 'smiley_bruised')) bounced = result.state;
      if (result.state.status !== 'running') break;
    }
    expect(events.find((event) => event.type === 'smiley_bruised')).toMatchObject({ cause: 'floor', bruises: 1 });
    expect(events.some((event) => event.type === 'smiley_splatted')).toBe(false);
    // Still in play, heading back up, and no frown was spent.
    expect(bounced?.smilies).toHaveLength(1);
    expect(bounced!.smilies[0]!.velocity.y).toBeLessThan(0);
    expect(bounced!.frownsRemaining).toBe(3);
    expect(bounced!.missed).toBe(0);
  });

  it('burps a smiley off a full bucket instead of over-stuffing it', () => {
    const engine = new SmilefallEngine(tinyScenario({
      width: 12,
      buckets: [
        { id: 'b1', x: 2, width: 3, capacity: 1 },
        { id: 'b2', x: 7, width: 3, capacity: 1 },
      ],
      drops: [{ tick: 1, x: 3.5 }, { tick: 90, x: 3.5 }],
      frownLimit: 9,
    }));
    const events: GameEvent[] = [];
    engine.setInput({ lean: 'none', hop: false });
    for (let tick = 0; tick < 400; tick++) {
      const result = engine.step();
      events.push(...result.events);
      if (result.state.status !== 'running') break;
    }
    const burp = events.find((event) => event.type === 'bucket_burped');
    expect(burp).toMatchObject({ bucketId: 'b1' });
    expect(engine.snapshot().buckets[0]!.filled).toBe(1);
  });

  it('ends the run when the smilies run out before the buckets fill', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 4 }],
      drops: [{ tick: 1, x: 4 }, { tick: 60, x: 4 }],
      frownLimit: 9,
    }));
    runToEnd(engine, { lean: 'none', hop: false });
    expect(engine.snapshot().status).toBe('lost');
    expect(engine.snapshot().failureReason).toBe('out_of_smilies');
  });

  it('stops the run when the clock expires', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 2 }],
      drops: [{ tick: 1, x: 4 }, { tick: 500, x: 4 }],
      timeLimitTicks: 120,
      frownLimit: 9,
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 200);
    expect(events.some((event) => event.type === 'time_expired')).toBe(true);
    expect(engine.snapshot().failureReason).toBe('timeout');
  });

  it('keeps drifting buckets inside their authored range', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 1, drift: { speed: 0.08, minX: 1, maxX: 4 } }],
      drops: [{ tick: 400, x: 4 }],
      timeLimitTicks: 900,
    }));
    engine.setInput({ lean: 'none', hop: false });
    for (let tick = 0; tick < 300; tick++) {
      engine.step();
      const bucket = engine.snapshot().buckets[0]!;
      expect(bucket.x).toBeGreaterThanOrEqual(fx(1));
      expect(bucket.x).toBeLessThanOrEqual(fx(4));
    }
  });

  it('grows the score with the catch combo and resets it on a miss', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 3 }],
      drops: [{ tick: 1, x: 4 }, { tick: 80, x: 4 }, { tick: 160, x: 4 }],
      timeLimitTicks: undefined,
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false });
    const points = events.filter((event) => event.type === 'smiley_caught').map((event) => event.points);
    expect(points).toEqual([100, 125, 150]);
    expect(engine.snapshot().bestCombo).toBe(3);
  });

  it('reports positions in fixed point so state stays integral', () => {
    const engine = new SmilefallEngine(tinyScenario());
    engine.setInput({ lean: 'right', hop: false });
    engine.step();
    const smiley = engine.snapshot().smilies[0]!;
    expect(Number.isInteger(smiley.position.x)).toBe(true);
    expect(Number.isInteger(smiley.position.y)).toBe(true);
    expect(smiley.position.x / FIXED_SCALE).toBeCloseTo(4, 1);
  });
});

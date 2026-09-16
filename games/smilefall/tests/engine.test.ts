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
    hopCharges: 2,
    hopRechargeTicks: 30,
    timeLimitTicks: 900,
    buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 1 }],
    // One required smile plus one reserve. Zero reserve is terminal.
    drops: [{ tick: 1, x: 4 }, { tick: 600, x: 4 }],
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
  });

  it('catches a smiley that falls into a bucket mouth', () => {
    const engine = new SmilefallEngine(tinyScenario());
    const events = runToEnd(engine, { lean: 'none', hop: false });
    expect(events.find((event) => event.type === 'smiley_caught'))
      .toMatchObject({ bucketId: 'b1', filled: 1 });
    expect(engine.snapshot()).toMatchObject({ status: 'won', caught: 1 });
  });

  it('leans every smiley in the sky at once', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 2 }],
      drops: [{ tick: 1, x: 4 }, { tick: 1, x: 6 }, { tick: 600, x: 4 }],
    }));
    engine.setInput({ lean: 'left', hop: false });
    for (let tick = 0; tick < 10; tick++) engine.step();
    for (const smiley of engine.snapshot().smilies) expect(smiley.velocity.x).toBeLessThan(0);
  });

  it('spends a hop charge on the rising edge only', () => {
    const engine = new SmilefallEngine(tinyScenario());
    for (let tick = 0; tick < 30; tick++) engine.step();
    engine.setInput({ lean: 'none', hop: true });
    const hopped = engine.step();
    expect(hopped.events.some((event) => event.type === 'flock_hopped')).toBe(true);
    expect(hopped.state.hopCharges).toBe(1);
    const held = engine.step();
    expect(held.events.some((event) => event.type === 'flock_hopped')).toBe(false);
    expect(held.state.hopCharges).toBe(1);
  });

  it('recharges hop charges over time', () => {
    const engine = new SmilefallEngine(tinyScenario({ hopRechargeTicks: 5 }));
    engine.setInput({ lean: 'none', hop: true });
    engine.step();
    engine.setInput({ lean: 'none', hop: false });
    for (let tick = 0; tick < 5; tick++) engine.step();
    expect(engine.snapshot().hopCharges).toBe(2);
  });

  it('always bounces and frowns on ordinary ground', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 0.5, width: 2.5, capacity: 1 }],
      drops: [{ tick: 1, x: 6.5 }, { tick: 600, x: 1.5 }],
    }));
    const events: GameEvent[] = [];
    let bounced = engine.snapshot();
    for (let tick = 0; tick < 200; tick++) {
      const result = engine.step();
      events.push(...result.events);
      if (result.events.some((event) => event.type === 'smiley_bounced' && event.surface === 'floor')) {
        bounced = result.state;
        break;
      }
    }
    expect(events.some((event) => event.type === 'smiley_bruised' && event.cause === 'floor')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
    expect(bounced.smilies[0]!.velocity.y).toBeLessThan(0);
    expect(bounced.smilies[0]!.bruises).toBe(1);
    expect(bounced.reserveSmilies).toBe(1);
  });

  it('bounces and frowns on a bucket rim without spending reserve', () => {
    const engine = new SmilefallEngine(tinyScenario({
      drops: [{ tick: 1, x: 2.65 }, { tick: 600, x: 4 }],
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 180);
    expect(events.some((event) => event.type === 'smiley_bruised' && event.cause === 'rim')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_bounced' && event.surface === 'rim')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
  });

  it('frowns when a smiley hits the side of the room', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 5, width: 2.5, capacity: 1 }],
      drops: [{ tick: 1, x: 0.7 }, { tick: 600, x: 6 }],
    }));
    const events = runToEnd(engine, { lean: 'left', hop: false }, 80);
    expect(events.some((event) => event.type === 'smiley_bruised' && event.cause === 'wall')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
  });

  it('frowns when a smiley rebounds from a bucket wall', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 4, width: 3, capacity: 1 }],
      drops: [{ tick: 1, x: 3, y: 8.5 }, { tick: 600, x: 5.5 }],
    }));
    const events = runToEnd(engine, { lean: 'right', hop: false }, 260);
    expect(events.some((event) => event.type === 'smiley_bruised' && event.cause === 'bucket')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
  });

  it('frowns on a platform landing without killing the smiley', () => {
    const engine = new SmilefallEngine(tinyScenario({
      height: 12,
      buckets: [{ id: 'b1', x: 0, width: 2.5, capacity: 1 }],
      platforms: [{ id: 'p1', x: 2, y: 5, width: 4 }],
      drops: [{ tick: 1, x: 4 }, { tick: 600, x: 1 }],
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 180);
    expect(events.some((event) => event.type === 'smiley_bruised' && event.cause === 'platform')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_bounced' && event.surface === 'ledge')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
  });

  it('plain rocks can bruise the same smiley repeatedly but never pop it', () => {
    const engine = new SmilefallEngine(tinyScenario({
      hopCharges: 99,
      buckets: [{ id: 'b1', x: 0, width: 2.5, capacity: 1 }],
      drops: [{ tick: 1, x: 4 }, { tick: 700, x: 1 }],
      rocks: [
        { tick: 40, y: 2.5, speed: 0.34, kind: 'boulder', hazard: 'plain' },
        { tick: 110, y: 2.5, speed: 0.34, kind: 'boulder', hazard: 'plain' },
        { tick: 180, y: 2.5, speed: 0.34, kind: 'boulder', hazard: 'plain' },
      ],
    }));
    const events: GameEvent[] = [];
    let hop = false;
    for (let tick = 0; tick < 280; tick++) {
      const smiley = engine.snapshot().smilies[0];
      hop = smiley !== undefined && smiley.position.y > fx(5) && !hop;
      engine.setInput({ lean: 'none', hop });
      events.push(...engine.step().events);
    }
    expect(events.filter((event) => event.type === 'smiley_bruised' && event.cause === 'rock').length)
      .toBeGreaterThanOrEqual(2);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
    expect(engine.snapshot().status).toBe('running');
  });

  it('a visibly spiked rock pops immediately', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 0, width: 2.5, capacity: 1 }],
      drops: [{ tick: 1, x: 4 }, { tick: 600, x: 1 }],
      rocks: [{ tick: 1, y: 5, speed: 0.2, kind: 'boulder', hazard: 'spiked' }],
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 250);
    expect(events.find((event) => event.type === 'smiley_popped'))
      .toMatchObject({ cause: 'spiked_rock', sourceId: 'r1' });
    expect(engine.snapshot().failureReason).toBe('out_of_smilies');
  });

  it('the fifth pop spends a five-smile reserve and ends the stage', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 5, width: 2.5, capacity: 1 }],
      drops: [
        ...Array.from({ length: 5 }, (_, index) => ({ tick: 1, x: 0.7 + index * 0.6, y: 5 })),
        { tick: 1, x: 6, y: 2 },
      ],
      spikes: [{ id: 'death-bed', x: 0, y: 5.4, width: 4 }],
    }));
    expect(engine.snapshot().reserveSmilies).toBe(5);
    const result = engine.step();
    expect(result.events.filter((event) => event.type === 'smiley_popped')).toHaveLength(5);
    expect(result.state).toMatchObject({
      status: 'lost',
      failureReason: 'out_of_smilies',
      reserveSmilies: 0,
      missed: 5,
    });
  });

  it('completion wins when the final reserve is spent on the same tick', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 5, width: 2.8, capacity: 1 }],
      drops: [
        ...Array.from({ length: 5 }, (_, index) => ({ tick: 1, x: 0.7 + index * 0.6, y: 7.795 })),
        { tick: 1, x: 6.2, y: 7.795 },
      ],
      spikes: [{ id: 'death-bed', x: 0, y: 7.8, width: 4 }],
    }));
    const result = engine.step();
    expect(result.events.filter((event) => event.type === 'smiley_popped')).toHaveLength(5);
    expect(result.events.some((event) => event.type === 'smiley_caught')).toBe(true);
    expect(result.state).toMatchObject({ status: 'won', reserveSmilies: 0 });
  });

  it('pays less for a bruised smiley that still reaches a bucket', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 0.5, width: 7, capacity: 1 }],
      rocks: [{ tick: 1, y: 5, speed: 0.2, kind: 'boulder', hazard: 'plain' }],
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 400);
    expect(events.find((event) => event.type === 'smiley_caught'))
      .toMatchObject({ bruised: true, points: 50 });
  });

  it('stops when the clock expires', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 2 }],
      drops: [{ tick: 1, x: 0.6 }, { tick: 500, x: 0.6 }, { tick: 600, x: 0.6 }],
      timeLimitTicks: 120,
    }));
    const events = runToEnd(engine, { lean: 'none', hop: false }, 200);
    expect(events.some((event) => event.type === 'time_expired')).toBe(true);
    expect(engine.snapshot().failureReason).toBe('timeout');
  });

  it('keeps drifting buckets inside their authored range', () => {
    const engine = new SmilefallEngine(tinyScenario({
      buckets: [{ id: 'b1', x: 2.5, width: 3, capacity: 1, drift: { speed: 0.08, minX: 1, maxX: 4 } }],
      drops: [{ tick: 500, x: 4 }, { tick: 700, x: 4 }],
    }));
    for (let tick = 0; tick < 300; tick++) {
      engine.step();
      expect(engine.snapshot().buckets[0]!.x).toBeGreaterThanOrEqual(fx(1));
      expect(engine.snapshot().buckets[0]!.x).toBeLessThanOrEqual(fx(4));
    }
  });

  it('keeps simulated positions integral', () => {
    const engine = new SmilefallEngine(tinyScenario());
    engine.setInput({ lean: 'right', hop: false });
    engine.step();
    const smiley = engine.snapshot().smilies[0]!;
    expect(Number.isInteger(smiley.position.x)).toBe(true);
    expect(Number.isInteger(smiley.position.y)).toBe(true);
    expect(smiley.position.x / FIXED_SCALE).toBeCloseTo(4, 1);
  });
});

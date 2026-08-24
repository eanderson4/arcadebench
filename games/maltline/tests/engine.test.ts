import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import { replayMaltline } from '../src/core/replay';
import type { GameEvent, MaltlineInput, MaltlineScenario } from '../src/core/types';
import { IDLE_INPUT } from '../src/core/types';

function input(partial: Partial<MaltlineInput> = {}): MaltlineInput {
  return { ...IDLE_INPUT, ...partial };
}

function testScenario(overrides: Partial<MaltlineScenario> = {}): MaltlineScenario {
  return {
    id: 'test',
    name: 'Test',
    ticksPerSecond: 60,
    lanes: 1,
    laneLength: 100,
    stations: ['vanilla'],
    jarPoolSize: 5,
    blendTicks: 10,
    washTicks: 20,
    drinkTicks: 20,
    customerCount: 1,
    spawnIntervalTicks: 60,
    spawnAccelerationTicks: 0,
    spawnIntervalFloorTicks: 60,
    marchSpeed: 0.02,
    leaveSpeed: 1,
    slideSpeed: 2,
    returnSpeed: 2,
    resumeExitThreshold: 0,
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    lives: 3,
    seed: 42,
    ...overrides,
  };
}

function runTicks(engine: MaltlineEngine, inputs: MaltlineInput[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const tickInput of inputs) {
    engine.setInput(tickInput);
    const result = engine.step();
    events.push(...result.events);
    if (result.state.status !== 'running') break;
  }
  return events;
}

function repeat(count: number, make: (tick: number) => MaltlineInput = () => input()): MaltlineInput[] {
  return Array.from({ length: count }, (_, tick) => make(tick));
}

describe('MaltlineEngine', () => {
  it('serves a full round: blend, slide, catch, drink, jar, exit, stage clear', () => {
    const engine = new MaltlineEngine(testScenario());
    // Wait for the spawn (30-tick initial delay), blend 10 ticks, serve.
    const events = runTicks(engine, [
      ...repeat(40),
      ...repeat(12, () => input({ blend: true })),
      ...repeat(1, () => input({ serve: true })),
      ...repeat(400),
    ]);

    const types = events.map((event) => event.type);
    expect(types).toContain('customer_spawned');
    expect(types).toContain('blend_completed');
    expect(types).toContain('shake_launched');
    expect(types).toContain('served');
    expect(types).toContain('jar_returned');
    expect(types).toContain('jar_caught');
    expect(types).toContain('customer_exited');
    expect(types).toContain('stage_cleared');

    const final = engine.snapshot();
    expect(final.status).toBe('won');
    // 100 serve + 25 jar catch + 250×3 lives bonus.
    expect(final.score).toBe(875);
    expect(final.jarsAvailable).toBe(final.washing.length > 0 ? 4 : 5);
  });

  it('loses a life and the game when a customer walks out', () => {
    const engine = new MaltlineEngine(testScenario({
      marchSpeed: 5,
      lives: 1,
    }));
    const events = runTicks(engine, repeat(60));

    expect(events.map((event) => event.type)).toContain('walkout');
    expect(events.find((event) => event.type === 'life_lost')).toMatchObject({ reason: 'walkout', lives: 0 });
    expect(engine.snapshot().status).toBe('lost');
  });

  it('smashes a wrong-flavor shake that nobody catches', () => {
    const scenario = testScenario({
      stations: ['vanilla', 'chocolate'],
      // Predict the first customer's flavor with the same seeded sequence.
      seed: 7,
    });
    const rng = mulberry32(scenario.seed);
    const firstFlavor = scenario.stations[Math.floor(rng() * scenario.stations.length)]!;
    const wrongStation = firstFlavor === 'vanilla' ? 1 : 0;

    const engine = new MaltlineEngine(scenario);
    const events = runTicks(engine, [
      ...repeat(40),
      // Move to the station the customer is NOT ordering from.
      ...repeat(wrongStation, () => input({ stationDir: 1 })),
      ...repeat(12, () => input({ blend: true })),
      ...repeat(1, () => input({ serve: true })),
      ...repeat(300),
    ]);

    expect(events.map((event) => event.type)).toContain('shake_smashed');
    expect(events.find((event) => event.type === 'life_lost')).toMatchObject({ reason: 'shake_smashed' });
  });

  it('smashes a returning jar when the player is in another lane', () => {
    const scenario = testScenario({ lanes: 2 });
    // Same seeded sequence the engine draws: first pick flavor, then lane.
    const rng = mulberry32(scenario.seed);
    rng();
    const customerLane = Math.floor(rng() * 2);

    const engine = new MaltlineEngine(scenario);
    const events = runTicks(engine, [
      ...repeat(40),
      // Post up in the customer's lane to serve them.
      ...repeat(customerLane, () => input({ laneDir: 1 })),
      ...repeat(12, () => input({ blend: true })),
      ...repeat(1, () => input({ serve: true })),
      ...repeat(3, () => input({ laneDir: 1 })),
      // Toggled three times → now posted in the wrong lane while the jar
      // slides home to the customer's lane.
      ...repeat(400),
    ]);

    expect(events.map((event) => event.type)).toContain('jar_smashed');
    expect(events.find((event) => event.type === 'life_lost')).toMatchObject({ reason: 'jar_smashed' });
  });

  it('carries run context between stages', () => {
    const engine = new MaltlineEngine(testScenario(), { lives: 2, score: 500 });
    const snapshot = engine.snapshot();
    expect(snapshot.lives).toBe(2);
    expect(snapshot.score).toBe(500);
  });

  it('conserves jars across a messy scripted run', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const engine = new MaltlineEngine(scenario);
    const inputs = repeat(4000, (tick) => input({
      stationDir: tick % 97 < 4 ? 1 : tick % 97 < 8 ? -1 : 0,
      laneDir: tick % 149 < 3 ? 1 : tick % 149 < 6 ? -1 : 0,
      blend: tick % 61 !== 0,
      serve: tick % 83 === 0 || tick % 83 === 1 ? false : tick % 47 < 2,
    }));
    const events = runTicks(engine, inputs);

    let smashed = 0;
    for (const event of events) {
      if (event.type === 'shake_smashed' || event.type === 'jar_smashed') smashed++;
    }
    const state = engine.snapshot();
    const drinking = state.customers.filter((customer) => customer.phase === 'drinking').length;
    const held = (state.player.holding !== null ? 1 : 0) + (state.player.blending !== null ? 1 : 0);
    const accounted = state.jarsAvailable + state.washing.length + held
      + state.slides.length + state.jars.length + drinking;
    expect(accounted).toBe(scenario.jarPoolSize - smashed);
  });

  it('is deterministic for identical inputs, and replays rebuild the run', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const script = repeat(3000, (tick) => input({
      stationDir: tick % 71 < 3 ? 1 : tick % 71 < 6 ? -1 : 0,
      laneDir: tick % 53 < 2 ? 1 : 0,
      blend: tick % 29 !== 0,
      serve: tick % 37 < 1,
    }));

    const first = new MaltlineEngine(scenario);
    const second = new MaltlineEngine(scenario);
    for (let i = 0; i < script.length; i++) {
      first.setInput(script[i]!);
      second.setInput(script[i]!);
      const a = first.step();
      second.step();
      if (i % 500 === 0) {
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(second.snapshot()));
      }
    }
    expect(JSON.stringify(first.snapshot())).toBe(JSON.stringify(second.snapshot()));

    const replay = replayMaltline(scenario, { lives: scenario.lives, score: 0 }, script);
    expect(JSON.stringify(replay.finalState)).toBe(JSON.stringify(first.snapshot()));
    expect(replay.ticks.length).toBeGreaterThan(0);
  });
});

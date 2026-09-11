import { describe, expect, it } from 'vitest';
import { FIXED_SCALE, MaltlineEngine } from '../src/core/engine';
import { createMaltlineResolutionHarness } from '../src/testing/resolution-harness';
import type {
  GameEvent,
  MaltlineInput,
  MaltlineScenario,
} from '../src/core/types';
import { IDLE_INPUT } from '../src/core/types';

function scenario(overrides: Partial<MaltlineScenario> = {}): MaltlineScenario {
  return {
    id: 'resolution-test',
    name: 'Resolution test',
    ticksPerSecond: 60,
    lanes: 1,
    laneLength: 10,
    stations: ['vanilla'],
    jarPoolSize: 5,
    blendTicks: 1,
    washTicks: 1,
    drinkTicks: 2,
    customerCount: 1,
    spawnIntervalTicks: 60,
    spawnAccelerationTicks: 0,
    spawnIntervalFloorTicks: 60,
    marchSpeed: 0.1,
    leaveSpeed: 10,
    slideSpeed: 10,
    returnSpeed: 10,
    resumeExitThreshold: 0.9,
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    lives: 3,
    seed: 42,
    ...overrides,
  };
}

function step(engine: MaltlineEngine, input: MaltlineInput = IDLE_INPUT): GameEvent[] {
  engine.setInput(input);
  return engine.step().events;
}

function run(engine: MaltlineEngine, ticks: number, input: MaltlineInput = IDLE_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let index = 0; index < ticks && engine.snapshot().status === 'running'; index++) {
    events.push(...step(engine, input));
  }
  return events;
}

describe('Maltline scoring and customer resolution', () => {
  it('clamps a non-positive carried life total into an immutable loss', () => {
    const engine = new MaltlineEngine(scenario(), { lives: -2, score: 500 });
    const initial = engine.snapshot();

    expect(initial).toMatchObject({ status: 'lost', lives: 0, score: 500, tick: 0 });
    engine.setInput({ stationDir: 1, laneDir: 1, blend: true, serve: true });
    expect(engine.step()).toEqual({ state: initial, events: [] });
  });

  it('scores a customer once, permits one late requeue, and then resolves it', () => {
    const engine = new MaltlineEngine(scenario());
    const events = run(engine, 40);

    // First late service: blend, launch, drink, and catch the scored jar.
    events.push(...step(engine, { ...IDLE_INPUT, blend: true }));
    events.push(...step(engine, { ...IDLE_INPUT, blend: true }));
    events.push(...step(engine, { ...IDLE_INPUT, serve: true }));
    events.push(...step(engine));
    events.push(...step(engine, { ...IDLE_INPUT, blend: true }));

    // Blend during the resume, then serve the same customer a second time.
    events.push(...step(engine, { ...IDLE_INPUT, blend: true }));
    events.push(...step(engine, { ...IDLE_INPUT, serve: true }));
    events.push(...run(engine, 10));

    const serves = events.filter((event) => event.type === 'served');
    const catches = events.filter((event) => event.type === 'jar_caught');
    expect(serves).toEqual([
      expect.objectContaining({ firstFulfillment: true, points: 100, exitAfterDrink: false }),
      expect.objectContaining({ firstFulfillment: false, points: 0, exitAfterDrink: true }),
    ]);
    expect(catches).toEqual([
      expect.objectContaining({ points: 25 }),
      expect.objectContaining({ points: 0 }),
    ]);

    const state = engine.snapshot();
    expect(state).toMatchObject({
      status: 'won',
      score: 875,
      streak: 1,
      serviceActions: 2,
      fulfilled: 1,
      walkouts: 0,
      resolved: 1,
      exited: 1,
    });

    // Every possible score source is explicit in the event ledger, and the
    // formerly repeatable one-customer strategy has a finite 875-point ceiling.
    const ledgerScore = events.reduce((total, event) => {
      if (event.type === 'served' || event.type === 'jar_caught') return total + event.points;
      if (event.type === 'stage_cleared') return total + event.bonus;
      return total;
    }, 0);
    expect(ledgerScore).toBe(state.score);
  });

  it('counts a walkout as resolved without counting it as fulfilled or exited', () => {
    const engine = new MaltlineEngine(scenario({
      laneLength: 1,
      marchSpeed: 2,
      lives: 2,
    }));
    const events = run(engine, 40);

    expect(events.map((event) => event.type)).toEqual([
      'customer_spawned',
      'walkout',
      'life_lost',
      'stage_cleared',
    ]);
    expect(engine.snapshot()).toMatchObject({
      status: 'won',
      lives: 1,
      score: 250,
      serviceActions: 0,
      fulfilled: 0,
      walkouts: 1,
      resolved: 1,
      exited: 0,
    });
  });

  it('clamps lives at zero and stops resolving customers after a fatal walkout', () => {
    const engine = new MaltlineEngine(scenario({
      laneLength: 1,
      customerCount: 2,
      spawnIntervalTicks: 1,
      spawnIntervalFloorTicks: 1,
      marchSpeed: 0.1,
      lives: 1,
    }));
    let before = engine.snapshot();
    let events: GameEvent[] = [];
    while (engine.snapshot().status === 'running') {
      before = engine.snapshot();
      events = step(engine);
    }

    expect(events.map((event) => event.type)).toEqual(['walkout', 'life_lost', 'game_lost']);
    const untouched = before.customers.find((customer) => customer.id === 2)!;
    expect(engine.snapshot()).toMatchObject({
      status: 'lost',
      lives: 0,
      walkouts: 1,
      resolved: 1,
      customers: [expect.objectContaining({ id: 2, x: untouched.x })],
    });
  });

  it('does not catch or score a later jar after an earlier jar is fatal on the same tick', () => {
    const testScenario = scenario({
      lanes: 2,
      customerCount: 2,
      jarPoolSize: 2,
      lives: 1,
    });
    const { engine, initialState } = createMaltlineResolutionHarness({
      scenario: testScenario,
      run: { lives: 1, score: 0 },
      state: {
        tick: 100,
        scenarioId: testScenario.id,
        status: 'running',
        score: 210,
        lives: 1,
        streak: 2,
        player: { lane: 0, station: 0, holding: null, blending: null, blendProgress: 0 },
        customers: [],
        slides: [],
        jars: [
          { id: 5, customerId: 1, lane: 1, x: 0, catchBonusEligible: true },
          { id: 6, customerId: 2, lane: 0, x: 0, catchBonusEligible: true },
        ],
        washing: [],
        spawned: 2,
        serviceActions: 2,
        fulfilled: 2,
        walkouts: 0,
        resolved: 2,
        exited: 2,
        currentInput: IDLE_INPUT,
      },
    });

    const events = step(engine);

    expect(events.map((event) => event.type)).toEqual(['jar_smashed', 'life_lost', 'game_lost']);
    expect(engine.snapshot()).toMatchObject({
      status: 'lost',
      lives: 0,
      score: initialState.score,
      washing: [],
      resolved: initialState.resolved,
      jars: [expect.objectContaining({ id: 6, x: 0, catchBonusEligible: true })],
    });
  });

  it('keeps the complete terminal state immutable across input and step calls', () => {
    const engine = new MaltlineEngine(scenario({
      laneLength: 1,
      marchSpeed: 2,
      lives: 1,
    }));
    run(engine, 40);
    const terminal = engine.snapshot();
    expect(terminal.status).toBe('lost');

    engine.setInput({ stationDir: 1, laneDir: 1, blend: true, serve: true });
    const first = engine.step();
    const second = engine.step();

    expect(first.events).toEqual([]);
    expect(second.events).toEqual([]);
    expect(first.state).toEqual(terminal);
    expect(second.state).toEqual(terminal);
    expect(engine.snapshot()).toEqual(terminal);
  });

  it('stops before a post-fatal slide can fulfill and score a customer', () => {
    const testScenario = scenario({
      customerCount: 1,
      stations: ['vanilla', 'chocolate'],
      jarPoolSize: 2,
      marchSpeed: 1 / FIXED_SCALE,
      lives: 1,
    });
    const { engine, initialState } = createMaltlineResolutionHarness({
      scenario: testScenario,
      run: { lives: 1, score: 0 },
      state: {
        tick: 100,
        scenarioId: testScenario.id,
        status: 'running',
        score: 0,
        lives: 1,
        streak: 0,
        player: { lane: 0, station: 0, holding: null, blending: null, blendProgress: 0 },
        customers: [{
          id: 1,
          lane: 0,
          x: FIXED_SCALE / 2,
          flavor: 'vanilla',
          phase: 'marching',
          timer: 0,
          fulfilled: false,
          requeues: 0,
          catchBonusEligible: false,
          exitAfterDrink: false,
        }],
        slides: [
          { id: 2, lane: 0, x: 10 * FIXED_SCALE, flavor: 'chocolate' },
          { id: 3, lane: 0, x: 0, flavor: 'vanilla' },
        ],
        jars: [],
        washing: [],
        spawned: 1,
        serviceActions: 0,
        fulfilled: 0,
        walkouts: 0,
        resolved: 0,
        exited: 0,
        currentInput: IDLE_INPUT,
      },
    });

    const events = step(engine);

    expect(events.map((event) => event.type)).toEqual(['shake_smashed', 'life_lost', 'game_lost']);
    expect(engine.snapshot()).toMatchObject({
      status: 'lost',
      lives: 0,
      score: 0,
      serviceActions: 0,
      fulfilled: 0,
      customers: [expect.objectContaining({ id: 1, fulfilled: false })],
      slides: [expect.objectContaining({ id: 3, x: 0 })],
      resolved: initialState.resolved,
      washing: [],
    });
  });
});

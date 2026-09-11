import { describe, expect, it } from 'vitest';
import * as productionRoot from '../src/index';
import {
  MALTLINE_RESOLUTION_HARNESS_KIND,
  createMaltlineResolutionHarness,
  type MaltlineResolutionHarnessInput,
} from '../src/testing';
import type { MaltlineScenario } from '../src/core/types';
import { IDLE_INPUT } from '../src/core/types';

function scenario(overrides: Partial<MaltlineScenario> = {}): MaltlineScenario {
  return {
    id: 'resolution-harness-test',
    name: 'Resolution harness test',
    ticksPerSecond: 60,
    lanes: 2,
    laneLength: 10,
    stations: ['vanilla', 'chocolate'],
    jarPoolSize: 2,
    blendTicks: 2,
    washTicks: 2,
    drinkTicks: 2,
    customerCount: 1,
    spawnIntervalTicks: 60,
    spawnAccelerationTicks: 0,
    spawnIntervalFloorTicks: 60,
    marchSpeed: 0.1,
    leaveSpeed: 1,
    slideSpeed: 10,
    returnSpeed: 10,
    resumeExitThreshold: 0.5,
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    lives: 3,
    seed: 42,
    ...overrides,
  };
}

function validInput(): MaltlineResolutionHarnessInput {
  const testScenario = scenario();
  return {
    scenario: testScenario,
    run: { lives: 2, score: 500 },
    state: {
      tick: 50,
      scenarioId: testScenario.id,
      status: 'running',
      score: 500,
      lives: 2,
      streak: 0,
      player: { lane: 0, station: 0, holding: null, blending: null, blendProgress: 0 },
      customers: [{
        id: 1,
        lane: 0,
        x: 500,
        flavor: 'vanilla',
        phase: 'marching',
        timer: 0,
        fulfilled: false,
        requeues: 0,
        catchBonusEligible: false,
        exitAfterDrink: false,
      }],
      slides: [],
      jars: [],
      washing: [],
      spawned: 1,
      serviceActions: 0,
      fulfilled: 0,
      walkouts: 0,
      resolved: 0,
      exited: 0,
      currentInput: { ...IDLE_INPUT },
    },
  };
}

function mutableInput(): any {
  return structuredClone(validInput());
}

describe('synthetic resolution harness', () => {
  it('normalizes through the engine, derives bookkeeping, and freezes its description', () => {
    const source = mutableInput();
    const first = createMaltlineResolutionHarness(source);
    const second = createMaltlineResolutionHarness(validInput());

    expect(first.kind).toBe(MALTLINE_RESOLUTION_HARNESS_KIND);
    expect(first.initialState).toMatchObject({
      tick: 50,
      scenarioId: 'resolution-harness-test',
      status: 'running',
      score: 500,
      lives: 2,
      spawned: 1,
      resolved: 0,
      jarsAvailable: 2,
      spawnCountdown: 1,
      currentInput: IDLE_INPUT,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.initialState)).toBe(true);
    expect(Object.isFrozen(first.initialState.player)).toBe(true);
    expect(Object.isFrozen(first.initialState.customers)).toBe(true);
    expect(Object.isFrozen(first.initialState.customers[0])).toBe(true);
    expect(Object.isFrozen(first.initialState.currentInput)).toBe(true);

    source.scenario.name = 'mutated';
    source.state.customers[0].x = 0;
    source.state.currentInput.serve = true;
    expect(first.engine.scenario.name).toBe('Resolution harness test');
    expect(first.engine.snapshot().customers[0]!.x).toBe(500);
    expect(first.engine.snapshot().currentInput).toEqual(IDLE_INPUT);

    expect(first.engine.step()).toEqual(second.engine.step());
  });

  it('allows the structurally valid two-return rescue ownership case', () => {
    const input = mutableInput();
    input.state.score = 600;
    input.state.streak = 1;
    input.state.serviceActions = 2;
    input.state.fulfilled = 1;
    input.state.customers[0] = {
      ...input.state.customers[0],
      id: 1,
      phase: 'leaving',
      fulfilled: true,
      requeues: 1,
      catchBonusEligible: false,
      exitAfterDrink: true,
    };
    input.state.jars = [
      { id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true },
      { id: 5, customerId: 1, lane: 0, x: 600, catchBonusEligible: false },
    ];

    const harness = createMaltlineResolutionHarness(input);
    expect(harness.initialState.jars.map(({ customerId }) => customerId)).toEqual([1, 1]);
    expect(harness.initialState.jarsAvailable).toBe(0);
  });

  it('accepts the exact active-customer phase and owned-jar histories', () => {
    const cases = [
      {
        phase: 'drinking', requeues: 0, catchBonusEligible: true, exitAfterDrink: true,
        x: 5_120, timer: 1, serviceActions: 1, jars: [],
      },
      {
        phase: 'drinking', requeues: 1, catchBonusEligible: true, exitAfterDrink: false,
        x: 5_119, timer: 1, serviceActions: 1, jars: [],
      },
      {
        phase: 'drinking', requeues: 1, catchBonusEligible: false, exitAfterDrink: true,
        x: 0, timer: 1, serviceActions: 2,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
      {
        phase: 'marching', requeues: 1, catchBonusEligible: false, exitAfterDrink: false,
        x: 0, timer: 0, serviceActions: 1,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
      {
        phase: 'leaving', requeues: 0, catchBonusEligible: false, exitAfterDrink: true,
        x: 10_240, timer: 0, serviceActions: 1,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
      {
        phase: 'leaving', requeues: 1, catchBonusEligible: false, exitAfterDrink: true,
        x: 10_240, timer: 0, serviceActions: 2,
        jars: [
          { id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true },
          { id: 5, customerId: 1, lane: 0, x: 600, catchBonusEligible: false },
        ],
      },
    ] as const;

    for (const phaseCase of cases) {
      const input = mutableInput();
      input.state.score = 600;
      input.state.streak = 1;
      input.state.serviceActions = phaseCase.serviceActions;
      input.state.fulfilled = 1;
      input.state.customers[0] = {
        ...input.state.customers[0],
        phase: phaseCase.phase,
        x: phaseCase.x,
        timer: phaseCase.timer,
        fulfilled: true,
        requeues: phaseCase.requeues,
        catchBonusEligible: phaseCase.catchBonusEligible,
        exitAfterDrink: phaseCase.exitAfterDrink,
      };
      input.state.jars = structuredClone(phaseCase.jars);
      expect(() => createMaltlineResolutionHarness(input)).not.toThrow();
    }
  });

  it('rejects every active-customer phase with the wrong owned-jar history', () => {
    const cases = [
      {
        phase: 'drinking', requeues: 0, catchBonusEligible: true, exitAfterDrink: true,
        x: 5_120, timer: 1, serviceActions: 2,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
      {
        phase: 'drinking', requeues: 1, catchBonusEligible: false, exitAfterDrink: true,
        x: 500, timer: 1, serviceActions: 1, jars: [],
      },
      {
        phase: 'marching', requeues: 1, catchBonusEligible: false, exitAfterDrink: false,
        x: 500, timer: 0, serviceActions: 2,
        jars: [
          { id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true },
          { id: 5, customerId: 1, lane: 0, x: 600, catchBonusEligible: false },
        ],
      },
      {
        phase: 'leaving', requeues: 0, catchBonusEligible: false, exitAfterDrink: true,
        x: 5_120, timer: 0, serviceActions: 2,
        jars: [
          { id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true },
          { id: 5, customerId: 1, lane: 0, x: 600, catchBonusEligible: false },
        ],
      },
      {
        phase: 'leaving', requeues: 1, catchBonusEligible: false, exitAfterDrink: true,
        x: 500, timer: 0, serviceActions: 1,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
    ] as const;

    for (const phaseCase of cases) {
      const input = mutableInput();
      input.state.score = 600;
      input.state.streak = 1;
      input.state.serviceActions = phaseCase.serviceActions;
      input.state.fulfilled = 1;
      input.state.customers[0] = {
        ...input.state.customers[0],
        phase: phaseCase.phase,
        x: phaseCase.x,
        timer: phaseCase.timer,
        fulfilled: true,
        requeues: phaseCase.requeues,
        catchBonusEligible: phaseCase.catchBonusEligible,
        exitAfterDrink: phaseCase.exitAfterDrink,
      };
      input.state.jars = structuredClone(phaseCase.jars);
      expect(() => createMaltlineResolutionHarness(input)).toThrow(
        /phase must match its exact owned-jar/u,
      );
    }
  });

  it('rejects active-customer phases on the wrong side of the fixed rescue threshold', () => {
    const cases = [
      {
        phase: 'drinking', requeues: 0, catchBonusEligible: true, exitAfterDrink: true,
        x: 5_119, timer: 1, serviceActions: 1, jars: [],
      },
      {
        phase: 'drinking', requeues: 1, catchBonusEligible: true, exitAfterDrink: false,
        x: 5_120, timer: 1, serviceActions: 1, jars: [],
      },
      {
        phase: 'drinking', requeues: 1, catchBonusEligible: false, exitAfterDrink: true,
        x: 5_120, timer: 1, serviceActions: 2,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
      {
        phase: 'marching', requeues: 1, catchBonusEligible: false, exitAfterDrink: false,
        x: 5_120, timer: 0, serviceActions: 1,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
      {
        phase: 'leaving', requeues: 0, catchBonusEligible: false, exitAfterDrink: true,
        x: 5_119, timer: 0, serviceActions: 1,
        jars: [{ id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true }],
      },
    ] as const;

    for (const phaseCase of cases) {
      const input = mutableInput();
      input.state.score = 600;
      input.state.streak = 1;
      input.state.serviceActions = phaseCase.serviceActions;
      input.state.fulfilled = 1;
      input.state.customers[0] = {
        ...input.state.customers[0],
        phase: phaseCase.phase,
        x: phaseCase.x,
        timer: phaseCase.timer,
        fulfilled: true,
        requeues: phaseCase.requeues,
        catchBonusEligible: phaseCase.catchBonusEligible,
        exitAfterDrink: phaseCase.exitAfterDrink,
      };
      input.state.jars = structuredClone(phaseCase.jars);
      expect(() => createMaltlineResolutionHarness(input)).toThrow(/threshold history/u);
    }
  });

  it('rejects a returning jar in a different lane from its active owner', () => {
    const input = mutableInput();
    input.state.score = 600;
    input.state.streak = 1;
    input.state.serviceActions = 1;
    input.state.fulfilled = 1;
    input.state.customers[0] = {
      ...input.state.customers[0],
      x: 5_120,
      phase: 'leaving',
      fulfilled: true,
      requeues: 0,
      catchBonusEligible: false,
      exitAfterDrink: true,
    };
    input.state.jars = [
      { id: 3, customerId: 1, lane: 1, x: 500, catchBonusEligible: true },
    ];

    expect(() => createMaltlineResolutionHarness(input)).toThrow(
      /jar lane must match its active customer owner lane/u,
    );
  });

  it('rejects completed services not represented by exactly one current artifact', () => {
    const input = mutableInput();
    input.state.score = 600;
    input.state.streak = 1;
    input.state.serviceActions = 1;
    input.state.fulfilled = 1;
    input.state.customers[0] = {
      ...input.state.customers[0],
      phase: 'drinking',
      timer: 1,
      fulfilled: true,
      requeues: 1,
      catchBonusEligible: false,
      exitAfterDrink: true,
    };
    input.state.jars = [
      { id: 3, customerId: 1, lane: 0, x: 500, catchBonusEligible: true },
    ];

    expect(() => createMaltlineResolutionHarness(input)).toThrow(
      /serviceActions must equal returning jars \+ drinking customers/u,
    );
  });

  it('rejects a rescue jar after its first-fulfillment jar has been removed', () => {
    const input = mutableInput();
    input.state.customers = [];
    input.state.spawned = 1;
    input.state.resolved = 1;
    input.state.exited = 1;
    input.state.score = 600;
    input.state.streak = 1;
    input.state.serviceActions = 1;
    input.state.fulfilled = 1;
    input.state.jars = [
      { id: 3, customerId: 1, lane: 1, x: 500, catchBonusEligible: false },
    ];

    expect(() => createMaltlineResolutionHarness(input)).toThrow(
      /jars are inconsistent with fulfilled service ownership/u,
    );
  });

  it('rejects artifact totals that omit a distinct fulfilled customer owner', () => {
    const input = mutableInput();
    input.scenario.customerCount = 2;
    input.state.customers = [];
    input.state.spawned = 2;
    input.state.resolved = 2;
    input.state.exited = 2;
    input.state.score = 710;
    input.state.streak = 2;
    input.state.serviceActions = 2;
    input.state.fulfilled = 2;
    input.state.jars = [
      { id: 5, customerId: 1, lane: 1, x: 500, catchBonusEligible: true },
      { id: 6, customerId: 1, lane: 1, x: 600, catchBonusEligible: false },
    ];

    expect(() => createMaltlineResolutionHarness(input)).toThrow(
      /fulfillment owners must exactly match/u,
    );
  });

  it('rejects an active fulfilled non-drinking customer without its return jar', () => {
    const input = mutableInput();
    input.state.score = 600;
    input.state.streak = 1;
    input.state.serviceActions = 1;
    input.state.fulfilled = 1;
    input.state.customers[0] = {
      ...input.state.customers[0],
      x: 5_120,
      phase: 'leaving',
      fulfilled: true,
      requeues: 0,
      catchBonusEligible: false,
      exitAfterDrink: true,
    };
    input.state.jars = [
      { id: 3, customerId: 2, lane: 1, x: 500, catchBonusEligible: true },
    ];

    expect(() => createMaltlineResolutionHarness(input)).toThrow(
      /phase must match its exact owned-jar/u,
    );
  });

  it('derives the next entity ID above synthetic and historical references', () => {
    const input = mutableInput();
    input.scenario.returnSpeed = 0.1;
    input.state.score = 600;
    input.state.streak = 1;
    input.state.serviceActions = 1;
    input.state.fulfilled = 1;
    input.state.customers[0] = {
      ...input.state.customers[0],
      id: 10,
      x: 5_120,
      phase: 'drinking',
      timer: 1,
      fulfilled: true,
      requeues: 0,
      catchBonusEligible: true,
      exitAfterDrink: true,
    };

    const harness = createMaltlineResolutionHarness(input);
    const result = harness.engine.step();
    expect(result.events).toContainEqual({
      tick: 51,
      type: 'jar_returned',
      customerId: 10,
      lane: 0,
    });
    expect(result.state.jars).toEqual([{
      id: 11,
      customerId: 10,
      lane: 0,
      x: 5_018,
      catchBonusEligible: true,
    }]);
  });

  it('rejects non-plain, extra, accessor, sparse, aliased, and cyclic inputs without invoking getters', () => {
    const cases: any[] = [];
    cases.push({ ...mutableInput(), extra: true });
    const exotic = mutableInput();
    exotic.state = Object.create(null);
    cases.push(exotic);
    const sparse = mutableInput();
    sparse.state.customers = new Array(1);
    cases.push(sparse);
    const extraArray = mutableInput();
    extraArray.state.customers.extra = true;
    cases.push(extraArray);
    const extraEntity = mutableInput();
    extraEntity.state.customers[0].extra = true;
    cases.push(extraEntity);
    const symbol = mutableInput();
    symbol.state[Symbol('hidden')] = true;
    cases.push(symbol);
    const nonenumerable = mutableInput();
    Object.defineProperty(nonenumerable.state, 'hidden', { value: true });
    cases.push(nonenumerable);
    const aliased = mutableInput();
    aliased.state.currentInput = aliased.state.player;
    cases.push(aliased);
    const cyclic = mutableInput();
    cyclic.state.player = cyclic.state;
    cases.push(cyclic);

    for (const value of cases) expect(() => createMaltlineResolutionHarness(value)).toThrow();

    let calls = 0;
    const accessor = mutableInput();
    Object.defineProperty(accessor.state, 'score', {
      enumerable: true,
      get() { calls++; return 500; },
    });
    expect(() => createMaltlineResolutionHarness(accessor)).toThrow(/data property/u);
    expect(calls).toBe(0);

    const unexpectedAccessor = mutableInput();
    Object.defineProperty(unexpectedAccessor, 'extra', {
      enumerable: true,
      get() { calls++; return true; },
    });
    expect(() => createMaltlineResolutionHarness(unexpectedAccessor)).toThrow(/missing or extra/u);
    expect(calls).toBe(0);

    const arrayAccessor = mutableInput();
    Object.defineProperty(arrayAccessor.state.customers, '0', {
      enumerable: true,
      get() { calls++; return validInput().state.customers[0]; },
    });
    expect(() => createMaltlineResolutionHarness(arrayAccessor)).toThrow(/data property/u);
    expect(calls).toBe(0);
  });

  it('rejects malformed scenario, run, identity, input, and inactive-player fields', () => {
    const invalid = [
      (value: any) => { value.scenario.unexpected = true; },
      (value: any) => { value.run.unexpected = true; },
      (value: any) => { value.state.scenarioId = 'wrong'; },
      (value: any) => { value.state.status = 'won'; },
      (value: any) => { value.state.currentInput.serve = true; },
      (value: any) => { value.state.player.holding = 'vanilla'; },
      (value: any) => { value.state.player.blendProgress = 1; },
      (value: any) => { value.state.washing = [1]; },
      (value: any) => { value.state.tick = Number.POSITIVE_INFINITY; },
    ];
    for (const mutate of invalid) {
      const value = mutableInput();
      mutate(value);
      expect(() => createMaltlineResolutionHarness(value)).toThrow();
    }

    let calls = 0;
    for (const key of ['scenario', 'run'] as const) {
      const value = mutableInput();
      const original = value[key].id ?? value[key].lives;
      const property = key === 'scenario' ? 'id' : 'lives';
      Object.defineProperty(value[key], property, {
        enumerable: true,
        get() { calls++; return original; },
      });
      expect(() => createMaltlineResolutionHarness(value)).toThrow(/data property/u);
    }
    expect(calls).toBe(0);
  });

  it('rejects invalid entity domains, IDs, phases, counters, resource, score, and lives', () => {
    const invalid = [
      (value: any) => { value.state.customers[0].id = 0; },
      (value: any) => { value.state.customers[0].lane = 2; },
      (value: any) => { value.state.customers[0].x = Number.NaN; },
      (value: any) => { value.state.customers[0].flavor = 'strawberry'; },
      (value: any) => { value.state.customers[0].phase = 'drinking'; },
      (value: any) => { value.state.spawned = 0; },
      (value: any) => { value.state.resolved = 1; },
      (value: any) => { value.state.fulfilled = 1; },
      (value: any) => { value.state.serviceActions = 1; },
      (value: any) => { value.state.score = 501; },
      (value: any) => { value.state.lives = 1; },
      (value: any) => {
        value.state.slides = [
          { id: 2, lane: 0, x: 0, flavor: 'vanilla' },
          { id: 3, lane: 0, x: 0, flavor: 'vanilla' },
          { id: 4, lane: 0, x: 0, flavor: 'vanilla' },
        ];
      },
      (value: any) => {
        value.state.slides = [{ id: 1, lane: 0, x: 0, flavor: 'vanilla' }];
      },
    ];
    for (const mutate of invalid) {
      const value = mutableInput();
      mutate(value);
      expect(() => createMaltlineResolutionHarness(value)).toThrow();
    }
  });

  it('is available only through the testing subpath, not the production root', () => {
    expect(productionRoot).not.toHaveProperty('createMaltlineResolutionHarness');
    expect(productionRoot).not.toHaveProperty('MALTLINE_RESOLUTION_HARNESS_KIND');
  });
});

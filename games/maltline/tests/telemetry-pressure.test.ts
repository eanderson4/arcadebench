import { describe, expect, it } from 'vitest';
import type {
  CustomerState,
  MaltlineScenario,
  MaltlineState,
  SlideState,
} from '../src/core/types';
import { IDLE_INPUT } from '../src/core/types';
import {
  maltlineOpenDemandCustomers,
  runMaltlineCampaignTelemetry,
} from '../src/telemetry/campaign-telemetry';
import { DELAYED_COMPETENT_MALTLINE_CONTROLLER } from '../src/telemetry/player-model-controllers';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  reactiveMaltlineController,
} from '../src/telemetry/reactive-controller';

function scenario(overrides: Partial<MaltlineScenario> = {}): MaltlineScenario {
  return {
    id: 'telemetry-pressure',
    name: 'Telemetry pressure',
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
    resumeExitThreshold: 1,
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    lives: 3,
    seed: 42,
    ...overrides,
  };
}

function customer(
  id: number,
  lane: number,
  flavor: CustomerState['flavor'],
  x: number,
  phase: CustomerState['phase'] = 'marching',
): CustomerState {
  return {
    id,
    lane,
    x,
    flavor,
    phase,
    timer: 0,
    fulfilled: phase !== 'marching',
    requeues: 0,
    catchBonusEligible: false,
    exitAfterDrink: false,
  };
}

function state(customers: CustomerState[], slides: SlideState[]): MaltlineState {
  return {
    tick: 1,
    scenarioId: 'telemetry-pressure',
    status: 'running',
    score: 0,
    lives: 3,
    streak: 0,
    player: { lane: 0, station: 0, x: 0, holding: null, blending: null, blendProgress: 0 },
    customers,
    slides,
    jars: [],
    washing: [],
    jarsAvailable: 5,
    spawned: customers.length,
    serviceActions: 0,
    fulfilled: 0,
    walkouts: 0,
    resolved: 0,
    exited: 0,
    spawnCountdown: 1,
    currentInput: { ...IDLE_INPUT },
  };
}

describe('Maltline pressure telemetry', () => {
  it('greedily reserves distinct matching orders and leaves invalid matches open', () => {
    const customers = [
      customer(1, 0, 'vanilla', 50),
      customer(2, 0, 'vanilla', 70),
      customer(3, 1, 'chocolate', 40),
      customer(4, 0, 'chocolate', 20),
      customer(5, 0, 'vanilla', 30, 'drinking'),
      customer(6, 0, 'vanilla', 5),
    ];
    const slides = [
      { id: 10, lane: 0, x: 10, flavor: 'vanilla' as const },
      { id: 11, lane: 0, x: 15, flavor: 'vanilla' as const },
      { id: 12, lane: 1, x: 10, flavor: 'vanilla' as const },
    ];

    expect(maltlineOpenDemandCustomers(state(customers, slides)).map(({ id }) => id))
      .toEqual([6, 4, 3]);
  });

  it('keeps all pressure counters inside their semantic bounds', () => {
    const telemetry = runMaltlineCampaignTelemetry({
      controller: DELAYED_COMPETENT_MALTLINE_CONTROLLER,
    });
    for (const stage of telemetry.stages) {
      expect(stage.maxOpenDemand).toBeLessThanOrEqual(stage.maxMarchingCustomers);
      expect(stage.maxMarchingCustomers).toBeLessThanOrEqual(stage.maxLiveCustomers);
      expect(stage.multiOrderLaneTicks).toBeLessThanOrEqual(stage.multiOrderTicks);
      expect(stage.multiOrderFlavorTicks).toBeLessThanOrEqual(stage.multiOrderTicks);
      expect(stage.orderReturnConflictTicks).toBeLessThanOrEqual(stage.openDemandTicks);
      expect(stage.orderReturnConflictTicks).toBeLessThanOrEqual(stage.returningJarTicks);
      expect(stage.crossLaneOrderReturnConflictTicks)
        .toBeLessThanOrEqual(stage.orderReturnConflictTicks);
      expect(stage.quietPacingTicks).toBeLessThanOrEqual(stage.pacingWindowTicks);
      expect(stage.ticksAtZeroJars).toBeLessThanOrEqual(stage.ticksAtOneOrFewerJars);
      expect(stage.repeatServiceActions).toBe(stage.serviceActions - stage.fulfilled);
      expect(stage.neverFulfilledWalkouts + stage.fulfilledThenWalkout).toBe(stage.walkouts);
      expect(Object.values(stage.scoreLedger).reduce((total, points) => total + points, 0))
        .toBe(stage.scoreGained);
    }
  });

  it('measures exact quiet pacing runs in a handcrafted two-arrival stage', () => {
    const telemetry = runMaltlineCampaignTelemetry({
      scenarios: [scenario({
        customerCount: 2,
        spawnIntervalTicks: 120,
        spawnIntervalFloorTicks: 120,
        resumeExitThreshold: 0,
      })],
      controller: REACTIVE_MALTLINE_CONTROLLER,
    });
    const stage = telemetry.stages[0]!;

    expect(stage).toMatchObject({
      pacingWindowTicks: 120,
      quietPacingTicks: 117,
      longestQuietPacingRunTicks: 117,
    });
    expect(stage.quietPacingTicks).toBeLessThan(stage.pacingWindowTicks);
  });

  it('tracks one/zero jars and binding versus inert spawn floors', () => {
    const oneJar = runMaltlineCampaignTelemetry({
      scenarios: [scenario({ jarPoolSize: 1, resumeExitThreshold: 0 })],
      controller: REACTIVE_MALTLINE_CONTROLLER,
    }).stages[0]!;
    expect(oneJar.ticksAtOneOrFewerJars).toBe(oneJar.ticks);
    expect(oneJar.ticksAtZeroJars).toBeGreaterThan(0);

    const binding = runMaltlineCampaignTelemetry({
      scenarios: [scenario({
        customerCount: 4,
        spawnIntervalTicks: 3,
        spawnAccelerationTicks: 1,
        spawnIntervalFloorTicks: 1,
        laneLength: 1_000,
        marchSpeed: 1 / 1_024,
      })],
      controller: {
        id: 'idle-floor-probe-v1',
        fingerprintData: { algorithm: 'idle-floor-probe', version: 1 },
        create: () => () => IDLE_INPUT,
      },
      tickLimitPerStage: 40,
    }).stages[0]!;
    const inert = runMaltlineCampaignTelemetry({
      scenarios: [scenario({
        customerCount: 4,
        spawnIntervalTicks: 3,
        spawnAccelerationTicks: 0,
        spawnIntervalFloorTicks: 1,
        laneLength: 1_000,
        marchSpeed: 1 / 1_024,
      })],
      controller: {
        id: 'idle-floor-probe-v1',
        fingerprintData: { algorithm: 'idle-floor-probe', version: 1 },
        create: () => () => IDLE_INPUT,
      },
      tickLimitPerStage: 45,
    }).stages[0]!;

    expect(binding.spawnFloorHitCount).toBe(2);
    expect(inert.spawnFloorHitCount).toBe(0);
  });

  it('splits walkouts, repeat service, and every exact score source', () => {
    const neverServed = runMaltlineCampaignTelemetry({
      scenarios: [scenario({ laneLength: 1, marchSpeed: 2 })],
      controller: {
        id: 'idle-walkout-v1',
        fingerprintData: { algorithm: 'idle-walkout', version: 1 },
        create: () => () => IDLE_INPUT,
      },
    }).stages[0]!;
    expect(neverServed).toMatchObject({
      neverFulfilledWalkouts: 1,
      fulfilledThenWalkout: 0,
      repeatServiceActions: 0,
      scoreLedger: { servePoints: 0, catchPoints: 0, stageBonusPoints: 500 },
      scoreGained: 500,
    });

    const stopAfterFulfillment = {
      id: 'one-service-then-idle-v1',
      fingerprintData: { algorithm: 'one-service-then-idle', version: 1 },
      create: () => (current: Readonly<MaltlineState>, active: Readonly<MaltlineScenario>) => (
        current.fulfilled > 0 ? IDLE_INPUT : reactiveMaltlineController(current, active)
      ),
    } as const;
    const fulfilledWalkout = runMaltlineCampaignTelemetry({
      scenarios: [scenario()],
      controller: stopAfterFulfillment,
    }).stages[0]!;
    expect(fulfilledWalkout).toMatchObject({
      neverFulfilledWalkouts: 0,
      fulfilledThenWalkout: 1,
      serviceActions: 1,
      fulfilled: 1,
      repeatServiceActions: 0,
      scoreLedger: { servePoints: 100, catchPoints: 25, stageBonusPoints: 500 },
      scoreGained: 625,
    });

    const rescued = runMaltlineCampaignTelemetry({
      scenarios: [scenario()],
      controller: REACTIVE_MALTLINE_CONTROLLER,
    }).stages[0]!;
    expect(rescued).toMatchObject({
      neverFulfilledWalkouts: 0,
      fulfilledThenWalkout: 0,
      serviceActions: 2,
      fulfilled: 1,
      repeatServiceActions: 1,
      scoreLedger: { servePoints: 100, catchPoints: 25, stageBonusPoints: 750 },
      scoreGained: 875,
    });
  });
});

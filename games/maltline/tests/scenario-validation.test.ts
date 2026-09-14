import { describe, expect, it } from 'vitest';
import { FIXED_SCALE, MaltlineEngine } from '../src/core/engine';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
} from '../src/core/scenario';
import type { MaltlineScenario, RunContext } from '../src/core/types';
import { IDLE_INPUT } from '../src/core/types';

function validScenario(overrides: Partial<MaltlineScenario> = {}): MaltlineScenario {
  return {
    id: 'validation-test',
    name: 'Validation test',
    ticksPerSecond: 60,
    lanes: 2,
    laneLength: 100,
    stations: ['vanilla', 'chocolate'],
    jarPoolSize: 5,
    blendTicks: 10,
    washTicks: 20,
    drinkTicks: 20,
    customerCount: 2,
    spawnIntervalTicks: 60,
    spawnAccelerationTicks: 1,
    spawnIntervalFloorTicks: 30,
    marchSpeed: 0.1,
    leaveSpeed: 1,
    slideSpeed: 2,
    returnSpeed: 2,
    resumeExitThreshold: 0.5,
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    lives: 3,
    seed: 42,
    ...overrides,
  };
}

describe('Maltline scenario boundary', () => {
  it.each([
    ['id', { id: '' }],
    ['id', { id: 'Not Stable' }],
    ['name', { name: ' ' }],
    ['ticksPerSecond', { ticksPerSecond: Number.NaN }],
    ['ticksPerSecond', { ticksPerSecond: 60.5 }],
    ['ticksPerSecond', { ticksPerSecond: 0 }],
    ['lanes', { lanes: 0 }],
    ['lanes', { lanes: 65 }],
    ['laneLength', { laneLength: Number.POSITIVE_INFINITY }],
    ['laneLength', { laneLength: 0 }],
    ['stations', { stations: [] }],
    ['stations', { stations: ['vanilla', 'vanilla'] }],
    ['stations', { stations: ['mint'] as never }],
    ['jarPoolSize', { jarPoolSize: -1 }],
    ['jarPoolSize', { jarPoolSize: 1.5 }],
    ['blendTicks', { blendTicks: 0 }],
    ['washTicks', { washTicks: Number.NaN }],
    ['drinkTicks', { drinkTicks: -1 }],
    ['customerCount', { customerCount: -1 }],
    ['spawnIntervalTicks', { spawnIntervalTicks: 0 }],
    ['spawnAccelerationTicks', { spawnAccelerationTicks: -1 }],
    ['spawnIntervalFloorTicks', { spawnIntervalFloorTicks: 61 }],
    ['marchSpeed', { marchSpeed: 0 }],
    ['marchSpeed', { marchSpeed: 0.49 / FIXED_SCALE }],
    ['leaveSpeed', { leaveSpeed: Number.NaN }],
    ['slideSpeed', { slideSpeed: Number.POSITIVE_INFINITY }],
    ['returnSpeed', { returnSpeed: -1 }],
    ['resumeExitThreshold', { resumeExitThreshold: -0.01 }],
    ['resumeExitThreshold', { resumeExitThreshold: 1.01 }],
    ['stationRepeatTicks', { stationRepeatTicks: 0 }],
    ['laneRepeatTicks', { laneRepeatTicks: 1.5 }],
    ['lives', { lives: 0 }],
    ['seed', { seed: -1 }],
    ['seed', { seed: 0x1_0000_0000 }],
  ] as const)('rejects an invalid %s field', (field, override) => {
    expect(() => normalizeMaltlineScenario(validScenario(override)))
      .toThrow(`scenario.${field}`);
  });

  it('rejects malformed top-level values', () => {
    expect(() => normalizeMaltlineScenario(null as never)).toThrow('must be an object');
    expect(() => normalizeMaltlineScenario([] as never)).toThrow('must be an object');
  });

  it('copies and freezes every scenario field before simulation starts', () => {
    const source = validScenario();
    const originalStations = source.stations as Array<'vanilla' | 'chocolate'>;
    const engine = new MaltlineEngine(source, { lives: 2, score: 500 });
    const control = new MaltlineEngine(validScenario(), { lives: 2, score: 500 });

    Object.assign(source, {
      id: 'mutated',
      name: 'Mutated',
      ticksPerSecond: 1,
      lanes: 1,
      laneLength: 1,
      jarPoolSize: 1,
      blendTicks: 1,
      washTicks: 1,
      drinkTicks: 1,
      customerCount: 0,
      spawnIntervalTicks: 1,
      spawnAccelerationTicks: 0,
      spawnIntervalFloorTicks: 1,
      marchSpeed: 100,
      leaveSpeed: 100,
      slideSpeed: 100,
      returnSpeed: 100,
      resumeExitThreshold: 0,
      stationRepeatTicks: 100,
      laneRepeatTicks: 100,
      lives: 1,
      seed: 999,
    });
    originalStations.splice(0, originalStations.length, 'chocolate');

    expect(Object.isFrozen(engine.scenario)).toBe(true);
    expect(Object.isFrozen(engine.scenario.stations)).toBe(true);
    expect(engine.scenario).toEqual(validScenario());
    for (let tick = 0; tick < 120; tick++) {
      engine.setInput(IDLE_INPUT);
      control.setInput(IDLE_INPUT);
      expect(engine.step()).toEqual(control.step());
    }
  });

  it('normalizes, copies, freezes, and validates carried run state', () => {
    const scenario = normalizeMaltlineScenario(validScenario());
    const source: RunContext = { lives: -2, score: 500 };
    const normalized = normalizeMaltlineRunContext(source, scenario);
    source.lives = 3;
    source.score = 0;

    expect(normalized).toEqual({ lives: 0, score: 500 });
    expect(Object.isFrozen(normalized)).toBe(true);
    for (const invalid of [
      { lives: Number.NaN, score: 0 },
      { lives: 1.5, score: 0 },
      { lives: 1_000_001, score: 0 },
      { lives: 3, score: -1 },
      { lives: 3, score: 1.5 },
      { lives: 3, score: Number.MAX_SAFE_INTEGER },
    ]) {
      expect(() => normalizeMaltlineRunContext(invalid, scenario)).toThrow();
    }
  });
});

import { MALTLINE_RULES } from './rules';
import { FLAVORS } from './types';
import type { FlavorId, MaltlineScenario, RunContext } from './types';

export type NormalizedMaltlineScenario = Omit<Readonly<MaltlineScenario>, 'stations'> & {
  readonly stations: readonly FlavorId[];
};

export type NormalizedRunContext = Readonly<RunContext>;

const MAX_TICKS_PER_SECOND = 1_000;
const MAX_LANES = 64;
const MAX_POSITION_UNITS = 1_000_000_000;
const MAX_ENTITY_COUNT = 100_000;
const MAX_TIMING_TICKS = 10_000_000;
const MAX_LIVES = 1_000_000;
const MAX_SEED = 0xffff_ffff;
const SCENARIO_ID = /^[a-z0-9](?:[a-z0-9._-]{0,127})$/;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(`${label} must be a nonempty string of at most ${maximumLength} characters`);
  }
  if (value.trim() !== value) throw new Error(`${label} must not have surrounding whitespace`);
  return value;
}

function integerInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function finiteInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be finite and from ${minimum} through ${maximum}`);
  }
  return value;
}

function positiveFixedPoint(value: unknown, label: string): number {
  const number = finiteInRange(value, label, Number.MIN_VALUE, MAX_POSITION_UNITS);
  const fixed = Math.round(number * MALTLINE_RULES.fixedScale);
  if (!Number.isSafeInteger(fixed) || fixed < 1) {
    throw new Error(`${label} must quantize to at least 1/${MALTLINE_RULES.fixedScale}`);
  }
  return number;
}

function normalizedStations(value: unknown): readonly FlavorId[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > FLAVORS.length) {
    throw new Error(`scenario.stations must contain 1 through ${FLAVORS.length} flavors`);
  }
  const allowed = new Set<string>(FLAVORS);
  const seen = new Set<string>();
  const stations = value.map((flavor, index) => {
    if (typeof flavor !== 'string' || !allowed.has(flavor)) {
      throw new Error(`scenario.stations[${index}] must be a supported flavor`);
    }
    if (seen.has(flavor)) throw new Error('scenario.stations must not contain duplicate flavors');
    seen.add(flavor);
    return flavor as FlavorId;
  });
  return Object.freeze(stations);
}

/** Validate, copy, and deeply freeze the complete authored scenario boundary. */
export function normalizeMaltlineScenario(value: MaltlineScenario): NormalizedMaltlineScenario {
  const scenario = objectValue(value, 'Maltline scenario');
  const id = nonemptyString(scenario.id, 'scenario.id', 128);
  if (!SCENARIO_ID.test(id)) {
    throw new Error('scenario.id must use lowercase letters, digits, dots, underscores, or hyphens');
  }
  const name = nonemptyString(scenario.name, 'scenario.name', 128);
  const ticksPerSecond = integerInRange(
    scenario.ticksPerSecond,
    'scenario.ticksPerSecond',
    1,
    MAX_TICKS_PER_SECOND,
  );
  const lanes = integerInRange(scenario.lanes, 'scenario.lanes', 1, MAX_LANES);
  const laneLength = positiveFixedPoint(scenario.laneLength, 'scenario.laneLength');
  const stations = normalizedStations(scenario.stations);
  const jarPoolSize = integerInRange(
    scenario.jarPoolSize,
    'scenario.jarPoolSize',
    1,
    MAX_ENTITY_COUNT,
  );
  const blendTicks = integerInRange(scenario.blendTicks, 'scenario.blendTicks', 1, MAX_TIMING_TICKS);
  const washTicks = integerInRange(scenario.washTicks, 'scenario.washTicks', 1, MAX_TIMING_TICKS);
  const drinkTicks = integerInRange(scenario.drinkTicks, 'scenario.drinkTicks', 1, MAX_TIMING_TICKS);
  const customerCount = integerInRange(
    scenario.customerCount,
    'scenario.customerCount',
    0,
    MAX_ENTITY_COUNT,
  );
  const spawnIntervalTicks = integerInRange(
    scenario.spawnIntervalTicks,
    'scenario.spawnIntervalTicks',
    1,
    MAX_TIMING_TICKS,
  );
  const spawnAccelerationTicks = integerInRange(
    scenario.spawnAccelerationTicks,
    'scenario.spawnAccelerationTicks',
    0,
    MAX_TIMING_TICKS,
  );
  const spawnIntervalFloorTicks = integerInRange(
    scenario.spawnIntervalFloorTicks,
    'scenario.spawnIntervalFloorTicks',
    1,
    spawnIntervalTicks,
  );
  const marchSpeed = positiveFixedPoint(scenario.marchSpeed, 'scenario.marchSpeed');
  const leaveSpeed = positiveFixedPoint(scenario.leaveSpeed, 'scenario.leaveSpeed');
  const slideSpeed = positiveFixedPoint(scenario.slideSpeed, 'scenario.slideSpeed');
  const returnSpeed = positiveFixedPoint(scenario.returnSpeed, 'scenario.returnSpeed');
  const laneLengthFixed = Math.round(laneLength * MALTLINE_RULES.fixedScale);
  for (const [label, speed] of [
    ['scenario.marchSpeed', marchSpeed],
    ['scenario.leaveSpeed', leaveSpeed],
    ['scenario.slideSpeed', slideSpeed],
    ['scenario.returnSpeed', returnSpeed],
  ] as const) {
    const speedFixed = Math.round(speed * MALTLINE_RULES.fixedScale);
    if (!Number.isSafeInteger(laneLengthFixed + speedFixed)) {
      throw new Error(`${label} is too large for safe fixed-point movement`);
    }
  }
  const resumeExitThreshold = finiteInRange(
    scenario.resumeExitThreshold,
    'scenario.resumeExitThreshold',
    0,
    1,
  );
  const stationRepeatTicks = integerInRange(
    scenario.stationRepeatTicks,
    'scenario.stationRepeatTicks',
    1,
    MAX_TIMING_TICKS,
  );
  const laneRepeatTicks = integerInRange(
    scenario.laneRepeatTicks,
    'scenario.laneRepeatTicks',
    1,
    MAX_TIMING_TICKS,
  );
  const lives = integerInRange(scenario.lives, 'scenario.lives', 1, MAX_LIVES);
  const seed = integerInRange(scenario.seed, 'scenario.seed', 0, MAX_SEED);

  return Object.freeze({
    id,
    name,
    ticksPerSecond,
    lanes,
    laneLength,
    stations,
    jarPoolSize,
    blendTicks,
    washTicks,
    drinkTicks,
    customerCount,
    spawnIntervalTicks,
    spawnAccelerationTicks,
    spawnIntervalFloorTicks,
    marchSpeed,
    leaveSpeed,
    slideSpeed,
    returnSpeed,
    resumeExitThreshold,
    stationRepeatTicks,
    laneRepeatTicks,
    lives,
    seed,
  });
}

function maximumStageScore(scenario: NormalizedMaltlineScenario, lives: number): number {
  const maximumServe = MALTLINE_RULES.serveBaseScore
    + MALTLINE_RULES.serveStreakStep * MALTLINE_RULES.serveStreakCap;
  return scenario.customerCount * (maximumServe + MALTLINE_RULES.jarCatchScore)
    + lives * MALTLINE_RULES.stageClearBonusPerLife;
}

/** Validate, copy, and freeze carried state against the stage's score ceiling. */
export function normalizeMaltlineRunContext(
  value: RunContext | undefined,
  scenario: NormalizedMaltlineScenario,
): NormalizedRunContext {
  const source = value === undefined
    ? { lives: scenario.lives, score: 0 }
    : objectValue(value, 'Maltline run context');
  const rawLives = integerInRange(source.lives, 'run.lives', -MAX_LIVES, MAX_LIVES);
  const lives = Math.max(0, rawLives);
  const score = integerInRange(source.score, 'run.score', 0, Number.MAX_SAFE_INTEGER);
  if (score > Number.MAX_SAFE_INTEGER - maximumStageScore(scenario, lives)) {
    throw new Error('run.score leaves insufficient safe-integer headroom for this stage');
  }
  return Object.freeze({ lives, score });
}

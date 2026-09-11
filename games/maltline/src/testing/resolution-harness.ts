import { MaltlineEngine, FIXED_SCALE } from '../core/engine';
import { MALTLINE_RULES } from '../core/rules';
import type {
  CustomerPhase,
  CustomerState,
  FlavorId,
  JarState,
  MaltlineInput,
  MaltlineScenario,
  MaltlineState,
  RunContext,
  SlideState,
} from '../core/types';
import { FLAVORS, IDLE_INPUT } from '../core/types';

export interface MaltlineResolutionHarnessState {
  readonly tick: number;
  readonly scenarioId: string;
  readonly status: 'running';
  readonly score: number;
  readonly lives: number;
  readonly streak: number;
  readonly player: {
    readonly lane: number;
    readonly station: number;
    readonly holding: null;
    readonly blending: null;
    readonly blendProgress: 0;
  };
  readonly customers: readonly CustomerState[];
  readonly slides: readonly SlideState[];
  readonly jars: readonly JarState[];
  readonly washing: readonly [];
  readonly spawned: number;
  readonly serviceActions: number;
  readonly fulfilled: number;
  readonly walkouts: number;
  readonly resolved: number;
  readonly exited: number;
  readonly currentInput: MaltlineInput;
}

export interface MaltlineResolutionHarnessInput {
  readonly scenario: MaltlineScenario;
  readonly run: RunContext;
  readonly state: MaltlineResolutionHarnessState;
}

export interface MaltlineResolutionHarness {
  readonly kind: 'maltline-synthetic-resolution-harness-v1';
  readonly engine: MaltlineEngine;
  readonly initialState: Readonly<MaltlineState>;
}

export const MALTLINE_RESOLUTION_HARNESS_KIND = 'maltline-synthetic-resolution-harness-v1' as const;

interface MutableResolutionInternals {
  tickNumber: number;
  status: MaltlineState['status'];
  score: number;
  lives: number;
  streak: number;
  input: MaltlineInput;
  prevServe: boolean;
  playerLane: number;
  playerStation: number;
  holding: FlavorId | null;
  blending: FlavorId | null;
  blendProgress: number;
  customers: CustomerState[];
  slides: SlideState[];
  jars: JarState[];
  washing: number[];
  jarsAvailable: number;
  spawned: number;
  serviceActions: number;
  fulfilled: number;
  walkouts: number;
  resolved: number;
  exited: number;
  spawnCountdown: number;
  nextId: number;
}

const SCENARIO_KEYS = [
  'id', 'name', 'ticksPerSecond', 'lanes', 'laneLength', 'stations', 'jarPoolSize',
  'blendTicks', 'washTicks', 'drinkTicks', 'customerCount', 'spawnIntervalTicks',
  'spawnAccelerationTicks', 'spawnIntervalFloorTicks', 'marchSpeed', 'leaveSpeed',
  'slideSpeed', 'returnSpeed', 'resumeExitThreshold', 'stationRepeatTicks',
  'laneRepeatTicks', 'lives', 'seed',
] as const;

const STATE_KEYS = [
  'tick', 'scenarioId', 'status', 'score', 'lives', 'streak', 'player', 'customers',
  'slides', 'jars', 'washing', 'spawned', 'serviceActions', 'fulfilled', 'walkouts',
  'resolved', 'exited', 'currentInput',
] as const;

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
  seen: Set<object>,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  if (seen.has(value)) throw new Error(`${label} must not be cyclic or aliased`);
  seen.add(value);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  if (ownKeys.length !== keys.length || keys.some((key) => !ownKeys.includes(key))) {
    throw new Error(`${label} has missing or extra fields`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactArray(
  value: unknown,
  maximum: number,
  label: string,
  seen: Set<object>,
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be an ordinary array`);
  }
  if (seen.has(value)) throw new Error(`${label} must not be cyclic or aliased`);
  seen.add(value);
  if (value.length > maximum) throw new Error(`${label} exceeds its maximum length`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string'
    || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)))) {
    throw new Error(`${label} must not contain extra or symbol keys`);
  }
  if (keys.length !== value.length + 1) throw new Error(`${label} must be dense`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}[${index}] must be an enumerable data property`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function safeInteger(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function finiteInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)
    || value < minimum || value > maximum) {
    throw new Error(`${label} must be a finite integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function strictScenario(value: unknown, seen: Set<object>): MaltlineScenario {
  const source = exactRecord(value, SCENARIO_KEYS, 'scenario', seen);
  const stations = exactArray(source.stations, FLAVORS.length, 'scenario.stations', seen);
  return {
    id: source.id as string,
    name: source.name as string,
    ticksPerSecond: source.ticksPerSecond as number,
    lanes: source.lanes as number,
    laneLength: source.laneLength as number,
    stations: [...stations] as FlavorId[],
    jarPoolSize: source.jarPoolSize as number,
    blendTicks: source.blendTicks as number,
    washTicks: source.washTicks as number,
    drinkTicks: source.drinkTicks as number,
    customerCount: source.customerCount as number,
    spawnIntervalTicks: source.spawnIntervalTicks as number,
    spawnAccelerationTicks: source.spawnAccelerationTicks as number,
    spawnIntervalFloorTicks: source.spawnIntervalFloorTicks as number,
    marchSpeed: source.marchSpeed as number,
    leaveSpeed: source.leaveSpeed as number,
    slideSpeed: source.slideSpeed as number,
    returnSpeed: source.returnSpeed as number,
    resumeExitThreshold: source.resumeExitThreshold as number,
    stationRepeatTicks: source.stationRepeatTicks as number,
    laneRepeatTicks: source.laneRepeatTicks as number,
    lives: source.lives as number,
    seed: source.seed as number,
  };
}

function strictRun(value: unknown, seen: Set<object>): RunContext {
  const source = exactRecord(value, ['lives', 'score'], 'run', seen);
  return { lives: source.lives as number, score: source.score as number };
}

function normalizeInput(value: unknown, seen: Set<object>): MaltlineInput {
  const source = exactRecord(value, ['stationDir', 'laneDir', 'blend', 'serve'], 'state.currentInput', seen);
  const stationDir = finiteInteger(source.stationDir, 'state.currentInput.stationDir', -1, 1);
  const laneDir = finiteInteger(source.laneDir, 'state.currentInput.laneDir', -1, 1);
  const blend = boolean(source.blend, 'state.currentInput.blend');
  const serve = boolean(source.serve, 'state.currentInput.serve');
  if (stationDir !== 0 || laneDir !== 0 || blend || serve) {
    throw new Error('state.currentInput must be idle');
  }
  return { stationDir: 0, laneDir: 0, blend: false, serve: false };
}

function normalizeCustomer(
  value: unknown,
  index: number,
  scenario: MaltlineEngine['scenario'],
  seen: Set<object>,
): CustomerState {
  const label = `state.customers[${index}]`;
  const source = exactRecord(value, [
    'id', 'lane', 'x', 'flavor', 'phase', 'timer', 'fulfilled', 'requeues',
    'catchBonusEligible', 'exitAfterDrink',
  ], label, seen);
  const id = safeInteger(source.id, `${label}.id`, 1, Number.MAX_SAFE_INTEGER - 1);
  const lane = safeInteger(source.lane, `${label}.lane`, 0, scenario.lanes - 1);
  const x = safeInteger(source.x, `${label}.x`, 0, Math.round(scenario.laneLength * FIXED_SCALE));
  if (typeof source.flavor !== 'string' || !scenario.stations.includes(source.flavor as FlavorId)) {
    throw new Error(`${label}.flavor must be sold by the scenario`);
  }
  if (source.phase !== 'marching' && source.phase !== 'drinking' && source.phase !== 'leaving') {
    throw new Error(`${label}.phase is invalid`);
  }
  const phase = source.phase as CustomerPhase;
  const timer = safeInteger(source.timer, `${label}.timer`, 0, scenario.drinkTicks);
  const fulfilled = boolean(source.fulfilled, `${label}.fulfilled`);
  const requeues = safeInteger(
    source.requeues,
    `${label}.requeues`,
    0,
    MALTLINE_RULES.maximumRequeuesPerCustomer,
  );
  const catchBonusEligible = boolean(source.catchBonusEligible, `${label}.catchBonusEligible`);
  const exitAfterDrink = boolean(source.exitAfterDrink, `${label}.exitAfterDrink`);
  if (phase === 'drinking' ? timer < 1 : timer !== 0) {
    throw new Error(`${label}.timer does not match its phase`);
  }
  if (!fulfilled && (phase !== 'marching' || requeues !== 0 || catchBonusEligible || exitAfterDrink)) {
    throw new Error(`${label} has impossible unfulfilled state`);
  }
  if (fulfilled && phase === 'marching'
    && (requeues !== 1 || catchBonusEligible || exitAfterDrink)) {
    throw new Error(`${label} has impossible resumed state`);
  }
  if (phase === 'leaving' && (!fulfilled || catchBonusEligible || !exitAfterDrink)) {
    throw new Error(`${label} has impossible leaving state`);
  }
  if (phase === 'drinking') {
    const expectedBonus = requeues === 0 || !exitAfterDrink;
    if (!fulfilled || catchBonusEligible !== expectedBonus
      || (!exitAfterDrink && requeues !== 1)) {
      throw new Error(`${label} has impossible drinking state`);
    }
  }
  const resumeExitThresholdFp = Math.round(
    scenario.resumeExitThreshold * scenario.laneLength * FIXED_SCALE,
  );
  if (fulfilled && phase === 'drinking') {
    const correctSide = requeues === 0
      ? x >= resumeExitThresholdFp
      : x < resumeExitThresholdFp;
    if (!correctSide) throw new Error(`${label}.x contradicts its drinking rescue-threshold history`);
  }
  if (fulfilled && phase === 'marching' && x >= resumeExitThresholdFp) {
    throw new Error(`${label}.x contradicts its resumed-marching rescue-threshold history`);
  }
  if (fulfilled && phase === 'leaving' && requeues === 0 && x < resumeExitThresholdFp) {
    throw new Error(`${label}.x contradicts its first-service leaving threshold history`);
  }
  return {
    id, lane, x, flavor: source.flavor as FlavorId, phase, timer,
    fulfilled, requeues, catchBonusEligible, exitAfterDrink,
  };
}

function normalizeSlide(
  value: unknown,
  index: number,
  scenario: MaltlineEngine['scenario'],
  seen: Set<object>,
): SlideState {
  const label = `state.slides[${index}]`;
  const source = exactRecord(value, ['id', 'lane', 'x', 'flavor'], label, seen);
  const flavor = source.flavor;
  if (typeof flavor !== 'string' || !scenario.stations.includes(flavor as FlavorId)) {
    throw new Error(`${label}.flavor must be sold by the scenario`);
  }
  return {
    id: safeInteger(source.id, `${label}.id`, 1, Number.MAX_SAFE_INTEGER - 1),
    lane: safeInteger(source.lane, `${label}.lane`, 0, scenario.lanes - 1),
    x: safeInteger(source.x, `${label}.x`, 0, Math.round(scenario.laneLength * FIXED_SCALE)),
    flavor: flavor as FlavorId,
  };
}

function normalizeJar(
  value: unknown,
  index: number,
  scenario: MaltlineEngine['scenario'],
  seen: Set<object>,
): JarState {
  const label = `state.jars[${index}]`;
  const source = exactRecord(value, ['id', 'customerId', 'lane', 'x', 'catchBonusEligible'], label, seen);
  return {
    id: safeInteger(source.id, `${label}.id`, 1, Number.MAX_SAFE_INTEGER - 1),
    customerId: safeInteger(source.customerId, `${label}.customerId`, 1, Number.MAX_SAFE_INTEGER - 1),
    lane: safeInteger(source.lane, `${label}.lane`, 0, scenario.lanes - 1),
    x: safeInteger(source.x, `${label}.x`, 0, Math.round(scenario.laneLength * FIXED_SCALE)),
    catchBonusEligible: boolean(source.catchBonusEligible, `${label}.catchBonusEligible`),
  };
}

function fulfillmentScore(count: number): number {
  let total = 0;
  for (let index = 0; index < count; index++) {
    total += MALTLINE_RULES.serveBaseScore
      + MALTLINE_RULES.serveStreakStep * Math.min(index, MALTLINE_RULES.serveStreakCap);
  }
  return total;
}

function freezeState(state: MaltlineState): Readonly<MaltlineState> {
  Object.freeze(state.player);
  for (const customer of state.customers) Object.freeze(customer);
  for (const slide of state.slides) Object.freeze(slide);
  for (const jar of state.jars) Object.freeze(jar);
  Object.freeze(state.customers);
  Object.freeze(state.slides);
  Object.freeze(state.jars);
  Object.freeze(state.washing);
  Object.freeze(state.currentInput);
  return Object.freeze(state);
}

/**
 * Build a deliberately narrow, validated engine checkpoint for fatal resolution
 * ordering tests. Its synthetic baseline permits unique fulfillments plus at
 * most one rescue per fulfilled customer, followed by prior walkouts, but no
 * earlier jar catch, jar/slide smash, or other committed-jar removal: every
 * completed service is represented by either a drinking customer or a returning
 * jar. Accordingly, first drink owns no jar; second drink and resumed marching
 * own the first bonus jar; leaving after one service owns that bonus jar; and
 * leaving after rescue owns both bonus and nonbonus jars. Positions at zero and
 * lane length are admitted deliberately: this is a synthetic branch-entry
 * checkpoint and need not be a publicly observable post-tick snapshot. This is
 * test support, not a replay or production restore API.
 */
export function createMaltlineResolutionHarness(value: unknown): MaltlineResolutionHarness {
  const seen = new Set<object>();
  const input = exactRecord(value, ['scenario', 'run', 'state'], 'resolution harness', seen);
  const scenario = strictScenario(input.scenario, seen);
  const run = strictRun(input.run, seen);
  const state = exactRecord(input.state, STATE_KEYS, 'state', seen);

  const engine = new MaltlineEngine(scenario, run);
  const baseline = engine.snapshot();
  if (baseline.status !== 'running') throw new Error('resolution harness run must start running');
  const normalizedScenario = engine.scenario;

  if (state.scenarioId !== normalizedScenario.id) throw new Error('state.scenarioId must match scenario.id');
  if (state.status !== 'running') throw new Error('state.status must be running');
  const tick = safeInteger(state.tick, 'state.tick');
  const score = safeInteger(state.score, 'state.score');
  const lives = safeInteger(state.lives, 'state.lives', 1);
  const streak = safeInteger(state.streak, 'state.streak');
  const player = exactRecord(
    state.player,
    ['lane', 'station', 'holding', 'blending', 'blendProgress'],
    'state.player',
    seen,
  );
  const playerLane = safeInteger(player.lane, 'state.player.lane', 0, normalizedScenario.lanes - 1);
  const playerStation = safeInteger(
    player.station,
    'state.player.station',
    0,
    normalizedScenario.stations.length - 1,
  );
  if (player.holding !== null || player.blending !== null || player.blendProgress !== 0) {
    throw new Error('state.player must not be holding or blending');
  }

  const customers = exactArray(
    state.customers,
    normalizedScenario.customerCount,
    'state.customers',
    seen,
  ).map((customer, index) => normalizeCustomer(customer, index, normalizedScenario, seen));
  const slides = exactArray(state.slides, normalizedScenario.jarPoolSize, 'state.slides', seen)
    .map((slide, index) => normalizeSlide(slide, index, normalizedScenario, seen));
  const jars = exactArray(state.jars, normalizedScenario.jarPoolSize, 'state.jars', seen)
    .map((jar, index) => normalizeJar(jar, index, normalizedScenario, seen));
  const washing = exactArray(state.washing, 0, 'state.washing', seen);
  if (washing.length !== 0) throw new Error('state.washing must be empty');
  const currentInput = normalizeInput(state.currentInput, seen);

  const spawned = safeInteger(state.spawned, 'state.spawned', 0, normalizedScenario.customerCount);
  const serviceActions = safeInteger(state.serviceActions, 'state.serviceActions');
  const fulfilled = safeInteger(state.fulfilled, 'state.fulfilled', 0, spawned);
  const walkouts = safeInteger(state.walkouts, 'state.walkouts', 0, spawned);
  const resolved = safeInteger(state.resolved, 'state.resolved', 0, spawned);
  const exited = safeInteger(state.exited, 'state.exited', 0, spawned);
  if (spawned !== normalizedScenario.customerCount) throw new Error('state must have all customers spawned');
  if (spawned !== customers.length + walkouts + exited) {
    throw new Error('state.spawned must equal active customers + walkouts + exited');
  }
  if (resolved !== walkouts + exited) throw new Error('state.resolved must equal walkouts + exited');
  const activeFulfilled = customers.filter((customer) => customer.fulfilled).length;
  if (fulfilled < activeFulfilled + exited || fulfilled > activeFulfilled + exited + walkouts) {
    throw new Error('state.fulfilled is inconsistent with active and resolved customers');
  }
  if (serviceActions < fulfilled || serviceActions > fulfilled * 2) {
    throw new Error('state.serviceActions must be from fulfilled through twice fulfilled');
  }
  const expectedLives = baseline.lives - walkouts;
  if (expectedLives < 1 || lives !== expectedLives) {
    throw new Error('state.lives must equal run lives minus prior walkouts and remain positive');
  }
  const expectedScore = baseline.score + fulfillmentScore(fulfilled);
  if (!Number.isSafeInteger(expectedScore) || score !== expectedScore) {
    throw new Error('state.score must equal run score plus the unique-fulfillment ledger');
  }
  const expectedStreak = walkouts === 0 ? fulfilled : 0;
  if (streak !== expectedStreak) {
    throw new Error('state.streak must match the harness baseline history');
  }

  const committedJars = slides.length + jars.length
    + customers.filter((customer) => customer.phase === 'drinking').length;
  if (committedJars > normalizedScenario.jarPoolSize) {
    throw new Error('state overcommits the scenario jar pool');
  }
  const jarsAvailable = normalizedScenario.jarPoolSize - committedJars;
  if (customers.length + slides.length + jars.length === 0) {
    throw new Error('running resolution state must contain an active entity');
  }

  const ids = [...customers.map(({ id }) => id), ...slides.map(({ id }) => id), ...jars.map(({ id }) => id)];
  if (new Set(ids).size !== ids.length) throw new Error('active entity IDs must be globally unique');
  const nonCustomerIds = new Set([...slides.map(({ id }) => id), ...jars.map(({ id }) => id)]);
  const activeCustomersById = new Map(customers.map((customer) => [customer.id, customer]));
  const jarsByCustomer = new Map<number, JarState[]>();
  for (const jar of jars) {
    if (jar.customerId >= jar.id) throw new Error('state jar customerId must precede its jar id');
    if (nonCustomerIds.has(jar.customerId)) {
      throw new Error('state jar customerId must not collide with a live non-customer entity');
    }
    const activeOwner = activeCustomersById.get(jar.customerId);
    if (activeOwner !== undefined && !activeOwner.fulfilled) {
      throw new Error('state jar cannot reference an active unfulfilled customer');
    }
    if (activeOwner !== undefined && jar.lane !== activeOwner.lane) {
      throw new Error('state jar lane must match its active customer owner lane');
    }
    const owned = jarsByCustomer.get(jar.customerId) ?? [];
    owned.push(jar);
    jarsByCustomer.set(jar.customerId, owned);
  }
  const representedServices = jars.length
    + customers.filter((customer) => customer.phase === 'drinking').length;
  if (serviceActions !== representedServices) {
    throw new Error(
      'state.serviceActions must equal returning jars + drinking customers under the no-removal contract',
    );
  }
  for (const customer of customers) {
    if (!customer.fulfilled) continue;
    const owned = jarsByCustomer.get(customer.id) ?? [];
    const bonusJars = owned.filter(({ catchBonusEligible }) => catchBonusEligible).length;
    const rescueJars = owned.length - bonusJars;
    let validHistory = false;
    if (customer.phase === 'drinking') {
      validHistory = customer.catchBonusEligible
        ? owned.length === 0
        : owned.length === 1 && bonusJars === 1;
    } else if (customer.phase === 'marching' || customer.requeues === 0) {
      validHistory = owned.length === 1 && bonusJars === 1;
    } else {
      validHistory = owned.length === 2 && bonusJars === 1 && rescueJars === 1;
    }
    if (!validHistory) {
      throw new Error(
        'state active fulfilled customer phase must match its exact owned-jar no-removal history',
      );
    }
  }
  const artifactCustomerIds = new Set([
    ...jars.map(({ customerId }) => customerId),
    ...customers.filter(({ phase }) => phase === 'drinking').map(({ id }) => id),
  ]);
  if (artifactCustomerIds.size !== fulfilled) {
    throw new Error(
      'state fulfillment owners must exactly match returning jars and drinking customers under the no-removal contract',
    );
  }
  if (jars.length > serviceActions || jarsByCustomer.size > fulfilled
    || [...jarsByCustomer.values()].some((owned) => owned.length > 2
      || owned.filter(({ catchBonusEligible }) => catchBonusEligible).length > 1
      || (owned.some(({ catchBonusEligible }) => !catchBonusEligible)
        && !owned.some(({ catchBonusEligible }) => catchBonusEligible)))) {
    throw new Error('state jars are inconsistent with fulfilled service ownership');
  }
  let maximumId = 0;
  for (const id of ids) maximumId = Math.max(maximumId, id);
  for (const jar of jars) maximumId = Math.max(maximumId, jar.customerId);
  const nextId = maximumId + 1;
  if (!Number.isSafeInteger(nextId)) throw new Error('state entity IDs leave no safe next ID');

  const normalizedCustomers = customers.map((customer) => ({ ...customer }));
  const normalizedSlides = slides.map((slide) => ({ ...slide }));
  const normalizedJars = jars.map((jar) => ({ ...jar }));
  const internals = engine as unknown as MutableResolutionInternals;
  internals.tickNumber = tick;
  internals.status = 'running';
  internals.score = score;
  internals.lives = lives;
  internals.streak = streak;
  internals.input = { ...IDLE_INPUT };
  internals.prevServe = false;
  internals.playerLane = playerLane;
  internals.playerStation = playerStation;
  internals.holding = null;
  internals.blending = null;
  internals.blendProgress = 0;
  internals.customers = normalizedCustomers;
  internals.slides = normalizedSlides;
  internals.jars = normalizedJars;
  internals.washing = [];
  internals.jarsAvailable = jarsAvailable;
  internals.spawned = spawned;
  internals.serviceActions = serviceActions;
  internals.fulfilled = fulfilled;
  internals.walkouts = walkouts;
  internals.resolved = resolved;
  internals.exited = exited;
  internals.spawnCountdown = 1;
  internals.nextId = nextId;

  const initialState = freezeState(engine.snapshot());
  return Object.freeze({ kind: MALTLINE_RESOLUTION_HARNESS_KIND, engine, initialState });
}

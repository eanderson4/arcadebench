import { MALTLINE_GENERATION_2_AUTHORITY } from '../core/authority';
import {
  fingerprintMaltlineCampaign,
  fingerprintNormalizedMaltlineScenario,
  maltlineScenarioFingerprintData,
} from '../core/campaign-fingerprint';
import { MaltlineEngine } from '../core/engine';
import { fingerprintCanonical } from '../core/fingerprint';
import { MALTLINE_GAME_ID, MALTLINE_RULES, MALTLINE_SCENARIO_SCHEMA_VERSION } from '../core/rules';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
} from '../core/scenario';
import type {
  CustomerState,
  EpisodeStatus,
  GameEvent,
  LifeLossReason,
  MaltlineScenario,
  MaltlineState,
  RunContext,
} from '../core/types';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  reactiveMaltlineController,
  type MaltlineController,
  type MaltlineControllerDefinition,
} from './reactive-controller';

export {
  fingerprintMaltlineCampaign,
  fingerprintNormalizedMaltlineScenario,
  maltlineScenarioFingerprintData,
} from '../core/campaign-fingerprint';

export const MALTLINE_TELEMETRY_SCHEMA_VERSION = 3 as const;
export const DEFAULT_TELEMETRY_TICK_LIMIT = 100_000;
export const MALTLINE_RULES_FINGERPRINT = fingerprintCanonical(MALTLINE_RULES);
export const MALTLINE_GAME_FINGERPRINT = fingerprintCanonical({
  gameId: MALTLINE_GAME_ID,
  scenarioSchemaVersion: MALTLINE_SCENARIO_SCHEMA_VERSION,
  rules: MALTLINE_RULES,
});

export type TelemetryStatus = EpisodeStatus | 'tick_limit';

export interface LossReasonCounts {
  walkout: number;
  shake_smashed: number;
  jar_smashed: number;
}

export interface MaltlineScoreLedger {
  servePoints: number;
  catchPoints: number;
  stageBonusPoints: number;
}

export interface MaltlineStageTelemetry {
  stage: number;
  scenarioId: string;
  scenarioFingerprint: string;
  name: string;
  seed: number;
  status: TelemetryStatus;
  ticks: number;
  seconds: number;
  score: number;
  scoreGained: number;
  lives: number;
  livesLost: number;
  maxLiveCustomers: number;
  maxMarchingCustomers: number;
  maxOpenDemand: number;
  maxJarsCommitted: number;
  maxLaneLoad: number;
  minJarsAvailable: number;
  ticksAtOneOrFewerJars: number;
  ticksAtZeroJars: number;
  openDemandTicks: number;
  openDemandCustomerTicks: number;
  multiOrderTicks: number;
  multiOrderLaneTicks: number;
  multiOrderFlavorTicks: number;
  returningJarTicks: number;
  orderReturnConflictTicks: number;
  crossLaneOrderReturnConflictTicks: number;
  pacingWindowTicks: number;
  quietPacingTicks: number;
  longestQuietPacingRunTicks: number;
  spawnFloorHitCount: number;
  spawned: number;
  serviceActions: number;
  repeatServiceActions: number;
  fulfilled: number;
  walkouts: number;
  neverFulfilledWalkouts: number;
  fulfilledThenWalkout: number;
  resolved: number;
  exited: number;
  lossReasons: LossReasonCounts;
  scoreLedger: MaltlineScoreLedger;
}

export interface MaltlineCampaignSummary {
  status: TelemetryStatus;
  stagesRun: number;
  stagesCleared: number;
  ticks: number;
  seconds: number;
  score: number;
  scoreGained: number;
  lives: number;
  livesLost: number;
  maxLiveCustomers: number;
  maxMarchingCustomers: number;
  maxOpenDemand: number;
  maxJarsCommitted: number;
  maxLaneLoad: number;
  minJarsAvailable: number;
  ticksAtOneOrFewerJars: number;
  ticksAtZeroJars: number;
  openDemandTicks: number;
  openDemandCustomerTicks: number;
  multiOrderTicks: number;
  multiOrderLaneTicks: number;
  multiOrderFlavorTicks: number;
  returningJarTicks: number;
  orderReturnConflictTicks: number;
  crossLaneOrderReturnConflictTicks: number;
  pacingWindowTicks: number;
  quietPacingTicks: number;
  longestQuietPacingRunTicks: number;
  spawnFloorHitCount: number;
  spawned: number;
  serviceActions: number;
  repeatServiceActions: number;
  fulfilled: number;
  walkouts: number;
  neverFulfilledWalkouts: number;
  fulfilledThenWalkout: number;
  resolved: number;
  exited: number;
  lossReasons: LossReasonCounts;
  scoreLedger: MaltlineScoreLedger;
}

export interface MaltlineCampaignTelemetry {
  schemaVersion: typeof MALTLINE_TELEMETRY_SCHEMA_VERSION;
  identity: MaltlineTelemetryIdentity;
  stages: MaltlineStageTelemetry[];
  campaign: MaltlineCampaignSummary;
}

export interface MaltlineTelemetryIdentity {
  gameId: typeof MALTLINE_GAME_ID;
  gameFingerprint: string;
  rulesFingerprint: string;
  controller: {
    id: string;
    fingerprint: string;
  };
  campaignFingerprint: string;
  scenarioFingerprints: ReadonlyArray<{
    id: string;
    fingerprint: string;
  }>;
  configurationFingerprint: string;
}

export interface CampaignTelemetryOptions {
  scenarios?: readonly MaltlineScenario[];
  initialRun?: RunContext;
  controller?: MaltlineControllerDefinition;
  tickLimitPerStage?: number;
  /** Optional campaign-wide tick ceiling shared by every stage. */
  totalTickLimit?: number;
}

/** Stable, human-readable JSON for checked-in tools and artifact comparisons. */
export function formatMaltlineCampaignTelemetry(telemetry: MaltlineCampaignTelemetry): string {
  return `${JSON.stringify(telemetry, null, 2)}\n`;
}

function emptyLossReasons(): LossReasonCounts {
  return { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
}

function emptyScoreLedger(): MaltlineScoreLedger {
  return { servePoints: 0, catchPoints: 0, stageBonusPoints: 0 };
}

function roundedSeconds(ticks: number, ticksPerSecond: number): number {
  return Number((ticks / ticksPerSecond).toFixed(3));
}

interface BoundController {
  readonly id: string;
  readonly fingerprint: string;
  readonly create: () => MaltlineController;
}

interface CampaignTickLedger {
  readonly limit: number;
  reserved: number;
}

function reserveCampaignTick(ledger: CampaignTickLedger | undefined): boolean {
  if (ledger === undefined) return true;
  if (ledger.reserved >= ledger.limit) return false;
  ledger.reserved++;
  return true;
}

function bindController(controller: MaltlineControllerDefinition): BoundController {
  if (controller === null || typeof controller !== 'object') {
    throw new Error('telemetry controller must be a definition object');
  }
  const id = controller.id;
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,127})$/.test(id)) {
    throw new Error('telemetry controller id must be a stable lowercase identifier');
  }
  if (typeof controller.create !== 'function') {
    throw new Error('telemetry controller create must be a function');
  }
  // Compute and retain identity before the first decision. A controller cannot
  // relabel its own output by mutating its definition during a run.
  const fingerprint = fingerprintCanonical({
    id,
    behavior: controller.fingerprintData,
  });
  return Object.freeze({ id, fingerprint, create: controller.create });
}

function jarsCommitted(state: MaltlineState): number {
  const playerJar = Number(state.player.holding !== null || state.player.blending !== null);
  let drinkingJars = 0;
  for (const customer of state.customers) {
    if (customer.phase === 'drinking') drinkingJars++;
  }
  return playerJar + drinkingJars + state.slides.length + state.jars.length + state.washing.length;
}

function maximumLaneLoad(state: MaltlineState, loads: number[]): number {
  loads.fill(0);
  for (const customer of state.customers) loads[customer.lane]!++;
  let maximum = 0;
  for (const load of loads) maximum = Math.max(maximum, load);
  return maximum;
}

function recordLosses(events: readonly GameEvent[], counts: LossReasonCounts): void {
  for (const event of events) {
    if (event.type === 'life_lost') counts[event.reason]++;
  }
}

/**
 * Orders which still require a player decision. Slides reserve distinct
 * matching marching customers in stable launch order; drinking/leaving
 * customers and orders already covered by a slide are not open demand.
 */
export function maltlineOpenDemandCustomers(
  state: Readonly<MaltlineState>,
): readonly Readonly<CustomerState>[] {
  const analysis = createOpenDemandAnalysis();
  analyzeOpenDemand(state, analysis);
  return Object.freeze(state.customers
    .filter((customer) => customer.phase === 'marching'
      && !analysis.reservedCustomerIds.includes(customer.id))
    .sort((left, right) => left.x - right.x || left.id - right.id));
}

interface OpenDemandAnalysis {
  reservedCustomerIds: number[];
  marchingCount: number;
  openCount: number;
  nearestOpenCustomer: Readonly<CustomerState> | undefined;
  hasMultipleLanes: boolean;
  hasMultipleFlavors: boolean;
}

function createOpenDemandAnalysis(): OpenDemandAnalysis {
  return {
    reservedCustomerIds: [],
    marchingCount: 0,
    openCount: 0,
    nearestOpenCustomer: undefined,
    hasMultipleLanes: false,
    hasMultipleFlavors: false,
  };
}

function analyzeOpenDemand(state: Readonly<MaltlineState>, analysis: OpenDemandAnalysis): void {
  analysis.reservedCustomerIds.length = 0;
  analysis.marchingCount = 0;
  analysis.openCount = 0;
  analysis.nearestOpenCustomer = undefined;
  analysis.hasMultipleLanes = false;
  analysis.hasMultipleFlavors = false;

  for (const customer of state.customers) {
    if (customer.phase === 'marching') analysis.marchingCount++;
  }

  // Select slides by ascending launch id without allocating/sorting on the hot path.
  let previousSlideId = -1;
  for (let slideIndex = 0; slideIndex < state.slides.length; slideIndex++) {
    let slide = state.slides[0]!;
    for (const candidate of state.slides) {
      if (candidate.id > previousSlideId
        && (slide.id <= previousSlideId || candidate.id < slide.id)) slide = candidate;
    }
    previousSlideId = slide.id;
    let target: Readonly<CustomerState> | undefined;
    for (const customer of state.customers) {
      if (customer.phase !== 'marching'
        || analysis.reservedCustomerIds.includes(customer.id)
        || customer.lane !== slide.lane
        || customer.flavor !== slide.flavor
        || customer.x <= slide.x) continue;
      if (target === undefined
        || customer.x < target.x
        || (customer.x === target.x && customer.id < target.id)) target = customer;
    }
    if (target !== undefined) analysis.reservedCustomerIds.push(target.id);
  }

  let firstOpen: Readonly<CustomerState> | undefined;
  for (const customer of state.customers) {
    if (customer.phase !== 'marching'
      || analysis.reservedCustomerIds.includes(customer.id)) continue;
    analysis.openCount++;
    firstOpen ??= customer;
    analysis.hasMultipleLanes ||= customer.lane !== firstOpen.lane;
    analysis.hasMultipleFlavors ||= customer.flavor !== firstOpen.flavor;
    const nearest = analysis.nearestOpenCustomer;
    if (nearest === undefined
      || customer.x < nearest.x
      || (customer.x === nearest.x && customer.id < nearest.id)) {
      analysis.nearestOpenCustomer = customer;
    }
  }
}

function recordScoreLedger(events: readonly GameEvent[], ledger: MaltlineScoreLedger): void {
  for (const event of events) {
    if (event.type === 'served') ledger.servePoints += event.points;
    if (event.type === 'jar_caught') ledger.catchPoints += event.points;
    if (event.type === 'stage_cleared') ledger.stageBonusPoints += event.bonus;
  }
}

function recordWalkoutKinds(
  events: readonly GameEvent[],
  previousState: Readonly<MaltlineState>,
): { neverFulfilled: number; fulfilledThenWalkout: number } {
  let neverFulfilled = 0;
  let fulfilledThenWalkout = 0;
  for (const event of events) {
    if (event.type !== 'walkout') continue;
    const customer = previousState.customers.find((candidate) => candidate.id === event.customerId);
    if (customer === undefined) {
      const spawnedThisTick = events.some((candidate) => (
        candidate.type === 'customer_spawned' && candidate.customerId === event.customerId
      ));
      if (spawnedThisTick) {
        neverFulfilled++;
        continue;
      }
      throw new Error('telemetry walkout event does not identify a current-tick customer');
    }
    if (customer.fulfilled) fulfilledThenWalkout++;
    else neverFulfilled++;
  }
  return { neverFulfilled, fulfilledThenWalkout };
}

function runMaltlineStageTelemetryWithLedger(
  scenario: MaltlineScenario,
  run: RunContext,
  stage: number,
  controller: MaltlineController,
  tickLimit: number,
  campaignLedger: CampaignTickLedger | undefined,
): MaltlineStageTelemetry {
  if (!Number.isSafeInteger(tickLimit) || tickLimit < 1) {
    throw new Error('telemetry tick limit must be a positive integer');
  }

  const engine = new MaltlineEngine(scenario, run);
  const normalizedScenario = engine.scenario;
  let state = engine.snapshot();
  const initialState = state;
  const laneLoads = new Array<number>(normalizedScenario.lanes).fill(0);
  const demand = createOpenDemandAnalysis();
  let maxLiveCustomers = state.customers.length;
  let maxMarchingCustomers = 0;
  let maxOpenDemand = 0;
  let maxJarsCommitted = jarsCommitted(state);
  let maxLaneLoad = maximumLaneLoad(state, laneLoads);
  let minJarsAvailable = state.jarsAvailable;
  let ticksAtOneOrFewerJars = 0;
  let ticksAtZeroJars = 0;
  let openDemandTicks = 0;
  let openDemandCustomerTicks = 0;
  let multiOrderTicks = 0;
  let multiOrderLaneTicks = 0;
  let multiOrderFlavorTicks = 0;
  let returningJarTicks = 0;
  let orderReturnConflictTicks = 0;
  let crossLaneOrderReturnConflictTicks = 0;
  let pacingWindowTicks = 0;
  let quietPacingTicks = 0;
  let longestQuietPacingRunTicks = 0;
  let currentQuietPacingRunTicks = 0;
  let spawnFloorHitCount = 0;
  let neverFulfilledWalkouts = 0;
  let fulfilledThenWalkout = 0;
  const lossReasons = emptyLossReasons();
  const scoreLedger = emptyScoreLedger();

  while (state.status === 'running' && state.tick < tickLimit) {
    // Reserve before calling caller-owned controller code. Successful telemetry
    // therefore has one reservation, controller invocation, and engine step per
    // reported tick, while a throwing callback cannot exceed the work ceiling.
    if (!reserveCampaignTick(campaignLedger)) break;
    const previousState = state;
    engine.setInput(controller(state, normalizedScenario));
    const result = engine.step();
    state = result.state;
    recordLosses(result.events, lossReasons);
    recordScoreLedger(result.events, scoreLedger);
    const walkoutKinds = recordWalkoutKinds(result.events, previousState);
    neverFulfilledWalkouts += walkoutKinds.neverFulfilled;
    fulfilledThenWalkout += walkoutKinds.fulfilledThenWalkout;
    maxLiveCustomers = Math.max(maxLiveCustomers, state.customers.length);
    analyzeOpenDemand(state, demand);
    maxMarchingCustomers = Math.max(maxMarchingCustomers, demand.marchingCount);
    maxOpenDemand = Math.max(maxOpenDemand, demand.openCount);
    openDemandCustomerTicks += demand.openCount;
    if (demand.openCount > 0) openDemandTicks++;
    if (demand.openCount >= 2) multiOrderTicks++;
    if (demand.hasMultipleLanes) multiOrderLaneTicks++;
    if (demand.hasMultipleFlavors) multiOrderFlavorTicks++;
    let nearestReturningJar = state.jars[0];
    for (let index = 1; index < state.jars.length; index++) {
      const jar = state.jars[index]!;
      if (nearestReturningJar === undefined
        || jar.x < nearestReturningJar.x
        || (jar.x === nearestReturningJar.x && jar.id < nearestReturningJar.id)) {
        nearestReturningJar = jar;
      }
    }
    if (nearestReturningJar !== undefined) returningJarTicks++;
    if (demand.openCount > 0 && nearestReturningJar !== undefined) {
      orderReturnConflictTicks++;
      if (demand.nearestOpenCustomer!.lane !== nearestReturningJar.lane) {
        crossLaneOrderReturnConflictTicks++;
      }
    }
    maxJarsCommitted = Math.max(maxJarsCommitted, jarsCommitted(state));
    maxLaneLoad = Math.max(maxLaneLoad, maximumLaneLoad(state, laneLoads));
    minJarsAvailable = Math.min(minJarsAvailable, state.jarsAvailable);
    if (state.jarsAvailable <= 1) ticksAtOneOrFewerJars++;
    if (state.jarsAvailable === 0) ticksAtZeroJars++;
    const inPacingWindow = state.spawned > 0 && state.spawned < normalizedScenario.customerCount;
    if (inPacingWindow) {
      pacingWindowTicks++;
      const quiet = demand.openCount === 0
        && state.player.holding === null
        && state.player.blending === null
        && state.slides.length === 0
        && state.jars.length === 0;
      if (quiet) {
        quietPacingTicks++;
        currentQuietPacingRunTicks++;
        longestQuietPacingRunTicks = Math.max(
          longestQuietPacingRunTicks,
          currentQuietPacingRunTicks,
        );
      } else {
        currentQuietPacingRunTicks = 0;
      }
    } else {
      currentQuietPacingRunTicks = 0;
    }
    if (result.events.some((event) => event.type === 'customer_spawned')
      && state.spawned < normalizedScenario.customerCount
      && normalizedScenario.spawnIntervalTicks
        - state.spawned * normalizedScenario.spawnAccelerationTicks
        <= normalizedScenario.spawnIntervalFloorTicks) {
      spawnFloorHitCount++;
    }
  }

  const scoreGained = state.score - initialState.score;
  const ledgerTotal = scoreLedger.servePoints
    + scoreLedger.catchPoints
    + scoreLedger.stageBonusPoints;
  if (ledgerTotal !== scoreGained) {
    throw new Error('telemetry score ledger does not reconcile with engine score');
  }
  const repeatServiceActions = state.serviceActions - state.fulfilled;
  if (repeatServiceActions < 0
    || neverFulfilledWalkouts + fulfilledThenWalkout !== state.walkouts) {
    throw new Error('telemetry service/walkout counters do not reconcile');
  }

  return {
    stage,
    scenarioId: normalizedScenario.id,
    scenarioFingerprint: fingerprintNormalizedMaltlineScenario(normalizedScenario),
    name: normalizedScenario.name,
    seed: normalizedScenario.seed,
    status: state.status === 'running' ? 'tick_limit' : state.status,
    ticks: state.tick,
    seconds: roundedSeconds(state.tick, normalizedScenario.ticksPerSecond),
    score: state.score,
    scoreGained,
    lives: state.lives,
    livesLost: initialState.lives - state.lives,
    maxLiveCustomers,
    maxMarchingCustomers,
    maxOpenDemand,
    maxJarsCommitted,
    maxLaneLoad,
    minJarsAvailable,
    ticksAtOneOrFewerJars,
    ticksAtZeroJars,
    openDemandTicks,
    openDemandCustomerTicks,
    multiOrderTicks,
    multiOrderLaneTicks,
    multiOrderFlavorTicks,
    returningJarTicks,
    orderReturnConflictTicks,
    crossLaneOrderReturnConflictTicks,
    pacingWindowTicks,
    quietPacingTicks,
    longestQuietPacingRunTicks,
    spawnFloorHitCount,
    spawned: state.spawned,
    serviceActions: state.serviceActions,
    repeatServiceActions,
    fulfilled: state.fulfilled,
    walkouts: state.walkouts,
    neverFulfilledWalkouts,
    fulfilledThenWalkout,
    resolved: state.resolved,
    exited: state.exited,
    lossReasons,
    scoreLedger,
  };
}

export function runMaltlineStageTelemetry(
  scenario: MaltlineScenario,
  run: RunContext,
  stage: number,
  controller: MaltlineController = reactiveMaltlineController,
  tickLimit = DEFAULT_TELEMETRY_TICK_LIMIT,
): MaltlineStageTelemetry {
  return runMaltlineStageTelemetryWithLedger(
    scenario,
    run,
    stage,
    controller,
    tickLimit,
    undefined,
  );
}

export function runMaltlineCampaignTelemetry(
  options: CampaignTelemetryOptions = {},
): MaltlineCampaignTelemetry {
  const sourceScenarios = options.scenarios ?? MALTLINE_GENERATION_2_AUTHORITY.campaign;
  if (sourceScenarios.length === 0) throw new Error('telemetry campaign needs at least one scenario');
  const scenarios = Object.freeze(sourceScenarios.map(normalizeMaltlineScenario));
  if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) {
    throw new Error('telemetry campaign scenario ids must be unique');
  }
  const controller = bindController(options.controller ?? REACTIVE_MALTLINE_CONTROLLER);
  const tickLimit = options.tickLimitPerStage ?? DEFAULT_TELEMETRY_TICK_LIMIT;
  if (!Number.isSafeInteger(tickLimit) || tickLimit < 1) {
    throw new Error('telemetry tick limit must be a positive integer');
  }
  const totalTickLimit = options.totalTickLimit;
  if (totalTickLimit !== undefined
    && (!Number.isSafeInteger(totalTickLimit) || totalTickLimit < 1)) {
    throw new Error('telemetry total tick limit must be a positive safe integer');
  }
  const initialRun = normalizeMaltlineRunContext(options.initialRun, scenarios[0]!);
  let run = { ...initialRun };
  const stages: MaltlineStageTelemetry[] = [];
  const campaignLedger = totalTickLimit === undefined
    ? undefined
    : { limit: totalTickLimit, reserved: 0 };
  let totalLimitReachedBeforeNextStage = false;

  for (let index = 0; index < scenarios.length; index++) {
    if (campaignLedger !== undefined && campaignLedger.reserved >= campaignLedger.limit) {
      totalLimitReachedBeforeNextStage = true;
      break;
    }
    const stage = runMaltlineStageTelemetryWithLedger(
      scenarios[index]!,
      run,
      index + 1,
      controller.create(),
      tickLimit,
      campaignLedger,
    );
    stages.push(stage);
    run = { lives: stage.lives, score: stage.score };
    if (stage.status !== 'won') break;
  }

  const lastStage = stages.at(-1)!;
  const lossReasons = stages.reduce<LossReasonCounts>((counts, stage) => ({
    walkout: counts.walkout + stage.lossReasons.walkout,
    shake_smashed: counts.shake_smashed + stage.lossReasons.shake_smashed,
    jar_smashed: counts.jar_smashed + stage.lossReasons.jar_smashed,
  }), emptyLossReasons());
  const totalSeconds = stages.reduce((total, stage, index) => (
    total + stage.ticks / scenarios[index]!.ticksPerSecond
  ), 0);

  const controllerFingerprint = controller.fingerprint;
  const scenarioFingerprints = scenarios.map((scenario) => ({
    id: scenario.id,
    fingerprint: fingerprintNormalizedMaltlineScenario(scenario),
  }));
  const campaignFingerprint = fingerprintCanonical({
    scenarios: scenarios.map(maltlineScenarioFingerprintData),
  });
  const configurationFingerprint = fingerprintCanonical({
    gameFingerprint: MALTLINE_GAME_FINGERPRINT,
    controllerFingerprint,
    campaignFingerprint,
    initialRun: { lives: initialRun.lives, score: initialRun.score },
    tickLimitPerStage: tickLimit,
    ...(totalTickLimit === undefined ? {} : { totalTickLimit }),
  });

  return {
    schemaVersion: MALTLINE_TELEMETRY_SCHEMA_VERSION,
    identity: {
      gameId: MALTLINE_GAME_ID,
      gameFingerprint: MALTLINE_GAME_FINGERPRINT,
      rulesFingerprint: MALTLINE_RULES_FINGERPRINT,
      controller: {
        id: controller.id,
        fingerprint: controllerFingerprint,
      },
      campaignFingerprint,
      scenarioFingerprints,
      configurationFingerprint,
    },
    stages,
    campaign: {
      status: totalLimitReachedBeforeNextStage
        ? 'tick_limit'
        : stages.length === scenarios.length && lastStage.status === 'won'
          ? 'won'
          : lastStage.status,
      stagesRun: stages.length,
      stagesCleared: stages.filter((stage) => stage.status === 'won').length,
      ticks: stages.reduce((total, stage) => total + stage.ticks, 0),
      seconds: Number(totalSeconds.toFixed(3)),
      score: lastStage.score,
      scoreGained: lastStage.score - initialRun.score,
      lives: lastStage.lives,
      livesLost: initialRun.lives - lastStage.lives,
      maxLiveCustomers: Math.max(...stages.map((stage) => stage.maxLiveCustomers)),
      maxMarchingCustomers: Math.max(...stages.map((stage) => stage.maxMarchingCustomers)),
      maxOpenDemand: Math.max(...stages.map((stage) => stage.maxOpenDemand)),
      maxJarsCommitted: Math.max(...stages.map((stage) => stage.maxJarsCommitted)),
      maxLaneLoad: Math.max(...stages.map((stage) => stage.maxLaneLoad)),
      minJarsAvailable: Math.min(...stages.map((stage) => stage.minJarsAvailable)),
      ticksAtOneOrFewerJars: stages.reduce(
        (total, stage) => total + stage.ticksAtOneOrFewerJars,
        0,
      ),
      ticksAtZeroJars: stages.reduce((total, stage) => total + stage.ticksAtZeroJars, 0),
      openDemandTicks: stages.reduce((total, stage) => total + stage.openDemandTicks, 0),
      openDemandCustomerTicks: stages.reduce(
        (total, stage) => total + stage.openDemandCustomerTicks,
        0,
      ),
      multiOrderTicks: stages.reduce((total, stage) => total + stage.multiOrderTicks, 0),
      multiOrderLaneTicks: stages.reduce(
        (total, stage) => total + stage.multiOrderLaneTicks,
        0,
      ),
      multiOrderFlavorTicks: stages.reduce(
        (total, stage) => total + stage.multiOrderFlavorTicks,
        0,
      ),
      returningJarTicks: stages.reduce((total, stage) => total + stage.returningJarTicks, 0),
      orderReturnConflictTicks: stages.reduce(
        (total, stage) => total + stage.orderReturnConflictTicks,
        0,
      ),
      crossLaneOrderReturnConflictTicks: stages.reduce(
        (total, stage) => total + stage.crossLaneOrderReturnConflictTicks,
        0,
      ),
      pacingWindowTicks: stages.reduce((total, stage) => total + stage.pacingWindowTicks, 0),
      quietPacingTicks: stages.reduce((total, stage) => total + stage.quietPacingTicks, 0),
      longestQuietPacingRunTicks: Math.max(
        ...stages.map((stage) => stage.longestQuietPacingRunTicks),
      ),
      spawnFloorHitCount: stages.reduce((total, stage) => total + stage.spawnFloorHitCount, 0),
      spawned: stages.reduce((total, stage) => total + stage.spawned, 0),
      serviceActions: stages.reduce((total, stage) => total + stage.serviceActions, 0),
      repeatServiceActions: stages.reduce(
        (total, stage) => total + stage.repeatServiceActions,
        0,
      ),
      fulfilled: stages.reduce((total, stage) => total + stage.fulfilled, 0),
      walkouts: stages.reduce((total, stage) => total + stage.walkouts, 0),
      neverFulfilledWalkouts: stages.reduce(
        (total, stage) => total + stage.neverFulfilledWalkouts,
        0,
      ),
      fulfilledThenWalkout: stages.reduce(
        (total, stage) => total + stage.fulfilledThenWalkout,
        0,
      ),
      resolved: stages.reduce((total, stage) => total + stage.resolved, 0),
      exited: stages.reduce((total, stage) => total + stage.exited, 0),
      lossReasons,
      scoreLedger: stages.reduce<MaltlineScoreLedger>((total, stage) => ({
        servePoints: total.servePoints + stage.scoreLedger.servePoints,
        catchPoints: total.catchPoints + stage.scoreLedger.catchPoints,
        stageBonusPoints: total.stageBonusPoints + stage.scoreLedger.stageBonusPoints,
      }), emptyScoreLedger()),
    },
  };
}

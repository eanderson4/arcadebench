import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
  getMaltlineAuthorityConfiguration,
  verifyMaltlineAuthorityConfiguration,
  type MaltlineCampaignAuthority,
} from '../core/authority';
import {
  fingerprintMaltlineCampaign,
  fingerprintNormalizedMaltlineScenario,
} from '../core/campaign-fingerprint';
import { MaltlineEngine } from '../core/engine';
import {
  fingerprintCanonical,
  sha256Canonical,
  type CanonicalValue,
} from '../core/fingerprint';
import { MALTLINE_RULES } from '../core/rules';
import { normalizeMaltlineScenario, type NormalizedMaltlineScenario } from '../core/scenario';
import type { GameEvent, LifeLossReason, MaltlineScenario, MaltlineState } from '../core/types';
import { maltlineOpenDemandCustomers } from '../telemetry/campaign-telemetry';
import { DEFAULT_SHADOW_SEED_OFFSETS } from '../telemetry/player-model-comparison';
import { PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER } from '../telemetry/physical-intent-controller';
import {
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
} from '../telemetry/player-model-controllers';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  type MaltlineControllerDefinition,
} from '../telemetry/reactive-controller';

export const P102_STAGE8_RELIEF_SCHEMA_VERSION = 1 as const;
export const P102_STAGE8_RELIEF_EXPERIMENT_ID = 'p1-02-stage8-arrival-relief-v1' as const;
export const P102_STAGE8_RELIEF_REVISION = 1 as const;
export const P102_STAGE8_RELIEF_STAGE_ID = 'maltline-08-closing-time' as const;
export const P102_STAGE8_CONTROL_INTERVAL = 132 as const;
export const P102_STAGE8_RELIEF_INTERVAL = 138 as const;

export const P102_STAGE8_RELIEF_POLICY = Object.freeze({
  eligibility: 'unranked',
  authorityRegistration: null,
  seasonId: null,
  rankedProofEmission: 'forbidden',
  reason: 'Stage 8 arrival relief is a prospective scenario experiment, not a registered Maltline authority.',
} as const);

export const P102_STAGE8_RELIEF_LIMITS = Object.freeze({
  candidates: 2,
  profiles: 4,
  seedOffsets: 33,
  stages: 8,
  stageTicks: 60_000,
  campaignTicks: 60_000,
  campaignRuns: 264,
  stageStarts: 2_112,
  cumulativeTicks: 15_840_000,
} as const);

const CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'registered-control',
    description: 'Exact registered generation-2 campaign.',
    changes: Object.freeze([]),
  }),
  Object.freeze({
    id: 'stage8-arrival-relief-138',
    description: 'Closing Time initial spawn interval changes from 132 to 138 ticks.',
    changes: Object.freeze([Object.freeze({
      stageId: P102_STAGE8_RELIEF_STAGE_ID,
      field: 'spawnIntervalTicks',
      from: P102_STAGE8_CONTROL_INTERVAL,
      to: P102_STAGE8_RELIEF_INTERVAL,
    })]),
  }),
] as const);

const PROFILES = Object.freeze([
  REACTIVE_MALTLINE_CONTROLLER,
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
]);

type CandidateId = typeof CANDIDATES[number]['id'];

export interface P102LossReasons {
  readonly walkout: number;
  readonly shake_smashed: number;
  readonly jar_smashed: number;
}

export interface P102LossRecovery {
  readonly tick: number;
  readonly campaignTick: number;
  readonly eventOrdinal: number;
  readonly reason: LifeLossReason;
  readonly lives: number;
  readonly nextFulfillmentTick: number | null;
  readonly nextFulfillmentEventOrdinal: number | null;
  readonly nextFulfillmentLatencyTicks: number | null;
}

export interface P102TerminalCascade {
  readonly definition: 'fatal-losses-since-last-first-fulfillment';
  readonly lossCount: number;
  readonly firstLossTick: number;
  readonly fatalLossTick: number;
  readonly spanTicks: number;
  readonly reasons: readonly LifeLossReason[];
}

export interface P102Stage8Observation {
  readonly scenarioId: typeof P102_STAGE8_RELIEF_STAGE_ID;
  readonly status: 'won' | 'lost';
  readonly ticks: number;
  readonly maxLiveCustomers: number;
  readonly maxMarchingCustomers: number;
  readonly maxOpenDemand: number;
  readonly maxJarsCommitted: number;
  readonly minJarsAvailable: number;
  readonly openDemandTicks: number;
  readonly multiOrderTicks: number;
  readonly ticksAtOneOrFewerJars: number;
  readonly ticksAtZeroJars: number;
  readonly ticksAtOneOrFewerJarsRate: number;
  readonly ticksAtZeroJarsRate: number;
  readonly losses: readonly P102LossRecovery[];
  readonly interLossSpacingTicks: readonly number[];
  readonly terminalCascade: P102TerminalCascade | null;
}

export interface P102Stage8ReliefRun {
  readonly candidateId: CandidateId;
  readonly profileId: string;
  readonly seedOffset: number;
  readonly seedSet: string;
  readonly effectiveCampaignFingerprint: string;
  readonly effectiveScenarioFingerprints: readonly string[];
  readonly sharedPrefix: P102SharedPrefixEvidence;
  readonly sharedPrefixFingerprint: string;
  readonly sharedPrefixStagesRun: number;
  readonly status: 'won' | 'lost';
  readonly stagesRun: number;
  readonly stagesCleared: number;
  readonly totalTicks: number;
  readonly seconds: number;
  readonly score: number;
  readonly lives: number;
  readonly lossReasons: P102LossReasons;
  readonly stage8: P102Stage8Observation | null;
}

interface Distribution {
  readonly min: number;
  readonly median: number;
  readonly mean: number;
  readonly max: number;
}

export interface P102Stage8ReliefSummary {
  readonly candidateId: CandidateId;
  readonly profileId: string;
  readonly runs: number;
  readonly wins: number;
  readonly stage8Reached: number;
  readonly stagesCleared: Distribution;
  readonly attemptSeconds: Distribution;
  readonly remainingLives: Distribution;
  readonly lossReasons: P102LossReasons;
  readonly stage8: null | {
    readonly maxLiveCustomers: Distribution;
    readonly maxOpenDemand: Distribution;
    readonly maxJarsCommitted: Distribution;
    readonly ticksAtOneOrFewerJars: Distribution;
    readonly ticksAtZeroJars: Distribution;
    readonly ticksAtOneOrFewerJarsRate: Distribution;
    readonly ticksAtZeroJarsRate: Distribution;
    readonly observedLosses: number;
    readonly lossesPairedToLaterFirstFulfillment: number;
    readonly recoveryLatencyTicks: Distribution | null;
    readonly interLossSpacingTicks: Distribution | null;
    readonly fatalRuns: number;
    readonly terminalCascades: number;
    readonly terminalCascadeLosses: Distribution | null;
    readonly terminalCascadeSpanTicks: Distribution | null;
  };
}

export interface P102Stage8ReliefArtifact {
  readonly schemaVersion: typeof P102_STAGE8_RELIEF_SCHEMA_VERSION;
  readonly experimentId: typeof P102_STAGE8_RELIEF_EXPERIMENT_ID;
  readonly experimentRevision: typeof P102_STAGE8_RELIEF_REVISION;
  readonly taskIds: readonly ['P1-02', 'P1-04', 'P1-08'];
  readonly prospective: true;
  readonly policy: typeof P102_STAGE8_RELIEF_POLICY;
  readonly identity: CanonicalValue;
  readonly experimentFingerprint: string;
  readonly resultSha256: string;
  readonly runs: readonly P102Stage8ReliefRun[];
  readonly summaries: readonly P102Stage8ReliefSummary[];
  readonly actualWork: Readonly<{
    logicalCampaignOutcomes: number;
    executedCampaignPrefixes: number;
    reusedCampaignPrefixes: number;
    stageStarts: number;
    controllerCreations: number;
    campaignTicks: number;
    controllerCalls: number;
    engineSteps: number;
  }>;
}

interface MutableStage8 {
  ticks: number;
  maxLiveCustomers: number;
  maxMarchingCustomers: number;
  maxOpenDemand: number;
  maxJarsCommitted: number;
  minJarsAvailable: number;
  openDemandTicks: number;
  multiOrderTicks: number;
  ticksAtOneOrFewerJars: number;
  ticksAtZeroJars: number;
  lossEvents: Array<{
    tick: number; campaignTick: number; eventOrdinal: number; reason: LifeLossReason; lives: number;
  }>;
  fulfillmentEvents: Array<{ tick: number; eventOrdinal: number }>;
}

interface WorkLedger {
  logicalCampaignOutcomes: number;
  executedCampaignPrefixes: number;
  reusedCampaignPrefixes: number;
  stageStarts: number;
  controllerCreations: number;
  campaignTicks: number;
  controllerCalls: number;
  engineSteps: number;
}

interface RuntimeLimits {
  stageTicks: number;
  campaignTicks: number;
  cumulativeTicks: number;
}

export interface P102SharedPrefixEvidence {
  readonly run: Readonly<{ lives: number; score: number }>;
  readonly totalTicks: number;
  readonly stagesCleared: number;
  readonly stagesRun: number;
  readonly status: 'won' | 'lost';
  readonly lossReasons: P102LossReasons;
}

export interface P102Stage8ReliefFreshOraclePair {
  readonly profileId: string;
  readonly seedOffset: number;
  readonly control: P102Stage8ReliefRun;
  readonly relief: P102Stage8ReliefRun;
}

export interface P102Stage8ReliefFreshOracle {
  readonly pairs: readonly P102Stage8ReliefFreshOraclePair[];
  readonly actualWork: P102Stage8ReliefArtifact['actualWork'];
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function emptyLossReasons(): P102LossReasons {
  return { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
}

function roundedSeconds(ticks: number): number {
  return Number((ticks / 60).toFixed(3));
}

function roundedRate(count: number, ticks: number): number {
  return ticks === 0 ? 0 : Number((count / ticks).toFixed(6));
}

function jarsCommitted(state: MaltlineState): number {
  return Number(state.player.holding !== null || state.player.blending !== null)
    + state.customers.filter(({ phase }) => phase === 'drinking').length
    + state.slides.length + state.jars.length + state.washing.length;
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) throw new Error('Stage 8 relief distribution cannot be empty.');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  return Object.freeze({
    min: sorted[0]!,
    median: Number(median.toFixed(3)),
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)),
    max: sorted.at(-1)!,
  });
}

function exactLimits(value: unknown): RuntimeLimits {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Stage 8 relief test limits must be an ordinary object.');
  }
  const keys = Reflect.ownKeys(value);
  const expected = ['stageTicks', 'campaignTicks', 'cumulativeTicks'];
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    throw new Error('Stage 8 relief test limits contain missing or unsupported fields.');
  }
  const result = {} as Record<string, number>;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`Stage 8 relief test limits.${key} must be an enumerable data property.`);
    }
    const maximum = P102_STAGE8_RELIEF_LIMITS[key as keyof Pick<typeof P102_STAGE8_RELIEF_LIMITS,
      'stageTicks' | 'campaignTicks' | 'cumulativeTicks'>];
    if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 1 || descriptor.value > maximum) {
      throw new Error(`Stage 8 relief test limits.${key} is outside its safe bound.`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result) as unknown as RuntimeLimits;
}

function effectiveCampaign(
  baseline: readonly NormalizedMaltlineScenario[],
  candidateId: CandidateId,
  seedOffset: number,
): readonly NormalizedMaltlineScenario[] {
  const campaign = baseline.map((scenario) => normalizeMaltlineScenario({
    ...scenario,
    stations: [...scenario.stations],
    seed: (scenario.seed + seedOffset) >>> 0,
    ...(candidateId === 'stage8-arrival-relief-138' && scenario.id === P102_STAGE8_RELIEF_STAGE_ID
      ? { spawnIntervalTicks: P102_STAGE8_RELIEF_INTERVAL }
      : {}),
  }));
  const changes: string[] = [];
  for (let index = 0; index < campaign.length; index++) {
    const source = baseline[index]!;
    const target = campaign[index]!;
    for (const key of Object.keys(source) as Array<keyof NormalizedMaltlineScenario>) {
      if (key === 'seed' || key === 'stations') continue;
      if (source[key] !== target[key]) changes.push(`${target.id}:${key}:${String(source[key])}->${String(target[key])}`);
    }
    if (source.stations.join('\0') !== target.stations.join('\0')) changes.push(`${target.id}:stations`);
  }
  const expected = candidateId === 'registered-control'
    ? []
    : [`${P102_STAGE8_RELIEF_STAGE_ID}:spawnIntervalTicks:${P102_STAGE8_CONTROL_INTERVAL}->${P102_STAGE8_RELIEF_INTERVAL}`];
  if (campaign.length !== 8 || campaign.map(({ id }) => id).join('\0') !== baseline.map(({ id }) => id).join('\0')
    || JSON.stringify(changes) !== JSON.stringify(expected)) {
    throw new Error(`Stage 8 relief candidate ${candidateId} produced an unexpected campaign diff.`);
  }
  return Object.freeze(campaign);
}

function observeStage8(state: MaltlineState, observation: MutableStage8): void {
  const demand = maltlineOpenDemandCustomers(state);
  const marching = state.customers.filter(({ phase }) => phase === 'marching').length;
  observation.ticks++;
  observation.maxLiveCustomers = Math.max(observation.maxLiveCustomers, state.customers.length);
  observation.maxMarchingCustomers = Math.max(observation.maxMarchingCustomers, marching);
  observation.maxOpenDemand = Math.max(observation.maxOpenDemand, demand.length);
  observation.maxJarsCommitted = Math.max(observation.maxJarsCommitted, jarsCommitted(state));
  observation.minJarsAvailable = Math.min(observation.minJarsAvailable, state.jarsAvailable);
  if (demand.length > 0) observation.openDemandTicks++;
  if (demand.length >= 2) observation.multiOrderTicks++;
  if (state.jarsAvailable <= 1) observation.ticksAtOneOrFewerJars++;
  if (state.jarsAvailable === 0) observation.ticksAtZeroJars++;
}

function recordEvents(
  events: readonly GameEvent[],
  campaignTick: number,
  lossReasons: P102LossReasons,
  observation: MutableStage8 | null,
): void {
  const tick = events[0]?.tick;
  if (events.some((event) => event.tick !== tick)) {
    throw new Error('Stage 8 relief engine event batches must contain one tick.');
  }
  for (let eventOrdinal = 0; eventOrdinal < events.length; eventOrdinal++) {
    const event = events[eventOrdinal]!;
    if (event.type === 'life_lost') {
      (lossReasons as Record<LifeLossReason, number>)[event.reason]++;
      observation?.lossEvents.push({
        tick: event.tick, campaignTick, eventOrdinal, reason: event.reason, lives: event.lives,
      });
    } else if (observation !== null && event.type === 'served' && event.firstFulfillment) {
      observation.fulfillmentEvents.push({ tick: event.tick, eventOrdinal });
    }
  }
}

function pairLossesToFirstFulfillments(observation: MutableStage8): readonly P102LossRecovery[] {
  let fulfillmentIndex = 0;
  return Object.freeze(observation.lossEvents.map((loss) => {
    while (fulfillmentIndex < observation.fulfillmentEvents.length) {
      const fulfillment = observation.fulfillmentEvents[fulfillmentIndex]!;
      if (fulfillment.tick > loss.tick
        || (fulfillment.tick === loss.tick && fulfillment.eventOrdinal > loss.eventOrdinal)) break;
      fulfillmentIndex++;
    }
    const fulfillment = observation.fulfillmentEvents[fulfillmentIndex] ?? null;
    if (fulfillment !== null) fulfillmentIndex++;
    return Object.freeze({
      ...loss,
      nextFulfillmentTick: fulfillment?.tick ?? null,
      nextFulfillmentEventOrdinal: fulfillment?.eventOrdinal ?? null,
      nextFulfillmentLatencyTicks: fulfillment === null ? null : fulfillment.tick - loss.tick,
    });
  }));
}

function finishStage8(observation: MutableStage8, status: 'won' | 'lost'): P102Stage8Observation {
  const losses = pairLossesToFirstFulfillments(observation);
  const interLossSpacingTicks = losses.slice(1).map((loss, index) => loss.tick - losses[index]!.tick);
  let terminalCascade: P102TerminalCascade | null = null;
  if (status === 'lost') {
    const fatal = losses.at(-1);
    if (fatal === undefined || fatal.lives !== 0) throw new Error('Lost Stage 8 run lacks a fatal life-loss event.');
    const lastFulfillment = observation.fulfillmentEvents.filter((event) => (
      event.tick < fatal.tick || (event.tick === fatal.tick && event.eventOrdinal < fatal.eventOrdinal)
    )).at(-1);
    const burst = losses.filter((loss) => lastFulfillment === undefined
      || loss.tick > lastFulfillment.tick
      || (loss.tick === lastFulfillment.tick && loss.eventOrdinal > lastFulfillment.eventOrdinal));
    if (burst.length >= 2) {
      terminalCascade = Object.freeze({
        definition: 'fatal-losses-since-last-first-fulfillment',
        lossCount: burst.length,
        firstLossTick: burst[0]!.tick,
        fatalLossTick: fatal.tick,
        spanTicks: fatal.tick - burst[0]!.tick,
        reasons: Object.freeze(burst.map(({ reason }) => reason)),
      });
    }
  }
  return deepFreeze({
    scenarioId: P102_STAGE8_RELIEF_STAGE_ID,
    status,
    ticks: observation.ticks,
    maxLiveCustomers: observation.maxLiveCustomers,
    maxMarchingCustomers: observation.maxMarchingCustomers,
    maxOpenDemand: observation.maxOpenDemand,
    maxJarsCommitted: observation.maxJarsCommitted,
    minJarsAvailable: observation.minJarsAvailable,
    openDemandTicks: observation.openDemandTicks,
    multiOrderTicks: observation.multiOrderTicks,
    ticksAtOneOrFewerJars: observation.ticksAtOneOrFewerJars,
    ticksAtZeroJars: observation.ticksAtZeroJars,
    ticksAtOneOrFewerJarsRate: roundedRate(observation.ticksAtOneOrFewerJars, observation.ticks),
    ticksAtZeroJarsRate: roundedRate(observation.ticksAtZeroJars, observation.ticks),
    losses,
    interLossSpacingTicks,
    terminalCascade,
  });
}

function runCampaign(
  candidateId: CandidateId,
  profile: MaltlineControllerDefinition,
  seedOffset: number,
  baseline: readonly NormalizedMaltlineScenario[],
  limits: RuntimeLimits,
  work: WorkLedger,
  startingPrefixValue?: P102SharedPrefixEvidence,
): Readonly<{ result: P102Stage8ReliefRun; stage8Prefix: P102SharedPrefixEvidence }> {
  const startingPrefix = startingPrefixValue === undefined ? undefined : deepFreeze({
    run: { ...startingPrefixValue.run },
    totalTicks: startingPrefixValue.totalTicks,
    stagesCleared: startingPrefixValue.stagesCleared,
    stagesRun: startingPrefixValue.stagesRun,
    status: startingPrefixValue.status,
    lossReasons: { ...startingPrefixValue.lossReasons },
  });
  const campaign = effectiveCampaign(baseline, candidateId, seedOffset);
  work.logicalCampaignOutcomes++;
  if (startingPrefix === undefined) work.executedCampaignPrefixes++;
  else work.reusedCampaignPrefixes++;
  let run = { ...(startingPrefix?.run ?? MALTLINE_GENERATION_2_AUTHORITY.initialRun) };
  let totalTicks = startingPrefix?.totalTicks ?? 0;
  let stagesCleared = startingPrefix?.stagesCleared ?? 0;
  let stagesRun = startingPrefix?.stagesRun ?? 0;
  let finalStatus: 'won' | 'lost' = startingPrefix?.status ?? 'won';
  let stage8: P102Stage8Observation | null = null;
  const lossReasons = { ...(startingPrefix?.lossReasons ?? emptyLossReasons()) };
  let stage8Prefix: P102SharedPrefixEvidence | null = startingPrefix ?? null;

  for (let stageIndex = startingPrefix?.stagesRun ?? 0;
    finalStatus !== 'lost' && stageIndex < campaign.length; stageIndex++) {
    if (stageIndex === 7 && stage8Prefix === null) {
      stage8Prefix = deepFreeze({
        run: { ...run }, totalTicks, stagesCleared, stagesRun, status: 'won' as const,
        lossReasons: { ...lossReasons },
      });
    }
    if (work.campaignTicks >= limits.cumulativeTicks) {
      throw new Error('Stage 8 relief cumulative tick limit exhausted before controller creation.');
    }
    const scenario = campaign[stageIndex]!;
    work.stageStarts++;
    const controller = profile.create();
    work.controllerCreations++;
    const engine = new MaltlineEngine(scenario, run);
    let state = engine.snapshot();
    stagesRun++;
    const observation: MutableStage8 | null = stageIndex === 7 ? {
      ticks: 0,
      maxLiveCustomers: state.customers.length,
      maxMarchingCustomers: 0,
      maxOpenDemand: 0,
      maxJarsCommitted: jarsCommitted(state),
      minJarsAvailable: state.jarsAvailable,
      openDemandTicks: 0,
      multiOrderTicks: 0,
      ticksAtOneOrFewerJars: 0,
      ticksAtZeroJars: 0,
      lossEvents: [],
      fulfillmentEvents: [],
    } : null;

    while (state.status === 'running') {
      if (state.tick >= limits.stageTicks) throw new Error('Stage 8 relief stage tick limit exhausted.');
      if (totalTicks >= limits.campaignTicks) throw new Error('Stage 8 relief campaign tick limit exhausted.');
      if (work.campaignTicks >= limits.cumulativeTicks) throw new Error('Stage 8 relief cumulative tick limit exhausted.');
      work.campaignTicks++;
      work.controllerCalls++;
      engine.setInput(controller(state, engine.scenario));
      const result = engine.step();
      work.engineSteps++;
      totalTicks++;
      state = result.state;
      if (observation !== null) observeStage8(state, observation);
      recordEvents(result.events, totalTicks, lossReasons, observation);
    }

    finalStatus = state.status;
    if (observation !== null) stage8 = finishStage8(observation, state.status);
    if (state.status === 'lost') {
      run = { lives: state.lives, score: state.score };
      if (stageIndex < 7) {
        stage8Prefix = deepFreeze({
          run: { ...run }, totalTicks, stagesCleared, stagesRun, status: 'lost' as const,
          lossReasons: { ...lossReasons },
        });
      }
      break;
    }
    stagesCleared++;
    run = { lives: state.lives, score: state.score };
  }

  if (stage8Prefix === null) throw new Error('Stage 8 relief run did not produce a deterministic prefix.');
  return deepFreeze({ result: {
    candidateId,
    profileId: profile.id,
    seedOffset,
    seedSet: seedOffset === 0 ? 'canonical' : `shadow-${seedOffset}`,
    effectiveCampaignFingerprint: fingerprintMaltlineCampaign(campaign),
    effectiveScenarioFingerprints: campaign.map(fingerprintNormalizedMaltlineScenario),
    sharedPrefix: stage8Prefix,
    sharedPrefixFingerprint: fingerprintCanonical(stage8Prefix as unknown as CanonicalValue),
    sharedPrefixStagesRun: stage8Prefix.stagesRun,
    status: finalStatus,
    stagesRun,
    stagesCleared,
    totalTicks,
    seconds: roundedSeconds(totalTicks),
    score: run.score,
    lives: run.lives,
    lossReasons,
    stage8,
  }, stage8Prefix });
}

function summarize(candidateId: CandidateId, profileId: string, runs: readonly P102Stage8ReliefRun[]): P102Stage8ReliefSummary {
  const stage8 = runs.flatMap((run) => run.stage8 === null ? [] : [run.stage8]);
  const losses = stage8.flatMap((stage) => stage.losses);
  const recovered = losses.flatMap((loss) => loss.nextFulfillmentLatencyTicks === null
    ? [] : [loss.nextFulfillmentLatencyTicks]);
  const interLossSpacing = stage8.flatMap((stage) => stage.interLossSpacingTicks);
  const cascades = stage8.flatMap((stage) => stage.terminalCascade === null ? [] : [stage.terminalCascade]);
  const reasons = runs.reduce<P102LossReasons>((total, run) => ({
    walkout: total.walkout + run.lossReasons.walkout,
    shake_smashed: total.shake_smashed + run.lossReasons.shake_smashed,
    jar_smashed: total.jar_smashed + run.lossReasons.jar_smashed,
  }), emptyLossReasons());
  const optionalDistribution = (values: readonly number[]): Distribution | null => (
    values.length === 0 ? null : distribution(values)
  );
  return deepFreeze({
    candidateId,
    profileId,
    runs: runs.length,
    wins: runs.filter(({ status }) => status === 'won').length,
    stage8Reached: stage8.length,
    stagesCleared: distribution(runs.map(({ stagesCleared: count }) => count)),
    attemptSeconds: distribution(runs.map(({ seconds }) => seconds)),
    remainingLives: distribution(runs.map(({ lives }) => lives)),
    lossReasons: reasons,
    stage8: stage8.length === 0 ? null : {
      maxLiveCustomers: distribution(stage8.map(({ maxLiveCustomers }) => maxLiveCustomers)),
      maxOpenDemand: distribution(stage8.map(({ maxOpenDemand }) => maxOpenDemand)),
      maxJarsCommitted: distribution(stage8.map(({ maxJarsCommitted }) => maxJarsCommitted)),
      ticksAtOneOrFewerJars: distribution(stage8.map(({ ticksAtOneOrFewerJars }) => ticksAtOneOrFewerJars)),
      ticksAtZeroJars: distribution(stage8.map(({ ticksAtZeroJars }) => ticksAtZeroJars)),
      ticksAtOneOrFewerJarsRate: distribution(stage8.map(({ ticksAtOneOrFewerJarsRate }) => ticksAtOneOrFewerJarsRate)),
      ticksAtZeroJarsRate: distribution(stage8.map(({ ticksAtZeroJarsRate }) => ticksAtZeroJarsRate)),
      observedLosses: losses.length,
      lossesPairedToLaterFirstFulfillment: recovered.length,
      recoveryLatencyTicks: optionalDistribution(recovered),
      interLossSpacingTicks: optionalDistribution(interLossSpacing),
      fatalRuns: stage8.filter(({ status }) => status === 'lost').length,
      terminalCascades: cascades.length,
      terminalCascadeLosses: optionalDistribution(cascades.map(({ lossCount }) => lossCount)),
      terminalCascadeSpanTicks: optionalDistribution(cascades.map(({ spanTicks }) => spanTicks)),
    },
  });
}

async function requireExactGeneration2Authority(
  source: MaltlineCampaignAuthority,
): Promise<MaltlineCampaignAuthority> {
  const authority = await verifyMaltlineAuthorityConfiguration(source);
  const verifiedConfigurationSha256 = await sha256Canonical(getMaltlineAuthorityConfiguration(authority));
  if (verifiedConfigurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256
    || authority.identity.configurationSha256 !== verifiedConfigurationSha256) {
    throw new Error('Stage 8 relief experiment requires the exact registered generation-2 authority.');
  }
  if (authority.campaign.length !== P102_STAGE8_RELIEF_LIMITS.stages
    || authority.campaign[7]?.id !== P102_STAGE8_RELIEF_STAGE_ID
    || authority.campaign[7].spawnIntervalTicks !== P102_STAGE8_CONTROL_INTERVAL) {
    throw new Error('Stage 8 relief experiment baseline has drifted.');
  }
  return authority;
}

async function execute(limits: RuntimeLimits): Promise<P102Stage8ReliefArtifact> {
  const authority = await requireExactGeneration2Authority(MALTLINE_GENERATION_2_AUTHORITY);
  const verifiedConfigurationSha256 = await sha256Canonical(getMaltlineAuthorityConfiguration(authority));
  const seedOffsets = Object.freeze([...DEFAULT_SHADOW_SEED_OFFSETS]);
  if (seedOffsets.length !== P102_STAGE8_RELIEF_LIMITS.seedOffsets || new Set(seedOffsets).size !== seedOffsets.length) {
    throw new Error('Stage 8 relief seed set has drifted.');
  }
  const plannedRuns = CANDIDATES.length * PROFILES.length * seedOffsets.length;
  const plannedTicks = plannedRuns * limits.campaignTicks;
  if (!Number.isSafeInteger(plannedTicks) || plannedRuns !== P102_STAGE8_RELIEF_LIMITS.campaignRuns
    || plannedTicks > P102_STAGE8_RELIEF_LIMITS.cumulativeTicks) {
    throw new Error('Stage 8 relief work plan exceeds its reviewed bound.');
  }
  const controllerMetadata = PROFILES.map((profile) => Object.freeze({
    id: profile.id,
    fingerprint: fingerprintCanonical({ id: profile.id, behavior: profile.fingerprintData }),
    fingerprintData: profile.fingerprintData,
  }));
  const candidateMetadata = CANDIDATES.map((candidate) => Object.freeze({
    ...candidate,
    fingerprint: fingerprintCanonical(candidate as unknown as CanonicalValue),
    canonicalCampaignFingerprint: fingerprintMaltlineCampaign(
      effectiveCampaign(authority.campaign, candidate.id, 0),
    ),
    canonicalScenarioFingerprints: effectiveCampaign(authority.campaign, candidate.id, 0)
      .map((scenario) => Object.freeze({ id: scenario.id, fingerprint: fingerprintNormalizedMaltlineScenario(scenario) })),
  }));
  const identity = deepFreeze({
    schemaVersion: P102_STAGE8_RELIEF_SCHEMA_VERSION,
    experimentId: P102_STAGE8_RELIEF_EXPERIMENT_ID,
    experimentRevision: P102_STAGE8_RELIEF_REVISION,
    taskIds: ['P1-02', 'P1-04', 'P1-08'],
    prospective: true,
    policy: P102_STAGE8_RELIEF_POLICY,
    authority: {
      identity: authority.identity,
      verifiedConfigurationSha256,
    },
    rulesFingerprint: fingerprintCanonical(MALTLINE_RULES as unknown as CanonicalValue),
    baselineCampaignFingerprint: fingerprintMaltlineCampaign(authority.campaign),
    baselineScenarioFingerprints: authority.campaign.map((scenario) => Object.freeze({
      id: scenario.id, fingerprint: fingerprintNormalizedMaltlineScenario(scenario),
    })),
    initialRun: authority.initialRun,
    candidates: candidateMetadata,
    controllers: controllerMetadata,
    seedOffsets,
    limits: {
      ...P102_STAGE8_RELIEF_LIMITS,
      configuredStageTicks: limits.stageTicks,
      configuredCampaignTicks: limits.campaignTicks,
      configuredCumulativeTicks: limits.cumulativeTicks,
      plannedTicks,
    },
    observations: {
      pressure: 'post-step-stage8',
      openDemand: 'greedy-unique-slide-reservation-from-telemetry-v3',
      recovery: 'greedy-one-to-one-later-first-fulfillment-event-pair-after-each-life-loss',
      interLossSpacing: 'consecutive-stage8-life-loss-tick-delta',
      terminalCascade: 'two-or-more-fatal-run-life-losses-after-the-last-first-fulfillment',
      scarcityRates: 'raw-scarcity-tick-count-divided-by-stage8-observed-ticks-rounded-six-decimals',
      callbackContainment: 'fixed-reviewed-controller-callbacks-only; tick budgets do not wall-clock-preempt callbacks',
      sharedPrefix: 'exact-pre-stage8-execution-reused; terminal-before-stage8 outcomes reuse-their-terminal-prefix',
      sharedPrefixIsolation: 'deeply-frozen-run-counters-and-loss-ledger-only; no engine-or-controller-instance-is-reused',
    },
  }) as CanonicalValue;
  const experimentFingerprint = fingerprintCanonical(identity);
  const work: WorkLedger = {
    logicalCampaignOutcomes: 0,
    executedCampaignPrefixes: 0,
    reusedCampaignPrefixes: 0,
    stageStarts: 0,
    controllerCreations: 0,
    campaignTicks: 0,
    controllerCalls: 0,
    engineSteps: 0,
  };
  const runs: P102Stage8ReliefRun[] = [];
  const prefixes = new Map<string, P102SharedPrefixEvidence>();
  for (const candidate of CANDIDATES) {
    for (const profile of PROFILES) {
      for (const seedOffset of seedOffsets) {
        const key = `${profile.id}:${seedOffset}`;
        const startingPrefix = candidate.id === 'registered-control' ? undefined : prefixes.get(key);
        if (candidate.id !== 'registered-control' && startingPrefix === undefined) {
          throw new Error('Stage 8 relief shared deterministic prefix is missing.');
        }
        const outcome = runCampaign(
          candidate.id, profile, seedOffset, authority.campaign, limits, work, startingPrefix,
        );
        if (candidate.id === 'registered-control') prefixes.set(key, outcome.stage8Prefix);
        runs.push(outcome.result);
      }
    }
  }
  if (work.logicalCampaignOutcomes !== plannedRuns
    || work.logicalCampaignOutcomes > P102_STAGE8_RELIEF_LIMITS.campaignRuns
    || work.executedCampaignPrefixes !== plannedRuns / CANDIDATES.length
    || work.reusedCampaignPrefixes !== plannedRuns / CANDIDATES.length
    || work.stageStarts !== work.controllerCreations
    || work.stageStarts > P102_STAGE8_RELIEF_LIMITS.stageStarts
    || work.campaignTicks !== work.controllerCalls || work.campaignTicks !== work.engineSteps
    || work.campaignTicks > limits.cumulativeTicks) {
    throw new Error('Stage 8 relief actual work ledger did not reconcile.');
  }
  const summaries = CANDIDATES.flatMap((candidate) => PROFILES.map((profile) => summarize(
    candidate.id,
    profile.id,
    runs.filter((run) => run.candidateId === candidate.id && run.profileId === profile.id),
  )));
  const resultSha256 = await sha256Canonical({
    experimentFingerprint, runs, summaries, actualWork: work,
  } as unknown as CanonicalValue);
  return deepFreeze({
    schemaVersion: P102_STAGE8_RELIEF_SCHEMA_VERSION,
    experimentId: P102_STAGE8_RELIEF_EXPERIMENT_ID,
    experimentRevision: P102_STAGE8_RELIEF_REVISION,
    taskIds: ['P1-02', 'P1-04', 'P1-08'] as const,
    prospective: true as const,
    policy: P102_STAGE8_RELIEF_POLICY,
    identity,
    experimentFingerprint,
    resultSha256,
    runs,
    summaries,
    actualWork: work,
  });
}

/** Fixed reviewed experiment. Caller-supplied configuration is deliberately forbidden. */
export async function runP102Stage8ReliefExperiment(...args: readonly never[]): Promise<P102Stage8ReliefArtifact> {
  if (args.length !== 0) throw new Error('Stage 8 relief experiment does not accept custom options.');
  return execute({
    stageTicks: P102_STAGE8_RELIEF_LIMITS.stageTicks,
    campaignTicks: P102_STAGE8_RELIEF_LIMITS.campaignTicks,
    cumulativeTicks: P102_STAGE8_RELIEF_LIMITS.cumulativeTicks,
  });
}

/** Direct-leaf test seam for proving strict limit validation and fail-closed exhaustion. */
export async function runP102Stage8ReliefExperimentWithLimitsForTesting(
  limitsValue: unknown,
): Promise<P102Stage8ReliefArtifact> {
  return execute(exactLimits(limitsValue));
}

/** Direct-leaf test seam for proving that authority-compatible but drifted data fails closed. */
export async function assertP102Stage8ReliefAuthorityForTesting(value: unknown): Promise<void> {
  await requireExactGeneration2Authority(value as MaltlineCampaignAuthority);
}

/**
 * Test-only equivalence oracle. Every control and relief campaign is executed
 * from Stage 1 with a fresh engine and controller for every stage; no prefix is
 * supplied to runCampaign.
 */
export async function runP102Stage8ReliefFreshOracleForTesting(): Promise<P102Stage8ReliefFreshOracle> {
  const authority = await requireExactGeneration2Authority(MALTLINE_GENERATION_2_AUTHORITY);
  const seeds = Object.freeze([...DEFAULT_SHADOW_SEED_OFFSETS]);
  const limits: RuntimeLimits = {
    stageTicks: P102_STAGE8_RELIEF_LIMITS.stageTicks,
    campaignTicks: P102_STAGE8_RELIEF_LIMITS.campaignTicks,
    cumulativeTicks: P102_STAGE8_RELIEF_LIMITS.cumulativeTicks,
  };
  const work: WorkLedger = {
    logicalCampaignOutcomes: 0,
    executedCampaignPrefixes: 0,
    reusedCampaignPrefixes: 0,
    stageStarts: 0,
    controllerCreations: 0,
    campaignTicks: 0,
    controllerCalls: 0,
    engineSteps: 0,
  };
  const pairs: P102Stage8ReliefFreshOraclePair[] = [];
  for (const profile of PROFILES) {
    for (const seedOffset of seeds) {
      const control = runCampaign(
        'registered-control', profile, seedOffset, authority.campaign, limits, work,
      ).result;
      const relief = runCampaign(
        'stage8-arrival-relief-138', profile, seedOffset, authority.campaign, limits, work,
      ).result;
      if (fingerprintCanonical(control.sharedPrefix as unknown as CanonicalValue)
        !== fingerprintCanonical(relief.sharedPrefix as unknown as CanonicalValue)) {
        throw new Error('Fresh Stage 8 relief oracle found a pre-Stage-8 divergence.');
      }
      pairs.push(deepFreeze({ profileId: profile.id, seedOffset, control, relief }));
    }
  }
  if (pairs.length !== PROFILES.length * seeds.length
    || work.logicalCampaignOutcomes !== P102_STAGE8_RELIEF_LIMITS.campaignRuns
    || work.executedCampaignPrefixes !== P102_STAGE8_RELIEF_LIMITS.campaignRuns
    || work.reusedCampaignPrefixes !== 0
    || work.stageStarts !== work.controllerCreations
    || work.stageStarts > P102_STAGE8_RELIEF_LIMITS.stageStarts
    || work.campaignTicks !== work.controllerCalls
    || work.campaignTicks !== work.engineSteps
    || work.campaignTicks > P102_STAGE8_RELIEF_LIMITS.cumulativeTicks) {
    throw new Error('Fresh Stage 8 relief oracle work ledger did not reconcile.');
  }
  return deepFreeze({ pairs, actualWork: work });
}

/** Direct-leaf event-order fixture for the one-to-one recovery evidence policy. */
export function pairP102Stage8RecoveryEventsForTesting(events: readonly GameEvent[]): readonly P102LossRecovery[] {
  const observation: MutableStage8 = {
    ticks: 1,
    maxLiveCustomers: 0,
    maxMarchingCustomers: 0,
    maxOpenDemand: 0,
    maxJarsCommitted: 0,
    minJarsAvailable: 0,
    openDemandTicks: 0,
    multiOrderTicks: 0,
    ticksAtOneOrFewerJars: 0,
    ticksAtZeroJars: 0,
    lossEvents: [],
    fulfillmentEvents: [],
  };
  recordEvents(events, events[0]?.tick ?? 0, emptyLossReasons(), observation);
  return pairLossesToFirstFulfillments(observation);
}

export function formatP102Stage8ReliefArtifact(artifact: P102Stage8ReliefArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
  getMaltlineAuthorityConfiguration,
  verifyMaltlineAuthorityConfiguration,
} from '../core/authority';
import { canonicalJson, fingerprintCanonical, sha256Canonical, type CanonicalValue } from '../core/fingerprint';
import {
  MAX_MALTLINE_PROOF_STAGE_TICKS,
  MAX_MALTLINE_PROOF_TOTAL_TICKS,
  MALTLINE_RANKED_RESOURCE_LIMITS,
} from '../core/ranked-resource-limits';
import { MALTLINE_GAME_ID, MALTLINE_RULES } from '../core/rules';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
  type NormalizedRunContext,
} from '../core/scenario';
import type { RunContext } from '../core/types';
import {
  P108_TUNABLE_FIELDS,
  P108_TUNING_CANDIDATES,
  P108_UNRANKED_BOUNDARY,
  applyP108TuningCandidate,
  fingerprintP108Candidate,
  p108CandidateFingerprintData,
  type P108ScenarioChange,
  type P108TunableNumberField,
  type P108TuningCandidate,
} from '../experiments/p1-08-candidates';
import {
  MALTLINE_GAME_FINGERPRINT,
  MALTLINE_RULES_FINGERPRINT,
  MALTLINE_TELEMETRY_SCHEMA_VERSION,
  fingerprintMaltlineCampaign,
  fingerprintNormalizedMaltlineScenario,
  runMaltlineCampaignTelemetry,
  type LossReasonCounts,
  type MaltlineCampaignTelemetry,
  type MaltlineScoreLedger,
  type MaltlineStageTelemetry,
  type TelemetryStatus,
} from './campaign-telemetry';
import { DEFAULT_SHADOW_SEED_OFFSETS, type DistributionSummary } from './player-model-comparison';
import { PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER } from './physical-intent-controller';
import { DELAYED_COMPETENT_MALTLINE_CONTROLLER } from './player-model-controllers';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  type MaltlineControllerDefinition,
} from './reactive-controller';

export {
  P108_TUNING_CANDIDATES,
  P108_UNRANKED_BOUNDARY,
} from '../experiments/p1-08-candidates';
export type {
  P108ScenarioChange,
  P108TuningCandidate,
} from '../experiments/p1-08-candidates';

export const P108_TUNING_EXPERIMENT_SCHEMA_VERSION = 2 as const;
export const P108_TUNING_EXPERIMENT_ID = 'EXP-049' as const;
export const P108_TUNING_TASK_ID = 'P1-08' as const;
export const P108_TUNING_REVISION = 3 as const;
export const P108_TUNING_HYPOTHESIS =
  'A count-neutral Stage 5 resource cadence and a Stage 7 midpoint can remove the mid-campaign valley and soften the Stage 8 wall without changing the six-minute completion band.' as const;

export const P108_PRESSURE_DEFINITION = Object.freeze({
  observation: 'post-step',
  reservation: 'slides-by-id-greedy-unique-nearest-ahead-lane-flavor-v1',
  nearestTieBreak: 'position-then-id',
  multiOrder: 'at-least-two-open-demands-with-lane-and-flavor-subsets',
  conflict: 'open-demand-and-returning-jar-nearest-pair-v1',
  pacingWindow: 'spawned-greater-than-zero-and-less-than-customer-count',
  quiet: 'no-open-demand-held-blending-outbound-or-returning-v1',
  jarPressure: 'post-step-jars-available-less-than-or-equal-to-one-and-equal-to-zero',
  spawnFloorHit: 'spawn-event-with-future-customer-and-unclamped-next-interval-at-or-below-floor',
  repeatService: 'service-actions-minus-uniquely-fulfilled-customers',
  walkoutSplit: 'pre-step-fulfilled-flag-with-current-tick-spawn-as-never-fulfilled',
  scoreLedger: 'served-points-plus-jar-caught-points-plus-stage-cleared-bonus-equals-score-gained',
  rates: 'numerator-divided-by-stage-ticks-except-quiet-divided-by-pacing-window',
  evidenceScopes: Object.freeze({
    allRuns: 'seed-offsets-all-including-canonical',
    canonical: 'seed-offset-zero-only',
    shadowOnly: 'seed-offsets-after-zero-only',
  }),
  stageAggregation: Object.freeze({
    distributions: Object.freeze({
      population: 'reached-runs-only',
      operation: 'min-median-mean-max',
    }),
    totalsAcrossReachedRuns: Object.freeze({
      population: 'reached-runs-only',
      operation: 'sum',
      fields: Object.freeze([
        'repeatServiceActions',
        'neverFulfilledWalkouts',
        'fulfilledThenWalkout',
        'livesLost',
        'lossReasons',
        'scoreLedger',
      ]),
    }),
  }),
} as const);

export const P108_SEED_OFFSETS = DEFAULT_SHADOW_SEED_OFFSETS;

export const P108_TUNING_WORK_LIMITS = Object.freeze({
  maximumCandidates: 8,
  maximumProfiles: 4,
  maximumSeedOffsets: 64,
  maximumChangesPerCandidate: 16,
  requiredStages: 8,
  maximumEffectiveCampaigns: 512,
  maximumCampaignRuns: 512,
  maximumStageStarts: 4_096,
  maximumCampaignTicks: MAX_MALTLINE_PROOF_TOTAL_TICKS,
  maximumPlannedTicks: 23_760_000,
} as const);

export const P108_TUNING_PROFILES = Object.freeze([
  REACTIVE_MALTLINE_CONTROLLER,
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER,
]);

export interface P108StagePressureDistribution {
  stage: number;
  stageId: string;
  reached: number;
  cleared: number;
  seconds: DistributionSummary | null;
  maxLiveCustomers: DistributionSummary | null;
  maxMarchingCustomers: DistributionSummary | null;
  maxOpenDemand: DistributionSummary | null;
  maxJarsCommitted: DistributionSummary | null;
  maxLaneLoad: DistributionSummary | null;
  openDemandRate: DistributionSummary | null;
  multiOrderRate: DistributionSummary | null;
  multiOrderLaneRate: DistributionSummary | null;
  multiOrderFlavorRate: DistributionSummary | null;
  orderReturnConflictRate: DistributionSummary | null;
  crossLaneOrderReturnConflictRate: DistributionSummary | null;
  quietPacingRate: DistributionSummary | null;
  longestQuietPacingRunTicks: DistributionSummary | null;
  ticksAtOneOrFewerJars: DistributionSummary | null;
  ticksAtZeroJars: DistributionSummary | null;
  spawnFloorHitCount: DistributionSummary | null;
  totalsAcrossReachedRuns: {
    repeatServiceActions: number;
    neverFulfilledWalkouts: number;
    fulfilledThenWalkout: number;
    livesLost: number;
    lossReasons: LossReasonCounts;
    scoreLedger: MaltlineScoreLedger;
  };
}

export interface P108StagePressureScope {
  scope: 'all-runs' | 'canonical-run' | 'shadow-runs-only';
  sourceRunCount: number;
  stages: P108StagePressureDistribution[];
}

export interface P108StagePressureEvidence {
  allRuns: P108StagePressureScope;
  canonical: P108StagePressureScope;
  shadowOnly: P108StagePressureScope | null;
}

export interface P108RunDistribution {
  runs: number;
  wins: number;
  statusCounts: Record<TelemetryStatus, number>;
  stagesCleared: DistributionSummary;
  attemptSeconds: DistributionSummary;
  winningSeconds: DistributionSummary | null;
  score: DistributionSummary;
  remainingLives: DistributionSummary;
}

export interface P108ProfileResult {
  profileId: string;
  controllerFingerprint: string;
  overall: P108RunDistribution;
  shadows: P108RunDistribution | null;
  canonical: {
    status: TelemetryStatus;
    stagesCleared: number;
    ticks: number;
    seconds: number;
    score: number;
    lives: number;
    lossReasons: LossReasonCounts;
  };
  stagePressure: P108StagePressureEvidence;
  resourceUsage: {
    scope: 'all-runs';
    configuredMaximumStageTicks: number;
    configuredMaximumTotalTicks: number;
    observedMaximumStageTicks: number;
    observedMaximumTotalTicks: number;
    observedMaximumLiveCustomers: number;
    observedMaximumOpenDemand: number;
    observedMaximumJarsCommitted: number;
    observedMaximumLaneLoad: number;
  };
}

export interface P108EffectiveCampaignIdentity {
  seedOffset: number;
  rankEligibility: 'unranked';
  campaignFingerprint: string;
  scenarioFingerprints: readonly { id: string; fingerprint: string }[];
  initialRunFingerprint: string;
  configurations: readonly {
    controllerId: string;
    controllerFingerprint: string;
    configurationFingerprint: string;
  }[];
}

export interface P108CandidateResult {
  candidateId: string;
  candidateFingerprint: string;
  description: string;
  changes: readonly P108ScenarioChange[];
  ranking: typeof P108_UNRANKED_BOUNDARY;
  effectiveCampaigns: readonly P108EffectiveCampaignIdentity[];
  profiles: P108ProfileResult[];
}

export interface P108ExperimentIdentity {
  schemaVersion: typeof P108_TUNING_EXPERIMENT_SCHEMA_VERSION;
  experimentId: typeof P108_TUNING_EXPERIMENT_ID;
  taskId: typeof P108_TUNING_TASK_ID;
  revision: typeof P108_TUNING_REVISION;
  hypothesis: typeof P108_TUNING_HYPOTHESIS;
  telemetrySchemaVersion: typeof MALTLINE_TELEMETRY_SCHEMA_VERSION;
  ranking: typeof P108_UNRANKED_BOUNDARY;
  authority: {
    identity: {
      gameId: string;
      rulesetVersion: number;
      campaignGeneration: number;
      configurationSha256: string;
    };
    verifiedConfigurationSha256: string;
  };
  game: { id: typeof MALTLINE_GAME_ID; fingerprint: string };
  rules: { version: number; fingerprint: string };
  baselineCampaign: {
    fingerprint: string;
    scenarioFingerprints: readonly { id: string; fingerprint: string }[];
  };
  initialRun: { value: NormalizedRunContext; fingerprint: string };
  seedOffsets: readonly number[];
  controllers: readonly {
    id: string;
    fingerprint: string;
    metadata: CanonicalValue;
  }[];
  limits: {
    tickLimitPerStage: number;
    totalTickLimit: number;
    maximumProofStageTicks: number;
    maximumProofTotalTicks: number;
    workPreflight: typeof P108_TUNING_WORK_LIMITS & {
      effectiveCampaigns: number;
      campaignRuns: number;
      maximumStageStartsPlanned: number;
      maximumTicksPerCampaignPlanned: number;
      maximumTicksPlanned: number;
    };
    rankedScenario: typeof MALTLINE_RANKED_RESOURCE_LIMITS;
  };
  analysis: typeof P108_PRESSURE_DEFINITION;
  candidates: readonly {
    id: string;
    fingerprint: string;
    metadata: CanonicalValue;
    effectiveCampaigns: readonly P108EffectiveCampaignIdentity[];
  }[];
}

export interface P108TuningExperiment {
  schemaVersion: typeof P108_TUNING_EXPERIMENT_SCHEMA_VERSION;
  experimentId: typeof P108_TUNING_EXPERIMENT_ID;
  taskId: typeof P108_TUNING_TASK_ID;
  rankEligibility: 'unranked';
  identity: P108ExperimentIdentity;
  experimentFingerprint: string;
  candidates: P108CandidateResult[];
}

export interface P108TuningExperimentOptions {
  candidates?: readonly P108TuningCandidate[];
  /**
   * Trusted in-process executable controller definitions. Work budgets limit
   * how often create/decision callbacks are entered; they cannot bound a
   * callback that does not return. Never populate this field from untrusted
   * configuration without resolving allowlisted controller ids first.
   */
  profiles?: readonly MaltlineControllerDefinition[];
  seedOffsets?: readonly number[];
  initialRun?: RunContext;
  tickLimitPerStage?: number;
}

const IDENTIFIER = /^[a-z0-9](?:[a-z0-9._-]{0,127})$/u;
const TUNABLE_FIELDS = new Set<P108TunableNumberField>(P108_TUNABLE_FIELDS);
const INTEGER_FIELDS = new Set<P108TunableNumberField>([
  'customerCount',
  'spawnIntervalTicks',
  'spawnAccelerationTicks',
]);

const OPTION_KEYS = Object.freeze([
  'candidates',
  'profiles',
  'seedOffsets',
  'initialRun',
  'tickLimitPerStage',
] as const);

interface P108WorkPlan {
  readonly effectiveCampaigns: number;
  readonly campaignRuns: number;
  readonly maximumStageStartsPlanned: number;
  readonly maximumTicksPerCampaignPlanned: number;
  readonly maximumTicksPlanned: number;
}

function checkedMultiply(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)
    || left < 0 || right < 0 || (right !== 0 && left > Number.MAX_SAFE_INTEGER / right)) {
    throw new Error(`${label} exceeds the safe-integer work budget`);
  }
  return left * right;
}

function exactOptions(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('EXP-049 options must be an ordinary object');
  }
  const allowed = new Set<string>(OPTION_KEYS);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new Error('EXP-049 options contain unsupported fields');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`EXP-049 options.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function exactDenseArray<T>(
  value: unknown,
  label: string,
  maximumLength: number,
  minimumLength = 1,
): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be an ordinary array`);
  }
  const length = value.length;
  if (length < minimumLength) throw new Error(`${label} must not be empty`);
  if (length > maximumLength) throw new Error(`${label} exceeds maximum length ${maximumLength}`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1 || !ownKeys.includes('length')) {
    throw new Error(`${label} must be a dense array without extra fields`);
  }
  for (let index = 0; index < length; index++) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}[${index}] must be an enumerable data property`);
    }
  }
  return value as readonly T[];
}

function planP108Work(
  candidateCount: number,
  profileCount: number,
  seedCount: number,
  tickLimitPerStage: number,
): P108WorkPlan {
  const effectiveCampaigns = checkedMultiply(candidateCount, seedCount, 'EXP-049 effective campaign count');
  if (effectiveCampaigns > P108_TUNING_WORK_LIMITS.maximumEffectiveCampaigns) {
    throw new Error('EXP-049 effective campaign count exceeds the work budget');
  }
  const campaignRuns = checkedMultiply(effectiveCampaigns, profileCount, 'EXP-049 campaign run count');
  if (campaignRuns > P108_TUNING_WORK_LIMITS.maximumCampaignRuns) {
    throw new Error('EXP-049 campaign run count exceeds the work budget');
  }
  const maximumStageStartsPlanned = checkedMultiply(
    campaignRuns,
    P108_TUNING_WORK_LIMITS.requiredStages,
    'EXP-049 stage-start count',
  );
  if (maximumStageStartsPlanned > P108_TUNING_WORK_LIMITS.maximumStageStarts) {
    throw new Error('EXP-049 stage-start count exceeds the work budget');
  }
  const stageTicks = checkedMultiply(
    P108_TUNING_WORK_LIMITS.requiredStages,
    tickLimitPerStage,
    'EXP-049 per-campaign tick count',
  );
  const maximumTicksPerCampaignPlanned = Math.min(
    stageTicks,
    P108_TUNING_WORK_LIMITS.maximumCampaignTicks,
  );
  const maximumTicksPlanned = checkedMultiply(
    campaignRuns,
    maximumTicksPerCampaignPlanned,
    'EXP-049 cumulative planned tick count',
  );
  if (maximumTicksPlanned > P108_TUNING_WORK_LIMITS.maximumPlannedTicks) {
    throw new Error('EXP-049 cumulative planned tick count exceeds the work budget');
  }
  return Object.freeze({
    effectiveCampaigns,
    campaignRuns,
    maximumStageStartsPlanned,
    maximumTicksPerCampaignPlanned,
    maximumTicksPlanned,
  });
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !expected.has(key))) {
    throw new Error(`${label} contains unsupported fields`);
  }
  if (keys.some((key) => !ownKeys.includes(key))) throw new Error(`${label} is missing fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || value.trim() !== value) {
    throw new Error(`${label} must be a nonempty trimmed string`);
  }
  return value;
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

function canonicalClone(value: CanonicalValue): CanonicalValue {
  return deepFreeze(JSON.parse(canonicalJson(value)) as CanonicalValue);
}

function snapshotCandidates(source: readonly P108TuningCandidate[]): readonly P108TuningCandidate[] {
  const candidateSource = exactDenseArray<P108TuningCandidate>(
    source,
    'EXP-049 candidates',
    P108_TUNING_WORK_LIMITS.maximumCandidates,
  );
  const candidates = candidateSource.map((candidate, candidateIndex) => {
    const object = exactDataObject(
      candidate,
      ['id', 'description', 'changes'],
      `EXP-049 candidate ${candidateIndex + 1}`,
    );
    const id = nonemptyString(object.id, 'EXP-049 candidate id');
    if (!IDENTIFIER.test(id)) throw new Error('EXP-049 candidate id is invalid');
    const description = nonemptyString(object.description, `EXP-049 candidate ${id} description`);
    const changeSource = exactDenseArray<P108ScenarioChange>(
      object.changes,
      `EXP-049 candidate ${id} changes`,
      P108_TUNING_WORK_LIMITS.maximumChangesPerCandidate,
      0,
    );
    const seenChanges = new Set<string>();
    const changes = changeSource.map((change, changeIndex) => {
      const entry = exactDataObject(
        change,
        ['stageId', 'field', 'from', 'to'],
        `EXP-049 candidate ${id} change ${changeIndex + 1}`,
      );
      const stageId = nonemptyString(entry.stageId, `EXP-049 candidate ${id} stageId`);
      const field = entry.field;
      if (typeof field !== 'string' || !TUNABLE_FIELDS.has(field as P108TunableNumberField)) {
        throw new Error(`EXP-049 candidate ${id} change field is unsupported`);
      }
      const from = entry.from;
      const to = entry.to;
      if (typeof from !== 'number' || !Number.isFinite(from)
        || typeof to !== 'number' || !Number.isFinite(to)) {
        throw new Error(`EXP-049 candidate ${id} change values must be finite numbers`);
      }
      if (INTEGER_FIELDS.has(field as P108TunableNumberField)
        && (!Number.isSafeInteger(from) || !Number.isSafeInteger(to))) {
        throw new Error(`EXP-049 candidate ${id} integer change must use safe integers`);
      }
      const key = `${stageId}:${field}`;
      if (seenChanges.has(key)) throw new Error(`EXP-049 candidate ${id} repeats a change`);
      seenChanges.add(key);
      return Object.freeze({ stageId, field: field as P108TunableNumberField, from, to });
    });
    return Object.freeze({ id, description, changes: Object.freeze(changes) });
  });
  if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) {
    throw new Error('EXP-049 candidate ids must be unique');
  }
  return Object.freeze(candidates);
}

function snapshotProfiles(source: readonly MaltlineControllerDefinition[]): readonly MaltlineControllerDefinition[] {
  const profileSource = exactDenseArray<MaltlineControllerDefinition>(
    source,
    'EXP-049 profiles',
    P108_TUNING_WORK_LIMITS.maximumProfiles,
  );
  const profiles = profileSource.map((profile, index) => {
    const object = exactDataObject(profile, ['id', 'fingerprintData', 'create'], `EXP-049 controller ${index + 1}`);
    const id = nonemptyString(object.id, 'EXP-049 controller id');
    if (!IDENTIFIER.test(id)) throw new Error('EXP-049 controller id is invalid');
    if (typeof object.create !== 'function') throw new Error(`EXP-049 controller ${id} create must be a function`);
    return Object.freeze({
      id,
      fingerprintData: canonicalClone(object.fingerprintData as CanonicalValue),
      create: object.create as MaltlineControllerDefinition['create'],
    });
  });
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    throw new Error('EXP-049 controller ids must be unique');
  }
  return Object.freeze(profiles);
}

function snapshotSeedOffsets(source: readonly number[]): readonly number[] {
  const offsetSource = exactDenseArray<number>(
    source,
    'EXP-049 seed offsets',
    P108_TUNING_WORK_LIMITS.maximumSeedOffsets,
  );
  if (offsetSource[0] !== 0) {
    throw new Error('EXP-049 seed offsets must start with canonical offset zero');
  }
  const offsets = offsetSource.map((offset) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffff_ffff) {
      throw new Error('EXP-049 seed offsets must be unsigned 32-bit integers');
    }
    return offset;
  });
  if (new Set(offsets).size !== offsets.length) throw new Error('EXP-049 seed offsets must be unique');
  return Object.freeze(offsets);
}

function snapshotInitialRun(source: RunContext | undefined): Readonly<RunContext> | undefined {
  if (source === undefined) return undefined;
  const run = exactDataObject(source, ['lives', 'score'], 'EXP-049 initial run');
  if (!Number.isSafeInteger(run.lives) || !Number.isSafeInteger(run.score)) {
    throw new Error('EXP-049 initial run lives and score must be safe integers');
  }
  return Object.freeze({ lives: run.lives as number, score: run.score as number });
}

function assertWithinRankedCeilings(
  scenario: NormalizedMaltlineScenario,
  label: string,
): void {
  const limits = MALTLINE_RANKED_RESOURCE_LIMITS;
  const maximums: readonly [keyof NormalizedMaltlineScenario, number][] = [
    ['ticksPerSecond', limits.maximumTicksPerSecond],
    ['lanes', limits.maximumLanes],
    ['laneLength', limits.maximumLaneLength],
    ['jarPoolSize', limits.maximumJarPoolSize],
    ['blendTicks', limits.maximumWorkTicks],
    ['washTicks', limits.maximumWorkTicks],
    ['drinkTicks', limits.maximumWorkTicks],
    ['customerCount', limits.maximumCustomerCount],
    ['spawnIntervalTicks', limits.maximumSpawnTicks],
    ['spawnAccelerationTicks', limits.maximumSpawnTicks],
    ['spawnIntervalFloorTicks', limits.maximumSpawnTicks],
    ['marchSpeed', limits.maximumMovementSpeed],
    ['leaveSpeed', limits.maximumMovementSpeed],
    ['slideSpeed', limits.maximumMovementSpeed],
    ['returnSpeed', limits.maximumMovementSpeed],
    ['stationRepeatTicks', limits.maximumInputRepeatTicks],
    ['laneRepeatTicks', limits.maximumInputRepeatTicks],
    ['lives', limits.maximumLives],
  ];
  if (scenario.customerCount < limits.minimumCustomerCount) {
    throw new Error(`${label} customerCount is below the ranked resource floor`);
  }
  for (const [field, maximum] of maximums) {
    const value = scenario[field];
    if (typeof value === 'number' && value > maximum) {
      throw new Error(`${label} ${field} exceeds the ranked resource ceiling`);
    }
  }
}

function applyCandidate(
  baseline: readonly NormalizedMaltlineScenario[],
  candidate: P108TuningCandidate,
  seedOffset: number,
): readonly NormalizedMaltlineScenario[] {
  const campaign = applyP108TuningCandidate(baseline, candidate, seedOffset);
  for (const [index, scenario] of campaign.entries()) {
    assertWithinRankedCeilings(scenario, `EXP-049 candidate ${candidate.id} stage ${index + 1}`);
  }
  return campaign;
}

function distribution(values: readonly number[]): DistributionSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  return {
    min: sorted[0]!,
    median: Number(median.toFixed(3)),
    mean: Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(3)),
    max: sorted.at(-1)!,
  };
}

function distributionOrNull(values: readonly number[]): DistributionSummary | null {
  return values.length === 0 ? null : distribution(values);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

function emptyLossReasons(): LossReasonCounts {
  return { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
}

function emptyScoreLedger(): MaltlineScoreLedger {
  return { servePoints: 0, catchPoints: 0, stageBonusPoints: 0 };
}

function addScoreLedger(total: MaltlineScoreLedger, ledger: MaltlineScoreLedger): MaltlineScoreLedger {
  return {
    servePoints: total.servePoints + ledger.servePoints,
    catchPoints: total.catchPoints + ledger.catchPoints,
    stageBonusPoints: total.stageBonusPoints + ledger.stageBonusPoints,
  };
}

function stagePressure(
  runs: readonly MaltlineCampaignTelemetry[],
  stageIndex: number,
  stageId: string,
): P108StagePressureDistribution {
  const stages = runs.flatMap((run) => run.stages[stageIndex] === undefined ? [] : [run.stages[stageIndex]!]);
  const values = (select: (stage: MaltlineStageTelemetry) => number) => stages.map(select);
  return {
    stage: stageIndex + 1,
    stageId,
    reached: stages.length,
    cleared: stages.filter(({ status }) => status === 'won').length,
    seconds: distributionOrNull(values(({ seconds }) => seconds)),
    maxLiveCustomers: distributionOrNull(values(({ maxLiveCustomers }) => maxLiveCustomers)),
    maxMarchingCustomers: distributionOrNull(values(({ maxMarchingCustomers }) => maxMarchingCustomers)),
    maxOpenDemand: distributionOrNull(values(({ maxOpenDemand }) => maxOpenDemand)),
    maxJarsCommitted: distributionOrNull(values(({ maxJarsCommitted }) => maxJarsCommitted)),
    maxLaneLoad: distributionOrNull(values(({ maxLaneLoad }) => maxLaneLoad)),
    openDemandRate: distributionOrNull(values((stage) => rate(stage.openDemandTicks, stage.ticks))),
    multiOrderRate: distributionOrNull(values((stage) => rate(stage.multiOrderTicks, stage.ticks))),
    multiOrderLaneRate: distributionOrNull(values((stage) => rate(stage.multiOrderLaneTicks, stage.ticks))),
    multiOrderFlavorRate: distributionOrNull(values((stage) => rate(stage.multiOrderFlavorTicks, stage.ticks))),
    orderReturnConflictRate: distributionOrNull(values((stage) => rate(stage.orderReturnConflictTicks, stage.ticks))),
    crossLaneOrderReturnConflictRate: distributionOrNull(values((stage) => (
      rate(stage.crossLaneOrderReturnConflictTicks, stage.ticks)
    ))),
    quietPacingRate: distributionOrNull(values((stage) => (
      rate(stage.quietPacingTicks, stage.pacingWindowTicks)
    ))),
    longestQuietPacingRunTicks: distributionOrNull(values(({ longestQuietPacingRunTicks }) => (
      longestQuietPacingRunTicks
    ))),
    ticksAtOneOrFewerJars: distributionOrNull(values(({ ticksAtOneOrFewerJars }) => ticksAtOneOrFewerJars)),
    ticksAtZeroJars: distributionOrNull(values(({ ticksAtZeroJars }) => ticksAtZeroJars)),
    spawnFloorHitCount: distributionOrNull(values(({ spawnFloorHitCount }) => spawnFloorHitCount)),
    totalsAcrossReachedRuns: {
      repeatServiceActions: stages.reduce((total, stage) => total + stage.repeatServiceActions, 0),
      neverFulfilledWalkouts: stages.reduce((total, stage) => total + stage.neverFulfilledWalkouts, 0),
      fulfilledThenWalkout: stages.reduce((total, stage) => total + stage.fulfilledThenWalkout, 0),
      livesLost: stages.reduce((total, stage) => total + stage.livesLost, 0),
      lossReasons: stages.reduce<LossReasonCounts>((total, stage) => ({
        walkout: total.walkout + stage.lossReasons.walkout,
        shake_smashed: total.shake_smashed + stage.lossReasons.shake_smashed,
        jar_smashed: total.jar_smashed + stage.lossReasons.jar_smashed,
      }), emptyLossReasons()),
      scoreLedger: stages.reduce<MaltlineScoreLedger>(
        (total, stage) => addScoreLedger(total, stage.scoreLedger),
        emptyScoreLedger(),
      ),
    },
  };
}

function stagePressureScope(
  scope: P108StagePressureScope['scope'],
  runs: readonly MaltlineCampaignTelemetry[],
  campaign: readonly NormalizedMaltlineScenario[],
): P108StagePressureScope {
  return {
    scope,
    sourceRunCount: runs.length,
    stages: campaign.map((scenario, index) => stagePressure(runs, index, scenario.id)),
  };
}

function runDistribution(runs: readonly MaltlineCampaignTelemetry[]): P108RunDistribution {
  const wins = runs.filter(({ campaign }) => campaign.status === 'won');
  return {
    runs: runs.length,
    wins: wins.length,
    statusCounts: {
      running: runs.filter(({ campaign }) => campaign.status === 'running').length,
      won: wins.length,
      lost: runs.filter(({ campaign }) => campaign.status === 'lost').length,
      tick_limit: runs.filter(({ campaign }) => campaign.status === 'tick_limit').length,
    },
    stagesCleared: distribution(runs.map(({ campaign }) => campaign.stagesCleared)),
    attemptSeconds: distribution(runs.map(({ campaign }) => campaign.seconds)),
    winningSeconds: distributionOrNull(wins.map(({ campaign }) => campaign.seconds)),
    score: distribution(runs.map(({ campaign }) => campaign.score)),
    remainingLives: distribution(runs.map(({ campaign }) => campaign.lives)),
  };
}

function summarizeProfile(
  profileId: string,
  campaign: readonly NormalizedMaltlineScenario[],
  runs: readonly MaltlineCampaignTelemetry[],
): P108ProfileResult {
  const canonical = runs[0]!;
  const shadowRuns = runs.slice(1);
  const stageTicks = runs.flatMap((run) => run.stages.map(({ ticks }) => ticks));
  return {
    profileId,
    controllerFingerprint: canonical.identity.controller.fingerprint,
    overall: runDistribution(runs),
    shadows: runs.length > 1 ? runDistribution(runs.slice(1)) : null,
    canonical: {
      status: canonical.campaign.status,
      stagesCleared: canonical.campaign.stagesCleared,
      ticks: canonical.campaign.ticks,
      seconds: canonical.campaign.seconds,
      score: canonical.campaign.score,
      lives: canonical.campaign.lives,
      lossReasons: canonical.campaign.lossReasons,
    },
    stagePressure: {
      allRuns: stagePressureScope('all-runs', runs, campaign),
      canonical: stagePressureScope('canonical-run', [canonical], campaign),
      shadowOnly: shadowRuns.length === 0
        ? null
        : stagePressureScope('shadow-runs-only', shadowRuns, campaign),
    },
    resourceUsage: {
      scope: 'all-runs',
      configuredMaximumStageTicks: MAX_MALTLINE_PROOF_STAGE_TICKS,
      configuredMaximumTotalTicks: MAX_MALTLINE_PROOF_TOTAL_TICKS,
      observedMaximumStageTicks: Math.max(...stageTicks),
      observedMaximumTotalTicks: Math.max(...runs.map(({ campaign: summary }) => summary.ticks)),
      observedMaximumLiveCustomers: Math.max(...runs.map(({ campaign: summary }) => summary.maxLiveCustomers)),
      observedMaximumOpenDemand: Math.max(...runs.map(({ campaign: summary }) => summary.maxOpenDemand)),
      observedMaximumJarsCommitted: Math.max(...runs.map(({ campaign: summary }) => summary.maxJarsCommitted)),
      observedMaximumLaneLoad: Math.max(...runs.map(({ campaign: summary }) => summary.maxLaneLoad)),
    },
  };
}

/** Public mutation seam for proving the complete experiment identity. */
export function fingerprintP108ExperimentIdentity(identity: P108ExperimentIdentity): string {
  return fingerprintCanonical(identity as unknown as CanonicalValue);
}

export async function runP108TuningExperiment(
  options: P108TuningExperimentOptions = {},
): Promise<P108TuningExperiment> {
  const optionData = exactOptions(options);
  const candidateSource = exactDenseArray<P108TuningCandidate>(
    optionData.candidates ?? P108_TUNING_CANDIDATES,
    'EXP-049 candidates',
    P108_TUNING_WORK_LIMITS.maximumCandidates,
  );
  const profileSource = exactDenseArray<MaltlineControllerDefinition>(
    optionData.profiles ?? P108_TUNING_PROFILES,
    'EXP-049 profiles',
    P108_TUNING_WORK_LIMITS.maximumProfiles,
  );
  const seedSource = exactDenseArray<number>(
    optionData.seedOffsets ?? P108_SEED_OFFSETS,
    'EXP-049 seed offsets',
    P108_TUNING_WORK_LIMITS.maximumSeedOffsets,
  );
  const tickLimitPerStage = optionData.tickLimitPerStage ?? MAX_MALTLINE_PROOF_STAGE_TICKS;
  if (typeof tickLimitPerStage !== 'number'
    || !Number.isSafeInteger(tickLimitPerStage)
    || tickLimitPerStage < 1
    || tickLimitPerStage > MAX_MALTLINE_PROOF_STAGE_TICKS) {
    throw new Error('EXP-049 tick limit must fit the ranked stage-tick ceiling');
  }
  const workPlan = planP108Work(
    candidateSource.length,
    profileSource.length,
    seedSource.length,
    tickLimitPerStage,
  );

  // Only after the complete shallow work plan is admitted may normalization,
  // canonicalization, authority verification, transforms, or executable
  // controller callbacks begin.
  const candidates = snapshotCandidates(candidateSource);
  const profiles = snapshotProfiles(profileSource);
  const seedOffsets = snapshotSeedOffsets(seedSource);
  const requestedInitialRun = snapshotInitialRun(optionData.initialRun as RunContext | undefined);

  const authority = await verifyMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY);
  const verifiedConfigurationSha256 = await sha256Canonical(getMaltlineAuthorityConfiguration(authority));
  if (verifiedConfigurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256
    || authority.identity.configurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256) {
    throw new Error('EXP-049 requires the exact registered generation-2 authority pin');
  }
  const baseline = Object.freeze(authority.campaign.map(normalizeMaltlineScenario));
  if (baseline.length !== P108_TUNING_WORK_LIMITS.requiredStages) {
    throw new Error('EXP-049 requires the eight-stage generation-2 campaign');
  }
  baseline.forEach((scenario, index) => assertWithinRankedCeilings(scenario, `EXP-049 baseline stage ${index + 1}`));
  const initialRun = normalizeMaltlineRunContext(requestedInitialRun ?? authority.initialRun, baseline[0]!);
  if (initialRun.lives < 1
    || initialRun.lives > MALTLINE_RANKED_RESOURCE_LIMITS.maximumLives
    || initialRun.score > MALTLINE_RANKED_RESOURCE_LIMITS.maximumInitialScore) {
    throw new Error('EXP-049 initial run is outside ranked resource bounds');
  }

  const controllerIdentities = profiles.map((profile) => {
    const metadata = canonicalClone(profile.fingerprintData);
    return Object.freeze({
      id: profile.id,
      fingerprint: fingerprintCanonical({ id: profile.id, behavior: metadata }),
      metadata,
    });
  });
  const initialRunFingerprint = fingerprintCanonical(initialRun as unknown as CanonicalValue);
  const candidateIdentities: P108ExperimentIdentity['candidates'][number][] = [];
  const results: P108CandidateResult[] = [];
  let actualTicks = 0;

  for (const candidate of candidates) {
    const metadata = p108CandidateFingerprintData(candidate);
    const candidateFingerprint = fingerprintP108Candidate(candidate);
    const effective = seedOffsets.map((seedOffset) => ({
      seedOffset,
      campaign: applyCandidate(baseline, candidate, seedOffset),
    }));
    const runsByProfile = profiles.map((profile) => effective.map(({ campaign }) => {
      const telemetry = runMaltlineCampaignTelemetry({
        scenarios: campaign,
        initialRun,
        controller: profile,
        tickLimitPerStage,
        totalTickLimit: P108_TUNING_WORK_LIMITS.maximumCampaignTicks,
      });
      if (telemetry.campaign.ticks > MAX_MALTLINE_PROOF_TOTAL_TICKS
        || telemetry.stages.some(({ ticks }) => ticks > MAX_MALTLINE_PROOF_STAGE_TICKS)) {
        throw new Error(`EXP-049 candidate ${candidate.id} exceeds ranked proof tick ceilings`);
      }
      if (telemetry.campaign.ticks > workPlan.maximumTicksPlanned - actualTicks) {
        throw new Error('EXP-049 actual ticks exceed the admitted cumulative work budget');
      }
      actualTicks += telemetry.campaign.ticks;
      return telemetry;
    }));
    const effectiveCampaigns = effective.map(({ seedOffset, campaign }, seedIndex) => {
      const configurations = profiles.map((profile, profileIndex) => {
        const telemetry = runsByProfile[profileIndex]![seedIndex]!;
        return {
          controllerId: profile.id,
          controllerFingerprint: telemetry.identity.controller.fingerprint,
          configurationFingerprint: telemetry.identity.configurationFingerprint,
        };
      });
      return {
        seedOffset,
        rankEligibility: 'unranked' as const,
        campaignFingerprint: fingerprintMaltlineCampaign(campaign),
        scenarioFingerprints: campaign.map((scenario) => ({
          id: scenario.id,
          fingerprint: fingerprintNormalizedMaltlineScenario(scenario),
        })),
        initialRunFingerprint,
        configurations,
      };
    });
    candidateIdentities.push({
      id: candidate.id,
      fingerprint: candidateFingerprint,
      metadata,
      effectiveCampaigns,
    });
    results.push({
      candidateId: candidate.id,
      candidateFingerprint,
      description: candidate.description,
      changes: candidate.changes,
      ranking: P108_UNRANKED_BOUNDARY,
      effectiveCampaigns,
      profiles: profiles.map((profile, index) => summarizeProfile(
        profile.id,
        effective[0]!.campaign,
        runsByProfile[index]!,
      )),
    });
  }

  const baselineFingerprint = fingerprintMaltlineCampaign(baseline);
  const control = results.find(({ candidateId }) => candidateId === 'a-registered-control');
  if (control !== undefined && control.effectiveCampaigns[0]!.campaignFingerprint !== baselineFingerprint) {
    throw new Error('EXP-049 canonical control does not equal the registered generation-2 campaign');
  }
  for (const result of results) {
    for (const effective of result.effectiveCampaigns) {
      const shouldDiffer = result.changes.length > 0 || effective.seedOffset !== 0;
      if (shouldDiffer && effective.campaignFingerprint === baselineFingerprint) {
        throw new Error(`EXP-049 candidate ${result.candidateId} failed to change effective campaign identity`);
      }
    }
  }

  const identity: P108ExperimentIdentity = {
    schemaVersion: P108_TUNING_EXPERIMENT_SCHEMA_VERSION,
    experimentId: P108_TUNING_EXPERIMENT_ID,
    taskId: P108_TUNING_TASK_ID,
    revision: P108_TUNING_REVISION,
    hypothesis: P108_TUNING_HYPOTHESIS,
    telemetrySchemaVersion: MALTLINE_TELEMETRY_SCHEMA_VERSION,
    ranking: P108_UNRANKED_BOUNDARY,
    authority: {
      identity: { ...authority.identity },
      verifiedConfigurationSha256,
    },
    game: { id: MALTLINE_GAME_ID, fingerprint: MALTLINE_GAME_FINGERPRINT },
    rules: { version: MALTLINE_RULES.version, fingerprint: MALTLINE_RULES_FINGERPRINT },
    baselineCampaign: {
      fingerprint: baselineFingerprint,
      scenarioFingerprints: baseline.map((scenario) => ({
        id: scenario.id,
        fingerprint: fingerprintNormalizedMaltlineScenario(scenario),
      })),
    },
    initialRun: { value: initialRun, fingerprint: initialRunFingerprint },
    seedOffsets: [...seedOffsets],
    controllers: controllerIdentities,
    limits: {
      tickLimitPerStage,
      totalTickLimit: P108_TUNING_WORK_LIMITS.maximumCampaignTicks,
      maximumProofStageTicks: MAX_MALTLINE_PROOF_STAGE_TICKS,
      maximumProofTotalTicks: MAX_MALTLINE_PROOF_TOTAL_TICKS,
      workPreflight: {
        ...P108_TUNING_WORK_LIMITS,
        ...workPlan,
      },
      rankedScenario: MALTLINE_RANKED_RESOURCE_LIMITS,
    },
    analysis: P108_PRESSURE_DEFINITION,
    candidates: candidateIdentities,
  };
  return deepFreeze({
    schemaVersion: P108_TUNING_EXPERIMENT_SCHEMA_VERSION,
    experimentId: P108_TUNING_EXPERIMENT_ID,
    taskId: P108_TUNING_TASK_ID,
    rankEligibility: 'unranked',
    identity,
    experimentFingerprint: fingerprintP108ExperimentIdentity(identity),
    candidates: results,
  });
}

export function formatP108TuningExperiment(experiment: P108TuningExperiment): string {
  return `${JSON.stringify(experiment, null, 2)}\n`;
}

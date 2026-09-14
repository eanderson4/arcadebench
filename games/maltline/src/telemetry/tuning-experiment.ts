import { canonicalJson, fingerprintCanonical, type CanonicalValue } from '../core/fingerprint';
import { MALTLINE_GAME_ID, MALTLINE_RULES } from '../core/rules';
import type { MaltlineScenario } from '../core/types';
import {
  DEFAULT_TELEMETRY_TICK_LIMIT,
  MALTLINE_GAME_FINGERPRINT,
  MALTLINE_RULES_FINGERPRINT,
  fingerprintMaltlineCampaign,
  runMaltlineCampaignTelemetry,
  type LossReasonCounts,
  type MaltlineCampaignTelemetry,
  type TelemetryStatus,
} from './campaign-telemetry';
import {
  DEFAULT_SHADOW_SEED_OFFSETS,
  type DistributionSummary,
} from './player-model-comparison';
import { EXP_021_BASELINE_CAMPAIGN } from './exp-021-baseline';
import {
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
} from './player-model-controllers';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  type MaltlineControllerDefinition,
} from './reactive-controller';

export const MALTLINE_TUNING_EXPERIMENT_SCHEMA_VERSION = 2 as const;

/**
 * Identity of the original checked-in schema-v1 EXP-021 result. Schema 2
 * reproduces that matrix while making all simulation inputs self-identifying.
 */
export const EXP_021_HISTORICAL_IDENTITY = Object.freeze({
  schemaVersion: 1,
  experimentId: 'EXP-021',
  experimentFingerprint: 'fnv1a64:da093358d25348ae',
} as const);

/** Canonical seed plus 32 deterministic shadows. */
export const EXP_021_SEED_OFFSETS = DEFAULT_SHADOW_SEED_OFFSETS;

export interface LateStageTuning {
  readonly customerCount: number;
  readonly spawnIntervalScale: number;
  readonly spawnFloorScale: number;
  readonly spawnAccelerationScale: number;
}

export interface MaltlineTuningCandidate {
  readonly id: string;
  readonly description: string;
  readonly initialLives: number;
  /** Exactly stages 4–8. Null preserves the authored campaign. */
  readonly lateStages: readonly LateStageTuning[] | null;
}

function lateStages(
  counts: readonly [number, number, number, number, number],
  intervalScale: number,
  accelerationScale: number,
): readonly LateStageTuning[] {
  return Object.freeze(counts.map((customerCount) => Object.freeze({
    customerCount,
    spawnIntervalScale: intervalScale,
    spawnFloorScale: intervalScale,
    spawnAccelerationScale: accelerationScale,
  })));
}

// These descriptions are part of the historical experiment definition. In
// particular, "current" below means the campaign that was authored when
// EXP-021 ran; keep the wording stable so the original candidate metadata is
// not silently rewritten after generation 2 promotion.
export const EXP_021_CANDIDATES: readonly MaltlineTuningCandidate[] = Object.freeze([
  Object.freeze({
    id: 'baseline-3-lives',
    description: 'Authored campaign and current three-life run.',
    initialLives: 3,
    lateStages: null,
  }),
  Object.freeze({
    id: 'baseline-4-lives',
    description: 'Authored campaign with one additional starting life.',
    initialLives: 4,
    lateStages: null,
  }),
  Object.freeze({
    id: 'count-only-light-4-lives',
    description: 'Extra late work at authored arrival cadence; intentional pressure control.',
    initialLives: 4,
    lateStages: lateStages([18, 18, 15, 24, 28], 1, 1),
  }),
  Object.freeze({
    id: 'paced-light-4-lives',
    description: 'Light extra late work with wider waves and reduced acceleration.',
    initialLives: 4,
    lateStages: lateStages([18, 18, 15, 24, 28], 1.2, 0.5),
  }),
  Object.freeze({
    id: 'paced-balanced-4-lives',
    description: 'Balanced late work with 20% wider waves and half acceleration.',
    initialLives: 4,
    lateStages: lateStages([20, 20, 17, 27, 31], 1.2, 0.5),
  }),
  Object.freeze({
    id: 'paced-breather-4-lives',
    description: 'Balanced work with 35% wider waves; intentional low-pressure control.',
    initialLives: 4,
    lateStages: lateStages([20, 20, 17, 27, 31], 1.35, 0.5),
  }),
  Object.freeze({
    id: 'overpaced-heavy-4-lives',
    description: 'Heavy work with very wide constant waves; intentional duration-only control.',
    initialLives: 4,
    lateStages: lateStages([22, 22, 19, 30, 35], 1.4, 0),
  }),
]);

export interface TuningStageCurve {
  stage: number;
  reached: number;
  cleared: number;
  clearRateWhenReached: number | null;
  seconds: DistributionSummary | null;
  maxLiveCustomers: DistributionSummary | null;
  maxJarsCommitted: DistributionSummary | null;
  ticksAtZeroJars: DistributionSummary | null;
  livesLost: number;
  lossReasons: LossReasonCounts;
}

export interface TuningProfileResult {
  profileId: string;
  controllerFingerprint: string;
  runs: number;
  wins: number;
  winRate: number;
  statusCounts: Record<TelemetryStatus, number>;
  stagesCleared: DistributionSummary;
  attemptSeconds: DistributionSummary;
  winningSeconds: DistributionSummary | null;
  score: DistributionSummary;
  remainingLives: DistributionSummary;
  maxLiveCustomers: DistributionSummary;
  maxJarsCommitted: DistributionSummary;
  ticksAtZeroJars: DistributionSummary;
  lossReasons: LossReasonCounts;
  stageCurve: TuningStageCurve[];
  canonical: {
    status: TelemetryStatus;
    stagesCleared: number;
    seconds: number;
    score: number;
    lives: number;
    maxLiveCustomers: number;
    maxJarsCommitted: number;
    lossReasons: LossReasonCounts;
  };
}

export interface TuningCandidateResult {
  candidateId: string;
  candidateFingerprint: string;
  effectiveCampaignFingerprints: ReadonlyArray<{
    seedOffset: number;
    campaignFingerprint: string;
  }>;
  description: string;
  initialLives: number;
  lateStages: readonly LateStageTuning[] | null;
  profiles: TuningProfileResult[];
}

export interface MaltlineTuningExperimentIdentity {
  schemaVersion: typeof MALTLINE_TUNING_EXPERIMENT_SCHEMA_VERSION;
  experimentId: 'EXP-021';
  historicalExperiment: typeof EXP_021_HISTORICAL_IDENTITY;
  game: {
    id: typeof MALTLINE_GAME_ID;
    fingerprint: string;
  };
  rules: {
    version: number;
    fingerprint: string;
  };
  baselineCampaign: {
    generation: 1;
    fingerprint: string;
  };
  initialRunPolicy: {
    lives: 'candidate.initialLives';
    score: number;
  };
  tickLimitPerStage: number;
  seedOffsets: readonly number[];
  candidates: ReadonlyArray<{
    id: string;
    fingerprint: string;
    metadata: CanonicalValue;
    initialRun: {
      lives: number;
      score: number;
    };
    effectiveCampaigns: ReadonlyArray<{
      seedOffset: number;
      fingerprint: string;
    }>;
    controllers: ReadonlyArray<{
      id: string;
      fingerprint: string;
      metadata: CanonicalValue;
    }>;
  }>;
}

export interface MaltlineTuningExperiment {
  schemaVersion: typeof MALTLINE_TUNING_EXPERIMENT_SCHEMA_VERSION;
  experimentId: 'EXP-021';
  historicalExperiment: typeof EXP_021_HISTORICAL_IDENTITY;
  identity: MaltlineTuningExperimentIdentity;
  experimentFingerprint: string;
  seedOffsets: readonly number[];
  candidates: TuningCandidateResult[];
}

export interface TuningExperimentOptions {
  scenarios?: readonly MaltlineScenario[];
  candidates?: readonly MaltlineTuningCandidate[];
  profiles?: readonly MaltlineControllerDefinition[];
  seedOffsets?: readonly number[];
  initialScore?: number;
  tickLimitPerStage?: number;
}

const DEFAULT_PROFILES = Object.freeze([
  REACTIVE_MALTLINE_CONTROLLER,
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
]);

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

function emptyLossReasons(): LossReasonCounts {
  return { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
}

function totalLossReasons(telemetry: readonly MaltlineCampaignTelemetry[]): LossReasonCounts {
  return telemetry.reduce<LossReasonCounts>((total, run) => ({
    walkout: total.walkout + run.campaign.lossReasons.walkout,
    shake_smashed: total.shake_smashed + run.campaign.lossReasons.shake_smashed,
    jar_smashed: total.jar_smashed + run.campaign.lossReasons.jar_smashed,
  }), emptyLossReasons());
}

function candidateData(candidate: MaltlineTuningCandidate): CanonicalValue {
  return {
    id: candidate.id,
    description: candidate.description,
    initialLives: candidate.initialLives,
    lateStages: candidate.lateStages === null
      ? null
      : candidate.lateStages.map((stage) => ({ ...stage })),
  };
}

function cloneCanonical(value: CanonicalValue): CanonicalValue {
  return JSON.parse(canonicalJson(value)) as CanonicalValue;
}

function snapshotCandidate(candidate: MaltlineTuningCandidate): MaltlineTuningCandidate {
  return Object.freeze({
    id: candidate.id,
    description: candidate.description,
    initialLives: candidate.initialLives,
    lateStages: candidate.lateStages === null
      ? null
      : Object.freeze(candidate.lateStages.map((stage) => Object.freeze({
        customerCount: stage.customerCount,
        spawnIntervalScale: stage.spawnIntervalScale,
        spawnFloorScale: stage.spawnFloorScale,
        spawnAccelerationScale: stage.spawnAccelerationScale,
      }))),
  });
}

function snapshotController(
  controller: MaltlineControllerDefinition,
): MaltlineControllerDefinition {
  return Object.freeze({
    id: controller.id,
    fingerprintData: cloneCanonical(controller.fingerprintData),
    create: controller.create,
  });
}

/** Public seam for testing and comparing a complete schema-v2 identity. */
export function fingerprintMaltlineTuningExperimentIdentity(
  identity: MaltlineTuningExperimentIdentity,
): string {
  return fingerprintCanonical(identity as unknown as CanonicalValue);
}

export function applyMaltlineTuningCandidate(
  scenarios: readonly MaltlineScenario[],
  candidate: MaltlineTuningCandidate,
  seedOffset = 0,
): MaltlineScenario[] {
  if (candidate.lateStages !== null && candidate.lateStages.length !== 5) {
    throw new Error('Maltline tuning candidate must define exactly stages 4 through 8');
  }
  return scenarios.map((scenario, index) => {
    const tuned = candidate.lateStages?.[index - 3];
    return {
      ...scenario,
      stations: [...scenario.stations],
      seed: (scenario.seed + seedOffset) >>> 0,
      ...(tuned === undefined ? {} : {
        customerCount: tuned.customerCount,
        spawnIntervalTicks: Math.round(scenario.spawnIntervalTicks * tuned.spawnIntervalScale),
        spawnIntervalFloorTicks: Math.round(
          scenario.spawnIntervalFloorTicks * tuned.spawnFloorScale,
        ),
        spawnAccelerationTicks: Math.round(
          scenario.spawnAccelerationTicks * tuned.spawnAccelerationScale,
        ),
      }),
    };
  });
}

function summarizeStage(
  runs: readonly MaltlineCampaignTelemetry[],
  stageIndex: number,
): TuningStageCurve {
  const reached = runs.flatMap((run) => run.stages[stageIndex] === undefined
    ? []
    : [run.stages[stageIndex]!]);
  const losses = reached.reduce<LossReasonCounts>((total, stage) => ({
    walkout: total.walkout + stage.lossReasons.walkout,
    shake_smashed: total.shake_smashed + stage.lossReasons.shake_smashed,
    jar_smashed: total.jar_smashed + stage.lossReasons.jar_smashed,
  }), emptyLossReasons());
  return {
    stage: stageIndex + 1,
    reached: reached.length,
    cleared: reached.filter((stage) => stage.status === 'won').length,
    clearRateWhenReached: reached.length === 0 ? null : Number((
      reached.filter((stage) => stage.status === 'won').length / reached.length
    ).toFixed(3)),
    seconds: distributionOrNull(reached.map((stage) => stage.seconds)),
    maxLiveCustomers: distributionOrNull(reached.map((stage) => stage.maxLiveCustomers)),
    maxJarsCommitted: distributionOrNull(reached.map((stage) => stage.maxJarsCommitted)),
    ticksAtZeroJars: distributionOrNull(reached.map((stage) => stage.ticksAtZeroJars)),
    livesLost: reached.reduce((total, stage) => total + stage.livesLost, 0),
    lossReasons: losses,
  };
}

function summarizeProfile(
  profileId: string,
  runs: readonly MaltlineCampaignTelemetry[],
): TuningProfileResult {
  const wins = runs.filter((run) => run.campaign.status === 'won');
  const canonical = runs[0]!;
  return {
    profileId,
    controllerFingerprint: canonical.identity.controller.fingerprint,
    runs: runs.length,
    wins: wins.length,
    winRate: Number((wins.length / runs.length).toFixed(3)),
    statusCounts: {
      running: runs.filter((run) => run.campaign.status === 'running').length,
      won: wins.length,
      lost: runs.filter((run) => run.campaign.status === 'lost').length,
      tick_limit: runs.filter((run) => run.campaign.status === 'tick_limit').length,
    },
    stagesCleared: distribution(runs.map((run) => run.campaign.stagesCleared)),
    attemptSeconds: distribution(runs.map((run) => run.campaign.seconds)),
    winningSeconds: wins.length === 0
      ? null
      : distribution(wins.map((run) => run.campaign.seconds)),
    score: distribution(runs.map((run) => run.campaign.score)),
    remainingLives: distribution(runs.map((run) => run.campaign.lives)),
    maxLiveCustomers: distribution(runs.map((run) => run.campaign.maxLiveCustomers)),
    maxJarsCommitted: distribution(runs.map((run) => run.campaign.maxJarsCommitted)),
    ticksAtZeroJars: distribution(runs.map((run) => (
      run.stages.reduce((total, stage) => total + stage.ticksAtZeroJars, 0)
    ))),
    lossReasons: totalLossReasons(runs),
    stageCurve: Array.from({ length: 8 }, (_, index) => summarizeStage(runs, index)),
    canonical: {
      status: canonical.campaign.status,
      stagesCleared: canonical.campaign.stagesCleared,
      seconds: canonical.campaign.seconds,
      score: canonical.campaign.score,
      lives: canonical.campaign.lives,
      maxLiveCustomers: canonical.campaign.maxLiveCustomers,
      maxJarsCommitted: canonical.campaign.maxJarsCommitted,
      lossReasons: canonical.campaign.lossReasons,
    },
  };
}

export function runMaltlineTuningExperiment(
  options: TuningExperimentOptions = {},
): MaltlineTuningExperiment {
  const scenarios = options.scenarios ?? EXP_021_BASELINE_CAMPAIGN;
  if (scenarios.length !== 8) throw new Error('EXP-021 requires the eight-stage campaign');
  const candidates = (options.candidates ?? EXP_021_CANDIDATES).map(snapshotCandidate);
  const profiles = (options.profiles ?? DEFAULT_PROFILES).map(snapshotController);
  const seedOffsets = options.seedOffsets ?? EXP_021_SEED_OFFSETS;
  const initialScore = options.initialScore ?? 0;
  const tickLimit = options.tickLimitPerStage ?? DEFAULT_TELEMETRY_TICK_LIMIT;
  if (candidates.length === 0 || profiles.length === 0 || seedOffsets.length === 0) {
    throw new Error('EXP-021 requires candidates, profiles, and seed offsets');
  }
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new Error('EXP-021 candidate ids must be unique');
  }
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
    throw new Error('EXP-021 controller ids must be unique');
  }
  if (!Number.isSafeInteger(initialScore) || initialScore < 0) {
    throw new Error('EXP-021 initial score must be a nonnegative safe integer');
  }
  if (!Number.isSafeInteger(tickLimit) || tickLimit < 1) {
    throw new Error('EXP-021 tick limit must be a positive safe integer');
  }
  if (new Set(seedOffsets).size !== seedOffsets.length) {
    throw new Error('EXP-021 seed offsets must be unique');
  }
  for (const seedOffset of seedOffsets) {
    if (!Number.isSafeInteger(seedOffset) || seedOffset < 0 || seedOffset > 0xffff_ffff) {
      throw new Error('EXP-021 seed offsets must be unsigned 32-bit integers');
    }
  }

  const controllerIdentities = profiles.map((profile) => {
    const metadata = cloneCanonical(profile.fingerprintData);
    return {
      id: profile.id,
      fingerprint: fingerprintCanonical({ id: profile.id, behavior: metadata }),
      metadata,
    };
  });
  const candidateIdentities: MaltlineTuningExperimentIdentity['candidates'][number][] = [];
  const candidateResults = candidates.map((candidate): TuningCandidateResult => {
    const metadata = cloneCanonical(candidateData(candidate));
    const candidateFingerprint = fingerprintCanonical(metadata);
    const effectiveCampaigns = seedOffsets.map((seedOffset) => {
      const campaign = applyMaltlineTuningCandidate(scenarios, candidate, seedOffset);
      return {
        seedOffset,
        campaign,
        fingerprint: fingerprintMaltlineCampaign(campaign),
      };
    });
    const profileResults = profiles.map((profile) => {
      const runs = effectiveCampaigns.map(({ campaign }) => runMaltlineCampaignTelemetry({
        scenarios: campaign,
        initialRun: { lives: candidate.initialLives, score: initialScore },
        controller: profile,
        tickLimitPerStage: tickLimit,
      }));
      return summarizeProfile(profile.id, runs);
    });
    candidateIdentities.push({
      id: candidate.id,
      fingerprint: candidateFingerprint,
      metadata,
      initialRun: { lives: candidate.initialLives, score: initialScore },
      effectiveCampaigns: effectiveCampaigns.map(({ seedOffset, fingerprint }) => ({
        seedOffset,
        fingerprint,
      })),
      controllers: controllerIdentities.map((controller) => ({ ...controller })),
    });
    return {
      candidateId: candidate.id,
      candidateFingerprint,
      effectiveCampaignFingerprints: effectiveCampaigns.map(({ seedOffset, fingerprint }) => ({
        seedOffset,
        campaignFingerprint: fingerprint,
      })),
      description: candidate.description,
      initialLives: candidate.initialLives,
      lateStages: candidate.lateStages,
      profiles: profileResults,
    };
  });

  const identity: MaltlineTuningExperimentIdentity = {
    schemaVersion: MALTLINE_TUNING_EXPERIMENT_SCHEMA_VERSION,
    experimentId: 'EXP-021',
    historicalExperiment: EXP_021_HISTORICAL_IDENTITY,
    game: {
      id: MALTLINE_GAME_ID,
      fingerprint: MALTLINE_GAME_FINGERPRINT,
    },
    rules: {
      version: MALTLINE_RULES.version,
      fingerprint: MALTLINE_RULES_FINGERPRINT,
    },
    baselineCampaign: {
      generation: 1,
      fingerprint: fingerprintMaltlineCampaign(scenarios),
    },
    initialRunPolicy: {
      lives: 'candidate.initialLives',
      score: initialScore,
    },
    tickLimitPerStage: tickLimit,
    seedOffsets: [...seedOffsets],
    candidates: candidateIdentities,
  };
  const experimentFingerprint = fingerprintMaltlineTuningExperimentIdentity(identity);

  return {
    schemaVersion: MALTLINE_TUNING_EXPERIMENT_SCHEMA_VERSION,
    experimentId: 'EXP-021',
    historicalExperiment: EXP_021_HISTORICAL_IDENTITY,
    identity,
    experimentFingerprint,
    seedOffsets: [...seedOffsets],
    candidates: candidateResults,
  };
}

export function formatMaltlineTuningExperiment(experiment: MaltlineTuningExperiment): string {
  return `${JSON.stringify(experiment, null, 2)}\n`;
}

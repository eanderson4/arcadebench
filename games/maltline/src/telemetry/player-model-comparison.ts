import { MALTLINE_GENERATION_2_AUTHORITY } from '../core/authority';
import { fingerprintCanonical } from '../core/fingerprint';
import type { MaltlineScenario, RunContext } from '../core/types';
import {
  runMaltlineCampaignTelemetry,
  type LossReasonCounts,
  type TelemetryStatus,
} from './campaign-telemetry';
import {
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
} from './player-model-controllers';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  type MaltlineControllerDefinition,
} from './reactive-controller';

export const MALTLINE_PLAYER_MODEL_COMPARISON_SCHEMA_VERSION = 1 as const;

function deterministicSeedOffsets(): readonly number[] {
  const offsets = [0];
  let value = 0x6d2b79f5;
  for (let index = 0; index < 32; index++) {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    offsets.push(value);
  }
  return Object.freeze(offsets);
}

/** Canonical seed plus 32 deterministic shadows. */
export const DEFAULT_SHADOW_SEED_OFFSETS = deterministicSeedOffsets();

export interface DistributionSummary {
  min: number;
  median: number;
  mean: number;
  max: number;
}

export interface PlayerModelRunSummary {
  profileId: string;
  seedSet: string;
  seedOffset: number;
  status: TelemetryStatus;
  stagesCleared: number;
  ticks: number;
  seconds: number;
  score: number;
  lives: number;
  lossReasons: LossReasonCounts;
  configurationFingerprint: string;
}

export interface PlayerModelDistribution {
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
  lossReasons: LossReasonCounts;
}

export interface MaltlinePlayerModelComparison {
  schemaVersion: typeof MALTLINE_PLAYER_MODEL_COMPARISON_SCHEMA_VERSION;
  comparisonFingerprint: string;
  seedOffsets: readonly number[];
  runs: PlayerModelRunSummary[];
  profiles: PlayerModelDistribution[];
}

export interface PlayerModelComparisonOptions {
  scenarios?: readonly MaltlineScenario[];
  profiles?: readonly MaltlineControllerDefinition[];
  seedOffsets?: readonly number[];
  initialRun?: RunContext;
  tickLimitPerStage?: number;
}

const DEFAULT_PROFILES = Object.freeze([
  REACTIVE_MALTLINE_CONTROLLER,
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
]);

function distribution(values: readonly number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
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

function emptyLossReasons(): LossReasonCounts {
  return { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
}

function shadowCampaign(
  scenarios: readonly MaltlineScenario[],
  seedOffset: number,
): MaltlineScenario[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    stations: [...scenario.stations],
    seed: (scenario.seed + seedOffset) >>> 0,
  }));
}

function summarizeProfile(
  profileId: string,
  controllerFingerprint: string,
  runs: readonly PlayerModelRunSummary[],
): PlayerModelDistribution {
  const wins = runs.filter((run) => run.status === 'won');
  const lossReasons = runs.reduce<LossReasonCounts>((total, run) => ({
    walkout: total.walkout + run.lossReasons.walkout,
    shake_smashed: total.shake_smashed + run.lossReasons.shake_smashed,
    jar_smashed: total.jar_smashed + run.lossReasons.jar_smashed,
  }), emptyLossReasons());
  return {
    profileId,
    controllerFingerprint,
    runs: runs.length,
    wins: wins.length,
    winRate: Number((wins.length / runs.length).toFixed(3)),
    statusCounts: {
      running: runs.filter((run) => run.status === 'running').length,
      won: wins.length,
      lost: runs.filter((run) => run.status === 'lost').length,
      tick_limit: runs.filter((run) => run.status === 'tick_limit').length,
    },
    stagesCleared: distribution(runs.map((run) => run.stagesCleared)),
    attemptSeconds: distribution(runs.map((run) => run.seconds)),
    winningSeconds: wins.length > 0 ? distribution(wins.map((run) => run.seconds)) : null,
    score: distribution(runs.map((run) => run.score)),
    remainingLives: distribution(runs.map((run) => run.lives)),
    lossReasons,
  };
}

export function runMaltlinePlayerModelComparison(
  options: PlayerModelComparisonOptions = {},
): MaltlinePlayerModelComparison {
  const scenarios = options.scenarios ?? MALTLINE_GENERATION_2_AUTHORITY.campaign;
  const profiles = options.profiles ?? DEFAULT_PROFILES;
  const seedOffsets = options.seedOffsets ?? DEFAULT_SHADOW_SEED_OFFSETS;
  if (profiles.length === 0) throw new Error('player-model comparison needs at least one profile');
  if (seedOffsets.length === 0) throw new Error('player-model comparison needs at least one seed offset');
  for (const offset of seedOffsets) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffff_ffff) {
      throw new Error('player-model seed offsets must be unsigned 32-bit integers');
    }
  }
  if (new Set(seedOffsets).size !== seedOffsets.length) {
    throw new Error('player-model seed offsets must be unique');
  }

  const runs: PlayerModelRunSummary[] = [];
  const controllerFingerprints = new Map<string, string>();
  for (const profile of profiles) {
    for (const seedOffset of seedOffsets) {
      const telemetry = runMaltlineCampaignTelemetry({
        scenarios: shadowCampaign(scenarios, seedOffset),
        controller: profile,
        initialRun: options.initialRun,
        tickLimitPerStage: options.tickLimitPerStage,
      });
      controllerFingerprints.set(profile.id, telemetry.identity.controller.fingerprint);
      runs.push({
        profileId: profile.id,
        seedSet: seedOffset === 0 ? 'canonical' : `shadow-${seedOffset}`,
        seedOffset,
        status: telemetry.campaign.status,
        stagesCleared: telemetry.campaign.stagesCleared,
        ticks: telemetry.campaign.ticks,
        seconds: telemetry.campaign.seconds,
        score: telemetry.campaign.score,
        lives: telemetry.campaign.lives,
        lossReasons: telemetry.campaign.lossReasons,
        configurationFingerprint: telemetry.identity.configurationFingerprint,
      });
    }
  }

  const distributions = profiles.map((profile) => summarizeProfile(
    profile.id,
    controllerFingerprints.get(profile.id)!,
    runs.filter((run) => run.profileId === profile.id),
  ));
  const comparisonFingerprint = fingerprintCanonical({
    schemaVersion: MALTLINE_PLAYER_MODEL_COMPARISON_SCHEMA_VERSION,
    seedOffsets: [...seedOffsets],
    runs: runs.map((run) => ({
      profileId: run.profileId,
      seedOffset: run.seedOffset,
      configurationFingerprint: run.configurationFingerprint,
    })),
  });

  return {
    schemaVersion: MALTLINE_PLAYER_MODEL_COMPARISON_SCHEMA_VERSION,
    comparisonFingerprint,
    seedOffsets: [...seedOffsets],
    runs,
    profiles: distributions,
  };
}

export function formatMaltlinePlayerModelComparison(
  comparison: MaltlinePlayerModelComparison,
): string {
  return `${JSON.stringify(comparison, null, 2)}\n`;
}

import {
  MALTLINE_GENERATION_2_AUTHORITY,
  getMaltlineAuthorityConfiguration,
  verifyMaltlineAuthorityConfiguration,
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
import type {
  GameEvent,
  LifeLossReason,
  MaltlineInput,
  MaltlineScenario,
} from '../core/types';
import { DEFAULT_SHADOW_SEED_OFFSETS } from '../telemetry/player-model-comparison';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  reactiveMaltlineController,
} from '../telemetry/reactive-controller';

export const P104_RECOVERY_EXPERIMENT_SCHEMA_VERSION = 1 as const;
export const P104_RECOVERY_EXPERIMENT_ID = 'p1-04-recovery-ledger-v1' as const;
export const P104_RECOVERY_EXPERIMENT_REVISION = 1 as const;
export const P104_STAGE_TICK_LIMIT = 60_000 as const;
export const P104_CAMPAIGN_TICK_LIMIT = 60_000 as const;

export const P104_UNRANKED_BOUNDARY = Object.freeze({
  eligibility: 'unranked',
  authorityRegistration: null,
  seasonId: null,
  rankedProofEmission: 'forbidden',
  reason: 'Prospective score ledgers are post-hoc analysis and are not registered Maltline rules.',
} as const);

export const P104_SCORE_POLICIES = Object.freeze([
  Object.freeze({
    id: 'authoritative-carried-lives',
    label: 'A — current carried lives',
    semantics: 'For every cleared stage, award 250 points per ending campaign life.',
    stageClearPointsPerLife: 250,
  }),
  Object.freeze({
    id: 'stage-local-survival',
    label: 'B — stage-local survival',
    semantics: 'For every cleared stage, award max(0, 1000 - 250 * life losses in that stage).',
    perfectStageBonus: 1_000,
    penaltyPerStageLifeLoss: 250,
  }),
  Object.freeze({
    id: 'fixed-progress-plus-final-lives',
    label: 'C — fixed progress plus campaign-won final lives',
    semantics: 'Award 750 per cleared stage plus 500 per ending life only after a campaign win.',
    pointsPerClearedStage: 750,
    campaignWinPointsPerEndingLife: 500,
  }),
] as const);

export type P104ScorePolicyId = typeof P104_SCORE_POLICIES[number]['id'];
export type P104TraceId = 'perfect-control'
  | 'first-return-miss-stage-4'
  | 'first-return-miss-stage-8';

export interface P104LossReasons {
  readonly walkout: number;
  readonly shake_smashed: number;
  readonly jar_smashed: number;
}

export interface P104ScoreLedger {
  readonly servePoints: number;
  readonly jarCatchPoints: number;
  readonly stageClearPoints: number;
  readonly total: number;
}

export interface P104PolicyScore {
  readonly policyId: P104ScorePolicyId;
  readonly stageBonuses: readonly number[];
  readonly bonusPoints: number;
  readonly totalScore: number;
}

export interface P104RecoveryObservation {
  readonly lossStage: number;
  readonly lossStageTick: number;
  readonly lossCampaignTick: number;
  readonly nextFulfillmentCampaignTick: number;
  readonly firstFulfillmentLatencyTicks: number;
  readonly maxServeTierCampaignTick: number;
  readonly maxServeTierLatencyTicks: number;
}

export interface P104RecoveryRun {
  readonly traceId: P104TraceId;
  readonly seedOffset: number;
  readonly seedSet: string;
  readonly effectiveCampaignFingerprint: string;
  readonly effectiveScenarioFingerprints: readonly string[];
  readonly status: 'won';
  readonly stagesCleared: number;
  readonly totalTicks: number;
  readonly endingLives: number;
  readonly lossReasons: P104LossReasons;
  readonly ledger: P104ScoreLedger;
  readonly stageLifeLosses: readonly number[];
  readonly recovery: P104RecoveryObservation | null;
  readonly policyScores: readonly P104PolicyScore[];
}

export interface P104TraceResult {
  readonly traceId: P104TraceId;
  readonly targetStage: number | null;
  readonly runs: number;
  readonly wins: number;
  readonly expectedJarSmashesPerRun: number;
  readonly totalTicks: Readonly<{ min: number; max: number }>;
  readonly policyTotals: Readonly<Record<P104ScorePolicyId, Readonly<{ min: number; max: number }>>>;
  readonly canonical: P104RecoveryRun;
}

export interface P104RecoveryExperimentArtifact {
  readonly schemaVersion: typeof P104_RECOVERY_EXPERIMENT_SCHEMA_VERSION;
  readonly experimentId: typeof P104_RECOVERY_EXPERIMENT_ID;
  readonly experimentRevision: typeof P104_RECOVERY_EXPERIMENT_REVISION;
  readonly taskId: 'P1-04';
  readonly prospective: true;
  readonly policy: typeof P104_UNRANKED_BOUNDARY;
  readonly identity: CanonicalValue;
  readonly experimentFingerprint: string;
  readonly resultSha256: string;
  readonly seedOffsets: readonly number[];
  readonly runs: readonly P104RecoveryRun[];
  readonly results: readonly P104TraceResult[];
}

interface MutableLedger {
  servePoints: number;
  jarCatchPoints: number;
  stageClearPoints: number;
}

interface MutableRecovery {
  lossStage: number;
  lossStageTick: number;
  lossCampaignTick: number;
  nextFulfillmentCampaignTick?: number;
  maxServeTierCampaignTick?: number;
}

const TRACES = Object.freeze([
  Object.freeze({ id: 'perfect-control', targetStage: null }),
  Object.freeze({ id: 'first-return-miss-stage-4', targetStage: 4 }),
  Object.freeze({ id: 'first-return-miss-stage-8', targetStage: 8 }),
] as const);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function shadowCampaign(seedOffset: number): readonly MaltlineScenario[] {
  return MALTLINE_GENERATION_2_AUTHORITY.campaign.map((scenario) => ({
    ...scenario,
    stations: [...scenario.stations],
    seed: (scenario.seed + seedOffset) >>> 0,
  }));
}

function wrongLaneInput(state: ReturnType<MaltlineEngine['snapshot']>, targetLane: number): MaltlineInput {
  const count = MALTLINE_GENERATION_2_AUTHORITY.campaign.find(
    (scenario) => scenario.id === state.scenarioId,
  )!.lanes;
  const forward = (targetLane - state.player.lane + count) % count;
  const backward = (state.player.lane - targetLane + count) % count;
  const laneDir: -1 | 0 | 1 = state.player.lane === targetLane
    ? 0
    : forward <= backward ? 1 : -1;
  return { stationDir: 0, laneDir, blend: false, serve: false };
}

function emptyLossReasons(): { walkout: number; shake_smashed: number; jar_smashed: number } {
  return { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
}

function applyPolicy(
  policyId: P104ScorePolicyId,
  nonBonusPoints: number,
  authoritativeStageBonuses: readonly number[],
  stageLifeLosses: readonly number[],
  stagesCleared: number,
  endingLives: number,
  campaignWon: boolean,
): P104PolicyScore {
  let stageBonuses: number[];
  if (policyId === 'authoritative-carried-lives') {
    stageBonuses = [...authoritativeStageBonuses];
  } else if (policyId === 'stage-local-survival') {
    stageBonuses = stageLifeLosses.slice(0, stagesCleared).map(
      (losses) => Math.max(0, 1_000 - 250 * losses),
    );
  } else {
    stageBonuses = Array.from({ length: stagesCleared }, () => 750);
    if (campaignWon && stageBonuses.length > 0) {
      stageBonuses[stageBonuses.length - 1]! += 500 * endingLives;
    }
  }
  const bonusPoints = stageBonuses.reduce((sum, points) => sum + points, 0);
  return {
    policyId,
    stageBonuses,
    bonusPoints,
    totalScore: nonBonusPoints + bonusPoints,
  };
}

function runTrace(
  traceId: P104TraceId,
  targetStage: number | null,
  seedOffset: number,
): P104RecoveryRun {
  const campaign = shadowCampaign(seedOffset);
  const effectiveCampaignFingerprint = fingerprintMaltlineCampaign(campaign);
  const effectiveScenarioFingerprints: string[] = [];
  const ledger: MutableLedger = { servePoints: 0, jarCatchPoints: 0, stageClearPoints: 0 };
  const lossReasons = emptyLossReasons();
  const stageLifeLosses: number[] = [];
  let run = { ...MALTLINE_GENERATION_2_AUTHORITY.initialRun };
  let totalTicks = 0;
  let recovery: MutableRecovery | null = null;

  for (let stageIndex = 0; stageIndex < campaign.length; stageIndex++) {
    const scenario = campaign[stageIndex]!;
    if (scenario.lanes < 2) throw new Error('P1-04 return-miss trace requires at least two lanes.');
    const engine = new MaltlineEngine(scenario, run);
    effectiveScenarioFingerprints.push(fingerprintNormalizedMaltlineScenario(engine.scenario));
    let targetJarId: number | null = null;
    let wrongLane: number | null = null;
    let stageLosses = 0;

    while (engine.snapshot().status === 'running') {
      const before = engine.snapshot();
      if (before.tick >= P104_STAGE_TICK_LIMIT || totalTicks >= P104_CAMPAIGN_TICK_LIMIT) {
        throw new Error(`P1-04 trace ${traceId} exceeded its deterministic tick limit.`);
      }

      if (targetStage === stageIndex + 1 && recovery === null && before.jars.length > 0) {
        const jar = [...before.jars].sort((a, b) => a.x - b.x || a.id - b.id)[0]!;
        targetJarId = jar.id;
        wrongLane = (jar.lane + 1) % scenario.lanes;
      }
      const missingTargetJar = targetJarId !== null
        && !before.jars.some((jar) => jar.id === targetJarId);
      if (missingTargetJar) {
        targetJarId = null;
        wrongLane = null;
      }

      const input = targetJarId === null
        ? reactiveMaltlineController(before, engine.scenario)
        : wrongLaneInput(before, wrongLane!);
      engine.setInput(input);
      const result = engine.step();
      totalTicks++;

      for (const event of result.events) {
        const campaignTick = totalTicks;
        if (event.type === 'served') {
          ledger.servePoints += event.points;
          if (recovery !== null && recovery.nextFulfillmentCampaignTick === undefined
            && event.firstFulfillment && campaignTick > recovery.lossCampaignTick) {
            recovery.nextFulfillmentCampaignTick = campaignTick;
          }
          if (recovery !== null && recovery.maxServeTierCampaignTick === undefined
            && event.firstFulfillment && event.points === 200
            && campaignTick > recovery.lossCampaignTick) {
            recovery.maxServeTierCampaignTick = campaignTick;
          }
        } else if (event.type === 'jar_caught') {
          ledger.jarCatchPoints += event.points;
        } else if (event.type === 'stage_cleared') {
          ledger.stageClearPoints += event.bonus;
        } else if (event.type === 'life_lost') {
          lossReasons[event.reason]++;
          stageLosses++;
          if (targetStage === stageIndex + 1 && event.reason === 'jar_smashed' && recovery === null) {
            recovery = {
              lossStage: stageIndex + 1,
              lossStageTick: event.tick,
              lossCampaignTick: campaignTick,
            };
          }
        }
      }
    }

    const final = engine.snapshot();
    stageLifeLosses.push(stageLosses);
    if (final.status !== 'won') {
      throw new Error(`P1-04 trace ${traceId} did not win Stage ${stageIndex + 1}.`);
    }
    run = { lives: final.lives, score: final.score };
  }

  if (targetStage !== null && (
    recovery === null
    || recovery.nextFulfillmentCampaignTick === undefined
    || recovery.maxServeTierCampaignTick === undefined
  )) {
    throw new Error(`P1-04 trace ${traceId} did not produce the required recovery evidence.`);
  }

  const total = ledger.servePoints + ledger.jarCatchPoints + ledger.stageClearPoints;
  if (total !== run.score) throw new Error('P1-04 event score ledger does not reconcile.');
  const nonBonusPoints = ledger.servePoints + ledger.jarCatchPoints;
  const authoritativeStageBonuses = MALTLINE_GENERATION_2_AUTHORITY.campaign.map(
    (_scenario, index) => {
      const priorLosses = stageLifeLosses.slice(0, index + 1).reduce((sum, losses) => sum + losses, 0);
      return MALTLINE_RULES.stageClearBonusPerLife
        * (MALTLINE_GENERATION_2_AUTHORITY.initialRun.lives - priorLosses);
    },
  );
  if (authoritativeStageBonuses.reduce((sum, value) => sum + value, 0) !== ledger.stageClearPoints) {
    throw new Error('P1-04 authoritative stage bonus reconstruction does not reconcile.');
  }

  return deepFreeze({
    traceId,
    seedOffset,
    seedSet: seedOffset === 0 ? 'canonical' : `shadow-${seedOffset}`,
    effectiveCampaignFingerprint,
    effectiveScenarioFingerprints,
    status: 'won' as const,
    stagesCleared: campaign.length,
    totalTicks,
    endingLives: run.lives,
    lossReasons,
    ledger: { ...ledger, total },
    stageLifeLosses,
    recovery: recovery === null ? null : {
      lossStage: recovery.lossStage,
      lossStageTick: recovery.lossStageTick,
      lossCampaignTick: recovery.lossCampaignTick,
      nextFulfillmentCampaignTick: recovery.nextFulfillmentCampaignTick!,
      firstFulfillmentLatencyTicks:
        recovery.nextFulfillmentCampaignTick! - recovery.lossCampaignTick,
      maxServeTierCampaignTick: recovery.maxServeTierCampaignTick!,
      maxServeTierLatencyTicks: recovery.maxServeTierCampaignTick! - recovery.lossCampaignTick,
    },
    policyScores: P104_SCORE_POLICIES.map((policy) => applyPolicy(
      policy.id,
      nonBonusPoints,
      authoritativeStageBonuses,
      stageLifeLosses,
      campaign.length,
      run.lives,
      true,
    )),
  });
}

function range(values: readonly number[]): Readonly<{ min: number; max: number }> {
  return Object.freeze({ min: Math.min(...values), max: Math.max(...values) });
}

function summarizeTrace(traceId: P104TraceId, targetStage: number | null, runs: readonly P104RecoveryRun[]): P104TraceResult {
  const policyTotals = Object.fromEntries(P104_SCORE_POLICIES.map((policy) => [
    policy.id,
    range(runs.map((run) => run.policyScores.find((score) => score.policyId === policy.id)!.totalScore)),
  ])) as Record<P104ScorePolicyId, Readonly<{ min: number; max: number }>>;
  return deepFreeze({
    traceId,
    targetStage,
    runs: runs.length,
    wins: runs.filter((run) => run.status === 'won').length,
    expectedJarSmashesPerRun: targetStage === null ? 0 : 1,
    totalTicks: range(runs.map((run) => run.totalTicks)),
    policyTotals,
    canonical: runs.find((run) => run.seedOffset === 0)!,
  });
}

export function fingerprintP104RecoveryExperimentIdentity(identity: CanonicalValue): string {
  return fingerprintCanonical(identity);
}

export async function runP104RecoveryExperiment(): Promise<P104RecoveryExperimentArtifact> {
  const authority = await verifyMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY);
  const seedOffsets = [...DEFAULT_SHADOW_SEED_OFFSETS];
  const identity = deepFreeze({
    schemaVersion: P104_RECOVERY_EXPERIMENT_SCHEMA_VERSION,
    experimentId: P104_RECOVERY_EXPERIMENT_ID,
    experimentRevision: P104_RECOVERY_EXPERIMENT_REVISION,
    taskId: 'P1-04',
    prospective: true,
    policy: P104_UNRANKED_BOUNDARY,
    authority: {
      identity: authority.identity,
      verifiedConfigurationSha256: await sha256Canonical(getMaltlineAuthorityConfiguration(authority)),
    },
    gameFingerprint: fingerprintCanonical({ gameId: authority.identity.gameId }),
    rulesFingerprint: fingerprintCanonical(MALTLINE_RULES as unknown as CanonicalValue),
    baselineCampaignFingerprint: fingerprintMaltlineCampaign(authority.campaign),
    baselineScenarioFingerprints: authority.campaign.map(fingerprintNormalizedMaltlineScenario),
    initialRun: authority.initialRun,
    controller: {
      id: REACTIVE_MALTLINE_CONTROLLER.id,
      fingerprint: fingerprintCanonical(REACTIVE_MALTLINE_CONTROLLER.fingerprintData),
      fingerprintData: REACTIVE_MALTLINE_CONTROLLER.fingerprintData,
    },
    seedOffsets,
    traces: TRACES,
    scorePolicies: P104_SCORE_POLICIES,
    limits: { stageTicks: P104_STAGE_TICK_LIMIT, campaignTicks: P104_CAMPAIGN_TICK_LIMIT },
    observation: {
      fault: 'miss the first returning jar in the named stage by holding the adjacent lane',
      recoveryStart: 'jar_smashed life_lost event',
      firstFulfillmentEnd: 'next served event with firstFulfillment true',
      fullTierEnd: 'next served event with firstFulfillment true and points 200',
      campaignTick: 'sum of completed stage ticks plus current event tick',
    },
  }) as CanonicalValue;
  const experimentFingerprint = fingerprintP104RecoveryExperimentIdentity(identity);
  const runs = TRACES.flatMap((trace) => seedOffsets.map(
    (seedOffset) => runTrace(trace.id, trace.targetStage, seedOffset),
  ));
  const results = TRACES.map((trace) => summarizeTrace(
    trace.id,
    trace.targetStage,
    runs.filter((run) => run.traceId === trace.id),
  ));
  const resultSha256 = await sha256Canonical({
    experimentFingerprint,
    runs,
    results,
  } as unknown as CanonicalValue);

  return deepFreeze({
    schemaVersion: P104_RECOVERY_EXPERIMENT_SCHEMA_VERSION,
    experimentId: P104_RECOVERY_EXPERIMENT_ID,
    experimentRevision: P104_RECOVERY_EXPERIMENT_REVISION,
    taskId: 'P1-04' as const,
    prospective: true as const,
    policy: P104_UNRANKED_BOUNDARY,
    identity,
    experimentFingerprint,
    resultSha256,
    seedOffsets,
    runs,
    results,
  });
}

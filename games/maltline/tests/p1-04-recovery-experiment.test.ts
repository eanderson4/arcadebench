import { beforeAll, describe, expect, it } from 'vitest';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  getMaltlineAuthorityConfiguration,
} from '../src/core/authority';
import { canonicalJson } from '../src/core/fingerprint';
import {
  P104_RECOVERY_EXPERIMENT_ID,
  P104_SCORE_POLICIES,
  P104_UNRANKED_BOUNDARY,
  fingerprintP104RecoveryExperimentIdentity,
  runP104RecoveryExperiment,
  type P104RecoveryExperimentArtifact,
  type P104RecoveryRun,
  type P104TraceId,
} from '../src/experiments/p1-04-recovery-experiment';

function traceRuns(runs: readonly P104RecoveryRun[], traceId: P104TraceId): readonly P104RecoveryRun[] {
  return runs.filter((run) => run.traceId === traceId);
}

function score(run: P104RecoveryRun, policyId: typeof P104_SCORE_POLICIES[number]['id']): number {
  return run.policyScores.find((candidate) => candidate.policyId === policyId)!.totalScore;
}

describe('P1-04 prospective recovery-ledger experiment', () => {
  let artifact: P104RecoveryExperimentArtifact;
  let authorityBefore: string;

  beforeAll(async () => {
    authorityBefore = canonicalJson(getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY));
    artifact = await runP104RecoveryExperiment();
  });

  it('defines the three prospective policies with an unchanged 8,000-point perfect budget', () => {
    const perfect = traceRuns(artifact.runs, 'perfect-control');

    expect(P104_SCORE_POLICIES.map((policy) => policy.id)).toEqual([
      'authoritative-carried-lives',
      'stage-local-survival',
      'fixed-progress-plus-final-lives',
    ]);
    expect(perfect).toHaveLength(33);
    for (const run of perfect) {
      expect(run.ledger.stageClearPoints).toBe(8_000);
      expect(run.policyScores.map((candidate) => candidate.bonusPoints)).toEqual([8_000, 8_000, 8_000]);
      expect(run.policyScores.map((candidate) => candidate.totalScore)).toEqual([36_255, 36_255, 36_255]);
    }
  });

  it('compares equivalent first-return misses at Stage 4 and Stage 8 over canonical plus 32 shadows', () => {
    const early = traceRuns(artifact.runs, 'first-return-miss-stage-4');
    const late = traceRuns(artifact.runs, 'first-return-miss-stage-8');

    expect(artifact.seedOffsets).toHaveLength(33);
    expect(artifact.seedOffsets[0]).toBe(0);
    for (const runs of [early, late]) {
      expect(runs).toHaveLength(33);
      expect(runs.every((run) => run.status === 'won' && run.stagesCleared === 8)).toBe(true);
      expect(runs[0]!.totalTicks).toBe(21_662);
      expect(runs.every((run) => run.lossReasons.jar_smashed === 1)).toBe(true);
      expect(runs.every((run) => run.lossReasons.walkout === 0 && run.lossReasons.shake_smashed === 0)).toBe(true);
      expect(runs.every((run) => run.ledger.servePoints + run.ledger.jarCatchPoints === 28_130)).toBe(true);
    }

    // Seed offsets change authored spawn order and therefore completion time;
    // 21,662 is the registered canonical campaign result, not a shadow invariant.
    expect(artifact.results.map((result) => result.totalTicks)).toEqual([
      { min: 21_636, max: 21_662 },
      { min: 21_636, max: 21_662 },
      { min: 21_636, max: 21_662 },
    ]);

    expect(new Set(early.map((run) => score(run, 'authoritative-carried-lives')))).toEqual(new Set([34_880]));
    expect(new Set(late.map((run) => score(run, 'authoritative-carried-lives')))).toEqual(new Set([35_880]));
    for (const runs of [early, late]) {
      expect(new Set(runs.map((run) => score(run, 'stage-local-survival')))).toEqual(new Set([35_880]));
      expect(new Set(runs.map((run) => score(run, 'fixed-progress-plus-final-lives')))).toEqual(new Set([35_630]));
    }

    expect(score(late[0]!, 'authoritative-carried-lives') - score(early[0]!, 'authoritative-carried-lives')).toBe(1_000);
    expect(score(late[0]!, 'stage-local-survival') - score(early[0]!, 'stage-local-survival')).toBe(0);
    expect(score(late[0]!, 'fixed-progress-plus-final-lives') - score(early[0]!, 'fixed-progress-plus-final-lives')).toBe(0);
  });

  it('records canonical recovery latency and exact event-ledger reconciliation', () => {
    const early = traceRuns(artifact.runs, 'first-return-miss-stage-4')[0]!;
    const late = traceRuns(artifact.runs, 'first-return-miss-stage-8')[0]!;

    expect(early.recovery).toEqual({
      lossStage: 4,
      lossStageTick: 265,
      lossCampaignTick: 5_325,
      nextFulfillmentCampaignTick: 5_428,
      firstFulfillmentLatencyTicks: 103,
      maxServeTierCampaignTick: 6_977,
      maxServeTierLatencyTicks: 1_652,
    });
    expect(late.recovery).toEqual({
      lossStage: 8,
      lossStageTick: 271,
      lossCampaignTick: 18_632,
      nextFulfillmentCampaignTick: 18_724,
      firstFulfillmentLatencyTicks: 92,
      maxServeTierCampaignTick: 19_821,
      maxServeTierLatencyTicks: 1_189,
    });
    for (const run of artifact.runs) {
      expect(run.ledger.servePoints + run.ledger.jarCatchPoints + run.ledger.stageClearPoints)
        .toBe(run.ledger.total);
      expect(score(run, 'authoritative-carried-lives')).toBe(run.ledger.total);
    }
  });

  it('binds authority, controller, seeds, traces, policies, and results with stable identities', async () => {
    const first = artifact;
    const second = await runP104RecoveryExperiment();

    expect(first).toEqual(second);
    expect(first.experimentId).toBe(P104_RECOVERY_EXPERIMENT_ID);
    expect(first.prospective).toBe(true);
    expect(first.policy).toEqual(P104_UNRANKED_BOUNDARY);
    expect(first.policy.rankedProofEmission).toBe('forbidden');
    expect(first.experimentFingerprint).toBe(fingerprintP104RecoveryExperimentIdentity(first.identity));
    expect(first.experimentFingerprint).toBe('fnv1a64:3edebca005595e7d');
    expect(first.resultSha256).toBe(
      '0458ab7b4407b09585cf9115d5cca8b878011b726d76718d4e71ed4898de08aa',
    );
    expect(first.resultSha256).toBe(second.resultSha256);
    expect(first.identity).toMatchObject({
      authority: {
        identity: MALTLINE_GENERATION_2_AUTHORITY.identity,
        verifiedConfigurationSha256: MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256,
      },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.runs)).toBe(true);
    expect(Object.isFrozen(first.runs[0]!.policyScores)).toBe(true);
    expect(canonicalJson(getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY))).toBe(authorityBefore);

    const changedPolicyIdentity = structuredClone(first.identity) as Record<string, unknown>;
    (changedPolicyIdentity.scorePolicies as Array<Record<string, unknown>>)[1]!.penaltyPerStageLifeLoss = 251;
    expect(fingerprintP104RecoveryExperimentIdentity(changedPolicyIdentity as never))
      .not.toBe(first.experimentFingerprint);
  });
});

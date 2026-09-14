import { describe, expect, it } from 'vitest';
import {
  runP102Stage8ReliefExperiment,
  runP102Stage8ReliefFreshOracleForTesting,
} from '../src/experiments/p1-02-stage8-relief-experiment';

describe('P102 fresh full-campaign equivalence oracle', () => {
  it('matches every optimized A/B outcome to 132 independently executed fresh pairs', async () => {
    const optimized = await runP102Stage8ReliefExperiment();
    const oracle = await runP102Stage8ReliefFreshOracleForTesting();
    expect(oracle.pairs).toHaveLength(132);
    expect(oracle.actualWork).toEqual({
      logicalCampaignOutcomes: 264,
      executedCampaignPrefixes: 264,
      reusedCampaignPrefixes: 0,
      stageStarts: 1_814,
      controllerCreations: 1_814,
      campaignTicks: 4_765_724,
      controllerCalls: 4_765_724,
      engineSteps: 4_765_724,
    });
    for (const pair of oracle.pairs) {
      const control = optimized.runs.find((run) => run.candidateId === 'registered-control'
        && run.profileId === pair.profileId && run.seedOffset === pair.seedOffset);
      const relief = optimized.runs.find((run) => run.candidateId === 'stage8-arrival-relief-138'
        && run.profileId === pair.profileId && run.seedOffset === pair.seedOffset);
      expect(control, `${pair.profileId}:${pair.seedOffset}:control`).toEqual(pair.control);
      expect(relief, `${pair.profileId}:${pair.seedOffset}:relief`).toEqual(pair.relief);
      expect(pair.control.sharedPrefix).toEqual(pair.relief.sharedPrefix);
      expect(pair.control.sharedPrefix).not.toBe(pair.relief.sharedPrefix);
    }
    expect(Object.isFrozen(oracle)).toBe(true);
    expect(Object.isFrozen(oracle.pairs)).toBe(true);
    expect(Object.isFrozen(oracle.pairs[0]?.control)).toBe(true);
  }, 30_000);
});

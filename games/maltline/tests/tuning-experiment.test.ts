import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { fingerprintCanonical, type CanonicalValue } from '../src/core/fingerprint';
import { MALTLINE_GAME_ID, MALTLINE_RULES, MALTLINE_SCENARIO_SCHEMA_VERSION } from '../src/core/rules';
import type { MaltlineScenario } from '../src/core/types';
import { fingerprintMaltlineCampaign } from '../src/telemetry/campaign-telemetry';
import { EXP_021_BASELINE_CAMPAIGN } from '../src/telemetry/exp-021-baseline';
import {
  EXP_021_CANDIDATES,
  EXP_021_HISTORICAL_IDENTITY,
  EXP_021_SEED_OFFSETS,
  applyMaltlineTuningCandidate,
  fingerprintMaltlineTuningExperimentIdentity,
  formatMaltlineTuningExperiment,
  runMaltlineTuningExperiment,
  type MaltlineTuningCandidate,
} from '../src/telemetry/tuning-experiment';
import { DELAYED_COMPETENT_MALTLINE_CONTROLLER } from '../src/telemetry/player-model-controllers';
import { REACTIVE_MALTLINE_CONTROLLER } from '../src/telemetry/reactive-controller';

function candidate(id: string) {
  return EXP_021_CANDIDATES.find((entry) => entry.id === id)!;
}

const QUICK_OPTIONS = {
  candidates: [candidate('baseline-3-lives')],
  profiles: [REACTIVE_MALTLINE_CONTROLLER],
  seedOffsets: [0],
  tickLimitPerStage: 1,
} as const;

function quickFingerprint(overrides = {}) {
  return runMaltlineTuningExperiment({ ...QUICK_OPTIONS, ...overrides }).experimentFingerprint;
}

const scenarioMutations = {
  id: (scenario) => ({ ...scenario, id: `${scenario.id}-changed` }),
  name: (scenario) => ({ ...scenario, name: `${scenario.name} changed` }),
  ticksPerSecond: (scenario) => ({ ...scenario, ticksPerSecond: scenario.ticksPerSecond + 1 }),
  lanes: (scenario) => ({ ...scenario, lanes: scenario.lanes + 1 }),
  laneLength: (scenario) => ({ ...scenario, laneLength: scenario.laneLength + 1 }),
  stations: (scenario) => ({ ...scenario, stations: ['vanilla', 'chocolate'] as const }),
  jarPoolSize: (scenario) => ({ ...scenario, jarPoolSize: scenario.jarPoolSize + 1 }),
  blendTicks: (scenario) => ({ ...scenario, blendTicks: scenario.blendTicks + 1 }),
  washTicks: (scenario) => ({ ...scenario, washTicks: scenario.washTicks + 1 }),
  drinkTicks: (scenario) => ({ ...scenario, drinkTicks: scenario.drinkTicks + 1 }),
  customerCount: (scenario) => ({ ...scenario, customerCount: scenario.customerCount + 1 }),
  spawnIntervalTicks: (scenario) => ({
    ...scenario,
    spawnIntervalTicks: scenario.spawnIntervalTicks + 1,
  }),
  spawnAccelerationTicks: (scenario) => ({
    ...scenario,
    spawnAccelerationTicks: scenario.spawnAccelerationTicks + 1,
  }),
  spawnIntervalFloorTicks: (scenario) => ({
    ...scenario,
    spawnIntervalFloorTicks: scenario.spawnIntervalFloorTicks + 1,
  }),
  marchSpeed: (scenario) => ({ ...scenario, marchSpeed: scenario.marchSpeed + 1 / 1024 }),
  leaveSpeed: (scenario) => ({ ...scenario, leaveSpeed: scenario.leaveSpeed + 1 / 1024 }),
  slideSpeed: (scenario) => ({ ...scenario, slideSpeed: scenario.slideSpeed + 1 / 1024 }),
  returnSpeed: (scenario) => ({ ...scenario, returnSpeed: scenario.returnSpeed + 1 / 1024 }),
  resumeExitThreshold: (scenario) => ({
    ...scenario,
    resumeExitThreshold: scenario.resumeExitThreshold + 0.01,
  }),
  stationRepeatTicks: (scenario) => ({
    ...scenario,
    stationRepeatTicks: scenario.stationRepeatTicks + 1,
  }),
  laneRepeatTicks: (scenario) => ({ ...scenario, laneRepeatTicks: scenario.laneRepeatTicks + 1 }),
  lives: (scenario) => ({ ...scenario, lives: scenario.lives + 1 }),
  seed: (scenario) => ({ ...scenario, seed: scenario.seed + 1 }),
} satisfies Record<keyof MaltlineScenario, (scenario: MaltlineScenario) => MaltlineScenario>;

const ruleMutations = {
  version: (rules) => ({ ...rules, version: rules.version + 1 }),
  fixedScale: (rules) => ({ ...rules, fixedScale: rules.fixedScale + 1 }),
  initialSpawnDelayTicks: (rules) => ({
    ...rules,
    initialSpawnDelayTicks: rules.initialSpawnDelayTicks + 1,
  }),
  stageClearBonusPerLife: (rules) => ({
    ...rules,
    stageClearBonusPerLife: rules.stageClearBonusPerLife + 1,
  }),
  serveBaseScore: (rules) => ({ ...rules, serveBaseScore: rules.serveBaseScore + 1 }),
  serveStreakStep: (rules) => ({ ...rules, serveStreakStep: rules.serveStreakStep + 1 }),
  serveStreakCap: (rules) => ({ ...rules, serveStreakCap: rules.serveStreakCap + 1 }),
  jarCatchScore: (rules) => ({ ...rules, jarCatchScore: rules.jarCatchScore + 1 }),
  maximumRequeuesPerCustomer: (rules) => ({
    ...rules,
    maximumRequeuesPerCustomer: rules.maximumRequeuesPerCustomer + 1,
  }),
  tickOrder: (rules) => ({ ...rules, tickOrder: [...rules.tickOrder].reverse() }),
} satisfies Record<keyof typeof MALTLINE_RULES, (
  rules: typeof MALTLINE_RULES,
) => CanonicalValue>;

describe('Maltline EXP-021 tuning matrix', () => {
  it('uses one canonical and 32 unique deterministic shadow offsets', () => {
    expect(EXP_021_SEED_OFFSETS).toHaveLength(33);
    expect(EXP_021_SEED_OFFSETS[0]).toBe(0);
    expect(new Set(EXP_021_SEED_OFFSETS).size).toBe(33);
    expect(Object.isFrozen(EXP_021_SEED_OFFSETS)).toBe(true);
  });

  it('preserves the schema-v1 artifact identity while emitting complete schema-v2 provenance', () => {
    const experiment = runMaltlineTuningExperiment(QUICK_OPTIONS);

    expect(EXP_021_HISTORICAL_IDENTITY).toEqual({
      schemaVersion: 1,
      experimentId: 'EXP-021',
      experimentFingerprint: 'fnv1a64:da093358d25348ae',
    });
    expect(experiment).toMatchObject({
      schemaVersion: 2,
      experimentId: 'EXP-021',
      historicalExperiment: EXP_021_HISTORICAL_IDENTITY,
      identity: {
        schemaVersion: 2,
        historicalExperiment: EXP_021_HISTORICAL_IDENTITY,
        game: { id: 'maltline' },
        rules: { version: MALTLINE_RULES.version },
        baselineCampaign: { generation: 1 },
        initialRunPolicy: { lives: 'candidate.initialLives', score: 0 },
        tickLimitPerStage: 1,
        seedOffsets: [0],
      },
    });
    expect(experiment.identity.baselineCampaign.fingerprint)
      .toBe(fingerprintMaltlineCampaign(EXP_021_BASELINE_CAMPAIGN));
    expect(experiment.experimentFingerprint)
      .toBe(fingerprintMaltlineTuningExperimentIdentity(experiment.identity));
  });

  it('preserves stages 1–3 and never mutates the authored campaign', () => {
    const before = structuredClone(EXP_021_BASELINE_CAMPAIGN);
    const tuned = applyMaltlineTuningCandidate(
      EXP_021_BASELINE_CAMPAIGN,
      candidate('paced-balanced-4-lives'),
    );

    expect(tuned.slice(0, 3)).toEqual(EXP_021_BASELINE_CAMPAIGN.slice(0, 3));
    expect(tuned.slice(3).map((stage) => stage.customerCount)).toEqual([20, 20, 17, 27, 31]);
    expect(EXP_021_BASELINE_CAMPAIGN).toEqual(before);
  });

  it('keeps the promoted generation equal to the historical winning candidate', () => {
    const promoted = applyMaltlineTuningCandidate(
      EXP_021_BASELINE_CAMPAIGN,
      candidate('paced-balanced-4-lives'),
    ).map((scenario) => ({ ...scenario, lives: 4 }));

    expect(MALTLINE_CAMPAIGN).toEqual(promoted);
  });

  it('produces byte-identical experiment output on repeated subsets', () => {
    const options = {
      candidates: [candidate('baseline-4-lives'), candidate('paced-balanced-4-lives')],
      profiles: [REACTIVE_MALTLINE_CONTROLLER, DELAYED_COMPETENT_MALTLINE_CONTROLLER],
      seedOffsets: [0, 101, 307],
    } as const;
    const first = runMaltlineTuningExperiment(options);
    const second = runMaltlineTuningExperiment(options);

    expect(formatMaltlineTuningExperiment(second)).toBe(formatMaltlineTuningExperiment(first));
  });

  it('binds every normalized baseline scenario field into experiment identity', () => {
    const baselineFingerprint = quickFingerprint();
    const original = EXP_021_BASELINE_CAMPAIGN[0]!;
    expect(Object.keys(scenarioMutations).sort()).toEqual(Object.keys(original).sort());

    for (const [field, mutate] of Object.entries(scenarioMutations)) {
      const scenarios = EXP_021_BASELINE_CAMPAIGN.map((scenario, index) => (
        index === 0 ? mutate(scenario) : scenario
      ));
      expect(quickFingerprint({ scenarios }), field).not.toBe(baselineFingerprint);
    }
  });

  it('binds every rules field plus game identity, run policy, tick limit, seeds, and controller metadata', () => {
    const baseline = runMaltlineTuningExperiment(QUICK_OPTIONS);
    expect(Object.keys(ruleMutations).sort()).toEqual(Object.keys(MALTLINE_RULES).sort());
    for (const [field, mutate] of Object.entries(ruleMutations)) {
      const changedRulesFingerprint = fingerprintCanonical(mutate(MALTLINE_RULES));
      expect(fingerprintMaltlineTuningExperimentIdentity({
        ...baseline.identity,
        rules: { ...baseline.identity.rules, fingerprint: changedRulesFingerprint },
      }), field).not.toBe(baseline.experimentFingerprint);
    }
    const changedGameFingerprint = fingerprintCanonical({
      gameId: MALTLINE_GAME_ID,
      scenarioSchemaVersion: MALTLINE_SCENARIO_SCHEMA_VERSION,
      rules: { ...MALTLINE_RULES, serveBaseScore: MALTLINE_RULES.serveBaseScore + 1 },
    });
    expect(fingerprintMaltlineTuningExperimentIdentity({
      ...baseline.identity,
      game: { ...baseline.identity.game, fingerprint: changedGameFingerprint },
    })).not.toBe(baseline.experimentFingerprint);

    expect(quickFingerprint({ initialScore: 25 })).not.toBe(baseline.experimentFingerprint);
    expect(quickFingerprint({ tickLimitPerStage: 2 })).not.toBe(baseline.experimentFingerprint);
    expect(quickFingerprint({ seedOffsets: [1] })).not.toBe(baseline.experimentFingerprint);
    expect(quickFingerprint({
      profiles: [{
        ...REACTIVE_MALTLINE_CONTROLLER,
        fingerprintData: { algorithm: 'reactive-current-state', version: 2 },
      }],
    })).not.toBe(baseline.experimentFingerprint);
    expect(quickFingerprint({
      profiles: [{ ...REACTIVE_MALTLINE_CONTROLLER, id: 'reactive-current-state-renamed-v1' }],
    })).not.toBe(baseline.experimentFingerprint);
  });

  it('binds candidate metadata, initial lives, transforms, and every effective campaign', () => {
    const baseCandidate = candidate('paced-balanced-4-lives');
    const options = {
      ...QUICK_OPTIONS,
      candidates: [baseCandidate],
      seedOffsets: [0, 101],
    } as const;
    const baseline = runMaltlineTuningExperiment(options);
    const candidateIdentity = baseline.identity.candidates[0]!;
    const result = baseline.candidates[0]!;

    expect(candidateIdentity.effectiveCampaigns).toEqual([0, 101].map((seedOffset) => ({
      seedOffset,
      fingerprint: fingerprintMaltlineCampaign(applyMaltlineTuningCandidate(
        EXP_021_BASELINE_CAMPAIGN,
        baseCandidate,
        seedOffset,
      )),
    })));
    expect(result.effectiveCampaignFingerprints).toEqual(
      candidateIdentity.effectiveCampaigns.map(({ seedOffset, fingerprint }) => ({
        seedOffset,
        campaignFingerprint: fingerprint,
      })),
    );

    const variants: MaltlineTuningCandidate[] = [
      { ...baseCandidate, id: `${baseCandidate.id}-changed` },
      { ...baseCandidate, description: `${baseCandidate.description} Changed.` },
      { ...baseCandidate, initialLives: baseCandidate.initialLives + 1 },
      {
        ...baseCandidate,
        lateStages: baseCandidate.lateStages!.map((stage, index) => index === 0
          ? { ...stage, customerCount: stage.customerCount + 1 }
          : stage),
      },
      {
        ...baseCandidate,
        lateStages: baseCandidate.lateStages!.map((stage, index) => index === 0
          ? { ...stage, spawnIntervalScale: stage.spawnIntervalScale + 0.1 }
          : stage),
      },
      {
        ...baseCandidate,
        lateStages: baseCandidate.lateStages!.map((stage, index) => index === 0
          ? { ...stage, spawnFloorScale: stage.spawnFloorScale + 0.1 }
          : stage),
      },
      {
        ...baseCandidate,
        lateStages: baseCandidate.lateStages!.map((stage, index) => index === 0
          ? { ...stage, spawnAccelerationScale: stage.spawnAccelerationScale + 0.1 }
          : stage),
      },
    ];
    for (const changedCandidate of variants) {
      expect(runMaltlineTuningExperiment({
        ...options,
        candidates: [changedCandidate],
      }).experimentFingerprint).not.toBe(baseline.experimentFingerprint);
    }
  });

  it('finds a paced 300–420 second candidate without the count-only competence collapse', () => {
    const experiment = runMaltlineTuningExperiment();
    const countOnly = experiment.candidates.find((entry) => (
      entry.candidateId === 'count-only-light-4-lives'
    ))!;
    const paced = experiment.candidates.find((entry) => (
      entry.candidateId === 'paced-balanced-4-lives'
    ))!;
    const countOnlyDelayed = countOnly.profiles[1]!;
    const pacedReactive = paced.profiles[0]!;
    const pacedDelayed = paced.profiles[1]!;

    expect(experiment.schemaVersion).toBe(2);
    expect(experiment.experimentFingerprint).toBe('fnv1a64:ca3ebefefc0b4582');
    expect(countOnlyDelayed).toMatchObject({ runs: 33, wins: 0 });
    expect(pacedReactive).toMatchObject({ runs: 33, wins: 33 });
    expect(pacedDelayed).toMatchObject({ runs: 33, wins: 31 });
    expect(pacedReactive.winningSeconds!.mean).toBeGreaterThanOrEqual(300);
    expect(pacedReactive.winningSeconds!.mean).toBeLessThanOrEqual(420);
    expect(pacedDelayed.winningSeconds!.mean).toBeGreaterThanOrEqual(300);
    expect(pacedDelayed.winningSeconds!.mean).toBeLessThanOrEqual(420);
    expect(pacedDelayed.stageCurve[7]).toMatchObject({ reached: 33, cleared: 31 });
    expect(pacedDelayed.maxLiveCustomers.mean).toBeLessThan(countOnlyDelayed.maxLiveCustomers.mean);
  }, 15_000);
});

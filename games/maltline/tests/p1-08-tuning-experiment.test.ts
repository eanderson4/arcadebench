import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
} from '../src/core/authority';
import { createAuthoredGeneration2Campaign } from '../src/core/campaign-source';
import type { CanonicalValue } from '../src/core/fingerprint';
import { MALTLINE_RANKED_RESOURCE_LIMITS } from '../src/core/proof';
import {
  fingerprintMaltlineCampaign,
} from '../src/telemetry/campaign-telemetry';
import {
  P108_TUNING_CANDIDATES,
  P108_TUNING_PROFILES,
  P108_SEED_OFFSETS,
  P108_TUNING_REVISION,
  P108_TUNING_WORK_LIMITS,
  P108_UNRANKED_BOUNDARY,
  fingerprintP108ExperimentIdentity,
  formatP108TuningExperiment,
  runP108TuningExperiment,
  type P108TuningCandidate,
  type P108TuningExperimentOptions,
} from '../src/telemetry/p1-08-tuning-experiment';
import { PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER } from '../src/telemetry/physical-intent-controller';
import { REACTIVE_MALTLINE_CONTROLLER } from '../src/telemetry/reactive-controller';
import {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
} from '../src/testing/generation-2-proofs';

function candidate(id: string): P108TuningCandidate {
  return P108_TUNING_CANDIDATES.find((entry) => entry.id === id)!;
}

const QUICK_OPTIONS = {
  candidates: [candidate('a-registered-control')],
  profiles: [REACTIVE_MALTLINE_CONTROLLER],
  seedOffsets: [0],
  tickLimitPerStage: 1,
} as const;

async function quickFingerprint(overrides: P108TuningExperimentOptions = {}): Promise<string> {
  return (await runP108TuningExperiment({ ...QUICK_OPTIONS, ...overrides })).experimentFingerprint;
}

describe('Maltline EXP-049/P1-08 unranked tuning matrix', () => {
  it('pins the exact generation-2 authority while leaving source and fixtures untouched', async () => {
    const authorityBefore = JSON.stringify(MALTLINE_GENERATION_2_AUTHORITY);
    const fixtureBefore = JSON.stringify([
      GENERATION_2_WIN_PROOF,
      GENERATION_2_LOSS_PROOF,
      GENERATION_2_MISTAKE_PROOF,
    ]);
    const experiment = await runP108TuningExperiment(QUICK_OPTIONS);

    expect(MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256)
      .toBe(MALTLINE_GENERATION_2_CONFIGURATION_SHA256);
    expect(experiment.identity.authority).toEqual({
      identity: MALTLINE_GENERATION_2_AUTHORITY.identity,
      verifiedConfigurationSha256: MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
    });
    expect(experiment.identity.baselineCampaign.fingerprint)
      .toBe('fnv1a64:adc596f1154aeafa');
    expect(experiment.identity.limits.workPreflight).toMatchObject({
      effectiveCampaigns: 1,
      campaignRuns: 1,
      maximumStageStartsPlanned: 8,
      maximumTicksPerCampaignPlanned: 8,
      maximumTicksPlanned: 8,
    });
    expect(fingerprintMaltlineCampaign(createAuthoredGeneration2Campaign()))
      .toBe(experiment.identity.baselineCampaign.fingerprint);
    expect(JSON.stringify(MALTLINE_GENERATION_2_AUTHORITY)).toBe(authorityBefore);
    expect(JSON.stringify([
      GENERATION_2_WIN_PROOF,
      GENERATION_2_LOSS_PROOF,
      GENERATION_2_MISTAKE_PROOF,
    ])).toBe(fixtureBefore);
  });

  it('freezes inputs before async authority verification and rejects malformed admission', async () => {
    const mutable = structuredClone(candidate('b-stage-5-resource-cadence')) as {
      id: string;
      description: string;
      changes: Array<{ stageId: string; field: 'spawnIntervalTicks' | 'spawnAccelerationTicks'; from: number; to: number }>;
    };
    const pending = runP108TuningExperiment({ ...QUICK_OPTIONS, candidates: [mutable] });
    mutable.description = 'mutated after call';
    mutable.changes[0]!.to = 999;
    const result = await pending;
    expect(result.candidates[0]).toMatchObject({
      description: candidate('b-stage-5-resource-cadence').description,
      changes: candidate('b-stage-5-resource-cadence').changes,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candidates[0]!.effectiveCampaigns[0]!.scenarioFingerprints)).toBe(true);

    const mutableRun = { lives: 3, score: 7 };
    const runPending = runP108TuningExperiment({ ...QUICK_OPTIONS, initialRun: mutableRun });
    mutableRun.lives = 99;
    mutableRun.score = 99;
    expect((await runPending).identity.initialRun.value).toEqual({ lives: 3, score: 7 });

    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [candidate('a-registered-control'), candidate('a-registered-control')],
    })).rejects.toThrow(/candidate ids must be unique/u);
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, seedOffsets: [0, 0] }))
      .rejects.toThrow(/seed offsets must be unique/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      profiles: [REACTIVE_MALTLINE_CONTROLLER, REACTIVE_MALTLINE_CONTROLLER],
    })).rejects.toThrow(/controller ids must be unique/u);
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, seedOffsets: [1] }))
      .rejects.toThrow(/canonical offset zero/u);
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, tickLimitPerStage: 60_001 }))
      .rejects.toThrow(/stage-tick ceiling/u);
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, initialRun: { lives: 0, score: 0 } }))
      .rejects.toThrow(/initial run is outside ranked resource bounds/u);
  });

  it('requires exact ordinary options and dense ordinary caller collections', async () => {
    let getterCalls = 0;
    const accessorOptions = Object.defineProperty({}, 'candidates', {
      enumerable: true,
      get: () => {
        getterCalls++;
        return QUICK_OPTIONS.candidates;
      },
    });
    await expect(runP108TuningExperiment(accessorOptions as P108TuningExperimentOptions))
      .rejects.toThrow(/options\.candidates.*data property/u);
    expect(getterCalls).toBe(0);
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, surprise: true } as P108TuningExperimentOptions))
      .rejects.toThrow(/unsupported fields/u);
    await expect(runP108TuningExperiment(Object.assign(Object.create(null), QUICK_OPTIONS)))
      .rejects.toThrow(/ordinary object/u);
    await expect(runP108TuningExperiment(Object.assign(Object.create({}), QUICK_OPTIONS)))
      .rejects.toThrow(/ordinary object/u);
    const symbolOptions = { ...QUICK_OPTIONS } as P108TuningExperimentOptions & Record<symbol, boolean>;
    symbolOptions[Symbol('extra')] = true;
    await expect(runP108TuningExperiment(symbolOptions)).rejects.toThrow(/unsupported fields/u);

    const sparseCandidates = [candidate('a-registered-control')] as P108TuningCandidate[];
    sparseCandidates.length = 2;
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, candidates: sparseCandidates }))
      .rejects.toThrow(/dense array/u);

    const accessorProfiles = [REACTIVE_MALTLINE_CONTROLLER] as unknown[];
    Object.defineProperty(accessorProfiles, '0', {
      enumerable: true,
      get: () => REACTIVE_MALTLINE_CONTROLLER,
    });
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      profiles: accessorProfiles as P108TuningExperimentOptions['profiles'],
    })).rejects.toThrow(/profiles\[0\].*data property/u);

    const extraSeeds = [0] as number[] & { note?: string };
    extraSeeds.note = 'not an index';
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, seedOffsets: extraSeeds }))
      .rejects.toThrow(/dense array without extra fields/u);

    const exoticCandidates = [candidate('a-registered-control')];
    Object.setPrototypeOf(exoticCandidates, Object.create(Array.prototype));
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, candidates: exoticCandidates }))
      .rejects.toThrow(/ordinary array/u);
  });

  it('enforces cardinality, transform, run, and cumulative work caps before deep input work', async () => {
    const candidateCopies = (count: number): P108TuningCandidate[] => Array.from(
      { length: count },
      (_, index) => ({
        ...candidate('a-registered-control'),
        id: `candidate-${index}`,
        description: `Candidate ${index}.`,
        changes: [],
      }),
    );
    const profileCopies = (
      count: number,
      onCreate: () => void = () => {},
    ): Array<(typeof P108_TUNING_PROFILES)[number]> => Array.from(
      { length: count },
      (_, index) => ({
        ...REACTIVE_MALTLINE_CONTROLLER,
        id: `reactive-probe-${index}`,
        fingerprintData: { algorithm: 'reactive-probe', version: 1, index },
        create: () => {
          onCreate();
          return REACTIVE_MALTLINE_CONTROLLER.create();
        },
      }),
    );

    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, candidates: candidateCopies(9) }))
      .rejects.toThrow(/candidates exceeds maximum length 8/u);
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, profiles: profileCopies(5) }))
      .rejects.toThrow(/profiles exceeds maximum length 4/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      seedOffsets: Array.from({ length: 65 }, (_, index) => index),
    })).rejects.toThrow(/seed offsets exceeds maximum length 64/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [{
        id: 'too-many-changes',
        description: 'Too many changes.',
        changes: Array.from({ length: 17 }, () => candidate('b-stage-5-resource-cadence').changes[0]!),
      }],
    })).rejects.toThrow(/changes exceeds maximum length 16/u);

    await expect(runP108TuningExperiment({
      candidates: candidateCopies(8),
      profiles: profileCopies(2),
      seedOffsets: P108_SEED_OFFSETS,
      tickLimitPerStage: 1,
    })).rejects.toThrow(/campaign run count exceeds/u);

    let inspectedCandidate = 0;
    let createCalls = 0;
    const poisonedCandidate = Object.defineProperty({
      id: 'poisoned-candidate',
      changes: [],
    }, 'description', {
      enumerable: true,
      get: () => {
        inspectedCandidate++;
        return 'Must not be inspected.';
      },
    }) as unknown as P108TuningCandidate;
    await expect(runP108TuningExperiment({
      candidates: [poisonedCandidate, ...candidateCopies(5).slice(1)],
      profiles: profileCopies(3, () => { createCalls++; }),
      seedOffsets: P108_SEED_OFFSETS,
      tickLimitPerStage: 60_000,
    })).rejects.toThrow(/cumulative planned tick count exceeds/u);
    expect(inspectedCandidate).toBe(0);
    expect(createCalls).toBe(0);
  });

  it('admits the exact effective-campaign ceiling at a bounded tick plan', async () => {
    const candidates = Array.from({ length: 8 }, (_, index): P108TuningCandidate => ({
      ...candidate('a-registered-control'),
      id: `exact-candidate-${index}`,
      description: `Exact candidate ${index}.`,
      changes: [],
    }));
    const experiment = await runP108TuningExperiment({
      candidates,
      profiles: [REACTIVE_MALTLINE_CONTROLLER],
      seedOffsets: Array.from({ length: 64 }, (_, index) => index),
      tickLimitPerStage: 1,
    });

    expect(P108_TUNING_WORK_LIMITS).toMatchObject({
      maximumCandidates: 8,
      maximumProfiles: 4,
      maximumSeedOffsets: 64,
      maximumEffectiveCampaigns: 512,
      maximumCampaignRuns: 512,
      maximumPlannedTicks: 23_760_000,
    });
    expect(experiment.identity.limits.workPreflight).toMatchObject({
      effectiveCampaigns: 512,
      campaignRuns: 512,
      maximumStageStartsPlanned: 4_096,
      maximumTicksPerCampaignPlanned: 8,
      maximumTicksPlanned: 4_096,
    });

    const fourProfiles = P108_TUNING_PROFILES.concat({
      ...REACTIVE_MALTLINE_CONTROLLER,
      id: 'fourth-profile-probe-v1',
      fingerprintData: { algorithm: 'fourth-profile-probe', version: 1 },
    });
    const profileMaximum = await runP108TuningExperiment({
      ...QUICK_OPTIONS,
      profiles: fourProfiles,
    });
    expect(profileMaximum.identity.limits.workPreflight.campaignRuns).toBe(4);

    const exactChanges = MALTLINE_GENERATION_2_AUTHORITY.campaign
      .slice(3, 7)
      .flatMap((scenario) => ([
        { stageId: scenario.id, field: 'customerCount' as const,
          from: scenario.customerCount, to: scenario.customerCount + 1 },
        { stageId: scenario.id, field: 'spawnIntervalTicks' as const,
          from: scenario.spawnIntervalTicks, to: scenario.spawnIntervalTicks - 1 },
        { stageId: scenario.id, field: 'spawnAccelerationTicks' as const,
          from: scenario.spawnAccelerationTicks, to: scenario.spawnAccelerationTicks + 1 },
        { stageId: scenario.id, field: 'marchSpeed' as const,
          from: scenario.marchSpeed, to: scenario.marchSpeed + 0.001 },
      ]));
    const changeMaximum = await runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [{
        id: 'sixteen-change-probe',
        description: 'Exercises the complete Stage 4 through 7 tuning field boundary.',
        changes: exactChanges,
      }],
    });
    expect(changeMaximum.candidates[0]!.changes).toHaveLength(16);
  });

  it('rejects invalid, stale, duplicate, no-op, extra, accessor, and out-of-ceiling transforms', async () => {
    const base = candidate('b-stage-5-resource-cadence');
    const withChange = (change: Record<string, unknown>): P108TuningCandidate => ({
      id: 'invalid-probe',
      description: 'Invalid probe.',
      changes: [change as unknown as P108TuningCandidate['changes'][number]],
    });

    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [withChange({ ...base.changes[0], to: Number.NaN })],
    })).rejects.toThrow(/finite/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [withChange({ ...base.changes[0], from: 205 })],
    })).rejects.toThrow(/stale from/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [withChange({ ...base.changes[0], to: base.changes[0]!.from })],
    })).rejects.toThrow(/no-op/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [{ ...base, id: 'duplicate-change', changes: [base.changes[0]!, base.changes[0]!] }],
    })).rejects.toThrow(/repeats a change/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [withChange({ ...base.changes[0], stageId: 'maltline-03-three-windows' })],
    })).rejects.toThrow(/stages 4 through 7/u);
    await expect(runP108TuningExperiment({
      ...QUICK_OPTIONS,
      candidates: [withChange({
        stageId: 'maltline-07-happy-hour',
        field: 'customerCount',
        from: 27,
        to: MALTLINE_RANKED_RESOURCE_LIMITS.maximumCustomerCount + 1,
      })],
    })).rejects.toThrow(/ranked resource ceiling/u);

    const extra = { ...base, surprise: true } as unknown as P108TuningCandidate;
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, candidates: [extra] }))
      .rejects.toThrow(/unsupported fields/u);
    const accessor = Object.defineProperty({
      id: 'accessor-probe',
      changes: [],
    }, 'description', { enumerable: true, get: () => 'No.' }) as unknown as P108TuningCandidate;
    await expect(runP108TuningExperiment({ ...QUICK_OPTIONS, candidates: [accessor] }))
      .rejects.toThrow(/data property/u);
  });

  it('binds authority, limits, initial run, seed set, controller metadata, candidate order, and effective campaigns', async () => {
    const baseline = await runP108TuningExperiment(QUICK_OPTIONS);
    const fingerprint = baseline.experimentFingerprint;
    const mutatedIdentities = [
      {
        ...baseline.identity,
        authority: {
          ...baseline.identity.authority,
          verifiedConfigurationSha256: `0${baseline.identity.authority.verifiedConfigurationSha256.slice(1)}`,
        },
      },
      {
        ...baseline.identity,
        limits: { ...baseline.identity.limits, maximumProofTotalTicks: 59_999 },
      },
      {
        ...baseline.identity,
        baselineCampaign: {
          ...baseline.identity.baselineCampaign,
          scenarioFingerprints: baseline.identity.baselineCampaign.scenarioFingerprints.map((entry, index) => (
            index === 0 ? { ...entry, fingerprint: 'fnv1a64:0000000000000000' } : entry
          )),
        },
      },
      {
        ...baseline.identity,
        candidates: baseline.identity.candidates.map((entry) => ({
          ...entry,
          effectiveCampaigns: entry.effectiveCampaigns.map((campaign) => ({
            ...campaign,
            campaignFingerprint: 'fnv1a64:0000000000000000',
          })),
        })),
      },
    ];
    for (const identity of mutatedIdentities) {
      expect(fingerprintP108ExperimentIdentity(identity)).not.toBe(fingerprint);
    }

    await expect(quickFingerprint({ initialRun: { lives: 3, score: 0 } }))
      .resolves.not.toBe(fingerprint);
    await expect(quickFingerprint({ tickLimitPerStage: 2 })).resolves.not.toBe(fingerprint);
    await expect(quickFingerprint({ seedOffsets: [0, 101] })).resolves.not.toBe(fingerprint);
    await expect(quickFingerprint({
      profiles: [{
        ...REACTIVE_MALTLINE_CONTROLLER,
        fingerprintData: { algorithm: 'reactive-current-state', version: 2 },
      }],
    })).resolves.not.toBe(fingerprint);
    await expect(quickFingerprint({
      candidates: [
        candidate('b-stage-5-resource-cadence'),
        candidate('a-registered-control'),
      ],
    })).resolves.not.toBe(fingerprint);

    const physical = await runP108TuningExperiment({
      ...QUICK_OPTIONS,
      profiles: [PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER],
    });
    const adapterMetadata = physical.identity.controllers[0]!.metadata as Record<string, CanonicalValue>;
    expect(adapterMetadata.adapter).toEqual({
      id: 'viewer-keyboard-input-v2',
      directionInitialRepeatMultiplier: 3,
      serveLatchPolicy: 'pre-step-blend-or-held-one-shot-v1',
    });
    expect(physical.experimentFingerprint).not.toBe(fingerprint);
  });

  it('labels every run unranked and exposes no ranked proof emission path', async () => {
    const experiment = await runP108TuningExperiment({
      candidates: P108_TUNING_CANDIDATES,
      profiles: [REACTIVE_MALTLINE_CONTROLLER],
      seedOffsets: [0, 101],
      tickLimitPerStage: 1,
    });
    const baselineFingerprint = experiment.identity.baselineCampaign.fingerprint;

    expect(experiment.rankEligibility).toBe('unranked');
    expect(experiment.identity.ranking).toBe(P108_UNRANKED_BOUNDARY);
    expect(JSON.stringify(experiment)).not.toContain('inputRuns');
    expect(JSON.stringify(experiment)).not.toContain('campaignGeneration":2,"stages"');
    for (const result of experiment.candidates) {
      expect(result.ranking).toBe(P108_UNRANKED_BOUNDARY);
      for (const effective of result.effectiveCampaigns) {
        expect(effective.rankEligibility).toBe('unranked');
        if (result.changes.length > 0 || effective.seedOffset !== 0) {
          expect(effective.campaignFingerprint).not.toBe(baselineFingerprint);
        }
      }
    }
    expect(experiment.candidates[0]!.effectiveCampaigns[0]!.campaignFingerprint)
      .toBe(baselineFingerprint);

    // The experiment retains only identities and aggregates: it deliberately has
    // no input stream or proof/submission constructor that could relabel a changed
    // scenario as the registered generation-2 campaign.
    const source = readFileSync(
      new URL('../src/telemetry/p1-08-tuning-experiment.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\b(?:MaltlineRunProof|encodeMaltlineInputRuns|submitMaltline|competition-client)\b/u);
  });

  it('emits byte-identical full output with canonical/shadow pressure and resource evidence', async () => {
    const first = await runP108TuningExperiment();
    const second = await runP108TuningExperiment();
    const formatted = formatP108TuningExperiment(first);

    expect(formatP108TuningExperiment(second)).toBe(formatted);
    expect(first.identity.revision).toBe(P108_TUNING_REVISION);
    expect(first.experimentFingerprint).toBe('fnv1a64:a56ab6aac3bd00ec');
    expect(createHash('sha256').update(formatted).digest('hex'))
      .toBe('43389a6b719114cd2ac4820c19ec2bdb7e15a19c4fb7afb1299100d8fa9d6d11');
    expect(first.identity.seedOffsets).toHaveLength(33);
    expect(first.identity.controllers.map(({ id }) => id)).toEqual(P108_TUNING_PROFILES.map(({ id }) => id));
    expect(first.identity.limits.workPreflight).toMatchObject({
      effectiveCampaigns: 132,
      campaignRuns: 396,
      maximumStageStartsPlanned: 3_168,
      maximumTicksPerCampaignPlanned: 60_000,
      maximumTicksPlanned: 23_760_000,
    });
    expect(first.identity.analysis.stageAggregation).toMatchObject({
      distributions: { population: 'reached-runs-only', operation: 'min-median-mean-max' },
      totalsAcrossReachedRuns: { population: 'reached-runs-only', operation: 'sum' },
    });

    const expected = [
      ['a-registered-control', 33, 360.775, 31, 369.629, 30, 369.631],
      ['b-stage-5-resource-cadence', 33, 350.017, 31, 358.875, 30, 358.88],
      ['c-stage-7-closing-time-bridge', 33, 360.894, 31, 371.06, 30, 371.018],
      ['d-combined', 33, 350.137, 31, 360.306, 30, 360.267],
    ] as const;
    for (const [index, values] of expected.entries()) {
      const [id, reactiveWins, reactiveSeconds, delayedWins, delayedSeconds, physicalWins, physicalSeconds] = values;
      const result = first.candidates[index]!;
      expect(result.candidateId).toBe(id);
      expect(result.profiles[0]!.overall).toMatchObject({
        runs: 33, wins: reactiveWins, attemptSeconds: { mean: reactiveSeconds },
      });
      expect(result.profiles[1]!.overall).toMatchObject({
        runs: 33, wins: delayedWins, attemptSeconds: { mean: delayedSeconds },
      });
      expect(result.profiles[2]!.overall).toMatchObject({
        runs: 33, wins: physicalWins, attemptSeconds: { mean: physicalSeconds },
      });
      expect(result.profiles.every(({ shadows }) => shadows?.runs === 32)).toBe(true);
      for (const profile of result.profiles) {
        expect(profile.stagePressure).toMatchObject({
          allRuns: { scope: 'all-runs', sourceRunCount: 33 },
          canonical: { scope: 'canonical-run', sourceRunCount: 1 },
          shadowOnly: { scope: 'shadow-runs-only', sourceRunCount: 32 },
        });
        expect(profile.stagePressure.allRuns.stages).toHaveLength(8);
        expect(profile.stagePressure.canonical.stages).toHaveLength(8);
        expect(profile.stagePressure.shadowOnly!.stages).toHaveLength(8);
        expect(profile.resourceUsage.observedMaximumStageTicks)
          .toBeLessThanOrEqual(profile.resourceUsage.configuredMaximumStageTicks);
        expect(profile.resourceUsage.observedMaximumTotalTicks)
          .toBeLessThanOrEqual(profile.resourceUsage.configuredMaximumTotalTicks);
      }
    }

    const controlDelayed = first.candidates[0]!.profiles[1]!;
    const resourceDelayed = first.candidates[1]!.profiles[1]!;
    const bridgeDelayed = first.candidates[2]!.profiles[1]!;
    expect(controlDelayed.stagePressure.allRuns.stages[4]).toMatchObject({
      maxJarsCommitted: { mean: 3 },
      ticksAtZeroJars: { mean: 0 },
      quietPacingRate: { mean: 0.221 },
    });
    expect(resourceDelayed.stagePressure.allRuns.stages[4]).toMatchObject({
      maxJarsCommitted: { mean: 4 },
      ticksAtZeroJars: { mean: 127.97 },
      quietPacingRate: { mean: 0.13 },
      totalsAcrossReachedRuns: { livesLost: 0 },
    });
    expect(bridgeDelayed.stagePressure.allRuns.stages[6]).toMatchObject({
      maxLiveCustomers: { mean: 4.545 },
      maxOpenDemand: { mean: 2.788 },
      multiOrderRate: { mean: 0.141 },
      crossLaneOrderReturnConflictRate: { mean: 0.254 },
      totalsAcrossReachedRuns: { livesLost: 0, repeatServiceActions: 3 },
    });
    const canonicalBridgeStage = bridgeDelayed.stagePressure.canonical.stages[6]!;
    const shadowBridgeStage = bridgeDelayed.stagePressure.shadowOnly!.stages[6]!;
    expect(canonicalBridgeStage.maxLiveCustomers).toMatchObject({ min: 4, median: 4, mean: 4, max: 4 });
    expect(shadowBridgeStage.maxLiveCustomers).toMatchObject({ mean: 4.563 });
    expect(canonicalBridgeStage.totalsAcrossReachedRuns.repeatServiceActions).toBe(0);
    expect(shadowBridgeStage.totalsAcrossReachedRuns.repeatServiceActions).toBe(3);
  }, 30_000);
});

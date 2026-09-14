import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../src/core/types';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
  getMaltlineAuthorityConfiguration,
} from '../src/core/authority';
import { canonicalJson, sha256Canonical, type CanonicalValue } from '../src/core/fingerprint';
import {
  P102_STAGE8_RELIEF_LIMITS,
  P102_STAGE8_RELIEF_POLICY,
  assertP102Stage8ReliefAuthorityForTesting,
  formatP102Stage8ReliefArtifact,
  pairP102Stage8RecoveryEventsForTesting,
  runP102Stage8ReliefExperiment,
  runP102Stage8ReliefExperimentWithLimitsForTesting,
  type P102Stage8ReliefArtifact,
} from '../src/experiments/p1-02-stage8-relief-experiment';
import {
  P102_REVIEWED_PAYLOAD_BYTES,
  P102_REVIEWED_PAYLOAD_SHA256,
  P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES,
  createP102Stage8ReliefEnvelope,
  formatP102Stage8ReliefEnvelope,
  getP102Stage8ReliefProducerIdentityForTesting,
  parseP102Stage8ReliefEnvelopeJson,
  verifyP102Stage8ReliefEnvelope,
  type P102Stage8ReliefProducerIdentity,
  type P102Stage8ReliefEnvelope,
} from '../tools/p1-02-stage8-relief-envelope';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const temporaryRoots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fixtureRepository(root: string, kernelExtra = ''): Promise<void> {
  const files = new Map<string, string>([
    ['games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts',
      `import '../core/engine';\nimport '../viewer/viewer-input-adapter';\n${kernelExtra}export const kernel = 1;\n`],
    ['games/maltline/src/core/engine.ts', 'export const engine = 1;\n'],
    ['games/maltline/src/core/proof.ts', 'export const proof = 1;\n'],
    ['games/maltline/src/viewer/viewer-input-adapter.ts', 'export const adapter = 1;\n'],
    ['games/maltline/tools/p1-02-stage8-relief-experiment.ts',
      "import './p1-02-stage8-relief-envelope';\nimport '../src/experiments/p1-02-stage8-relief-experiment';\n"],
    ['games/maltline/tools/p1-02-stage8-relief-envelope.ts', [
      "import 'node:crypto';", "import 'node:fs/promises';", "import 'node:path';", "import 'node:url';",
      "import 'tsx/package.json';", "import 'typescript/package.json';",
      "import 'typescript/unstable/ast';", "import 'typescript/unstable/sync';",
      'export const envelope = 1;', '',
    ].join('\n')],
    ['games/maltline/package.json', JSON.stringify({
      name: '@arcadebench/maltline', version: '0.1.0', imports: { '#local': './src/core/proof.ts' },
    })],
    ['games/maltline/tsconfig.json', JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: { baseUrl: '.', paths: { '@local/proof': ['./src/core/proof.ts'] } },
      include: ['src', 'tools'],
    })],
    ['tsconfig.base.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext' } })],
    ['package-lock.json', JSON.stringify({ packages: {
      'node_modules/typescript': { version: '7.0.2' }, 'node_modules/tsx': { version: '4.23.12' },
    } })],
    ['.node-version', '22.19.0\n'],
  ]);
  for (const [path, contents] of files) {
    const absolute = resolve(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
}

const LEGACY_P102_PRODUCER = {
  build: {
    sha256: 'effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24',
    toolchain: { node: '22.19.0', tsx: '4.23.12', typescript: '7.0.2' },
  },
  graphPolicy: {
    intentionalViewerDependency: 'games/maltline/src/viewer/viewer-input-adapter.ts',
    prohibitedClosures: ['proof', 'competition', 'platform', 'human-lab', 'production-root'],
  },
  kernel: {
    fileCount: 19,
    files: [
      'games/maltline/src/core/authority.ts',
      'games/maltline/src/core/campaign-fingerprint.ts',
      'games/maltline/src/core/campaign-source.ts',
      'games/maltline/src/core/engine.ts',
      'games/maltline/src/core/fingerprint.ts',
      'games/maltline/src/core/input.ts',
      'games/maltline/src/core/rng.ts',
      'games/maltline/src/core/rules.ts',
      'games/maltline/src/core/scenario.ts',
      'games/maltline/src/core/types.ts',
      'games/maltline/src/core/version.ts',
      'games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts',
      'games/maltline/src/telemetry/campaign-telemetry.ts',
      'games/maltline/src/telemetry/controller-input.ts',
      'games/maltline/src/telemetry/physical-intent-controller.ts',
      'games/maltline/src/telemetry/player-model-comparison.ts',
      'games/maltline/src/telemetry/player-model-controllers.ts',
      'games/maltline/src/telemetry/reactive-controller.ts',
      'games/maltline/src/viewer/viewer-input-adapter.ts',
    ],
    sha256: 'e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c',
  },
  logicalEntry: 'p1-02-stage8-relief-experiment',
  mode: 'tsx-cli',
  package: '@arcadebench/maltline',
  source: {
    fileCount: 21,
    files: [
      'games/maltline/src/core/authority.ts',
      'games/maltline/src/core/campaign-fingerprint.ts',
      'games/maltline/src/core/campaign-source.ts',
      'games/maltline/src/core/engine.ts',
      'games/maltline/src/core/fingerprint.ts',
      'games/maltline/src/core/input.ts',
      'games/maltline/src/core/rng.ts',
      'games/maltline/src/core/rules.ts',
      'games/maltline/src/core/scenario.ts',
      'games/maltline/src/core/types.ts',
      'games/maltline/src/core/version.ts',
      'games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts',
      'games/maltline/src/telemetry/campaign-telemetry.ts',
      'games/maltline/src/telemetry/controller-input.ts',
      'games/maltline/src/telemetry/physical-intent-controller.ts',
      'games/maltline/src/telemetry/player-model-comparison.ts',
      'games/maltline/src/telemetry/player-model-controllers.ts',
      'games/maltline/src/telemetry/reactive-controller.ts',
      'games/maltline/src/viewer/viewer-input-adapter.ts',
      'games/maltline/tools/p1-02-stage8-relief-envelope.ts',
      'games/maltline/tools/p1-02-stage8-relief-experiment.ts',
    ],
    sha256: '17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7',
  },
  version: '0.1.0',
} as const satisfies P102Stage8ReliefProducerIdentity;

const PRE_P054_P102_PRODUCER = {
  ...LEGACY_P102_PRODUCER,
  build: {
    ...LEGACY_P102_PRODUCER.build,
    sha256: '1b7ab8ba811590bf9ce028717bcf25ffcff5debb00ee1031c119517a922ac863',
  },
  source: {
    ...LEGACY_P102_PRODUCER.source,
    sha256: '9b1f552b7af077b73c147dbba6984a8684f7bb5e7455275bc745a6cdc43c17f1',
  },
} as const satisfies P102Stage8ReliefProducerIdentity;

function envelopeWithProducer(
  source: P102Stage8ReliefEnvelope,
  producer: P102Stage8ReliefProducerIdentity,
): P102Stage8ReliefEnvelope {
  const { integrity: _integrity, ...withoutIntegrity } = structuredClone(source);
  const base = { ...withoutIntegrity, producer };
  return JSON.parse(canonicalJson({
    ...base,
    integrity: { canonicalEnvelopeSha256: sha(canonicalJson(base as unknown as CanonicalValue)) },
  } as unknown as CanonicalValue)) as P102Stage8ReliefEnvelope;
}

function summary(artifact: P102Stage8ReliefArtifact, candidateId: string, profileId: string) {
  return artifact.summaries.find((entry) => entry.candidateId === candidateId && entry.profileId === profileId)!;
}

describe('P1-02 prospective Stage 8 arrival-relief experiment', () => {
  let artifact: P102Stage8ReliefArtifact;
  let envelope: P102Stage8ReliefEnvelope;
  let authorityBefore: string;

  beforeAll(async () => {
    authorityBefore = canonicalJson(getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY));
    artifact = await runP102Stage8ReliefExperiment();
    envelope = await createP102Stage8ReliefEnvelope(artifact);
  }, 60_000);

  it('binds the exact authority, matrix, one-field diff, controllers, caps, and unranked policy', () => {
    expect(artifact.policy).toEqual(P102_STAGE8_RELIEF_POLICY);
    expect(artifact.policy).toMatchObject({
      eligibility: 'unranked', authorityRegistration: null, seasonId: null, rankedProofEmission: 'forbidden',
    });
    expect(artifact.identity).toMatchObject({
      authority: {
        identity: MALTLINE_GENERATION_2_AUTHORITY.identity,
        verifiedConfigurationSha256: MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
      },
      baselineCampaignFingerprint: 'fnv1a64:adc596f1154aeafa',
      limits: {
        candidates: 2, profiles: 4, seedOffsets: 33, campaignRuns: 264,
        stageStarts: 2_112, plannedTicks: 15_840_000,
      },
    });
    const identity = artifact.identity as Record<string, unknown>;
    const candidates = identity.candidates as Array<Record<string, unknown>>;
    expect(candidates[0]).toMatchObject({
      id: 'registered-control', changes: [], canonicalCampaignFingerprint: 'fnv1a64:adc596f1154aeafa',
    });
    expect(candidates[1]).toMatchObject({
      id: 'stage8-arrival-relief-138',
      changes: [{ stageId: 'maltline-08-closing-time', field: 'spawnIntervalTicks', from: 132, to: 138 }],
      canonicalCampaignFingerprint: 'fnv1a64:dda799c718f032f8',
    });
    const baselineScenarios = identity.baselineScenarioFingerprints as Array<{ fingerprint: string }>;
    const reliefScenarios = candidates[1]!.canonicalScenarioFingerprints as Array<{ fingerprint: string }>;
    expect(reliefScenarios.slice(0, 7)).toEqual(baselineScenarios.slice(0, 7));
    expect(reliefScenarios[7]!.fingerprint).toBe('fnv1a64:18e333adbd986e65');
    expect(reliefScenarios[7]!.fingerprint).not.toBe(baselineScenarios[7]!.fingerprint);
    expect((identity.controllers as unknown[])).toHaveLength(4);
    expect((identity.seedOffsets as number[])).toHaveLength(33);
    expect(artifact.runs).toHaveLength(264);
    for (const control of artifact.runs.filter((run) => run.candidateId === 'registered-control')) {
      const relief = artifact.runs.find((run) => run.candidateId === 'stage8-arrival-relief-138'
        && run.profileId === control.profileId && run.seedOffset === control.seedOffset)!;
      expect(relief.sharedPrefix).toEqual(control.sharedPrefix);
      expect(relief.sharedPrefix).not.toBe(control.sharedPrefix);
      expect(relief.sharedPrefixFingerprint).toBe(control.sharedPrefixFingerprint);
      expect(relief.sharedPrefixStagesRun).toBe(control.sharedPrefixStagesRun);
    }
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.identity)).toBe(true);
    expect(Object.isFrozen(artifact.runs[0]!.effectiveScenarioFingerprints)).toBe(true);
    expect(canonicalJson(getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY))).toBe(authorityBefore);
  });

  it('pins the completion, duration, life-loss, and Stage 8 pressure distributions', () => {
    const compact = artifact.summaries.map((entry) => [
      entry.candidateId, entry.profileId, entry.wins,
      Object.values(entry.attemptSeconds), Object.values(entry.remainingLives), Object.values(entry.lossReasons),
      entry.stage8 === null ? null : [
        Object.values(entry.stage8.maxLiveCustomers), Object.values(entry.stage8.maxOpenDemand),
        Object.values(entry.stage8.maxJarsCommitted), entry.stage8.observedLosses,
        entry.stage8.lossesPairedToLaterFirstFulfillment, entry.stage8.fatalRuns, entry.stage8.terminalCascades,
      ],
    ]);
    expect(compact).toEqual([
      ['registered-control', 'reactive-current-state-v1', 33, [360.6, 360.75, 360.775, 361.033], [4, 4, 4, 4], [0, 0, 0], [[3, 3, 3, 3], [1, 1, 1, 1], [5, 5, 5, 5], 0, 0, 0, 0]],
      ['registered-control', 'delayed-competent-v1', 31, [365.117, 368, 369.629, 376.217], [0, 4, 3.515, 4], [14, 0, 2], [[4, 5, 5.242, 7], [2, 4, 3.758, 7], [4, 5, 5.03, 6], 16, 1, 2, 2]],
      ['registered-control', 'delayed-competent-v1-physical-intent-v1', 30, [365.117, 368.233, 369.631, 376.883], [0, 4, 3.394, 4], [14, 0, 6], [[4, 5, 5.212, 7], [2, 4, 3.727, 7], [4, 5, 5.061, 6], 17, 0, 3, 3]],
      ['registered-control', 'novice-error-injection-v1', 0, [49.617, 112.6, 100.312, 175.383], [0, 0, 0, 0], [0, 108, 24], null],
      ['stage8-arrival-relief-138', 'reactive-current-state-v1', 33, [363.6, 363.75, 363.775, 364.033], [4, 4, 4, 4], [0, 0, 0], [[3, 3, 3, 3], [1, 1, 1, 1], [5, 5, 5, 5], 0, 0, 0, 0]],
      ['stage8-arrival-relief-138', 'delayed-competent-v1', 33, [366.483, 370.6, 371.2, 380.35], [1, 4, 3.758, 4], [6, 0, 2], [[3, 5, 4.606, 6], [2, 3, 3.061, 6], [4, 5, 4.909, 5], 8, 0, 0, 0]],
      ['stage8-arrival-relief-138', 'delayed-competent-v1-physical-intent-v1', 33, [367.1, 370.433, 371.298, 380.483], [1, 4, 3.636, 4], [6, 0, 6], [[3, 5, 4.636, 6], [2, 3, 3.121, 6], [4, 5, 4.909, 5], 9, 1, 0, 0]],
      ['stage8-arrival-relief-138', 'novice-error-injection-v1', 0, [49.617, 112.6, 100.312, 175.383], [0, 0, 0, 0], [0, 108, 24], null],
    ]);
  });

  it('records structural recovery latency, inter-loss spacing, and fatal cascades without inventing causality', () => {
    const controlDelayed = summary(artifact, 'registered-control', 'delayed-competent-v1').stage8!;
    const controlPhysical = summary(
      artifact, 'registered-control', 'delayed-competent-v1-physical-intent-v1',
    ).stage8!;
    const reliefDelayed = summary(artifact, 'stage8-arrival-relief-138', 'delayed-competent-v1').stage8!;
    const reliefPhysical = summary(
      artifact, 'stage8-arrival-relief-138', 'delayed-competent-v1-physical-intent-v1',
    ).stage8!;
    expect(controlDelayed).toMatchObject({
      recoveryLatencyTicks: { min: 64, median: 64, mean: 64, max: 64 },
      interLossSpacingTicks: { min: 12, median: 44, mean: 53.667, max: 132 },
      fatalRuns: 2, terminalCascades: 2,
      terminalCascadeLosses: { min: 4, median: 4, mean: 4, max: 4 },
      terminalCascadeSpanTicks: { min: 121, median: 133.5, mean: 133.5, max: 146 },
    });
    expect(controlPhysical).toMatchObject({ fatalRuns: 3, terminalCascades: 3 });
    expect(reliefDelayed).toMatchObject({ fatalRuns: 0, terminalCascades: 0 });
    expect(reliefPhysical).toMatchObject({
      lossesPairedToLaterFirstFulfillment: 1,
      recoveryLatencyTicks: { min: 29, median: 29, mean: 29, max: 29 },
      fatalRuns: 0,
      terminalCascades: 0,
    });
    expect(controlDelayed.ticksAtOneOrFewerJarsRate).toEqual({
      min: 0, median: 0.038, mean: 0.035, max: 0.098498,
    });
    expect(reliefDelayed.ticksAtOneOrFewerJarsRate).toEqual({
      min: 0, median: 0.02, mean: 0.022, max: 0.056257,
    });
    expect(reliefDelayed.ticksAtZeroJarsRate).toEqual({ min: 0, median: 0, mean: 0, max: 0 });
    for (const run of artifact.runs) {
      for (const loss of run.stage8?.losses ?? []) {
        expect(loss.nextFulfillmentLatencyTicks).toBe(
          loss.nextFulfillmentTick === null ? null : loss.nextFulfillmentTick - loss.tick,
        );
      }
    }
  });

  it('pairs first-fulfillment-chain evidence one-to-one using same-tick event ordinals', () => {
    const events: GameEvent[] = [
      { tick: 10, type: 'life_lost', reason: 'walkout', lives: 3 },
      { tick: 10, type: 'life_lost', reason: 'jar_smashed', lives: 2 },
      { tick: 10, type: 'served', customerId: 4, lane: 0, flavor: 'vanilla', exitAfterDrink: true,
        firstFulfillment: true, points: 100 },
    ];
    expect(pairP102Stage8RecoveryEventsForTesting(events)).toEqual([
      { tick: 10, campaignTick: 10, eventOrdinal: 0, reason: 'walkout', lives: 3,
        nextFulfillmentTick: 10, nextFulfillmentEventOrdinal: 2, nextFulfillmentLatencyTicks: 0 },
      { tick: 10, campaignTick: 10, eventOrdinal: 1, reason: 'jar_smashed', lives: 2,
        nextFulfillmentTick: null, nextFulfillmentEventOrdinal: null, nextFulfillmentLatencyTicks: null },
    ]);
    expect(pairP102Stage8RecoveryEventsForTesting([events[2]!, events[0]!])[0])
      .toMatchObject({ nextFulfillmentTick: null, nextFulfillmentEventOrdinal: null });
    expect(() => pairP102Stage8RecoveryEventsForTesting([
      events[0]!, { ...events[2]!, tick: 11 },
    ])).toThrow(/one tick/u);
  });

  it('pins experiment, result, and work identities', () => {
    expect(formatP102Stage8ReliefArtifact(artifact)).toContain('"experimentId": "p1-02-stage8-arrival-relief-v1"');
    expect(artifact.experimentFingerprint).toBe('fnv1a64:cd875f6472067ad5');
    expect(artifact.resultSha256).toBe('12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034');
    expect(artifact.actualWork).toEqual({
      logicalCampaignOutcomes: 264, executedCampaignPrefixes: 132, reusedCampaignPrefixes: 132,
      stageStarts: 1_006, controllerCreations: 1_006,
      campaignTicks: 2_736_116, controllerCalls: 2_736_116, engineSteps: 2_736_116,
    });

  });

  it('rejects custom/malformed options, authority drift, and cap exhaustion', async () => {
    await expect((runP102Stage8ReliefExperiment as unknown as (value: unknown) => Promise<unknown>)({}))
      .rejects.toThrow(/does not accept custom options/u);
    const getter = vi.fn(() => P102_STAGE8_RELIEF_LIMITS.stageTicks);
    const accessor = {
      campaignTicks: 60_000,
      cumulativeTicks: 15_840_000,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, 'stageTicks', { enumerable: true, get: getter });
    await expect(runP102Stage8ReliefExperimentWithLimitsForTesting(accessor))
      .rejects.toThrow(/data property/u);
    expect(getter).not.toHaveBeenCalled();
    await expect(runP102Stage8ReliefExperimentWithLimitsForTesting({
      stageTicks: 60_001, campaignTicks: 60_000, cumulativeTicks: 15_840_000,
    })).rejects.toThrow(/safe bound/u);
    await expect(runP102Stage8ReliefExperimentWithLimitsForTesting({
      stageTicks: 60_000, campaignTicks: 60_000, cumulativeTicks: 1,
    })).rejects.toThrow(/cumulative tick limit exhausted/u);

    const drifted = {
      ...MALTLINE_GENERATION_2_AUTHORITY,
      identity: { ...MALTLINE_GENERATION_2_AUTHORITY.identity },
      initialRun: { ...MALTLINE_GENERATION_2_AUTHORITY.initialRun },
      campaign: MALTLINE_GENERATION_2_AUTHORITY.campaign.map((scenario, index) => ({
        ...scenario,
        stations: [...scenario.stations],
        ...(index === 7 ? { spawnIntervalTicks: 133 } : {}),
      })),
    };
    await expect(assertP102Stage8ReliefAuthorityForTesting(drifted))
      .rejects.toThrow(/pinned digest|configuration hash|baseline has drifted/u);
  }, 30_000);

  it('strictly verifies the payload, source closure, toolchain, and build recipe', async () => {
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      kind: 'maltline-p102-stage8-relief-offline-artifact',
      rankEligibility: 'unranked',
      authority: { relationship: 'prospective-one-field-derivation' },
      producer: {
        package: '@arcadebench/maltline', mode: 'tsx-cli',
        source: {
          fileCount: 22,
          sha256: '62484262af65a3b7910822575e060342f6a44044434660a63bb19e1bc956d3ca',
        },
        kernel: {
          fileCount: 19,
          sha256: '93b3ab55ed9090449732d3bab996da16875ca3d35895bb6d64c414cb5bb6594d',
        },
        build: {
          sha256: 'c372ffc7ca645fbab1d349195f9fa6ea44180d3a5aca056f83df19da82d7811f',
          toolchain: { node: process.versions.node, typescript: '7.0.2', tsx: '4.23.12' },
        },
      },
      payloadDescriptor: {
        byteLength: P102_REVIEWED_PAYLOAD_BYTES,
        sha256: P102_REVIEWED_PAYLOAD_SHA256,
        experimentFingerprint: artifact.experimentFingerprint,
        resultSha256: artifact.resultSha256,
      },
      payload: artifact,
    });
    expect(envelope.producer.kernel.files).toContain('games/maltline/src/core/engine.ts');
    expect(envelope.producer.kernel.files).toContain('games/maltline/src/viewer/viewer-input-adapter.ts');
    expect(envelope.producer.kernel.files).not.toContain('games/maltline/src/core/proof.ts');
    expect(envelope.producer.kernel.files.some((file) => /competition|human-lab|apps\/platform/u.test(file))).toBe(false);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.producer.kernel.files)).toBe(true);
    expect(envelope.integrity.canonicalEnvelopeSha256)
      .toBe('4c8a1dd00129da6e8f9e61a814cf6d4709327172b8aa01293cfe4023cd5ce97b');
    await expect(verifyP102Stage8ReliefEnvelope(envelope)).resolves.toEqual(envelope);
    await expect(parseP102Stage8ReliefEnvelopeJson(formatP102Stage8ReliefEnvelope(envelope)))
      .resolves.toEqual(envelope);
  }, 30_000);

  it('retains the exact EXP-078 schema-1 envelope as an archival artifact', async () => {
    const legacy = envelopeWithProducer(envelope, LEGACY_P102_PRODUCER);
    const formatted = formatP102Stage8ReliefEnvelope(legacy);
    expect(legacy.schemaVersion).toBe(1);
    expect(legacy.integrity.canonicalEnvelopeSha256)
      .toBe('9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130');
    expect(Buffer.byteLength(formatted)).toBe(533_781);
    expect(sha(formatted)).toBe('442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703');
    await expect(verifyP102Stage8ReliefEnvelope(legacy, { verifyCurrentSource: false }))
      .resolves.toEqual(legacy);
    await expect(parseP102Stage8ReliefEnvelopeJson(formatted, { verifyCurrentSource: false }))
      .resolves.toEqual(legacy);
    await expect(verifyP102Stage8ReliefEnvelope(legacy, { verifyCurrentSource: true }))
      .rejects.toThrow(/does not match current source/u);
  }, 30_000);

  it('retains the exact EXP-084 schema-1 envelope only in explicit archival mode', async () => {
    const archived = envelopeWithProducer(envelope, PRE_P054_P102_PRODUCER);
    const formatted = formatP102Stage8ReliefEnvelope(archived);
    expect(archived.integrity.canonicalEnvelopeSha256)
      .toBe('a388db09f772bf67b0153046f1173e521b4f52ebc02738858a54cb3f0a791569');
    expect(Buffer.byteLength(formatted)).toBe(533_781);
    expect(sha(formatted)).toBe('524595399413e934aa9c3082bc92cb53efc79b7fbb58dc8998c320bfd9d36a2b');
    await expect(verifyP102Stage8ReliefEnvelope(archived, { verifyCurrentSource: false }))
      .resolves.toEqual(archived);
    await expect(verifyP102Stage8ReliefEnvelope(archived)).rejects.toThrow(/current source/u);
  }, 30_000);

  it('rejects payload tampering even when result, descriptor, and envelope digests are recomputed', async () => {
    const tampered = structuredClone(envelope);
    (tampered.payload.runs[0] as unknown as { seconds: number }).seconds += 1;
    const mutablePayload = tampered.payload as unknown as {
      experimentFingerprint: string; resultSha256: string; runs: unknown; summaries: unknown; actualWork: unknown;
    };
    mutablePayload.resultSha256 = await sha256Canonical({
      experimentFingerprint: mutablePayload.experimentFingerprint,
      runs: mutablePayload.runs,
      summaries: mutablePayload.summaries,
      actualWork: mutablePayload.actualWork,
    } as CanonicalValue);
    const payloadJson = canonicalJson(mutablePayload as unknown as CanonicalValue);
    const descriptor = tampered.payloadDescriptor as unknown as {
      resultSha256: string; sha256: string; byteLength: number;
    };
    descriptor.resultSha256 = mutablePayload.resultSha256;
    descriptor.sha256 = sha(payloadJson);
    descriptor.byteLength = Buffer.byteLength(payloadJson);
    const mutableEnvelope = tampered as unknown as {
      integrity: { canonicalEnvelopeSha256: string };
    } & Record<string, unknown>;
    const { integrity: _integrity, ...withoutIntegrity } = mutableEnvelope;
    mutableEnvelope.integrity.canonicalEnvelopeSha256 = sha(canonicalJson(withoutIntegrity as CanonicalValue));
    await expect(verifyP102Stage8ReliefEnvelope(tampered, { verifyCurrentSource: false }))
      .rejects.toThrow(/reviewed fixed/u);
  });

  it('rejects malformed envelopes, accessors, cycles, oversized JSON, and invalid options', async () => {
    await expect(verifyP102Stage8ReliefEnvelope({ ...structuredClone(envelope), extra: true }))
      .rejects.toThrow(/unsupported/u);
    const getter = vi.fn(() => envelope.payload);
    const accessor = Object.defineProperty({ ...structuredClone(envelope) }, 'payload', {
      enumerable: true, get: getter,
    });
    await expect(verifyP102Stage8ReliefEnvelope(accessor)).rejects.toThrow(/data property/u);
    expect(getter).not.toHaveBeenCalled();
    const cycle = structuredClone(envelope) as unknown as Record<string, unknown>;
    cycle.cycle = cycle;
    await expect(verifyP102Stage8ReliefEnvelope(cycle)).rejects.toThrow(/cycles/u);
    await expect(parseP102Stage8ReliefEnvelopeJson('{bad')).rejects.toThrow(/malformed/u);
    await expect(parseP102Stage8ReliefEnvelopeJson(' '.repeat(P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES + 1)))
      .rejects.toThrow(/2 MiB/u);
    const optionGetter = vi.fn(() => false);
    const option = Object.defineProperty({}, 'verifyCurrentSource', { enumerable: true, get: optionGetter });
    await expect(verifyP102Stage8ReliefEnvelope(envelope, option)).rejects.toThrow(/data property/u);
    expect(optionGetter).not.toHaveBeenCalled();
  });

  it('changes provenance for imported source and rejects prohibited transitive boundaries', async () => {
    const first = await temporaryRoot('p102-source-a-');
    const second = await temporaryRoot('p102-source-b-');
    await fixtureRepository(first);
    await fixtureRepository(second);
    const firstIdentity = await getP102Stage8ReliefProducerIdentityForTesting(first);
    expect(await getP102Stage8ReliefProducerIdentityForTesting(second)).toEqual(firstIdentity);
    await writeFile(resolve(second, 'games/maltline/src/core/engine.ts'), 'export const engine = 2;\n');
    const changed = await getP102Stage8ReliefProducerIdentityForTesting(second);
    expect(changed.kernel.sha256).not.toBe(firstIdentity.kernel.sha256);
    expect(changed.source.sha256).not.toBe(firstIdentity.source.sha256);
    expect(changed.build.sha256).not.toBe(firstIdentity.build.sha256);
    const prohibited = await temporaryRoot('p102-source-prohibited-');
    await fixtureRepository(prohibited, "import '../core/proof';\n");
    await expect(getP102Stage8ReliefProducerIdentityForTesting(prohibited))
      .rejects.toThrow(/prohibited production, proof/u);
  }, 30_000);

  it('pins the declared Node runtime and actual TypeScript/tsx packages to the lock', async () => {
    const valid = await temporaryRoot('p102-toolchain-valid-');
    await fixtureRepository(valid);
    await expect(getP102Stage8ReliefProducerIdentityForTesting(valid)).resolves.toMatchObject({
      build: { toolchain: { node: '22.19.0', typescript: '7.0.2', tsx: '4.23.12' } },
    });

    const cases = [
      ['Node', '.node-version', '22.18.0\n', /Node runtime .* does not match declared version/u],
      ['malformed Node declaration', '.node-version', ' 22.19.0 \n', /one exact semantic version/u],
      ['TypeScript', 'package-lock.json', JSON.stringify({ packages: {
        'node_modules/typescript': { version: '7.0.1' }, 'node_modules/tsx': { version: '4.23.12' },
      } }), /TypeScript runtime .* does not match locked version/u],
      ['tsx', 'package-lock.json', JSON.stringify({ packages: {
        'node_modules/typescript': { version: '7.0.2' }, 'node_modules/tsx': { version: '4.23.11' },
      } }), /tsx runtime .* does not match locked version/u],
    ] as const;
    for (const [label, path, contents, error] of cases) {
      const root = await temporaryRoot('p102-toolchain-mismatch-');
      await fixtureRepository(root);
      await writeFile(resolve(root, path), contents);
      await expect(getP102Stage8ReliefProducerIdentityForTesting(root), label).rejects.toThrow(error);
    }

    expect(await readFile(resolve(repositoryRoot, '.node-version'), 'utf8')).toBe('22.19.0\n');
    const workflow = await readFile(resolve(repositoryRoot, '.github/workflows/ci-cd.yml'), 'utf8');
    expect(workflow.match(/node-version-file: \.node-version/gu)).toHaveLength(2);
    expect(workflow).not.toMatch(/node-version:\s*22(?:\s|$)/u);
  }, 30_000);

  it('fails if source or build-input bytes change after the TypeScript snapshot', async () => {
    const changedSource = await temporaryRoot('p102-snapshot-source-');
    await fixtureRepository(changedSource);
    const sourceBarrier = vi.fn(async () => {
      await writeFile(resolve(changedSource, 'games/maltline/src/core/engine.ts'), 'export const engine = 2;\n');
    });
    await expect(getP102Stage8ReliefProducerIdentityForTesting(changedSource, {
      afterTypeScriptSnapshot: sourceBarrier,
    })).rejects.toThrow(/source graph file changed during TypeScript snapshot/u);
    expect(sourceBarrier).toHaveBeenCalledOnce();

    const changedConfig = await temporaryRoot('p102-snapshot-config-');
    await fixtureRepository(changedConfig);
    const configBarrier = vi.fn(async () => {
      await writeFile(resolve(changedConfig, 'games/maltline/tsconfig.json'), JSON.stringify({
        extends: '../../tsconfig.base.json', include: ['src', 'tools'], compilerOptions: { strict: true },
      }));
    });
    await expect(getP102Stage8ReliefProducerIdentityForTesting(changedConfig, {
      afterTypeScriptSnapshot: configBarrier,
    })).rejects.toThrow(/build input changed during TypeScript snapshot: games\/maltline\/tsconfig\.json/u);
    expect(configBarrier).toHaveBeenCalledOnce();
  }, 30_000);

  it('strictly validates the deterministic capture test seam', async () => {
    const root = await temporaryRoot('p102-snapshot-hooks-');
    await fixtureRepository(root);
    await expect(getP102Stage8ReliefProducerIdentityForTesting(root, { extra: true } as never))
      .rejects.toThrow(/unsupported fields/u);
    const getter = vi.fn(() => undefined);
    const accessor = Object.defineProperty({}, 'afterTypeScriptSnapshot', { enumerable: true, get: getter });
    await expect(getP102Stage8ReliefProducerIdentityForTesting(root, accessor as never))
      .rejects.toThrow(/data property/u);
    expect(getter).not.toHaveBeenCalled();
  }, 30_000);

  it('emits a second byte-identical one-document envelope through the supported npm command', () => {
    const args = [
      'run', '--silent', 'relief:p1-02', '--workspace=@arcadebench/maltline',
    ] as const;
    const output = execFileSync('npm', args, {
      cwd: repositoryRoot, encoding: 'utf8', timeout: 60_000,
    });
    const independent = execFileSync('npm', args, {
      cwd: packageRoot, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, TZ: 'Pacific/Kiritimati' },
    });
    expect(output).toBe(formatP102Stage8ReliefEnvelope(envelope));
    expect(independent).toBe(output);
    expect(output.trimStart().startsWith('{')).toBe(true);
    expect(output.trimEnd().endsWith('}')).toBe(true);
    expect(() => JSON.parse(output)).not.toThrow();
    expect(output).not.toMatch(/^>\s/u);
    expect(Buffer.byteLength(output)).toBe(533_836);
    expect(sha(output)).toBe('8c61f8b95ddf79f2d6d964e01bdfe74335c1e62b23d4e0f4cfe5aa0337875b36');
  }, 60_000);
});

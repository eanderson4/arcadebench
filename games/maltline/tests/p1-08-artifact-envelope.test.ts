import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  P108_TUNING_CANDIDATES,
  P108_TUNING_PROFILES,
  P108_TUNING_REVISION,
  fingerprintP108ExperimentIdentity,
  runP108TuningExperiment,
  type P108TuningExperiment,
} from '../src/telemetry/p1-08-tuning-experiment';
import { canonicalJson, fingerprintCanonical, type CanonicalValue } from '../src/core/fingerprint';
import {
  P108_ARTIFACT_ENVELOPE_MAX_BYTES,
  createP108ArtifactEnvelope,
  formatP108ArtifactEnvelope,
  parseP108ArtifactEnvelopeJson,
  verifyP108ArtifactEnvelope,
  type P108ArtifactEnvelope,
} from '../tools/p1-08-artifact-envelope';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
let quickPayload: P108TuningExperiment;
let currentEnvelope: P108ArtifactEnvelope;
const temporaryRoots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const PRE_P054_P108_PRODUCER = {
  build: {
    sha256: '7bdb64dff75eb0763739cb88a38a68e2e06e5b098919cc132eb48504e17eeb32',
    toolchain: { node: '22.19.0', tsx: '4.23.12', typescript: '7.0.2' },
  },
  kernel: {
    fileCount: 21,
    sha256: 'c3353176aa777e4965b2772dbf7d256baf1e224cb107a5b37709c37105502b54',
  },
  logicalEntry: 'p1-08-tuning-experiment',
  mode: 'tsx-cli',
  package: '@arcadebench/maltline',
  source: {
    fileCount: 23,
    sha256: 'ee01c3858dbfce3b51e703c50c2f71402752ea881098bb6b0b958ee8de59206c',
  },
  version: '0.1.0',
} as const;

beforeAll(async () => {
  quickPayload = await runP108TuningExperiment();
  currentEnvelope = await createP108ArtifactEnvelope(quickPayload);
}, 30_000);

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]));
  }
  return value;
}

function envelopeWithProducer(
  source: P108ArtifactEnvelope,
  producer: typeof PRE_P054_P108_PRODUCER,
): P108ArtifactEnvelope {
  const { integrity: _integrity, ...withoutIntegrity } = structuredClone(source);
  const base = { ...withoutIntegrity, producer };
  return JSON.parse(canonicalJson({
    ...base,
    integrity: {
      canonicalEnvelopeSha256: createHash('sha256')
        .update(canonicalJson(base as unknown as CanonicalValue)).digest('hex'),
    },
  } as unknown as CanonicalValue)) as P108ArtifactEnvelope;
}

async function fixtureRepository(root: string): Promise<void> {
  const files = new Map<string, string>([
    ['games/maltline/src/telemetry/p1-08-tuning-experiment.ts',
      "export { value } from './kernel-dependency';\n"],
    ['games/maltline/src/telemetry/kernel-dependency.ts', 'export const value = 1;\n'],
    ['games/maltline/src/core/proof.ts', 'export const proof = 1;\n'],
    ['games/maltline/tools/p1-08-tuning-experiment.ts',
      "import './p1-08-artifact-envelope';\nexport { value } from '../src/telemetry/p1-08-tuning-experiment';\n"],
    ['games/maltline/tools/p1-08-artifact-envelope.ts', [
      "import 'node:crypto';", "import 'node:fs/promises';", "import 'node:path';", "import 'node:url';",
      "import 'typescript/unstable/ast';", "import 'typescript/unstable/sync';",
      'export const envelope = true;', '',
    ].join('\n')],
    ['games/maltline/package.json', JSON.stringify({ name: '@arcadebench/maltline', version: '0.1.0' })],
    ['games/maltline/tsconfig.json', JSON.stringify({ extends: '../../tsconfig.base.json' })],
    ['tsconfig.base.json', JSON.stringify({ compilerOptions: { strict: true } })],
    ['package-lock.json', JSON.stringify({ packages: {
      'node_modules/typescript': { version: '7.0.2' },
      'node_modules/tsx': { version: '4.23.12' },
    } })],
  ]);
  for (const [relativePath, contents] of files) {
    const path = resolve(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}

describe('P0-37 portable P108 offline artifact envelope', () => {
  it('derives current payload identity and verifies the exact frozen envelope', async () => {
    expect(currentEnvelope).toMatchObject({
      schemaVersion: 1,
      kind: 'maltline-p108-offline-artifact',
      rankEligibility: 'unranked',
      trust: {
        attestation: 'self-attested-offline',
        limitation: expect.stringMatching(/not a signature, ranked proof, or independent attestation/u),
      },
      producer: {
        package: '@arcadebench/maltline',
        version: '0.1.0',
        mode: 'tsx-cli',
        logicalEntry: 'p1-08-tuning-experiment',
        source: {
          fileCount: 24,
          sha256: 'd16ac109cd7f85b233e4915014c1fcfd4f6c9a8b6af549c8a655a314e1e0a8d4',
        },
        kernel: {
          fileCount: 21,
          sha256: '6eda008b5fd3c12ccd970d642dbab0fdc8782e027976dee56354569a99a620ad',
        },
        build: {
          sha256: '8c06bd54f93097d3b3f38a822a48ca2a6ecff27282bf19c55b938309d6130f4a',
          toolchain: { node: process.versions.node, typescript: '7.0.2', tsx: '4.23.12' },
        },
      },
      authority: { relationship: 'derived-unranked' },
      payloadDescriptor: {
        schemaVersion: quickPayload.schemaVersion,
        experimentId: quickPayload.experimentId,
        revision: P108_TUNING_REVISION,
        experimentFingerprint: quickPayload.experimentFingerprint,
      },
      workPreflight: quickPayload.identity.limits.workPreflight,
      payload: quickPayload,
    });
    expect(currentEnvelope.payloadDescriptor.byteLength).toBeGreaterThan(0);
    expect(currentEnvelope.payloadDescriptor.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(currentEnvelope.controllerRegistrySha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.isFrozen(currentEnvelope)).toBe(true);
    expect(Object.isFrozen(currentEnvelope.payload)).toBe(true);
    await expect(verifyP108ArtifactEnvelope(currentEnvelope, { verifyCurrentSource: true }))
      .resolves.toEqual(currentEnvelope);
    const formatted = formatP108ArtifactEnvelope(currentEnvelope);
    expect(currentEnvelope.integrity.canonicalEnvelopeSha256)
      .toBe('c122df879267c69f631cca656bc2504685c9b07f68ae180bb8353e168b64e541');
    expect(Buffer.byteLength(formatted)).toBe(1_899_811);
    expect(createHash('sha256').update(formatted).digest('hex'))
      .toBe('888d409ddf97d3968d6e13788b047cbad8ed7c62eff948a0db22ced14b8b378a');
    expect(formatted.endsWith('\n')).toBe(true);
    expect(JSON.parse(formatted)).toEqual(currentEnvelope);
    await expect(parseP108ArtifactEnvelopeJson(formatted, { verifyCurrentSource: true }))
      .resolves.toEqual(currentEnvelope);
  });

  it('accepts irrelevant object-key order but rejects tampering and structural tricks', async () => {
    await expect(verifyP108ArtifactEnvelope(reverseKeys(currentEnvelope))).resolves.toEqual(currentEnvelope);

    const payloadTamper = structuredClone(currentEnvelope);
    payloadTamper.payload.candidates[0]!.description = 'tampered';
    await expect(verifyP108ArtifactEnvelope(payloadTamper)).rejects.toThrow(/reviewed default|descriptor|fingerprint/u);

    const envelopeTamper = structuredClone(currentEnvelope);
    envelopeTamper.producer.source.sha256 = '0'.repeat(64);
    await expect(verifyP108ArtifactEnvelope(envelopeTamper)).rejects.toThrow(/integrity/u);

    await expect(verifyP108ArtifactEnvelope({ ...structuredClone(currentEnvelope), extra: true }))
      .rejects.toThrow(/unsupported/u);
    const accessor = Object.defineProperty({ ...structuredClone(currentEnvelope) }, 'payload', {
      enumerable: true,
      get: () => quickPayload,
    });
    await expect(verifyP108ArtifactEnvelope(accessor)).rejects.toThrow(/data property/u);
    await expect(verifyP108ArtifactEnvelope(new (class Envelope {})()))
      .rejects.toThrow(/plain object/u);
    const cycle = structuredClone(currentEnvelope) as unknown as Record<string, unknown>;
    cycle.cycle = cycle;
    await expect(verifyP108ArtifactEnvelope(cycle)).rejects.toThrow(/cycles/u);
    const oversized = structuredClone(currentEnvelope);
    oversized.trust.limitation = 'x'.repeat(P108_ARTIFACT_ENVELOPE_MAX_BYTES + 1);
    await expect(verifyP108ArtifactEnvelope(oversized)).rejects.toThrow(/8 MiB/u);
    await expect(verifyP108ArtifactEnvelope(new Array(100_001))).rejects.toThrow(/100000 items/u);
    const sparse = new Array(4);
    sparse[0] = null;
    await expect(verifyP108ArtifactEnvelope(sparse)).rejects.toThrow(/dense/u);
    await expect(parseP108ArtifactEnvelopeJson('{not json')).rejects.toThrow(/malformed/u);
    await expect(parseP108ArtifactEnvelopeJson(' '.repeat(P108_ARTIFACT_ENVELOPE_MAX_BYTES + 1)))
      .rejects.toThrow(/8 MiB/u);
  });

  it('retains the exact pre-P0-54 schema-1 P108 document only in explicit archival mode', async () => {
    const archived = envelopeWithProducer(currentEnvelope, PRE_P054_P108_PRODUCER);
    const formatted = formatP108ArtifactEnvelope(archived);
    expect(archived.integrity.canonicalEnvelopeSha256)
      .toBe('e5f35b8d61c39a8f87402f6d81232cf3b2f749e39526667065842277dc5d8035');
    expect(Buffer.byteLength(formatted)).toBe(1_899_811);
    expect(createHash('sha256').update(formatted).digest('hex'))
      .toBe('a6809d6370c34b40dc9728364fd75bf4bcab37a4f0e39d71c7d530b521ac5c2e');
    await expect(verifyP108ArtifactEnvelope(archived, { verifyCurrentSource: false }))
      .resolves.toEqual(archived);
    await expect(parseP108ArtifactEnvelopeJson(formatted, { verifyCurrentSource: false }))
      .resolves.toEqual(archived);
    await expect(verifyP108ArtifactEnvelope(archived)).rejects.toThrow(/current source/u);
  });

  it('validates verifier options without invoking accessors', async () => {
    await expect(verifyP108ArtifactEnvelope(currentEnvelope, { unexpected: true } as never))
      .rejects.toThrow(/unsupported/u);
    let calls = 0;
    const options = Object.defineProperty({}, 'verifyCurrentSource', {
      enumerable: true,
      get: () => { calls++; return true; },
    });
    await expect(verifyP108ArtifactEnvelope(currentEnvelope, options))
      .rejects.toThrow(/data property/u);
    expect(calls).toBe(0);
  });

  it('rejects caller-injected controller behavior even when its public identity collides', async () => {
    const collidingProfiles = P108_TUNING_PROFILES.map((profile, index) => index === 0
      ? {
          ...profile,
          create: () => () => ({ stationDir: 0 as const, laneDir: 0 as const, blend: false, serve: false }),
        }
      : profile);
    const collision = await runP108TuningExperiment({ profiles: collidingProfiles });
    expect(collision.identity.controllers).toEqual(quickPayload.identity.controllers);
    expect(collision.candidates[0]!.profiles[0]!.canonical).toMatchObject({
      status: 'lost',
      stagesCleared: 0,
    });
    await expect(createP108ArtifactEnvelope(collision)).rejects.toThrow(/reviewed default CLI artifact/u);
  }, 30_000);

  it('rejects controller registry metadata and id drift even with recomputed fingerprints', async () => {
    for (const change of ['metadata', 'id'] as const) {
      const payload = structuredClone(quickPayload);
      const controller = (payload.identity.controllers as unknown as Array<{
        id: string;
        fingerprint: string;
        metadata: CanonicalValue;
      }>)[0]!;
      if (change === 'metadata') controller.metadata = { algorithm: 'reactive-current-state', version: 99 };
      else controller.id = 'reactive-current-state-v99';
      controller.fingerprint = fingerprintCanonical({
        id: controller.id,
        behavior: controller.metadata,
      } as CanonicalValue);
      (payload as unknown as { experimentFingerprint: string }).experimentFingerprint =
        fingerprintP108ExperimentIdentity(payload.identity);
      await expect(createP108ArtifactEnvelope(payload)).rejects.toThrow(/reviewed default registry/u);
    }

    const reordered = structuredClone(quickPayload);
    (reordered.identity.controllers as unknown as Array<unknown>).reverse();
    (reordered as unknown as { experimentFingerprint: string }).experimentFingerprint =
      fingerprintP108ExperimentIdentity(reordered.identity);
    await expect(createP108ArtifactEnvelope(reordered)).rejects.toThrow(/reviewed default registry/u);
  });

  it('rejects a forged nine-candidate identity/result matrix even with reconciled arithmetic', async () => {
    const payload = structuredClone(quickPayload);
    const candidates = payload.identity.candidates as unknown as Array<
      P108TuningExperiment['identity']['candidates'][number]
    >;
    const source = candidates[0]!;
    for (let index = candidates.length; index < 9; index++) {
      candidates.push({ ...structuredClone(source), id: `forged-${index + 1}` });
    }
    const work = payload.identity.limits.workPreflight as unknown as Record<string, number>;
    const effectiveCampaigns = candidates.length * payload.identity.seedOffsets.length;
    const campaignRuns = effectiveCampaigns * payload.identity.controllers.length;
    work.effectiveCampaigns = effectiveCampaigns;
    work.campaignRuns = campaignRuns;
    work.maximumStageStartsPlanned = campaignRuns * work.requiredStages!;
    work.maximumTicksPerCampaignPlanned = Math.min(
      work.requiredStages! * payload.identity.limits.tickLimitPerStage,
      work.maximumCampaignTicks!,
    );
    work.maximumTicksPlanned = campaignRuns * work.maximumTicksPerCampaignPlanned;
    (payload as unknown as { experimentFingerprint: string }).experimentFingerprint =
      fingerprintP108ExperimentIdentity(payload.identity);
    await expect(createP108ArtifactEnvelope(payload)).rejects.toThrow(/reviewed default CLI artifact/u);
  });

  it('is independent of checkout path and mtimes, changes for imported source, and ignores unrelated files', async () => {
    const firstRoot = await temporaryRoot('maltline-p108-a-');
    const secondRoot = await temporaryRoot('maltline-p108-b-');
    await fixtureRepository(firstRoot);
    await fixtureRepository(secondRoot);
    await utimes(resolve(secondRoot, 'games/maltline/src/telemetry/kernel-dependency.ts'),
      new Date(1_000), new Date(2_000));

    const first = await createP108ArtifactEnvelope(quickPayload, { repositoryRoot: firstRoot });
    const originalCwd = process.cwd();
    const originalTimezone = process.env.TZ;
    let second: P108ArtifactEnvelope;
    try {
      process.chdir(tmpdir());
      process.env.TZ = 'Pacific/Auckland';
      second = await createP108ArtifactEnvelope(quickPayload, { repositoryRoot: secondRoot });
    } finally {
      process.chdir(originalCwd);
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
    expect(first.producer).toEqual(second.producer);

    await writeFile(resolve(secondRoot, 'unrelated.txt'), 'not imported\n');
    const unrelated = await createP108ArtifactEnvelope(quickPayload, { repositoryRoot: secondRoot });
    expect(unrelated.producer).toEqual(second.producer);

    await writeFile(resolve(secondRoot, 'games/maltline/src/telemetry/kernel-dependency.ts'),
      'export const value = 2;\n');
    const changed = await createP108ArtifactEnvelope(quickPayload, { repositoryRoot: secondRoot });
    expect(changed.producer.kernel.sha256).not.toBe(second.producer.kernel.sha256);
    expect(changed.producer.source.sha256).not.toBe(second.producer.source.sha256);
    expect(changed.producer.build.sha256).not.toBe(second.producer.build.sha256);
    await expect(verifyP108ArtifactEnvelope(second, {
      repositoryRoot: secondRoot,
      verifyCurrentSource: true,
    })).rejects.toThrow(/current source/u);
  });

  it('changes only the build recipe when build inputs change', async () => {
    const root = await temporaryRoot('maltline-p108-recipe-');
    await fixtureRepository(root);
    const before = await createP108ArtifactEnvelope(quickPayload, { repositoryRoot: root });
    await writeFile(resolve(root, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { strict: true, noUncheckedIndexedAccess: true },
    }));
    const after = await createP108ArtifactEnvelope(quickPayload, { repositoryRoot: root });
    expect(after.producer.source).toEqual(before.producer.source);
    expect(after.producer.kernel).toEqual(before.producer.kernel);
    expect(after.producer.build.sha256).not.toBe(before.producer.build.sha256);
  });

  it('rejects proof.ts from both the P108 producer and kernel closures', async () => {
    const producerRoot = await temporaryRoot('maltline-p108-producer-proof-');
    await fixtureRepository(producerRoot);
    await writeFile(resolve(producerRoot, 'games/maltline/tools/p1-08-tuning-experiment.ts'), [
      "import '../src/core/proof';",
      "import './p1-08-artifact-envelope';",
      "export { value } from '../src/telemetry/p1-08-tuning-experiment';",
      '',
    ].join('\n'));
    await expect(createP108ArtifactEnvelope(quickPayload, { repositoryRoot: producerRoot }))
      .rejects.toThrow(/prohibited production, proof/u);

    const kernelRoot = await temporaryRoot('maltline-p108-kernel-proof-');
    await fixtureRepository(kernelRoot);
    await writeFile(resolve(kernelRoot, 'games/maltline/src/telemetry/p1-08-tuning-experiment.ts'),
      "import '../core/proof';\nexport const value = 1;\n");
    await expect(createP108ArtifactEnvelope(quickPayload, { repositoryRoot: kernelRoot }))
      .rejects.toThrow(/prohibited production, proof/u);
  });

  it('exposes no filesystem, account, timestamp, browser, or source-path details', () => {
    const text = formatP108ArtifactEnvelope(currentEnvelope);
    expect(text).not.toContain(repositoryRoot);
    expect(text).not.toMatch(/\/(?:home|Users)\//u);
    expect(text).not.toMatch(/[A-Za-z]:\\Users\\/u);
    expect(text).not.toMatch(/(?:cwd|hostname|username|userAgent|timestamp|file:\/\/)/u);
    expect(text).not.toMatch(/games\/maltline\/(?:src|tools)\//u);
    expect(text).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  });

  it('emits exactly one parseable envelope from the documented public npm command', () => {
    const output = execFileSync('npm', [
      'run',
      '--silent',
      'tuning:p1-08',
      '--workspace=@arcadebench/maltline',
    ], { cwd: repositoryRoot, encoding: 'utf8',
      maxBuffer: P108_ARTIFACT_ENVELOPE_MAX_BYTES });
    const parsed = JSON.parse(output) as P108ArtifactEnvelope;
    expect(parsed).toMatchObject({
      kind: 'maltline-p108-offline-artifact',
      rankEligibility: 'unranked',
      payloadDescriptor: {
        schemaVersion: 2,
        experimentId: 'EXP-049',
        revision: P108_TUNING_REVISION,
        experimentFingerprint: parsed.payload.experimentFingerprint,
      },
    });
    expect(output.trimEnd().endsWith('}')).toBe(true);
    expect(() => JSON.parse(`${output}{}`)).toThrow();
  }, 30_000);
});

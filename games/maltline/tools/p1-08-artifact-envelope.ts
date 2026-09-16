import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import {
  P108_TUNING_PROFILES,
  P108_TUNING_EXPERIMENT_ID,
  P108_TUNING_EXPERIMENT_SCHEMA_VERSION,
  P108_TUNING_REVISION,
  P108_TUNING_TASK_ID,
  P108_TUNING_WORK_LIMITS,
  fingerprintP108ExperimentIdentity,
  type P108TuningExperiment,
} from '../src/telemetry/p1-08-tuning-experiment';
import { fingerprintCanonical, type CanonicalValue } from '../src/core/fingerprint';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
} from '../src/core/authority';
import { P108_UNRANKED_BOUNDARY } from '../src/experiments/p1-08-candidates';
import {
  collectStaticSourceGraph,
  type StaticSourceGraphPolicy,
} from './static-source-graph';
import { artifactToolchainLockIdentity } from './artifact-toolchain-lock';

export const P108_ARTIFACT_ENVELOPE_KIND = 'maltline-p108-offline-artifact' as const;
export const P108_ARTIFACT_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const P108_ARTIFACT_ENVELOPE_MAX_BYTES = 8 * 1024 * 1024;
export const P108_REVIEWED_DEFAULT_PAYLOAD_SHA256 =
  '59ccec0cc3dabc7ce110d0ed3f0863e6b861a5728758baf1687c0fe7eef8ca36' as const;
export const P108_REVIEWED_DEFAULT_PAYLOAD_BYTE_LENGTH = 781_938 as const;
export const P108_REVIEWED_DEFAULT_EXPERIMENT_FINGERPRINT =
  'fnv1a64:a56ab6aac3bd00ec' as const;

const DEFAULT_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_KERNEL_ENTRY = 'games/maltline/src/telemetry/p1-08-tuning-experiment.ts';
const DEFAULT_PRODUCER_ENTRY = 'games/maltline/tools/p1-08-tuning-experiment.ts';
const DEFAULT_PACKAGE_MANIFEST = 'games/maltline/package.json';
const DEFAULT_TSCONFIG = 'games/maltline/tsconfig.json';
const DEFAULT_ROOT_TSCONFIG = 'tsconfig.base.json';
const DEFAULT_LOCKFILE = 'package-lock.json';
const MAX_CANONICAL_ARRAY_LENGTH = 100_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^fnv1a64:[0-9a-f]{16}$/u;
const PRODUCER_GRAPH_POLICY: StaticSourceGraphPolicy = Object.freeze({
  label: 'P108 producer',
  maximumFiles: 512,
  maximumBytes: 8 * 1024 * 1024,
  externalSpecifiers: Object.freeze([
    'node:crypto', 'node:fs/promises', 'node:path', 'node:url',
    'typescript/unstable/ast', 'typescript/unstable/sync',
  ]),
  allowedViewerFiles: Object.freeze(['games/maltline/src/viewer/viewer-input-adapter.ts']),
  prohibitedPathPrefixes: Object.freeze(['apps/platform/']),
  prohibitedExactFiles: Object.freeze(['games/maltline/src/index.ts']),
  prohibitedFileNames: Object.freeze([
    'proof.ts', 'verifier.ts', 'competition-client.ts', 'competition-controller.ts',
    'competition-panel.ts', 'human-lab.ts', 'human-lab-session.ts',
  ]),
});
const KERNEL_GRAPH_POLICY: StaticSourceGraphPolicy = Object.freeze({
  label: 'P108 kernel',
  maximumFiles: 512,
  maximumBytes: 8 * 1024 * 1024,
  externalSpecifiers: Object.freeze([]),
  allowedViewerFiles: Object.freeze(['games/maltline/src/viewer/viewer-input-adapter.ts']),
  prohibitedPathPrefixes: Object.freeze(['apps/platform/']),
  prohibitedExactFiles: Object.freeze(['games/maltline/src/index.ts']),
  prohibitedFileNames: Object.freeze([
    'proof.ts', 'verifier.ts', 'competition-client.ts', 'competition-controller.ts',
    'competition-panel.ts', 'human-lab.ts', 'human-lab-session.ts',
  ]),
});

export interface P108ArtifactEnvelopeOptions {
  repositoryRoot?: string;
  verifyCurrentSource?: boolean;
}

export interface P108ArtifactEnvelope {
  schemaVersion: typeof P108_ARTIFACT_ENVELOPE_SCHEMA_VERSION;
  kind: typeof P108_ARTIFACT_ENVELOPE_KIND;
  rankEligibility: 'unranked';
  trust: {
    attestation: 'self-attested-offline';
    limitation: string;
  };
  producer: {
    package: string;
    version: string;
    mode: 'tsx-cli';
    logicalEntry: 'p1-08-tuning-experiment';
    source: { sha256: string; fileCount: number };
    kernel: { sha256: string; fileCount: number };
    build: {
      sha256: string;
      toolchain: { node: string; typescript: string; tsx: string };
    };
  };
  authority: {
    gameId: string;
    rulesetVersion: number;
    campaignGeneration: number;
    configurationSha256: string;
    verifiedConfigurationSha256: string;
    relationship: 'derived-unranked';
  };
  controllerRegistrySha256: string;
  workPreflight: Record<string, unknown>;
  payloadDescriptor: {
    schemaVersion: number;
    experimentId: string;
    revision: number;
    experimentFingerprint: string;
    sha256: string;
    byteLength: number;
  };
  payload: P108TuningExperiment;
  integrity: { canonicalEnvelopeSha256: string };
}

type PlainData = null | boolean | number | string | readonly PlainData[]
  | { readonly [key: string]: PlainData };

interface SourceManifestIdentity {
  sha256: string;
  fileCount: number;
}

type ProducerIdentity = P108ArtifactEnvelope['producer'];

function sha256Bytes(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function dataProperty(object: object, key: PropertyKey, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw new Error(`${label} must be an enumerable data property`);
  }
  return descriptor.value;
}

function canonicalSerialize(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
): string {
  if (depth > 64) throw new Error('P108 artifact data exceeds maximum depth 64');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('P108 artifact numbers must be finite');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('P108 artifact contains a non-data value');
  if (ancestors.has(value)) throw new Error('P108 artifact data must not contain cycles');
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error('P108 artifact arrays must be ordinary arrays');
  } else if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('P108 artifact objects must be plain objects');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (!Number.isSafeInteger(value.length) || value.length > MAX_CANONICAL_ARRAY_LENGTH) {
        throw new Error(`P108 artifact arrays may contain at most ${MAX_CANONICAL_ARRAY_LENGTH} items`);
      }
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1) {
        throw new Error('P108 artifact arrays must be dense and contain no extra fields');
      }
      const expected = new Set<PropertyKey>([
        ...Array.from({ length: value.length }, (_unused, index) => String(index)),
        'length',
      ]);
      if (ownKeys.some((key) => !expected.has(key))) {
        throw new Error('P108 artifact arrays must be dense and contain no extra fields');
      }
      return `[${Array.from({ length: value.length }, (_unused, index) => canonicalSerialize(
        dataProperty(value, String(index), `P108 artifact array item ${index}`),
        ancestors,
        depth + 1,
      )).join(',')}]`;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new Error('P108 artifact objects must not contain symbol keys');
    }
    return `{${(keys as string[]).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(
      dataProperty(value, key, `P108 artifact property ${key}`),
      ancestors,
      depth + 1,
    )}`).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value: unknown): string {
  return canonicalSerialize(value, new Set<object>(), 0);
}

function canonicalSha256(value: unknown): string {
  return sha256Bytes(canonicalJson(value));
}

function canonicalByteLength(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
  const expected = new Set(keys);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== 'string' || !expected.has(key))
    || keys.some((key) => !actual.includes(key))) {
    throw new Error(`${label} contains missing or unsupported fields`);
  }
  for (const key of keys) dataProperty(value, key, `${label}.${key}`);
  return value as Record<string, unknown>;
}

function envelopeOptions(value: unknown): Required<Pick<P108ArtifactEnvelopeOptions, 'verifyCurrentSource'>>
  & Pick<P108ArtifactEnvelopeOptions, 'repositoryRoot'> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('P108 artifact envelope options must be a plain object');
  }
  const options = value as Record<string, unknown>;
  const allowed = new Set(['repositoryRoot', 'verifyCurrentSource']);
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new Error('P108 artifact envelope options contain unsupported fields');
    }
    dataProperty(options, key, `P108 artifact envelope options.${String(key)}`);
  }
  if (options.repositoryRoot !== undefined && typeof options.repositoryRoot !== 'string') {
    throw new Error('P108 artifact envelope repositoryRoot must be a string');
  }
  if (options.verifyCurrentSource !== undefined && typeof options.verifyCurrentSource !== 'boolean') {
    throw new Error('P108 artifact envelope verifyCurrentSource must be boolean');
  }
  return {
    repositoryRoot: options.repositoryRoot as string | undefined,
    verifyCurrentSource: options.verifyCurrentSource as boolean | undefined ?? true,
  };
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.trim() !== value) {
    throw new Error(`${label} must be a nonempty trimmed string`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function sha256Value(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function normalizedText(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function assertPortablePublicData(value: unknown, seen = new Set<object>()): void {
  if (typeof value === 'string') {
    if (/\/(?:home|Users)\/|[A-Za-z]:\\Users\\|file:\/\//u.test(value)
      || /games\/maltline\/(?:src|tools)\//u.test(value)
      || (value.includes('@') && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value))
      || /\bMozilla\/5\.0\b/u.test(value)
      || /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/u.test(value)) {
      throw new Error('P108 envelope contains non-portable or private string data');
    }
    return;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'string'
      && /^(?:cwd|hostname|timestamp|user|username|userAgent)$/iu.test(key)) {
      throw new Error('P108 envelope contains a non-portable or private field');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) assertPortablePublicData(descriptor.value, seen);
  }
}

function insideRoot(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function parsedJson(bytes: Buffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(normalizedText(bytes));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

async function producerIdentity(repositoryRoot: string): Promise<ProducerIdentity> {
  const root = await realpath(repositoryRoot);
  const checkedBuildInput = async (relativePath: string): Promise<string> => {
    const file = await realpath(resolve(root, relativePath));
    if (!insideRoot(root, file)) throw new Error('P108 build recipe input escapes the repository');
    return file;
  };
  const [packagePath, tsconfigPath, rootTsconfigPath, lockPath] = await Promise.all([
    checkedBuildInput(DEFAULT_PACKAGE_MANIFEST),
    checkedBuildInput(DEFAULT_TSCONFIG),
    checkedBuildInput(DEFAULT_ROOT_TSCONFIG),
    checkedBuildInput(DEFAULT_LOCKFILE),
  ]);
  const api = new API();
  let source: SourceManifestIdentity;
  let kernel: SourceManifestIdentity;
  try {
    const snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] });
    try {
      const project = snapshot.getProjects().find((candidate) => candidate.configFileName === tsconfigPath);
      if (project === undefined) throw new Error('P108 source graph TypeScript project is unavailable');
      const producerGraph = await collectStaticSourceGraph({
        repositoryRoot: root, entry: DEFAULT_PRODUCER_ENTRY, project, policy: PRODUCER_GRAPH_POLICY,
      });
      const kernelGraph = await collectStaticSourceGraph({
        repositoryRoot: root, entry: DEFAULT_KERNEL_ENTRY, project, policy: KERNEL_GRAPH_POLICY,
      });
      source = Object.freeze({ sha256: producerGraph.sha256, fileCount: producerGraph.fileCount });
      kernel = Object.freeze({ sha256: kernelGraph.sha256, fileCount: kernelGraph.fileCount });
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
  const [packageBytes, tsconfigBytes, rootTsconfigBytes, lockBytes] = await Promise.all([
    readFile(packagePath),
    readFile(tsconfigPath),
    readFile(rootTsconfigPath),
    readFile(lockPath),
  ]);
  const packageManifest = parsedJson(packageBytes, 'Maltline package manifest');
  const lockfile = parsedJson(lockBytes, 'root package lock');
  const toolchainLock = artifactToolchainLockIdentity(lockfile);
  const lockPackages = exactObject(lockfile.packages, Object.keys(lockfile.packages as object),
    'root package lock packages');
  const typescriptPackage = exactObject(lockPackages['node_modules/typescript'],
    Object.keys(lockPackages['node_modules/typescript'] as object), 'TypeScript lock entry');
  const tsxPackage = exactObject(lockPackages['node_modules/tsx'],
    Object.keys(lockPackages['node_modules/tsx'] as object), 'tsx lock entry');
  const packageName = stringValue(packageManifest.name, 'Maltline package name');
  const packageVersion = stringValue(packageManifest.version, 'Maltline package version');
  const toolchain = Object.freeze({
    node: stringValue(process.versions.node, 'Node version'),
    typescript: stringValue(typescriptPackage.version, 'TypeScript version'),
    tsx: stringValue(tsxPackage.version, 'tsx version'),
  });
  const recipe = {
    package: packageName,
    version: packageVersion,
    mode: 'tsx-cli',
    logicalEntry: 'p1-08-tuning-experiment',
    source,
    kernel,
    graphPolicy: {
      producerExternalSpecifiers: PRODUCER_GRAPH_POLICY.externalSpecifiers,
      kernelExternalSpecifiers: KERNEL_GRAPH_POLICY.externalSpecifiers,
      allowedViewerFiles: PRODUCER_GRAPH_POLICY.allowedViewerFiles,
      prohibitedClosures: ['proof', 'competition', 'platform', 'human-lab', 'production-root'],
    },
    toolchain,
    inputs: {
      packageManifestSha256: sha256Bytes(normalizedText(packageBytes)),
      tsconfigSha256: sha256Bytes(normalizedText(tsconfigBytes)),
      rootTsconfigSha256: sha256Bytes(normalizedText(rootTsconfigBytes)),
      toolchainLockSha256: canonicalSha256(toolchainLock),
    },
  } as const;
  return Object.freeze({
    package: packageName,
    version: packageVersion,
    mode: 'tsx-cli',
    logicalEntry: 'p1-08-tuning-experiment',
    source,
    kernel,
    build: Object.freeze({ sha256: canonicalSha256(recipe), toolchain }),
  });
}

function payloadFacts(payloadValue: unknown): {
  payload: P108TuningExperiment;
  authority: Omit<P108ArtifactEnvelope['authority'], 'relationship'>;
  controllers: unknown;
  workPreflight: Record<string, unknown>;
  descriptor: Omit<P108ArtifactEnvelope['payloadDescriptor'], 'sha256' | 'byteLength'>;
} {
  const payload = exactObject(payloadValue,
    ['schemaVersion', 'experimentId', 'taskId', 'rankEligibility', 'identity',
      'experimentFingerprint', 'candidates'], 'P108 payload');
  const schemaVersion = positiveInteger(payload.schemaVersion, 'P108 payload.schemaVersion');
  const experimentId = stringValue(payload.experimentId, 'P108 payload.experimentId');
  if (schemaVersion !== P108_TUNING_EXPERIMENT_SCHEMA_VERSION
    || experimentId !== P108_TUNING_EXPERIMENT_ID
    || payload.taskId !== P108_TUNING_TASK_ID
    || payload.rankEligibility !== 'unranked') {
    throw new Error('P108 payload must be the unranked EXP-049 artifact');
  }
  const experimentFingerprint = stringValue(payload.experimentFingerprint,
    'P108 payload.experimentFingerprint');
  if (!FINGERPRINT.test(experimentFingerprint)) {
    throw new Error('P108 payload.experimentFingerprint is invalid');
  }
  const identity = exactObject(payload.identity,
    ['schemaVersion', 'experimentId', 'taskId', 'revision', 'hypothesis',
      'telemetrySchemaVersion', 'ranking', 'authority', 'game', 'rules',
      'baselineCampaign', 'initialRun', 'seedOffsets', 'controllers', 'limits',
      'analysis', 'candidates'], 'P108 payload.identity');
  const revision = positiveInteger(identity.revision, 'P108 payload.identity.revision');
  if (identity.schemaVersion !== schemaVersion || identity.experimentId !== experimentId
    || identity.taskId !== P108_TUNING_TASK_ID || revision !== P108_TUNING_REVISION) {
    throw new Error('P108 payload identity does not match its descriptor');
  }
  if (canonicalJson(identity.ranking) !== canonicalJson(P108_UNRANKED_BOUNDARY)) {
    throw new Error('P108 payload ranking boundary is unsupported');
  }
  if (fingerprintP108ExperimentIdentity(identity as never) !== experimentFingerprint) {
    throw new Error('P108 payload experiment fingerprint does not match its identity');
  }
  const expectedControllers = P108_TUNING_PROFILES.map((profile) => ({
    id: profile.id,
    fingerprint: fingerprintCanonical({
      id: profile.id,
      behavior: profile.fingerprintData,
    } as CanonicalValue),
    metadata: profile.fingerprintData,
  }));
  if (canonicalJson(identity.controllers) !== canonicalJson(expectedControllers)) {
    throw new Error('P108 payload controllers do not match the reviewed default registry');
  }
  const authority = exactObject(identity.authority, ['identity', 'verifiedConfigurationSha256'],
    'P108 payload.identity.authority');
  const authorityIdentity = exactObject(authority.identity,
    ['gameId', 'rulesetVersion', 'campaignGeneration', 'configurationSha256'],
    'P108 payload.identity.authority.identity');
  const configurationSha256 = sha256Value(authorityIdentity.configurationSha256,
    'P108 authority configuration');
  const verifiedConfigurationSha256 = sha256Value(authority.verifiedConfigurationSha256,
    'P108 verified authority configuration');
  if (configurationSha256 !== verifiedConfigurationSha256) {
    throw new Error('P108 authority configuration digests do not match');
  }
  if (configurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256) {
    throw new Error('P108 payload does not use the current generation-2 configuration');
  }
  if (canonicalJson(authorityIdentity) !== canonicalJson(MALTLINE_GENERATION_2_AUTHORITY.identity)) {
    throw new Error('P108 payload does not use the current generation-2 authority identity');
  }
  const limits = exactObject(identity.limits,
    ['tickLimitPerStage', 'totalTickLimit', 'maximumProofStageTicks',
      'maximumProofTotalTicks', 'workPreflight', 'rankedScenario'], 'P108 payload.identity.limits');
  if (limits.workPreflight === null || typeof limits.workPreflight !== 'object'
    || Array.isArray(limits.workPreflight)) {
    throw new Error('P108 payload work preflight must be an object');
  }
  if (!Array.isArray(identity.candidates) || !Array.isArray(identity.controllers)
    || !Array.isArray(identity.seedOffsets)) {
    throw new Error('P108 payload identity collections must be arrays');
  }
  const checkedMultiply = (left: number, right: number, label: string): number => {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)
      || left < 0 || right < 0 || (right !== 0 && left > Number.MAX_SAFE_INTEGER / right)) {
      throw new Error(`${label} exceeds safe integer range`);
    }
    return left * right;
  };
  const tickLimitPerStage = positiveInteger(limits.tickLimitPerStage,
    'P108 payload tickLimitPerStage');
  const effectiveCampaigns = checkedMultiply(identity.candidates.length,
    identity.seedOffsets.length, 'P108 effective campaign count');
  const campaignRuns = checkedMultiply(effectiveCampaigns, identity.controllers.length,
    'P108 campaign run count');
  const maximumStageStartsPlanned = checkedMultiply(campaignRuns,
    P108_TUNING_WORK_LIMITS.requiredStages, 'P108 stage-start count');
  const maximumTicksPerCampaignPlanned = Math.min(checkedMultiply(
    P108_TUNING_WORK_LIMITS.requiredStages, tickLimitPerStage, 'P108 campaign tick count'),
  P108_TUNING_WORK_LIMITS.maximumCampaignTicks);
  const maximumTicksPlanned = checkedMultiply(campaignRuns,
    maximumTicksPerCampaignPlanned, 'P108 planned tick count');
  const expectedWorkPreflight = {
    ...P108_TUNING_WORK_LIMITS,
    effectiveCampaigns,
    campaignRuns,
    maximumStageStartsPlanned,
    maximumTicksPerCampaignPlanned,
    maximumTicksPlanned,
  };
  if (canonicalJson(limits.workPreflight) !== canonicalJson(expectedWorkPreflight)) {
    throw new Error('P108 payload work preflight is unsupported or does not match its plan');
  }
  return {
    payload: payloadValue as P108TuningExperiment,
    authority: {
      gameId: stringValue(authorityIdentity.gameId, 'P108 authority gameId'),
      rulesetVersion: positiveInteger(authorityIdentity.rulesetVersion, 'P108 authority rulesetVersion'),
      campaignGeneration: positiveInteger(authorityIdentity.campaignGeneration,
        'P108 authority campaignGeneration'),
      configurationSha256,
      verifiedConfigurationSha256,
    },
    controllers: identity.controllers,
    workPreflight: limits.workPreflight as Record<string, unknown>,
    descriptor: { schemaVersion, experimentId, revision, experimentFingerprint },
  };
}

function withoutIntegrity(envelope: Omit<P108ArtifactEnvelope, 'integrity'> | P108ArtifactEnvelope): Omit<P108ArtifactEnvelope, 'integrity'> {
  return {
    schemaVersion: envelope.schemaVersion,
    kind: envelope.kind,
    rankEligibility: envelope.rankEligibility,
    trust: envelope.trust,
    producer: envelope.producer,
    authority: envelope.authority,
    controllerRegistrySha256: envelope.controllerRegistrySha256,
    workPreflight: envelope.workPreflight,
    payloadDescriptor: envelope.payloadDescriptor,
    payload: envelope.payload,
  };
}

function frozenCanonical<T>(value: T): T {
  const clone = JSON.parse(canonicalJson(value)) as T;
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object' || Object.isFrozen(entry)) return;
    for (const value of Object.values(entry)) freeze(value);
    Object.freeze(entry);
  };
  freeze(clone);
  return clone;
}

export async function createP108ArtifactEnvelope(
  payloadValue: P108TuningExperiment,
  options: P108ArtifactEnvelopeOptions = {},
): Promise<P108ArtifactEnvelope> {
  const normalizedOptions = envelopeOptions(options);
  const payloadJson = canonicalJson(payloadValue);
  const payloadByteLength = Buffer.byteLength(payloadJson, 'utf8');
  if (payloadByteLength > P108_ARTIFACT_ENVELOPE_MAX_BYTES) {
    throw new Error('P108 payload exceeds the 8 MiB artifact limit');
  }
  const facts = payloadFacts(payloadValue);
  const payloadSha256 = sha256Bytes(payloadJson);
  if (payloadByteLength !== P108_REVIEWED_DEFAULT_PAYLOAD_BYTE_LENGTH
    || payloadSha256 !== P108_REVIEWED_DEFAULT_PAYLOAD_SHA256
    || facts.descriptor.experimentFingerprint !== P108_REVIEWED_DEFAULT_EXPERIMENT_FINGERPRINT) {
    throw new Error('P108 payload is not the reviewed default CLI artifact');
  }
  const producer = await producerIdentity(normalizedOptions.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
  const envelopeWithoutIntegrity: Omit<P108ArtifactEnvelope, 'integrity'> = {
    schemaVersion: P108_ARTIFACT_ENVELOPE_SCHEMA_VERSION,
    kind: P108_ARTIFACT_ENVELOPE_KIND,
    rankEligibility: 'unranked',
    trust: {
      attestation: 'self-attested-offline',
      limitation: 'Source and input identity only; not a signature, ranked proof, or independent attestation.',
    },
    producer,
    authority: { ...facts.authority, relationship: 'derived-unranked' },
    controllerRegistrySha256: canonicalSha256(facts.controllers),
    workPreflight: facts.workPreflight,
    payloadDescriptor: {
      ...facts.descriptor,
      sha256: payloadSha256,
      byteLength: payloadByteLength,
    },
    payload: facts.payload,
  };
  const envelope = {
    ...envelopeWithoutIntegrity,
    integrity: { canonicalEnvelopeSha256: canonicalSha256(envelopeWithoutIntegrity) },
  };
  assertPortablePublicData(envelope);
  if (canonicalByteLength(envelope) > P108_ARTIFACT_ENVELOPE_MAX_BYTES) {
    throw new Error('P108 envelope exceeds the 8 MiB artifact limit');
  }
  return frozenCanonical(envelope);
}

export async function verifyP108ArtifactEnvelope(
  value: unknown,
  options: P108ArtifactEnvelopeOptions = {},
): Promise<P108ArtifactEnvelope> {
  const normalizedOptions = envelopeOptions(options);
  const canonical = canonicalJson(value);
  if (Buffer.byteLength(canonical, 'utf8') > P108_ARTIFACT_ENVELOPE_MAX_BYTES) {
    throw new Error('P108 envelope exceeds the 8 MiB artifact limit');
  }
  assertPortablePublicData(value);
  const envelope = exactObject(value,
    ['schemaVersion', 'kind', 'rankEligibility', 'trust', 'producer', 'authority', 'controllerRegistrySha256',
      'workPreflight', 'payloadDescriptor', 'payload', 'integrity'], 'P108 envelope');
  if (envelope.schemaVersion !== P108_ARTIFACT_ENVELOPE_SCHEMA_VERSION
    || envelope.kind !== P108_ARTIFACT_ENVELOPE_KIND
    || envelope.rankEligibility !== 'unranked') {
    throw new Error('P108 envelope identity is unsupported');
  }
  const trust = exactObject(envelope.trust, ['attestation', 'limitation'], 'P108 envelope.trust');
  if (trust.attestation !== 'self-attested-offline'
    || trust.limitation !== 'Source and input identity only; not a signature, ranked proof, or independent attestation.') {
    throw new Error('P108 envelope trust statement is unsupported');
  }
  const producer = exactObject(envelope.producer,
    ['package', 'version', 'mode', 'logicalEntry', 'source', 'kernel', 'build'],
    'P108 envelope.producer');
  if (stringValue(producer.package, 'P108 envelope producer package') !== '@arcadebench/maltline') {
    throw new Error('P108 envelope producer package is unsupported');
  }
  stringValue(producer.version, 'P108 envelope producer version');
  if (producer.mode !== 'tsx-cli' || producer.logicalEntry !== 'p1-08-tuning-experiment') {
    throw new Error('P108 envelope producer identity is unsupported');
  }
  for (const key of ['source', 'kernel'] as const) {
    const identity = exactObject(producer[key], ['sha256', 'fileCount'], `P108 envelope.producer.${key}`);
    sha256Value(identity.sha256, `P108 envelope producer ${key} digest`);
    positiveInteger(identity.fileCount, `P108 envelope producer ${key} file count`);
  }
  const build = exactObject(producer.build, ['sha256', 'toolchain'], 'P108 envelope.producer.build');
  sha256Value(build.sha256, 'P108 envelope producer build digest');
  const toolchain = exactObject(build.toolchain, ['node', 'typescript', 'tsx'],
    'P108 envelope.producer.build.toolchain');
  for (const key of ['node', 'typescript', 'tsx'] as const) {
    stringValue(toolchain[key], `P108 envelope toolchain ${key}`);
  }
  const facts = payloadFacts(envelope.payload);
  const reviewedPayloadJson = canonicalJson(facts.payload);
  const reviewedPayloadByteLength = Buffer.byteLength(reviewedPayloadJson, 'utf8');
  const reviewedPayloadSha256 = sha256Bytes(reviewedPayloadJson);
  if (reviewedPayloadByteLength !== P108_REVIEWED_DEFAULT_PAYLOAD_BYTE_LENGTH
    || reviewedPayloadSha256 !== P108_REVIEWED_DEFAULT_PAYLOAD_SHA256
    || facts.descriptor.experimentFingerprint !== P108_REVIEWED_DEFAULT_EXPERIMENT_FINGERPRINT) {
    throw new Error('P108 payload is not the reviewed default CLI artifact');
  }
  const authority = exactObject(envelope.authority,
    ['gameId', 'rulesetVersion', 'campaignGeneration', 'configurationSha256',
      'verifiedConfigurationSha256', 'relationship'], 'P108 envelope.authority');
  if (authority.relationship !== 'derived-unranked'
    || canonicalJson({
      gameId: authority.gameId,
      rulesetVersion: authority.rulesetVersion,
      campaignGeneration: authority.campaignGeneration,
      configurationSha256: authority.configurationSha256,
      verifiedConfigurationSha256: authority.verifiedConfigurationSha256,
    }) !== canonicalJson(facts.authority)) {
    throw new Error('P108 envelope authority does not match its payload');
  }
  const descriptor = exactObject(envelope.payloadDescriptor,
    ['schemaVersion', 'experimentId', 'revision', 'experimentFingerprint', 'sha256', 'byteLength'],
    'P108 envelope.payloadDescriptor');
  const payloadJson = reviewedPayloadJson;
  const payloadByteLength = reviewedPayloadByteLength;
  const expectedDescriptor = {
    ...facts.descriptor,
    sha256: reviewedPayloadSha256,
    byteLength: payloadByteLength,
  };
  if (canonicalJson(descriptor) !== canonicalJson(expectedDescriptor)) {
    throw new Error('P108 envelope payload descriptor does not match its payload');
  }
  if (payloadByteLength > P108_ARTIFACT_ENVELOPE_MAX_BYTES) {
    throw new Error('P108 payload exceeds the 8 MiB artifact limit');
  }
  sha256Value(envelope.controllerRegistrySha256, 'P108 envelope controller registry digest');
  if (envelope.controllerRegistrySha256 !== canonicalSha256(facts.controllers)) {
    throw new Error('P108 envelope controller registry does not match its payload');
  }
  if (canonicalJson(envelope.workPreflight) !== canonicalJson(facts.workPreflight)) {
    throw new Error('P108 envelope work preflight does not match its payload');
  }
  const integrity = exactObject(envelope.integrity, ['canonicalEnvelopeSha256'],
    'P108 envelope.integrity');
  const integritySha256 = sha256Value(integrity.canonicalEnvelopeSha256,
    'P108 envelope integrity digest');
  if (integritySha256 !== canonicalSha256(withoutIntegrity(value as P108ArtifactEnvelope))) {
    throw new Error('P108 envelope integrity digest does not match');
  }
  if (normalizedOptions.verifyCurrentSource) {
    const current = await producerIdentity(normalizedOptions.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
    if (canonicalJson(producer) !== canonicalJson(current)) {
      throw new Error('P108 envelope producer identity does not match current source');
    }
  }
  return frozenCanonical(value as P108ArtifactEnvelope);
}

/** Bounded retained-JSON admission; size is checked before allocating a parsed graph. */
export async function parseP108ArtifactEnvelopeJson(
  json: string,
  options: P108ArtifactEnvelopeOptions = {},
): Promise<P108ArtifactEnvelope> {
  if (typeof json !== 'string') throw new Error('P108 envelope JSON must be a string');
  if (Buffer.byteLength(json, 'utf8') > P108_ARTIFACT_ENVELOPE_MAX_BYTES) {
    throw new Error('P108 envelope JSON exceeds the 8 MiB artifact limit');
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('P108 envelope JSON is malformed');
  }
  return verifyP108ArtifactEnvelope(value, options);
}

export function formatP108ArtifactEnvelope(envelope: P108ArtifactEnvelope): string {
  const formatted = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(formatted, 'utf8') > P108_ARTIFACT_ENVELOPE_MAX_BYTES) {
    throw new Error('P108 formatted envelope exceeds the 8 MiB artifact limit');
  }
  return formatted;
}

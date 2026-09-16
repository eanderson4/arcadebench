import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import tsxPackage from 'tsx/package.json' with { type: 'json' };
import typescriptPackage from 'typescript/package.json' with { type: 'json' };
import { API } from 'typescript/unstable/sync';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
} from '../src/core/authority';
import { canonicalJson, fingerprintCanonical, sha256Canonical, type CanonicalValue } from '../src/core/fingerprint';
import {
  P102_STAGE8_RELIEF_EXPERIMENT_ID,
  P102_STAGE8_RELIEF_LIMITS,
  P102_STAGE8_RELIEF_POLICY,
  P102_STAGE8_RELIEF_REVISION,
  P102_STAGE8_RELIEF_SCHEMA_VERSION,
  type P102Stage8ReliefArtifact,
} from '../src/experiments/p1-02-stage8-relief-experiment';
import {
  assertStaticSourceGraphFiles,
  collectStaticSourceGraph,
  type StaticSourceGraphIdentity,
  type StaticSourceGraphPolicy,
} from './static-source-graph';
import { artifactToolchainLockIdentity } from './artifact-toolchain-lock';

export const P102_STAGE8_RELIEF_ENVELOPE_KIND = 'maltline-p102-stage8-relief-offline-artifact' as const;
export const P102_STAGE8_RELIEF_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES = 2 * 1024 * 1024;

// Replaced after the exact fixed matrix has been inspected.
export const P102_REVIEWED_PAYLOAD_SHA256 =
  '4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a' as const;
export const P102_REVIEWED_PAYLOAD_BYTES = 333_137 as const;
export const P102_REVIEWED_EXPERIMENT_FINGERPRINT = 'fnv1a64:cd875f6472067ad5' as const;
export const P102_REVIEWED_RESULT_SHA256 =
  '12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034' as const;

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const KERNEL_ENTRY = 'games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts';
const PRODUCER_ENTRY = 'games/maltline/tools/p1-02-stage8-relief-experiment.ts';
const PACKAGE_MANIFEST = 'games/maltline/package.json';
const TSCONFIG = 'games/maltline/tsconfig.json';
const ROOT_TSCONFIG = 'tsconfig.base.json';
const LOCKFILE = 'package-lock.json';
const NODE_VERSION_FILE = '.node-version';
const PRODUCER_GRAPH_POLICY: StaticSourceGraphPolicy = Object.freeze({
  label: 'P102 producer',
  maximumFiles: 256,
  maximumBytes: 4 * 1024 * 1024,
  externalSpecifiers: Object.freeze([
  'node:crypto',
  'node:fs/promises',
  'node:path',
  'node:url',
  'tsx/package.json',
  'typescript/package.json',
  'typescript/unstable/ast',
  'typescript/unstable/sync',
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
  label: 'P102 kernel',
  maximumFiles: 256,
  maximumBytes: 4 * 1024 * 1024,
  externalSpecifiers: Object.freeze([]),
  allowedViewerFiles: Object.freeze(['games/maltline/src/viewer/viewer-input-adapter.ts']),
  prohibitedPathPrefixes: Object.freeze(['apps/platform/']),
  prohibitedExactFiles: Object.freeze(['games/maltline/src/index.ts']),
  prohibitedFileNames: Object.freeze([
    'proof.ts', 'verifier.ts', 'competition-client.ts', 'competition-controller.ts',
    'competition-panel.ts', 'human-lab.ts', 'human-lab-session.ts',
  ]),
});
const SHA256 = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^fnv1a64:[0-9a-f]{16}$/u;

export interface P102Stage8ReliefEnvelopeOptions {
  repositoryRoot?: string;
  verifyCurrentSource?: boolean;
}

export interface P102ProducerIdentityCaptureHooksForTesting {
  readonly afterTypeScriptSnapshot?: () => void | Promise<void>;
}

type SourceIdentity = StaticSourceGraphIdentity;

export interface P102Stage8ReliefProducerIdentity {
  readonly package: string;
  readonly version: string;
  readonly mode: 'tsx-cli';
  readonly logicalEntry: 'p1-02-stage8-relief-experiment';
  readonly source: SourceIdentity;
  readonly kernel: SourceIdentity;
  readonly graphPolicy: {
    readonly intentionalViewerDependency: 'games/maltline/src/viewer/viewer-input-adapter.ts';
    readonly prohibitedClosures: readonly ['proof', 'competition', 'platform', 'human-lab', 'production-root'];
  };
  readonly build: {
    readonly sha256: string;
    readonly toolchain: { readonly node: string; readonly typescript: string; readonly tsx: string };
  };
}

export interface P102Stage8ReliefEnvelope {
  readonly schemaVersion: typeof P102_STAGE8_RELIEF_ENVELOPE_SCHEMA_VERSION;
  readonly kind: typeof P102_STAGE8_RELIEF_ENVELOPE_KIND;
  readonly rankEligibility: 'unranked';
  readonly trust: {
    readonly attestation: 'self-attested-offline';
    readonly limitation: string;
  };
  readonly producer: P102Stage8ReliefProducerIdentity;
  readonly authority: {
    readonly configurationSha256: string;
    readonly relationship: 'prospective-one-field-derivation';
  };
  readonly controllerRegistrySha256: string;
  readonly payloadDescriptor: {
    readonly schemaVersion: number;
    readonly experimentId: string;
    readonly revision: number;
    readonly experimentFingerprint: string;
    readonly resultSha256: string;
    readonly sha256: string;
    readonly byteLength: number;
  };
  readonly payload: P102Stage8ReliefArtifact;
  readonly integrity: { readonly canonicalEnvelopeSha256: string };
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  return canonicalJson(value as CanonicalValue);
}

function canonicalSha256(value: unknown): string {
  return sha256Bytes(canonical(value));
}

function dataProperty(object: object, key: PropertyKey, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw new Error(`${label} must be an enumerable data property`);
  }
  return descriptor.value;
}

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object`);
  const actual = Reflect.ownKeys(value);
  const expected = new Set(keys);
  if (actual.some((key) => typeof key !== 'string' || !expected.has(key))
    || keys.some((key) => !actual.includes(key))) throw new Error(`${label} contains missing or unsupported fields`);
  for (const key of keys) dataProperty(value, key, `${label}.${key}`);
  return value as Record<string, unknown>;
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

function shaValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256`);
  return value;
}

function normalizeOptions(value: unknown): Required<Pick<P102Stage8ReliefEnvelopeOptions, 'verifyCurrentSource'>>
  & Pick<P102Stage8ReliefEnvelopeOptions, 'repositoryRoot'> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('P102 envelope options must be a plain object');
  const object = value as Record<string, unknown>;
  const allowed = new Set(['repositoryRoot', 'verifyCurrentSource']);
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new Error('P102 envelope options contain unsupported fields');
    dataProperty(object, key, `P102 envelope options.${String(key)}`);
  }
  if (object.repositoryRoot !== undefined && typeof object.repositoryRoot !== 'string') {
    throw new Error('P102 envelope repositoryRoot must be a string');
  }
  if (object.verifyCurrentSource !== undefined && typeof object.verifyCurrentSource !== 'boolean') {
    throw new Error('P102 envelope verifyCurrentSource must be boolean');
  }
  return {
    repositoryRoot: object.repositoryRoot as string | undefined,
    verifyCurrentSource: object.verifyCurrentSource as boolean | undefined ?? true,
  };
}

function normalizeCaptureHooks(
  value: unknown,
): P102ProducerIdentityCaptureHooksForTesting {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('P102 producer capture hooks must be a plain object');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => key !== 'afterTypeScriptSnapshot')) {
    throw new Error('P102 producer capture hooks contain unsupported fields');
  }
  if (!keys.includes('afterTypeScriptSnapshot')) return Object.freeze({});
  const hook = dataProperty(value, 'afterTypeScriptSnapshot', 'P102 producer capture hooks.afterTypeScriptSnapshot');
  if (hook !== undefined && typeof hook !== 'function') {
    throw new Error('P102 producer capture hook must be a function');
  }
  return Object.freeze({ afterTypeScriptSnapshot: hook as (() => void | Promise<void>) | undefined });
}

function insideRoot(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function normalizedText(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

interface CapturedBuildInput {
  readonly logicalPath: string;
  readonly realPath: string;
  readonly text: string;
}

async function captureBuildInput(root: string, logicalPath: string): Promise<CapturedBuildInput> {
  const realPath = await realpath(resolve(root, logicalPath));
  if (!insideRoot(root, realPath)) throw new Error('P102 build input escapes the repository');
  return Object.freeze({ logicalPath, realPath, text: normalizedText(await readFile(realPath)) });
}

async function assertBuildInputsUnchanged(root: string, inputs: readonly CapturedBuildInput[]): Promise<void> {
  const current = await Promise.all(inputs.map(async (input) => {
    const currentPath = await realpath(resolve(root, input.logicalPath));
    const currentText = normalizedText(await readFile(currentPath));
    return { input, currentPath, currentText };
  }));
  for (const { input, currentPath, currentText } of current) {
    if (currentPath !== input.realPath || currentText !== input.text) {
      throw new Error(`P102 build input changed during TypeScript snapshot: ${input.logicalPath}`);
    }
  }
}

function exactToolchainVersion(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!/^\d+\.\d+\.\d+$/u.test(result)) throw new Error(`${label} must be an exact semantic version`);
  return result;
}

async function producerIdentity(
  repositoryRoot: string,
  hooks: P102ProducerIdentityCaptureHooksForTesting = {},
): Promise<P102Stage8ReliefProducerIdentity> {
  const root = await realpath(repositoryRoot);
  const buildInputs = await Promise.all([
    PACKAGE_MANIFEST, TSCONFIG, ROOT_TSCONFIG, LOCKFILE, NODE_VERSION_FILE,
  ].map((path) => captureBuildInput(root, path)));
  const [packageInput, tsconfigInput, rootTsconfigInput, lockInput, nodeVersionInput] = buildInputs;
  const packageJson = JSON.parse(packageInput!.text) as { name: string; version: string };
  const lock = JSON.parse(lockInput!.text) as { packages: Record<string, { version?: string }> };
  const toolchainLock = artifactToolchainLockIdentity(lock);
  const declaredNode = exactToolchainVersion(nodeVersionInput!.text.trim(), 'declared Node version');
  if (nodeVersionInput!.text !== `${declaredNode}\n`) {
    throw new Error('P102 Node version declaration must contain one exact semantic version and a newline');
  }
  const lockedTypeScript = exactToolchainVersion(
    lock.packages['node_modules/typescript']?.version, 'locked TypeScript version',
  );
  const lockedTsx = exactToolchainVersion(lock.packages['node_modules/tsx']?.version, 'locked tsx version');
  const runtimeTypeScript = exactToolchainVersion(typescriptPackage.version, 'runtime TypeScript version');
  const runtimeTsx = exactToolchainVersion(tsxPackage.version, 'runtime tsx version');
  if (process.versions.node !== declaredNode) {
    throw new Error(`P102 Node runtime ${process.versions.node} does not match declared version ${declaredNode}`);
  }
  if (runtimeTypeScript !== lockedTypeScript) {
    throw new Error(`P102 TypeScript runtime ${runtimeTypeScript} does not match locked version ${lockedTypeScript}`);
  }
  if (runtimeTsx !== lockedTsx) {
    throw new Error(`P102 tsx runtime ${runtimeTsx} does not match locked version ${lockedTsx}`);
  }
  const toolchain = Object.freeze({
    node: declaredNode,
    typescript: runtimeTypeScript,
    tsx: runtimeTsx,
  });
  const tsconfigPath = tsconfigInput!.realPath;
  const normalizedHooks = normalizeCaptureHooks(hooks);
  const afterTypeScriptSnapshot = normalizedHooks.afterTypeScriptSnapshot;
  const api = new API();
  let source: SourceIdentity;
  let kernel: SourceIdentity;
  try {
    const snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] });
    try {
      const project = snapshot.getProjects().find((entry) => entry.configFileName === tsconfigPath);
      if (project === undefined) throw new Error('P102 TypeScript project is unavailable');
      await afterTypeScriptSnapshot?.();
      [source, kernel] = await Promise.all([
        collectStaticSourceGraph({
          repositoryRoot: root, entry: PRODUCER_ENTRY, project, policy: PRODUCER_GRAPH_POLICY,
        }),
        collectStaticSourceGraph({
          repositoryRoot: root, entry: KERNEL_ENTRY, project, policy: KERNEL_GRAPH_POLICY,
        }),
      ]);
      await assertBuildInputsUnchanged(root, buildInputs);
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
  const graphPolicy = Object.freeze({
    intentionalViewerDependency: 'games/maltline/src/viewer/viewer-input-adapter.ts' as const,
    prohibitedClosures: Object.freeze(['proof', 'competition', 'platform', 'human-lab', 'production-root'] as const),
  });
  const recipe = {
    package: packageJson.name, version: packageJson.version, mode: 'tsx-cli',
    logicalEntry: 'p1-02-stage8-relief-experiment', source, kernel, graphPolicy, toolchain,
    inputs: {
      packageManifestSha256: sha256Bytes(packageInput!.text),
      tsconfigSha256: sha256Bytes(tsconfigInput!.text),
      rootTsconfigSha256: sha256Bytes(rootTsconfigInput!.text),
      toolchainLockSha256: canonicalSha256(toolchainLock),
      nodeVersionSha256: sha256Bytes(nodeVersionInput!.text),
    },
  } as const;
  return Object.freeze({
    package: stringValue(packageJson.name, 'Maltline package name'),
    version: stringValue(packageJson.version, 'Maltline package version'),
    mode: 'tsx-cli',
    logicalEntry: 'p1-02-stage8-relief-experiment',
    source,
    kernel,
    graphPolicy,
    build: Object.freeze({ sha256: canonicalSha256(recipe), toolchain }),
  });
}

async function payloadFacts(value: unknown) {
  const payload = exactObject(value, [
    'schemaVersion', 'experimentId', 'experimentRevision', 'taskIds', 'prospective', 'policy',
    'identity', 'experimentFingerprint', 'resultSha256', 'runs', 'summaries', 'actualWork',
  ], 'P102 payload');
  if (payload.schemaVersion !== P102_STAGE8_RELIEF_SCHEMA_VERSION
    || payload.experimentId !== P102_STAGE8_RELIEF_EXPERIMENT_ID
    || payload.experimentRevision !== P102_STAGE8_RELIEF_REVISION || payload.prospective !== true
    || canonical(payload.policy) !== canonical(P102_STAGE8_RELIEF_POLICY)) {
    throw new Error('P102 payload identity or unranked policy is unsupported');
  }
  if (typeof payload.experimentFingerprint !== 'string' || !FINGERPRINT.test(payload.experimentFingerprint)
    || fingerprintCanonical(payload.identity as CanonicalValue) !== payload.experimentFingerprint) {
    throw new Error('P102 payload experiment fingerprint does not match its identity');
  }
  const resultSha256 = shaValue(payload.resultSha256, 'P102 payload resultSha256');
  const recomputedResult = await sha256Canonical({
    experimentFingerprint: payload.experimentFingerprint,
    runs: payload.runs,
    summaries: payload.summaries,
    actualWork: payload.actualWork,
  } as CanonicalValue);
  if (resultSha256 !== recomputedResult) throw new Error('P102 payload result digest does not reconcile');
  const identity = exactObject(payload.identity, [
    'schemaVersion', 'experimentId', 'experimentRevision', 'taskIds', 'prospective', 'policy',
    'authority', 'rulesFingerprint', 'baselineCampaignFingerprint', 'baselineScenarioFingerprints',
    'initialRun', 'candidates', 'controllers', 'seedOffsets', 'limits', 'observations',
  ], 'P102 payload.identity');
  const authority = exactObject(identity.authority, ['identity', 'verifiedConfigurationSha256'],
    'P102 payload.identity.authority');
  if (canonical(authority.identity) !== canonical(MALTLINE_GENERATION_2_AUTHORITY.identity)
    || authority.verifiedConfigurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256) {
    throw new Error('P102 payload authority is not exact generation 2');
  }
  const limits = exactObject(identity.limits, [
    'candidates', 'profiles', 'seedOffsets', 'stages', 'stageTicks', 'campaignTicks', 'campaignRuns',
    'stageStarts', 'cumulativeTicks', 'configuredStageTicks', 'configuredCampaignTicks',
    'configuredCumulativeTicks', 'plannedTicks',
  ], 'P102 payload.identity.limits');
  if (limits.campaignRuns !== P102_STAGE8_RELIEF_LIMITS.campaignRuns
    || limits.plannedTicks !== P102_STAGE8_RELIEF_LIMITS.cumulativeTicks) {
    throw new Error('P102 payload work plan is unsupported');
  }
  const work = exactObject(payload.actualWork, [
    'logicalCampaignOutcomes', 'executedCampaignPrefixes', 'reusedCampaignPrefixes',
    'stageStarts', 'controllerCreations', 'campaignTicks', 'controllerCalls', 'engineSteps',
  ], 'P102 payload.actualWork');
  for (const [key, maximum] of [
    ['logicalCampaignOutcomes', P102_STAGE8_RELIEF_LIMITS.campaignRuns],
    ['executedCampaignPrefixes', P102_STAGE8_RELIEF_LIMITS.campaignRuns],
    ['reusedCampaignPrefixes', P102_STAGE8_RELIEF_LIMITS.campaignRuns],
    ['stageStarts', P102_STAGE8_RELIEF_LIMITS.stageStarts],
    ['controllerCreations', P102_STAGE8_RELIEF_LIMITS.stageStarts],
    ['campaignTicks', P102_STAGE8_RELIEF_LIMITS.cumulativeTicks],
    ['controllerCalls', P102_STAGE8_RELIEF_LIMITS.cumulativeTicks],
    ['engineSteps', P102_STAGE8_RELIEF_LIMITS.cumulativeTicks],
  ] as const) {
    if (!Number.isSafeInteger(work[key]) || (work[key] as number) < 0 || (work[key] as number) > maximum) {
      throw new Error(`P102 payload actualWork.${key} is invalid`);
    }
  }
  if (work.stageStarts !== work.controllerCreations
    || work.logicalCampaignOutcomes !== P102_STAGE8_RELIEF_LIMITS.campaignRuns
    || (work.executedCampaignPrefixes as number) + (work.reusedCampaignPrefixes as number)
      !== work.logicalCampaignOutcomes
    || work.campaignTicks !== work.controllerCalls || work.campaignTicks !== work.engineSteps) {
    throw new Error('P102 payload actual work ledger does not reconcile');
  }
  return { payload: value as P102Stage8ReliefArtifact,
    experimentFingerprint: payload.experimentFingerprint as string, resultSha256, controllers: identity.controllers };
}

function frozenCanonical<T>(value: T): T {
  const clone = JSON.parse(canonical(value)) as T;
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object' || Object.isFrozen(entry)) return;
    for (const child of Object.values(entry)) freeze(child);
    Object.freeze(entry);
  };
  freeze(clone);
  return clone;
}

function withoutIntegrity(value: P102Stage8ReliefEnvelope): Omit<P102Stage8ReliefEnvelope, 'integrity'> {
  const { integrity: _integrity, ...rest } = value;
  return rest;
}

function validatedSourceIdentity(value: unknown, label: string): SourceIdentity {
  const identity = exactObject(value, ['sha256', 'fileCount', 'files'], label);
  const sha256 = shaValue(identity.sha256, `${label}.sha256`);
  const fileCount = positiveInteger(identity.fileCount, `${label}.fileCount`);
  if (!Array.isArray(identity.files) || identity.files.length !== fileCount) {
    throw new Error(`${label}.files must match fileCount`);
  }
  const files = identity.files.map((file, index) => stringValue(file, `${label}.files[${index}]`));
  if (new Set(files).size !== files.length || [...files].sort((left, right) => left.localeCompare(right, 'en'))
    .some((file, index) => file !== files[index])) {
    throw new Error(`${label}.files must be unique and sorted`);
  }
  assertStaticSourceGraphFiles(files, PRODUCER_GRAPH_POLICY);
  return { sha256, fileCount, files };
}

function validatedProducer(value: unknown): P102Stage8ReliefProducerIdentity {
  const producer = exactObject(value,
    ['package', 'version', 'mode', 'logicalEntry', 'source', 'kernel', 'graphPolicy', 'build'],
    'P102 envelope.producer');
  if (producer.package !== '@arcadebench/maltline' || producer.mode !== 'tsx-cli'
    || producer.logicalEntry !== 'p1-02-stage8-relief-experiment') {
    throw new Error('P102 envelope producer identity is unsupported');
  }
  stringValue(producer.version, 'P102 envelope producer version');
  const source = validatedSourceIdentity(producer.source, 'P102 envelope.producer.source');
  const kernel = validatedSourceIdentity(producer.kernel, 'P102 envelope.producer.kernel');
  if (!source.files.includes(PRODUCER_ENTRY) || !source.files.includes(
    'games/maltline/tools/p1-02-stage8-relief-envelope.ts')
    || !kernel.files.includes(KERNEL_ENTRY)
    || kernel.files.some((file) => !source.files.includes(file))) {
    throw new Error('P102 envelope source closure is incomplete');
  }
  const graphPolicy = exactObject(producer.graphPolicy,
    ['intentionalViewerDependency', 'prohibitedClosures'], 'P102 envelope.producer.graphPolicy');
  const expectedGraphPolicy = {
    intentionalViewerDependency: 'games/maltline/src/viewer/viewer-input-adapter.ts',
    prohibitedClosures: ['proof', 'competition', 'platform', 'human-lab', 'production-root'],
  };
  if (canonical(graphPolicy) !== canonical(expectedGraphPolicy)) {
    throw new Error('P102 envelope source-graph policy is unsupported');
  }
  const build = exactObject(producer.build, ['sha256', 'toolchain'], 'P102 envelope.producer.build');
  shaValue(build.sha256, 'P102 envelope.producer.build.sha256');
  const toolchain = exactObject(build.toolchain, ['node', 'typescript', 'tsx'],
    'P102 envelope.producer.build.toolchain');
  for (const key of ['node', 'typescript', 'tsx'] as const) stringValue(toolchain[key], `P102 toolchain.${key}`);
  return value as P102Stage8ReliefProducerIdentity;
}

function assertReviewedPayload(json: string, facts: Awaited<ReturnType<typeof payloadFacts>>): void {
  if (Buffer.byteLength(json) !== P102_REVIEWED_PAYLOAD_BYTES || sha256Bytes(json) !== P102_REVIEWED_PAYLOAD_SHA256
    || facts.experimentFingerprint !== P102_REVIEWED_EXPERIMENT_FINGERPRINT
    || facts.resultSha256 !== P102_REVIEWED_RESULT_SHA256) {
    throw new Error('P102 payload is not the reviewed fixed Stage 8 relief artifact');
  }
}

export async function createP102Stage8ReliefEnvelope(
  value: P102Stage8ReliefArtifact,
  optionsValue: P102Stage8ReliefEnvelopeOptions = {},
): Promise<P102Stage8ReliefEnvelope> {
  const normalizedOptions = normalizeOptions(optionsValue);
  const json = canonical(value);
  if (Buffer.byteLength(json) > P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES) throw new Error('P102 payload exceeds 2 MiB');
  const facts = await payloadFacts(value);
  assertReviewedPayload(json, facts);
  const producer = await producerIdentity(normalizedOptions.repositoryRoot ?? REPOSITORY_ROOT);
  const descriptor = {
    schemaVersion: P102_STAGE8_RELIEF_SCHEMA_VERSION, experimentId: P102_STAGE8_RELIEF_EXPERIMENT_ID,
    revision: P102_STAGE8_RELIEF_REVISION, experimentFingerprint: facts.experimentFingerprint,
    resultSha256: facts.resultSha256, sha256: sha256Bytes(json), byteLength: Buffer.byteLength(json),
  };
  const base = {
    schemaVersion: P102_STAGE8_RELIEF_ENVELOPE_SCHEMA_VERSION,
    kind: P102_STAGE8_RELIEF_ENVELOPE_KIND,
    rankEligibility: 'unranked' as const,
    trust: { attestation: 'self-attested-offline' as const,
      limitation: 'Exact source and input identity; not a signature, ranked proof, human result, or independent attestation.' },
    producer,
    authority: { configurationSha256: MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
      relationship: 'prospective-one-field-derivation' as const },
    controllerRegistrySha256: canonicalSha256(facts.controllers),
    payloadDescriptor: descriptor,
    payload: facts.payload,
  };
  return frozenCanonical({ ...base, integrity: { canonicalEnvelopeSha256: canonicalSha256(base) } });
}

export async function verifyP102Stage8ReliefEnvelope(
  value: unknown,
  optionsValue: P102Stage8ReliefEnvelopeOptions = {},
): Promise<P102Stage8ReliefEnvelope> {
  const normalizedOptions = normalizeOptions(optionsValue);
  const serialized = canonical(value);
  if (Buffer.byteLength(serialized) > P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES) throw new Error('P102 envelope exceeds 2 MiB');
  const envelope = exactObject(value, [
    'schemaVersion', 'kind', 'rankEligibility', 'trust', 'producer', 'authority',
    'controllerRegistrySha256', 'payloadDescriptor', 'payload', 'integrity',
  ], 'P102 envelope');
  if (envelope.schemaVersion !== P102_STAGE8_RELIEF_ENVELOPE_SCHEMA_VERSION
    || envelope.kind !== P102_STAGE8_RELIEF_ENVELOPE_KIND || envelope.rankEligibility !== 'unranked') {
    throw new Error('P102 envelope identity is unsupported');
  }
  const trust = exactObject(envelope.trust, ['attestation', 'limitation'], 'P102 envelope.trust');
  if (trust.attestation !== 'self-attested-offline'
    || trust.limitation !== 'Exact source and input identity; not a signature, ranked proof, human result, or independent attestation.') {
    throw new Error('P102 envelope trust statement is unsupported');
  }
  const facts = await payloadFacts(envelope.payload);
  const payloadJson = canonical(facts.payload);
  assertReviewedPayload(payloadJson, facts);
  const descriptor = exactObject(envelope.payloadDescriptor, [
    'schemaVersion', 'experimentId', 'revision', 'experimentFingerprint', 'resultSha256', 'sha256', 'byteLength',
  ], 'P102 envelope.payloadDescriptor');
  const expectedDescriptor = {
    schemaVersion: P102_STAGE8_RELIEF_SCHEMA_VERSION, experimentId: P102_STAGE8_RELIEF_EXPERIMENT_ID,
    revision: P102_STAGE8_RELIEF_REVISION, experimentFingerprint: facts.experimentFingerprint,
    resultSha256: facts.resultSha256, sha256: sha256Bytes(payloadJson), byteLength: Buffer.byteLength(payloadJson),
  };
  if (canonical(descriptor) !== canonical(expectedDescriptor)) throw new Error('P102 payload descriptor does not reconcile');
  const producer = validatedProducer(envelope.producer);
  const authority = exactObject(envelope.authority, ['configurationSha256', 'relationship'], 'P102 envelope.authority');
  if (authority.configurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256
    || authority.relationship !== 'prospective-one-field-derivation') throw new Error('P102 envelope authority is unsupported');
  shaValue(envelope.controllerRegistrySha256, 'P102 envelope controller registry');
  if (envelope.controllerRegistrySha256 !== canonicalSha256(facts.controllers)) {
    throw new Error('P102 envelope controller registry does not reconcile');
  }
  const integrity = exactObject(envelope.integrity, ['canonicalEnvelopeSha256'], 'P102 envelope.integrity');
  if (shaValue(integrity.canonicalEnvelopeSha256, 'P102 envelope integrity')
    !== canonicalSha256(withoutIntegrity(value as P102Stage8ReliefEnvelope))) {
    throw new Error('P102 envelope integrity does not reconcile');
  }
  if (normalizedOptions.verifyCurrentSource) {
    const current = await producerIdentity(normalizedOptions.repositoryRoot ?? REPOSITORY_ROOT);
    if (canonical(producer) !== canonical(current)) throw new Error('P102 envelope producer does not match current source');
  }
  return frozenCanonical(value as P102Stage8ReliefEnvelope);
}

export async function parseP102Stage8ReliefEnvelopeJson(
  json: string,
  optionsValue: P102Stage8ReliefEnvelopeOptions = {},
): Promise<P102Stage8ReliefEnvelope> {
  if (typeof json !== 'string') throw new Error('P102 envelope JSON must be a string');
  if (Buffer.byteLength(json) > P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES) throw new Error('P102 envelope JSON exceeds 2 MiB');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('P102 envelope JSON is malformed'); }
  return verifyP102Stage8ReliefEnvelope(value, optionsValue);
}

export function formatP102Stage8ReliefEnvelope(value: P102Stage8ReliefEnvelope): string {
  const result = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(result) > P102_STAGE8_RELIEF_ENVELOPE_MAX_BYTES) throw new Error('P102 formatted envelope exceeds 2 MiB');
  return result;
}

export async function getP102Stage8ReliefProducerIdentityForTesting(
  repositoryRoot: string,
  hooks: P102ProducerIdentityCaptureHooksForTesting = {},
): Promise<P102Stage8ReliefProducerIdentity> {
  return producerIdentity(repositoryRoot, hooks);
}

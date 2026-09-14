#!/usr/bin/env node

/**
 * Offline-by-default Maltline audio acquisition/normalization scaffold.
 *
 * Paid execution requires --execute, an exact plan/budget approval, and an API
 * credential supplied only through the environment. The execution core is
 * dependency-injected so every paid-path contract can be tested offline.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  appendFile,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, join, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '../../..');
const STAGING_ROOT = join(REPOSITORY_ROOT, 'artifacts', 'maltline-audio');
const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';
const MODEL_ID = 'eleven_text_to_sound_v2';
const APPROVAL_ENVIRONMENT_KEY = 'MALTLINE_AUDIO_GENERATION_APPROVAL';
const ALLOWED_OUTPUT_FORMATS = new Set(['mp3_44100_128', 'mp3_44100_192']);
const MP3_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);
const MAX_TERMS_AGE_DAYS = 30;
const MAX_APPROVAL_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const MAX_AUDIO_RESPONSE_BYTES = 16 * 1024 * 1024;
export const AUDIO_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_AUDIO_MASTER_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_RUNTIME_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_TOOL_OUTPUT_BYTES = 64 * 1024;
export const AUDIO_TOOL_TIMEOUT_MS = 60_000;
export const MAX_AUDIO_DURATION_DRIFT_SECONDS = 0.1;
export const AUDIO_CREDITS_PER_SECOND = 40;

export const MALTLINE_AUDIO_CUES = Object.freeze([
  'nav_station',
  'nav_lane',
  'blend_loop',
  'blend_completed',
  'shake_launched',
  'served',
  'jar_caught',
  'shake_smashed',
  'jar_smashed',
  'walkout',
  'life_lost',
  'stage_cleared',
  'game_lost',
  'campaign_victory',
  'customer_spawned',
  'jar_returned',
  'no_clean_jar',
  'diner_ambience',
]);
const AUDIO_CUE_SET = new Set(MALTLINE_AUDIO_CUES);

const NODE_FILE_SYSTEM = Object.freeze({
  appendFile,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  unlink,
  writeFile,
});

function usage() {
  return `Usage: node games/maltline/tools/audio-production.mjs --plan <plan.json> [--execute [--resume]]

Default behavior validates the plan and prints its SHA-256 and maximum spend.
Paid generation additionally requires these environment variables:
  ELEVENLABS_API_KEY
  ${APPROVAL_ENVIRONMENT_KEY}={"planSha256":"...","maximumAssets":1,"maximumSeconds":1,"maximumCredits":40,"expiresAt":"..."}

The approval must match the exact plan, cover its asset/seconds/credit totals,
and expire within 24 hours. --resume may only continue an already acquired
source and never repeats a paid request. Outputs stay under the ignored
artifacts/maltline-audio/ directory.`;
}

function fail(message) {
  throw new Error(message);
}

function exactObject(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Reflect.ownKeys(value);
  const allowed = new Set(keys);
  if (actual.length !== keys.length
    || actual.some((key) => typeof key !== 'string' || !allowed.has(key))) {
    fail(`${label} must contain exactly: ${keys.join(', ')}`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value;
}

function exactArray(value, minimum, maximum, label) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${label} must contain ${minimum} through ${maximum} entries`);
  }
  const keys = Reflect.ownKeys(value);
  const expected = new Set(['length', ...Array.from({ length: value.length }, (_unused, index) => String(index))]);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    fail(`${label} must be a dense array without extra properties`);
  }
  return Array.from({ length: value.length }, (_unused, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      fail(`${label}[${index}] must be an enumerable data property`);
    }
    return descriptor.value;
  });
}

function boundedNumber(value, minimum, maximum, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be a finite number from ${minimum} through ${maximum}`);
  }
  return value;
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function dateValue(value, label) {
  if (typeof value !== 'string') fail(`${label} must be an ISO-8601 UTC timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return parsed;
}

function calendarDate(value, label) {
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (parsed === null || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be YYYY-MM-DD`);
  }
  return parsed;
}

function nowDate(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.valueOf())) fail('current time is invalid');
  return date;
}

function serializeCanonical(value, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical audio data numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail('canonical audio data must not contain cycles');
    ancestors.add(value);
    const serialized = `[${value.map((item) => serializeCanonical(item, ancestors)).join(',')}]`;
    ancestors.delete(value);
    return serialized;
  }
  if (typeof value !== 'object') fail('canonical audio data contains an unsupported value');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('canonical audio data objects must use plain prototypes');
  }
  if (ancestors.has(value)) fail('canonical audio data must not contain cycles');
  ancestors.add(value);
  const serialized = `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${serializeCanonical(value[key], ancestors)}`
  )).join(',')}}`;
  ancestors.delete(value);
  return serialized;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalizeAudioPlan(plan) {
  return serializeCanonical(plan);
}

export function hashAudioPlan(plan) {
  return sha256(canonicalizeAudioPlan(plan));
}

export function summarizeAudioPlan(plan) {
  const totalSeconds = plan.assets.reduce((total, asset) => total + asset.durationSeconds, 0);
  const estimatedCredits = plan.assets.reduce(
    (total, asset) => total + Math.ceil(asset.durationSeconds * AUDIO_CREDITS_PER_SECOND),
    0,
  );
  return Object.freeze({
    assets: plan.assets.length,
    totalSeconds,
    estimatedCredits,
  });
}

export function validatePlan(value, options = {}) {
  const plan = exactObject(value, [
    'schemaVersion',
    'provider',
    'modelId',
    'commercialRightsBasis',
    'termsReviewedOn',
    'assets',
  ], 'plan');
  if (plan.schemaVersion !== 1) fail('plan.schemaVersion must be 1');
  if (plan.provider !== 'elevenlabs') fail('plan.provider must be elevenlabs');
  if (plan.modelId !== MODEL_ID) fail(`plan.modelId must be ${MODEL_ID}`);
  if (plan.commercialRightsBasis !== 'paid-subscription') {
    fail('plan.commercialRightsBasis must attest paid-subscription');
  }
  const termsDate = calendarDate(plan.termsReviewedOn, 'plan.termsReviewedOn');
  const current = nowDate(options.now);
  const today = new Date(`${current.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (termsDate > today) fail('plan.termsReviewedOn must not be in the future');
  if (today.valueOf() - termsDate.valueOf() > MAX_TERMS_AGE_DAYS * 86_400_000) {
    fail(`plan.termsReviewedOn must be no more than ${MAX_TERMS_AGE_DAYS} days old`);
  }
  const planAssets = exactArray(plan.assets, 1, 64, 'plan.assets');
  const ids = new Set();
  const assets = planAssets.map((value, index) => {
    const label = `plan.assets[${index}]`;
    const asset = exactObject(value, [
      'id',
      'event',
      'kind',
      'prompt',
      'durationSeconds',
      'loop',
      'promptInfluence',
      'outputFormat',
      'targetLufs',
    ], label);
    if (typeof asset.id !== 'string' || !/^ml_(?:sfx|loop)_[a-z0-9_]+_v\d{3}$/u.test(asset.id)) {
      fail(`${label}.id does not follow the Maltline audio naming convention`);
    }
    if (ids.has(asset.id)) fail(`${label}.id is duplicated`);
    ids.add(asset.id);
    if (!AUDIO_CUE_SET.has(asset.event)) fail(`${label}.event is not a supported Maltline audio cue`);
    if (asset.kind !== 'one-shot' && asset.kind !== 'loop') fail(`${label}.kind is invalid`);
    const expectedPrefix = asset.kind === 'loop' ? 'ml_loop_' : 'ml_sfx_';
    if (!asset.id.startsWith(expectedPrefix)) fail(`${label}.id prefix must agree with kind`);
    if (typeof asset.prompt !== 'string' || asset.prompt.length < 1 || asset.prompt.length > 450) {
      fail(`${label}.prompt must contain 1 through 450 characters`);
    }
    boundedNumber(asset.durationSeconds, 0.5, 30, `${label}.durationSeconds`);
    if (typeof asset.loop !== 'boolean' || asset.loop !== (asset.kind === 'loop')) {
      fail(`${label}.loop must agree with kind`);
    }
    boundedNumber(asset.promptInfluence, 0, 1, `${label}.promptInfluence`);
    if (!ALLOWED_OUTPUT_FORMATS.has(asset.outputFormat)) fail(`${label}.outputFormat is unsupported`);
    boundedNumber(asset.targetLufs, -30, -12, `${label}.targetLufs`);
    return Object.freeze({
      id: asset.id,
      event: asset.event,
      kind: asset.kind,
      prompt: asset.prompt,
      durationSeconds: asset.durationSeconds,
      loop: asset.loop,
      promptInfluence: asset.promptInfluence,
      outputFormat: asset.outputFormat,
      targetLufs: asset.targetLufs,
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    provider: 'elevenlabs',
    modelId: MODEL_ID,
    commercialRightsBasis: 'paid-subscription',
    termsReviewedOn: plan.termsReviewedOn,
    assets: Object.freeze(assets),
  });
}

function validateApproval(value, plan, current) {
  const approval = exactObject(value, [
    'planSha256',
    'maximumAssets',
    'maximumSeconds',
    'maximumCredits',
    'expiresAt',
  ], 'audio generation approval');
  const planSha256 = hashAudioPlan(plan);
  if (approval.planSha256 !== planSha256) fail('audio generation approval does not match the exact plan SHA-256');
  const maximumAssets = boundedInteger(approval.maximumAssets, 1, 64, 'approval.maximumAssets');
  const maximumSeconds = boundedNumber(approval.maximumSeconds, 0.5, 1_920, 'approval.maximumSeconds');
  const maximumCredits = boundedInteger(approval.maximumCredits, 1, 38_400, 'approval.maximumCredits');
  const expiresAt = dateValue(approval.expiresAt, 'approval.expiresAt');
  if (expiresAt <= current) fail('audio generation approval has expired');
  if (expiresAt.valueOf() - current.valueOf() > MAX_APPROVAL_LIFETIME_MS) {
    fail('audio generation approval may not remain valid for more than 24 hours');
  }
  const budget = summarizeAudioPlan(plan);
  if (budget.assets > maximumAssets) fail('audio generation plan exceeds the approved asset ceiling');
  if (budget.totalSeconds > maximumSeconds) fail('audio generation plan exceeds the approved seconds ceiling');
  if (budget.estimatedCredits > maximumCredits) fail('audio generation plan exceeds the approved credit ceiling');
  return Object.freeze({
    planSha256,
    maximumAssets,
    maximumSeconds,
    maximumCredits,
    expiresAt: expiresAt.toISOString(),
  });
}

export function authorizeAudioGeneration(execute, environment, plan, options = {}) {
  if (!execute) return null;
  const rawApproval = environment[APPROVAL_ENVIRONMENT_KEY];
  if (!rawApproval) fail(`paid generation requires ${APPROVAL_ENVIRONMENT_KEY}`);
  let approvalValue;
  try {
    approvalValue = JSON.parse(rawApproval);
  } catch {
    fail(`${APPROVAL_ENVIRONMENT_KEY} must contain valid JSON`);
  }
  const current = nowDate(options.now);
  const approval = validateApproval(approvalValue, plan, current);
  const apiKey = environment.ELEVENLABS_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.length === 0) fail('ELEVENLABS_API_KEY is required in the environment');
  return Object.freeze({ apiKey, approval });
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const maximumOutputBytes = options.maximumOutputBytes ?? MAX_AUDIO_TOOL_OUTPUT_BYTES;
    let outputBytes = 0;
    let settled = false;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      operation();
    };
    const stop = (error) => {
      if (settled) return;
      child.kill('SIGKILL');
      finish(() => rejectPromise(error));
    };
    const collect = (target, chunk) => {
      if (settled) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > maximumOutputBytes) {
        stop(new Error(`${command} output exceeds the ${maximumOutputBytes}-byte limit`));
        return;
      }
      target.push(chunk);
    };
    const abort = () => stop(new Error(`${command} execution timed out`));
    child.stdout.on('data', (chunk) => collect(stdout, chunk));
    child.stderr.on('data', (chunk) => collect(stderr, chunk));
    child.on('error', (error) => finish(() => rejectPromise(error)));
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(() => rejectPromise(new Error(
          `${command} failed with exit code ${code}: ${Buffer.concat(stderr).toString().trim()}`,
        )));
        return;
      }
      finish(() => resolvePromise({
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      }));
    });
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
  });
}

function pathsFor(stagingRoot, asset) {
  const assetDirectory = join(stagingRoot, asset.id);
  return Object.freeze({
    assetDirectory,
    lock: join(assetDirectory, `${asset.id}.lock.json`),
    journal: join(assetDirectory, `${asset.id}.journal.ndjson`),
    source: join(assetDirectory, `${asset.id}.source.mp3`),
    master: join(assetDirectory, `${asset.id}.master.wav`),
    runtime: join(assetDirectory, `${asset.id}.runtime.ogg`),
    manifest: join(assetDirectory, `${asset.id}.provenance.json`),
    workMaster: join(assetDirectory, `${asset.id}.work.master.wav`),
    workRuntime: join(assetDirectory, `${asset.id}.work.runtime.ogg`),
  });
}

async function lstatIfPresent(fileSystem, path) {
  try {
    return await fileSystem.lstat(path);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertPathBeneath(root, path, label) {
  const relation = relative(root, path);
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    fail(`${label} escapes the audio staging root`);
  }
}

function assertLexicalAssetPaths(stagingRoot, paths) {
  if (dirname(paths.assetDirectory) !== stagingRoot) {
    fail('audio asset directory escapes the audio staging root');
  }
  assertPathBeneath(stagingRoot, paths.assetDirectory, 'audio asset directory');
  for (const [name, path] of Object.entries(paths)) {
    if (name === 'assetDirectory') continue;
    if (dirname(path) !== paths.assetDirectory) fail(`audio ${name} path has an unsafe parent`);
    assertPathBeneath(stagingRoot, path, `audio ${name} path`);
  }
}

async function establishStagingRoot(dependencies) {
  const requestedRoot = dependencies.stagingRoot;
  const missing = [];
  let cursor = requestedRoot;
  while (true) {
    const entry = await lstatIfPresent(dependencies.fileSystem, cursor);
    if (entry !== null) {
      if (entry.isSymbolicLink()) fail('audio staging root and its parents must not be symbolic links');
      if (!entry.isDirectory()) fail('audio staging root parent must be a directory');
      if (await dependencies.fileSystem.realpath(cursor) !== cursor) {
        fail('audio staging root parent real path must not change');
      }
      break;
    }
    missing.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) fail('audio staging root has no existing directory ancestor');
    cursor = parent;
  }
  for (const directory of missing.reverse()) {
    const parent = dirname(directory);
    const parentStat = await dependencies.fileSystem.lstat(parent);
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory()
      || await dependencies.fileSystem.realpath(parent) !== parent) {
      fail('audio staging root parent changed or became a symbolic link');
    }
    await dependencies.fileSystem.mkdir(directory);
  }
  const after = await dependencies.fileSystem.lstat(requestedRoot);
  if (after.isSymbolicLink() || !after.isDirectory()) {
    fail('audio staging root must be a real directory, not a symbolic link');
  }
  const resolvedRoot = await dependencies.fileSystem.realpath(requestedRoot);
  if (resolvedRoot !== requestedRoot) fail('audio staging root real path must not change');
  const resolvedStat = await dependencies.fileSystem.lstat(resolvedRoot);
  if (resolvedStat.isSymbolicLink() || !resolvedStat.isDirectory()) {
    fail('audio staging root real path must be a directory');
  }
  return Object.freeze({ ...dependencies, stagingRoot: resolvedRoot });
}

async function assertStagingRootStable(context) {
  const rootStat = await context.fileSystem.lstat(context.stagingRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail('audio staging root changed or became a symbolic link');
  }
  const currentRoot = await context.fileSystem.realpath(context.stagingRoot);
  if (currentRoot !== context.stagingRoot) fail('audio staging root real path changed');
}

async function assertContainedAssetDirectory(context) {
  assertLexicalAssetPaths(context.stagingRoot, context.paths);
  await assertStagingRootStable(context);
  const assetStat = await context.fileSystem.lstat(context.paths.assetDirectory);
  if (assetStat.isSymbolicLink() || !assetStat.isDirectory()) {
    fail(`audio asset directory for ${context.asset.id} must not be a symbolic link`);
  }
  const currentAsset = await context.fileSystem.realpath(context.paths.assetDirectory);
  if (currentAsset !== context.paths.assetDirectory) {
    fail(`audio asset directory for ${context.asset.id} changed real path`);
  }
  assertPathBeneath(context.stagingRoot, currentAsset, `audio asset directory for ${context.asset.id}`);
}

async function assertRegularAssetFile(context, path, label) {
  await assertContainedAssetDirectory(context);
  const entry = await context.fileSystem.lstat(path);
  if (entry.isSymbolicLink() || !entry.isFile()) {
    fail(`${label} for ${context.asset.id} must be a regular file, not a symbolic link or special file`);
  }
  return entry;
}

async function preflightAssetDirectories(plan, dependencies) {
  await assertStagingRootStable(dependencies);
  for (const asset of plan.assets) {
    const paths = pathsFor(dependencies.stagingRoot, asset);
    assertLexicalAssetPaths(dependencies.stagingRoot, paths);
    const existing = await lstatIfPresent(dependencies.fileSystem, paths.assetDirectory);
    if (existing === null) continue;
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      fail(`audio asset directory for ${asset.id} must be a real directory, not a symbolic link`);
    }
    const resolvedAsset = await dependencies.fileSystem.realpath(paths.assetDirectory);
    if (resolvedAsset !== paths.assetDirectory) {
      fail(`audio asset directory for ${asset.id} changed real path`);
    }
    assertPathBeneath(dependencies.stagingRoot, resolvedAsset, `audio asset directory for ${asset.id}`);
  }
}

async function exists(fileSystem, path) {
  try {
    await fileSystem.lstat(path);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function unlinkIfPresent(fileSystem, path) {
  try {
    await fileSystem.unlink(path);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

function requestFor(plan, asset) {
  const body = {
    text: asset.prompt,
    loop: asset.loop,
    duration_seconds: asset.durationSeconds,
    prompt_influence: asset.promptInfluence,
    model_id: plan.modelId,
  };
  const identity = {
    endpoint: ENDPOINT,
    outputFormat: asset.outputFormat,
    body,
  };
  return Object.freeze({ body, identity, sha256: sha256(serializeCanonical(identity)) });
}

function journalRecord(sequence, state, at, details = {}) {
  return { schemaVersion: 1, sequence, state, at, ...details };
}

async function appendJournal(context, state, details = {}) {
  const record = journalRecord(context.records.length + 1, state, context.now().toISOString(), details);
  await assertRegularAssetFile(context, context.paths.journal, 'audio journal');
  await context.fileSystem.appendFile(context.paths.journal, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  context.records.push(record);
  return record;
}

function parseJournal(text, asset, planSha256) {
  const lines = text.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) fail(`audio journal for ${asset.id} is empty`);
  const records = lines.map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      fail(`audio journal for ${asset.id} has invalid JSON at line ${index + 1}`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || record.schemaVersion !== 1 || record.sequence !== index + 1
      || typeof record.state !== 'string' || typeof record.at !== 'string') {
      fail(`audio journal for ${asset.id} is invalid at line ${index + 1}`);
    }
    return record;
  });
  const reserved = records[0];
  if (reserved.state !== 'reserved' || reserved.assetId !== asset.id || reserved.planSha256 !== planSha256) {
    fail(`audio journal for ${asset.id} does not match this plan`);
  }
  return records;
}

function lastRecord(records, state) {
  return [...records].reverse().find((record) => record.state === state);
}

function publicError(error) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return 'unknown error';
}

function mp3MagicIsValid(bytes) {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

async function readBoundedResponse(response, maximumBytes, signal) {
  const contentEncoding = response.headers.get('content-encoding');
  if (contentEncoding !== null && contentEncoding.toLowerCase() !== 'identity') {
    fail(`generation returned unsupported content encoding: ${contentEncoding}`);
  }
  const contentTypeHeader = response.headers.get('content-type');
  const contentType = contentTypeHeader?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
  if (contentType === null || !MP3_CONTENT_TYPES.has(contentType)) {
    fail(`generation returned unexpected content type: ${contentTypeHeader ?? 'missing'}`);
  }
  const rawLength = response.headers.get('content-length');
  let declaredLength = null;
  if (rawLength !== null) {
    if (!/^\d+$/u.test(rawLength)) fail('generation returned an invalid content length');
    declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maximumBytes) {
      fail(`generation response exceeds the ${maximumBytes}-byte limit`);
    }
  }
  if (!response.body) fail('generation returned an empty response body');
  const reader = response.body.getReader();
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      if (signal.aborted) fail('generation request timed out');
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        fail(`generation response exceeds the ${maximumBytes}-byte limit`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  if (declaredLength !== null && received !== declaredLength) {
    fail(`generation response length mismatch: declared ${declaredLength}, received ${received}`);
  }
  const bytes = Buffer.concat(chunks, received);
  if (!mp3MagicIsValid(bytes)) fail('generation response is not a recognizable MP3 file');
  return { bytes, contentType, declaredLength };
}

async function withTimeout(milliseconds, timers, label, operation) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, rejectPromise) => {
    timeoutId = timers.setTimeout(() => {
      controller.abort();
      rejectPromise(new Error(`${label} timed out after ${milliseconds} ms`));
    }, milliseconds);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    timers.clearTimeout(timeoutId);
  }
}

async function runTool(context, command, args, label) {
  const result = await withTimeout(
    context.toolTimeoutMs,
    context.timers,
    label,
    (signal) => context.runner(command, args, {
      signal,
      maximumOutputBytes: context.maximumToolOutputBytes,
    }),
  );
  if (result === null || typeof result !== 'object'
    || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    fail(`${label} returned an invalid process result`);
  }
  const outputBytes = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
  if (outputBytes > context.maximumToolOutputBytes) {
    fail(`${label} output exceeds the ${context.maximumToolOutputBytes}-byte limit`);
  }
  return result;
}

function parseAudioProbe(stdout, label, expectation) {
  let probe;
  try {
    probe = JSON.parse(stdout);
  } catch {
    fail(`${label} probe returned invalid JSON`);
  }
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    fail(`${label} probe returned an invalid object`);
  }
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const audio = streams.length === 1 && streams[0] && typeof streams[0] === 'object'
    ? streams[0]
    : null;
  const duration = Number(probe.format?.duration);
  const sampleRate = Number(audio?.sample_rate);
  const channels = Number(audio?.channels);
  const formatNames = typeof probe.format?.format_name === 'string'
    ? probe.format.format_name.split(',')
    : [];
  if (!audio
    || audio.codec_type !== 'audio'
    || audio.codec_name !== expectation.codec
    || !formatNames.includes(expectation.container)
    || sampleRate !== expectation.sampleRate
    || !expectation.channels.includes(channels)
    || !Number.isFinite(duration)
    || duration < expectation.minimumDuration
    || (expectation.maximumDuration !== undefined && duration > expectation.maximumDuration)) {
    fail(`${label} failed strict decode validation`);
  }
  return Object.freeze({
    container: expectation.container,
    codecName: expectation.codec,
    sampleRate,
    channels,
    durationSeconds: duration,
  });
}

function normalizeRecordedProbe(value, label, expectation) {
  const probe = exactObject(
    value,
    ['container', 'codecName', 'sampleRate', 'channels', 'durationSeconds'],
    label,
  );
  if (probe.container !== expectation.container || probe.codecName !== expectation.codec
    || probe.sampleRate !== expectation.sampleRate || !expectation.channels.includes(probe.channels)
    || typeof probe.durationSeconds !== 'number' || !Number.isFinite(probe.durationSeconds)
    || probe.durationSeconds < expectation.minimumDuration
    || (expectation.maximumDuration !== undefined
      && probe.durationSeconds > expectation.maximumDuration)) {
    fail(`${label} failed strict decode validation`);
  }
  return Object.freeze({
    container: probe.container,
    codecName: probe.codecName,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    durationSeconds: probe.durationSeconds,
  });
}

function durationExpectation(asset) {
  return {
    minimumDuration: Math.max(0.1, asset.durationSeconds - 1),
    maximumDuration: asset.durationSeconds + 1,
  };
}

function sourceProbeExpectation(asset) {
  // The API contract fixes codec/rate/bitrate but does not promise a channel
  // count. Accept ordinary mono or stereo sources; normalization must still
  // prove both product derivatives are mono.
  return { container: 'mp3', codec: 'mp3', sampleRate: 44_100, channels: [1, 2], ...durationExpectation(asset) };
}

function masterProbeExpectation(asset) {
  return { container: 'wav', codec: 'pcm_s24le', sampleRate: 48_000, channels: [1], ...durationExpectation(asset) };
}

function runtimeProbeExpectation(asset) {
  return { container: 'ogg', codec: 'opus', sampleRate: 48_000, channels: [1], ...durationExpectation(asset) };
}

function assertDurationDrift(first, second, label) {
  if (Math.abs(first.durationSeconds - second.durationSeconds) > MAX_AUDIO_DURATION_DRIFT_SECONDS) {
    fail(`${label} duration differs by more than ${MAX_AUDIO_DURATION_DRIFT_SECONDS} seconds`);
  }
}

async function validateSource(context) {
  await assertRegularAssetFile(context, context.paths.source, 'acquired audio source');
  const probe = await runTool(context, 'ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels',
    '-of', 'json',
    context.paths.source,
  ], 'generated source ffprobe');
  await assertRegularAssetFile(context, context.paths.source, 'acquired audio source');
  return parseAudioProbe(probe.stdout, 'generated source', sourceProbeExpectation(context.asset));
}

async function assertBoundedDerivative(context, path, label, maximumBytes) {
  const entry = await assertRegularAssetFile(context, path, label);
  if (!Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > maximumBytes) {
    fail(`${label} for ${context.asset.id} must contain 1 through ${maximumBytes} bytes`);
  }
  return entry.size;
}

async function probeDerivative(context, path, label, maximumBytes, expectation) {
  const bytes = await assertBoundedDerivative(context, path, label, maximumBytes);
  const before = await readBoundedDerivative(context, path, label, maximumBytes, bytes);
  const result = await runTool(context, 'ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels',
    '-of', 'json',
    path,
  ], `${label} ffprobe`);
  const afterBytes = await assertBoundedDerivative(context, path, label, maximumBytes);
  if (afterBytes !== bytes) fail(`${label} for ${context.asset.id} changed while being probed`);
  const after = await readBoundedDerivative(context, path, label, maximumBytes, bytes);
  if (sha256(after) !== sha256(before)) {
    fail(`${label} for ${context.asset.id} changed while being probed`);
  }
  return Object.freeze({
    bytes,
    probe: parseAudioProbe(result.stdout, label, expectation),
  });
}

async function readBoundedDerivative(context, path, label, maximumBytes, expectedBytes) {
  const bytesBefore = await assertBoundedDerivative(context, path, label, maximumBytes);
  if (bytesBefore !== expectedBytes) fail(`${label} for ${context.asset.id} changed after validation`);
  const bytes = await context.fileSystem.readFile(path);
  if (bytes.length !== expectedBytes || bytes.length > maximumBytes) {
    fail(`${label} for ${context.asset.id} changed while being read`);
  }
  const bytesAfter = await assertBoundedDerivative(context, path, label, maximumBytes);
  if (bytesAfter !== expectedBytes) fail(`${label} for ${context.asset.id} changed while being read`);
  return bytes;
}

async function validateDerivativePair(context, sourceProbe, masterPath, runtimePath) {
  const master = await probeDerivative(
    context,
    masterPath,
    'audition master',
    context.maximumMasterBytes,
    masterProbeExpectation(context.asset),
  );
  assertDurationDrift(sourceProbe, master.probe, 'audition master');
  const runtime = await probeDerivative(
    context,
    runtimePath,
    'runtime Ogg',
    context.maximumRuntimeBytes,
    runtimeProbeExpectation(context.asset),
  );
  assertDurationDrift(master.probe, runtime.probe, 'runtime Ogg');
  return Object.freeze({ master, runtime });
}

async function normalizeSource(context, sourceProbe) {
  const { paths, asset } = context;
  const loudnessFilter = `loudnorm=I=${asset.targetLufs}:LRA=7:TP=-1`;
  const masterArgs = [
    '-nostdin', '-v', 'error', '-n', '-i', paths.source,
    '-map_metadata', '-1', '-af', loudnessFilter,
    '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', paths.workMaster,
  ];
  await assertContainedAssetDirectory(context);
  await runTool(context, 'ffmpeg', masterArgs, 'audition master ffmpeg');
  const runtimeArgs = [
    '-nostdin', '-v', 'error', '-n', '-i', paths.workMaster,
    '-map_metadata', '-1', '-ar', '48000', '-ac', '1',
    '-c:a', 'libopus', '-b:a', '80k', '-vbr', 'on', paths.workRuntime,
  ];
  await assertContainedAssetDirectory(context);
  await runTool(context, 'ffmpeg', runtimeArgs, 'runtime Ogg ffmpeg');
  await assertContainedAssetDirectory(context);
  const validated = await validateDerivativePair(
    context,
    sourceProbe,
    paths.workMaster,
    paths.workRuntime,
  );
  return { masterArgs, runtimeArgs, probes: {
    master: validated.master.probe,
    runtime: validated.runtime.probe,
  }, outputBytes: {
    master: validated.master.bytes,
    runtime: validated.runtime.bytes,
  } };
}

async function promoteExclusive(context, source, destination, expectedSha256, maximumBytes, expectedBytes) {
  if (await exists(context.fileSystem, destination)) {
    const existing = await readBoundedDerivative(
      context, destination, 'existing audio output', maximumBytes, expectedBytes,
    );
    if (sha256(existing) !== expectedSha256) fail(`existing output does not match its normalization journal: ${destination}`);
    if (await exists(context.fileSystem, source)) {
      await assertRegularAssetFile(context, source, 'working audio output');
      await context.fileSystem.unlink(source);
    }
    return;
  }
  const candidate = await readBoundedDerivative(
    context, source, 'working audio output', maximumBytes, expectedBytes,
  );
  if (sha256(candidate) !== expectedSha256) fail(`working output does not match its normalization journal: ${source}`);
  await assertContainedAssetDirectory(context);
  await context.fileSystem.link(source, destination);
  await assertContainedAssetDirectory(context);
  await context.fileSystem.unlink(source);
}

function acquisitionFromRecord(record) {
  if (!record || typeof record.sourceSha256 !== 'string' || !Number.isSafeInteger(record.sourceBytes)) {
    fail('audio acquisition journal is incomplete');
  }
  return record;
}

async function assertAcquiredSource(context, acquired) {
  const before = await assertRegularAssetFile(context, context.paths.source, 'acquired audio source');
  if (!Number.isSafeInteger(before.size) || before.size < 1
    || before.size > context.maximumResponseBytes || before.size !== acquired.sourceBytes) {
    fail(`acquired source for ${context.asset.id} does not match its journal`);
  }
  const bytes = await context.fileSystem.readFile(context.paths.source);
  if (bytes.length !== acquired.sourceBytes || sha256(bytes) !== acquired.sourceSha256) {
    fail(`acquired source for ${context.asset.id} does not match its journal`);
  }
  const after = await assertRegularAssetFile(context, context.paths.source, 'acquired audio source');
  if (after.size !== before.size) fail(`acquired source for ${context.asset.id} changed while being read`);
  return bytes;
}

function buildManifest(context, acquisition, normalized, sourceProbe, masterBytes, runtimeBytes) {
  return {
    schemaVersion: 2,
    assetId: context.asset.id,
    event: context.asset.event,
    kind: context.asset.kind,
    planSha256: context.planSha256,
    generation: {
      provider: context.plan.provider,
      endpoint: ENDPOINT,
      modelId: context.plan.modelId,
      request: context.request.body,
      outputFormat: context.asset.outputFormat,
      requestSha256: context.request.sha256,
      responseHeaders: acquisition.responseHeaders,
      generatedAt: acquisition.generatedAt,
      sourceBytes: acquisition.sourceBytes,
      sourceSha256: acquisition.sourceSha256,
      sourceProbe,
    },
    rights: {
      commercialRightsBasis: context.plan.commercialRightsBasis,
      termsReviewedOn: context.plan.termsReviewedOn,
      soundEffectsTerms: 'https://elevenlabs.io/sound-effects-terms',
      elevenApiTerms: 'https://elevenlabs.io/elevenapi-terms',
    },
    normalization: {
      mode: 'audition-one-pass',
      ffmpegVersion: context.ffmpegVersion,
      targets: { integratedLufs: context.asset.targetLufs, truePeakDbtp: -1 },
      measurements: null,
      measurementStatus: 'pending-final-mastering',
      masterArgs: normalized.masterArgs,
      runtimeArgs: normalized.runtimeArgs,
      probes: normalized.probes,
    },
    outputs: {
      master: { file: `${context.asset.id}.master.wav`, sha256: sha256(masterBytes), bytes: masterBytes.length },
      runtime: { file: `${context.asset.id}.runtime.ogg`, sha256: sha256(runtimeBytes), bytes: runtimeBytes.length },
    },
    review: { selected: false, reviewer: null, reviewedAt: null, notes: null },
  };
}

async function acquireSource(context) {
  if (new Date(context.approval.expiresAt) <= context.now()) {
    fail(`audio generation approval expired before requesting ${context.asset.id}`);
  }
  await appendJournal(context, 'request_started', { requestSha256: context.request.sha256 });
  await assertContainedAssetDirectory(context);
  const response = await withTimeout(context.requestTimeoutMs, context.timers, 'generation request', async (signal) => {
    const fetched = await context.fetch(`${ENDPOINT}?output_format=${encodeURIComponent(context.asset.outputFormat)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': context.apiKey },
      body: JSON.stringify(context.request.body),
      redirect: 'error',
      signal,
    });
    const requestId = fetched.headers.get('request-id');
    if (!fetched.ok) {
      fail(`generation failed for ${context.asset.id}: HTTP ${fetched.status}${requestId ? ` request ${requestId}` : ''}`);
    }
    const body = await readBoundedResponse(fetched, context.maximumResponseBytes, signal);
    return { fetched, body, requestId };
  });
  const sourceSha256 = sha256(response.body.bytes);
  const responseHeaders = {
    contentType: response.body.contentType,
    contentLength: response.body.declaredLength,
    characterCost: response.fetched.headers.get('character-cost'),
    requestId: response.requestId,
    traceId: response.fetched.headers.get('x-trace-id'),
  };
  const acquisition = {
    generatedAt: context.now().toISOString(),
    sourceBytes: response.body.bytes.length,
    sourceSha256,
    responseHeaders,
  };
  await appendJournal(context, 'response_received', acquisition);
  await assertContainedAssetDirectory(context);
  await context.fileSystem.writeFile(context.paths.source, response.body.bytes, { flag: 'wx' });
  await appendJournal(context, 'acquired', acquisition);
  return acquisition;
}

async function finishAsset(context, acquisition) {
  const sourceBytes = await assertAcquiredSource(context, acquisition);
  const recordedSource = lastRecord(context.records, 'source_validated');
  let sourceProbe;
  if (recordedSource?.probeVersion === 2) {
    sourceProbe = normalizeRecordedProbe(
      recordedSource.probe,
      'journaled source probe',
      sourceProbeExpectation(context.asset),
    );
  } else {
    await assertContainedAssetDirectory(context);
    sourceProbe = await validateSource(context);
    await assertAcquiredSource(context, acquisition);
    await appendJournal(context, 'source_validated', { probeVersion: 2, probe: sourceProbe });
  }

  const normalizedRecord = lastRecord(context.records, 'normalized');
  const readyRecord = lastRecord(context.records, 'normalization_ready') ?? normalizedRecord;
  let manifest;
  if (readyRecord) {
    manifest = readyRecord.manifest;
    if (!manifest || manifest.schemaVersion !== 2
      || manifest.generation?.sourceSha256 !== sha256(sourceBytes)) {
      fail(`normalized journal for ${context.asset.id} is invalid`);
    }
    const masterPath = await recoveryDerivativePath(
      context, context.paths.workMaster, context.paths.master, 'audition master',
    );
    const runtimePath = await recoveryDerivativePath(
      context, context.paths.workRuntime, context.paths.runtime, 'runtime Ogg',
    );
    const validated = await validateDerivativePair(context, sourceProbe, masterPath, runtimePath);
    const manifestSource = normalizeRecordedProbe(
      manifest.generation?.sourceProbe,
      'manifest source probe',
      sourceProbeExpectation(context.asset),
    );
    if (serializeCanonical(manifestSource) !== serializeCanonical(sourceProbe)) {
      fail(`source probe for ${context.asset.id} does not match its manifest`);
    }
    validateManifestDerivatives(context, manifest, validated);
    await validateDerivativeBytes(context, manifest, validated, masterPath, runtimePath);
  } else {
    await appendJournal(context, 'normalization_started');
    await assertContainedAssetDirectory(context);
    const normalized = await normalizeSource(context, sourceProbe);
    await assertContainedAssetDirectory(context);
    const [workMasterBytes, workRuntimeBytes] = await Promise.all([
      readBoundedDerivative(
        context, context.paths.workMaster, 'working audition master',
        context.maximumMasterBytes, normalized.outputBytes.master,
      ),
      readBoundedDerivative(
        context, context.paths.workRuntime, 'working runtime audio',
        context.maximumRuntimeBytes, normalized.outputBytes.runtime,
      ),
    ]);
    manifest = buildManifest(
      context,
      acquisition,
      normalized,
      sourceProbe,
      workMasterBytes,
      workRuntimeBytes,
    );
    await appendJournal(context, 'normalization_ready', { manifest });
  }

  await assertContainedAssetDirectory(context);
  await promoteExclusive(
    context,
    context.paths.workMaster,
    context.paths.master,
    manifest.outputs.master.sha256,
    context.maximumMasterBytes,
    manifest.outputs.master.bytes,
  );
  await assertContainedAssetDirectory(context);
  await promoteExclusive(
    context,
    context.paths.workRuntime,
    context.paths.runtime,
    manifest.outputs.runtime.sha256,
    context.maximumRuntimeBytes,
    manifest.outputs.runtime.bytes,
  );
  if (!normalizedRecord) await appendJournal(context, 'normalized', { manifest });

  await assertContainedAssetDirectory(context);
  if (await exists(context.fileSystem, context.paths.manifest)) {
    await assertRegularAssetFile(context, context.paths.manifest, 'audio provenance manifest');
    const existing = JSON.parse(await context.fileSystem.readFile(context.paths.manifest, 'utf8'));
    if (serializeCanonical(existing) !== serializeCanonical(manifest)) {
      fail(`existing provenance manifest for ${context.asset.id} does not match its journal`);
    }
  } else {
    await assertContainedAssetDirectory(context);
    await context.fileSystem.writeFile(
      context.paths.manifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: 'wx' },
    );
  }
  await appendJournal(context, 'completed', {
    manifestSha256: sha256(serializeCanonical(manifest)),
  });
  context.writeOutput(`generated ${context.asset.id} request=${context.request.sha256} source=${acquisition.sourceSha256}\n`);
}

async function recoveryDerivativePath(context, workPath, finalPath, label) {
  if (await exists(context.fileSystem, workPath)) return workPath;
  if (await exists(context.fileSystem, finalPath)) return finalPath;
  fail(`${label} for ${context.asset.id} is missing from its resumable normalization`);
}

function validateManifestDerivatives(context, manifest, validated) {
  const manifestMaster = normalizeRecordedProbe(
    manifest.normalization?.probes?.master,
    'manifest audition master probe',
    masterProbeExpectation(context.asset),
  );
  const manifestRuntime = normalizeRecordedProbe(
    manifest.normalization?.probes?.runtime,
    'manifest runtime Ogg probe',
    runtimeProbeExpectation(context.asset),
  );
  if (serializeCanonical(manifestMaster) !== serializeCanonical(validated.master.probe)
    || serializeCanonical(manifestRuntime) !== serializeCanonical(validated.runtime.probe)) {
    fail(`normalized media probes for ${context.asset.id} do not match its manifest`);
  }
}

async function validateDerivativeBytes(context, manifest, validated, masterPath, runtimePath) {
  const expectedMaster = manifest.outputs?.master;
  const expectedRuntime = manifest.outputs?.runtime;
  if (!expectedMaster || !Number.isSafeInteger(expectedMaster.bytes)
    || typeof expectedMaster.sha256 !== 'string'
    || !expectedRuntime || !Number.isSafeInteger(expectedRuntime.bytes)
    || typeof expectedRuntime.sha256 !== 'string') {
    fail(`normalized outputs for ${context.asset.id} are missing bounded metadata`);
  }
  const [masterBytes, runtimeBytes] = await Promise.all([
    readBoundedDerivative(
      context, masterPath, 'audition master', context.maximumMasterBytes, validated.master.bytes,
    ),
    readBoundedDerivative(
      context, runtimePath, 'runtime Ogg', context.maximumRuntimeBytes, validated.runtime.bytes,
    ),
  ]);
  if (masterBytes.length !== expectedMaster.bytes || sha256(masterBytes) !== expectedMaster.sha256
    || runtimeBytes.length !== expectedRuntime.bytes || sha256(runtimeBytes) !== expectedRuntime.sha256) {
    fail(`normalized outputs for ${context.asset.id} do not match their manifest`);
  }
}

async function validateCompletedAsset(context, completed) {
  await assertContainedAssetDirectory(context);
  const acquired = acquisitionFromRecord(lastRecord(context.records, 'acquired'));
  await assertAcquiredSource(context, acquired);
  await assertRegularAssetFile(context, context.paths.manifest, 'audio provenance manifest');
  const manifest = JSON.parse(await context.fileSystem.readFile(context.paths.manifest, 'utf8'));
  if (manifest?.schemaVersion !== 2
    || sha256(serializeCanonical(manifest)) !== completed.manifestSha256) {
    fail(`completed provenance manifest for ${context.asset.id} does not match its journal`);
  }
  const sourceProbe = normalizeRecordedProbe(
    manifest.generation?.sourceProbe,
    'manifest source probe',
    sourceProbeExpectation(context.asset),
  );
  const validated = await validateDerivativePair(
    context, sourceProbe, context.paths.master, context.paths.runtime,
  );
  validateManifestDerivatives(context, manifest, validated);
  await validateDerivativeBytes(
    context, manifest, validated, context.paths.master, context.paths.runtime,
  );
}

async function processAsset(context, resume) {
  await assertContainedAssetDirectory(context);
  const completed = lastRecord(context.records, 'completed');
  if (completed) {
    await validateCompletedAsset(context, completed);
    return 'already-complete';
  }
  try {
    let acquisition = lastRecord(context.records, 'acquired');
    if (resume) {
      if (!acquisition) {
        fail(`resume for ${context.asset.id} is refused because no acquired source was journaled; a paid request will not be repeated`);
      }
      await appendJournal(context, 'resume_started');
    } else {
      acquisition = await acquireSource(context);
    }
    await finishAsset(context, acquisitionFromRecord(acquisition));
    return 'completed';
  } catch (error) {
    try {
      await appendJournal(context, 'failed', { message: publicError(error) });
    } catch {
      // Preserve the original failure. Existing journal/source files remain the
      // recovery authority even if recording the final failure itself fails.
    }
    throw error;
  } finally {
    let contained = false;
    try {
      await assertContainedAssetDirectory(context);
      contained = true;
    } catch {
      // Never clean up through a parent that no longer resolves inside staging.
    }
    if (contained && (!lastRecord(context.records, 'normalization_ready') || lastRecord(context.records, 'completed'))) {
      await assertContainedAssetDirectory(context);
      await unlinkIfPresent(context.fileSystem, context.paths.workMaster);
      await assertContainedAssetDirectory(context);
      await unlinkIfPresent(context.fileSystem, context.paths.workRuntime);
    }
  }
}

async function releaseReservation(reservation) {
  try {
    await assertRegularAssetFile(reservation, reservation.paths.lock, 'audio reservation lock');
    const lock = JSON.parse(await reservation.fileSystem.readFile(reservation.paths.lock, 'utf8'));
    if (lock.token === reservation.token) {
      await assertContainedAssetDirectory(reservation);
      await reservation.fileSystem.unlink(reservation.paths.lock);
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

function executionDependencies(overrides) {
  const stagingRoot = overrides.stagingRoot ?? STAGING_ROOT;
  if (typeof stagingRoot !== 'string' || stagingRoot.length === 0) {
    fail('audio staging root must be a non-empty path string');
  }
  return {
    fetch: overrides.fetch ?? globalThis.fetch,
    fileSystem: overrides.fileSystem ?? NODE_FILE_SYSTEM,
    maximumResponseBytes: boundedInteger(
      overrides.maximumResponseBytes ?? MAX_AUDIO_RESPONSE_BYTES,
      1,
      MAX_AUDIO_RESPONSE_BYTES,
      'maximum audio response bytes',
    ),
    maximumMasterBytes: boundedInteger(
      overrides.maximumMasterBytes ?? MAX_AUDIO_MASTER_BYTES,
      1,
      MAX_AUDIO_MASTER_BYTES,
      'maximum audition master bytes',
    ),
    maximumRuntimeBytes: boundedInteger(
      overrides.maximumRuntimeBytes ?? MAX_AUDIO_RUNTIME_BYTES,
      1,
      MAX_AUDIO_RUNTIME_BYTES,
      'maximum runtime audio bytes',
    ),
    maximumToolOutputBytes: boundedInteger(
      overrides.maximumToolOutputBytes ?? MAX_AUDIO_TOOL_OUTPUT_BYTES,
      1,
      MAX_AUDIO_TOOL_OUTPUT_BYTES,
      'maximum audio tool output bytes',
    ),
    now: () => nowDate(overrides.now),
    randomToken: overrides.randomToken ?? (() => randomUUID()),
    requestTimeoutMs: boundedInteger(
      overrides.requestTimeoutMs ?? AUDIO_REQUEST_TIMEOUT_MS,
      1,
      AUDIO_REQUEST_TIMEOUT_MS,
      'audio request timeout milliseconds',
    ),
    toolTimeoutMs: boundedInteger(
      overrides.toolTimeoutMs ?? AUDIO_TOOL_TIMEOUT_MS,
      1,
      AUDIO_TOOL_TIMEOUT_MS,
      'audio tool timeout milliseconds',
    ),
    runner: overrides.runner ?? run,
    stagingRoot: resolve(stagingRoot),
    timers: {
      setTimeout: overrides.setTimeout ?? globalThis.setTimeout,
      clearTimeout: overrides.clearTimeout ?? globalThis.clearTimeout,
    },
    writeOutput: overrides.writeOutput ?? ((message) => process.stdout.write(message)),
  };
}

async function prepareReservations(plan, authorization, resume, dependencies, ffmpegVersion) {
  const reservations = [];
  try {
    for (const asset of plan.assets) {
      const token = dependencies.randomToken();
      const paths = pathsFor(dependencies.stagingRoot, asset);
      assertLexicalAssetPaths(dependencies.stagingRoot, paths);
      await assertStagingRootStable(dependencies);
      try {
        await dependencies.fileSystem.mkdir(paths.assetDirectory);
      } catch (error) {
        if (!error || error.code !== 'EEXIST') throw error;
      }
      const reservation = {
        token,
        paths,
        fileSystem: dependencies.fileSystem,
        stagingRoot: dependencies.stagingRoot,
        asset,
      };
      await assertContainedAssetDirectory(reservation);
      const lock = {
        schemaVersion: 1,
        token,
        planSha256: authorization.approval.planSha256,
        assetId: asset.id,
        reservedAt: dependencies.now().toISOString(),
      };
      await assertContainedAssetDirectory(reservation);
      await dependencies.fileSystem.writeFile(paths.lock, `${JSON.stringify(lock)}\n`, { flag: 'wx' });
      reservations.push(reservation);
    }

    const contexts = [];
    for (let index = 0; index < plan.assets.length; index++) {
      const asset = plan.assets[index];
      const reservation = reservations[index];
      let records;
      await assertContainedAssetDirectory(reservation);
      if (resume) {
        if (!await exists(dependencies.fileSystem, reservation.paths.journal)) {
          fail(`resume for ${asset.id} requires an existing journal`);
        }
        await assertRegularAssetFile(reservation, reservation.paths.journal, 'audio journal');
        records = parseJournal(
          await dependencies.fileSystem.readFile(reservation.paths.journal, 'utf8'),
          asset,
          authorization.approval.planSha256,
        );
      } else {
        for (const target of [
          reservation.paths.journal,
          reservation.paths.source,
          reservation.paths.master,
          reservation.paths.runtime,
          reservation.paths.manifest,
          reservation.paths.workMaster,
          reservation.paths.workRuntime,
        ]) {
          if (await exists(dependencies.fileSystem, target)) {
            fail(`audio candidate path already exists for ${asset.id}; use --resume only for a journaled acquired source`);
          }
        }
        const request = requestFor(plan, asset);
        const initial = journalRecord(1, 'reserved', dependencies.now().toISOString(), {
          assetId: asset.id,
          planSha256: authorization.approval.planSha256,
          approval: authorization.approval,
          request: request.identity,
          requestSha256: request.sha256,
          rights: {
            commercialRightsBasis: plan.commercialRightsBasis,
            termsReviewedOn: plan.termsReviewedOn,
          },
        });
        await assertContainedAssetDirectory(reservation);
        await dependencies.fileSystem.writeFile(
          reservation.paths.journal,
          `${JSON.stringify(initial)}\n`,
          { flag: 'wx' },
        );
        records = [initial];
      }
      contexts.push({
        ...dependencies,
        ...reservation,
        apiKey: authorization.apiKey,
        approval: authorization.approval,
        asset,
        ffmpegVersion,
        plan,
        planSha256: authorization.approval.planSha256,
        records,
        request: requestFor(plan, asset),
      });
    }
    return { contexts, reservations };
  } catch (error) {
    await Promise.allSettled(reservations.map(releaseReservation));
    throw error;
  }
}

export async function executeApprovedPlan(plan, authorization, options = {}) {
  const dependencies = executionDependencies(options);
  const resume = options.resume === true;
  const current = dependencies.now();
  const normalizedPlan = validatePlan(plan, { now: current });
  const authorizationValue = exactObject(authorization, ['apiKey', 'approval'], 'approved audio authorization');
  if (typeof authorizationValue.apiKey !== 'string' || authorizationValue.apiKey.length === 0) {
    fail('approved audio execution requires an API credential');
  }
  const revalidatedAuthorization = Object.freeze({
    apiKey: authorizationValue.apiKey,
    approval: validateApproval(authorizationValue.approval, normalizedPlan, current),
  });
  const securedDependencies = await establishStagingRoot(dependencies);
  await preflightAssetDirectories(normalizedPlan, securedDependencies);
  const ffmpegVersionResult = await runTool(
    securedDependencies, 'ffmpeg', ['-version'], 'ffmpeg preflight',
  );
  await runTool(securedDependencies, 'ffprobe', ['-version'], 'ffprobe preflight');
  const ffmpegVersion = ffmpegVersionResult.stdout.split('\n')[0];
  const prepared = await prepareReservations(
    normalizedPlan,
    revalidatedAuthorization,
    resume,
    securedDependencies,
    ffmpegVersion,
  );
  try {
    const results = [];
    for (const context of prepared.contexts) {
      results.push(await processAsset(context, resume));
    }
    return Object.freeze({ results: Object.freeze(results) });
  } finally {
    const released = await Promise.allSettled(prepared.reservations.map(releaseReservation));
    const failure = released.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}

export function parseAudioProductionArguments(args) {
  let help = false;
  let execute = false;
  let resume = false;
  let planPath = null;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      if (help) fail(`${argument} may be supplied only once`);
      help = true;
    } else if (argument === '--execute') {
      if (execute) fail('--execute may be supplied only once');
      execute = true;
    } else if (argument === '--resume') {
      if (resume) fail('--resume may be supplied only once');
      resume = true;
    } else if (argument === '--plan') {
      if (planPath !== null) fail('--plan may be supplied only once');
      const candidate = args[index + 1];
      if (!candidate || candidate.startsWith('-')) fail('--plan needs a file path');
      planPath = resolve(candidate);
      index += 1;
    } else {
      fail(`unsupported argument: ${argument}`);
    }
  }
  if (resume && !execute) fail('--resume requires --execute');
  if (help) return { help: true, execute: false, resume: false, planPath: null };
  if (planPath === null) fail(`--plan is required\n${usage()}`);
  return { help: false, execute, resume, planPath };
}

export async function runAudioProductionCli(args, dependencies = {}) {
  const parsed = parseAudioProductionArguments(args);
  const writeOutput = dependencies.writeOutput ?? ((message) => process.stdout.write(message));
  if (parsed.help) {
    writeOutput(`${usage()}\n`);
    return { mode: 'help', assetCount: 0 };
  }
  const readText = dependencies.readText ?? ((path) => readFile(path, 'utf8'));
  const current = nowDate(dependencies.now);
  const plan = validatePlan(JSON.parse(await readText(parsed.planPath)), { now: current });
  const planSha256 = hashAudioPlan(plan);
  const budget = summarizeAudioPlan(plan);
  writeOutput(
    `${parsed.execute ? (parsed.resume ? 'resume' : 'execute') : 'dry-run'}: `
    + `${budget.assets} validated asset request(s) plan=${planSha256} `
    + `seconds=${budget.totalSeconds} credits<=${budget.estimatedCredits}\n`,
  );
  const authorization = authorizeAudioGeneration(
    parsed.execute,
    dependencies.environment ?? process.env,
    plan,
    { now: current },
  );
  if (authorization === null) {
    return { mode: 'dry-run', assetCount: budget.assets, planSha256, budget };
  }
  const executePlan = dependencies.executePlan ?? executeApprovedPlan;
  await executePlan(plan, authorization, {
    ...(dependencies.execution ?? {}),
    resume: parsed.resume,
    writeOutput,
  });
  return {
    mode: parsed.resume ? 'resume' : 'execute',
    assetCount: budget.assets,
    planSha256,
    budget,
  };
}

const invokedAsScript = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  runAudioProductionCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`audio production failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}

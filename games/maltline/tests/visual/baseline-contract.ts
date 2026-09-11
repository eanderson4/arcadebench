import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/u;
const PNG_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.png$/u;
const MAX_SCREENSHOTS = 256;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_PNG_BYTES = 64 * 1024 * 1024;

export interface MaltlineVisualBaselineVerificationOptions {
  readonly trustedRoot: string | URL;
  /** Test seam; production callers always inspect the installed Playwright registry. */
  readonly browserRegistry?: unknown;
  /** Test-only synchronous seam for deterministic post-preflight replacement probes. */
  readonly testOnlyPostPreflightHook?: () => void;
  /** Test-only synchronous seam after every descriptor has passed fstat and byte caps. */
  readonly testOnlyPreReadHook?: () => void;
}

export interface MaltlineVisualBaselineEntry {
  readonly name: string;
  readonly sha256: string;
}

export interface MaltlineVisualBaselineManifest {
  readonly schemaVersion: 2;
  readonly project: string;
  readonly platform: string;
  readonly browser: Readonly<{
    product: string;
    version: string;
    playwrightRevision: number;
  }>;
  readonly playwright: string;
  readonly fontsourceNotoSans: string;
  readonly screenshots: readonly MaltlineVisualBaselineEntry[];
  readonly orderedRawPngSha256: string;
}

function dataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length
    || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} must be an enumerable data property.`);
    }
    normalized[key] = descriptor.value;
  }
  return Object.freeze(normalized);
}

function optionalDataObject(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !allowed.has(key))
    || requiredKeys.some((key) => !ownKeys.includes(key))) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} must be an enumerable data property.`);
    }
    normalized[key] = descriptor.value;
  }
  return Object.freeze(normalized);
}

function dataRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length === 0 || ownKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain plain string data fields.`);
  }
  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} must be an enumerable data property.`);
    }
    normalized[key] = descriptor.value;
  }
  return Object.freeze(normalized);
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function dataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be an ordinary dense data array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor)
    || lengthDescriptor.enumerable || !Number.isSafeInteger(lengthDescriptor.value)) {
    throw new Error(`${label}.length must be the ordinary non-enumerable data property.`);
  }
  const length = Number(lengthDescriptor.value);
  if (length === 0 || length > MAX_SCREENSHOTS) {
    throw new Error(`${label} must contain 1-${MAX_SCREENSHOTS} entries.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  const canonicalIndices = Array.from({ length }, (_, index) => String(index));
  if (ownKeys.length !== canonicalIndices.length + 1
    || !ownKeys.includes('length')
    || ownKeys.some((key) => typeof key !== 'string'
      || key !== 'length' && !canonicalIndices.includes(key))) {
    throw new Error(`${label} must contain only length and canonical dense indices.`);
  }
  for (const index of canonicalIndices) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}[${index}] must be an enumerable data property.`);
    }
  }
  return value;
}

function pathValue(value: string | URL): string {
  return typeof value === 'string' ? value : fileURLToPath(value);
}

function isContained(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === '' || (!isAbsolute(fromRoot) && fromRoot !== '..'
    && !fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

function checkedDirectory(directoryValue: string | URL, trustedRootValue: string | URL): string {
  const directoryPath = resolve(pathValue(directoryValue));
  const trustedRootPath = resolve(pathValue(trustedRootValue));
  const directoryStat = lstatSync(directoryPath);
  const trustedRootStat = lstatSync(trustedRootPath);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('visual baseline directory must be a real directory, not a symlink.');
  }
  if (!trustedRootStat.isDirectory() || trustedRootStat.isSymbolicLink()) {
    throw new Error('visual baseline trusted root must be a real directory, not a symlink.');
  }
  const directory = realpathSync(directoryPath);
  const trustedRoot = realpathSync(trustedRootPath);
  if (!isContained(trustedRoot, directory)) {
    throw new Error('visual baseline directory escapes its trusted root.');
  }
  return directory;
}

function installedPlaywrightBrowserRegistry(): unknown {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('playwright-core/package.json');
  return JSON.parse(readFileSync(resolve(dirname(packagePath), 'browsers.json'), 'utf8')) as unknown;
}

function readSyncRetry(
  descriptor: number,
  buffer: Uint8Array,
  offset: number,
  length: number,
  position: number,
): number {
  while (true) {
    try {
      return readSync(descriptor, buffer, offset, length, position);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EINTR') throw error;
    }
  }
}

export function verifyMaltlineVisualBrowserRegistry(
  manifest: MaltlineVisualBaselineManifest,
  value: unknown,
): void {
  const registry = dataObject(value, ['comment', 'browsers'], 'Playwright browser registry');
  nonemptyString(registry.comment, 'Playwright browser registry comment');
  const browsers = dataArray(registry.browsers, 'Playwright browser registry browsers');
  let chromium: Readonly<Record<string, unknown>> | null = null;
  for (let index = 0; index < browsers.length; index++) {
    const candidateValue = browsers[index];
    const candidate = dataRecord(
      candidateValue,
      `Playwright browser registry browser ${index}`,
    );
    if (candidate.name === 'chromium') {
      if (chromium !== null) {
        throw new Error('Playwright browser registry must contain exactly one Chromium entry.');
      }
      chromium = dataObject(candidateValue, [
        'name',
        'revision',
        'installByDefault',
        'browserVersion',
        'title',
      ], 'Playwright Chromium registry entry');
    }
  }
  if (chromium === null
    || chromium.name !== 'chromium'
    || chromium.installByDefault !== true
    || chromium.revision !== String(manifest.browser.playwrightRevision)
    || chromium.browserVersion !== manifest.browser.version
    || chromium.title !== manifest.browser.product) {
    throw new Error('visual baseline browser metadata does not match the installed Playwright Chromium registry.');
  }
}

export function normalizeMaltlineVisualBaselineManifest(
  value: unknown,
): MaltlineVisualBaselineManifest {
  const manifest = dataObject(value, [
    'schemaVersion',
    'project',
    'platform',
    'browser',
    'playwright',
    'fontsourceNotoSans',
    'screenshots',
    'orderedRawPngSha256',
  ], 'visual baseline manifest');
  if (manifest.schemaVersion !== 2) {
    throw new Error('visual baseline manifest schemaVersion must be 2.');
  }
  const browser = dataObject(
    manifest.browser,
    ['product', 'version', 'playwrightRevision'],
    'visual baseline manifest browser',
  );
  if (!Number.isSafeInteger(browser.playwrightRevision) || Number(browser.playwrightRevision) <= 0) {
    throw new Error('visual baseline manifest browser.playwrightRevision must be a positive integer.');
  }
  const screenshotValues = dataArray(
    manifest.screenshots,
    'visual baseline manifest screenshots',
  );
  const screenshots: MaltlineVisualBaselineEntry[] = [];
  for (let index = 0; index < screenshotValues.length; index++) {
    const value = screenshotValues[index];
    const entry = dataObject(value, ['name', 'sha256'], `visual baseline screenshot ${index}`);
    const name = nonemptyString(entry.name, `visual baseline screenshot ${index}.name`);
    if (!PNG_NAME.test(name)) {
      throw new Error(`visual baseline screenshot ${index}.name must be a plain lowercase PNG filename.`);
    }
    screenshots.push(Object.freeze({
      name,
      sha256: digest(entry.sha256, `visual baseline screenshot ${name}.sha256`),
    }));
  }
  for (let index = 1; index < screenshots.length; index++) {
    if (screenshots[index - 1]!.name >= screenshots[index]!.name) {
      throw new Error('visual baseline screenshot ledger must be unique and lexicographically sorted.');
    }
  }
  return Object.freeze({
    schemaVersion: 2,
    project: nonemptyString(manifest.project, 'visual baseline manifest project'),
    platform: nonemptyString(manifest.platform, 'visual baseline manifest platform'),
    browser: Object.freeze({
      product: nonemptyString(browser.product, 'visual baseline manifest browser.product'),
      version: nonemptyString(browser.version, 'visual baseline manifest browser.version'),
      playwrightRevision: Number(browser.playwrightRevision),
    }),
    playwright: nonemptyString(manifest.playwright, 'visual baseline manifest playwright'),
    fontsourceNotoSans: nonemptyString(
      manifest.fontsourceNotoSans,
      'visual baseline manifest fontsourceNotoSans',
    ),
    screenshots: Object.freeze(screenshots),
    orderedRawPngSha256: digest(
      manifest.orderedRawPngSha256,
      'visual baseline manifest orderedRawPngSha256',
    ),
  });
}

export function verifyMaltlineVisualBaselineFiles(
  value: unknown,
  baselineDirectory: string | URL,
  options: MaltlineVisualBaselineVerificationOptions,
): MaltlineVisualBaselineManifest {
  const normalizedOptions = optionalDataObject(
    options,
    ['trustedRoot'],
    ['browserRegistry', 'testOnlyPostPreflightHook', 'testOnlyPreReadHook'],
    'visual baseline verification options',
  );
  const trustedRoot = normalizedOptions.trustedRoot;
  if (typeof trustedRoot !== 'string' && !(trustedRoot instanceof URL)) {
    throw new Error('visual baseline verification options.trustedRoot must be a path or URL.');
  }
  const postPreflightHook = normalizedOptions.testOnlyPostPreflightHook;
  if (postPreflightHook !== undefined && typeof postPreflightHook !== 'function') {
    throw new Error('visual baseline verification options.testOnlyPostPreflightHook must be a function.');
  }
  const preReadHook = normalizedOptions.testOnlyPreReadHook;
  if (preReadHook !== undefined && typeof preReadHook !== 'function') {
    throw new Error('visual baseline verification options.testOnlyPreReadHook must be a function.');
  }
  const manifest = normalizeMaltlineVisualBaselineManifest(value);
  verifyMaltlineVisualBrowserRegistry(
    manifest,
    Object.hasOwn(normalizedOptions, 'browserRegistry')
      ? normalizedOptions.browserRegistry
      : installedPlaywrightBrowserRegistry(),
  );
  const directory = checkedDirectory(baselineDirectory, trustedRoot);
  const actualNames = readdirSync(directory, { withFileTypes: true })
    .filter(({ name }) => name.toLowerCase().endsWith('.png'))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`visual baseline ${entry.name} must be a regular file.`);
      }
      return entry.name;
    })
    .sort();
  const expectedNames = manifest.screenshots.map(({ name }) => name);
  if (actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error('visual baseline directory does not match the manifest ledger.');
  }

  let totalBytes = 0;
  const preflightFiles = manifest.screenshots.map((entry) => {
    const file = resolve(directory, entry.name);
    const fileStat = lstatSync(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error(`visual baseline ${entry.name} must be a regular file.`);
    }
    const realFile = realpathSync(file);
    if (!isContained(directory, realFile)) {
      throw new Error(`visual baseline ${entry.name} escapes its trusted directory.`);
    }
    if (fileStat.size > MAX_PNG_BYTES) {
      throw new Error(`visual baseline ${entry.name} exceeds the ${MAX_PNG_BYTES}-byte file limit.`);
    }
    totalBytes += fileStat.size;
    return Object.freeze({
      entry,
      file: realFile,
      size: fileStat.size,
      dev: fileStat.dev,
      ino: fileStat.ino,
    });
  });
  if (totalBytes > MAX_TOTAL_PNG_BYTES) {
    throw new Error(`visual baseline PNGs exceed the ${MAX_TOTAL_PNG_BYTES}-byte aggregate limit.`);
  }

  if (postPreflightHook !== undefined) {
    const result = postPreflightHook();
    if (result !== undefined) {
      throw new Error('visual baseline test-only post-preflight hook must complete synchronously.');
    }
  }

  const openedFiles: Array<typeof preflightFiles[number] & { readonly descriptor: number }> = [];
  try {
    let descriptorTotalBytes = 0;
    for (const file of preflightFiles) {
      let descriptor: number;
      try {
        descriptor = openSync(
          file.file,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
      } catch (cause) {
        throw new Error(`visual baseline ${file.entry.name} could not be opened safely.`, { cause });
      }
      openedFiles.push(Object.freeze({ ...file, descriptor }));
      const descriptorStat = fstatSync(descriptor);
      if (!descriptorStat.isFile()) {
        throw new Error(`visual baseline ${file.entry.name} opened as a non-regular file.`);
      }
      if (descriptorStat.size > MAX_PNG_BYTES) {
        throw new Error(`visual baseline ${file.entry.name} exceeds the ${MAX_PNG_BYTES}-byte file limit.`);
      }
      let currentRealPath: string;
      try {
        currentRealPath = realpathSync(file.file);
      } catch (cause) {
        throw new Error(`visual baseline ${file.entry.name} path changed after preflight.`, { cause });
      }
      if (currentRealPath !== file.file
        || descriptorStat.dev !== file.dev
        || descriptorStat.ino !== file.ino
        || descriptorStat.size !== file.size) {
        throw new Error(`visual baseline ${file.entry.name} changed after preflight.`);
      }
      descriptorTotalBytes += descriptorStat.size;
    }
    if (descriptorTotalBytes > MAX_TOTAL_PNG_BYTES) {
      throw new Error(`visual baseline PNGs exceed the ${MAX_TOTAL_PNG_BYTES}-byte aggregate limit.`);
    }
    if (preReadHook !== undefined) {
      const result = preReadHook();
      if (result !== undefined) {
        throw new Error('visual baseline test-only pre-read hook must complete synchronously.');
      }
    }

    const orderedRaw = createHash('sha256');
    for (const file of openedFiles) {
      const bytes = Buffer.allocUnsafe(file.size);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = readSyncRetry(
          file.descriptor,
          bytes,
          offset,
          bytes.byteLength - offset,
          offset,
        );
        if (count === 0) {
          throw new Error(`visual baseline ${file.entry.name} ended before its recorded size.`);
        }
        offset += count;
      }
      const extra = Buffer.allocUnsafe(1);
      const extraBytes = readSyncRetry(file.descriptor, extra, 0, 1, file.size);
      const postReadStat = fstatSync(file.descriptor);
      if (!postReadStat.isFile()
        || postReadStat.dev !== file.dev
        || postReadStat.ino !== file.ino
        || postReadStat.size !== file.size
        || offset !== file.size
        || extraBytes !== 0) {
        throw new Error(`visual baseline ${file.entry.name} changed during verification.`);
      }
      const actualDigest = createHash('sha256').update(bytes).digest('hex');
      if (actualDigest !== file.entry.sha256) {
        throw new Error(`visual baseline ${file.entry.name} SHA-256 does not match the manifest.`);
      }
      orderedRaw.update(bytes);
    }
    if (orderedRaw.digest('hex') !== manifest.orderedRawPngSha256) {
      throw new Error('visual baseline ordered raw PNG SHA-256 does not match the manifest.');
    }
  } finally {
    let closeFailure: unknown;
    for (const { descriptor } of openedFiles.reverse()) {
      try {
        closeSync(descriptor);
      } catch (error) {
        closeFailure ??= error;
      }
    }
    if (closeFailure !== undefined) throw closeFailure;
  }
  return manifest;
}

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import baselineManifestJson from './visual/baseline-manifest.json' with { type: 'json' };
import {
  normalizeMaltlineVisualBaselineManifest,
  verifyMaltlineVisualBrowserRegistry,
  verifyMaltlineVisualBaselineFiles,
  type MaltlineVisualBaselineManifest,
  type MaltlineVisualBaselineVerificationOptions,
} from './visual/baseline-contract';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('Maltline visual baseline manifest', () => {
  let root = '';
  let directory = '';
  let manifest: MaltlineVisualBaselineManifest;
  const browserRegistry = {
    comment: 'test registry',
    browsers: [{
      name: 'chromium', revision: '1', installByDefault: true,
      browserVersion: '1', title: 'test',
    }],
  };
  const options = (): MaltlineVisualBaselineVerificationOptions => ({
    trustedRoot: root,
    browserRegistry,
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maltline-visual-manifest-'));
    directory = join(root, 'baselines');
    mkdirSync(directory);
    const first = Buffer.from('first reviewed PNG bytes');
    const second = Buffer.from('second reviewed PNG bytes');
    writeFileSync(join(directory, 'a.png'), first);
    writeFileSync(join(directory, 'b.png'), second);
    manifest = normalizeMaltlineVisualBaselineManifest({
      schemaVersion: 2,
      project: 'test-browser',
      platform: 'linux',
      browser: { product: 'test', version: '1', playwrightRevision: 1 },
      playwright: '1.0.0',
      fontsourceNotoSans: '1.0.0',
      screenshots: [
        { name: 'a.png', sha256: sha256(first) },
        { name: 'b.png', sha256: sha256(second) },
      ],
      orderedRawPngSha256: sha256(Buffer.concat([first, second])),
    });
  });

  afterEach(() => rmSync(root, { force: true, recursive: true }));

  it('verifies the checked-in schema, sorted ledger, individual PNGs, and aggregate bytes', () => {
    const checkedIn = verifyMaltlineVisualBaselineFiles(
      baselineManifestJson,
      new URL('./visual/baselines/chromium-system/', import.meta.url),
      { trustedRoot: new URL('./visual/', import.meta.url) },
    );
    expect(checkedIn.schemaVersion).toBe(2);
    expect(checkedIn.screenshots).toHaveLength(49);
    expect(Object.isFrozen(checkedIn)).toBe(true);
    expect(Object.isFrozen(checkedIn.screenshots)).toBe(true);
    expect(Object.isFrozen(checkedIn.screenshots[0])).toBe(true);
  });

  it('rejects malformed fields, extras, and invalid digests', () => {
    expect(() => normalizeMaltlineVisualBaselineManifest({ ...manifest, schemaVersion: 1 }))
      .toThrow(/schemaVersion/u);
    expect(() => normalizeMaltlineVisualBaselineManifest({ ...manifest, extra: true }))
      .toThrow(/unsupported or missing fields/u);
    expect(() => normalizeMaltlineVisualBaselineManifest({
      ...manifest,
      screenshots: [{ ...manifest.screenshots[0], extra: true }, manifest.screenshots[1]],
    })).toThrow(/unsupported or missing fields/u);
    expect(() => normalizeMaltlineVisualBaselineManifest({
      ...manifest,
      orderedRawPngSha256: 'ABC',
    })).toThrow(/lowercase SHA-256/u);
  });

  it('rejects sparse, accessor-backed, extended, and custom-prototype screenshot arrays', () => {
    const entries = [...manifest.screenshots];
    const sparse = new Array<unknown>(entries.length);
    sparse[0] = entries[0];
    const extra = [...entries] as unknown[] & { extra?: boolean };
    extra.extra = true;
    const symbol = [...entries] as unknown[] & { [key: symbol]: boolean };
    symbol[Symbol('extra')] = true;
    const accessor = [...entries];
    Object.defineProperty(accessor, '0', {
      configurable: true,
      enumerable: true,
      get: () => entries[0],
    });
    const customPrototype = [...entries];
    Object.setPrototypeOf(customPrototype, Object.create(Array.prototype) as object);
    const customMap = [...entries] as unknown[] & { map: () => never };
    Object.defineProperty(customMap, 'map', {
      configurable: true,
      enumerable: true,
      value: () => { throw new Error('must not execute custom map'); },
    });

    for (const screenshots of [sparse, extra, symbol, accessor, customPrototype, customMap]) {
      expect(() => normalizeMaltlineVisualBaselineManifest({ ...manifest, screenshots }))
        .toThrow(/ordinary dense|only length|enumerable data/u);
    }
  });

  it('normalizes only exact descriptor-safe verification options without invoking accessors', () => {
    let getterCalls = 0;
    const trustedRootAccessor = {};
    Object.defineProperty(trustedRootAccessor, 'trustedRoot', {
      enumerable: true,
      get: () => {
        getterCalls++;
        throw new Error('trustedRoot getter must not run');
      },
    });
    const registryAccessor = { trustedRoot: root };
    Object.defineProperty(registryAccessor, 'browserRegistry', {
      enumerable: true,
      get: () => {
        getterCalls++;
        throw new Error('browserRegistry getter must not run');
      },
    });
    const customPrototype = Object.assign(Object.create({ inherited: true }) as object, {
      trustedRoot: root,
    });

    for (const candidate of [
      {},
      { trustedRoot: root, extra: true },
      trustedRootAccessor,
      registryAccessor,
      customPrototype,
      { trustedRoot: root, testOnlyPostPreflightHook: true },
      { trustedRoot: root, testOnlyPreReadHook: true },
    ]) {
      expect(() => verifyMaltlineVisualBaselineFiles(
        manifest,
        directory,
        candidate as MaltlineVisualBaselineVerificationOptions,
      )).toThrow(/options|plain data object|enumerable data property/u);
    }
    expect(getterCalls).toBe(0);
  });

  it('rejects traversal, absolute, separator, uppercase, and Unicode screenshot names', () => {
    const invalidNames = [
      '../a.png',
      '/a.png',
      'C:\\a.png',
      'a/b.png',
      'a\\b.png',
      'A.png',
      'é.png',
      'a∕b.png',
    ];
    for (const name of invalidNames) {
      expect(() => normalizeMaltlineVisualBaselineManifest({
        ...manifest,
        screenshots: [{ ...manifest.screenshots[0], name }, manifest.screenshots[1]],
      }), name).toThrow(/plain lowercase PNG filename/u);
    }
  });

  it('binds the manifest browser tuple to the installed Playwright registry shape', () => {
    expect(() => verifyMaltlineVisualBrowserRegistry(manifest, browserRegistry)).not.toThrow();
    for (const chromium of [
      { ...browserRegistry.browsers[0], revision: '2' },
      { ...browserRegistry.browsers[0], browserVersion: '2' },
      { ...browserRegistry.browsers[0], title: 'other' },
    ]) {
      expect(() => verifyMaltlineVisualBrowserRegistry(manifest, {
        ...browserRegistry,
        browsers: [chromium],
      })).toThrow(/installed Playwright Chromium registry/u);
    }

    let getterCalls = 0;
    const accessorCandidate = { ...browserRegistry.browsers[0] };
    Object.defineProperty(accessorCandidate, 'revision', {
      enumerable: true,
      get: () => {
        getterCalls++;
        throw new Error('candidate getter must not run');
      },
    });
    const customPrototype = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      browserRegistry.browsers[0],
    );
    const registryAccessor = { comment: 'test registry' };
    Object.defineProperty(registryAccessor, 'browsers', {
      enumerable: true,
      get: () => {
        getterCalls++;
        throw new Error('registry getter must not run');
      },
    });
    for (const registry of [
      { ...browserRegistry, browsers: [accessorCandidate] },
      { ...browserRegistry, browsers: [customPrototype] },
      { ...browserRegistry, browsers: [{ ...browserRegistry.browsers[0], extra: true }] },
      { ...browserRegistry, browsers: [
        browserRegistry.browsers[0],
        { ...browserRegistry.browsers[0] },
      ] },
      { ...browserRegistry, extra: true },
      registryAccessor,
    ]) {
      expect(() => verifyMaltlineVisualBrowserRegistry(manifest, registry))
        .toThrow(/plain data object|enumerable data property|unsupported|exactly one/u);
    }
    expect(getterCalls).toBe(0);
  });

  it('rejects changed PNG bytes and a changed aggregate identity', () => {
    writeFileSync(join(directory, 'b.png'), 'changed bytes');
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, options()))
      .toThrow(/b\.png SHA-256/u);
    writeFileSync(join(directory, 'b.png'), 'second reviewed PNG bytes');
    expect(() => verifyMaltlineVisualBaselineFiles({
      ...manifest,
      orderedRawPngSha256: '0'.repeat(64),
    }, directory, options())).toThrow(/ordered raw PNG SHA-256/u);
  });

  it('rejects missing and extra PNG files before browser execution', () => {
    unlinkSync(join(directory, 'b.png'));
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, options()))
      .toThrow(/directory does not match/u);
    writeFileSync(join(directory, 'b.png'), 'second reviewed PNG bytes');
    writeFileSync(join(directory, 'c.png'), 'unreviewed PNG bytes');
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, options()))
      .toThrow(/directory does not match/u);
    unlinkSync(join(directory, 'c.png'));
    writeFileSync(join(directory, 'C.PNG'), 'unreviewed uppercase PNG bytes');
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, options()))
      .toThrow(/directory does not match/u);
  });

  it('rejects symlink files, symlink directories, and directories outside the trusted root', () => {
    unlinkSync(join(directory, 'b.png'));
    symlinkSync('a.png', join(directory, 'b.png'));
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, options()))
      .toThrow(/regular file/u);
    unlinkSync(join(directory, 'b.png'));
    writeFileSync(join(directory, 'b.png'), 'second reviewed PNG bytes');

    const linkedDirectory = join(root, 'linked-baselines');
    symlinkSync(directory, linkedDirectory, 'dir');
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, linkedDirectory, options()))
      .toThrow(/real directory, not a symlink/u);

    const trusted = join(root, 'trusted');
    mkdirSync(trusted);
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, {
      ...options(), trustedRoot: trusted,
    })).toThrow(/escapes its trusted root/u);
  });

  it('rejects a post-preflight replacement with a symlink without reopening its target', () => {
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, {
      ...options(),
      testOnlyPostPreflightHook: () => {
        unlinkSync(join(directory, 'b.png'));
        symlinkSync('a.png', join(directory, 'b.png'));
      },
    })).toThrow(/could not be opened safely/u);
  });

  it('rejects a post-preflight replacement with a FIFO without blocking', () => {
    if (process.platform !== 'linux') return;
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, {
      ...options(),
      testOnlyPostPreflightHook: () => {
        unlinkSync(join(directory, 'b.png'));
        execFileSync('mkfifo', [join(directory, 'b.png')]);
      },
    })).toThrow(/non-regular file/u);
  });

  it('rejects a post-preflight same-inode growth beyond the per-file ceiling', () => {
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, {
      ...options(),
      testOnlyPostPreflightHook: () => {
        truncateSync(join(directory, 'b.png'), 8 * 1024 * 1024 + 1);
      },
    })).toThrow(/file limit/u);
  });

  it('rejects same-inode growth after descriptor caps without an unbounded read', () => {
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, {
      ...options(),
      testOnlyPreReadHook: () => {
        truncateSync(join(directory, 'b.png'), 8 * 1024 * 1024 + 1);
      },
    })).toThrow(/changed during verification/u);
  });

  it('rejects oversized individual and aggregate PNG stat ledgers before reading', () => {
    truncateSync(join(directory, 'b.png'), 8 * 1024 * 1024 + 1);
    expect(() => verifyMaltlineVisualBaselineFiles(manifest, directory, options()))
      .toThrow(/file limit/u);

    rmSync(directory, { recursive: true });
    mkdirSync(directory);
    const screenshots = Array.from({ length: 9 }, (_, index) => ({
      name: `cap-${index}.png`,
      sha256: '0'.repeat(64),
    }));
    for (const { name } of screenshots) {
      writeFileSync(join(directory, name), '');
      truncateSync(join(directory, name), 8 * 1024 * 1024);
    }
    const aggregateManifest = normalizeMaltlineVisualBaselineManifest({
      ...manifest,
      screenshots,
      orderedRawPngSha256: '0'.repeat(64),
    });
    expect(() => verifyMaltlineVisualBaselineFiles(aggregateManifest, directory, options()))
      .toThrow(/aggregate limit/u);
  });

  it('rejects unsorted or duplicate ledgers', () => {
    expect(() => normalizeMaltlineVisualBaselineManifest({
      ...manifest,
      screenshots: [...manifest.screenshots].reverse(),
    })).toThrow(/unique and lexicographically sorted/u);
    expect(() => normalizeMaltlineVisualBaselineManifest({
      ...manifest,
      screenshots: [manifest.screenshots[0], manifest.screenshots[0]],
    })).toThrow(/unique and lexicographically sorted/u);
  });
});

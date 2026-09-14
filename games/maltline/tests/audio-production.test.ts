import { afterEach, describe, expect, it } from 'vitest';
import {
  appendFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error The production CLI is dependency-free ESM rather than compiled TypeScript.
import { AUDIO_TOOL_TIMEOUT_MS, MALTLINE_AUDIO_CUES, MAX_AUDIO_RUNTIME_BYTES, MAX_AUDIO_TOOL_OUTPUT_BYTES, authorizeAudioGeneration, canonicalizeAudioPlan, executeApprovedPlan, hashAudioPlan, parseAudioProductionArguments, runAudioProductionCli, summarizeAudioPlan, validatePlan } from '../tools/audio-production.mjs';

const NOW = '2026-09-10T12:00:00.000Z';
const APPROVAL_EXPIRES = '2026-09-10T13:00:00.000Z';
const TEST_API_KEY = 'offline-test-key-never-sent';
const APPROVAL_KEY = 'MALTLINE_AUDIO_GENERATION_APPROVAL';
const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
const roots: string[] = [];

const REAL_FILE_SYSTEM = Object.freeze({ appendFile, link, lstat, mkdir, readFile, realpath, unlink, writeFile });

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function validAsset(overrides = {}) {
  return {
    id: 'ml_sfx_serve_hit_v001',
    event: 'served',
    kind: 'one-shot',
    prompt: 'A compact paper soda cup landing softly on a polished diner counter',
    durationSeconds: 0.7,
    loop: false,
    promptInfluence: 0.55,
    outputFormat: 'mp3_44100_192',
    targetLufs: -18,
    ...overrides,
  };
}

function validPlan(overrides = {}) {
  return {
    schemaVersion: 1,
    provider: 'elevenlabs',
    modelId: 'eleven_text_to_sound_v2',
    commercialRightsBasis: 'paid-subscription',
    termsReviewedOn: '2026-09-10',
    assets: [validAsset()],
    ...overrides,
  };
}

function normalizedPlan(overrides = {}) {
  return validatePlan(validPlan(overrides), { now: NOW });
}

function approvalValue(plan: ReturnType<typeof normalizedPlan>, overrides = {}) {
  const budget = summarizeAudioPlan(plan);
  return {
    planSha256: hashAudioPlan(plan),
    maximumAssets: budget.assets,
    maximumSeconds: budget.totalSeconds,
    maximumCredits: budget.estimatedCredits,
    expiresAt: APPROVAL_EXPIRES,
    ...overrides,
  };
}

function environmentFor(plan: ReturnType<typeof normalizedPlan>, overrides = {}) {
  return Object.freeze({
    ELEVENLABS_API_KEY: TEST_API_KEY,
    [APPROVAL_KEY]: JSON.stringify(approvalValue(plan)),
    ...overrides,
  });
}

function authorizationFor(plan: ReturnType<typeof normalizedPlan>, approvalOverrides = {}) {
  return authorizeAudioGeneration(true, Object.freeze({
    ELEVENLABS_API_KEY: TEST_API_KEY,
    [APPROVAL_KEY]: JSON.stringify(approvalValue(plan, approvalOverrides)),
  }), plan, { now: NOW });
}

function cliDependencies(overrides = {}) {
  const plan = normalizedPlan();
  return {
    readText: async () => JSON.stringify(plan),
    writeOutput: () => {},
    environment: Object.freeze({}),
    now: NOW,
    executePlan: async () => {
      throw new Error('offline test must not execute a production plan');
    },
    ...overrides,
  };
}

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'maltline-audio-test-'));
  roots.push(root);
  return root;
}

function successfulResponse(bytes = MP3_BYTES, headers: Record<string, string> = {}) {
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': String(bytes.length),
      'request-id': 'request-offline-1',
      'x-trace-id': 'trace-offline-1',
      'character-cost': '14',
      ...headers,
    },
  });
}

function probe(
  codec: string,
  sampleRate = codec === 'mp3' ? '44100' : '48000',
  formatName = codec === 'mp3' ? 'mp3' : codec === 'pcm_s24le' ? 'wav' : 'ogg',
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify({
    streams: [{ codec_type: 'audio', codec_name: codec, sample_rate: sampleRate, channels: 1 }],
    format: { format_name: formatName, duration: '0.7' },
    ...overrides,
  });
}

function successfulRunner(overrides: {
  failCommand?: (command: string, args: string[]) => Error | null;
} = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner = async (command: string, args: string[]) => {
    calls.push({ command, args: [...args] });
    const failure = overrides.failCommand?.(command, args);
    if (failure) throw failure;
    if (args[0] === '-version') return { stdout: `${command} version offline-test\n`, stderr: '' };
    if (command === 'ffmpeg') {
      const output = args.at(-1)!;
      await writeFile(output, output.endsWith('.wav') ? Buffer.from('test-wave') : Buffer.from('test-opus'), { flag: 'wx' });
      return { stdout: '', stderr: '' };
    }
    const input = args.at(-1)!;
    return {
      stdout: input.includes('.source.mp3')
        ? probe('mp3')
        : input.endsWith('.ogg')
          ? probe('opus')
          : probe('pcm_s24le'),
      stderr: '',
    };
  };
  return { runner, calls };
}

async function executionHarness(overrides: Record<string, unknown> = {}) {
  const stagingRoot = await temporaryRoot();
  const runner = successfulRunner();
  let fetchCount = 0;
  let output = '';
  const options: Record<string, any> = {
    stagingRoot,
    now: NOW,
    runner: runner.runner,
    fetch: async () => {
      fetchCount++;
      return successfulResponse();
    },
    writeOutput: (message: string) => { output += message; },
    ...overrides,
  };
  return {
    stagingRoot,
    runner,
    options,
    fetchCount: () => fetchCount,
    output: () => output,
  };
}

function assetPaths(stagingRoot: string, id = 'ml_sfx_serve_hit_v001') {
  const directory = join(stagingRoot, id);
  return {
    directory,
    lock: join(directory, `${id}.lock.json`),
    journal: join(directory, `${id}.journal.ndjson`),
    source: join(directory, `${id}.source.mp3`),
    master: join(directory, `${id}.master.wav`),
    runtime: join(directory, `${id}.runtime.ogg`),
    manifest: join(directory, `${id}.provenance.json`),
  };
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function journalStates(path: string) {
  return (await readFile(path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line).state);
}

describe('audio production plan identity and validation', () => {
  it('accepts only exact plan and asset schemas and returns frozen copies', () => {
    const raw = validPlan();
    const validated = validatePlan(raw, { now: NOW });
    expect(validated).toEqual(raw);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.assets)).toBe(true);
    expect(Object.isFrozen(validated.assets[0])).toBe(true);

    for (const invalid of [
      { ...validPlan(), unexpected: true },
      (() => {
        const { provider: _provider, ...withoutProvider } = validPlan();
        return withoutProvider;
      })(),
      { ...validPlan(), assets: [{ ...validAsset(), unexpected: true }] },
      (() => {
        const { prompt: _prompt, ...withoutPrompt } = validAsset();
        return { ...validPlan(), assets: [withoutPrompt] };
      })(),
    ]) {
      expect(() => validatePlan(invalid, { now: NOW })).toThrow(/must contain exactly/i);
    }
  });

  it('uses stable canonical key ordering and tamper-sensitive SHA-256 plan identity', () => {
    const plan = normalizedPlan();
    const reordered = {
      assets: plan.assets.map((asset: Record<string, unknown>) => ({
        targetLufs: asset.targetLufs,
        outputFormat: asset.outputFormat,
        promptInfluence: asset.promptInfluence,
        loop: asset.loop,
        durationSeconds: asset.durationSeconds,
        prompt: asset.prompt,
        kind: asset.kind,
        event: asset.event,
        id: asset.id,
      })),
      termsReviewedOn: plan.termsReviewedOn,
      commercialRightsBasis: plan.commercialRightsBasis,
      modelId: plan.modelId,
      provider: plan.provider,
      schemaVersion: plan.schemaVersion,
    };
    expect(canonicalizeAudioPlan(reordered)).toBe(canonicalizeAudioPlan(plan));
    expect(hashAudioPlan(reordered)).toBe(hashAudioPlan(plan));
    expect(hashAudioPlan({ ...reordered, termsReviewedOn: '2026-09-09' })).not.toBe(hashAudioPlan(plan));
    expect(hashAudioPlan(plan)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([
    ['schemaVersion', { schemaVersion: 2 }],
    ['provider', { provider: 'another-provider' }],
    ['modelId', { modelId: 'moving-default' }],
  ])('rejects an unsupported plan %s', (_field, override) => {
    expect(() => validatePlan(validPlan(override), { now: NOW })).toThrow();
  });

  it.each([
    ['unknown event', { event: 'score_anything' }, /supported.*cue/i],
    ['blank prompt', { prompt: '' }, /prompt/i],
    ['long prompt', { prompt: 'x'.repeat(451) }, /prompt/i],
    ['short duration', { durationSeconds: 0.49 }, /duration/i],
    ['long duration', { durationSeconds: 30.01 }, /duration/i],
    ['negative influence', { promptInfluence: -0.01 }, /influence/i],
    ['high influence', { promptInfluence: 1.01 }, /influence/i],
    ['quiet target', { targetLufs: -30.01 }, /targetLufs/i],
    ['loud target', { targetLufs: -11.99 }, /targetLufs/i],
  ])('rejects asset semantics/bounds: %s', (_label, override, message) => {
    expect(() => validatePlan(validPlan({ assets: [validAsset(override)] }), { now: NOW })).toThrow(message);
  });

  it('defines every currently approved semantic cue', () => {
    expect(MALTLINE_AUDIO_CUES).toEqual([
      'nav_station', 'nav_lane', 'blend_loop', 'blend_completed', 'shake_launched', 'served', 'jar_caught',
      'shake_smashed', 'jar_smashed', 'walkout', 'life_lost', 'stage_cleared', 'game_lost',
      'campaign_victory', 'customer_spawned', 'jar_returned', 'no_clean_jar', 'diner_ambience',
    ]);
  });

  it('accepts inclusive boundaries and a correctly paired loop', () => {
    expect(() => validatePlan(validPlan({
      assets: [
        validAsset({
          id: 'ml_loop_blend_low_v001',
          event: 'blend_loop',
          kind: 'loop',
          loop: true,
          durationSeconds: 0.5,
          promptInfluence: 0,
          outputFormat: 'mp3_44100_128',
          targetLufs: -30,
        }),
        validAsset({
          id: 'ml_sfx_outcome_high_v001',
          event: 'campaign_victory',
          durationSeconds: 30,
          promptInfluence: 1,
          targetLufs: -12,
        }),
      ],
    }), { now: NOW })).not.toThrow();
  });

  it('enforces batch size, duplicate IDs, kind/loop agreement, and prefix/kind agreement', () => {
    expect(() => validatePlan(validPlan({ assets: [] }), { now: NOW })).toThrow(/1 through 64/i);
    expect(() => validatePlan(validPlan({
      assets: Array.from({ length: 65 }, (_, index) => validAsset({ id: `ml_sfx_batch_${index}_v001` })),
    }), { now: NOW })).toThrow(/1 through 64/i);
    expect(() => validatePlan(validPlan({ assets: [validAsset(), validAsset()] }), { now: NOW })).toThrow(/duplicated/i);
    expect(() => validatePlan(validPlan({ assets: [validAsset({ loop: true })] }), { now: NOW })).toThrow(/loop.*kind/i);
    expect(() => validatePlan(validPlan({
      assets: [validAsset({ id: 'ml_loop_wrong_v001' })],
    }), { now: NOW })).toThrow(/prefix.*kind/i);
    expect(() => validatePlan(validPlan({
      assets: [validAsset({ id: 'ml_sfx_wrong_v001', event: 'blend_loop', kind: 'loop', loop: true })],
    }), { now: NOW })).toThrow(/prefix.*kind/i);
  });

  it.each([
    ['free-plan rights', { commercialRightsBasis: 'free-plan' }, /paid-subscription/i],
    ['missing date', { termsReviewedOn: '' }, /YYYY-MM-DD/i],
    ['locale date', { termsReviewedOn: '09/10/2026' }, /YYYY-MM-DD/i],
    ['impossible date', { termsReviewedOn: '2026-02-30' }, /YYYY-MM-DD/i],
    ['future date', { termsReviewedOn: '2026-09-11' }, /future/i],
    ['stale date', { termsReviewedOn: '2026-08-10' }, /30 days/i],
  ])('rejects invalid or stale provenance: %s', (_label, override, message) => {
    expect(() => validatePlan(validPlan(override), { now: NOW })).toThrow(message);
  });

  it('calculates a conservative explicit request budget', () => {
    const plan = normalizedPlan({
      assets: [
        validAsset({ durationSeconds: 0.51 }),
        validAsset({ id: 'ml_sfx_jar_v001', event: 'jar_caught', durationSeconds: 1.01 }),
      ],
    });
    expect(summarizeAudioPlan(plan)).toEqual({ assets: 2, totalSeconds: 1.52, estimatedCredits: 62 });
  });
});

describe('plan-bound approval and CLI safety', () => {
  it('prints a dry-run plan hash/budget without authorizing or executing', async () => {
    const plan = normalizedPlan();
    let output = '';
    let executions = 0;
    const result = await runAudioProductionCli(
      ['--plan', '/virtual/audio-plan.json'],
      cliDependencies({
        readText: async () => JSON.stringify(plan),
        writeOutput: (message: string) => { output += message; },
        executePlan: async () => { executions++; },
      }),
    );

    expect(result).toEqual({
      mode: 'dry-run',
      assetCount: 1,
      planSha256: hashAudioPlan(plan),
      budget: { assets: 1, totalSeconds: 0.7, estimatedCredits: 28 },
    });
    expect(output).toContain(`plan=${hashAudioPlan(plan)}`);
    expect(output).toContain('seconds=0.7 credits<=28');
    expect(executions).toBe(0);
  });

  it('rejects unknown/duplicate arguments and resume without execute before reading a plan', async () => {
    let reads = 0;
    await expect(runAudioProductionCli(
      ['--plan', '/virtual/audio-plan.json', '--surprise'],
      cliDependencies({ readText: async () => { reads++; return JSON.stringify(validPlan()); } }),
    )).rejects.toThrow(/unsupported argument/i);
    expect(reads).toBe(0);
    expect(() => parseAudioProductionArguments(['--help', '--surprise'])).toThrow(/unsupported argument/i);
    expect(() => parseAudioProductionArguments(['--resume', '--plan', 'plan.json'])).toThrow(/requires --execute/i);
    expect(() => parseAudioProductionArguments(['--execute', '--execute', '--plan', 'plan.json']))
      .toThrow(/only once/i);
    expect(() => parseAudioProductionArguments([])).toThrow(/--plan is required/i);
  });

  it('requires --execute, exact bounded approval, and a key without mutating or logging process.env', async () => {
    const plan = normalizedPlan();
    const originalApproval = process.env[APPROVAL_KEY];
    const originalKey = process.env.ELEVENLABS_API_KEY;

    await expect(runAudioProductionCli(
      ['--plan', '/virtual/audio-plan.json', '--execute'],
      cliDependencies({ readText: async () => JSON.stringify(plan), environment: Object.freeze({ ELEVENLABS_API_KEY: TEST_API_KEY }) }),
    )).rejects.toThrow(new RegExp(APPROVAL_KEY, 'u'));

    await expect(runAudioProductionCli(
      ['--plan', '/virtual/audio-plan.json', '--execute'],
      cliDependencies({
        readText: async () => JSON.stringify(plan),
        environment: Object.freeze({ [APPROVAL_KEY]: JSON.stringify(approvalValue(plan)) }),
      }),
    )).rejects.toThrow(/ELEVENLABS_API_KEY/u);

    let receivedAuthorization: unknown;
    let output = '';
    const result = await runAudioProductionCli(
      ['--plan', '/virtual/audio-plan.json', '--execute'],
      cliDependencies({
        readText: async () => JSON.stringify(plan),
        environment: environmentFor(plan),
        writeOutput: (message: string) => { output += message; },
        executePlan: async (_plan: unknown, authorization: unknown) => { receivedAuthorization = authorization; },
      }),
    );

    expect(result.mode).toBe('execute');
    expect((receivedAuthorization as { apiKey: string }).apiKey).toBe(TEST_API_KEY);
    expect(output).not.toContain(TEST_API_KEY);
    expect(process.env[APPROVAL_KEY]).toBe(originalApproval);
    expect(process.env.ELEVENLABS_API_KEY).toBe(originalKey);
    expect(authorizeAudioGeneration(false, Object.freeze({}), plan, { now: NOW })).toBeNull();
  });

  it.each([
    ['changed plan', () => ({ planSha256: '0'.repeat(64) }), /exact plan/i],
    ['expired', () => ({ expiresAt: NOW }), /expired/i],
    ['overlong approval', () => ({ expiresAt: '2026-09-12T12:00:00.000Z' }), /24 hours/i],
    ['asset ceiling', () => ({ maximumAssets: 0 }), /maximumAssets/i],
    ['seconds ceiling', () => ({ maximumSeconds: 0.6 }), /seconds ceiling/i],
    ['credit ceiling', () => ({ maximumCredits: 27 }), /credit ceiling/i],
  ])('rejects %s approval before execution', (_label, change, message) => {
    const plan = normalizedPlan();
    expect(() => authorizationFor(plan, change())).toThrow(message);
  });

  it('rejects malformed and extra-key approval JSON', () => {
    const plan = normalizedPlan();
    expect(() => authorizeAudioGeneration(true, Object.freeze({
      ELEVENLABS_API_KEY: TEST_API_KEY,
      [APPROVAL_KEY]: '{',
    }), plan, { now: NOW })).toThrow(/valid JSON/i);
    expect(() => authorizeAudioGeneration(true, Object.freeze({
      ELEVENLABS_API_KEY: TEST_API_KEY,
      [APPROVAL_KEY]: JSON.stringify({ ...approvalValue(plan), surprise: true }),
    }), plan, { now: NOW })).toThrow(/exactly/i);
  });
});

describe('offline paid-path state machine', () => {
  it('preflights tools, reserves all assets before fetching, executes sequentially, and records provenance', async () => {
    const plan = normalizedPlan({
      assets: [
        validAsset(),
        validAsset({ id: 'ml_sfx_jar_catch_v001', event: 'jar_caught' }),
      ],
    });
    const harness = await executionHarness();
    let active = 0;
    let maximumActive = 0;
    const fetched: string[] = [];
    harness.options.fetch = async (_url: string, init: RequestInit) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      const request = JSON.parse(String(init.body));
      fetched.push(request.text);
      for (const asset of plan.assets) {
        expect(await pathExists(assetPaths(harness.stagingRoot, asset.id).lock)).toBe(true);
      }
      await Promise.resolve();
      active--;
      return successfulResponse();
    };

    const result = await executeApprovedPlan(plan, authorizationFor(plan), harness.options);

    expect(result.results).toEqual(['completed', 'completed']);
    expect(fetched).toEqual(plan.assets.map((asset: { prompt: string }) => asset.prompt));
    expect(maximumActive).toBe(1);
    expect(harness.runner.calls.slice(0, 2)).toEqual([
      { command: 'ffmpeg', args: ['-version'] },
      { command: 'ffprobe', args: ['-version'] },
    ]);
    for (const asset of plan.assets) {
      const paths = assetPaths(harness.stagingRoot, asset.id);
      expect(await pathExists(paths.lock)).toBe(false);
      expect(await journalStates(paths.journal)).toEqual([
        'reserved', 'request_started', 'response_received', 'acquired', 'source_validated',
        'normalization_started', 'normalization_ready', 'normalized', 'completed',
      ]);
      const manifest = JSON.parse(await readFile(paths.manifest, 'utf8'));
      expect(manifest.schemaVersion).toBe(2);
      expect(manifest.planSha256).toBe(hashAudioPlan(plan));
      expect(manifest.normalization.targets).toEqual({ integratedLufs: -18, truePeakDbtp: -1 });
      expect(manifest.normalization.measurements).toBeNull();
      expect(manifest.normalization.measurementStatus).toBe('pending-final-mastering');
      expect(manifest.normalization.probes).toEqual({
        master: {
          container: 'wav', codecName: 'pcm_s24le', sampleRate: 48_000,
          channels: 1, durationSeconds: 0.7,
        },
        runtime: {
          container: 'ogg', codecName: 'opus', sampleRate: 48_000,
          channels: 1, durationSeconds: 0.7,
        },
      });
      expect(JSON.stringify(manifest)).not.toContain(TEST_API_KEY);
      expect(await readFile(paths.source)).toEqual(MP3_BYTES);
    }
  });

  it('fails tool preflight before reserving a path or fetching', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness({ runner: async () => { throw new Error('ffmpeg is unavailable'); } });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/unavailable/i);
    expect(harness.fetchCount()).toBe(0);
    expect(await pathExists(assetPaths(harness.stagingRoot).directory)).toBe(false);
  });

  it('rechecks approval expiry at execution time before tools, paths, or fetch', async () => {
    const plan = normalizedPlan();
    const authorization = authorizationFor(plan);
    let runnerCalls = 0;
    let fetches = 0;
    const harness = await executionHarness({
      now: '2026-09-10T13:00:00.000Z',
      runner: async () => { runnerCalls++; return { stdout: '', stderr: '' }; },
      fetch: async () => { fetches++; return successfulResponse(); },
    });
    await expect(executeApprovedPlan(plan, authorization, harness.options)).rejects.toThrow(/expired/i);
    expect(runnerCalls).toBe(0);
    expect(fetches).toBe(0);
    expect(await pathExists(assetPaths(harness.stagingRoot).directory)).toBe(false);
  });

  it.each([
    ['extra plan field', () => ({ ...validPlan(), unsupported: true }), /contain exactly/i],
    ['traversal asset id', () => validPlan({ assets: [validAsset({ id: '../outside' })] }), /naming convention/i],
    ['separator asset id', () => validPlan({ assets: [validAsset({ id: 'ml_sfx_bad/name_v001' })] }), /naming convention/i],
    ['stale rights review', () => validPlan({ termsReviewedOn: '2026-08-10' }), /30 days/i],
    ['unsupported model', () => validPlan({ modelId: 'moving-provider-default' }), /modelId/i],
    ['unsupported event', () => validPlan({ assets: [validAsset({ event: 'charge_card' })] }), /supported.*cue/i],
    ['unsupported output', () => validPlan({ assets: [validAsset({ outputFormat: 'wav' })] }), /unsupported/i],
    ['oversized batch', () => validPlan({
      assets: Array.from({ length: 65 }, (_, index) => validAsset({ id: `ml_sfx_direct_${index}_v001` })),
    }), /1 through 64/i],
  ])('revalidates direct execution plans before tools or fetch: %s', async (_label, makePlan, message) => {
    const approvedPlan = normalizedPlan();
    const harness = await executionHarness();
    await expect(executeApprovedPlan(makePlan(), authorizationFor(approvedPlan), harness.options))
      .rejects.toThrow(message);
    expect(harness.runner.calls).toHaveLength(0);
    expect(harness.fetchCount()).toBe(0);
    expect(await pathExists(assetPaths(harness.stagingRoot).directory)).toBe(false);
  });

  it('rejects plan accessors without invoking them or starting tools', async () => {
    const approvedPlan = normalizedPlan();
    const raw = validPlan();
    let getterCalls = 0;
    Object.defineProperty(raw.assets[0], 'prompt', {
      enumerable: true,
      get: () => {
        getterCalls++;
        return 'must not be observed';
      },
    });
    const harness = await executionHarness();
    await expect(executeApprovedPlan(raw, authorizationFor(approvedPlan), harness.options))
      .rejects.toThrow(/enumerable data property/i);
    expect(getterCalls).toBe(0);
    expect(harness.runner.calls).toHaveLength(0);
    expect(harness.fetchCount()).toBe(0);
  });

  it('rejects a valid source plan mutated after authorization before any side effect', async () => {
    const raw = validPlan();
    const approvedPlan = validatePlan(raw, { now: NOW });
    const authorization = authorizationFor(approvedPlan);
    raw.assets[0].prompt = 'A different, unapproved paid generation request';
    const harness = await executionHarness();

    await expect(executeApprovedPlan(raw, authorization, harness.options)).rejects.toThrow(/exact plan/i);
    expect(harness.runner.calls).toHaveLength(0);
    expect(harness.fetchCount()).toBe(0);
    expect(await pathExists(assetPaths(harness.stagingRoot).directory)).toBe(false);
  });

  it('executes only the normalized snapshot when the caller mutates its source after invocation', async () => {
    const raw = validPlan();
    const approvedPlan = validatePlan(raw, { now: NOW });
    const authorization = authorizationFor(approvedPlan);
    let requestedPrompt = '';
    const harness = await executionHarness({
      fetch: async (_url: string, init: RequestInit) => {
        requestedPrompt = JSON.parse(String(init.body)).text;
        return successfulResponse();
      },
    });

    const execution = executeApprovedPlan(raw, authorization, harness.options);
    raw.assets[0].prompt = 'Mutation after the execution boundary';
    raw.assets.push(validAsset({ id: 'ml_sfx_unapproved_v001', event: 'walkout' }));
    await expect(execution).resolves.toEqual({ results: ['completed'] });
    expect(requestedPrompt).toBe(approvedPlan.assets[0].prompt);
    expect(await pathExists(assetPaths(harness.stagingRoot, 'ml_sfx_unapproved_v001').directory)).toBe(false);
  });

  it('rejects a staging-root symlink before tools, fetch, or writes through the link', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    const outside = await temporaryRoot();
    await rm(harness.stagingRoot, { recursive: true });
    await symlink(outside, harness.stagingRoot, 'dir');

    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
      .rejects.toThrow(/staging root.*symbolic link/i);
    expect(harness.runner.calls).toHaveLength(0);
    expect(harness.fetchCount()).toBe(0);
    expect(await readdir(outside)).toEqual([]);
  });

  it('rejects a symlink ancestor of an absent staging root without creating through it', async () => {
    const plan = normalizedPlan();
    const container = await temporaryRoot();
    const outside = await temporaryRoot();
    const linkedParent = join(container, 'linked-parent');
    const requestedRoot = join(linkedParent, 'new-staging-root');
    await symlink(outside, linkedParent, 'dir');
    const harness = await executionHarness({ stagingRoot: requestedRoot });

    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
      .rejects.toThrow(/parents.*symbolic links/i);
    expect(harness.runner.calls).toHaveLength(0);
    expect(harness.fetchCount()).toBe(0);
    expect(await readdir(outside)).toEqual([]);
  });

  it('rejects a symlink or special file at an asset parent before tools and fetch', async () => {
    const plan = normalizedPlan();
    for (const kind of ['symlink', 'file'] as const) {
      const harness = await executionHarness();
      const outside = await temporaryRoot();
      const directory = assetPaths(harness.stagingRoot).directory;
      if (kind === 'symlink') await symlink(outside, directory, 'dir');
      else await writeFile(directory, 'not a directory');

      await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
        .rejects.toThrow(/asset directory.*real directory/i);
      expect(harness.runner.calls).toHaveLength(0);
      expect(harness.fetchCount()).toBe(0);
      expect(await readdir(outside)).toEqual([]);
    }
  });

  it('detects an asset-parent swap after reservation without fetching or mutating outside staging', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    const outside = await temporaryRoot();
    await writeFile(join(outside, 'canary'), 'unchanged');
    const paths = assetPaths(harness.stagingRoot);
    let swapped = false;
    let fetches = 0;
    const fileSystem = {
      ...REAL_FILE_SYSTEM,
      writeFile: async (path: string, data: string | Uint8Array, options?: object) => {
        const result = await writeFile(path, data, options);
        if (!swapped && path === paths.journal) {
          swapped = true;
          await rename(paths.directory, `${paths.directory}.reserved`);
          await symlink(outside, paths.directory, 'dir');
        }
        return result;
      },
    };

    await expect(executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      fileSystem,
      fetch: async () => {
        fetches++;
        return successfulResponse();
      },
    })).rejects.toThrow(/asset directory.*symbolic link/i);
    expect(swapped).toBe(true);
    expect(fetches).toBe(0);
    expect(await readdir(outside)).toEqual(['canary']);
    expect(await readFile(join(outside, 'canary'), 'utf8')).toBe('unchanged');
  });

  it('rechecks approval expiry before every sequential paid request', async () => {
    const plan = normalizedPlan({
      assets: [
        validAsset(),
        validAsset({ id: 'ml_sfx_jar_catch_v001', event: 'jar_caught' }),
      ],
    });
    let fetches = 0;
    const harness = await executionHarness({
      now: () => fetches === 0 ? NOW : APPROVAL_EXPIRES,
      fetch: async () => { fetches++; return successfulResponse(); },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
      .rejects.toThrow(/expired before requesting ml_sfx_jar_catch_v001/i);
    expect(fetches).toBe(1);
  });

  it.each(['source', 'master', 'runtime', 'manifest', 'journal'] as const)(
    'rejects an existing %s before fetch and releases its own lock',
    async (field) => {
      const plan = normalizedPlan();
      const harness = await executionHarness();
      const paths = assetPaths(harness.stagingRoot);
      await mkdir(paths.directory, { recursive: true });
      await writeFile(paths[field], 'existing');
      await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/already exists/i);
      expect(harness.fetchCount()).toBe(0);
      expect(await pathExists(paths.lock)).toBe(false);
    },
  );

  it('allows at most one concurrent execution to pass the atomic lock', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    let releaseFetch!: () => void;
    let startedFetch!: () => void;
    const started = new Promise<void>((resolvePromise) => { startedFetch = resolvePromise; });
    const gate = new Promise<void>((resolvePromise) => { releaseFetch = resolvePromise; });
    let fetches = 0;
    harness.options.fetch = async () => {
      fetches++;
      startedFetch();
      await gate;
      return successfulResponse();
    };

    const first = executeApprovedPlan(plan, authorizationFor(plan), harness.options);
    await started;
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(fetches).toBe(1);
    releaseFetch();
    await expect(first).resolves.toEqual({ results: ['completed'] });
    expect(fetches).toBe(1);
  });

  it.each([
    ['HTTP error', async () => new Response('failure', { status: 503 }), {}, /HTTP 503/i],
    ['missing media type', async () => new Response(MP3_BYTES), {}, /content type/i],
    ['wrong media type', async () => successfulResponse(MP3_BYTES, { 'content-type': 'application/json' }), {}, /content type/i],
    ['content encoding', async () => successfulResponse(MP3_BYTES, { 'content-encoding': 'gzip' }), {}, /content encoding/i],
    ['oversized declaration', async () => successfulResponse(MP3_BYTES, { 'content-length': '9' }), { maximumResponseBytes: 8 }, /byte limit/i],
    ['oversized stream', async () => {
      const response = successfulResponse();
      response.headers.delete('content-length');
      return response;
    }, { maximumResponseBytes: 7 }, /byte limit/i],
    ['truncated response', async () => successfulResponse(MP3_BYTES, { 'content-length': '9' }), {}, /length mismatch/i],
    ['invalid MP3 magic', async () => successfulResponse(Buffer.from('not-mp3')), {}, /recognizable MP3/i],
  ])('rejects %s with one request and no automatic retry', async (_label, fetch, optionOverrides, message) => {
    const plan = normalizedPlan();
    let fetches = 0;
    const harness = await executionHarness({
      ...optionOverrides,
      fetch: async () => { fetches++; return fetch(); },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(message);
    expect(fetches).toBe(1);
    expect(await journalStates(assetPaths(harness.stagingRoot).journal)).toEqual(['reserved', 'request_started', 'failed']);
  });

  it('times out and aborts a single request without retrying', async () => {
    const plan = normalizedPlan();
    let fetches = 0;
    let observedAbort = false;
    const harness = await executionHarness({
      requestTimeoutMs: 5,
      fetch: async (_url: string, init: RequestInit) => {
        fetches++;
        return new Promise((_resolvePromise, rejectPromise) => {
          init.signal!.addEventListener('abort', () => {
            observedAbort = true;
            rejectPromise(new DOMException('aborted', 'AbortError'));
          });
        });
      },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/timed out/i);
    expect(fetches).toBe(1);
    expect(observedAbort).toBe(true);
  });

  it('preserves acquired source/journal on decode failure and resumes without another request', async () => {
    const plan = normalizedPlan();
    let fetches = 0;
    const harness = await executionHarness({ fetch: async () => { fetches++; return successfulResponse(); } });
    const baseRunner = successfulRunner();
    harness.options.runner = async (command: string, args: string[]) => {
      if (command === 'ffprobe' && args.at(-1)?.includes('.source.mp3')) {
        return { stdout: probe('aac'), stderr: '' };
      }
      return baseRunner.runner(command, args);
    };

    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/decode validation/i);
    const paths = assetPaths(harness.stagingRoot);
    expect(await readFile(paths.source)).toEqual(MP3_BYTES);
    expect(await journalStates(paths.journal)).toEqual([
      'reserved', 'request_started', 'response_received', 'acquired', 'failed',
    ]);

    await executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      runner: successfulRunner().runner,
      fetch: async () => { fetches++; throw new Error('resume must not fetch'); },
    });
    expect(fetches).toBe(1);
    expect(await journalStates(paths.journal)).toEqual([
      'reserved', 'request_started', 'response_received', 'acquired', 'failed',
      'resume_started', 'source_validated', 'normalization_started', 'normalization_ready', 'normalized', 'completed',
    ]);
  });

  it('accepts an API-contract-compatible stereo MP3 source and proves mono derivatives', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    const base = successfulRunner();
    harness.options.runner = async (command: string, args: string[]) => {
      if (command === 'ffprobe' && args.at(-1)?.includes('.source.mp3')) {
        return { stdout: probe('mp3', '44100', 'mp3', {
          streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '44100', channels: 2 }],
        }), stderr: '' };
      }
      return base.runner(command, args);
    };

    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
      .resolves.toEqual({ results: ['completed'] });
    const manifest = JSON.parse(await readFile(assetPaths(harness.stagingRoot).manifest, 'utf8'));
    expect(manifest.generation.sourceProbe.channels).toBe(2);
    expect(manifest.normalization.probes.master.channels).toBe(1);
    expect(manifest.normalization.probes.runtime.channels).toBe(1);
  });

  it('preserves acquisition after normalization failure and resumes without re-billing', async () => {
    const plan = normalizedPlan();
    let fetches = 0;
    const failingRunner = successfulRunner({
      failCommand: (command, args) => command === 'ffmpeg' && args[0] !== '-version'
        ? new Error('offline normalization failure')
        : null,
    });
    const harness = await executionHarness({
      runner: failingRunner.runner,
      fetch: async () => { fetches++; return successfulResponse(); },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/normalization failure/i);
    const paths = assetPaths(harness.stagingRoot);
    expect(await readFile(paths.source)).toEqual(MP3_BYTES);
    expect(await journalStates(paths.journal)).toEqual([
      'reserved', 'request_started', 'response_received', 'acquired', 'source_validated',
      'normalization_started', 'failed',
    ]);

    await executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      runner: successfulRunner().runner,
      fetch: async () => { fetches++; throw new Error('resume must not fetch'); },
    });
    expect(fetches).toBe(1);
    expect(await pathExists(paths.manifest)).toBe(true);
  });

  it.each([
    ['malformed JSON', '{', /invalid JSON/i],
    ['empty streams', JSON.stringify({ streams: [], format: { format_name: 'ogg', duration: '0.7' } }), /decode validation/i],
    ['wrong codec', probe('vorbis'), /decode validation/i],
    ['wrong container', probe('opus', '48000', 'matroska'), /decode validation/i],
    ['wrong sample rate', probe('opus', '44100'), /decode validation/i],
    ['wrong channel count', JSON.stringify({
      streams: [{ codec_type: 'audio', codec_name: 'opus', sample_rate: '48000', channels: 2 }],
      format: { format_name: 'ogg', duration: '0.7' },
    }), /decode validation/i],
    ['multiple streams', JSON.stringify({
      streams: [
        { codec_type: 'audio', codec_name: 'opus', sample_rate: '48000', channels: 1 },
        { codec_type: 'video', codec_name: 'png' },
      ],
      format: { format_name: 'ogg', duration: '0.7' },
    }), /decode validation/i],
    ['duration drift', JSON.stringify({
      streams: [{ codec_type: 'audio', codec_name: 'opus', sample_rate: '48000', channels: 1 }],
      format: { format_name: 'ogg', duration: '0.9' },
    }), /duration differs/i],
  ])('fails closed on runtime Ogg %s and preserves paid source', async (_label, runtimeProbe, error) => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    const base = successfulRunner();
    harness.options.runner = async (command: string, args: string[]) => {
      if (command === 'ffprobe' && args.at(-1)?.endsWith('.ogg')) {
        return { stdout: runtimeProbe, stderr: '' };
      }
      return base.runner(command, args);
    };
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(error);
    const paths = assetPaths(harness.stagingRoot);
    expect(await readFile(paths.source)).toEqual(MP3_BYTES);
    expect(await pathExists(paths.master)).toBe(false);
    expect(await pathExists(paths.runtime)).toBe(false);
    expect(await journalStates(paths.journal)).toEqual([
      'reserved', 'request_started', 'response_received', 'acquired', 'source_validated',
      'normalization_started', 'failed',
    ]);
  });

  it('rejects empty and oversized derivatives before probing or promotion', async () => {
    const plan = normalizedPlan();
    for (const [suffix, derivativeBytes, limits, message] of [
      ['.ogg', Buffer.alloc(0), { maximumRuntimeBytes: MAX_AUDIO_RUNTIME_BYTES }, /must contain 1 through/i],
      ['.ogg', Buffer.from('123456789'), { maximumRuntimeBytes: 8 }, /must contain 1 through 8 bytes/i],
      ['.wav', Buffer.from('123456789'), { maximumMasterBytes: 8 }, /must contain 1 through 8 bytes/i],
    ] as const) {
      const harness = await executionHarness(limits);
      const base = successfulRunner();
      harness.options.runner = async (command: string, args: string[]) => {
        if (command === 'ffmpeg' && args.at(-1)?.endsWith(suffix)) {
          await writeFile(args.at(-1)!, derivativeBytes, { flag: 'wx' });
          return { stdout: '', stderr: '' };
        }
        return base.runner(command, args);
      };
      await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(message);
      expect(await pathExists(assetPaths(harness.stagingRoot).runtime)).toBe(false);
    }
  });

  it('bounds tool output and aborts a timed-out runtime probe without retry', async () => {
    const plan = normalizedPlan();
    for (const mode of ['output', 'timeout'] as const) {
      let observedAbort = false;
      let runtimeProbes = 0;
      const harness = await executionHarness({
        maximumToolOutputBytes: mode === 'output' ? 256 : MAX_AUDIO_TOOL_OUTPUT_BYTES,
        toolTimeoutMs: mode === 'timeout' ? 5 : AUDIO_TOOL_TIMEOUT_MS,
      });
      const base = successfulRunner();
      harness.options.runner = async (
        command: string,
        args: string[],
        options?: { signal?: AbortSignal },
      ) => {
        if (command === 'ffprobe' && args.at(-1)?.endsWith('.ogg')) {
          runtimeProbes++;
          if (mode === 'output') return { stdout: 'x'.repeat(257), stderr: '' };
          return new Promise((_resolvePromise, rejectPromise) => {
            options?.signal?.addEventListener('abort', () => {
              observedAbort = true;
              rejectPromise(new Error('offline probe aborted'));
            }, { once: true });
          });
        }
        return base.runner(command, args);
      };
      await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
        .rejects.toThrow(mode === 'output' ? /output exceeds/i : /timed out/i);
      expect(runtimeProbes).toBe(1);
      expect(observedAbort).toBe(mode === 'timeout');
      expect(await pathExists(assetPaths(harness.stagingRoot).runtime)).toBe(false);
    }
  });

  it('rejects a symlinked runtime derivative without reading or promoting its target', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    const outside = join(harness.stagingRoot, 'outside-runtime.ogg');
    const canary = Buffer.from('outside-canary');
    await writeFile(outside, canary);
    const base = successfulRunner();
    harness.options.runner = async (command: string, args: string[]) => {
      if (command === 'ffmpeg' && args.at(-1)?.endsWith('.ogg')) {
        await symlink(outside, args.at(-1)!);
        return { stdout: '', stderr: '' };
      }
      return base.runner(command, args);
    };
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
      .rejects.toThrow(/runtime Ogg.*symbolic link/i);
    expect(await readFile(outside)).toEqual(canary);
    expect(await pathExists(assetPaths(harness.stagingRoot).runtime)).toBe(false);
  });

  it('recovers an interrupted exclusive output promotion without overwriting or re-fetching', async () => {
    const plan = normalizedPlan();
    let fetches = 0;
    let failRuntimePromotion = true;
    const fileSystem = {
      ...REAL_FILE_SYSTEM,
      link: async (source: string, destination: string) => {
        if (failRuntimePromotion && destination.endsWith('.runtime.ogg')) {
          throw new Error('offline runtime promotion failure');
        }
        return link(source, destination);
      },
    };
    const harness = await executionHarness({
      fileSystem,
      fetch: async () => { fetches++; return successfulResponse(); },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options))
      .rejects.toThrow(/runtime promotion failure/i);
    const paths = assetPaths(harness.stagingRoot);
    expect(await pathExists(paths.master)).toBe(true);
    expect(await pathExists(paths.runtime)).toBe(false);
    expect(await journalStates(paths.journal)).toContain('normalization_ready');

    failRuntimePromotion = false;
    await executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; throw new Error('resume must not fetch'); },
    });
    expect(fetches).toBe(1);
    expect(await pathExists(paths.master)).toBe(true);
    expect(await pathExists(paths.runtime)).toBe(true);
    expect(await pathExists(paths.manifest)).toBe(true);
  });

  it('recovers a post-normalization provenance write failure without fetching or overwriting outputs', async () => {
    const plan = normalizedPlan();
    let fetches = 0;
    let failManifest = true;
    const fileSystem = {
      ...REAL_FILE_SYSTEM,
      writeFile: async (path: string, data: string | Uint8Array, options?: object) => {
        if (failManifest && path.endsWith('.provenance.json')) throw new Error('offline manifest write failure');
        return writeFile(path, data, options);
      },
    };
    const harness = await executionHarness({
      fileSystem,
      fetch: async () => { fetches++; return successfulResponse(); },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/manifest write failure/i);
    const paths = assetPaths(harness.stagingRoot);
    const masterBefore = await readFile(paths.master);
    const runtimeBefore = await readFile(paths.runtime);
    expect(await journalStates(paths.journal)).toContain('normalized');

    failManifest = false;
    await executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; throw new Error('resume must not fetch'); },
    });
    expect(fetches).toBe(1);
    expect(await readFile(paths.master)).toEqual(masterBefore);
    expect(await readFile(paths.runtime)).toEqual(runtimeBefore);
    expect(await pathExists(paths.manifest)).toBe(true);
  });

  it('never reissues a request when resume follows a pre-acquisition failure', async () => {
    const plan = normalizedPlan();
    let fetches = 0;
    const harness = await executionHarness({
      fetch: async () => { fetches++; return new Response('failed', { status: 500 }); },
    });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/HTTP 500/i);
    await expect(executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; return successfulResponse(); },
    })).rejects.toThrow(/will not be repeated/i);
    expect(fetches).toBe(1);
  });

  it('validates source hash on resume and never fetches a replacement', async () => {
    const plan = normalizedPlan();
    const failingRunner = successfulRunner({
      failCommand: (command, args) => command === 'ffmpeg' && args[0] !== '-version'
        ? new Error('pause after acquisition')
        : null,
    });
    const harness = await executionHarness({ runner: failingRunner.runner });
    await expect(executeApprovedPlan(plan, authorizationFor(plan), harness.options)).rejects.toThrow(/pause/i);
    const paths = assetPaths(harness.stagingRoot);
    await writeFile(paths.source, Buffer.from('tampered'));
    let fetches = 0;
    await expect(executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      runner: successfulRunner().runner,
      fetch: async () => { fetches++; return successfulResponse(); },
    })).rejects.toThrow(/does not match its journal/i);
    expect(fetches).toBe(0);
  });

  it('refuses a changed-plan resume and treats a completed resume as no-op without fetch', async () => {
    const original = normalizedPlan();
    const harness = await executionHarness();
    await executeApprovedPlan(original, authorizationFor(original), harness.options);
    let fetches = 0;
    const completed = await executeApprovedPlan(original, authorizationFor(original), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; return successfulResponse(); },
    });
    expect(completed.results).toEqual(['already-complete']);
    expect(fetches).toBe(0);

    const changed = normalizedPlan({ assets: [validAsset({ prompt: `${validAsset().prompt} changed` })] });
    await expect(executeApprovedPlan(changed, authorizationFor(changed), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; return successfulResponse(); },
    })).rejects.toThrow(/does not match this plan/i);
    expect(fetches).toBe(0);
  });

  it('validates completed source, manifest, and output hashes without fetching replacements', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    await executeApprovedPlan(plan, authorizationFor(plan), harness.options);
    const paths = assetPaths(harness.stagingRoot);
    await writeFile(paths.runtime, Buffer.from('tampered-runtime'));
    let fetches = 0;
    await expect(executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; return successfulResponse(); },
    })).rejects.toThrow(/normalized outputs?.*manifest/i);
    expect(fetches).toBe(0);
  });

  it('re-probes completed runtime media instead of trusting matching retained bytes', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    await executeApprovedPlan(plan, authorizationFor(plan), harness.options);
    const base = successfulRunner();
    let fetches = 0;
    await expect(executeApprovedPlan(plan, authorizationFor(plan), {
      ...harness.options,
      resume: true,
      fetch: async () => { fetches++; return successfulResponse(); },
      runner: async (command: string, args: string[]) => {
        if (command === 'ffprobe' && args.at(-1)?.endsWith('.runtime.ogg')) {
          return { stdout: probe('vorbis'), stderr: '' };
        }
        return base.runner(command, args);
      },
    })).rejects.toThrow(/runtime Ogg.*decode validation/i);
    expect(fetches).toBe(0);
  });

  it('keeps API credentials out of commands, output, journals, and manifests', async () => {
    const plan = normalizedPlan();
    const harness = await executionHarness();
    await executeApprovedPlan(plan, authorizationFor(plan), harness.options);
    const paths = assetPaths(harness.stagingRoot);
    const persisted = `${await readFile(paths.journal, 'utf8')}\n${await readFile(paths.manifest, 'utf8')}`;
    expect(persisted).not.toContain(TEST_API_KEY);
    expect(harness.output()).not.toContain(TEST_API_KEY);
    expect(JSON.stringify(harness.runner.calls)).not.toContain(TEST_API_KEY);
  });
});

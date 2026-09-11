import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  verifyAndHashMaltlineProof,
} from '@arcadebench/maltline';
import {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_WIN_PROOF,
} from '@arcadebench/maltline/testing';
import {
  MaltlineCompetitionClient,
  type MaltlineCompetitionFetch,
} from '@arcadebench/maltline/competition-client';
import { sha256Hex } from '../src/crypto';
import type { ArcadeBenchEnv } from '../src/env';
import {
  CALLSIGN_MODEL,
  CALLSIGN_POLICY_VERSION,
} from '../src/moderation';
import {
  MALTLINE_ERROR_CODES,
  MAX_MALTLINE_SCORE_BYTES,
  cleanupExpiredMaltlineProofs,
  reconcileMaltlineProofs,
} from '../src/maltline-worker';
import { maltlineGeneration2ProofObjectKey } from '../src/maltline-leaderboard';
import worker from '../src/worker';

const origin = 'https://arcadebench.org';
const api = `${origin}/api/v1/games/maltline`;
const edgeHeaders = { 'cf-connecting-ip': '203.0.113.10' } as const;

interface ChallengeResponse {
  id: string;
  nonce: number;
  seasonId: string;
  boardId: 'arcade';
  gameVersion: string;
  authority: typeof MALTLINE_GENERATION_2_AUTHORITY.identity;
  proofSchemaVersion: number;
  envelopeVersion: number;
  expiresAt: string;
}

function sessionCookie(response: Response): string {
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function cacheAllowedCallsign(playerName: string): Promise<void> {
  const moderationKey = await sha256Hex(
    `${CALLSIGN_POLICY_VERSION}\0${playerName.toLocaleLowerCase()}`,
  );
  await env.DB.prepare(`
    INSERT INTO callsign_moderation_cache
      (moderation_key, policy_version, allowed, category, model, created_at)
    VALUES (?, ?, 1, 'clean', ?, ?)
    ON CONFLICT (moderation_key) DO UPDATE SET
      policy_version = excluded.policy_version,
      allowed = excluded.allowed,
      category = excluded.category,
      model = excluded.model,
      created_at = excluded.created_at
  `).bind(
    moderationKey,
    CALLSIGN_POLICY_VERSION,
    CALLSIGN_MODEL,
    new Date().toISOString(),
  ).run();
}

async function beginRun(): Promise<{ challenge: ChallengeResponse; cookie: string }> {
  const response = await exports.default.fetch(`${api}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...edgeHeaders },
    body: JSON.stringify({ gameVersion: '0.1.0', boardId: 'arcade' }),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return {
    challenge: await response.json<ChallengeResponse>(),
    cookie: sessionCookie(response),
  };
}

function scoreRequest(
  challenge: ChallengeResponse,
  cookie: string,
  playerName: string,
  proof: unknown = GENERATION_2_LOSS_PROOF,
): Request {
  return new Request(`${api}/leaderboards/arcade`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, ...edgeHeaders },
    body: JSON.stringify({
      gameVersion: '0.1.0',
      runId: challenge.id,
      playerName,
      proof,
    }),
  });
}

function bucketWithFailingPuts(bucket: R2Bucket): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      if (property === 'put') return async () => { throw new Error('injected R2 put failure'); };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function workerBackedCompetitionClient(): MaltlineCompetitionClient {
  let cookie: string | undefined;
  const fetcher: MaltlineCompetitionFetch = async (input, init) => {
    if (typeof input !== 'string' || !input.startsWith('/')) {
      throw new Error('Composed Maltline client must use a relative same-origin URL.');
    }
    const headers = new Headers(init?.headers);
    headers.set('cf-connecting-ip', edgeHeaders['cf-connecting-ip']);
    if (cookie) headers.set('cookie', cookie);
    const response = await exports.default.fetch(new Request(new URL(input, origin), {
      ...init,
      headers,
    }));
    const issuedCookie = response.headers.get('set-cookie');
    if (issuedCookie) cookie = issuedCookie.split(';')[0]!;
    return response;
  };
  return new MaltlineCompetitionClient(fetcher);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function bucketWithBlockedPut(
  bucket: R2Bucket,
  started: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      if (property === 'put') {
        return async (...args: unknown[]) => {
          started.resolve();
          await release.promise;
          return (target.put as (...putArgs: unknown[]) => Promise<R2Object | null>)(...args);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function bucketWithBlockedMissingGet(
  bucket: R2Bucket,
  started: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      if (property === 'get') {
        return async () => {
          started.resolve();
          await release.promise;
          return null;
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function bucketWithFailingBodyRead(bucket: R2Bucket): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      if (property === 'get') {
        return async (...args: unknown[]) => {
          const object = await (target.get as (...getArgs: unknown[]) => Promise<R2ObjectBody | null>)(...args);
          if (!object) return null;
          return new Proxy(object, {
            get(objectTarget, objectProperty) {
              if (objectProperty === 'text') {
                return async () => { throw new Error('injected R2 body read failure'); };
              }
              const value = Reflect.get(objectTarget, objectProperty, objectTarget) as unknown;
              return typeof value === 'function' ? value.bind(objectTarget) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function bucketWithCapturedBlockedGet(
  bucket: R2Bucket,
  started: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      if (property === 'get') {
        return async (...args: unknown[]) => {
          const object = await (target.get as (...getArgs: unknown[]) => Promise<R2ObjectBody | null>)(...args);
          if (!object) return null;
          const canonicalJson = await object.text();
          const captured = new Proxy(object, {
            get(objectTarget, objectProperty) {
              if (objectProperty === 'text') return async () => canonicalJson;
              const value = Reflect.get(objectTarget, objectProperty, objectTarget) as unknown;
              return typeof value === 'function' ? value.bind(objectTarget) : value;
            },
          });
          started.resolve();
          await release.promise;
          return captured;
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function admissionEnv(
  baseEnv: ArcadeBenchEnv,
  outcomes: readonly boolean[],
  keys: string[],
): ArcadeBenchEnv {
  let call = 0;
  return {
    ...baseEnv,
    MALTLINE_ADMISSION_RATE_LIMITER: {
      async limit({ key }) {
        keys.push(key);
        return { success: outcomes[call++] ?? false };
      },
    },
  };
}

function inaccessibleBinding<T extends object>(binding: T, label: string): T {
  return new Proxy(binding, {
    get() {
      throw new Error(`${label} must not be reached after admission rejection`);
    },
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('Maltline public platform Worker', () => {
  it('runs with the configured workerd admission binding', () => {
    expect(env.MALTLINE_ADMISSION_RATE_LIMITER).toBeDefined();
    expect(env.MALTLINE_ADMISSION_RATE_LIMITER.limit).toEqual(expect.any(Function));
  });

  it('shares pre-session write admission across absent and rotated cookies', async () => {
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const keys: string[] = [];
    const guardedEnv = admissionEnv(baseEnv, [true, false], keys);
    const sessionCountBefore = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM anonymous_sessions',
    ).first<{ count: number }>();
    const runCountBefore = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM maltline_run_challenges',
    ).first<{ count: number }>();
    const makeRequest = (cookie?: string): Request => new Request(`${api}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.41',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ gameVersion: '0.1.0', boardId: 'arcade' }),
    });

    const firstRequest = makeRequest();
    const first = await worker.fetch(firstRequest, guardedEnv);
    expect(first.status, await first.clone().text()).toBe(201);
    expect(firstRequest.bodyUsed).toBe(true);

    const rotatedRequest = makeRequest('ab_session=anon_rotated000000.bad-signature');
    const rotated = await worker.fetch(rotatedRequest, guardedEnv);
    expect(rotated.status).toBe(429);
    expect(rotated.headers.get('retry-after')).toBe('60');
    expect(rotated.headers.get('set-cookie')).toBeNull();
    expect(rotatedRequest.bodyUsed).toBe(false);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);

    const sessionCountAfter = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM anonymous_sessions',
    ).first<{ count: number }>();
    const runCountAfter = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM maltline_run_challenges',
    ).first<{ count: number }>();
    expect(sessionCountAfter!.count - sessionCountBefore!.count).toBe(1);
    expect(runCountAfter!.count - runCountBefore!.count).toBe(1);
  });

  it('rejects proof GET, HEAD, and missing-ID probes before D1 or R2', async () => {
    const playerName = 'ADMISSION READ';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    const submitted = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(submitted.status).toBe(201);
    const submittedBody = await submitted.json<{ entry: { id: string } }>();
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const keys: string[] = [];
    const rejectedEnv = admissionEnv({
      ...baseEnv,
      DB: inaccessibleBinding(baseEnv.DB, 'D1'),
      REPLAYS: inaccessibleBinding(baseEnv.REPLAYS, 'R2'),
    }, [false, false, false, false], keys);
    const cases = [
      { method: 'GET', id: submittedBody.entry.id },
      { method: 'HEAD', id: submittedBody.entry.id },
      { method: 'GET', id: 'score_ABCDEFGHIJKLMNOP' },
    ] as const;

    for (const testCase of cases) {
      const response = await worker.fetch(new Request(`${api}/replays/${testCase.id}`, {
        method: testCase.method,
        headers: { 'cf-connecting-ip': '203.0.113.42' },
      }), rejectedEnv);
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('60');
      if (testCase.method === 'HEAD') expect(await response.text()).toBe('');
    }
    const board = await worker.fetch(new Request(`${api}/leaderboards/arcade`, {
      headers: { 'cf-connecting-ip': '203.0.113.42' },
    }), rejectedEnv);
    expect(board.status).toBe(429);
    expect(keys).toHaveLength(4);
    expect(new Set(keys.slice(0, 3)).size).toBe(1);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it('rejects score submission before body, session, verifier, storage, or moderation work', async () => {
    const { challenge, cookie } = await beginRun();
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const keys: string[] = [];
    const rejectedEnv = admissionEnv({
      ...baseEnv,
      DB: inaccessibleBinding(baseEnv.DB, 'D1'),
      REPLAYS: inaccessibleBinding(baseEnv.REPLAYS, 'R2'),
      AI: inaccessibleBinding({} as Ai, 'AI'),
    }, [false], keys);
    const request = scoreRequest(challenge, cookie, 'NEVER VERIFIED');

    const response = await worker.fetch(request, rejectedEnv);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(request.bodyUsed).toBe(false);
    expect(keys).toHaveLength(1);
  });

  it('rejects cross-origin writes and unsupported methods before consuming admission', async () => {
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const keys: string[] = [];
    const guardedEnv = admissionEnv(baseEnv, [true, true], keys);
    const crossOrigin = await worker.fetch(new Request(`${api}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.43',
        origin: 'https://attacker.invalid',
      },
      body: '{}',
    }), guardedEnv);
    const unsupported = await worker.fetch(new Request(`${api}/runs`, {
      method: 'GET',
      headers: { 'cf-connecting-ip': '203.0.113.43' },
    }), guardedEnv);
    expect(crossOrigin.status).toBe(403);
    expect(unsupported.status).toBe(405);
    expect(keys).toHaveLength(0);
  });

  it.each([
    'limit=25&limit=50',
    'cursor=b2Zmc2V0OjA&cursor=b2Zmc2V0OjI1',
    'limit=25&tracking=1',
  ])('rejects noncanonical board query %s before D1', async (query) => {
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const keys: string[] = [];
    const guardedEnv = admissionEnv({
      ...baseEnv,
      DB: inaccessibleBinding(baseEnv.DB, 'D1'),
    }, [true], keys);
    const response = await worker.fetch(new Request(`${api}/leaderboards/arcade?${query}`, {
      headers: edgeHeaders,
    }), guardedEnv);
    expect(response.status).toBe(400);
    expect(keys).toHaveLength(1);
  });

  it('composes the strict browser client through the real Worker, D1, verifier, and R2', async () => {
    const playerName = 'COMPOSED TEST';
    await cacheAllowedCallsign(playerName);
    const client = workerBackedCompetitionClient();
    const challenge = await client.beginRun();
    const submitted = await client.submitScore(
      challenge.id,
      playerName,
      GENERATION_2_LOSS_PROOF,
    );
    expect(submitted).toMatchObject({
      status: 201,
      proofState: 'ready',
      entry: { name: playerName, score: 0, totalTicks: 1_854 },
    });
    const retained = await client.loadReplay(submitted.entry.id);
    expect(retained.verification.envelope.summary).toEqual({
      score: 0,
      lives: 0,
      stageReached: 1,
      stagesCleared: 0,
      completed: false,
      totalTicks: 1_854,
      fulfilled: 0,
      serviceActions: 0,
      walkouts: 4,
      resolved: 4,
      exited: 0,
    });
    expect(retained.frameAtOrdinal(retained.frameCount - 1).state).toMatchObject({
      status: 'lost',
      score: 0,
      lives: 0,
    });
    await expect(client.listScores({ limit: 50 })).resolves.toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ id: submitted.entry.id, name: playerName, score: 0 }),
      ]),
    });
  });

  it('composes a complete retained campaign through Worker storage and playback boundaries', async () => {
    const playerName = 'FULL REPLAY';
    await cacheAllowedCallsign(playerName);
    const client = workerBackedCompetitionClient();
    const challenge = await client.beginRun();
    const submitted = await client.submitScore(
      challenge.id,
      playerName,
      GENERATION_2_WIN_PROOF,
    );
    expect(submitted).toMatchObject({
      status: 201,
      proofState: 'ready',
      entry: {
        name: playerName,
        score: 36_255,
        totalTicks: 21_662,
        stagesCleared: 8,
        completed: true,
      },
    });

    const retained = await client.loadReplay(submitted.entry.id);
    expect(retained.stages).toHaveLength(8);
    const firstTerminal = retained.frameAtOrdinal(retained.stages[0]!.ticks);
    const secondStart = retained.frameAtOrdinal(retained.stages[1]!.frameStart);
    expect(firstTerminal).toMatchObject({
      position: { stageIndex: 0, stageTick: retained.stages[0]!.ticks },
      state: { status: 'won' },
    });
    expect(secondStart).toMatchObject({
      position: { stageIndex: 1, stageTick: 0 },
      runTick: firstTerminal.runTick,
      state: { status: 'running' },
    });
    expect(secondStart.frameOrdinal).toBe(firstTerminal.frameOrdinal + 1);
    expect(retained.frameAtOrdinal(retained.frameCount - 1).state).toMatchObject({
      status: 'won',
      score: 36_255,
      lives: 4,
      fulfilled: 31,
      walkouts: 0,
      resolved: 31,
    });
  });

  it('distinguishes invalid proofs from editable callsign rejection', async () => {
    const invalidRun = await beginRun();
    const malformedProof = { ...GENERATION_2_LOSS_PROOF, version: 999 };
    const invalidProof = await exports.default.fetch(scoreRequest(
      invalidRun.challenge,
      invalidRun.cookie,
      'VALID NAME',
      malformedProof,
    ));
    expect(invalidProof.status).toBe(400);
    await expect(invalidProof.json()).resolves.toEqual({
      error: 'Maltline proof version is unsupported.',
      code: MALTLINE_ERROR_CODES.proofInvalid,
    });

    const rejectedRun = await beginRun();
    const rejectedCallsign = await exports.default.fetch(scoreRequest(
      rejectedRun.challenge,
      rejectedRun.cookie,
      'shit',
    ));
    expect(rejectedCallsign.status).toBe(400);
    await expect(rejectedCallsign.json()).resolves.toEqual({
      error: 'Choose a public-friendly callsign.',
      code: MALTLINE_ERROR_CODES.callsignRejected,
    });
  });

  it('issues authority-bound challenges and retains only verifier-derived ready scores', async () => {
    const playerName = 'MALT TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    expect(challenge).toMatchObject({
      seasonId: 'maltline-generation-2',
      boardId: 'arcade',
      gameVersion: '0.1.0',
      authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
      proofSchemaVersion: 1,
      envelopeVersion: 3,
    });
    expect(Number.isInteger(challenge.nonce)).toBe(true);
    expect(challenge.nonce).toBeGreaterThanOrEqual(0);
    expect(challenge.nonce).toBeLessThanOrEqual(0xffff_ffff);

    const response = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(response.status, await response.clone().text()).toBe(201);
    const submitted = await response.json<{
      proofState: string;
      entry: { id: string; name: string; score: number; stageReached: number };
    }>();
    expect(submitted).toMatchObject({
      proofState: 'ready',
      entry: { name: playerName, score: 0, stageReached: 1 },
    });

    const row = await env.DB.prepare(`
      SELECT run_id AS runId, proof_state AS proofState,
        proof_object_key AS objectKey, proof_sha256 AS proofSha256,
        score, stage_reached AS stageReached, total_ticks AS totalTicks
      FROM maltline_scores WHERE id = ?
    `).bind(submitted.entry.id).first<{
      runId: string;
      proofState: string;
      objectKey: string;
      proofSha256: string;
      score: number;
      stageReached: number;
      totalTicks: number;
    }>();
    expect(row).toMatchObject({
      runId: challenge.id,
      proofState: 'ready',
      objectKey: maltlineGeneration2ProofObjectKey(challenge.id),
      score: submitted.entry.score,
      stageReached: submitted.entry.stageReached,
      totalTicks: 1_854,
    });
    const object = await env.REPLAYS.get(row!.objectKey);
    expect(object).not.toBeNull();
    expect(object?.customMetadata).toEqual({
      sha256: row!.proofSha256,
      kind: 'maltline-leaderboard-proof',
      authoritySha256:
        'e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469',
      proofSchemaVersion: '1',
      envelopeVersion: '3',
    });
    expect(await sha256Hex(await object!.text())).toBe(row!.proofSha256);

    const expectedProof = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
      runId: challenge.id,
      seasonId: challenge.seasonId,
      boardId: challenge.boardId,
      nonce: challenge.nonce,
      authority: challenge.authority,
    });
    const retainedProofUrl = `${api}/replays/${submitted.entry.id}`;
    const retainedProof = await exports.default.fetch(retainedProofUrl, { headers: edgeHeaders });
    expect(retainedProof.status).toBe(200);
    expect(retainedProof.headers.get('cache-control')).toBe('private, no-store');
    expect(retainedProof.headers.get('x-maltline-proof-sha256')).toBe(expectedProof.sha256);
    expect(await retainedProof.text()).toBe(expectedProof.canonicalJson);
    const retainedProofHead = await exports.default.fetch(retainedProofUrl, {
      method: 'HEAD',
      headers: edgeHeaders,
    });
    expect(retainedProofHead.status).toBe(200);
    expect(await retainedProofHead.text()).toBe('');

    const duplicate = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      proofState: 'ready',
      entry: { id: submitted.entry.id },
    });

    const board = await exports.default.fetch(`${api}/leaderboards/arcade?limit=25`, {
      headers: edgeHeaders,
    });
    expect(board.status).toBe(200);
    await expect(board.json()).resolves.toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ id: submitted.entry.id, name: playerName }),
      ]),
    });

    await env.REPLAYS.put(row!.objectKey, '{"corrupt":true}');
    const corruptProof = await exports.default.fetch(retainedProofUrl, { headers: edgeHeaders });
    expect(corruptProof.status).toBe(503);
    await expect(corruptProof.json()).resolves.toEqual({
      error: 'Maltline retained proof failed its integrity check.',
    });
    await env.REPLAYS.put(row!.objectKey, expectedProof.canonicalJson);
  });

  it('atomically admits one concurrent score and makes an identical retry idempotent', async () => {
    const playerName = 'RACE TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    const responses = await Promise.all([
      exports.default.fetch(scoreRequest(challenge, cookie, playerName)),
      exports.default.fetch(scoreRequest(challenge, cookie, playerName)),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect([[200, 201], [201, 202]]).toContainEqual(statuses);
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM maltline_scores WHERE run_id = ?',
    ).bind(challenge.id).first<{ count: number }>();
    expect(count?.count).toBe(1);
    const state = await env.DB.prepare(
      'SELECT proof_state AS proofState FROM maltline_scores WHERE run_id = ?',
    ).bind(challenge.id).first<{ proofState: string }>();
    expect(state?.proofState).toBe('ready');
  });

  it('leaves a durable pending row on transient R2 failure and repairs it on an exact retry', async () => {
    const playerName = 'RECOVER TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const failingEnv: ArcadeBenchEnv = {
      ...baseEnv,
      REPLAYS: bucketWithFailingPuts(baseEnv.REPLAYS),
    };
    const failed = await worker.fetch(scoreRequest(challenge, cookie, playerName), failingEnv);
    expect(failed.status).toBe(503);

    const pending = await env.DB.prepare(`
      SELECT id, proof_state AS proofState, proof_object_key AS objectKey,
        proof_sha256 AS proofSha256
      FROM maltline_scores WHERE run_id = ?
    `).bind(challenge.id).first<{
      id: string;
      proofState: string;
      objectKey: string;
      proofSha256: string;
    }>();
    expect(pending?.proofState).toBe('pending');
    const retry = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(retry.status, await retry.clone().text()).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      proofState: 'ready',
      entry: { id: pending!.id, name: playerName },
    });
    const verified = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
      runId: challenge.id,
      seasonId: challenge.seasonId,
      boardId: challenge.boardId,
      nonce: challenge.nonce,
      authority: challenge.authority,
    });
    expect(verified.sha256).toBe(pending?.proofSha256);
    expect(await env.REPLAYS.get(pending!.objectKey)).not.toBeNull();
    const ready = await env.DB.prepare(
      'SELECT proof_state AS proofState FROM maltline_scores WHERE id = ?',
    ).bind(pending!.id).first<{ proofState: string }>();
    expect(ready?.proofState).toBe('ready');
  });

  it('reconciles a stranded exact object and terminally fails an old missing object', async () => {
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const failingEnv: ArcadeBenchEnv = {
      ...baseEnv,
      REPLAYS: bucketWithFailingPuts(baseEnv.REPLAYS),
    };
    const fixtures = [
      { name: 'RECON EXACT', retain: true },
      { name: 'RECON MISSING', retain: false },
    ] as const;
    const pendingIds: string[] = [];
    for (const fixture of fixtures) {
      await cacheAllowedCallsign(fixture.name);
      const { challenge, cookie } = await beginRun();
      const response = await worker.fetch(scoreRequest(challenge, cookie, fixture.name), failingEnv);
      expect(response.status).toBe(503);
      const pending = await env.DB.prepare(`
        SELECT id, proof_object_key AS objectKey, proof_sha256 AS proofSha256
        FROM maltline_scores WHERE run_id = ?
      `).bind(challenge.id).first<{ id: string; objectKey: string; proofSha256: string }>();
      pendingIds.push(pending!.id);
      if (fixture.retain) {
        const verified = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
          runId: challenge.id,
          seasonId: challenge.seasonId,
          boardId: challenge.boardId,
          nonce: challenge.nonce,
          authority: challenge.authority,
        });
        expect(verified.sha256).toBe(pending?.proofSha256);
        await env.REPLAYS.put(pending!.objectKey, verified.canonicalJson);
      }
    }

    const reconciled = await reconcileMaltlineProofs(
      env,
      new Date(Date.now() + 6 * 60 * 1_000),
    );
    expect(reconciled).toEqual({ examined: 2, ready: 1, failed: 1, deferred: 0 });
    const states = await env.DB.prepare(`
      SELECT id, proof_state AS proofState, proof_failure_code AS failureCode
      FROM maltline_scores WHERE id IN (?, ?) ORDER BY id
    `).bind(...pendingIds).all<{ id: string; proofState: string; failureCode: string | null }>();
    expect(states.results.map(({ proofState, failureCode }) => ({ proofState, failureCode })))
      .toEqual(expect.arrayContaining([
        { proofState: 'ready', failureCode: null },
        { proofState: 'failed', failureCode: 'object_missing' },
      ]));
  });

  it('uses a pending-row lease so stale reconciliation cannot fail an in-flight retry', async () => {
    const playerName = 'LEASE TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    const baseEnv = env as unknown as ArcadeBenchEnv;
    const firstAttemptEnv: ArcadeBenchEnv = {
      ...baseEnv,
      REPLAYS: bucketWithFailingPuts(baseEnv.REPLAYS),
    };
    const first = await worker.fetch(scoreRequest(challenge, cookie, playerName), firstAttemptEnv);
    expect(first.status).toBe(503);
    const staleAt = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
    await env.DB.prepare(`
      UPDATE maltline_scores SET proof_state_updated_at = ? WHERE run_id = ?
    `).bind(staleAt, challenge.id).run();

    const reconcileStarted = deferred();
    const releaseReconcile = deferred();
    const reconcileEnv: ArcadeBenchEnv = {
      ...baseEnv,
      REPLAYS: bucketWithBlockedMissingGet(
        baseEnv.REPLAYS,
        reconcileStarted,
        releaseReconcile,
      ),
    };
    const reconciliation = reconcileMaltlineProofs(reconcileEnv);
    await reconcileStarted.promise;

    const putStarted = deferred();
    const releasePut = deferred();
    const retryEnv: ArcadeBenchEnv = {
      ...baseEnv,
      REPLAYS: bucketWithBlockedPut(baseEnv.REPLAYS, putStarted, releasePut),
    };
    const retry = worker.fetch(scoreRequest(challenge, cookie, playerName), retryEnv);
    await putStarted.promise;
    releaseReconcile.resolve();
    await expect(reconciliation).resolves.toEqual({
      examined: 1,
      ready: 0,
      failed: 0,
      deferred: 0,
    });
    releasePut.resolve();
    const response = await retry;
    expect(response.status, await response.clone().text()).toBe(200);
    const final = await env.DB.prepare(`
      SELECT proof_state AS proofState, proof_failure_code AS failureCode
      FROM maltline_scores WHERE run_id = ?
    `).bind(challenge.id).first<{ proofState: string; failureCode: string | null }>();
    expect(final).toEqual({ proofState: 'ready', failureCode: null });
    expect(await env.REPLAYS.get(maltlineGeneration2ProofObjectKey(challenge.id))).not.toBeNull();
  });

  it('atomically refuses a new score after its season is archived', async () => {
    const playerName = 'CLOSED TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    await env.DB.prepare(`
      UPDATE seasons SET state = 'archived' WHERE id = 'maltline-generation-2'
    `).run();
    try {
      const response = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
      expect(response.status).toBe(503);
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM maltline_scores WHERE run_id = ?',
      ).bind(challenge.id).first<{ count: number }>();
      expect(count?.count).toBe(0);
    } finally {
      await env.DB.prepare(`
        UPDATE seasons SET state = 'active' WHERE id = 'maltline-generation-2'
      `).run();
    }
  });

  it('fails closed on object-key collisions and oversized composed requests', async () => {
    const playerName = 'COLLIDE TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    await env.REPLAYS.put(maltlineGeneration2ProofObjectKey(challenge.id), '{"wrong":true}');
    const collision = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(collision.status).toBe(409);
    const state = await env.DB.prepare(
      'SELECT proof_state AS proofState, proof_failure_code AS failureCode '
      + 'FROM maltline_scores WHERE run_id = ?',
    ).bind(challenge.id).first<{ proofState: string; failureCode: string }>();
    expect(state).toEqual({ proofState: 'failed', failureCode: 'object_collision' });

    const oversized = await exports.default.fetch(`${api}/leaderboards/arcade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, ...edgeHeaders },
      body: 'x'.repeat(MAX_MALTLINE_SCORE_BYTES + 1),
    });
    expect(oversized.status).toBe(413);

    const crossOrigin = await exports.default.fetch(`${api}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' },
      body: JSON.stringify({ gameVersion: '0.1.0', boardId: 'arcade' }),
    });
    expect(crossOrigin.status).toBe(403);
  });

  it('expires retained proof bytes without erasing the immutable ranked result', async () => {
    const playerName = 'RETENTION TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    const submitted = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(submitted.status).toBe(201);
    const submittedBody = await submitted.json<{ entry: { id: string } }>();
    const key = maltlineGeneration2ProofObjectKey(challenge.id);
    expect(await env.REPLAYS.get(key)).not.toBeNull();

    const eligible = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM maltline_scores
      WHERE proof_deleted_at IS NULL AND proof_state IN ('ready', 'failed')
    `).first<{ count: number }>();
    await expect(cleanupExpiredMaltlineProofs(
      env,
      new Date(Date.now() + 6 * 24 * 60 * 60 * 1_000),
    )).resolves.toBe(eligible!.count);
    expect(await env.REPLAYS.get(key)).toBeNull();
    const retained = await env.DB.prepare(`
      SELECT proof_state AS proofState, proof_deleted_at AS proofDeletedAt,
        score, stage_reached AS stageReached
      FROM maltline_scores WHERE run_id = ?
    `).bind(challenge.id).first<{
      proofState: string;
      proofDeletedAt: string | null;
      score: number;
      stageReached: number;
    }>();
    expect(retained).toMatchObject({
      proofState: 'ready',
      score: 0,
      stageReached: 1,
    });
    expect(retained?.proofDeletedAt).not.toBeNull();
    const board = await exports.default.fetch(`${api}/leaderboards/arcade?limit=50`, {
      headers: edgeHeaders,
    });
    const boardBody = await board.json<{ entries: Array<{ id: string; proofAvailable: boolean }> }>();
    expect(boardBody.entries.find((entry) => entry.id === submittedBody.entry.id))
      .toMatchObject({ proofAvailable: false });
    const expired = await exports.default.fetch(`${api}/replays/${submittedBody.entry.id}`, {
      headers: edgeHeaders,
    });
    expect(expired.status).toBe(410);
    await expect(expired.json()).resolves.toEqual({
      error: 'This Maltline retained proof is no longer available.',
    });
  });

  it('fails closed on retained-body read faults and preserves an already-open exact read during cleanup', async () => {
    const playerName = 'READ RACE TEST';
    await cacheAllowedCallsign(playerName);
    const { challenge, cookie } = await beginRun();
    const submitted = await exports.default.fetch(scoreRequest(challenge, cookie, playerName));
    expect(submitted.status).toBe(201);
    const submittedBody = await submitted.json<{ entry: { id: string } }>();
    const retainedProofUrl = `${api}/replays/${submittedBody.entry.id}`;
    const baseEnv = env as unknown as ArcadeBenchEnv;

    const bodyFailure = await worker.fetch(new Request(retainedProofUrl, { headers: edgeHeaders }), {
      ...baseEnv,
      REPLAYS: bucketWithFailingBodyRead(baseEnv.REPLAYS),
    });
    expect(bodyFailure.status).toBe(500);
    await expect(bodyFailure.json()).resolves.toEqual({
      error: 'Arcade services hit an unexpected error.',
    });

    const expected = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
      runId: challenge.id,
      seasonId: challenge.seasonId,
      boardId: challenge.boardId,
      nonce: challenge.nonce,
      authority: challenge.authority,
    });
    const getStarted = deferred();
    const releaseGet = deferred();
    const racingRead = worker.fetch(new Request(retainedProofUrl, { headers: edgeHeaders }), {
      ...baseEnv,
      REPLAYS: bucketWithCapturedBlockedGet(baseEnv.REPLAYS, getStarted, releaseGet),
    });
    await getStarted.promise;
    await cleanupExpiredMaltlineProofs(
      baseEnv,
      new Date(Date.now() + 6 * 24 * 60 * 60 * 1_000),
    );
    releaseGet.resolve();
    const retained = await racingRead;
    expect(retained.status).toBe(200);
    expect(retained.headers.get('x-maltline-proof-sha256')).toBe(expected.sha256);
    expect(await retained.text()).toBe(expected.canonicalJson);
    expect(await env.REPLAYS.get(maltlineGeneration2ProofObjectKey(challenge.id))).toBeNull();
  });
});

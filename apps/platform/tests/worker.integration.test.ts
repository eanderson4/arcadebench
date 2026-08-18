import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ContinuousPartitionSession,
  PARTITION_GAME_VERSION,
  PartitionEngine,
  applyDifficulty,
  createPartitionCampaign,
} from '@arcadebench/partition';
import { CALLSIGN_MODEL, CALLSIGN_POLICY_VERSION } from '../src/moderation';
import { sha256Hex } from '../src/crypto';
import { cleanupExpiredReplayData } from '../src/worker';

const origin = 'https://arcadebench.org';
const api = `${origin}/api/v1/games/partition`;

function sessionCookie(response: Response): string {
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('ArcadeBench public platform Worker', () => {
  it('serves health without creating an anonymous identity', async () => {
    const response = await exports.default.fetch(`${origin}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(response.headers.has('set-cookie')).toBe(false);
    await expect(response.json()).resolves.toEqual({ status: 'ok', gameVersion: PARTITION_GAME_VERSION });
  });

  it('runs the verified score, replay, vote, and board path end to end', async () => {
    const runResponse = await exports.default.fetch(`${api}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameVersion: PARTITION_GAME_VERSION,
        boardId: 'level',
        context: { difficulty: 'medium', levelId: 'first-light' },
      }),
    });
    expect(runResponse.status).toBe(201);
    const cookie = sessionCookie(runResponse);
    const challenge = await runResponse.json<{ id: string; seed: number }>();

    const level = createPartitionCampaign(challenge.seed)
      .find((candidate) => candidate.metadata.slug === 'first-light')!;
    const session = new ContinuousPartitionSession(
      new PartitionEngine(applyDifficulty(level.scenario, 'medium')),
    );
    while (session.engine.snapshot().status === 'running') session.tick();
    const replay = session.replay();
    const playerName = 'SYSTEM TEST';
    const moderationKey = await sha256Hex(
      `${CALLSIGN_POLICY_VERSION}\0${playerName.toLocaleLowerCase()}`,
    );
    await env.DB.prepare(`
      INSERT INTO callsign_moderation_cache
        (moderation_key, policy_version, allowed, category, model, created_at)
      VALUES (?, ?, 1, 'clean', ?, ?)
    `).bind(moderationKey, CALLSIGN_POLICY_VERSION, CALLSIGN_MODEL, new Date().toISOString()).run();

    const score = {
      scope: 'level',
      difficulty: 'medium',
      levelId: level.metadata.slug,
      levelNumber: level.metadata.number,
      levelTitle: level.metadata.title,
      won: false,
      capturedFraction: 0,
      elapsedMs: Math.round(replay.finalState.tick / replay.scenario.ticksPerSecond * 1000),
      partitions: 0,
    };
    const scoreResponse = await exports.default.fetch(`${api}/leaderboards/level`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        gameVersion: PARTITION_GAME_VERSION,
        runId: challenge.id,
        playerName,
        score,
        proof: { replays: [replay] },
      }),
    });
    expect(scoreResponse.status, await scoreResponse.clone().text()).toBe(201);
    const submitted = await scoreResponse.json<{ entry: { id: string; name: string; levelId: string } }>();
    expect(submitted.entry).toMatchObject({ name: playerName, levelId: 'first-light' });

    const duplicateResponse = await exports.default.fetch(`${api}/leaderboards/level`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        gameVersion: PARTITION_GAME_VERSION,
        runId: challenge.id,
        playerName,
        score,
        proof: { replays: [replay] },
      }),
    });
    expect(duplicateResponse.status).toBe(409);

    const boardResponse = await exports.default.fetch(
      `${api}/leaderboards/level?filter.difficulty=medium&filter.levelId=first-light&limit=25`,
    );
    expect(boardResponse.status).toBe(200);
    const board = await boardResponse.json<{ entries: Array<{ name: string }> }>();
    expect(board.entries.map((entry) => entry.name)).toEqual([playerName]);

    const publishResponse = await exports.default.fetch(`${api}/replays`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ gameVersion: PARTITION_GAME_VERSION, replay, expiresInDays: 5 }),
    });
    expect(publishResponse.status).toBe(201);
    const published = await publishResponse.json<{ id: string; replayUrl: string; url: string }>();
    expect(published.url).toBe(`${origin}/r/${published.id}`);
    const replayResponse = await exports.default.fetch(published.replayUrl);
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toEqual(replay);

    const voteResponse = await exports.default.fetch(`${api}/votes/level/first-light`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ gameVersion: PARTITION_GAME_VERSION, value: 1 }),
    });
    expect(voteResponse.status).toBe(200);
    await expect(voteResponse.json()).resolves.toEqual({ up: 1, down: 0, score: 1, viewerVote: 1 });

    const proof = await env.DB.prepare(`
      SELECT proof_object_key AS objectKey, proof_sha256 AS sha256,
        proof_expires_at AS expiresAt, proof_deleted_at AS deletedAt
      FROM scores WHERE id = ?
    `).bind(submitted.entry.id).first<{
      objectKey: string;
      sha256: string;
      expiresAt: string;
      deletedAt: string | null;
    }>();
    expect(proof?.expiresAt).toBeTruthy();
    expect(proof?.deletedAt).toBeNull();
    expect(await env.REPLAYS.get(proof!.objectKey)).not.toBeNull();

    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE scores SET proof_expires_at = ? WHERE id = ?')
        .bind(expiredAt, submitted.entry.id),
      env.DB.prepare('UPDATE replay_shares SET expires_at = ? WHERE id = ?')
        .bind(expiredAt, published.id),
    ]);
    await expect(cleanupExpiredReplayData(env)).resolves.toEqual({ shares: 1, proofs: 1 });
    expect(await env.REPLAYS.get(proof!.objectKey)).toBeNull();
    expect(await env.REPLAYS.get(`shares/partition/${PARTITION_GAME_VERSION}/${published.id}.json`)).toBeNull();
    const deletedProof = await env.DB.prepare(`
      SELECT proof_sha256 AS sha256, proof_deleted_at AS deletedAt
      FROM scores WHERE id = ?
    `).bind(submitted.entry.id).first<{ sha256: string; deletedAt: string | null }>();
    expect(deletedProof).toMatchObject({ sha256: proof!.sha256 });
    expect(deletedProof?.deletedAt).toBeTruthy();
  });
});

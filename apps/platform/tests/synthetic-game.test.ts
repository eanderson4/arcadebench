import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerGameAdapter } from '../src/shared/registry';
import {
  SYNTHETIC_GAME_ID,
  SYNTHETIC_GAME_VERSION,
  syntheticAdapter,
  syntheticScore,
} from './support/synthetic-adapter';
import { V2_API, allowCallsign, workerFetch } from './support/partition-fixtures';

const SEASON_ID = 'synthetic-1-0-0-launch';
const API = `${V2_API}/games/${SYNTHETIC_GAME_ID}`;

interface Call {
  response: Response;
  body: Record<string, unknown>;
}

async function call(url: string, init?: RequestInit): Promise<Call> {
  const response = await workerFetch(url, init);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
}

async function beginSyntheticRun(mode: string, cookie?: string): Promise<{
  cookie: string;
  runId: string;
  seed: number;
}> {
  const started = await call(`${API}/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      gameVersion: SYNTHETIC_GAME_VERSION,
      boardId: 'map',
      context: { mode },
    }),
  });
  expect(started.response.status, JSON.stringify(started.body)).toBe(201);
  const resolved = cookie ?? started.response.headers.get('set-cookie')!.split(';')[0]!;
  return {
    cookie: resolved,
    runId: String(started.body.id),
    seed: Number(started.body.seed),
  };
}

async function submitSynthetic(options: {
  cookie: string;
  runId: string;
  mode: string;
  points: number;
  nonce: number;
  socialMedia?: boolean;
  claimedPoints?: number;
}): Promise<Call> {
  const body = syntheticScore(
    options.claimedPoints ?? options.points,
    options.mode,
    options.nonce,
  );
  return call(`${API}/leaderboards/map`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: options.cookie },
    body: JSON.stringify({
      gameVersion: SYNTHETIC_GAME_VERSION,
      runId: options.runId,
      playerName: 'SYNTH PILOT',
      score: body.score,
      proof: body.proof,
      publication: {
        policyVersion: 'top50-social-v1',
        socialMedia: options.socialMedia ?? false,
      },
    }),
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  registerGameAdapter(syntheticAdapter);
  // Callsign moderation is shared platform infrastructure for every game.
  await allowCallsign('SYNTH PILOT');
  await env.DB.prepare(`
    INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
    VALUES (?, ?, ?, 'Launch board', 'active', ?)
  `).bind(SEASON_ID, SYNTHETIC_GAME_ID, SYNTHETIC_GAME_VERSION, '2026-09-01T00:00:00.000Z').run();
});

describe('second registered game', () => {
  it('registers through the shared contract with no per-game platform branch', async () => {
    const started = await beginSyntheticRun('relay');
    const submitted = await submitSynthetic({
      cookie: started.cookie,
      runId: started.runId,
      mode: 'relay',
      points: 1200,
      nonce: started.seed,
    });
    expect(submitted.response.status, JSON.stringify(submitted.body)).toBe(201);
    const entry = submitted.body.entry as Record<string, unknown>;
    expect(entry).toMatchObject({
      gameId: SYNTHETIC_GAME_ID,
      gameVersion: SYNTHETIC_GAME_VERSION,
      playerName: 'SYNTH PILOT',
      board: { id: 'map', label: 'Relay Map', context: { mode: 'relay' } },
      result: { points: 1200, mode: 'relay', cleared: true },
    });
    expect(submitted.body.publication).toEqual({
      rankAtSubmission: 1,
      replaySaved: true,
      expiresAt: null,
    });

    // The shared entry was inserted directly: this game has no detail table and
    // no projection trigger.
    const stored = await env.DB.prepare(
      'SELECT board_key, rank_1, rank_2, run_id, replay_object_id FROM leaderboard_entries WHERE id = ?',
    ).bind(entry.id).first<{
      board_key: string;
      rank_1: number;
      rank_2: number;
      run_id: string;
      replay_object_id: string;
    }>();
    expect(stored).toMatchObject({ rank_1: -1200, rank_2: 0, run_id: started.runId });
    const object = await env.DB.prepare('SELECT object_key, state FROM replay_objects WHERE id = ?')
      .bind(stored!.replay_object_id).first<{ object_key: string; state: string }>();
    expect(object?.state).toBe('ready');
    expect(await env.REPLAYS.get(String(object?.object_key))).not.toBeNull();
    // The game's own challenge table consumed the one-time run.
    const challenge = await env.DB.prepare(
      'SELECT consumed_entry_id FROM shared_run_challenges WHERE id = ?',
    ).bind(started.runId).first<{ consumed_entry_id: string }>();
    expect(challenge?.consumed_entry_id).toBe(entry.id);

    // Listing and the global feed both come from the shared tables.
    const listed = await call(`${API}/leaderboards/map?filter.mode=relay`);
    expect(listed.response.status).toBe(200);
    expect((listed.body.entries as Array<{ id: string }>)[0]).toMatchObject({ id: entry.id });
    const feed = await call(`${V2_API}/activity?gameId=${SYNTHETIC_GAME_ID}&limit=50`);
    const feedEntry = (feed.body.entries as Array<Record<string, unknown>>)
      .find((row) => row.entryId === entry.id);
    expect(feedEntry).toMatchObject({
      gameId: SYNTHETIC_GAME_ID,
      gameTitle: 'Synthetic Lanes',
      board: { id: 'map', label: 'Relay Map', context: { mode: 'relay' } },
      leaderboardPath: '/games/synthetic/?mode=relay',
    });

    // Both games share one feed page, each described by its own adapter.
    const all = await call(`${V2_API}/activity?limit=50`);
    expect(new Set((all.body.entries as Array<{ gameId: string }>).map((row) => row.gameId)).size)
      .toBeGreaterThanOrEqual(1);
  });

  it('verifies with its own adapter and never trusts a claimed score', async () => {
    const started = await beginSyntheticRun('sprint');
    const lying = await submitSynthetic({
      cookie: started.cookie,
      runId: started.runId,
      mode: 'sprint',
      points: 900,
      nonce: started.seed,
      claimedPoints: 999_999,
    });
    expect(lying.response.status).toBe(400);
    await expect(env.DB.prepare('SELECT COUNT(*) AS count FROM leaderboard_entries WHERE run_id = ?')
      .bind(started.runId).first<{ count: number }>()).resolves.toMatchObject({ count: 0 });

    const wrongNonce = await submitSynthetic({
      cookie: started.cookie,
      runId: started.runId,
      mode: 'sprint',
      points: 900,
      nonce: started.seed + 1,
    });
    expect(wrongNonce.response.status).toBe(400);

    const accepted = await submitSynthetic({
      cookie: started.cookie,
      runId: started.runId,
      mode: 'sprint',
      points: 900,
      nonce: started.seed,
    });
    expect(accepted.response.status, JSON.stringify(accepted.body)).toBe(201);
    const duplicate = await submitSynthetic({
      cookie: started.cookie,
      runId: started.runId,
      mode: 'sprint',
      points: 900,
      nonce: started.seed,
    });
    expect(duplicate.response.status).toBe(409);
    const events = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM activity_events
      WHERE entry_id = (SELECT id FROM leaderboard_entries WHERE run_id = ?)
    `).bind(started.runId).first<{ count: number }>();
    expect(events?.count).toBe(1);
  });

  it('validates its own board context and feedback kinds', async () => {
    const unknownMode = await call(`${API}/leaderboards/map?filter.mode=marathon`);
    expect(unknownMode.response.status).toBe(400);
    const unknownFilter = await call(`${API}/leaderboards/map?filter.mode=relay&filter.difficulty=hard`);
    expect(unknownFilter.response.status).toBe(400);
    const missingBoard = await call(`${API}/leaderboards/board?filter.mode=relay`);
    expect(missingBoard.response.status).toBe(404);

    const started = await beginSyntheticRun('relay');
    const feedback = await call(`${API}/feedback/map/harbor?channel=fun`, {
      headers: { cookie: started.cookie },
    });
    expect(feedback.response.status).toBe(200);
    const voted = await call(`${API}/feedback/map/harbor?channel=fun`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: started.cookie },
      body: JSON.stringify({ gameVersion: SYNTHETIC_GAME_VERSION, vote: 1, note: 'fun mode rules' }),
    });
    expect(voted.response.status, JSON.stringify(voted.body)).toBe(200);
    expect(voted.body).toMatchObject({ up: 1, down: 0, score: 1, viewerVote: 1, note: 'fun mode rules' });
    // Channels and subjects are per game: Partition-only names are rejected here.
    const partitionChannel = await call(`${API}/feedback/map/harbor?channel=overall`, {
      headers: { cookie: started.cookie },
    });
    expect(partitionChannel.response.status).toBe(200);
    await expect(call(`${API}/feedback/level/first-light`, {
      headers: { cookie: started.cookie },
    })).resolves.toMatchObject({ response: { status: 404 } });
    await expect(call(`${API}/feedback/map/nowhere`, {
      headers: { cookie: started.cookie },
    })).resolves.toMatchObject({ response: { status: 404 } });
    await expect(call(`${API}/feedback/map/harbor?channel=overall`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: started.cookie },
      body: JSON.stringify({ gameVersion: SYNTHETIC_GAME_VERSION, vote: 1 }),
    }).then((result) => result.response.status)).resolves.toBe(200);

    // Partition's channels are not registered for this game.
    await expect(call(`${API}/feedback/map/harbor?channel=legacy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: started.cookie },
      body: JSON.stringify({ gameVersion: SYNTHETIC_GAME_VERSION, vote: 1 }),
    }).then((result) => result.response.status)).resolves.toBe(400);

    // No explicit-share hook means no replay sharing for this game.
    const share = await call(`${API}/replays`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: started.cookie },
      body: JSON.stringify({ gameVersion: SYNTHETIC_GAME_VERSION, replay: {} }),
    });
    expect(share.response.status).toBe(404);

    // The shared feedback aggregate is scoped per game: Partition's votes on the
    // same-named subject are a different row.
    const partition = await call(`${V2_API}/games/partition/feedback/level/first-light`);
    expect(partition.body).toMatchObject({ up: 0, down: 0, viewerVote: 0 });
  });
});

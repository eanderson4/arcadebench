import { env } from 'cloudflare:workers';
import { applyD1Migrations, createScheduledController } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import production from '../src/production';
import type { ArcadeBenchEnv } from '../src/env';
import { createPendingReplayObject } from '../src/shared/replays';
import { createArcadeBenchGameClient } from '@arcadebench/sdk';
import { MALTLINE_CURRENT_CABINET_AUTHORITY as cabinet } from '@arcadebench/maltline/verifier';
import { buildMaltlineCabinetProof, verifyMaltlineCabinetProof } from '../../../games/maltline/src/core/cabinet-proof';
import { cabinetReplays } from '../../../games/maltline/tests/support/cabinet-fixtures';
import { allowCallsign, arcadeProof, GAME_VERSION, PUBLICATION } from './support/partition-fixtures';

const origin = 'https://arcadebench.org';
const productionNames = new Set(['0001_public_platform.sql', '0002_replay_retention.sql',
  '0004_shared_platform.sql', '0005_maltline_cabinet.sql',
  '0006_maltline_cabinet_progression.sql']);
beforeAll(async () => {
  // The default suite also exercises this file, but never applies 0003 here.
  const migrations = env.TEST_MIGRATIONS.filter(migration => productionNames.has(migration.name));
  expect(migrations.map(migration => migration.name)).toEqual([...productionNames]);
  await applyD1Migrations(env.DB, migrations);
});

describe('maintained production entry without generation-2 schema', () => {
  it('applies only the shared release schema and opens Second Shift', async () => {
    const legacy = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'maltline_%'").all();
    expect(legacy.results).toEqual([]);
    expect(await env.DB.prepare("SELECT game_version, name, state FROM seasons WHERE game_id = 'maltline' AND state = 'active'").first())
      .toEqual({ game_version: 'cabinet-2', name: 'Second Shift', state: 'active' });
  });

  it('rejects every legacy Maltline method before any binding or cookie access', async () => {
    const untouched = new Proxy(env, { get() { throw new Error('Disabled route touched a binding'); } });
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS', 'DELETE']) {
      for (const path of ['/api/v1/games/maltline', '/api/v1/games/maltline/runs',
        '/api/v1/games/maltline/leaderboards/arcade', '/api/v1/games/maltline/replays/anything']) {
        const response = await production.fetch(new Request(`${origin}${path}`, { method }), untouched);
        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.has('set-cookie')).toBe(false);
        if (method === 'HEAD') expect(await response.text()).toBe('');
        else expect(await response.json()).toMatchObject({ code: 'legacy_maltline_disabled' });
      }
    }
  });

  it('keeps assets, legacy Partition, and the shared cabinet leaderboard available', async () => {
    expect((await production.fetch(new Request(`${origin}/games/maltline/`), env)).status).toBe(200);
    expect((await production.fetch(new Request(`${origin}/api/v1/health`), env)).status).toBe(200);
    const response = await production.fetch(new Request(`${origin}/api/v2/games/maltline/leaderboards/arcade`), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entries: [] });
  });

  it.each(['partition', 'maltline'] as const)('accepts %s through the shared SDK and production entry without manual season activation', async (gameId) => {
    let cookie = '';
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('cf-connecting-ip', '203.0.113.88');
      if (cookie) headers.set('cookie', cookie);
      const response = await production.fetch(new Request(String(input), { ...init, headers }), env);
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
      return response;
    };
    const version = gameId === 'partition' ? GAME_VERSION : cabinet.gameVersion;
    const context: Record<string, string> = gameId === 'partition' ? { difficulty: 'medium' } : {};
    const client = createArcadeBenchGameClient({ gameId, gameVersion: version,
      baseUrl: `${origin}/api/v2`, fetchImpl });
    const run = await client.runs.begin({ boardId: 'arcade', context });
    expect(run.gameVersion).toBe(version);
    const playerName = `PROD ${gameId.toUpperCase()}`;
    await allowCallsign(playerName);
    let proof: unknown;
    let score: unknown;
    if (gameId === 'partition') {
      const attempt = arcadeProof(Number(run.seed), 'medium');
      proof = { replays: attempt.replays }; score = attempt.score;
    } else {
      const challenge = { runId: run.id, nonce: Number(run.seed) };
      proof = buildMaltlineCabinetProof(cabinetReplays(false, cabinet), challenge, cabinet.gameVersion);
      score = verifyMaltlineCabinetProof(proof, challenge, cabinet.gameVersion).summary;
    }
    const result = await client.leaderboards.submit({ boardId: 'arcade', runId: run.id,
      playerName, score, proof, publication: PUBLICATION });
    expect(result.entry).toMatchObject({ gameId, gameVersion: version, result: score });
    expect(result.publication).toMatchObject({ rankAtSubmission: 1, replaySaved: true, expiresAt: null });
    const board = await client.leaderboards.list<{ id: string }>({ boardId: 'arcade', filters: context });
    expect(board.entries.some(entry => entry.id === result.entry.id)).toBe(true);
    const publication = await env.DB.prepare('SELECT social_media, qualified FROM entry_publication WHERE entry_id = ?')
      .bind(result.entry.id).first();
    expect(publication).toEqual({ social_media: 0, qualified: 1 });
    const replay = await env.DB.prepare(`SELECT r.object_key, r.state, r.expires_at FROM replay_objects r
      JOIN leaderboard_entries e ON e.replay_object_id = r.id WHERE e.id = ?`)
      .bind(result.entry.id).first<{ object_key: string; state: string; expires_at: string | null }>();
    expect(replay).toMatchObject({ state: 'ready', expires_at: null });
    expect(await env.REPLAYS.get(replay!.object_key)).not.toBeNull();
    const activity = await production.fetch(new Request(`${origin}/api/v2/activity?limit=50`), env);
    expect(activity.status).toBe(200);
    expect(await activity.text()).toContain(result.entry.id);
  });

  it('runs mandatory shared retention while legacy routes and the v2 kill switch are closed', async () => {
    const past = '2000-01-01T00:00:00.000Z';
    const session = 'anon_production_retention';
    await env.DB.prepare('INSERT INTO anonymous_sessions VALUES (?, ?, ?)').bind(session, past, past).run();
    await env.DB.prepare(`INSERT INTO feedback_notes
      (session_id,game_id,subject_kind,subject_id,channel,note,created_at,updated_at,expires_at)
      VALUES (?, 'partition', 'level', 'first-light', 'overall', 'Expired private note', ?, ?, ?)`)
      .bind(session, past, past, past).run();
    await createPendingReplayObject(env, { id: 'replay_production_expired', gameId: 'maltline', gameVersion: 'cabinet-1',
      objectKey: 'archives/maltline/cabinet-1/expired.json', sha256: 'a'.repeat(64), expiresAt: past }, past);
    await env.REPLAYS.put('archives/maltline/cabinet-1/expired.json', 'expired proof');
    await env.DB.prepare(`INSERT INTO shared_run_challenges
      (id,session_id,game_id,game_version,season_id,board_key,board_id,context_json,seed,created_at,expires_at)
      VALUES ('run_production_expired', ?, 'maltline', 'cabinet-1', 'maltline-cabinet-1', 'test', 'arcade', '{}', 1, ?, ?)`)
      .bind(session, past, past).run();
    const killSwitched: ArcadeBenchEnv = { ...env, SHARED_PLATFORM_ENABLED: 'false' };
    const errors = vi.spyOn(console, 'error');
    try {
      await production.scheduled(createScheduledController(), killSwitched);
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM feedback_notes').first()).toEqual({ count: 0 });
    expect(await env.DB.prepare("SELECT state FROM replay_objects WHERE id = 'replay_production_expired'").first())
      .toEqual({ state: 'deleted' });
    expect(await env.REPLAYS.get('archives/maltline/cabinet-1/expired.json')).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM shared_run_challenges WHERE id = 'run_production_expired'").first())
      .toEqual({ count: 0 });
  });
});

import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ArcadeBenchEnv } from '../src/env';
import { partitionAdapter } from '../src/partition-adapter';
import { ensureBoardStatement, resolveBoardInstance, submitSharedScore } from '../src/shared/leaderboards';
import { cleanupSharedReplayObjects } from '../src/shared/replays';
import { parseContextJson } from '../src/shared/board-context';
import { GAME_VERSION, allowCallsign, beginRun, levelProof, submitLevelScore } from './support/partition-fixtures';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('immutable ranked challenge finalization', () => {
  it.each([1, true, null, ['medium'], { difficulty: 'medium' }])('rejects malformed stored context instead of coercing %j to a string', async (value) => {
    const run = await beginRun('level', { difficulty: 'medium', levelId: 'first-light' });
    const malformedAdapter = {
      ...partitionAdapter,
      loadChallenge: async (request: Parameters<typeof partitionAdapter.loadChallenge>[0]) => {
        const challenge = await partitionAdapter.loadChallenge(request);
        return { ...challenge, payload: { ...challenge.payload, context: { difficulty: value, levelId: 'first-light' } } };
      },
    };
    await expect(submitSharedScore({ env, adapter: malformedAdapter,
      session: { id: run.sessionId }, boardId: 'level', body: {
        gameVersion: GAME_VERSION, runId: run.runId,
        publication: { policyVersion: 'top50-social-v1', socialMedia: false },
      },
    })).rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE run_id = ?').bind(run.runId).first()).toBeNull();
    expect(() => parseContextJson(JSON.stringify({ difficulty: value }))).toThrow('must be strings');
  });

  it('rejects a previous-season run rather than counting placement on the new season', async () => {
    const playerName = 'SEASON BOUND';
    await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'medium', levelId: 'first-light' });
    const original = await env.DB.prepare('SELECT season_id FROM run_challenges WHERE id = ?')
      .bind(run.runId).first<{ season_id: string }>();
    await env.DB.batch([
      env.DB.prepare("UPDATE seasons SET state = 'archived' WHERE id = ?").bind(original!.season_id),
      env.DB.prepare(`INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
        VALUES ('partition-next-season', 'partition', ?, 'Next season', 'active', ?)`)
        .bind(GAME_VERSION, new Date().toISOString()),
    ]);
    try {
      const result = await submitLevelScore({ cookie: run.cookie, runId: run.runId, playerName,
        proof: levelProof(run.seed, 'medium', 'first-light'), socialMedia: false });
      expect(result.status, JSON.stringify(result.body)).toBe(409);
      expect(await env.DB.prepare('SELECT id FROM scores WHERE run_id = ?').bind(run.runId).first()).toBeNull();
      expect(await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE run_id = ?').bind(run.runId).first()).toBeNull();
    } finally {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM seasons WHERE id = 'partition-next-season'"),
        env.DB.prepare("UPDATE seasons SET state = 'active' WHERE id = ?").bind(original!.season_id),
      ]);
    }
  });

  for (const race of ['season closes', 'board hides', 'challenge expires', 'replay expires'] as const) {
    it(`cannot commit when ${race} while R2 is uploading`, async () => {
      const playerName = `RACE ${race.split(' ')[0]!.toUpperCase()}`;
      await allowCallsign(playerName);
      const run = await beginRun('level', { difficulty: 'medium', levelId: 'first-light' });
      const proof = levelProof(run.seed, 'medium', 'first-light');
      const board = await resolveBoardInstance(env, partitionAdapter, 'level', { difficulty: 'medium', levelId: 'first-light' });
      await ensureBoardStatement(env, board).run();
      const intercepted = Object.create(env) as ArcadeBenchEnv;
      Object.defineProperty(intercepted, 'REPLAYS', { value: {
        put: async (...args: Parameters<R2Bucket['put']>) => {
          const result = await env.REPLAYS.put(...args);
          if (race === 'season closes') {
            await env.DB.prepare("UPDATE seasons SET state = 'archived' WHERE id = ?").bind(board.seasonId).run();
          } else if (race === 'board hides') {
            await env.DB.prepare("UPDATE leaderboard_boards SET state = 'hidden' WHERE board_key = ?").bind(board.boardKey).run();
          } else if (race === 'challenge expires') {
            const deadline = new Date(Date.now() + 10).toISOString();
            await new Promise((resolve) => setTimeout(resolve, 30));
            await env.DB.prepare('UPDATE run_challenges SET expires_at = ? WHERE id = ?').bind(deadline, run.runId).run();
          } else {
            await env.DB.prepare('UPDATE replay_objects SET expires_at = ? WHERE object_key = ?')
              .bind(new Date(Date.now() - 1000).toISOString(), args[0]).run();
          }
          return result;
        },
      } });
      try {
        await expect(submitSharedScore({ env: intercepted, adapter: partitionAdapter,
          session: { id: run.sessionId }, boardId: 'level',
          body: { gameVersion: GAME_VERSION, runId: run.runId, playerName, score: proof.score,
            proof: { replays: [proof.replay] }, publication: { policyVersion: 'top50-social-v1', socialMedia: false } },
        })).rejects.toThrow(/already submitted or expired|expired before finalization/u);
        expect(await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE run_id = ?').bind(run.runId).first()).toBeNull();
        const challenge = await env.DB.prepare('SELECT consumed_score_id FROM run_challenges WHERE id = ?')
          .bind(run.runId).first<{ consumed_score_id: string | null }>();
        expect(challenge?.consumed_score_id).toBeNull();
      } finally {
        await env.DB.batch([
          env.DB.prepare("UPDATE seasons SET state = 'active' WHERE id = ?").bind(board.seasonId),
          env.DB.prepare("UPDATE leaderboard_boards SET state = 'visible' WHERE board_key = ?").bind(board.boardKey),
        ]);
      }
    });
  }

  for (const ambiguousFailure of [false, true]) {
    it(`requeues bytes written after pending-object cleanup (${ambiguousFailure ? 'ambiguous failure' : 'successful put'})`, async () => {
      const playerName = ambiguousFailure ? 'LATE FAILED' : 'LATE STORED';
      await allowCallsign(playerName);
      const run = await beginRun('level', { difficulty: 'medium', levelId: 'first-light' });
      const proof = levelProof(run.seed, 'medium', 'first-light');
      let objectKey = '';
      const intercepted = Object.create(env) as ArcadeBenchEnv;
      Object.defineProperty(intercepted, 'REPLAYS', { value: {
        put: async (...args: Parameters<R2Bucket['put']>) => {
          objectKey = args[0];
          await env.DB.prepare('UPDATE replay_objects SET expires_at = ? WHERE object_key = ?')
            .bind(new Date(Date.now() - 1000).toISOString(), objectKey).run();
          await cleanupSharedReplayObjects(env);
          expect((await env.DB.prepare('SELECT state FROM replay_objects WHERE object_key = ?')
            .bind(objectKey).first<{ state: string }>())?.state).toBe('deleted');
          const result = await env.REPLAYS.put(...args);
          if (ambiguousFailure) throw new Error('upload response lost');
          return result;
        },
      } });
      await expect(submitSharedScore({ env: intercepted, adapter: partitionAdapter,
        session: { id: run.sessionId }, boardId: 'level', body: {
          gameVersion: GAME_VERSION, runId: run.runId, playerName, score: proof.score,
          proof: { replays: [proof.replay] }, publication: { policyVersion: 'top50-social-v1', socialMedia: false },
        },
      })).rejects.toMatchObject({ status: ambiguousFailure ? 503 : 409 });
      expect((await env.DB.prepare('SELECT state FROM replay_objects WHERE object_key = ?')
        .bind(objectKey).first<{ state: string }>())?.state).toBe('deleting');
      expect(await env.REPLAYS.head(objectKey)).not.toBeNull();
      await cleanupSharedReplayObjects(env);
      expect(await env.REPLAYS.head(objectKey)).toBeNull();
      expect(await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE run_id = ?').bind(run.runId).first()).toBeNull();
    });
  }

  it('eventually removes an ambiguous write that arrives after the request and cleanup both ended', async () => {
    const now = new Date();
    const key = 'archives/partition/late-orphan.json';
    const before = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`INSERT INTO replay_objects
      (id, game_id, game_version, object_key, sha256, state, qualifies, expires_at, created_at, updated_at, deleted_at)
      VALUES ('replay_late_orphan', 'partition', ?, ?, ?, 'deleted', 0, ?, ?, ?, ?)`)
      .bind(GAME_VERSION, key, 'a'.repeat(64), before, before, before, before).run();
    // The original caller can no longer observe this eventual R2 commit.
    await env.REPLAYS.put(key, 'late private bytes');
    await cleanupSharedReplayObjects(env, now);
    expect(await env.REPLAYS.head(key)).toBeNull();
    expect((await env.DB.prepare("SELECT updated_at FROM replay_objects WHERE id = 'replay_late_orphan'")
      .first<{ updated_at: string }>())?.updated_at).toBe(now.toISOString());
  });
});

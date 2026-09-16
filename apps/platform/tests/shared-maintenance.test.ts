import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ArcadeBenchEnv } from '../src/env';
import { runScheduledMaintenance } from '../src/worker';
import { cleanupSharedReplayObjects } from '../src/shared/replays';
import { beginRun } from './support/partition-fixtures';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('shared retention maintenance', () => {
  it('acknowledges full 200-object expiry and tombstone pages within D1 binding limits', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    for (const state of ['pending', 'deleted']) {
      await env.DB.prepare(`WITH RECURSIVE numbers(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < 200
      ) INSERT INTO replay_objects
        (id, game_id, game_version, object_key, sha256, state, qualifies, expires_at, created_at, updated_at)
        SELECT ? || n, 'synthetic', '1', ? || n, ?, ?, 0, ?, ?, ? FROM numbers`)
        .bind(`replay_batch_${state}_`, `archives/synthetic/batch-${state}-`, 'a'.repeat(64), state, past, past, past).run();
    }
    const maxBindings: number[] = [];
    const boundedDb = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'prepare') return (query: string) => new Proxy(target.prepare(query), {
          get(statement, member) {
            if (member === 'bind') return (...values: unknown[]) => {
              maxBindings.push(values.length);
              if (values.length > 100) throw new Error('D1 allows at most 100 bound parameters');
              return statement.bind(...values);
            };
            const value = Reflect.get(statement, member);
            return typeof value === 'function' ? value.bind(statement) : value;
          },
        });
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await expect(cleanupSharedReplayObjects({ DB: boundedDb, REPLAYS: env.REPLAYS }, now))
      .resolves.toEqual({ claimed: 200, deleted: 200 });
    expect(Math.max(...maxBindings)).toBeLessThanOrEqual(100);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS total FROM replay_objects
      WHERE id LIKE 'replay_batch_%' AND state = 'deleted' AND updated_at = ?`)
      .bind(now.toISOString()).first()).toEqual({ total: 400 });
  });

  it('expires private notes and replays with v2 disabled and never touches disabled legacy Maltline tables', async () => {
    const run = await beginRun('level', { difficulty: 'medium', levelId: 'first-light' });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const key = 'archives/synthetic/expired-maintenance.json';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO replay_objects
        (id, game_id, game_version, object_key, sha256, state, qualifies, expires_at, created_at, updated_at)
        VALUES ('replay_maintenance', 'synthetic', '1', ?, ?, 'ready', 0, ?, ?, ?)`)
        .bind(key, 'a'.repeat(64), past, past, past),
      env.DB.prepare(`INSERT INTO feedback_notes
        (session_id, game_id, subject_kind, subject_id, channel, note, created_at, updated_at, expires_at)
        VALUES (?, 'partition', 'level', 'first-light', 'overall', 'expired private note', ?, ?, ?)`)
        .bind(run.sessionId, past, past, past),
    ]);
    await env.REPLAYS.put(key, 'private bytes');
    const queries: string[] = [];
    const disabled = Object.create(env) as ArcadeBenchEnv;
    Object.defineProperty(disabled, 'SHARED_PLATFORM_ENABLED', { value: 'false' });
    Object.defineProperty(disabled, 'DB', { value: new Proxy(env.DB, {
      get(target, property) {
        if (property === 'prepare') return (query: string) => {
          queries.push(query);
          if (/maltline_/u.test(query)) throw new Error('legacy Maltline schema is not installed');
          return target.prepare(query);
        };
        const member = Reflect.get(target, property);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    }) });
    await expect(runScheduledMaintenance(disabled, { legacyMaltlineEnabled: false })).resolves.toBeUndefined();
    expect(queries.some((query) => /maltline_/u.test(query))).toBe(false);
    expect(await env.REPLAYS.head(key)).toBeNull();
    expect(await env.DB.prepare('SELECT note FROM feedback_notes WHERE session_id = ?').bind(run.sessionId).first()).toBeNull();
    expect((await env.DB.prepare("SELECT state FROM replay_objects WHERE id = 'replay_maintenance'")
      .first<{ state: string }>())?.state).toBe('deleted');
  });
});

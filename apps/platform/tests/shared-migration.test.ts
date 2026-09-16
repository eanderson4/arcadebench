import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { PARTITION_GAME_VERSION } from '@arcadebench/partition';
import { partitionAdapter } from '../src/partition-adapter';
import { canonicalBoardKey, orderByClause } from '../src/shared/canonical';
import { resolveBoardInstance } from '../src/shared/leaderboards';

/**
 * The migration bridge is installed against real legacy-era data: migrations
 * 0001-0003 run first, Partition rows are written the way the old Worker wrote
 * them, and only then does 0004 project and backfill them.
 */
const MIGRATIONS = env.TEST_MIGRATIONS as D1Migration[];
const SEASON_ID = 'partition-0-1-0-launch';
const SESSION_ID = 'anon_MIGRATIONSEED0A';
const MODERATION_KEY = 'migration-seed-moderation-key';
const SEEDED_AT = '2026-09-01T00:00:00.000Z';

interface LegacyScore {
  id: string;
  boardId: 'arcade' | 'level';
  difficulty: 'easy' | 'medium' | 'hard' | 'impossible';
  levelId?: string;
  levelNumber?: number;
  levelTitle?: string;
  won?: number;
  stageReached?: number;
  stagesCleared?: number;
  completed: number;
  elapsedMs: number;
  partitions: number;
  capturedFraction?: number;
  createdAt: string;
}

/** Deliberately chosen to exercise ties, boundaries, and float precision. */
const LEGACY_SCORES: LegacyScore[] = [
  {
    id: 'score_legacy_arcade_5', boardId: 'arcade', difficulty: 'medium',
    stageReached: 5, stagesCleared: 4, completed: 0, elapsedMs: 1000, partitions: 3,
    createdAt: '2026-09-01T00:00:01.000Z',
  },
  {
    id: 'score_legacy_arcade_3', boardId: 'arcade', difficulty: 'medium',
    stageReached: 3, stagesCleared: 2, completed: 0, elapsedMs: 900, partitions: 1,
    createdAt: '2026-09-01T00:00:02.000Z',
  },
  {
    id: 'score_legacy_arcade_tie_b', boardId: 'arcade', difficulty: 'medium',
    stageReached: 5, stagesCleared: 5, completed: 1, elapsedMs: 1500, partitions: 2,
    createdAt: '2026-09-01T00:00:03.000Z',
  },
  {
    id: 'score_legacy_arcade_tie_a', boardId: 'arcade', difficulty: 'medium',
    stageReached: 5, stagesCleared: 5, completed: 1, elapsedMs: 1500, partitions: 2,
    createdAt: '2026-09-01T00:00:03.000Z',
  },
  {
    id: 'score_legacy_arcade_fast', boardId: 'arcade', difficulty: 'medium',
    stageReached: 5, stagesCleared: 5, completed: 1, elapsedMs: 800, partitions: 2,
    createdAt: '2026-09-01T00:00:04.000Z',
  },
  {
    id: 'score_legacy_arcade_hard', boardId: 'arcade', difficulty: 'hard',
    stageReached: 2, stagesCleared: 1, completed: 0, elapsedMs: 700, partitions: 1,
    createdAt: '2026-09-01T00:00:05.000Z',
  },
  {
    id: 'score_legacy_level_won', boardId: 'level', difficulty: 'hard',
    levelId: 'first-light', levelNumber: 1, levelTitle: 'First Light',
    won: 1, completed: 1, elapsedMs: 500, partitions: 1,
    createdAt: '2026-09-01T00:00:06.000Z',
  },
  {
    id: 'score_legacy_level_quarter', boardId: 'level', difficulty: 'hard',
    levelId: 'first-light', levelNumber: 1, levelTitle: 'First Light',
    won: 0, completed: 0, elapsedMs: 400, partitions: 1, capturedFraction: 0.25,
    createdAt: '2026-09-01T00:00:07.000Z',
  },
  {
    // A fraction whose shortest decimal form needs sixteen digits: the shared
    // envelope must keep the exact double, not a rounded rewrite of it.
    id: 'score_legacy_level_precise', boardId: 'level', difficulty: 'hard',
    levelId: 'first-light', levelNumber: 1, levelTitle: 'First Light',
    won: 0, completed: 0, elapsedMs: 300, partitions: 2,
    capturedFraction: 0.4166666666666667,
    createdAt: '2026-09-01T00:00:08.000Z',
  },
];

const PRECISE_FRACTION = 0.4166666666666667;

async function seedLegacyData(): Promise<void> {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      'INSERT INTO anonymous_sessions (id, created_at, last_seen_at) VALUES (?, ?, ?)',
    ).bind(SESSION_ID, SEEDED_AT, SEEDED_AT),
    env.DB.prepare(`
      INSERT INTO callsign_moderation_cache
        (moderation_key, policy_version, allowed, category, model, created_at)
      VALUES (?, 'seed-policy', 1, 'clean', 'seed-model', ?)
    `).bind(MODERATION_KEY, SEEDED_AT),
    env.DB.prepare(`
      INSERT INTO votes (session_id, game_id, subject_kind, subject_id, value, created_at, updated_at)
      VALUES (?, 'partition', 'level', 'first-light', 1, ?, ?)
    `).bind(SESSION_ID, SEEDED_AT, SEEDED_AT),
    env.DB.prepare(`
      INSERT INTO votes (session_id, game_id, subject_kind, subject_id, value, created_at, updated_at)
      VALUES (?, 'partition', 'game', 'partition', -1, ?, ?)
    `).bind(SESSION_ID, SEEDED_AT, SEEDED_AT),
  ];
  for (const score of LEGACY_SCORES) {
    const runId = `run_legacy_${score.id}`;
    statements.push(env.DB.prepare(`
      INSERT INTO run_challenges (
        id, session_id, season_id, game_id, game_version, board_id, difficulty,
        level_id, seed, created_at, expires_at, consumed_at, consumed_score_id
      ) VALUES (?, ?, ?, 'partition', ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).bind(
      runId,
      SESSION_ID,
      SEASON_ID,
      PARTITION_GAME_VERSION,
      score.boardId,
      score.difficulty,
      score.levelId ?? null,
      score.createdAt,
      score.createdAt,
      score.createdAt,
      score.id,
    ));
    statements.push(env.DB.prepare(`
      INSERT INTO scores (
        id, run_id, season_id, game_id, game_version, board_id, player_name,
        normalized_name, difficulty, level_id, level_number, level_title, won,
        stage_reached, stages_cleared, completed, elapsed_ms, partitions,
        captured_fraction, proof_object_key, proof_sha256, proof_expires_at,
        moderation_key, created_at
      ) VALUES (?, ?, ?, 'partition', ?, ?, 'LEGACY', 'legacy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      score.id,
      runId,
      SEASON_ID,
      PARTITION_GAME_VERSION,
      score.boardId,
      score.difficulty,
      score.levelId ?? null,
      score.levelNumber ?? null,
      score.levelTitle ?? null,
      score.won ?? null,
      score.stageReached ?? null,
      score.stagesCleared ?? null,
      score.completed,
      score.elapsedMs,
      score.partitions,
      score.capturedFraction ?? null,
      `proofs/partition/${PARTITION_GAME_VERSION}/${score.id}.json`,
      'a'.repeat(64),
      '2026-09-06T00:00:00.000Z',
      MODERATION_KEY,
      score.createdAt,
    ));
  }
  await env.DB.batch(statements);
}

async function sharedEntry(id: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare('SELECT * FROM leaderboard_entries WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  expect(row, `shared entry ${id}`).toBeTruthy();
  return row!;
}

function expectedComponents(score: LegacyScore): number[] {
  if (score.boardId === 'arcade') {
    return [
      -score.stageReached!,
      score.completed === 1 ? -1 : 0,
      score.elapsedMs,
      score.partitions,
      0, 0, 0, 0,
    ];
  }
  const fraction = score.capturedFraction ?? 0;
  return [
    score.won === 1 ? -1 : 0,
    score.won === 0 && fraction !== 0 ? -fraction : 0,
    score.elapsedMs,
    score.partitions,
    0, 0, 0, 0,
  ];
}

async function legacyOrder(boardId: 'arcade' | 'level', difficulty: string, levelId?: string): Promise<string[]> {
  const statement = boardId === 'arcade'
    ? env.DB.prepare(`
        SELECT id FROM scores
        WHERE game_id = 'partition' AND game_version = ? AND season_id = ?
          AND board_id = 'arcade' AND difficulty = ?
        ORDER BY stage_reached DESC, completed DESC, elapsed_ms ASC, partitions ASC, created_at ASC, id ASC
      `).bind(PARTITION_GAME_VERSION, SEASON_ID, difficulty)
    : env.DB.prepare(`
        SELECT id FROM scores
        WHERE game_id = 'partition' AND game_version = ? AND season_id = ?
          AND board_id = 'level' AND difficulty = ? AND level_id = ?
        ORDER BY won DESC, CASE WHEN won = 0 THEN captured_fraction END DESC,
          elapsed_ms ASC, partitions ASC, created_at ASC, id ASC
      `).bind(PARTITION_GAME_VERSION, SEASON_ID, difficulty, levelId!);
  const result = await statement.all<{ id: string }>();
  return (result.results ?? []).map((row) => row.id);
}

async function sharedOrder(boardKey: string): Promise<string[]> {
  const result = await env.DB.prepare(`
    SELECT id FROM leaderboard_entries
    WHERE board_key = ? AND state = 'eligible'
    ORDER BY rank_1 ASC, rank_2 ASC, rank_3 ASC, rank_4 ASC, rank_5 ASC, rank_6 ASC,
      rank_7 ASC, rank_8 ASC, created_at ASC, id ASC
  `).bind(boardKey).all<{ id: string }>();
  return (result.results ?? []).map((row) => row.id);
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS.filter((migration) => migration.name < '0004'));
  await seedLegacyData();
  await applyD1Migrations(env.DB, MIGRATIONS);
});

describe('shared platform migration bridge', () => {
  it('backfills every legacy score with its own ID and no publication or event', async () => {
    for (const score of LEGACY_SCORES) {
      const entry = await sharedEntry(score.id);
      expect(entry.game_id).toBe('partition');
      expect(entry.game_version).toBe(PARTITION_GAME_VERSION);
      expect(entry.board_id).toBe(score.boardId);
      expect(entry.player_name).toBe('LEGACY');
      expect(entry.state).toBe('eligible');
      expect(entry.run_id).toBe(`run_legacy_${score.id}`);
      expect(entry.replay_object_id).toBeNull();
      expect(entry.created_at).toBe(score.createdAt);
    }
    const publications = await env.DB.prepare('SELECT COUNT(*) AS count FROM entry_publication')
      .first<{ count: number }>();
    const events = await env.DB.prepare('SELECT COUNT(*) AS count FROM activity_events')
      .first<{ count: number }>();
    const objects = await env.DB.prepare('SELECT COUNT(*) AS count FROM replay_objects')
      .first<{ count: number }>();
    expect(publications?.count).toBe(0);
    expect(events?.count).toBe(0);
    expect(objects?.count).toBe(0);
  });

  it('writes the same rank vector the adapter derives for the same verified values', async () => {
    for (const score of LEGACY_SCORES) {
      const entry = await sharedEntry(score.id);
      const components = expectedComponents(score);
      expect(
        [
          entry.rank_1, entry.rank_2, entry.rank_3, entry.rank_4,
          entry.rank_5, entry.rank_6, entry.rank_7, entry.rank_8,
        ].map((value) => Number(value) + 0),
        score.id,
      ).toEqual(components);
    }
  });

  it('keeps SQL board keys byte identical to the adapter board keys', async () => {
    const arcade = await resolveBoardInstance(env, partitionAdapter, 'arcade', { difficulty: 'medium' });
    const level = await resolveBoardInstance(env, partitionAdapter, 'level', {
      difficulty: 'hard',
      levelId: 'first-light',
    });
    const stored = await env.DB.prepare('SELECT board_key, context_json FROM leaderboard_boards')
      .all<{ board_key: string; context_json: string }>();
    const keys = (stored.results ?? []).map((row) => row.board_key);
    expect(keys).toContain(arcade.boardKey);
    expect(keys).toContain(level.boardKey);
    // The key is the canonical identity tuple, not an ad-hoc string.
    expect(arcade.boardKey).toBe(canonicalBoardKey({
      gameId: 'partition',
      gameVersion: PARTITION_GAME_VERSION,
      authorityId: 'partition-authored-v1',
      rankingPolicyVersion: 'arcade-v1',
      seasonId: SEASON_ID,
      boardId: 'arcade',
      context: { difficulty: 'medium' },
    }));
    expect(level.boardKey).toBe(canonicalBoardKey({
      gameId: 'partition',
      gameVersion: PARTITION_GAME_VERSION,
      authorityId: 'partition-authored-v1',
      rankingPolicyVersion: 'field-v1',
      seasonId: SEASON_ID,
      boardId: 'level',
      context: { difficulty: 'hard', levelId: 'first-light' },
    }));
    const arcadeRow = await env.DB.prepare('SELECT context_json FROM leaderboard_boards WHERE board_key = ?')
      .bind(arcade.boardKey).first<{ context_json: string }>();
    expect(arcadeRow?.context_json).toBe('{"difficulty":"medium"}');
  });

  it('reproduces the legacy board ordering exactly, including ties and contexts', async () => {
    const cases = [
      { boardId: 'arcade' as const, context: { difficulty: 'medium' } },
      { boardId: 'arcade' as const, context: { difficulty: 'hard' } },
      { boardId: 'level' as const, context: { difficulty: 'hard', levelId: 'first-light' } },
    ];
    for (const entry of cases) {
      const board = await resolveBoardInstance(env, partitionAdapter, entry.boardId, entry.context);
      const legacy = await legacyOrder(
        entry.boardId,
        String(entry.context.difficulty),
        entry.context.levelId,
      );
      expect(legacy.length).toBeGreaterThan(0);
      expect(await sharedOrder(board.boardKey), JSON.stringify(entry.context)).toEqual(legacy);
    }
    // Context isolation: one board never lists another difficulty's scores.
    const medium = await resolveBoardInstance(env, partitionAdapter, 'arcade', { difficulty: 'medium' });
    const hard = await resolveBoardInstance(env, partitionAdapter, 'arcade', { difficulty: 'hard' });
    expect(medium.boardKey).not.toBe(hard.boardKey);
    expect(await sharedOrder(hard.boardKey)).toEqual(['score_legacy_arcade_hard']);
  });

  it('keeps the verified result envelope and its float precision intact', async () => {
    const entry = await sharedEntry('score_legacy_level_precise');
    const result = JSON.parse(String(entry.result_json)) as Record<string, unknown>;
    expect(result).toEqual({
      capturedFraction: PRECISE_FRACTION,
      difficulty: 'hard',
      elapsedMs: 300,
      levelId: 'first-light',
      levelNumber: 1,
      levelTitle: 'First Light',
      partitions: 2,
      scope: 'level',
      won: false,
    });
    // Rebuilt from the shared row through the shared ordering, the fraction is
    // still the exact double the legacy column stored.
    expect(Object.is(result.capturedFraction, PRECISE_FRACTION)).toBe(true);
    const arcade = await sharedEntry('score_legacy_arcade_5');
    expect(JSON.parse(String(arcade.result_json))).toEqual({
      completed: false,
      difficulty: 'medium',
      elapsedMs: 1000,
      partitions: 3,
      scope: 'arcade',
      stageReached: 5,
      stagesCleared: 4,
    });
  });

  it('projects new legacy writes and removes the shared entry when the source row goes', async () => {
    const board = await resolveBoardInstance(env, partitionAdapter, 'arcade', { difficulty: 'medium' });
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO run_challenges (
          id, session_id, season_id, game_id, game_version, board_id, difficulty,
          level_id, seed, created_at, expires_at, consumed_at, consumed_score_id
        ) VALUES ('run_legacy_live', ?, ?, 'partition', ?, 'arcade', 'medium', NULL, 0, ?, ?, ?, 'score_legacy_live')
      `).bind(SESSION_ID, SEASON_ID, PARTITION_GAME_VERSION, SEEDED_AT, SEEDED_AT, SEEDED_AT),
      env.DB.prepare(`
        INSERT INTO scores (
          id, run_id, season_id, game_id, game_version, board_id, player_name,
          normalized_name, difficulty, level_id, level_number, level_title, won,
          stage_reached, stages_cleared, completed, elapsed_ms, partitions,
          captured_fraction, proof_object_key, proof_sha256, proof_expires_at,
          moderation_key, created_at
        ) VALUES ('score_legacy_live', 'run_legacy_live', ?, 'partition', ?, 'arcade', 'LIVE',
          'live', 'medium', NULL, NULL, NULL, NULL, 9, 9, 1, 100, 1, NULL,
          ?, ?, '2026-09-06T00:00:00.000Z', ?, ?)
      `).bind(
        SEASON_ID,
        PARTITION_GAME_VERSION,
        `proofs/partition/${PARTITION_GAME_VERSION}/score_legacy_live.json`,
        'b'.repeat(64),
        MODERATION_KEY,
        SEEDED_AT,
      ),
    ]);

    const entry = await sharedEntry('score_legacy_live');
    expect([entry.rank_1, entry.rank_2, entry.rank_3, entry.rank_4]).toEqual([-9, -1, 100, 1]);
    expect(await sharedOrder(board.boardKey)).toEqual(await legacyOrder('arcade', 'medium'));

    await env.DB.prepare('DELETE FROM scores WHERE id = ?').bind('score_legacy_live').run();
    const removed = await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE id = ?')
      .bind('score_legacy_live').first();
    expect(removed).toBeNull();
    expect(await sharedOrder(board.boardKey)).toEqual(await legacyOrder('arcade', 'medium'));
  });

  it('projects legacy votes into the shared default channel without divergence', async () => {
    const projected = await env.DB.prepare(`
      SELECT subject_kind, subject_id, channel, value FROM feedback_votes
      WHERE game_id = 'partition' AND session_id = ? ORDER BY subject_id
    `).bind(SESSION_ID).all<{ subject_kind: string; subject_id: string; channel: string; value: number }>();
    expect(projected.results).toEqual([
      { subject_kind: 'level', subject_id: 'first-light', channel: 'overall', value: 1 },
      { subject_kind: 'game', subject_id: 'partition', channel: 'overall', value: -1 },
    ]);

    await env.DB.prepare(`
      INSERT INTO votes (session_id, game_id, subject_kind, subject_id, value, created_at, updated_at)
      VALUES (?, 'partition', 'level', 'twin-drift', 1, ?, ?)
      ON CONFLICT (session_id, game_id, subject_kind, subject_id)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(SESSION_ID, SEEDED_AT, SEEDED_AT).run();
    const inserted = await env.DB.prepare(`
      SELECT value FROM feedback_votes
      WHERE session_id = ? AND game_id = 'partition' AND subject_kind = 'level'
        AND subject_id = 'twin-drift' AND channel = 'overall'
    `).bind(SESSION_ID).first<{ value: number }>();
    expect(inserted?.value).toBe(1);

    await env.DB.prepare(`
      DELETE FROM votes WHERE session_id = ? AND game_id = 'partition'
        AND subject_kind = 'level' AND subject_id = 'twin-drift'
    `).bind(SESSION_ID).run();
    const cleared = await env.DB.prepare(`
      SELECT value FROM feedback_votes
      WHERE session_id = ? AND game_id = 'partition' AND subject_kind = 'level'
        AND subject_id = 'twin-drift' AND channel = 'overall'
    `).bind(SESSION_ID).first();
    expect(cleared).toBeNull();
  });

  it('orders the shared query with the shared index columns', () => {
    expect(orderByClause('e.')).toBe(
      'e.rank_1 ASC, e.rank_2 ASC, e.rank_3 ASC, e.rank_4 ASC, e.rank_5 ASC, e.rank_6 ASC, e.rank_7 ASC, e.rank_8 ASC, e.created_at ASC, e.id ASC',
    );
  });
});

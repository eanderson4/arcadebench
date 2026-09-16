import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { partitionAdapter } from '../src/partition-adapter';
import { canonicalContextJson } from '../src/shared/canonical';
import { resolveBoardInstance } from '../src/shared/leaderboards';
import { ACTIVITY_DEFAULT_LIMIT, ACTIVITY_MAX_LIMIT, type BoardInstance } from '../src/shared/types';
import { V2_API, allowCallsign, beginRun, levelProof, submitLevelScore, workerFetch } from './support/partition-fixtures';

interface ActivityEntryRow {
  id: string;
  type: string;
  entryId: string;
  gameId: string;
  gameTitle: string;
  board: { id: string; label: string; context: Record<string, string> };
  playerName: string;
  rankAtSubmission: number;
  occurredAt: string;
  leaderboardPath: string;
}

interface ActivityPage {
  protocolVersion: number;
  entries: ActivityEntryRow[];
  nextCursor?: string;
}

const at = (day: number, second = 0): string =>
  new Date(Date.UTC(2026, 8, day, 0, 0, second)).toISOString();

async function feed(query = ''): Promise<{ response: Response; page: ActivityPage }> {
  const response = await workerFetch(`${V2_API}/activity${query}`);
  const page = await response.json() as ActivityPage;
  return { response, page };
}

let board: BoardInstance;

async function ensureBoard(): Promise<BoardInstance> {
  if (board) return board;
  board = await resolveBoardInstance(env, partitionAdapter, 'level', {
    difficulty: 'medium',
    levelId: 'first-light',
  });
  await env.DB.prepare(`
    INSERT INTO leaderboard_boards
      (board_key, game_id, game_version, authority_id, ranking_policy_version, season_id,
       board_id, context_json, label, state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'First Light · Medium', 'visible', ?)
    ON CONFLICT (board_key) DO NOTHING
  `).bind(
    board.boardKey,
    board.gameId,
    board.gameVersion,
    board.authorityId,
    board.rankingPolicyVersion,
    board.seasonId,
    board.boardId,
    canonicalContextJson(board.context),
    at(1),
  ).run();
  return board;
}

/** Seeds one entry, its publication, and its event with an exact placement. */
async function seedEvent(options: {
  suffix: string;
  occurredAt: string;
  rank?: number;
  state?: string;
  seasonId?: string;
  socialMedia?: number;
}): Promise<{ entryId: string; eventId: string }> {
  const seededBoard = await ensureBoard();
  const entryId = `score_feed_${options.suffix}`;
  const eventId = `event_feed_${options.suffix}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO leaderboard_entries
        (id, board_key, game_id, game_version, season_id, board_id, player_name,
         normalized_name, result_json, rank_1, rank_2, rank_3, rank_4, rank_5,
         rank_6, rank_7, rank_8, state, created_at)
      VALUES (?, ?, 'partition', ?, ?, 'level', ?, ?, '{}', 0, 0, 1, 0, 0, 0, 0, 0, ?, ?)
    `).bind(
      entryId,
      seededBoard.boardKey,
      seededBoard.gameVersion,
      options.seasonId ?? seededBoard.seasonId,
      `FEED ${options.suffix}`.toLocaleUpperCase(),
      `feed ${options.suffix}`,
      options.state ?? 'eligible',
      options.occurredAt,
    ),
    env.DB.prepare(`
      INSERT INTO activity_events
        (id, entry_id, type, game_id, board_key, rank_at_submission, occurred_at)
      VALUES (?, ?, 'leaderboard.qualified', 'partition', ?, ?, ?)
    `).bind(eventId, entryId, seededBoard.boardKey, options.rank ?? 1, options.occurredAt),
  ]);
  if (options.socialMedia !== undefined) {
    await env.DB.prepare(`
      INSERT INTO entry_publication
        (entry_id, policy_version, social_media, rank_at_submission, qualified,
         replay_saved, replay_object_id, expires_at, created_at)
      VALUES (?, 'top50-social-v1', ?, ?, 1, 1, NULL, NULL, ?)
    `).bind(entryId, options.socialMedia, options.rank ?? 1, options.occurredAt).run();
  }
  return { entryId, eventId };
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('global activity feed', () => {
  it('serves the newest achievements first with a stable bounded page', async () => {
    const seeded: string[] = [];
    for (let index = 0; index < 10; index++) {
      const { eventId } = await seedEvent({
        suffix: `page${index}`,
        occurredAt: at(2, index),
        rank: index + 1,
      });
      seeded.push(eventId);
    }
    // Two achievements in the same millisecond: the event ID breaks the tie.
    const tieA = await seedEvent({ suffix: 'tieA', occurredAt: at(3) });
    const tieB = await seedEvent({ suffix: 'tieB', occurredAt: at(3) });

    const first = await feed();
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get('cache-control')).toBe('public, max-age=15, stale-while-revalidate=30');
    expect(first.response.headers.has('set-cookie')).toBe(false);
    expect(first.page.protocolVersion).toBe(1);
    expect(first.page.entries).toHaveLength(ACTIVITY_DEFAULT_LIMIT);
    expect(first.page.nextCursor).toBeTruthy();
    expect(first.page.entries.slice(0, 2).map((entry) => entry.id))
      .toEqual([tieA.eventId, tieB.eventId].sort().reverse());
    expect(first.page.entries[2]!.id).toBe(seeded[9]);
    expect(first.page.entries[0]!.board.label).toBe('First Light · Medium');

    const second = await feed(`?cursor=${encodeURIComponent(first.page.nextCursor!)}`);
    expect(second.response.status, JSON.stringify(second.page)).toBe(200);
    expect(second.page.entries.map((entry) => entry.id)).toEqual([...seeded.slice(0, 4)].reverse());
    expect(second.page.nextCursor).toBeUndefined();
    // No overlap and no gap between the two pages.
    const seen = new Set([...first.page.entries, ...second.page.entries].map((entry) => entry.id));
    expect(seen.size).toBe(12);

    const single = await feed('?limit=1');
    expect(single.page.entries).toHaveLength(1);
    const invalid = await workerFetch(`${V2_API}/activity?cursor=not-a-cursor`);
    expect(invalid.status).toBe(400);
  });

  it('is a session-free, consent-free, note-free projection of the shared event table', async () => {
    const sessionId = 'anon_FEEDPRIVACY000A';
    const entryId = 'score_feed_hidden';
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO anonymous_sessions (id, created_at, last_seen_at) VALUES (?, ?, ?)',
      ).bind(sessionId, at(1), at(1)),
      env.DB.prepare(`
        INSERT INTO feedback_notes
          (session_id, game_id, subject_kind, subject_id, channel, note, created_at, updated_at, expires_at)
        VALUES (?, 'partition', 'game', 'partition', 'overall', 'operator eyes only', ?, ?, ?)
      `).bind(sessionId, at(1), at(1), at(30)),
    ]);
    const seeded = await seedEvent({
      suffix: 'hidden',
      occurredAt: at(4),
      socialMedia: 1,
    });
    expect(seeded.entryId).toBe(entryId);

    const { response, page } = await feed('?limit=50');
    expect(response.headers.has('set-cookie')).toBe(false);
    const row = page.entries.find((entry) => entry.entryId === entryId);
    expect(row).toBeTruthy();
    expect(Object.keys(row!).sort()).toEqual([
      'board', 'entryId', 'gameId', 'gameTitle', 'id', 'leaderboardPath',
      'occurredAt', 'playerName', 'rankAtSubmission', 'type',
    ]);
    const serialized = JSON.stringify(page);
    expect(serialized).not.toMatch(/operator eyes only|socialMedia|consent|viewerVote/iu);
    expect(row!.gameTitle).toBe('Partition');
    expect(row!.leaderboardPath.startsWith('/games/partition/')).toBe(true);
    expect(row!.type).toBe('leaderboard.qualified');
  });

  it('hides achievements whose entry is removed or whose season is archived', async () => {
    const removed = await seedEvent({
      suffix: 'removed',
      occurredAt: at(5),
      state: 'removed',
    });
    await env.DB.prepare(`
      INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
      VALUES ('partition-archived', 'partition', '0.1.0', 'Archived board', 'archived', ?)
    `).bind(at(1)).run();
    const archived = await seedEvent({
      suffix: 'archived',
      occurredAt: at(6),
      seasonId: 'partition-archived',
    });

    const { page } = await feed('?limit=50');
    const ids = page.entries.map((entry) => entry.id);
    expect(ids).not.toContain(removed.eventId);
    expect(ids).not.toContain(archived.eventId);

    // Removing the shared entry removes its event with it.
    const live = await seedEvent({ suffix: 'cascade', occurredAt: at(7) });
    expect((await feed('?limit=50')).page.entries.map((entry) => entry.id)).toContain(live.eventId);
    await env.DB.prepare('DELETE FROM leaderboard_entries WHERE id = ?').bind(live.entryId).run();
    expect(await env.DB.prepare('SELECT id FROM activity_events WHERE id = ?')
      .bind(live.eventId).first()).toBeNull();
  });

  it('skips games this release has no adapter for and filters by game', async () => {
    const ghostBoardKey = '["ghost","0.1.0","ghost-authored","ghost-v1","ghost-season","board",{"mode":"relay"}]';
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
        VALUES ('ghost-season', 'ghost', '0.1.0', 'Ghost board', 'active', ?)
      `).bind(at(1)),
      env.DB.prepare(`
        INSERT INTO leaderboard_boards
          (board_key, game_id, game_version, authority_id, ranking_policy_version, season_id,
           board_id, context_json, label, state, created_at)
        VALUES (?, 'ghost', '0.1.0', 'ghost-authored', 'ghost-v1', 'ghost-season',
          'board', '{"mode":"relay"}', 'Ghost', 'visible', ?)
      `).bind(ghostBoardKey, at(1)),
      env.DB.prepare(`
        INSERT INTO leaderboard_entries
          (id, board_key, game_id, game_version, season_id, board_id, player_name,
           normalized_name, result_json, state, created_at)
        VALUES ('score_ghost', ?, 'ghost', '0.1.0', 'ghost-season', 'board',
          'GHOST', 'ghost', '{}', 'eligible', ?)
      `).bind(ghostBoardKey, at(8)),
      env.DB.prepare(`
        INSERT INTO activity_events
          (id, entry_id, type, game_id, board_key, rank_at_submission, occurred_at)
        VALUES ('event_ghost', 'score_ghost', 'leaderboard.qualified', 'ghost', ?, 1, ?)
      `).bind(ghostBoardKey, at(8)),
    ]);

    const all = await feed('?limit=50');
    // No adapter means no guessed title or link, so the row is left out entirely.
    expect(all.page.entries.map((entry) => entry.gameId)).not.toContain('ghost');

    const filtered = await feed('?gameId=partition&limit=50');
    expect(filtered.response.status).toBe(200);
    expect(filtered.page.entries.length).toBeGreaterThan(0);
    expect(filtered.page.entries.every((entry) => entry.gameId === 'partition')).toBe(true);

    const unknown = await workerFetch(`${V2_API}/activity?gameId=ghost`);
    expect(unknown.status).toBe(404);
    const wrongMethod = await workerFetch(`${V2_API}/activity`, { method: 'POST' });
    expect(wrongMethod.status).toBe(405);
  });

  it('answers HEAD with the same headers and no body', async () => {
    const head = await workerFetch(`${V2_API}/activity?limit=2`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('cache-control')).toBe('public, max-age=15, stale-while-revalidate=30');
    expect(head.headers.has('set-cookie')).toBe(false);
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect((await feed('?limit=2')).response.status).toBe(200);
  });

  it('includes a real verified submission alongside seeded achievements', async () => {
    const playerName = 'FEED LIVE';
    await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'hard', levelId: 'twin-drift' });
    const submitted = await submitLevelScore({
      cookie: run.cookie,
      runId: run.runId,
      playerName,
      proof: levelProof(run.seed, 'hard', 'twin-drift'),
      socialMedia: false,
    });
    expect(submitted.status).toBe(201);
    const entryId = String((submitted.body.entry as { id: string }).id);
    const { page } = await feed('?limit=50');
    const row = page.entries.find((entry) => entry.entryId === entryId);
    expect(row).toMatchObject({
      playerName,
      gameId: 'partition',
      board: {
        id: 'level',
        label: 'Twin Drift · Hard',
        context: { difficulty: 'hard', levelId: 'twin-drift' },
      },
    });
    // The placement on the feed is the immutable publication snapshot.
    const publication = await env.DB.prepare(
      'SELECT rank_at_submission FROM entry_publication WHERE entry_id = ?',
    ).bind(entryId).first<{ rank_at_submission: number }>();
    expect(publication?.rank_at_submission).toBe(row!.rankAtSubmission);
    expect(row!.rankAtSubmission).toBe(1);
  });

  it('bounds any requested page size', async () => {
    const statements: D1PreparedStatement[] = [];
    const seededBoard = await ensureBoard();
    for (let index = 0; index < 60; index++) {
      const occurredAt = at(9, index);
      statements.push(env.DB.prepare(`
        INSERT INTO leaderboard_entries
          (id, board_key, game_id, game_version, season_id, board_id, player_name,
           normalized_name, result_json, state, created_at)
        VALUES (?, ?, 'partition', ?, ?, 'level', 'MANY', 'many', '{}', 'eligible', ?)
      `).bind(
        `score_feed_bulk${index}`,
        seededBoard.boardKey,
        seededBoard.gameVersion,
        seededBoard.seasonId,
        occurredAt,
      ));
      statements.push(env.DB.prepare(`
        INSERT INTO activity_events
          (id, entry_id, type, game_id, board_key, rank_at_submission, occurred_at)
        VALUES (?, ?, 'leaderboard.qualified', 'partition', ?, ?, ?)
      `).bind(
        `event_feed_bulk${index}`,
        `score_feed_bulk${index}`,
        seededBoard.boardKey,
        (index % 50) + 1,
        occurredAt,
      ));
    }
    await env.DB.batch(statements);

    const clamped = await feed('?limit=500');
    expect(clamped.page.entries).toHaveLength(ACTIVITY_MAX_LIMIT);
    expect(clamped.page.nextCursor).toBeTruthy();
    expect(clamped.page.entries.some((entry) => entry.id === 'event_feed_bulk59')).toBe(true);
    const ordered = clamped.page.entries.map((entry) => entry.occurredAt);
    expect([...ordered].sort().reverse()).toEqual(ordered);
  });

  it('excludes hidden boards and stale versions or ranking authorities before pagination', async () => {
    const visible = await seedEvent({ suffix: 'visibility', occurredAt: new Date().toISOString() });
    const active = await ensureBoard();
    const contains = async (): Promise<boolean> => (await feed('?limit=50')).page.entries
      .some((entry) => entry.id === visible.eventId);
    expect(await contains()).toBe(true);
    const mutations = [
      { column: 'state', invalid: 'hidden', original: 'visible' },
      { column: 'game_version', invalid: 'retired-version', original: active.gameVersion },
      { column: 'authority_id', invalid: 'retired-authority', original: active.authorityId },
      { column: 'ranking_policy_version', invalid: 'retired-order', original: active.rankingPolicyVersion },
    ];
    for (const { column, invalid, original } of mutations) {
      await env.DB.prepare(`UPDATE leaderboard_boards SET ${column} = ? WHERE board_key = ?`)
        .bind(invalid, active.boardKey).run();
      expect(await contains(), column).toBe(false);
      await env.DB.prepare(`UPDATE leaderboard_boards SET ${column} = ? WHERE board_key = ?`)
        .bind(original, active.boardKey).run();
    }
    await env.DB.prepare('UPDATE seasons SET game_version = ? WHERE id = ?')
      .bind('retired-version', active.seasonId).run();
    expect(await contains()).toBe(false);
    await env.DB.prepare('UPDATE seasons SET game_version = ? WHERE id = ?')
      .bind(active.gameVersion, active.seasonId).run();
    expect(await contains()).toBe(true);

    const rank51 = await seedEvent({ suffix: 'nonqualifier', occurredAt: new Date().toISOString(), rank: 51 });
    expect((await feed('?limit=50')).page.entries.some((entry) => entry.id === rank51.eventId)).toBe(false);
    const link = (await feed('?limit=50')).page.entries.find((entry) => entry.id === visible.eventId)!.leaderboardPath;
    const target = new URL(link, 'https://arcadebench.org');
    expect(target.searchParams.get('mode')).toBe('leaderboard');
    expect(target.searchParams.get('board')).toBe('level');
    expect(target.searchParams.get('field')).toBe('first-light');
  });
});

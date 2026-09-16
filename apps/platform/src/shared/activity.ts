import type { ArcadeBenchEnv } from '../env';
import type { GameRegistry } from './registry';
import { decodeActivityCursor, encodeActivityCursor } from './canonical';
import { describeStoredBoard, parseContextJson } from './board-context';
import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
  SHARED_PLATFORM_PROTOCOL_VERSION,
  type FlatContext,
} from './types';

export interface ActivityEntry {
  id: string;
  type: 'leaderboard.qualified';
  entryId: string;
  gameId: string;
  gameTitle: string;
  board: { id: string; label: string; context: FlatContext };
  playerName: string;
  rankAtSubmission: number;
  occurredAt: string;
  leaderboardPath: string;
}

export interface ActivityPage {
  protocolVersion: number;
  entries: ActivityEntry[];
  nextCursor?: string;
}

interface ActivityRow {
  event_id: string;
  entry_id: string;
  game_id: string;
  board_id: string;
  context_json: string;
  board_label: string;
  player_name: string;
  rank_at_submission: number;
  occurred_at: string;
}

export function activityLimit(value: string | null): number {
  if (!value) return ACTIVITY_DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return ACTIVITY_DEFAULT_LIMIT;
  return Math.max(1, Math.min(ACTIVITY_MAX_LIMIT, parsed));
}

/**
 * One global feed for every registered game, newest first. The stream is built
 * from the shared event table only: no per-game query, no session, no consent
 * flag, no note text, and no private key ever reaches it. Entries whose game is
 * not registered with this release are skipped rather than guessing a title or
 * a link.
 */
export async function listActivity(
  env: ArcadeBenchEnv,
  registry: GameRegistry,
  options: { limit: number; cursor: string | null; gameId: string | null },
): Promise<ActivityPage> {
  if (options.gameId !== null) registry.require(options.gameId);
  const cursor = decodeActivityCursor(options.cursor);
  // Apply registration and current authority/version before LIMIT. Otherwise
  // retired games can fill a page that appears empty after renderer filtering.
  const registeredBoards = registry.list()
    .filter((adapter) => options.gameId === null || adapter.gameId === options.gameId)
    .flatMap((adapter) => adapter.boards.map((board) => [
      adapter.gameId, adapter.currentGameVersion, adapter.authorityId,
      board.boardId, board.rankingPolicyVersion,
    ]));
  if (registeredBoards.length === 0) {
    return { protocolVersion: SHARED_PLATFORM_PROTOCOL_VERSION, entries: [] };
  }
  const result = await env.DB.prepare(`
    SELECT ev.id AS event_id, ev.entry_id, ev.game_id, e.board_id,
      b.context_json, b.label AS board_label, e.player_name,
      ev.rank_at_submission, ev.occurred_at
    FROM activity_events ev
    JOIN leaderboard_entries e ON e.id = ev.entry_id
    JOIN leaderboard_boards b ON b.board_key = e.board_key
    WHERE e.state = 'eligible' AND b.state = 'visible'
      AND ev.type = 'leaderboard.qualified' AND ev.rank_at_submission BETWEEN 1 AND 50
      AND ev.game_id = e.game_id AND ev.board_key = e.board_key
      AND b.game_id = e.game_id AND b.game_version = e.game_version
      AND b.season_id = e.season_id AND b.board_id = e.board_id
      AND (${registeredBoards.map(() => `
        (e.game_id = ? AND e.game_version = ? AND b.authority_id = ?
          AND b.board_id = ? AND b.ranking_policy_version = ?)
      `).join(' OR ')})
      AND EXISTS (
        SELECT 1 FROM seasons s
        WHERE s.id = e.season_id AND s.game_id = e.game_id AND s.state = 'active'
          AND s.game_version = e.game_version
      )
      ${cursor === null ? '' : 'AND (ev.occurred_at < ? OR (ev.occurred_at = ? AND ev.id < ?))'}
    ORDER BY ev.occurred_at DESC, ev.id DESC
    LIMIT ?
  `).bind(
    ...registeredBoards.flat(),
    ...(cursor === null ? [] : [cursor.occurredAt, cursor.occurredAt, cursor.id]),
    options.limit + 1,
  ).all<ActivityRow>();

  const rows = result.results ?? [];
  const hasMore = rows.length > options.limit;
  const page = rows.slice(0, options.limit);
  const entries: ActivityEntry[] = [];
  for (const row of page) {
    const adapter = registry.get(row.game_id);
    if (!adapter) continue;
    const context = parseContextJson(row.context_json);
    const described = describeStoredBoard(adapter, row.board_id, context, row.board_label);
    entries.push({
      id: row.event_id,
      type: 'leaderboard.qualified',
      entryId: row.entry_id,
      gameId: row.game_id,
      gameTitle: adapter.gameTitle,
      board: { id: row.board_id, label: described.label, context },
      playerName: row.player_name,
      rankAtSubmission: row.rank_at_submission,
      occurredAt: row.occurred_at,
      leaderboardPath: described.path,
    });
  }

  const last = page.at(-1);
  return {
    protocolVersion: SHARED_PLATFORM_PROTOCOL_VERSION,
    entries,
    ...(hasMore && last
      ? { nextCursor: encodeActivityCursor({ occurredAt: last.occurred_at, id: last.event_id }) }
      : {}),
  };
}

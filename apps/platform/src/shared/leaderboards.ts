import type { ArcadeBenchEnv } from '../env';
import { canonicalStringify, randomId, sha256Hex } from '../crypto';
import { ApiError, requiredString } from '../http';
import { moderateCallsign } from '../moderation';
import { enforceRateLimit, type AnonymousSession } from '../session';
import {
  canonicalBoardKey,
  canonicalContextJson,
  decodeOffsetCursor,
  encodeOffsetCursor,
  filtersFromQuery,
  normalizeRankComponents,
  orderByClause,
  resolveFlatContext,
} from './canonical';
import { describeStoredBoard, parseContextJson } from './board-context';
import {
  finalizeReplayObjectStatement,
  insertEventStatement,
  insertPublicationStatement,
  parsePublication,
} from './publication';
import { archiveObjectKey, createPendingReplayObject, linkEntryReplayObjectStatement, requeueLateReplayUpload } from './replays';
import {
  LEADERBOARD_MAX_LIMIT,
  REPLAY_RETENTION_MS,
  type BoardDefinition,
  type BoardInstance,
  type ChallengeRecord,
  type GameAdapter,
  type InsertEntryRequest,
  type NormalizedEntry,
  type NormalizedSubmission,
} from './types';

export interface EntryRow {
  id: string;
  game_id: string;
  game_version: string;
  board_id: string;
  player_name: string;
  result_json: string;
  created_at: string;
  context_json: string;
  board_label: string;
}

export interface PublicationRow extends EntryRow {
  rank_at_submission: number;
  replay_saved: number;
  publication_expires_at: string | null;
}

const ENTRY_SELECT = `
  SELECT e.id, e.game_id, e.game_version, e.board_id, e.player_name, e.result_json,
    e.created_at, b.context_json, b.label AS board_label
  FROM leaderboard_entries e
  JOIN leaderboard_boards b ON b.board_key = e.board_key
`;

export function boardDefinition(adapter: GameAdapter, boardId: string): BoardDefinition {
  const definition = adapter.boards.find((board) => board.boardId === boardId);
  if (!definition) throw new ApiError(404, 'Leaderboard not found.');
  return definition;
}

export function normalizedEntry(row: EntryRow, adapter: GameAdapter): NormalizedEntry {
  const context = parseContextJson(row.context_json);
  const described = describeStoredBoard(adapter, row.board_id, context, row.board_label);
  return {
    id: row.id,
    gameId: row.game_id,
    gameVersion: row.game_version,
    board: { id: row.board_id, label: described.label, context },
    playerName: row.player_name,
    result: JSON.parse(row.result_json),
    createdAt: row.created_at,
  };
}

export async function resolveBoardInstance(
  env: ArcadeBenchEnv,
  adapter: GameAdapter,
  boardId: string,
  context: Record<string, unknown>,
): Promise<BoardInstance> {
  const definition = boardDefinition(adapter, boardId);
  const resolution = adapter.resolveBoard(boardId, resolveFlatContext(definition, context));
  const season = await adapter.activeSeason(env);
  const gameVersion = adapter.currentGameVersion;
  if (season.gameVersion !== gameVersion) {
    throw new ApiError(503, 'Ranked play is between seasons. Try again shortly.');
  }
  return {
    gameId: adapter.gameId,
    gameVersion,
    authorityId: adapter.authorityId,
    rankingPolicyVersion: resolution.rankingPolicyVersion,
    seasonId: season.id,
    boardId,
    context: resolution.context,
    label: resolution.label,
    path: resolution.path,
    boardKey: canonicalBoardKey({
      gameId: adapter.gameId,
      gameVersion,
      authorityId: adapter.authorityId,
      rankingPolicyVersion: resolution.rankingPolicyVersion,
      seasonId: season.id,
      boardId,
      context: resolution.context,
    }),
  };
}

/** Resolves a board from registered `filter.*` query parameters only. */
export async function resolveBoardFromQuery(
  env: ArcadeBenchEnv,
  adapter: GameAdapter,
  boardId: string,
  url: URL,
): Promise<BoardInstance> {
  const definition = boardDefinition(adapter, boardId);
  const filters = filtersFromQuery(definition, url);
  return resolveBoardInstance(env, adapter, boardId, filters);
}

export async function boardFromRunContext(
  env: ArcadeBenchEnv,
  adapter: GameAdapter,
  boardId: string,
  context: unknown,
): Promise<BoardInstance> {
  const definition = boardDefinition(adapter, boardId);
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new ApiError(400, 'Run context must be an object.');
  }
  const flat = resolveFlatContext(definition, context as Record<string, unknown>);
  return resolveBoardInstance(env, adapter, boardId, flat);
}

export function leaderboardLimit(value: string | null): number {
  const limitValue = Number(value ?? 25);
  return Number.isInteger(limitValue) ? Math.max(1, Math.min(LEADERBOARD_MAX_LIMIT, limitValue)) : 25;
}

export interface LeaderboardPage {
  entries: NormalizedEntry[];
  nextCursor?: string;
}

/**
 * The shared query is authoritative for listing: one ordering over the common
 * rank-vector table, never per-game queries or a merge of separate boards.
 */
export async function listBoardEntries(
  env: ArcadeBenchEnv,
  adapter: GameAdapter,
  board: BoardInstance,
  options: { limit: number; cursor: string | null },
): Promise<LeaderboardPage> {
  const offset = decodeOffsetCursor(options.cursor);
  const result = await env.DB.prepare(`
    ${ENTRY_SELECT}
    WHERE e.board_key = ? AND e.state = 'eligible' AND b.state = 'visible'
    ORDER BY ${orderByClause('e.')}
    LIMIT ? OFFSET ?
  `).bind(board.boardKey, options.limit + 1, offset).all<EntryRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > options.limit;
  return {
    entries: rows.slice(0, options.limit).map((row) => normalizedEntry(row, adapter)),
    ...(hasMore ? { nextCursor: encodeOffsetCursor(offset + options.limit) } : {}),
  };
}

export async function entryById(
  env: ArcadeBenchEnv,
  entryId: string,
): Promise<PublicationRow | null> {
  return env.DB.prepare(`
    SELECT e.id, e.game_id, e.game_version, e.board_id, e.player_name, e.result_json,
      e.created_at, b.context_json, b.label AS board_label,
      p.rank_at_submission, p.replay_saved, p.expires_at AS publication_expires_at
    FROM leaderboard_entries e
    JOIN leaderboard_boards b ON b.board_key = e.board_key
    LEFT JOIN entry_publication p ON p.entry_id = e.id
    WHERE e.id = ?
  `).bind(entryId).first<PublicationRow>();
}

/**
 * Registers the board instance itself. Games whose detail table has a
 * projection trigger already create this row on their legacy write; every other
 * game gets it in the same submission transaction, so a board always exists
 * before an entry can reference it.
 */
export function ensureBoardStatement(
  env: ArcadeBenchEnv,
  board: BoardInstance,
): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO leaderboard_boards
      (board_key, game_id, game_version, authority_id, ranking_policy_version, season_id,
       board_id, context_json, label, state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'visible', ?)
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
    board.label,
    new Date().toISOString(),
  );
}

/**
 * Inserts the shared entry directly with its one-time challenge guard. Games
 * without a legacy detail table use this; Partition lets its projection trigger
 * own shared insertion and supplies its own statement instead.
 */
export function genericEntryInsertStatement(
  env: ArcadeBenchEnv,
  request: InsertEntryRequest,
): D1PreparedStatement {
  const components = normalizeRankComponents(request.rankComponents);
  return env.DB.prepare(`
    INSERT INTO leaderboard_entries
      (id, board_key, game_id, game_version, season_id, board_id, player_name,
       normalized_name, result_json, rank_1, rank_2, rank_3, rank_4, rank_5,
       rank_6, rank_7, rank_8, state, moderation_key, run_id, replay_object_id, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'eligible', ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM shared_run_challenges
      WHERE id = ? AND session_id = ? AND consumed_entry_id = ?
        AND board_key = ? AND game_id = ? AND game_version = ? AND season_id = ?
    )
  `).bind(
    request.id,
    request.boardKey,
    request.gameId,
    request.gameVersion,
    request.seasonId,
    request.boardId,
    request.playerName,
    request.normalizedName,
    request.resultJson,
    ...components,
    request.moderationKey,
    request.runId,
    request.replayObjectId,
    request.createdAt,
    request.runId,
    request.sessionId,
    request.id,
    request.boardKey,
    request.gameId,
    request.gameVersion,
    request.seasonId,
  );
}

export interface SharedSubmissionRequest {
  env: ArcadeBenchEnv;
  adapter: GameAdapter;
  session: AnonymousSession;
  boardId: string;
  body: Record<string, unknown>;
}

/** The board a submission belongs to comes from the run challenge, not the client. */
function challengeContext(challenge: ChallengeRecord): Record<string, string> {
  const context = challenge.payload.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new ApiError(409, 'Ranked run is no longer valid.');
  }
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (typeof value !== 'string') throw new ApiError(409, 'Ranked run context is no longer valid.');
    Object.defineProperty(flat, key, { value, enumerable: true, configurable: true, writable: true });
  }
  return flat;
}

/**
 * The common verified-score transaction: consume the one-time challenge,
 * insert the eligible entry, snapshot placement and retention, emit one
 * activity event, and finalize the private replay object in a single D1 batch.
 * Placement is calculated by the shared ordering inside that batch, so the
 * client can never supply it, and a conflicting or expired replay object rolls
 * the whole batch back inside SQL.
 */
export async function submitSharedScore(
  request: SharedSubmissionRequest,
): Promise<NormalizedSubmission> {
  const { env, adapter, session, boardId, body } = request;
  await enforceRateLimit(env, session.id, 'submit_score', 6, true);
  if (body.gameVersion !== adapter.currentGameVersion) {
    throw new ApiError(409, 'Game version is no longer ranked.');
  }
  const runId = requiredString(body.runId, 'Ranked run', 64);
  const publication = parsePublication(body.publication);
  const challenge = await adapter.loadChallenge({
    env,
    sessionId: session.id,
    runId,
    boardId,
    gameVersion: adapter.currentGameVersion,
  });
  const board = await resolveBoardInstance(env, adapter, boardId, challengeContext(challenge));
  if (challenge.boardKey !== board.boardKey || challenge.seasonId !== board.seasonId
    || challenge.gameVersion !== board.gameVersion) {
    throw new ApiError(409, 'This ranked board has closed. Start a new run.');
  }
  const verified = adapter.verifySubmission({
    challenge,
    board,
    score: body.score,
    proof: body.proof,
  });
  const review = await moderateCallsign(body.playerName, env);
  if (!review.allowed || !review.normalizedName || !review.moderationKey) {
    throw new ApiError(400, review.reason ?? 'Choose a public-friendly callsign.');
  }

  const entryId = randomId('score');
  const replayObjectId = randomId('replay');
  const objectKey = archiveObjectKey(adapter.gameId, board.gameVersion, replayObjectId);
  const proofSha = await sha256Hex(verified.proofBytes);
  const createdAt = new Date().toISOString();
  const retentionDeadline = new Date(Date.parse(createdAt) + REPLAY_RETENTION_MS).toISOString();

  await createPendingReplayObject(env, {
    id: replayObjectId,
    gameId: adapter.gameId,
    gameVersion: board.gameVersion,
    objectKey,
    sha256: proofSha,
    expiresAt: retentionDeadline,
  }, createdAt);
  try {
    await env.REPLAYS.put(objectKey, verified.proofBytes, {
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
      customMetadata: {
        sha256: proofSha,
        kind: 'leaderboard-proof',
        expiresAt: retentionDeadline,
      },
    });
  } catch {
    // The pending record keeps any possibly committed archive on the five-day
    // cleanup path. A network error never triggers a delete.
    await requeueLateReplayUpload(env, replayObjectId);
    throw new ApiError(503, 'Replay storage is unavailable. Try again shortly.');
  }
  if (await requeueLateReplayUpload(env, replayObjectId)) {
    throw new ApiError(409, 'Replay object expired before finalization. Start a new run.');
  }

  const draft = {
    env,
    id: entryId,
    boardKey: board.boardKey,
    boardId: board.boardId,
    gameId: board.gameId,
    gameVersion: board.gameVersion,
    seasonId: board.seasonId,
    playerName: review.normalizedName,
    normalizedName: review.normalizedName.toLocaleLowerCase(),
    resultJson: canonicalStringify(verified.result),
    rankComponents: verified.rankComponents,
    moderationKey: review.moderationKey,
    runId,
    sessionId: session.id,
    createdAt,
    replayObjectId,
    replayObjectKey: objectKey,
    replaySha256: proofSha,
  };

  const finalizedAt = new Date().toISOString();
  const statements = await env.DB.batch([
    ensureBoardStatement(env, board),
    adapter.consumeChallengeStatement({ env, runId, sessionId: session.id, entryId, board, at: finalizedAt }),
    adapter.insertEntryStatement(draft),
    insertPublicationStatement(env, {
      entryId,
      boardKey: board.boardKey,
      decision: publication,
      replayObjectId,
      retentionDeadline,
      createdAt,
      rankComponents: verified.rankComponents,
    }),
    insertEventStatement(env, { id: randomId('event'), entryId }),
    finalizeReplayObjectStatement(env, { entryId, replayObjectId, updatedAt: finalizedAt }),
    linkEntryReplayObjectStatement(env, { entryId, replayObjectId }),
  ]);

  // The challenge statement is the only write in this batch that no trigger
  // touches, so it is the reliable conflict signal. D1 counts rows written by
  // triggers, which makes the entry statement's count game dependent.
  if ((statements[1]!.meta.changes ?? 0) !== 1) {
    throw new ApiError(409, 'This ranked run was already submitted or expired.');
  }

  const row = await entryById(env, entryId);
  if (!row) throw new ApiError(503, 'Arcade services could not store that score.');
  return {
    entry: normalizedEntry(row, adapter),
    publication: {
      rankAtSubmission: row.rank_at_submission,
      replaySaved: row.replay_saved === 1,
      expiresAt: row.publication_expires_at ?? null,
    },
  };
}

import {
  SMILEFALL_CURRENT_RANKED_AUTHORITY,
  SmilefallProofError,
  verifySmilefallRankedProof,
  type SmilefallRankedChallenge,
  type SmilefallRankedSummary,
} from '@arcadebench/smilefall/verifier';
import { canonicalStringify, randomId, randomSeed } from './crypto';
import { ApiError, requiredObject } from './http';
import { canonicalBoardKey, canonicalContextJson, normalizeRankComponents } from './shared/canonical';
import { genericEntryInsertStatement } from './shared/leaderboards';
import type { BoardInstance, BoardResolution, FlatContext, GameAdapter } from './shared/types';

const AUTHORITY = SMILEFALL_CURRENT_RANKED_AUTHORITY;
const ARCADE_RANKING_POLICY = 'arcade-v1';
const LEVEL_RANKING_POLICY = 'level-v1';
const RUN_LIFETIME_MS = 2 * 60 * 60 * 1000;

const DIFFICULTY_LABELS: Readonly<Record<string, string>> = {
  giggle: 'Giggle',
  chuckle: 'Chuckle',
  guffaw: 'Guffaw',
  cackle: 'Cackle',
};

interface ChallengeRow {
  id: string;
  board_id: string;
  board_key: string;
  game_version: string;
  season_id: string;
  context_json: string;
  seed: number;
  expires_at: string;
  consumed_entry_id: string | null;
}

function isDifficulty(value: unknown): value is SmilefallRankedChallenge['difficulty'] {
  return typeof value === 'string' && (AUTHORITY.difficulties as readonly string[]).includes(value);
}

function levelById(levelId: unknown): (typeof AUTHORITY.levels)[number] | undefined {
  return typeof levelId === 'string'
    ? AUTHORITY.levels.find((level) => level.id === levelId)
    : undefined;
}

function assertExactContext(context: Readonly<Record<string, unknown>>, fields: readonly string[]): void {
  const actual = Object.keys(context).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new ApiError(400, 'Leaderboard context is invalid.');
  }
}

function boardPath(boardId: 'arcade' | 'level', context: FlatContext): string {
  const search = new URLSearchParams({
    mode: 'leaderboard',
    board: boardId,
    difficulty: context.difficulty!,
  });
  if (boardId === 'level') search.set('level', context.levelId!);
  return `/games/smilefall/?${search}`;
}

function describe(boardId: string, context: Readonly<Record<string, unknown>>): BoardResolution {
  if (boardId !== 'arcade' && boardId !== 'level') throw new ApiError(404, 'Leaderboard not found.');
  assertExactContext(context, boardId === 'arcade' ? ['difficulty'] : ['difficulty', 'levelId']);
  const difficulty = context.difficulty;
  if (!isDifficulty(difficulty)) throw new ApiError(400, 'Difficulty is invalid.');
  const label = DIFFICULTY_LABELS[difficulty] ?? difficulty;
  if (boardId === 'arcade') {
    const resolved = { difficulty };
    return {
      boardId,
      context: resolved,
      label: `Arcade Run · ${label}`,
      path: boardPath(boardId, resolved),
      rankingPolicyVersion: ARCADE_RANKING_POLICY,
    };
  }
  const level = levelById(context.levelId);
  if (!level) throw new ApiError(400, 'Level identifier is invalid.');
  const resolved = { difficulty, levelId: level.id };
  return {
    boardId,
    context: resolved,
    label: `${level.title} · ${label}`,
    path: boardPath(boardId, resolved),
    rankingPolicyVersion: LEVEL_RANKING_POLICY,
  };
}

function assertBoard(board: BoardInstance): void {
  const resolution = describe(board.boardId, board.context);
  if (board.gameId !== AUTHORITY.gameId
    || board.gameVersion !== AUTHORITY.gameVersion
    || board.authorityId !== AUTHORITY.authorityId
    || board.rankingPolicyVersion !== resolution.rankingPolicyVersion
    || board.boardKey !== canonicalBoardKey(board)) {
    throw new ApiError(409, 'Smilefall ranking authority has closed.');
  }
}

/** All leaderboard components sort ascending and come only from verified simulation output. */
export function smilefallRankComponents(summary: SmilefallRankedSummary): number[] {
  const descending = (value: number): number => value === 0 ? 0 : -value;
  if (summary.scope === 'arcade') {
    return normalizeRankComponents([
      summary.completed ? -1 : 0,
      descending(summary.stagesCleared),
      descending(summary.score),
      summary.totalTicks,
      summary.popped,
    ]);
  }
  return normalizeRankComponents([
    summary.won ? -1 : 0,
    descending(summary.score),
    summary.totalTicks,
    summary.popped,
    descending(summary.caught),
  ]);
}

/**
 * Smilefall uses the generic platform ledger. Its proof verifier reconstructs
 * registered levels and simulates only the challenge-bound input stream;
 * client-authored scenarios and client-authored final scores have no authority.
 */
export const smilefallPlatformAdapter: GameAdapter = {
  gameId: AUTHORITY.gameId,
  gameTitle: 'Smilefall',
  gamePath: '/games/smilefall/',
  authorityId: AUTHORITY.authorityId,
  currentGameVersion: AUTHORITY.gameVersion,
  boards: [
    {
      boardId: 'arcade',
      contextFields: ['difficulty'],
      contextFieldLabels: { difficulty: 'Difficulty' },
      rankingPolicyVersion: ARCADE_RANKING_POLICY,
    },
    {
      boardId: 'level',
      contextFields: ['difficulty', 'levelId'],
      contextFieldLabels: { difficulty: 'Difficulty', levelId: 'Level' },
      rankingPolicyVersion: LEVEL_RANKING_POLICY,
    },
  ],
  feedback: {
    kinds: {
      game: { ids: [AUTHORITY.gameId], label: 'Game' },
      level: { ids: AUTHORITY.levels.map((level) => level.id), label: 'Level' },
    },
    channels: ['overall'],
  },

  async activeSeason(env) {
    const season = await env.DB.prepare(`
      SELECT id, game_version FROM seasons
      WHERE game_id = ? AND state = 'active'
    `).bind(AUTHORITY.gameId).first<{ id: string; game_version: string }>();
    if (!season || season.game_version !== AUTHORITY.gameVersion) {
      throw new ApiError(503, 'Smilefall rankings are between competitions. Local play is available.');
    }
    return { id: season.id, gameVersion: season.game_version };
  },

  resolveBoard: describe,
  describeBoard: describe,

  async beginRun(request) {
    assertBoard(request.board);
    const id = randomId('run');
    const seed = randomSeed();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + RUN_LIFETIME_MS).toISOString();
    const contextJson = canonicalContextJson(request.board.context);
    const result = await request.env.DB.prepare(`
      INSERT INTO shared_run_challenges
        (id, session_id, game_id, game_version, season_id, board_key, board_id,
         context_json, seed, created_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM seasons
        WHERE id = ? AND game_id = ? AND game_version = ? AND state = 'active'
      )
    `).bind(
      id,
      request.sessionId,
      AUTHORITY.gameId,
      AUTHORITY.gameVersion,
      request.board.seasonId,
      request.board.boardKey,
      request.board.boardId,
      contextJson,
      seed,
      createdAt.toISOString(),
      expiresAt,
      request.board.seasonId,
      AUTHORITY.gameId,
      AUTHORITY.gameVersion,
    ).run();
    if (result.meta.changes !== 1) throw new ApiError(409, 'Smilefall ranking competition has closed.');
    return { id, seed, expiresAt };
  },

  async loadChallenge(request) {
    const row = await request.env.DB.prepare(`
      SELECT id, board_id, board_key, game_version, season_id, context_json,
        seed, expires_at, consumed_entry_id
      FROM shared_run_challenges
      WHERE id = ? AND session_id = ? AND game_id = ?
    `).bind(request.runId, request.sessionId, AUTHORITY.gameId).first<ChallengeRow>();
    if (!row || row.board_id !== request.boardId) throw new ApiError(404, 'Ranked run challenge not found.');
    if (row.game_version !== AUTHORITY.gameVersion || request.gameVersion !== AUTHORITY.gameVersion) {
      throw new ApiError(409, 'Smilefall ranking authority has closed.');
    }
    if (row.consumed_entry_id) throw new ApiError(409, 'This ranked run was already submitted.');
    if (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) {
      throw new ApiError(410, 'This ranked run expired. Start a new run.');
    }
    let context: unknown;
    try {
      context = JSON.parse(row.context_json);
    } catch {
      throw new ApiError(409, 'Ranked run context is invalid.');
    }
    const resolved = describe(row.board_id, requiredObject(context, 'Ranked run context'));
    if (canonicalContextJson(resolved.context) !== row.context_json) {
      throw new ApiError(409, 'Ranked run context is invalid.');
    }
    return {
      id: row.id,
      boardId: row.board_id,
      boardKey: row.board_key,
      gameVersion: row.game_version,
      seasonId: row.season_id,
      seed: row.seed,
      expiresAt: row.expires_at,
      payload: { context: resolved.context },
    };
  },

  consumeChallengeStatement(request) {
    assertBoard(request.board);
    return request.env.DB.prepare(`
      UPDATE shared_run_challenges SET consumed_at = ?, consumed_entry_id = ?
      WHERE id = ? AND session_id = ? AND game_id = ?
        AND game_version = ? AND season_id = ? AND board_key = ? AND board_id = ?
        AND context_json = ? AND consumed_entry_id IS NULL
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND EXISTS (
          SELECT 1 FROM seasons
          WHERE id = ? AND game_id = ? AND game_version = ? AND state = 'active'
        )
        AND NOT EXISTS (
          SELECT 1 FROM leaderboard_boards WHERE board_key = ? AND state <> 'visible'
        )
    `).bind(
      request.at,
      request.entryId,
      request.runId,
      request.sessionId,
      AUTHORITY.gameId,
      AUTHORITY.gameVersion,
      request.board.seasonId,
      request.board.boardKey,
      request.board.boardId,
      canonicalContextJson(request.board.context),
      request.board.seasonId,
      AUTHORITY.gameId,
      AUTHORITY.gameVersion,
      request.board.boardKey,
    );
  },

  insertEntryStatement(request) {
    return genericEntryInsertStatement(request.env, request);
  },

  verifySubmission({ challenge, board, score, proof }) {
    assertBoard(board);
    if (challenge.boardId !== board.boardId
      || challenge.boardKey !== board.boardKey
      || challenge.gameVersion !== board.gameVersion
      || challenge.seasonId !== board.seasonId
      || canonicalStringify(challenge.payload.context) !== canonicalStringify(board.context)) {
      throw new ApiError(409, 'Ranked run does not match the Smilefall board.');
    }
    if (board.boardId !== 'arcade' && board.boardId !== 'level') {
      throw new ApiError(409, 'Ranked run does not match the Smilefall board.');
    }
    const difficulty = board.context.difficulty;
    if (!isDifficulty(difficulty)) {
      throw new ApiError(409, 'Ranked run does not match the Smilefall board.');
    }
    let verified;
    try {
      verified = verifySmilefallRankedProof(
        proof,
        {
          runId: challenge.id,
          nonce: challenge.seed,
          boardId: board.boardId,
          difficulty,
          ...(board.boardId === 'level' ? { levelId: board.context.levelId! } : {}),
        },
        AUTHORITY.gameVersion,
      );
    } catch (error) {
      if (error instanceof SmilefallProofError) throw new ApiError(400, error.message);
      throw error;
    }
    const claimed = requiredObject(score, 'Score');
    if (canonicalStringify(claimed) !== canonicalStringify(verified.summary)) {
      throw new ApiError(400, 'Claimed score does not match the verified Smilefall run.');
    }
    return {
      result: { ...verified.summary },
      rankComponents: smilefallRankComponents(verified.summary),
      proofBytes: verified.canonicalJson,
    };
  },
};

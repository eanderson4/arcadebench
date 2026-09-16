import {
  MALTLINE_CURRENT_CABINET_AUTHORITY,
  MaltlineCabinetProofError,
  verifyMaltlineCabinetProof,
  type MaltlineCabinetSummary,
} from '@arcadebench/maltline/verifier';
import { canonicalStringify, randomId, randomSeed } from './crypto';
import { ApiError, requiredObject } from './http';
import { admitMaltlineExpensiveRequest } from './maltline-admission';
import { canonicalBoardKey, normalizeRankComponents } from './shared/canonical';
import { genericEntryInsertStatement } from './shared/leaderboards';
import type { BoardInstance, BoardResolution, GameAdapter } from './shared/types';

const AUTHORITY = MALTLINE_CURRENT_CABINET_AUTHORITY;
const RANKING_POLICY = 'cabinet-arcade-v1';

function describe(boardId: string, context: Readonly<Record<string, unknown>>): BoardResolution {
  if (boardId !== 'arcade') throw new ApiError(404, 'Leaderboard not found.');
  if (Object.keys(context).length !== 0) throw new ApiError(400, 'Cabinet arcade context must be empty.');
  return {
    boardId,
    context: {},
    label: 'Cabinet Arcade',
    path: '/games/maltline/?mode=leaderboard&board=arcade',
    rankingPolicyVersion: RANKING_POLICY,
  };
}

function assertBoard(board: BoardInstance): void {
  describe(board.boardId, board.context);
  if (board.gameId !== AUTHORITY.gameId || board.gameVersion !== AUTHORITY.gameVersion
    || board.authorityId !== AUTHORITY.authorityId || board.seasonId !== AUTHORITY.seasonId
    || board.rankingPolicyVersion !== RANKING_POLICY || board.boardKey !== canonicalBoardKey(board)) {
    throw new ApiError(409, 'Maltline cabinet ranking authority has closed.');
  }
}

/** All components sort ascending; no client-supplied value enters ranking. */
export function maltlineCabinetRankComponents(summary: MaltlineCabinetSummary): number[] {
  return normalizeRankComponents([-Number(summary.completed), -summary.stageReached,
    -summary.score, summary.totalTicks, -summary.fulfilled]);
}

interface ChallengeRow {
  id: string; board_id: string; board_key: string; game_version: string; season_id: string;
  context_json: string; seed: number; expires_at: string; consumed_entry_id: string | null;
}

/** Cabinet v3 replays use their own authority and the shared platform ledger. */
export const maltlinePlatformAdapter: GameAdapter = {
  gameId: 'maltline',
  gameTitle: 'Maltline',
  gamePath: '/games/maltline/',
  authorityId: AUTHORITY.authorityId,
  currentGameVersion: AUTHORITY.gameVersion,
  boards: [{ boardId: 'arcade', contextFields: [], contextFieldLabels: {}, rankingPolicyVersion: RANKING_POLICY }],
  feedback: {
    kinds: {
      game: { ids: ['maltline'], label: 'Game' },
      stage: { ids: AUTHORITY.campaign.map(stage => stage.id), label: 'Stage' },
    },
    channels: ['overall'],
  },

  admitRankedWrite(request, env) {
    return admitMaltlineExpensiveRequest(request, env, 'ranked-write');
  },

  async activeSeason(env) {
    const season = await env.DB.prepare(`
      SELECT id, game_version FROM seasons
      WHERE id = ? AND game_id = 'maltline' AND game_version = ? AND state = 'active'
    `).bind(AUTHORITY.seasonId, AUTHORITY.gameVersion).first<{ id: string; game_version: string }>();
    if (!season) throw new ApiError(503, 'Maltline cabinet rankings are not open. Local play is available.');
    return { id: season.id, gameVersion: season.game_version };
  },

  resolveBoard: describe,
  describeBoard: describe,

  async beginRun(request) {
    assertBoard(request.board);
    const id = randomId('run');
    const seed = randomSeed();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const result = await request.env.DB.prepare(`
      INSERT INTO shared_run_challenges
        (id, session_id, game_id, game_version, season_id, board_key, board_id,
         context_json, seed, created_at, expires_at)
      SELECT ?, ?, 'maltline', ?, ?, ?, 'arcade', '{}', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM seasons WHERE id = ? AND game_id = 'maltline'
        AND game_version = ? AND state = 'active')
    `).bind(id, request.sessionId, AUTHORITY.gameVersion, AUTHORITY.seasonId, request.board.boardKey,
      seed, createdAt.toISOString(), expiresAt, AUTHORITY.seasonId, AUTHORITY.gameVersion).run();
    if (result.meta.changes !== 1) throw new ApiError(409, 'Maltline cabinet ranking season has closed.');
    return { id, seed, expiresAt };
  },

  async loadChallenge(request) {
    const row = await request.env.DB.prepare(`
      SELECT id, board_id, board_key, game_version, season_id, context_json, seed, expires_at, consumed_entry_id
      FROM shared_run_challenges WHERE id = ? AND session_id = ? AND game_id = 'maltline'
    `).bind(request.runId, request.sessionId).first<ChallengeRow>();
    if (!row || row.board_id !== request.boardId) throw new ApiError(404, 'Ranked run challenge not found.');
    if (row.game_version !== AUTHORITY.gameVersion || request.gameVersion !== AUTHORITY.gameVersion
      || row.season_id !== AUTHORITY.seasonId || row.context_json !== '{}') {
      throw new ApiError(409, 'Maltline cabinet ranking authority has closed.');
    }
    if (row.consumed_entry_id) throw new ApiError(409, 'This ranked run was already submitted.');
    if (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) {
      throw new ApiError(410, 'This ranked run expired. Start a new run.');
    }
    return { id: row.id, boardId: row.board_id, boardKey: row.board_key,
      gameVersion: row.game_version, seasonId: row.season_id,
      seed: row.seed, expiresAt: row.expires_at, payload: { context: {} } };
  },

  consumeChallengeStatement(request) {
    assertBoard(request.board);
    return request.env.DB.prepare(`
      UPDATE shared_run_challenges SET consumed_at = ?, consumed_entry_id = ?
      WHERE id = ? AND session_id = ? AND game_id = 'maltline'
        AND game_version = ? AND season_id = ? AND board_key = ? AND board_id = 'arcade'
        AND consumed_entry_id IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND EXISTS (SELECT 1 FROM seasons WHERE id = ? AND game_id = 'maltline'
          AND game_version = ? AND state = 'active')
    `).bind(request.at, request.entryId, request.runId, request.sessionId,
      AUTHORITY.gameVersion, AUTHORITY.seasonId, request.board.boardKey,
      AUTHORITY.seasonId, AUTHORITY.gameVersion);
  },

  insertEntryStatement(request) {
    return genericEntryInsertStatement(request.env, request);
  },

  verifySubmission({ challenge, board, score, proof }) {
    assertBoard(board);
    if (challenge.boardId !== board.boardId || challenge.boardKey !== board.boardKey
      || challenge.gameVersion !== board.gameVersion || challenge.seasonId !== board.seasonId) {
      throw new ApiError(409, 'Ranked run does not match the cabinet board.');
    }
    let verified;
    try {
      verified = verifyMaltlineCabinetProof(proof, { runId: challenge.id, nonce: challenge.seed }, AUTHORITY.gameVersion);
    } catch (error) {
      if (error instanceof MaltlineCabinetProofError) throw new ApiError(400, error.message);
      throw error;
    }
    const claimed = requiredObject(score, 'Score');
    if (canonicalStringify(claimed) !== canonicalStringify(verified.summary)) {
      throw new ApiError(400, 'Claimed score does not match the verified cabinet run.');
    }
    return { result: { ...verified.summary }, rankComponents: maltlineCabinetRankComponents(verified.summary),
      proofBytes: verified.canonicalJson };
  },
};

import { env } from 'cloudflare:workers';
import { canonicalStringify, randomId, randomSeed } from '../../src/crypto';
import { ApiError, requiredObject } from '../../src/http';
import { genericEntryInsertStatement } from '../../src/shared/leaderboards';
import { canonicalContextJson, normalizeRankComponents } from '../../src/shared/canonical';
import type { GameAdapter, VerifiedSubmission } from '../../src/shared/types';

/**
 * A second game that only ever uses the shared protocol: no legacy detail
 * table, no projection trigger, no explicit replay sharing, and its own board
 * context and feedback kinds. If the platform grew a per-game branch, this
 * adapter would not work.
 */
export const SYNTHETIC_GAME_ID = 'synthetic';
export const SYNTHETIC_GAME_VERSION = '1.0.0';
const MODES = ['relay', 'sprint'] as const;
const MAX_POINTS = 100_000;

interface SyntheticChallengePayload {
  seed: number;
  mode: string;
}

function modeLabel(mode: string): string {
  return mode === 'sprint' ? 'Sprint Map' : 'Relay Map';
}

function board(mode: string) {
  return {
    boardId: 'map',
    context: { mode },
    label: modeLabel(mode),
    path: `/games/synthetic/?mode=${mode}`,
    rankingPolicyVersion: 'map-v1',
  };
}

function validatedMode(context: Record<string, unknown>): string {
  const mode = context.mode;
  if (typeof mode !== 'string' || !MODES.includes(mode as typeof MODES[number])) {
    throw new ApiError(400, 'Mode filter is invalid.');
  }
  return mode;
}

export const syntheticAdapter: GameAdapter = {
  gameId: SYNTHETIC_GAME_ID,
  gameTitle: 'Synthetic Lanes',
  gamePath: '/games/synthetic/',
  authorityId: 'synthetic-authored-v1',
  currentGameVersion: SYNTHETIC_GAME_VERSION,
  boards: [{
    boardId: 'map',
    contextFields: ['mode'],
    contextFieldLabels: { mode: 'Mode' },
    rankingPolicyVersion: 'map-v1',
  }],
  feedback: {
    kinds: {
      map: { ids: ['harbor', 'delta'], label: 'Map' },
      run: { ids: ['daily'], label: 'Run' },
    },
    channels: ['overall', 'fun'],
  },

  async activeSeason() {
    const season = await env.DB.prepare(`
      SELECT id, game_version FROM seasons WHERE game_id = ? AND state = 'active'
    `).bind(SYNTHETIC_GAME_ID).first<{ id: string; game_version: string }>();
    if (!season) throw new ApiError(503, 'Ranked play is between seasons. Try again shortly.');
    return { id: season.id, gameVersion: season.game_version };
  },

  resolveBoard(boardId, context) {
    if (boardId !== 'map') throw new ApiError(404, 'Leaderboard not found.');
    return board(validatedMode(context));
  },

  describeBoard(boardId, context) {
    if (boardId !== 'map') throw new ApiError(404, 'Leaderboard not found.');
    return board(validatedMode(context));
  },

  async beginRun(request) {
    const id = randomId('run');
    const seed = randomSeed();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000);
    await env.DB.prepare(`
      INSERT INTO shared_run_challenges
        (id, session_id, game_id, game_version, season_id, board_key, board_id,
         context_json, seed, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      request.sessionId,
      SYNTHETIC_GAME_ID,
      SYNTHETIC_GAME_VERSION,
      request.board.seasonId,
      request.board.boardKey,
      request.board.boardId,
      canonicalContextJson(request.board.context),
      seed,
      createdAt.toISOString(),
      expiresAt.toISOString(),
    ).run();
    return { id, seed, expiresAt: expiresAt.toISOString() };
  },

  async loadChallenge(request) {
    const row = await env.DB.prepare(`
      SELECT id, board_id, board_key, game_version, season_id, context_json, seed, expires_at, consumed_entry_id
      FROM shared_run_challenges WHERE id = ? AND session_id = ?
    `).bind(request.runId, request.sessionId).first<{
      id: string;
      board_id: string;
      board_key: string;
      game_version: string;
      season_id: string;
      context_json: string;
      seed: number;
      expires_at: string;
      consumed_entry_id: string | null;
    }>();
    if (!row || row.board_id !== request.boardId) {
      throw new ApiError(404, 'Ranked run challenge not found.');
    }
    if (row.consumed_entry_id) throw new ApiError(409, 'This ranked run was already submitted.');
    if (Date.parse(row.expires_at) <= Date.now()) {
      throw new ApiError(410, 'This ranked run expired. Start a new run.');
    }
    const context = JSON.parse(row.context_json) as Record<string, string>;
    return {
      id: row.id,
      boardId: row.board_id,
      boardKey: row.board_key,
      gameVersion: row.game_version,
      seasonId: row.season_id,
      seed: row.seed,
      expiresAt: row.expires_at,
      payload: { seed: row.seed, mode: context.mode, context },
    };
  },

  consumeChallengeStatement(request) {
    return request.env.DB.prepare(`
      UPDATE shared_run_challenges SET consumed_at = ?, consumed_entry_id = ?
      WHERE id = ? AND session_id = ? AND consumed_entry_id IS NULL
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND board_key = ? AND game_version = ? AND season_id = ?
        AND EXISTS (
          SELECT 1 FROM seasons s WHERE s.id = shared_run_challenges.season_id
            AND s.game_id = shared_run_challenges.game_id AND s.game_version = shared_run_challenges.game_version
            AND s.state = 'active'
        )
    `).bind(request.at, request.entryId, request.runId, request.sessionId,
      request.board.boardKey, request.board.gameVersion, request.board.seasonId);
  },

  insertEntryStatement(request) {
    return genericEntryInsertStatement(request.env, request);
  },

  verifySubmission(request): VerifiedSubmission {
    const payload = request.challenge.payload as unknown as SyntheticChallengePayload;
    const score = requiredObject(request.score, 'Score');
    const proof = requiredObject(request.proof, 'Proof');
    // The server, not the client, decides what the run was worth: the proof
    // must carry the challenge nonce and agree with the claimed total.
    if (proof.nonce === undefined || String(proof.nonce) !== String(payload.seed)) {
      throw new ApiError(400, 'Proof does not match the ranked run challenge.');
    }
    const points = proof.points;
    if (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > MAX_POINTS) {
      throw new ApiError(400, 'Proof is invalid.');
    }
    if (score.points !== points) throw new ApiError(400, 'Claimed score does not match the proof.');
    if (score.mode !== payload.mode) throw new ApiError(400, 'Claimed score does not match the board.');
    return {
      result: { points, mode: payload.mode, cleared: points >= 500 },
      rankComponents: normalizeRankComponents([-points]),
      proofBytes: canonicalStringify({ gameId: SYNTHETIC_GAME_ID, points, nonce: proof.nonce }),
    };
  },
};

export function syntheticScore(points: number, mode: string, nonce: number): {
  score: Record<string, unknown>;
  proof: Record<string, unknown>;
} {
  return {
    score: { points, mode },
    proof: { points, nonce },
  };
}

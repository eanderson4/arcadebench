import {
  PARTITION_GAME_ID,
  PARTITION_GAME_VERSION,
  createPartitionCampaign,
  type DifficultyId,
} from '@arcadebench/partition/verifier';
import { canonicalStringify, randomId, randomSeed, sha256Hex } from './crypto';
import type { ArcadeBenchEnv } from './env';
import { ApiError, json, requiredObject, requiredString } from './http';
import { enforceRateLimit } from './session';
import { isDifficulty, verifyPartitionReplay, verifyRankedScore, type RankedChallenge } from './partition-verifier';
import { canonicalBoardKey, normalizeRankComponents } from './shared/canonical';
import type {
  BoardDefinition,
  BoardResolution,
  FlatContext,
  GameAdapter,
  InsertEntryRequest,
  NormalizedEntry,
  PublishReplayRequest,
  VerifiedSubmission,
  VerifySubmissionRequest,
} from './shared/types';

const PARTITION_VIEWER_PATH = '/games/partition/';
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const REPLAY_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  impossible: 'Impossible',
};

const BOARDS: readonly BoardDefinition[] = [
  {
    boardId: 'arcade',
    contextFields: ['difficulty'],
    contextFieldLabels: { difficulty: 'Difficulty' },
    rankingPolicyVersion: 'arcade-v1',
  },
  {
    boardId: 'level',
    contextFields: ['difficulty', 'levelId'],
    contextFieldLabels: { difficulty: 'Difficulty', levelId: 'Field' },
    rankingPolicyVersion: 'field-v1',
  },
];

interface SeasonRow {
  id: string;
  game_version: string;
}

interface RunRow extends RankedChallenge {
  id: string;
  session_id: string;
  season_id: string;
  game_version: string;
  expires_at: string;
  consumed_score_id: string | null;
}

interface ReplayShareRow {
  id: string;
  object_key: string;
  sha256: string;
  expires_at: string;
}

function campaignLevel(slug: string): ReturnType<typeof createPartitionCampaign>[number] | undefined {
  return createPartitionCampaign(0).find((level) => level.metadata.slug === slug);
}

function difficultyLabel(difficulty: DifficultyId): string {
  return DIFFICULTY_LABELS[difficulty];
}

/** Registered context for a board, with the legacy validation messages. */
export function parseRunContext(
  boardId: string,
  body: Record<string, unknown>,
): { boardId: 'arcade' | 'level'; difficulty: DifficultyId; levelId: string | null } {
  if (boardId !== 'arcade' && boardId !== 'level') throw new ApiError(400, 'Leaderboard is invalid.');
  const context = requiredObject(body.context ?? {}, 'Run context');
  const difficulty = context.difficulty;
  if (!isDifficulty(difficulty)) throw new ApiError(400, 'Difficulty is invalid.');
  if (boardId === 'arcade') {
    if (Object.keys(context).some((key) => key !== 'difficulty')) throw new ApiError(400, 'Arcade run context is invalid.');
    return { boardId, difficulty, levelId: null };
  }
  if (Object.keys(context).some((key) => key !== 'difficulty' && key !== 'levelId')) {
    throw new ApiError(400, 'Field run context is invalid.');
  }
  const levelId = requiredString(context.levelId, 'Field identifier', 128);
  if (!campaignLevel(levelId)) throw new ApiError(400, 'Field identifier is invalid.');
  return { boardId, difficulty, levelId };
}

async function activeSeason(env: ArcadeBenchEnv): Promise<SeasonRow> {
  const season = await env.DB.prepare(`
    SELECT id, game_version FROM seasons
    WHERE game_id = ? AND state = 'active'
  `).bind(PARTITION_GAME_ID).first<SeasonRow>();
  if (!season || season.game_version !== PARTITION_GAME_VERSION) {
    throw new ApiError(503, 'Ranked play is between seasons. Try again shortly.');
  }
  return season;
}

export async function challengeForSubmission(
  env: ArcadeBenchEnv,
  sessionId: string,
  runId: string,
  boardId: string,
): Promise<RunRow> {
  const row = await env.DB.prepare(`
    SELECT id, session_id, season_id, game_version, board_id AS boardId,
      difficulty, level_id AS levelId, seed, expires_at, consumed_score_id
    FROM run_challenges WHERE id = ? AND session_id = ?
  `).bind(runId, sessionId).first<RunRow>();
  if (!row || row.boardId !== boardId) throw new ApiError(404, 'Ranked run challenge not found.');
  if (row.game_version !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Ranked run version has closed.');
  if (row.consumed_score_id) throw new ApiError(409, 'This ranked run was already submitted.');
  if (Date.parse(row.expires_at) <= Date.now()) throw new ApiError(410, 'This ranked run expired. Start a new run.');
  return row;
}

/**
 * The legacy Partition entry shape, rebuilt from the shared verified result so
 * existing v1 clients keep receiving exactly the fields they already parse.
 */
export function legacyScoreEntry(entry: NormalizedEntry): Record<string, unknown> {
  const result = entry.result as Record<string, unknown>;
  const base = {
    id: entry.id,
    name: entry.playerName,
    difficulty: result.difficulty,
    elapsedMs: result.elapsedMs,
    partitions: result.partitions,
    createdAt: entry.createdAt,
  };
  if (result.scope === 'arcade') {
    return {
      ...base,
      scope: 'arcade',
      stageReached: result.stageReached,
      stagesCleared: result.stagesCleared,
      completed: result.completed === true,
    };
  }
  return {
    ...base,
    scope: 'level',
    levelId: result.levelId,
    levelNumber: result.levelNumber,
    levelTitle: result.levelTitle,
    won: result.won === true,
    capturedFraction: result.capturedFraction,
  };
}

function boardPath(boardId: string, context: FlatContext): string {
  const query = new URLSearchParams({ mode: 'leaderboard', board: boardId });
  if (boardId === 'level') query.set('field', context.levelId ?? '');
  query.set('difficulty', context.difficulty ?? '');
  return `${PARTITION_VIEWER_PATH}?${query}`;
}

function describe(boardId: string, context: FlatContext): BoardResolution {
  if (boardId !== 'arcade' && boardId !== 'level') throw new ApiError(404, 'Leaderboard not found.');
  const difficulty = context.difficulty;
  if (!isDifficulty(difficulty)) throw new ApiError(400, 'Difficulty is invalid.');
  if (boardId === 'arcade') {
    return {
      boardId,
      context: { difficulty },
      label: `Arcade · ${difficultyLabel(difficulty)}`,
      path: boardPath('arcade', { difficulty }),
      rankingPolicyVersion: 'arcade-v1',
    };
  }
  const levelId = context.levelId;
  const level = typeof levelId === 'string' ? campaignLevel(levelId) : undefined;
  if (!level || typeof levelId !== 'string') throw new ApiError(400, 'Field identifier is invalid.');
  return {
    boardId,
    context: { difficulty, levelId },
    label: `${level.metadata.title} · ${difficultyLabel(difficulty)}`,
    path: boardPath('level', { difficulty, levelId }),
    rankingPolicyVersion: 'field-v1',
  };
}

function proofSubject(request: VerifySubmissionRequest): RankedChallenge {
  const payload = request.challenge.payload;
  const difficulty = payload.difficulty;
  if (!isDifficulty(difficulty)) throw new ApiError(409, 'Ranked run is no longer valid.');
  return {
    boardId: request.challenge.boardId as RankedChallenge['boardId'],
    difficulty,
    levelId: typeof payload.levelId === 'string' ? payload.levelId : null,
    seed: request.challenge.seed,
  };
}

/**
 * Partition's adapter: authored challenge/seed, replay verification, and the
 * narrow compatibility hook into the legacy `scores` detail table whose
 * projection trigger owns shared entry insertion.
 */
export const partitionAdapter: GameAdapter = {
  gameId: PARTITION_GAME_ID,
  gameTitle: 'Partition',
  gamePath: PARTITION_VIEWER_PATH,
  authorityId: 'partition-authored-v1',
  currentGameVersion: PARTITION_GAME_VERSION,
  boards: BOARDS,
  legacyVotes: true,
  feedback: {
    kinds: {
      game: { ids: [PARTITION_GAME_ID], label: 'Game' },
      level: { ids: createPartitionCampaign(0).map((level) => level.metadata.slug), label: 'Field' },
    },
    channels: ['overall'],
  },

  async activeSeason(env) {
    const season = await activeSeason(env);
    return { id: season.id, gameVersion: season.game_version };
  },

  resolveBoard(boardId, context) {
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
      if (typeof value !== 'string') throw new ApiError(400, 'Board context values must be strings.');
      flat[key] = value;
    }
    return describe(boardId, flat);
  },

  describeBoard(boardId, context) {
    const resolution = describe(boardId, context);
    return { label: resolution.label, path: resolution.path };
  },

  async beginRun(request) {
    const season = await activeSeason(request.env);
    const id = randomId('run');
    const seed = randomSeed();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
    const context = request.board.context;
    const difficulty = context.difficulty;
    if (!isDifficulty(difficulty)) throw new ApiError(400, 'Difficulty is invalid.');
    await request.env.DB.prepare(`
      INSERT INTO run_challenges (
        id, session_id, season_id, game_id, game_version, board_id, difficulty,
        level_id, seed, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      request.sessionId,
      season.id,
      PARTITION_GAME_ID,
      PARTITION_GAME_VERSION,
      request.board.boardId,
      difficulty,
      context.levelId ?? null,
      seed,
      createdAt.toISOString(),
      expiresAt.toISOString(),
    ).run();
    return { id, seed, expiresAt: expiresAt.toISOString() };
  },

  async loadChallenge(request) {
    const row = await challengeForSubmission(
      request.env,
      request.sessionId,
      request.runId,
      request.boardId,
    );
    return {
      id: row.id,
      boardId: row.boardId,
      boardKey: canonicalBoardKey({
        gameId: PARTITION_GAME_ID,
        gameVersion: row.game_version,
        authorityId: partitionAdapter.authorityId,
        rankingPolicyVersion: row.boardId === 'arcade' ? 'arcade-v1' : 'field-v1',
        seasonId: row.season_id,
        boardId: row.boardId,
        context: row.boardId === 'arcade'
          ? { difficulty: row.difficulty }
          : { difficulty: row.difficulty, levelId: row.levelId! },
      }),
      gameVersion: row.game_version,
      seasonId: row.season_id,
      seed: row.seed,
      expiresAt: row.expires_at,
      payload: {
        difficulty: row.difficulty,
        levelId: row.levelId,
        seasonId: row.season_id,
        gameVersion: row.game_version,
        // The board a submission belongs to is whatever the one-time challenge
        // was bound to, never what the client claims at submission time.
        context: row.boardId === 'arcade'
          ? { difficulty: row.difficulty }
          : { difficulty: row.difficulty, levelId: row.levelId },
      },
    };
  },

  consumeChallengeStatement(request) {
    return request.env.DB.prepare(`
      UPDATE run_challenges SET consumed_at = ?, consumed_score_id = ?
      WHERE id = ? AND session_id = ? AND consumed_score_id IS NULL
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND season_id = ? AND game_id = ? AND game_version = ? AND board_id = ?
        AND difficulty = ? AND level_id IS ?
        AND EXISTS (
          SELECT 1 FROM seasons s WHERE s.id = run_challenges.season_id
            AND s.game_id = run_challenges.game_id AND s.game_version = run_challenges.game_version
            AND s.state = 'active'
        )
        AND NOT EXISTS (SELECT 1 FROM leaderboard_boards WHERE board_key = ? AND state <> 'visible')
    `).bind(
      request.at,
      request.entryId,
      request.runId,
      request.sessionId,
      request.board.seasonId,
      request.board.gameId,
      request.board.gameVersion,
      request.board.boardId,
      request.board.context.difficulty,
      request.board.context.levelId ?? null,
      request.board.boardKey,
    );
  },

  insertEntryStatement(request) {
    return partitionEntryStatement(request);
  },

  verifySubmission(request): VerifiedSubmission {
    const verified = verifyRankedScore(
      proofSubject(request),
      request.score,
      request.proof,
    );
    const result = verified.score;
    const components = result.scope === 'arcade'
      ? [-Number(result.stageReached), -Number(result.completed ? 1 : 0), Number(result.elapsedMs), Number(result.partitions)]
      : [
          -Number(result.won ? 1 : 0),
          result.won === true ? 0 : -Number(result.capturedFraction ?? 0),
          Number(result.elapsedMs),
          Number(result.partitions),
        ];
    return {
      result,
      rankComponents: normalizeRankComponents(components),
      proofBytes: canonicalStringify({
        gameId: PARTITION_GAME_ID,
        gameVersion: PARTITION_GAME_VERSION,
        replays: verified.replays,
      }),
    };
  },

  async publishReplay(request) {
    return publishPartitionReplay(request);
  },
};

/**
 * The legacy detail insert. Shared submissions leave `proof_expires_at` NULL
 * because the private replay object owns retention and the legacy five-day
 * cleanup must never delete a retained Top 50 archive; the legacy route passes
 * its own five-day deadline. The `scores` projection trigger then owns shared
 * entry insertion.
 *
 * Bind order: score id, player name, normalized name, level id, level number,
 * level title, won, stage reached, stages cleared, completed, elapsed ms,
 * partitions, captured fraction, proof key, proof hash, moderation key,
 * created at, run id, score id.
 */
function partitionEntryStatement(request: InsertEntryRequest): D1PreparedStatement {
  const result = JSON.parse(request.resultJson) as Record<string, number | string | boolean>;
  const levelScope = result.scope === 'level';
  return request.env.DB.prepare(`
    INSERT INTO scores (
      id, run_id, season_id, game_id, game_version, board_id, player_name,
      normalized_name, difficulty, level_id, level_number, level_title, won,
      stage_reached, stages_cleared, completed, elapsed_ms, partitions,
      captured_fraction, proof_object_key, proof_sha256, proof_expires_at,
      moderation_key, created_at
    )
    SELECT ?, id, season_id, game_id, game_version, board_id, ?, ?, difficulty,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    FROM run_challenges WHERE id = ? AND consumed_score_id = ?
  `).bind(
    request.id,
    request.playerName,
    request.normalizedName,
    levelScope ? result.levelId : null,
    levelScope ? result.levelNumber : null,
    levelScope ? result.levelTitle : null,
    levelScope ? (result.won === true ? 1 : 0) : null,
    levelScope ? null : result.stageReached,
    levelScope ? null : result.stagesCleared,
    levelScope ? (result.won === true ? 1 : 0) : (result.completed === true ? 1 : 0),
    result.elapsedMs,
    result.partitions,
    levelScope ? result.capturedFraction : null,
    request.replayObjectKey,
    request.replaySha256,
    request.replayExpiresAt ?? null,
    request.moderationKey,
    request.createdAt,
    request.runId,
    request.id,
  );
}

async function publishPartitionReplay(request: PublishReplayRequest): Promise<Response> {
  const { env, body } = request;
  await enforceRateLimit(env, request.sessionId, 'publish_replay', 6, true);
  if (body.gameVersion !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Replay generation is unsupported.');
  const expiresInDays = body.expiresInDays === undefined ? 5 : Number(body.expiresInDays);
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 5) {
    throw new ApiError(400, 'Replay retention must be between one and five days.');
  }
  const verified = verifyPartitionReplay(body.replay);
  const bytes = canonicalStringify(verified.replay);
  const sha = await sha256Hex(bytes);
  const now = new Date();
  const existing = await env.DB.prepare(`
    SELECT id, object_key, sha256, expires_at FROM replay_shares
    WHERE session_id = ? AND sha256 = ? AND expires_at > ?
    ORDER BY expires_at DESC LIMIT 1
  `).bind(request.sessionId, sha, now.toISOString()).first<ReplayShareRow>();
  if (existing) return replayPublishedResponse(existing, request.origin);

  const id = randomId('replay');
  const objectKey = `shares/${PARTITION_GAME_ID}/${PARTITION_GAME_VERSION}/${id}.json`;
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  await env.REPLAYS.put(objectKey, bytes, {
    httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=300' },
    customMetadata: { sha256: sha, kind: 'public-replay', expiresAt: expiresAt.toISOString() },
  });
  await env.DB.prepare(`
    INSERT INTO replay_shares
      (id, session_id, game_id, game_version, object_key, sha256, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    request.sessionId,
    PARTITION_GAME_ID,
    PARTITION_GAME_VERSION,
    objectKey,
    sha,
    now.toISOString(),
    expiresAt.toISOString(),
  ).run();
  return replayPublishedResponse(
    { id, object_key: objectKey, sha256: sha, expires_at: expiresAt.toISOString() },
    request.origin,
    201,
  );
}

function replayPublishedResponse(row: ReplayShareRow, origin: string, status = 200): Response {
  return json({
    id: row.id,
    url: `${origin}/r/${row.id}`,
    replayUrl: `${origin}/api/v1/games/${PARTITION_GAME_ID}/replays/${row.id}`,
    expiresAt: row.expires_at,
  }, status, { 'cache-control': 'no-store' });
}

export { MAX_REPLAY_BYTES, PARTITION_VIEWER_PATH, activeSeason };

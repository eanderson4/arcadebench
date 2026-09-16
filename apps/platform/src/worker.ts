import {
  PARTITION_GAME_ID,
  PARTITION_GAME_VERSION,
  type DifficultyId,
} from '@arcadebench/partition/verifier';
import { canonicalStringify, randomId, sha256Hex } from './crypto';
import type { ArcadeBenchEnv } from './env';
import { ApiError, assertSameOrigin, json, readJson, requiredObject, requiredString } from './http';
import { moderateCallsign } from './moderation';
import {
  MAX_REPLAY_BYTES,
  PARTITION_VIEWER_PATH,
  challengeForSubmission,
  legacyScoreEntry,
  parseRunContext,
  partitionAdapter,
} from './partition-adapter';
import { verifyRankedScore } from './partition-verifier';
import {
  cleanupExpiredFeedbackNotes,
  feedbackChannel,
  feedbackSubject,
  feedbackSummary,
  setFeedback,
} from './shared/feedback';
import {
  boardFromRunContext,
  listBoardEntries,
  leaderboardLimit,
  resolveBoardFromQuery,
} from './shared/leaderboards';
import { cleanupSharedReplayObjects } from './shared/replays';
import { FEEDBACK_DEFAULT_CHANNEL } from './shared/types';
import { handleV2Api } from './v2-api';
import { anonymousSession, attachSessionCookie, enforceRateLimit, type AnonymousSession } from './session';
import {
  MALTLINE_API_PREFIX,
  cleanupExpiredMaltlineProofs,
  handleMaltlineApi,
  reconcileMaltlineProofs,
} from './maltline-worker';

const CANONICAL_HOST = 'arcadebench.org';
// Root Partition links were shared with these query keys before the cross-game
// launcher took over `/`. They still resolve to the permanent game route.
const PARTITION_QUERY_KEYS = [
  'mode', 'seed', 'tier', 'level', 'difficulty', 'autostart',
  'board', 'field', 'replay', 'tick', 'autoplay',
] as const;
const API_PREFIX = `/api/v1/games/${PARTITION_GAME_ID}`;
const MAX_SCORE_BYTES = 8 * 1024 * 1024;
const REPLAY_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;

interface ScoreRow {
  id: string;
  board_id: 'arcade' | 'level';
  player_name: string;
  difficulty: DifficultyId;
  level_id: string | null;
  level_number: number | null;
  level_title: string | null;
  won: number | null;
  stage_reached: number | null;
  stages_cleared: number | null;
  completed: number;
  elapsed_ms: number;
  partitions: number;
  captured_fraction: number | null;
  created_at: string;
}

interface ReplayShareRow {
  id: string;
  object_key: string;
  sha256: string;
  expires_at: string;
}

interface ExpiredReplayRow {
  id: string;
  object_key: string;
}

function decodeSegment(value: string): string {
  try { return decodeURIComponent(value); } catch { throw new ApiError(400, 'URL is invalid.'); }
}

function methodNotAllowed(allowed: string): never {
  throw new ApiError(405, `Use ${allowed} for this endpoint.`);
}

function scoreEntry(row: ScoreRow): Record<string, unknown> {
  const base = {
    id: row.id,
    name: row.player_name,
    difficulty: row.difficulty,
    elapsedMs: row.elapsed_ms,
    partitions: row.partitions,
    createdAt: row.created_at,
  };
  if (row.board_id === 'arcade') {
    return {
      ...base,
      scope: 'arcade',
      stageReached: row.stage_reached,
      stagesCleared: row.stages_cleared,
      completed: row.completed === 1,
    };
  }
  return {
    ...base,
    scope: 'level',
    levelId: row.level_id,
    levelNumber: row.level_number,
    levelTitle: row.level_title,
    won: row.won === 1,
    capturedFraction: row.captured_fraction,
  };
}

async function beginRun(request: Request, env: ArcadeBenchEnv, session: AnonymousSession): Promise<Response> {
  await enforceRateLimit(env, session.id, 'begin_run', 12);
  const body = requiredObject(await readJson(request, 32 * 1024), 'Run request');
  if (body.gameVersion !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Game version is no longer ranked.');
  const boardId = requiredString(body.boardId, 'Leaderboard', 32);
  parseRunContext(boardId, body);
  const board = await boardFromRunContext(env, partitionAdapter, boardId, body.context ?? {});
  const challenge = await partitionAdapter.beginRun({ env, sessionId: session.id, board });
  return json({
    id: challenge.id,
    seed: challenge.seed,
    gameVersion: PARTITION_GAME_VERSION,
    expiresAt: challenge.expiresAt,
  }, 201, { 'cache-control': 'no-store' });
}

/**
 * Legacy listings read the shared authoritative table, never a per-game query:
 * one ordering backs both the v1 compatibility routes and the v2 client.
 */
async function listScores(request: Request, env: ArcadeBenchEnv, boardId: string): Promise<Response> {
  const url = new URL(request.url);
  const board = await resolveBoardFromQuery(env, partitionAdapter, boardId, url);
  const page = await listBoardEntries(env, partitionAdapter, board, {
    limit: leaderboardLimit(url.searchParams.get('limit')),
    cursor: url.searchParams.get('cursor'),
  });
  return json({
    entries: page.entries.map(legacyScoreEntry),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  }, 200, { 'cache-control': 'public, max-age=15, stale-while-revalidate=30' });
}

async function submitScore(
  request: Request,
  env: ArcadeBenchEnv,
  session: AnonymousSession,
  boardId: string,
): Promise<Response> {
  if (boardId !== 'arcade' && boardId !== 'level') throw new ApiError(404, 'Leaderboard not found.');
  await enforceRateLimit(env, session.id, 'submit_score', 6, true);
  const body = requiredObject(await readJson(request, MAX_SCORE_BYTES), 'Score submission');
  if (body.gameVersion !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Game version is no longer ranked.');
  const runId = requiredString(body.runId, 'Ranked run', 64);
  const challenge = await challengeForSubmission(env, session.id, runId, boardId);
  const verified = verifyRankedScore(challenge, body.score, body.proof);
  const review = await moderateCallsign(body.playerName, env);
  if (!review.allowed || !review.normalizedName || !review.moderationKey) {
    throw new ApiError(400, review.reason ?? 'Choose a public-friendly callsign.');
  }
  const proofBytes = canonicalStringify({
    gameId: PARTITION_GAME_ID,
    gameVersion: PARTITION_GAME_VERSION,
    replays: verified.replays,
  });
  const proofSha = await sha256Hex(proofBytes);
  const scoreId = randomId('score');
  const proofExpiresAt = new Date(Date.now() + REPLAY_RETENTION_MS).toISOString();
  const objectKey = `proofs/${PARTITION_GAME_ID}/${PARTITION_GAME_VERSION}/${scoreId}.json`;
  await env.REPLAYS.put(objectKey, proofBytes, {
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    customMetadata: {
      sha256: proofSha,
      kind: 'leaderboard-proof',
      expiresAt: proofExpiresAt,
    },
  });

  const score = verified.score;
  const createdAt = new Date().toISOString();
  const completed = score.scope === 'arcade' ? Boolean(score.completed) : Boolean(score.won);
  // This legacy route keeps its own five-day proof retention and writes no
  // publication or event, so earlier submissions keep their earlier policy.
  // The `scores` projection trigger still owns shared entry insertion, which
  // keeps one ranking authority for legacy-era and new writes alike.
  const statements = await env.DB.batch([
    env.DB.prepare(`
      UPDATE run_challenges SET consumed_at = ?, consumed_score_id = ?
      WHERE id = ? AND session_id = ? AND consumed_score_id IS NULL AND expires_at > ?
    `).bind(createdAt, scoreId, runId, session.id, createdAt),
    env.DB.prepare(`
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
      scoreId,
      review.normalizedName,
      review.normalizedName.toLocaleLowerCase(),
      score.scope === 'level' ? score.levelId : null,
      score.scope === 'level' ? score.levelNumber : null,
      score.scope === 'level' ? score.levelTitle : null,
      score.scope === 'level' ? (score.won ? 1 : 0) : null,
      score.scope === 'arcade' ? score.stageReached : null,
      score.scope === 'arcade' ? score.stagesCleared : null,
      completed ? 1 : 0,
      score.elapsedMs,
      score.partitions,
      score.scope === 'level' ? score.capturedFraction : null,
      objectKey,
      proofSha,
      proofExpiresAt,
      review.moderationKey,
      createdAt,
      runId,
      scoreId,
    ),
  ]);
  // The challenge statement is the reliable conflict signal: D1 counts the
  // rows that the shared-entry projection trigger writes on the detail insert,
  // and that insert is itself guarded on the consumed challenge.
  if ((statements[0]!.meta.changes ?? 0) !== 1) {
    throw new ApiError(409, 'This ranked run was already submitted or expired.');
  }
  const row: ScoreRow = {
    id: scoreId,
    board_id: boardId,
    player_name: review.normalizedName,
    difficulty: challenge.difficulty,
    level_id: score.scope === 'level' ? String(score.levelId) : null,
    level_number: score.scope === 'level' ? Number(score.levelNumber) : null,
    level_title: score.scope === 'level' ? String(score.levelTitle) : null,
    won: score.scope === 'level' ? (score.won ? 1 : 0) : null,
    stage_reached: score.scope === 'arcade' ? Number(score.stageReached) : null,
    stages_cleared: score.scope === 'arcade' ? Number(score.stagesCleared) : null,
    completed: completed ? 1 : 0,
    elapsed_ms: Number(score.elapsedMs),
    partitions: Number(score.partitions),
    captured_fraction: score.scope === 'level' ? Number(score.capturedFraction) : null,
    created_at: createdAt,
  };
  return json({ entry: scoreEntry(row) }, 201, { 'cache-control': 'no-store' });
}

export async function cleanupExpiredReplayData(
  env: Pick<ArcadeBenchEnv, 'DB' | 'REPLAYS'>,
  now = new Date(),
): Promise<{ shares: number; proofs: number }> {
  const nowIso = now.toISOString();
  const [shareResult, proofResult] = await Promise.all([
    env.DB.prepare(`
      SELECT id, object_key FROM replay_shares
      WHERE expires_at <= ? ORDER BY expires_at LIMIT 500
    `).bind(nowIso).all<ExpiredReplayRow>(),
    env.DB.prepare(`
      SELECT id, proof_object_key AS object_key FROM scores
      WHERE proof_expires_at <= ? AND proof_deleted_at IS NULL
      ORDER BY proof_expires_at LIMIT 500
    `).bind(nowIso).all<ExpiredReplayRow>(),
  ]);
  const shares = shareResult.results ?? [];
  const proofs = proofResult.results ?? [];
  const objectKeys = [...new Set([...shares, ...proofs].map((row) => row.object_key))];
  if (objectKeys.length > 0) await env.REPLAYS.delete(objectKeys);

  const statements: D1PreparedStatement[] = [];
  if (shares.length > 0) {
    const placeholders = shares.map(() => '?').join(', ');
    statements.push(env.DB.prepare(`DELETE FROM replay_shares WHERE id IN (${placeholders})`)
      .bind(...shares.map((row) => row.id)));
  }
  if (proofs.length > 0) {
    const placeholders = proofs.map(() => '?').join(', ');
    statements.push(env.DB.prepare(`
      UPDATE scores SET proof_deleted_at = ?
      WHERE proof_deleted_at IS NULL AND id IN (${placeholders})
    `).bind(nowIso, ...proofs.map((row) => row.id)));
  }
  if (statements.length > 0) await env.DB.batch(statements);
  return { shares: shares.length, proofs: proofs.length };
}

function validReplayId(value: string): boolean {
  return /^replay_[A-Za-z0-9_-]{16}$/u.test(value);
}

async function replayRow(env: ArcadeBenchEnv, id: string): Promise<ReplayShareRow> {
  if (!validReplayId(id)) throw new ApiError(404, 'Replay not found.');
  const row = await env.DB.prepare(`
    SELECT id, object_key, sha256, expires_at FROM replay_shares WHERE id = ?
  `).bind(id).first<ReplayShareRow>();
  if (!row) throw new ApiError(404, 'Replay not found.');
  if (Date.parse(row.expires_at) <= Date.now()) throw new ApiError(410, 'This replay share has expired.');
  return row;
}

async function loadReplay(request: Request, env: ArcadeBenchEnv, id: string): Promise<Response> {
  const row = await replayRow(env, id);
  const object = await env.REPLAYS.get(row.object_key);
  if (!object || !('body' in object)) throw new ApiError(410, 'This replay share has expired.');
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300',
    etag: object.httpEtag,
    'x-content-type-options': 'nosniff',
    'x-replay-expires': row.expires_at,
  });
  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(object.body, { headers });
}

/**
 * Legacy votes now run through the shared feedback service on the default
 * channel, so an old vote request and a new feedback vote are one authoritative
 * value rather than diverging copies. The legacy envelope stays exactly the
 * public aggregate, never the private note.
 */
async function handleVote(
  request: Request,
  env: ArcadeBenchEnv,
  session: AnonymousSession,
  kind: string,
  id: string,
): Promise<Response> {
  const subject = feedbackSubject(partitionAdapter, kind, id);
  const channel = feedbackChannel(partitionAdapter, FEEDBACK_DEFAULT_CHANNEL);
  const respond = async (summary: Awaited<ReturnType<typeof feedbackSummary>>): Promise<Response> =>
    json({
      up: summary.up,
      down: summary.down,
      score: summary.score,
      viewerVote: summary.viewerVote,
    }, 200, { 'cache-control': 'no-store' });

  if (request.method === 'GET') {
    return respond(await feedbackSummary(env, partitionAdapter, session.id, subject, channel));
  }
  if (request.method !== 'PUT') methodNotAllowed('GET or PUT');
  await enforceRateLimit(env, session.id, 'feedback', 60);
  const body = requiredObject(await readJson(request, 16 * 1024), 'Vote');
  if (body.gameVersion !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Game version is no longer current.');
  if (body.value !== -1 && body.value !== 0 && body.value !== 1) throw new ApiError(400, 'Vote must be up, down, or cleared.');
  return respond(await setFeedback(
    env,
    partitionAdapter,
    session.id,
    subject,
    channel,
    body.value,
    undefined,
  ));
}

async function handleApi(request: Request, env: ArcadeBenchEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === MALTLINE_API_PREFIX || path.startsWith(`${MALTLINE_API_PREFIX}/`)) {
    return handleMaltlineApi(request, env);
  }
  const replayMatch = path.match(new RegExp(`^${API_PREFIX}/replays/([^/]+)$`, 'u'));
  if (replayMatch && (request.method === 'GET' || request.method === 'HEAD')) {
    return loadReplay(request, env, decodeSegment(replayMatch[1]!));
  }
  const leaderboardMatch = path.match(new RegExp(`^${API_PREFIX}/leaderboards/([^/]+)$`, 'u'));
  if (leaderboardMatch && request.method === 'GET') {
    return listScores(request, env, decodeSegment(leaderboardMatch[1]!));
  }

  assertSameOrigin(request);
  const session = await anonymousSession(request, env);
  let response: Response;
  if (path === `${API_PREFIX}/runs`) {
    if (request.method !== 'POST') methodNotAllowed('POST');
    response = await beginRun(request, env, session);
  } else if (leaderboardMatch) {
    if (request.method !== 'POST') methodNotAllowed('GET or POST');
    response = await submitScore(request, env, session, decodeSegment(leaderboardMatch[1]!));
  } else if (path === `${API_PREFIX}/replays`) {
    if (request.method !== 'POST') methodNotAllowed('POST');
    const body = requiredObject(await readJson(request, MAX_REPLAY_BYTES), 'Replay publication');
    response = await partitionAdapter.publishReplay!({
      env,
      sessionId: session.id,
      body,
      origin: url.origin,
    });
  } else {
    const voteMatch = path.match(new RegExp(`^${API_PREFIX}/votes/(game|level)/([^/]+)$`, 'u'));
    if (!voteMatch) throw new ApiError(404, 'Arcade API endpoint not found.');
    response = await handleVote(request, env, session, voteMatch[1]!, decodeSegment(voteMatch[2]!));
  }
  return attachSessionCookie(response, session);
}

async function handleRequest(request: Request, env: ArcadeBenchEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 308);
  }
  if (url.pathname === '/api/v1/health') {
    return json({ status: 'ok', gameVersion: PARTITION_GAME_VERSION }, 200, { 'cache-control': 'no-store' });
  }
  if (url.pathname.startsWith('/api/v2/') || url.pathname === '/api/v2') {
    return handleV2Api(request, env);
  }
  if (url.pathname.startsWith('/api/v1/')) return handleApi(request, env);
  if (url.pathname === '/'
    && (request.method === 'GET' || request.method === 'HEAD')
    && PARTITION_QUERY_KEYS.some((key) => url.searchParams.has(key))) {
    const viewer = new URL(PARTITION_VIEWER_PATH, url.origin);
    viewer.search = url.search;
    return new Response(null, {
      status: 302,
      headers: { location: viewer.toString(), 'cache-control': 'no-store' },
    });
  }
  const replayViewerMatch = url.pathname.match(/^\/r\/([^/]+)$/u);
  if (replayViewerMatch) {
    const id = decodeSegment(replayViewerMatch[1]!);
    await replayRow(env, id);
    const viewer = new URL(PARTITION_VIEWER_PATH, url.origin);
    viewer.searchParams.set('mode', 'replay');
    viewer.searchParams.set('replay', `${API_PREFIX}/replays/${id}`);
    return Response.redirect(viewer.toString(), 302);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: ArcadeBenchEnv): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.code === undefined
          ? { error: error.message }
          : { error: error.message, code: error.code };
        const headers = new Headers(error.headers);
        headers.set('cache-control', 'no-store');
        const response = json(body, error.status, headers);
        return request.method === 'HEAD' ? new Response(null, response) : response;
      }
      console.error('Unhandled ArcadeBench platform error', error instanceof Error ? error.message : 'unknown');
      const response = json(
        { error: 'Arcade services hit an unexpected error.' },
        500,
        { 'cache-control': 'no-store' },
      );
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
  },

  async scheduled(_controller: ScheduledController, env: ArcadeBenchEnv): Promise<void> {
    await runScheduledMaintenance(env);
  },
};

/**
 * Retention is independent of HTTP write activation. A production entry may
 * disable the old Maltline schema while the shared platform (including future
 * Maltline adapters) still receives its mandatory replay/note cleanup.
 */
export async function runScheduledMaintenance(
  env: ArcadeBenchEnv,
  { legacyMaltlineEnabled = true }: { legacyMaltlineEnabled?: boolean } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const staleRateWindow = Date.now() - 24 * 60 * 60 * 1000;
  const failures: string[] = [];
  const maintenance = async (name: string, task: () => Promise<unknown>): Promise<void> => {
    try {
      await task();
    } catch (error) {
      failures.push(name);
      console.error(
        `ArcadeBench scheduled maintenance failed: ${name}`,
        error instanceof Error ? error.message : 'unknown',
      );
    }
  };
  if (legacyMaltlineEnabled) {
    await maintenance('maltline-reconciliation', () => reconcileMaltlineProofs(env, new Date(now)));
    await maintenance('maltline-retention', () => cleanupExpiredMaltlineProofs(env, new Date(now)));
  }
  await maintenance('partition-retention', () => cleanupExpiredReplayData(env, new Date(now)));
  await maintenance('shared-replay-retention', () => cleanupSharedReplayObjects(env, new Date(now)));
  await maintenance('feedback-note-retention', () => cleanupExpiredFeedbackNotes(env, new Date(now)));
  await maintenance('database-expiry', () => env.DB.batch([
    env.DB.prepare('DELETE FROM rate_windows WHERE window_start < ?').bind(staleRateWindow),
    env.DB.prepare(`
      DELETE FROM run_challenges WHERE expires_at <= ? AND consumed_score_id IS NULL
    `).bind(now),
    env.DB.prepare(`
      DELETE FROM shared_run_challenges WHERE expires_at <= ? AND consumed_entry_id IS NULL
    `).bind(now),
    ...(legacyMaltlineEnabled ? [env.DB.prepare(`
      DELETE FROM maltline_run_challenges WHERE expires_at <= ? AND consumed_score_id IS NULL
    `).bind(now)] : []),
  ]));
  if (failures.length > 0) throw new Error(`Scheduled maintenance failed: ${failures.join(', ')}`);
}

import {
  PARTITION_GAME_ID,
  PARTITION_GAME_VERSION,
  createPartitionCampaign,
  type DifficultyId,
} from '@arcadebench/partition';
import { canonicalStringify, randomId, randomSeed, sha256Hex } from './crypto';
import type { ArcadeBenchEnv } from './env';
import { ApiError, assertSameOrigin, json, readJson, requiredObject, requiredString } from './http';
import { moderateCallsign } from './moderation';
import { isDifficulty, verifyPartitionReplay, verifyRankedScore, type RankedChallenge } from './partition-verifier';
import { anonymousSession, attachSessionCookie, enforceRateLimit, type AnonymousSession } from './session';

const CANONICAL_HOST = 'arcadebench.org';
const API_PREFIX = `/api/v1/games/${PARTITION_GAME_ID}`;
const MAX_SCORE_BYTES = 8 * 1024 * 1024;
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const REPLAY_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;

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

function parseRunContext(boardId: string, body: Record<string, unknown>): {
  boardId: 'arcade' | 'level';
  difficulty: DifficultyId;
  levelId: string | null;
} {
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
  if (!createPartitionCampaign(0).some((level) => level.metadata.slug === levelId)) {
    throw new ApiError(400, 'Field identifier is invalid.');
  }
  return { boardId, difficulty, levelId };
}

async function beginRun(request: Request, env: ArcadeBenchEnv, session: AnonymousSession): Promise<Response> {
  await enforceRateLimit(env, session.id, 'begin_run', 12);
  const body = requiredObject(await readJson(request, 32 * 1024), 'Run request');
  if (body.gameVersion !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Game version is no longer ranked.');
  const context = parseRunContext(requiredString(body.boardId, 'Leaderboard', 32), body);
  const season = await activeSeason(env);
  const id = randomId('run');
  const seed = randomSeed();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
  await env.DB.prepare(`
    INSERT INTO run_challenges (
      id, session_id, season_id, game_id, game_version, board_id, difficulty,
      level_id, seed, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    session.id,
    season.id,
    PARTITION_GAME_ID,
    PARTITION_GAME_VERSION,
    context.boardId,
    context.difficulty,
    context.levelId,
    seed,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  ).run();
  return json({ id, seed, gameVersion: PARTITION_GAME_VERSION, expiresAt: expiresAt.toISOString() }, 201, {
    'cache-control': 'no-store',
  });
}

function cursorOffset(value: string | null): number {
  if (!value) return 0;
  try {
    const decoded = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    if (!/^offset:\d+$/u.test(decoded)) throw new Error('bad cursor');
    const offset = Number(decoded.slice(7));
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) throw new Error('bad cursor');
    return offset;
  } catch {
    throw new ApiError(400, 'Leaderboard cursor is invalid.');
  }
}

function encodeCursor(offset: number): string {
  return btoa(`offset:${offset}`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function listScores(request: Request, env: ArcadeBenchEnv, boardId: string): Promise<Response> {
  if (boardId !== 'arcade' && boardId !== 'level') throw new ApiError(404, 'Leaderboard not found.');
  const url = new URL(request.url);
  const difficulty = url.searchParams.get('filter.difficulty');
  if (!isDifficulty(difficulty)) throw new ApiError(400, 'Difficulty filter is required.');
  const limitValue = Number(url.searchParams.get('limit') ?? 25);
  const limit = Number.isInteger(limitValue) ? Math.max(1, Math.min(50, limitValue)) : 25;
  const offset = cursorOffset(url.searchParams.get('cursor'));
  const season = await activeSeason(env);
  let statement: D1PreparedStatement;
  if (boardId === 'arcade') {
    statement = env.DB.prepare(`
      SELECT * FROM scores
      WHERE game_id = ? AND game_version = ? AND season_id = ?
        AND board_id = 'arcade' AND difficulty = ?
      ORDER BY stage_reached DESC, completed DESC, elapsed_ms ASC,
        partitions ASC, created_at ASC, id ASC
      LIMIT ? OFFSET ?
    `).bind(PARTITION_GAME_ID, PARTITION_GAME_VERSION, season.id, difficulty, limit + 1, offset);
  } else {
    const levelId = url.searchParams.get('filter.levelId');
    if (!levelId || !createPartitionCampaign(0).some((level) => level.metadata.slug === levelId)) {
      throw new ApiError(400, 'Field filter is invalid.');
    }
    statement = env.DB.prepare(`
      SELECT * FROM scores
      WHERE game_id = ? AND game_version = ? AND season_id = ?
        AND board_id = 'level' AND difficulty = ? AND level_id = ?
      ORDER BY won DESC,
        CASE WHEN won = 0 THEN captured_fraction END DESC,
        elapsed_ms ASC, partitions ASC, created_at ASC, id ASC
      LIMIT ? OFFSET ?
    `).bind(PARTITION_GAME_ID, PARTITION_GAME_VERSION, season.id, difficulty, levelId, limit + 1, offset);
  }
  const result = await statement.all<ScoreRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  return json({
    entries: rows.slice(0, limit).map(scoreEntry),
    ...(hasMore ? { nextCursor: encodeCursor(offset + limit) } : {}),
  }, 200, { 'cache-control': 'public, max-age=15, stale-while-revalidate=30' });
}

async function challengeForSubmission(
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
  if ((statements[0].meta.changes ?? 0) !== 1 || (statements[1].meta.changes ?? 0) !== 1) {
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

async function publishReplay(request: Request, env: ArcadeBenchEnv, session: AnonymousSession): Promise<Response> {
  await enforceRateLimit(env, session.id, 'publish_replay', 6, true);
  const body = requiredObject(await readJson(request, MAX_REPLAY_BYTES), 'Replay publication');
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
  `).bind(session.id, sha, now.toISOString()).first<ReplayShareRow>();
  if (existing) return replayPublishedResponse(existing, new URL(request.url).origin);

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
    session.id,
    PARTITION_GAME_ID,
    PARTITION_GAME_VERSION,
    objectKey,
    sha,
    now.toISOString(),
    expiresAt.toISOString(),
  ).run();
  return replayPublishedResponse({ id, object_key: objectKey, sha256: sha, expires_at: expiresAt.toISOString() }, new URL(request.url).origin, 201);
}

function replayPublishedResponse(row: ReplayShareRow, origin: string, status = 200): Response {
  return json({
    id: row.id,
    url: `${origin}/r/${row.id}`,
    replayUrl: `${origin}${API_PREFIX}/replays/${row.id}`,
    expiresAt: row.expires_at,
  }, status, { 'cache-control': 'no-store' });
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

function validSubject(kind: string, id: string): void {
  if (kind === 'game' && id === PARTITION_GAME_ID) return;
  if (kind === 'level' && createPartitionCampaign(0).some((level) => level.metadata.slug === id)) return;
  throw new ApiError(404, 'Vote subject not found.');
}

async function voteSummary(
  env: ArcadeBenchEnv,
  sessionId: string,
  kind: string,
  id: string,
): Promise<Record<string, number>> {
  const [summary, viewer] = await env.DB.batch([
    env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS up,
        COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS down
      FROM votes WHERE game_id = ? AND subject_kind = ? AND subject_id = ?
    `).bind(PARTITION_GAME_ID, kind, id),
    env.DB.prepare(`
      SELECT value FROM votes
      WHERE session_id = ? AND game_id = ? AND subject_kind = ? AND subject_id = ?
    `).bind(sessionId, PARTITION_GAME_ID, kind, id),
  ]);
  const totals = (summary.results[0] ?? { up: 0, down: 0 }) as { up: number; down: number };
  const viewerVote = Number((viewer.results[0] as { value?: number } | undefined)?.value ?? 0);
  return { up: Number(totals.up), down: Number(totals.down), score: Number(totals.up) - Number(totals.down), viewerVote };
}

async function handleVote(
  request: Request,
  env: ArcadeBenchEnv,
  session: AnonymousSession,
  kind: string,
  id: string,
): Promise<Response> {
  validSubject(kind, id);
  if (request.method === 'GET') return json(await voteSummary(env, session.id, kind, id), 200, { 'cache-control': 'no-store' });
  if (request.method !== 'PUT') methodNotAllowed('GET or PUT');
  await enforceRateLimit(env, session.id, 'vote', 60);
  const body = requiredObject(await readJson(request, 16 * 1024), 'Vote');
  if (body.gameVersion !== PARTITION_GAME_VERSION) throw new ApiError(409, 'Game version is no longer current.');
  if (body.value !== -1 && body.value !== 0 && body.value !== 1) throw new ApiError(400, 'Vote must be up, down, or cleared.');
  const now = new Date().toISOString();
  if (body.value === 0) {
    await env.DB.prepare(`
      DELETE FROM votes WHERE session_id = ? AND game_id = ? AND subject_kind = ? AND subject_id = ?
    `).bind(session.id, PARTITION_GAME_ID, kind, id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO votes
        (session_id, game_id, subject_kind, subject_id, value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (session_id, game_id, subject_kind, subject_id)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(session.id, PARTITION_GAME_ID, kind, id, body.value, now, now).run();
  }
  return json(await voteSummary(env, session.id, kind, id), 200, { 'cache-control': 'no-store' });
}

async function handleApi(request: Request, env: ArcadeBenchEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
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
    response = await publishReplay(request, env, session);
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
  if (url.pathname.startsWith('/api/v1/')) return handleApi(request, env);
  const replayViewerMatch = url.pathname.match(/^\/r\/([^/]+)$/u);
  if (replayViewerMatch) {
    const id = decodeSegment(replayViewerMatch[1]!);
    await replayRow(env, id);
    const viewer = new URL('/', url.origin);
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
      if (error instanceof ApiError) return json({ error: error.message }, error.status, { 'cache-control': 'no-store' });
      console.error('Unhandled ArcadeBench platform error', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'Arcade services hit an unexpected error.' }, 500, { 'cache-control': 'no-store' });
    }
  },

  async scheduled(_controller: ScheduledController, env: ArcadeBenchEnv): Promise<void> {
    const now = new Date().toISOString();
    const staleRateWindow = Date.now() - 24 * 60 * 60 * 1000;
    await cleanupExpiredReplayData(env, new Date(now));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rate_windows WHERE window_start < ?').bind(staleRateWindow),
      env.DB.prepare(`
        DELETE FROM run_challenges
        WHERE expires_at <= ? AND consumed_score_id IS NULL
      `).bind(now),
    ]);
  },
};

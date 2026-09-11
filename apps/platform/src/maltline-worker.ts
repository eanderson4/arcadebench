import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MaltlineProofError,
  verifyAndHashMaltlineProof,
  type HashedMaltlineProof,
  type MaltlineServerChallenge,
} from '@arcadebench/maltline/verifier';
import { randomId, randomSeed, sha256Hex } from './crypto';
import type { ArcadeBenchEnv } from './env';
import { ApiError, assertSameOrigin, json, readJson, requiredObject, requiredString } from './http';
import {
  MALTLINE_GENERATION_2_STORAGE_CONTEXT,
  MALTLINE_LEADERBOARD_ORDER_BY,
  maltlineGeneration2ProofObjectKey,
  maltlineLeaderboardEntryFromRow,
  type MaltlineLeaderboardRow,
} from './maltline-leaderboard';
import { admitMaltlineExpensiveRequest } from './maltline-admission';
import { moderateCallsign } from './moderation';
import { anonymousSession, attachSessionCookie, enforceRateLimit, type AnonymousSession } from './session';

export const MALTLINE_API_PREFIX = '/api/v1/games/maltline' as const;
export const MAX_MALTLINE_SCORE_BYTES = 1_600_000;
export const MALTLINE_ERROR_CODES = Object.freeze({
  callsignRejected: 'maltline_callsign_rejected',
  proofInvalid: 'maltline_proof_invalid',
} as const);

const CHALLENGE_LIFETIME_MS = 2 * 60 * 60 * 1_000;
const PROOF_RETENTION_MS = 5 * 24 * 60 * 60 * 1_000;
const RECONCILIATION_GRACE_MS = 5 * 60 * 1_000;
const MAX_RETAINED_ENVELOPE_BYTES = 75_000;

interface SeasonRow {
  id: string;
  game_version: string;
}

interface MaltlineChallengeRow {
  id: string;
  session_id: string;
  season_id: string;
  game_id: string;
  game_version: string;
  board_id: string;
  authority_schema_version: number;
  ruleset_version: number;
  campaign_generation: number;
  configuration_sha256: string;
  proof_schema_version: number;
  envelope_version: number;
  nonce: number;
  expires_at: string;
  consumed_score_id: string | null;
}

interface StoredMaltlineScoreRow extends MaltlineLeaderboardRow {
  run_id: string;
  normalized_name: string;
  moderation_key: string;
  proof_object_key: string;
  proof_sha256: string;
  proof_state: 'pending' | 'ready' | 'failed';
  proof_state_updated_at: string;
  proof_expires_at: string;
  proof_deleted_at: string | null;
}

interface PendingProofRow {
  id: string;
  proof_object_key: string;
  proof_sha256: string;
  proof_state_updated_at: string;
}

interface RetainedProofRow {
  proof_object_key: string;
  proof_sha256: string;
  proof_state: 'pending' | 'ready' | 'failed';
  proof_expires_at: string;
  proof_deleted_at: string | null;
}

interface ListedMaltlineScoreRow extends MaltlineLeaderboardRow {
  proof_available: number;
}

function methodNotAllowed(allowed: string): never {
  throw new ApiError(405, `Use ${allowed} for this endpoint.`);
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ApiError(400, `${label} contains unsupported or missing fields.`);
  }
}

async function activeMaltlineSeason(env: ArcadeBenchEnv): Promise<SeasonRow> {
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  const season = await env.DB.prepare(`
    SELECT id, game_version FROM seasons
    WHERE game_id = ? AND state = 'active'
  `).bind(context.gameId).first<SeasonRow>();
  if (!season || season.id !== context.seasonId || season.game_version !== context.gameVersion) {
    throw new ApiError(503, 'Maltline ranked play is between seasons. Try again shortly.');
  }
  return season;
}

function currentChallengeIdentity(row: MaltlineChallengeRow): MaltlineServerChallenge {
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  if (row.season_id !== context.seasonId
    || row.game_id !== context.gameId
    || row.game_version !== context.gameVersion
    || row.board_id !== context.boardId
    || row.authority_schema_version !== context.authoritySchemaVersion
    || row.ruleset_version !== context.rulesetVersion
    || row.campaign_generation !== context.campaignGeneration
    || row.configuration_sha256 !== context.configurationSha256
    || row.proof_schema_version !== context.proofSchemaVersion
    || row.envelope_version !== context.envelopeVersion) {
    throw new ApiError(409, 'This Maltline ranked run generation has closed.');
  }
  return {
    runId: row.id,
    seasonId: row.season_id,
    boardId: 'arcade',
    nonce: row.nonce,
    authority: {
      gameId: MALTLINE_GENERATION_2_AUTHORITY.identity.gameId,
      rulesetVersion: MALTLINE_GENERATION_2_AUTHORITY.identity.rulesetVersion,
      campaignGeneration: MALTLINE_GENERATION_2_AUTHORITY.identity.campaignGeneration,
      configurationSha256: MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256,
    },
  };
}

async function beginMaltlineRun(
  request: Request,
  env: ArcadeBenchEnv,
  session: AnonymousSession,
): Promise<Response> {
  await enforceRateLimit(env, session.id, 'maltline_begin_run', 12);
  const body = requiredObject(await readJson(request, 32 * 1_024), 'Maltline run request');
  requireExactKeys(body, ['gameVersion', 'boardId'], 'Maltline run request');
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  if (body.gameVersion !== context.gameVersion) {
    throw new ApiError(409, 'Maltline game version is no longer ranked.');
  }
  if (body.boardId !== context.boardId) throw new ApiError(400, 'Maltline leaderboard is invalid.');
  const season = await activeMaltlineSeason(env);
  const id = randomId('run');
  const nonce = randomSeed();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CHALLENGE_LIFETIME_MS);

  await env.DB.prepare(`
    INSERT INTO maltline_run_challenges (
      id, session_id, season_id, game_id, game_version, board_id,
      authority_schema_version, ruleset_version, campaign_generation,
      configuration_sha256, proof_schema_version, envelope_version, nonce,
      created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    session.id,
    season.id,
    context.gameId,
    context.gameVersion,
    context.boardId,
    context.authoritySchemaVersion,
    context.rulesetVersion,
    context.campaignGeneration,
    context.configurationSha256,
    context.proofSchemaVersion,
    context.envelopeVersion,
    nonce,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  ).run();

  return json({
    id,
    nonce,
    seasonId: season.id,
    boardId: context.boardId,
    gameVersion: context.gameVersion,
    authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
    proofSchemaVersion: context.proofSchemaVersion,
    envelopeVersion: context.envelopeVersion,
    expiresAt: expiresAt.toISOString(),
  }, 201, { 'cache-control': 'no-store' });
}

async function challengeForSubmission(
  env: ArcadeBenchEnv,
  sessionId: string,
  runId: string,
): Promise<MaltlineChallengeRow> {
  const row = await env.DB.prepare(`
    SELECT id, session_id, season_id, game_id, game_version, board_id,
      authority_schema_version, ruleset_version, campaign_generation,
      configuration_sha256, proof_schema_version, envelope_version, nonce,
      expires_at, consumed_score_id
    FROM maltline_run_challenges WHERE id = ? AND session_id = ?
  `).bind(runId, sessionId).first<MaltlineChallengeRow>();
  if (!row) throw new ApiError(404, 'Maltline ranked run challenge not found.');
  currentChallengeIdentity(row);
  if (Date.parse(row.expires_at) <= Date.now() && row.consumed_score_id === null) {
    throw new ApiError(410, 'This Maltline ranked run expired. Start a new run.');
  }
  return row;
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
    throw new ApiError(400, 'Maltline leaderboard cursor is invalid.');
  }
}

function encodeCursor(offset: number): string {
  return btoa(`offset:${offset}`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function scoreEntry(row: MaltlineLeaderboardRow, proofAvailable: boolean): Record<string, unknown> {
  const entry = maltlineLeaderboardEntryFromRow(row);
  return {
    id: entry.id,
    name: entry.playerName,
    score: entry.score,
    lives: entry.lives,
    stageReached: entry.stageReached,
    stagesCleared: entry.stagesCleared,
    completed: entry.completed,
    totalTicks: entry.totalTicks,
    fulfilled: entry.fulfilled,
    serviceActions: entry.serviceActions,
    walkouts: entry.walkouts,
    resolved: entry.resolved,
    exited: entry.exited,
    createdAt: entry.createdAt,
    proofAvailable,
  };
}

async function listMaltlineScores(request: Request, env: ArcadeBenchEnv): Promise<Response> {
  const url = new URL(request.url);
  const queryKeys = [...url.searchParams.keys()];
  if (queryKeys.some((key) => key !== 'cursor' && key !== 'limit')
    || url.searchParams.getAll('cursor').length > 1
    || url.searchParams.getAll('limit').length > 1) {
    throw new ApiError(400, 'Maltline leaderboard query is invalid.');
  }
  const limitValue = Number(url.searchParams.get('limit') ?? 25);
  const limit = Number.isInteger(limitValue) ? Math.max(1, Math.min(50, limitValue)) : 25;
  const offset = cursorOffset(url.searchParams.get('cursor'));
  const season = await activeMaltlineSeason(env);
  const result = await env.DB.prepare(`
    SELECT id, player_name, score, lives, stage_reached, stages_cleared,
      completed, total_ticks, fulfilled, service_actions, walkouts,
      resolved, exited, created_at,
      CASE WHEN proof_deleted_at IS NULL AND proof_expires_at > ? THEN 1 ELSE 0 END
        AS proof_available
    FROM maltline_scores
    WHERE season_id = ? AND board_id = 'arcade' AND proof_state = 'ready'
    ORDER BY ${MALTLINE_LEADERBOARD_ORDER_BY}
    LIMIT ? OFFSET ?
  `).bind(new Date().toISOString(), season.id, limit + 1, offset).all<ListedMaltlineScoreRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  return json({
    entries: rows.slice(0, limit).map((row) => scoreEntry(row, row.proof_available === 1)),
    ...(hasMore ? { nextCursor: encodeCursor(offset + limit) } : {}),
  }, 200, { 'cache-control': 'public, max-age=15, stale-while-revalidate=30' });
}

async function loadMaltlineProof(
  request: Request,
  env: Pick<ArcadeBenchEnv, 'DB' | 'REPLAYS'>,
  scoreId: string,
): Promise<Response> {
  if (!/^score_[A-Za-z0-9_-]{16}$/u.test(scoreId)) {
    throw new ApiError(404, 'Maltline retained proof not found.');
  }
  const row = await env.DB.prepare(`
    SELECT proof_object_key, proof_sha256, proof_state, proof_expires_at,
      proof_deleted_at
    FROM maltline_scores WHERE id = ?
  `).bind(scoreId).first<RetainedProofRow>();
  if (!row) throw new ApiError(404, 'Maltline retained proof not found.');
  if (row.proof_state !== 'ready'
    || row.proof_deleted_at !== null
    || Date.parse(row.proof_expires_at) <= Date.now()) {
    throw new ApiError(410, 'This Maltline retained proof is no longer available.');
  }
  let object: R2ObjectBody | null;
  try {
    object = await env.REPLAYS.get(row.proof_object_key);
  } catch {
    throw new ApiError(503, 'Maltline proof storage is temporarily unavailable.');
  }
  if (!object || !('body' in object)) {
    throw new ApiError(410, 'This Maltline retained proof is no longer available.');
  }
  if (object.size > MAX_RETAINED_ENVELOPE_BYTES) {
    throw new ApiError(503, 'Maltline retained proof failed its integrity check.');
  }
  const canonicalJson = await object.text();
  if (new TextEncoder().encode(canonicalJson).byteLength > MAX_RETAINED_ENVELOPE_BYTES
    || await sha256Hex(canonicalJson) !== row.proof_sha256) {
    throw new ApiError(503, 'Maltline retained proof failed its integrity check.');
  }
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'x-maltline-proof-sha256': row.proof_sha256,
    'x-maltline-proof-expires': row.proof_expires_at,
  });
  return new Response(request.method === 'HEAD' ? null : canonicalJson, { headers });
}

async function storedScoreForRun(
  env: ArcadeBenchEnv,
  runId: string,
): Promise<StoredMaltlineScoreRow | null> {
  return env.DB.prepare(`
    SELECT id, run_id, player_name, normalized_name, moderation_key,
      score, lives, stage_reached, stages_cleared, completed, total_ticks,
      fulfilled, service_actions, walkouts, resolved, exited, created_at,
      proof_object_key, proof_sha256, proof_state, proof_state_updated_at,
      proof_expires_at, proof_deleted_at
    FROM maltline_scores WHERE run_id = ?
  `).bind(runId).first<StoredMaltlineScoreRow>();
}

function assertStoredSubmissionMatches(
  row: StoredMaltlineScoreRow,
  proofSha256: string,
  playerName: string,
  moderationKey: string,
): void {
  if (row.proof_sha256 !== proofSha256
    || row.player_name !== playerName
    || row.moderation_key !== moderationKey) {
    throw new ApiError(409, 'This Maltline ranked run was already submitted.');
  }
  if (row.proof_state === 'failed') {
    throw new ApiError(409, 'This Maltline proof could not be retained. Start a new run.');
  }
}

function storedSubmissionResponse(row: StoredMaltlineScoreRow): Response {
  return json({
    entry: scoreEntry(
      row,
      row.proof_state === 'ready'
        && row.proof_deleted_at === null
        && Date.parse(row.proof_expires_at) > Date.now(),
    ),
    proofState: row.proof_state,
  }, row.proof_state === 'ready' ? 200 : 202, { 'cache-control': 'no-store' });
}

async function failPendingProof(
  env: Pick<ArcadeBenchEnv, 'DB'>,
  scoreId: string,
  code: string,
  nowIso: string,
  expectedStateUpdatedAt: string,
): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE maltline_scores SET proof_state = 'failed', proof_state_updated_at = ?,
      proof_failed_at = ?, proof_failure_code = ?
    WHERE id = ? AND proof_state = 'pending' AND proof_state_updated_at = ?
  `).bind(nowIso, nowIso, code, scoreId, expectedStateUpdatedAt).run();
  return (result.meta.changes ?? 0) === 1;
}

async function readyPendingProof(
  env: Pick<ArcadeBenchEnv, 'DB'>,
  scoreId: string,
  proofSha256: string,
  nowIso: string,
  expectedStateUpdatedAt: string,
): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE maltline_scores SET proof_state = 'ready', proof_state_updated_at = ?,
      proof_ready_at = ?
    WHERE id = ? AND proof_state = 'pending' AND proof_sha256 = ?
      AND proof_state_updated_at = ? AND proof_deleted_at IS NULL
  `).bind(nowIso, nowIso, scoreId, proofSha256, expectedStateUpdatedAt).run();
  return (result.meta.changes ?? 0) === 1;
}

async function claimPendingProofUpload(
  env: Pick<ArcadeBenchEnv, 'DB'>,
  row: StoredMaltlineScoreRow,
): Promise<string | null> {
  if (row.proof_deleted_at !== null || Date.parse(row.proof_expires_at) <= Date.now()) return null;
  const previousTime = Date.parse(row.proof_state_updated_at);
  const leaseTime = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
  const result = await env.DB.prepare(`
    UPDATE maltline_scores SET proof_state_updated_at = ?
    WHERE id = ? AND proof_state = 'pending' AND proof_state_updated_at = ?
      AND proof_deleted_at IS NULL AND proof_expires_at > ?
  `).bind(leaseTime, row.id, row.proof_state_updated_at, leaseTime).run();
  return (result.meta.changes ?? 0) === 1 ? leaseTime : null;
}

async function objectMatchesProof(
  object: R2ObjectBody,
  proofSha256: string,
  canonicalJson?: string,
): Promise<boolean> {
  if (object.size > MAX_RETAINED_ENVELOPE_BYTES) return false;
  const bytes = await object.text();
  if (canonicalJson !== undefined && bytes !== canonicalJson) return false;
  return await sha256Hex(bytes) === proofSha256;
}

async function retainMaltlineProof(
  env: ArcadeBenchEnv,
  row: StoredMaltlineScoreRow,
  canonicalJson: string,
): Promise<'ready' | 'in-progress'> {
  const leaseAt = await claimPendingProofUpload(env, row);
  if (leaseAt === null) {
    const latest = await storedScoreForRun(env, row.run_id);
    if (latest?.proof_state === 'ready' && latest.proof_sha256 === row.proof_sha256) return 'ready';
    if (latest?.proof_state === 'failed') {
      throw new ApiError(409, 'This Maltline proof could not be retained. Start a new run.');
    }
    if ((latest !== null && latest.proof_deleted_at !== null)
      || Date.parse(row.proof_expires_at) <= Date.now()) {
      throw new ApiError(410, 'This Maltline proof retention window expired. Start a new run.');
    }
    return 'in-progress';
  }
  let stored: R2Object | null = null;
  try {
    stored = await env.REPLAYS.put(row.proof_object_key, canonicalJson, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
      customMetadata: {
        sha256: row.proof_sha256,
        kind: 'maltline-leaderboard-proof',
        authoritySha256: MALTLINE_GENERATION_2_STORAGE_CONTEXT.configurationSha256,
        proofSchemaVersion: String(MALTLINE_GENERATION_2_STORAGE_CONTEXT.proofSchemaVersion),
        envelopeVersion: String(MALTLINE_GENERATION_2_STORAGE_CONTEXT.envelopeVersion),
      },
      sha256: row.proof_sha256,
    });
  } catch {
    // A matching object may already exist after a racing conditional write.
  }

  if (stored === null) {
    let existing: R2ObjectBody | null = null;
    try {
      existing = await env.REPLAYS.get(row.proof_object_key);
    } catch {
      // A failed write/read is recoverable from the durable pending row.
    }
    if (!existing || !('body' in existing)) {
      throw new ApiError(503, 'Maltline proof storage is temporarily unavailable.');
    }
    if (!(await objectMatchesProof(existing, row.proof_sha256, canonicalJson))) {
      await failPendingProof(
        env,
        row.id,
        'object_collision',
        new Date().toISOString(),
        leaseAt,
      );
      throw new ApiError(409, 'Maltline proof storage conflict. Start a new run.');
    }
  }

  const readyAt = new Date().toISOString();
  if (!(await readyPendingProof(env, row.id, row.proof_sha256, readyAt, leaseAt))) {
    const latest = await storedScoreForRun(env, row.run_id);
    if (!latest || latest.proof_state !== 'ready' || latest.proof_sha256 !== row.proof_sha256) {
      throw new ApiError(503, 'Maltline proof was retained and is awaiting reconciliation.');
    }
  }
  return 'ready';
}

async function resumeStoredSubmission(
  env: ArcadeBenchEnv,
  row: StoredMaltlineScoreRow,
  proofSha256: string,
  canonicalJson: string,
  playerName: string,
  moderationKey: string,
): Promise<Response> {
  assertStoredSubmissionMatches(row, proofSha256, playerName, moderationKey);
  if (row.proof_state === 'pending') {
    await retainMaltlineProof(env, row, canonicalJson);
    const latest = await storedScoreForRun(env, row.run_id);
    if (!latest) throw new ApiError(503, 'Maltline proof is awaiting reconciliation.');
    assertStoredSubmissionMatches(latest, proofSha256, playerName, moderationKey);
    return storedSubmissionResponse(latest);
  }
  return storedSubmissionResponse(row);
}

async function insertPendingScore(
  env: ArcadeBenchEnv,
  challenge: MaltlineChallengeRow,
  summary: HashedMaltlineProof['envelope']['summary'],
  playerName: string,
  moderationKey: string,
  proofSha256: string,
): Promise<StoredMaltlineScoreRow | null> {
  const scoreId = randomId('score');
  const objectKey = maltlineGeneration2ProofObjectKey(challenge.id);
  const now = new Date();
  const nowIso = now.toISOString();
  const proofExpiresAt = new Date(now.getTime() + PROOF_RETENTION_MS).toISOString();
  const statements = await env.DB.batch([
    env.DB.prepare(`
      UPDATE maltline_run_challenges SET consumed_at = ?, consumed_score_id = ?
      WHERE id = ? AND session_id = ? AND consumed_score_id IS NULL AND expires_at > ?
        AND EXISTS (
          SELECT 1 FROM seasons
          WHERE seasons.id = maltline_run_challenges.season_id
            AND seasons.game_id = maltline_run_challenges.game_id
            AND seasons.game_version = maltline_run_challenges.game_version
            AND seasons.state = 'active'
        )
    `).bind(nowIso, scoreId, challenge.id, challenge.session_id, nowIso),
    env.DB.prepare(`
      INSERT INTO maltline_scores (
        id, run_id, season_id, game_id, game_version, board_id,
        authority_schema_version, ruleset_version, campaign_generation,
        configuration_sha256, proof_schema_version, envelope_version, nonce,
        player_name, normalized_name,
        score, lives, stage_reached, stages_cleared, completed, total_ticks,
        fulfilled, service_actions, walkouts, resolved, exited,
        proof_object_key, proof_sha256, proof_state, proof_state_updated_at,
        proof_ready_at, proof_failed_at, proof_failure_code,
        proof_expires_at, proof_deleted_at, moderation_key, created_at
      )
      SELECT ?, id, season_id, game_id, game_version, board_id,
        authority_schema_version, ruleset_version, campaign_generation,
        configuration_sha256, proof_schema_version, envelope_version, nonce,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?,
        NULL, NULL, NULL, ?, NULL, ?, ?
      FROM maltline_run_challenges
      WHERE id = ? AND session_id = ? AND consumed_score_id = ?
    `).bind(
      scoreId,
      playerName,
      playerName.toLocaleLowerCase(),
      summary.score,
      summary.lives,
      summary.stageReached,
      summary.stagesCleared,
      summary.completed ? 1 : 0,
      summary.totalTicks,
      summary.fulfilled,
      summary.serviceActions,
      summary.walkouts,
      summary.resolved,
      summary.exited,
      objectKey,
      proofSha256,
      nowIso,
      proofExpiresAt,
      moderationKey,
      nowIso,
      challenge.id,
      challenge.session_id,
      scoreId,
    ),
  ]);
  if ((statements[0].meta.changes ?? 0) !== 1 || (statements[1].meta.changes ?? 0) !== 1) {
    return null;
  }
  return storedScoreForRun(env, challenge.id);
}

async function submitMaltlineScore(
  request: Request,
  env: ArcadeBenchEnv,
  session: AnonymousSession,
): Promise<Response> {
  await enforceRateLimit(env, session.id, 'maltline_submit_score', 6, true);
  const body = requiredObject(
    await readJson(request, MAX_MALTLINE_SCORE_BYTES),
    'Maltline score submission',
  );
  requireExactKeys(body, ['gameVersion', 'runId', 'playerName', 'proof'], 'Maltline score submission');
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  if (body.gameVersion !== context.gameVersion) {
    throw new ApiError(409, 'Maltline game version is no longer ranked.');
  }
  const runId = requiredString(body.runId, 'Maltline ranked run', 64);
  const challengeRow = await challengeForSubmission(env, session.id, runId);
  if (challengeRow.consumed_score_id === null) await activeMaltlineSeason(env);
  const challenge = currentChallengeIdentity(challengeRow);
  let verified;
  try {
    verified = await verifyAndHashMaltlineProof(body.proof, challenge);
  } catch (error) {
    if (error instanceof MaltlineProofError) {
      throw new ApiError(400, error.message, MALTLINE_ERROR_CODES.proofInvalid);
    }
    throw error;
  }
  if (new TextEncoder().encode(verified.canonicalJson).byteLength > MAX_RETAINED_ENVELOPE_BYTES) {
    throw new ApiError(413, 'Canonical Maltline proof exceeds the retention limit.');
  }
  const review = await moderateCallsign(body.playerName, env);
  if (!review.allowed || !review.normalizedName || !review.moderationKey) {
    throw new ApiError(
      400,
      review.reason ?? 'Choose a public-friendly callsign.',
      MALTLINE_ERROR_CODES.callsignRejected,
    );
  }

  const existing = await storedScoreForRun(env, challengeRow.id);
  if (existing) {
    return resumeStoredSubmission(
      env,
      existing,
      verified.sha256,
      verified.canonicalJson,
      review.normalizedName,
      review.moderationKey,
    );
  }

  const pending = await insertPendingScore(
    env,
    challengeRow,
    verified.envelope.summary,
    review.normalizedName,
    review.moderationKey,
    verified.sha256,
  );
  if (!pending) {
    const concurrent = await storedScoreForRun(env, challengeRow.id);
    if (!concurrent) {
      await activeMaltlineSeason(env);
      throw new ApiError(409, 'This Maltline ranked run was already submitted.');
    }
    return resumeStoredSubmission(
      env,
      concurrent,
      verified.sha256,
      verified.canonicalJson,
      review.normalizedName,
      review.moderationKey,
    );
  }

  const retention = await retainMaltlineProof(env, pending, verified.canonicalJson);
  const ready = await storedScoreForRun(env, challengeRow.id);
  if (retention === 'in-progress' && ready?.proof_state === 'pending') {
    return storedSubmissionResponse(ready);
  }
  if (!ready || ready.proof_state !== 'ready') {
    throw new ApiError(503, 'Maltline proof was retained and is awaiting reconciliation.');
  }
  return json({ entry: scoreEntry(
    ready,
    ready.proof_deleted_at === null && Date.parse(ready.proof_expires_at) > Date.now(),
  ), proofState: 'ready' }, 201, {
    'cache-control': 'no-store',
  });
}

export async function reconcileMaltlineProofs(
  env: Pick<ArcadeBenchEnv, 'DB' | 'REPLAYS'>,
  now = new Date(),
): Promise<{ examined: number; ready: number; failed: number; deferred: number }> {
  const cutoff = new Date(now.getTime() - RECONCILIATION_GRACE_MS).toISOString();
  const result = await env.DB.prepare(`
    SELECT id, proof_object_key, proof_sha256, proof_state_updated_at
    FROM maltline_scores
    WHERE proof_state = 'pending' AND proof_state_updated_at <= ?
      AND proof_deleted_at IS NULL
    ORDER BY proof_state_updated_at, id LIMIT 100
  `).bind(cutoff).all<PendingProofRow>();
  const rows = result.results ?? [];
  let ready = 0;
  let failed = 0;
  let deferred = 0;
  for (const row of rows) {
    let object: R2ObjectBody | null;
    try {
      object = await env.REPLAYS.get(row.proof_object_key);
    } catch {
      deferred++;
      continue;
    }
    if (!object || !('body' in object)) {
      if (await failPendingProof(
        env,
        row.id,
        'object_missing',
        now.toISOString(),
        row.proof_state_updated_at,
      )) failed++;
      continue;
    }
    let matches = false;
    try {
      matches = await objectMatchesProof(object, row.proof_sha256);
    } catch {
      deferred++;
      continue;
    }
    if (matches) {
      if (await readyPendingProof(
        env,
        row.id,
        row.proof_sha256,
        now.toISOString(),
        row.proof_state_updated_at,
      )) ready++;
    } else if (await failPendingProof(
      env,
      row.id,
      'object_mismatch',
      now.toISOString(),
      row.proof_state_updated_at,
    )) {
      failed++;
    }
  }
  return { examined: rows.length, ready, failed, deferred };
}

export async function cleanupExpiredMaltlineProofs(
  env: Pick<ArcadeBenchEnv, 'DB' | 'REPLAYS'>,
  now = new Date(),
): Promise<number> {
  const nowIso = now.toISOString();
  const result = await env.DB.prepare(`
    SELECT id, proof_object_key, proof_sha256, proof_state_updated_at
    FROM maltline_scores
    WHERE proof_expires_at <= ? AND proof_deleted_at IS NULL
      AND proof_state IN ('ready', 'failed')
    ORDER BY proof_expires_at, id LIMIT 500
  `).bind(nowIso).all<PendingProofRow>();
  const rows = result.results ?? [];
  if (rows.length === 0) return 0;
  await env.REPLAYS.delete([...new Set(rows.map((row) => row.proof_object_key))]);
  const placeholders = rows.map(() => '?').join(', ');
  await env.DB.prepare(`
    UPDATE maltline_scores SET proof_deleted_at = ?
    WHERE proof_deleted_at IS NULL AND id IN (${placeholders})
  `).bind(nowIso, ...rows.map((row) => row.id)).run();
  return rows.length;
}

export async function handleMaltlineApi(request: Request, env: ArcadeBenchEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  const leaderboardPath = `${MALTLINE_API_PREFIX}/leaderboards/arcade`;
  const replayMatch = path.match(new RegExp(`^${MALTLINE_API_PREFIX}/replays/([^/]+)$`, 'u'));
  if (replayMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') methodNotAllowed('GET or HEAD');
    await admitMaltlineExpensiveRequest(request, env, 'proof-read');
    return loadMaltlineProof(request, env, replayMatch[1]!);
  }
  if (path === leaderboardPath && request.method === 'GET') {
    await admitMaltlineExpensiveRequest(request, env, 'board-read');
    return listMaltlineScores(request, env);
  }

  if (path === `${MALTLINE_API_PREFIX}/runs`) {
    if (request.method !== 'POST') methodNotAllowed('POST');
    assertSameOrigin(request);
    await admitMaltlineExpensiveRequest(request, env, 'ranked-write');
    const session = await anonymousSession(request, env);
    return attachSessionCookie(await beginMaltlineRun(request, env, session), session);
  } else if (path === leaderboardPath) {
    if (request.method !== 'POST') methodNotAllowed('GET or POST');
    assertSameOrigin(request);
    await admitMaltlineExpensiveRequest(request, env, 'ranked-write');
    const session = await anonymousSession(request, env);
    return attachSessionCookie(await submitMaltlineScore(request, env, session), session);
  } else {
    throw new ApiError(404, 'Maltline API endpoint not found.');
  }
}

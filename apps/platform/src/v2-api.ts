import type { ArcadeBenchEnv } from './env';
import { ApiError, assertSameOrigin, json, readJson, requiredObject, requiredString } from './http';
import { anonymousSession, attachSessionCookie, enforceRateLimit } from './session';
import { activityLimit, listActivity } from './shared/activity';
import { decodeSegment } from './shared/canonical';
import {
  feedbackChannel,
  feedbackSubject,
  feedbackSummary,
  parseFeedbackNote,
  parseFeedbackVote,
  setFeedback,
} from './shared/feedback';
import {
  boardFromRunContext,
  leaderboardLimit,
  listBoardEntries,
  resolveBoardFromQuery,
  submitSharedScore,
} from './shared/leaderboards';
import { defaultRegistry } from './shared/registry';
import { V2_API_PREFIX } from './shared/types';

const MAX_SCORE_BYTES = 8 * 1024 * 1024;
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const MAX_RUN_BYTES = 32 * 1024;
const MAX_FEEDBACK_BYTES = 16 * 1024;
const PUBLIC_LIST_CACHE = 'public, max-age=15, stale-while-revalidate=30';

/**
 * Runtime activation switch for the shared v2 HTTP surface. Retention and
 * private-note expiry continue when writes are disabled during a rollback.
 */
export function sharedPlatformEnabled(env: ArcadeBenchEnv): boolean {
  const setting = env.SHARED_PLATFORM_ENABLED;
  if (setting === undefined || setting === '') return true;
  return !['0', 'false', 'off', 'no'].includes(setting.trim().toLocaleLowerCase());
}

function methodNotAllowed(allowed: string): never {
  throw new ApiError(405, `Use ${allowed} for this endpoint.`);
}

export async function handleV2Api(request: Request, env: ArcadeBenchEnv): Promise<Response> {
  if (!sharedPlatformEnabled(env)) {
    throw new ApiError(503, 'Shared platform services are not enabled.');
  }
  const url = new URL(request.url);
  const path = url.pathname.slice(V2_API_PREFIX.length) || '/';

  if (path === '/activity' || path === '/activity/') {
    if (request.method !== 'GET' && request.method !== 'HEAD') methodNotAllowed('GET or HEAD');
    // The feed is a public, session-free projection of the shared event table:
    // no cookie, no note, no consent flag, and no private key is read here.
    const page = await listActivity(env, defaultRegistry, {
      limit: activityLimit(url.searchParams.get('limit')),
      cursor: url.searchParams.get('cursor'),
      gameId: url.searchParams.get('gameId'),
    });
    const response = json(page, 200, { 'cache-control': PUBLIC_LIST_CACHE });
    return request.method === 'HEAD' ? new Response(null, response) : response;
  }

  const gameMatch = path.match(/^\/games\/([^/]+)(\/.+)$/u);
  if (!gameMatch) throw new ApiError(404, 'Arcade API endpoint not found.');
  const adapter = defaultRegistry.require(decodeSegment(gameMatch[1]!));
  const rest = gameMatch[2]!;

  if (rest === '/runs') {
    if (request.method !== 'POST') methodNotAllowed('POST');
    return beginSharedRun(request, env, adapter.gameId);
  }

  const leaderboardMatch = rest.match(/^\/leaderboards\/([^/]+)$/u);
  if (leaderboardMatch) {
    const boardId = decodeSegment(leaderboardMatch[1]!);
    if (request.method === 'GET') return readSharedLeaderboard(env, adapter, boardId, url);
    if (request.method !== 'POST') methodNotAllowed('GET or POST');
    return submitSharedLeaderboard(request, env, adapter.gameId, boardId);
  }

  const feedbackMatch = rest.match(/^\/feedback\/([^/]+)\/([^/]+)$/u);
  if (feedbackMatch) {
    const kind = decodeSegment(feedbackMatch[1]!);
    const id = decodeSegment(feedbackMatch[2]!);
    if (request.method === 'GET') return readFeedback(request, env, adapter.gameId, kind, id, url);
    if (request.method !== 'PUT') methodNotAllowed('GET or PUT');
    return writeFeedback(request, env, adapter.gameId, kind, id, url);
  }

  if (rest === '/replays') {
    if (request.method !== 'POST') methodNotAllowed('POST');
    return publishSharedReplay(request, env, adapter.gameId);
  }

  throw new ApiError(404, 'Arcade API endpoint not found.');
}

async function beginSharedRun(
  request: Request,
  env: ArcadeBenchEnv,
  gameId: string,
): Promise<Response> {
  assertSameOrigin(request);
  const adapter = defaultRegistry.require(gameId);
  await adapter.admitRankedWrite?.(request, env);
  const session = await anonymousSession(request, env);
  await enforceRateLimit(env, session.id, 'begin_run', 12);
  const body = requiredObject(await readJson(request, MAX_RUN_BYTES), 'Run request');
  if (body.gameVersion !== adapter.currentGameVersion) {
    throw new ApiError(409, 'Game version is no longer ranked.');
  }
  const boardId = requiredString(body.boardId, 'Leaderboard', 32);
  const board = await boardFromRunContext(env, adapter, boardId, body.context ?? {});
  const challenge = await adapter.beginRun({ env, sessionId: session.id, board });
  return attachSessionCookie(json({
    id: challenge.id,
    seed: challenge.seed,
    gameVersion: adapter.currentGameVersion,
    expiresAt: challenge.expiresAt,
  }, 201, { 'cache-control': 'no-store' }), session);
}

async function readSharedLeaderboard(
  env: ArcadeBenchEnv,
  adapter: ReturnType<typeof defaultRegistry.require>,
  boardId: string,
  url: URL,
): Promise<Response> {
  const board = await resolveBoardFromQuery(env, adapter, boardId, url);
  const page = await listBoardEntries(env, adapter, board, {
    limit: leaderboardLimit(url.searchParams.get('limit')),
    cursor: url.searchParams.get('cursor'),
  });
  return json(page, 200, { 'cache-control': PUBLIC_LIST_CACHE });
}

async function submitSharedLeaderboard(
  request: Request,
  env: ArcadeBenchEnv,
  gameId: string,
  boardId: string,
): Promise<Response> {
  assertSameOrigin(request);
  const adapter = defaultRegistry.require(gameId);
  await adapter.admitRankedWrite?.(request, env);
  const session = await anonymousSession(request, env);
  const body = requiredObject(await readJson(request, MAX_SCORE_BYTES), 'Score submission');
  const submission = await submitSharedScore({ env, adapter, session, boardId, body });
  return attachSessionCookie(json(submission, 201, { 'cache-control': 'no-store' }), session);
}

async function readFeedback(
  request: Request,
  env: ArcadeBenchEnv,
  gameId: string,
  kind: string,
  id: string,
  url: URL,
): Promise<Response> {
  const adapter = defaultRegistry.require(gameId);
  const session = await anonymousSession(request, env);
  const subject = feedbackSubject(adapter, kind, id);
  const channel = feedbackChannel(adapter, url.searchParams.get('channel'));
  const summary = await feedbackSummary(env, adapter, session.id, subject, channel);
  return attachSessionCookie(json(summary, 200, { 'cache-control': 'no-store' }), session);
}

async function writeFeedback(
  request: Request,
  env: ArcadeBenchEnv,
  gameId: string,
  kind: string,
  id: string,
  url: URL,
): Promise<Response> {
  assertSameOrigin(request);
  const adapter = defaultRegistry.require(gameId);
  const session = await anonymousSession(request, env);
  await enforceRateLimit(env, session.id, 'feedback', 60);
  const body = requiredObject(await readJson(request, MAX_FEEDBACK_BYTES), 'Feedback');
  if (body.gameVersion !== adapter.currentGameVersion) {
    throw new ApiError(409, 'Game version is no longer current.');
  }
  const subject = feedbackSubject(adapter, kind, id);
  const channel = feedbackChannel(adapter, url.searchParams.get('channel'));
  const vote = parseFeedbackVote(body.vote);
  const note = parseFeedbackNote(body.note);
  const summary = await setFeedback(env, adapter, session.id, subject, channel, vote, note);
  return attachSessionCookie(json(summary, 200, { 'cache-control': 'no-store' }), session);
}

async function publishSharedReplay(
  request: Request,
  env: ArcadeBenchEnv,
  gameId: string,
): Promise<Response> {
  assertSameOrigin(request);
  const adapter = defaultRegistry.require(gameId);
  if (!adapter.publishReplay) {
    throw new ApiError(404, 'Replay sharing is not available for this game.');
  }
  const session = await anonymousSession(request, env);
  const body = requiredObject(await readJson(request, MAX_REPLAY_BYTES), 'Replay publication');
  return attachSessionCookie(
    await adapter.publishReplay({ env, sessionId: session.id, body, origin: new URL(request.url).origin }),
    session,
  );
}

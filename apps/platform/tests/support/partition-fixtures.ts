import { env, exports } from 'cloudflare:workers';
import {
  ContinuousPartitionSession,
  PARTITION_GAME_VERSION,
  PartitionEngine,
  applyDifficulty,
  createPartitionCampaign,
  resolvePartitionProgression,
  type DifficultyId,
  type PartitionReplay,
} from '@arcadebench/partition';
import { sha256Hex } from '../../src/crypto';
import { CALLSIGN_MODEL, CALLSIGN_POLICY_VERSION } from '../../src/moderation';

export const GAME_VERSION = PARTITION_GAME_VERSION;
export const ORIGIN = 'https://arcadebench.org';
export const V1_API = `${ORIGIN}/api/v1/games/partition`;
export const V2_API = `${ORIGIN}/api/v2`;
export const PUBLICATION = { policyVersion: 'top50-social-v1', socialMedia: false } as const;

/** Every fixture request goes through the Worker under test, never the network. */
export function workerFetch(url: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(url, init);
}

/** Seeds the moderation cache so a submission never has to call Workers AI. */
export async function allowCallsign(name: string): Promise<string> {
  const moderationKey = await sha256Hex(
    `${CALLSIGN_POLICY_VERSION}\0${name.toLocaleLowerCase()}`,
  );
  await env.DB.prepare(`
    INSERT INTO callsign_moderation_cache
      (moderation_key, policy_version, allowed, category, model, created_at)
    VALUES (?, ?, 1, 'clean', ?, ?)
    ON CONFLICT (moderation_key) DO UPDATE SET allowed = 1, policy_version = excluded.policy_version
  `).bind(moderationKey, CALLSIGN_POLICY_VERSION, CALLSIGN_MODEL, new Date().toISOString()).run();
  return moderationKey;
}

export function sessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error(`Expected a session cookie on ${response.status}.`);
  return cookie.split(';')[0]!;
}

export interface StartedRun {
  cookie: string;
  sessionId: string;
  runId: string;
  seed: number;
}

export async function beginRun(
  boardId: 'arcade' | 'level',
  context: Record<string, string>,
  cookie?: string,
): Promise<StartedRun> {
  const response = await workerFetch(`${V2_API}/games/partition/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ gameVersion: GAME_VERSION, boardId, context }),
  });
  const body = await response.json() as { id: string; seed: number };
  if (response.status !== 201) throw new Error(`beginRun failed: ${response.status} ${JSON.stringify(body)}`);
  const resolved = cookie ?? sessionCookie(response);
  return {
    cookie: resolved,
    sessionId: resolved.replace('ab_session=', '').split('.')[0]!,
    runId: body.id,
    seed: body.seed,
  };
}

function partitionCount(replays: readonly PartitionReplay[]): number {
  return replays.reduce(
    (total, replay) => total + replay.ticks
      .flatMap((tick) => tick.events)
      .filter((event) => event.type === 'trace_completed').length,
    0,
  );
}

function elapsedMilliseconds(replays: readonly PartitionReplay[]): number {
  return Math.round(replays.reduce(
    (total, replay) => total + replay.finalState.tick / replay.scenario.ticksPerSecond * 1000,
    0,
  ));
}

export interface LevelProof {
  replay: PartitionReplay;
  score: Record<string, unknown>;
}

/** A finished (usually lost) field attempt, claimed exactly as the verifier rebuilds it. */
export function levelProof(seed: number, difficulty: DifficultyId, levelSlug: string): LevelProof {
  const level = createPartitionCampaign(seed)
    .find((candidate) => candidate.metadata.slug === levelSlug);
  if (!level) throw new Error(`Unknown field ${levelSlug}.`);
  const session = new ContinuousPartitionSession(
    new PartitionEngine(applyDifficulty(level.scenario, difficulty)),
  );
  while (session.engine.snapshot().status === 'running') session.tick();
  const replay = session.replay();
  return {
    replay,
    score: {
      scope: 'level',
      difficulty,
      levelId: level.metadata.slug,
      levelNumber: level.metadata.number,
      levelTitle: level.metadata.title,
      won: replay.finalState.status === 'won',
      capturedFraction: replay.finalState.capturedFraction,
      elapsedMs: elapsedMilliseconds([replay]),
      partitions: partitionCount([replay]),
    },
  };
}

export interface ArcadeProof {
  replays: PartitionReplay[];
  score: Record<string, unknown>;
}

/** Consecutive stage attempts until the run ends, claimed as the verifier rebuilds it. */
export function arcadeProof(seed: number, difficulty: DifficultyId): ArcadeProof {
  const progression = resolvePartitionProgression(undefined, seed);
  const replays: PartitionReplay[] = [];
  for (const stage of progression) {
    const session = new ContinuousPartitionSession(
      new PartitionEngine(applyDifficulty(stage.scenario, difficulty)),
    );
    while (session.engine.snapshot().status === 'running') session.tick();
    replays.push(session.replay());
    if (session.engine.snapshot().status !== 'won') break;
  }
  return {
    replays,
    score: {
      scope: 'arcade',
      difficulty,
      stageReached: replays.length,
      stagesCleared: replays.filter((replay) => replay.finalState.status === 'won').length,
      completed: replays.length === progression.length
        && replays.at(-1)!.finalState.status === 'won',
      elapsedMs: elapsedMilliseconds(replays),
      partitions: partitionCount(replays),
    },
  };
}

export interface SubmitResult {
  status: number;
  body: Record<string, unknown>;
}

export async function submitLevelScore(options: {
  cookie: string;
  runId: string;
  playerName: string;
  proof: LevelProof;
  socialMedia?: boolean;
  publication?: unknown;
}): Promise<SubmitResult> {
  return submitBoardScore({
    cookie: options.cookie,
    runId: options.runId,
    boardId: 'level',
    playerName: options.playerName,
    score: options.proof.score,
    proof: { replays: [options.proof.replay] },
    ...(options.socialMedia === undefined && options.publication === undefined
      ? {}
      : {
          publication: options.publication ?? {
            policyVersion: 'top50-social-v1',
            socialMedia: options.socialMedia ?? false,
          },
        }),
  });
}

export async function submitArcadeScore(options: {
  cookie: string;
  runId: string;
  playerName: string;
  proof: ArcadeProof;
  socialMedia?: boolean;
}): Promise<SubmitResult> {
  return submitBoardScore({
    cookie: options.cookie,
    runId: options.runId,
    boardId: 'arcade',
    playerName: options.playerName,
    score: options.proof.score,
    proof: { replays: options.proof.replays },
    publication: {
      policyVersion: 'top50-social-v1',
      socialMedia: options.socialMedia ?? false,
    },
  });
}

export async function submitBoardScore(options: {
  cookie: string;
  runId: string;
  boardId: 'arcade' | 'level';
  playerName: string;
  score: unknown;
  proof: unknown;
  publication?: unknown;
}): Promise<SubmitResult> {
  const response = await workerFetch(`${V2_API}/games/partition/leaderboards/${options.boardId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: options.cookie },
    body: JSON.stringify({
      gameVersion: GAME_VERSION,
      runId: options.runId,
      playerName: options.playerName,
      score: options.score,
      proof: options.proof,
      ...(options.publication === undefined ? {} : { publication: options.publication }),
    }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

export async function listEntries(boardId: string, filters: Record<string, string>): Promise<{
  entries: Array<Record<string, unknown>>;
  nextCursor?: string;
}> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) search.set(`filter.${key}`, value);
  const response = await workerFetch(`${V2_API}/games/partition/leaderboards/${boardId}?${search}`);
  if (response.status !== 200) throw new Error(`list failed: ${response.status}`);
  return response.json() as Promise<{ entries: Array<Record<string, unknown>>; nextCursor?: string }>;
}

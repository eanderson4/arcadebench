import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { SmilefallEngine, type ControlInput } from '@arcadebench/smilefall';
import {
  SMILEFALL_CURRENT_RANKED_AUTHORITY as authority,
  buildSmilefallRankedProof,
  resolveOfficialSmilefallScenario,
  verifySmilefallRankedProof,
  type SmilefallProofInputTick,
  type SmilefallRankedChallenge,
} from '@arcadebench/smilefall/verifier';
import { smilefallPlatformAdapter as adapter, smilefallRankComponents } from '../src/smilefall-platform-adapter';
import { feedbackSubject } from '../src/shared/feedback';
import { resolveBoardInstance } from '../src/shared/leaderboards';
import { PUBLICATION, V2_API, allowCallsign, workerFetch } from './support/partition-fixtures';

const API = `${V2_API}/games/smilefall`;
const IDLE: ControlInput = { lean: 'none', hop: false };
type Difficulty = (typeof authority.difficulties)[number];

function terminalIdleStage(levelId: string, difficulty: Difficulty, nonce: number): {
  levelId: string;
  ticks: SmilefallProofInputTick[];
  won: boolean;
} {
  const engine = new SmilefallEngine(resolveOfficialSmilefallScenario(levelId, difficulty, nonce));
  const ticks: SmilefallProofInputTick[] = [];
  while (engine.snapshot().status === 'running') {
    const tick = engine.snapshot().tick + 1;
    engine.setInput(IDLE);
    ticks.push({ tick, input: IDLE });
    engine.step();
  }
  return { levelId, ticks, won: engine.snapshot().status === 'won' };
}

async function beginRanked(
  boardId: 'arcade' | 'level',
  difficulty: Difficulty,
  levelId?: string,
): Promise<{ cookie: string; id: string; seed: number }> {
  const response = await workerFetch(`${API}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      gameVersion: authority.gameVersion,
      boardId,
      context: boardId === 'arcade' ? { difficulty } : { difficulty, levelId },
    }),
  });
  const body = await response.json() as { id: string; seed: number };
  expect(response.status, JSON.stringify(body)).toBe(201);
  return { ...body, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

function idleProof(
  run: { id: string; seed: number },
  boardId: 'arcade' | 'level',
  difficulty: Difficulty,
  levelId?: string,
) {
  const challenge: SmilefallRankedChallenge = {
    runId: run.id,
    nonce: run.seed,
    boardId,
    difficulty,
    ...(boardId === 'level' ? { levelId: levelId! } : {}),
  };
  const stages = [];
  const levelIds = boardId === 'arcade' ? authority.arcadeLevelIds : [levelId!];
  for (const playedLevel of levelIds) {
    const stage = terminalIdleStage(playedLevel, difficulty, run.seed);
    stages.push({ levelId: stage.levelId, ticks: stage.ticks });
    if (!stage.won) break;
  }
  const proof = buildSmilefallRankedProof(stages, challenge);
  return {
    proof,
    score: verifySmilefallRankedProof(proof, challenge, authority.gameVersion).summary,
  };
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('Smilefall shared platform adapter', () => {
  it('opens the current launch competition for the verifier version', async () => {
    await expect(adapter.activeSeason(env)).resolves.toEqual({
      id: 'smilefall-launch-1',
      gameVersion: authority.gameVersion,
    });
    await expect(env.DB.prepare(`
      SELECT name, state, starts_at FROM seasons WHERE id = 'smilefall-launch-1'
    `).first()).resolves.toEqual({
      name: 'Launch Board',
      state: 'active',
      starts_at: '2026-09-01T00:00:00.000Z',
    });
  });

  it('resolves independent arcade and level boards by difficulty', async () => {
    const difficulty = authority.difficulties[1]!;
    const level = authority.levels[0]!;
    const arcade = await resolveBoardInstance(env, adapter, 'arcade', { difficulty });
    const individual = await resolveBoardInstance(env, adapter, 'level', {
      difficulty,
      levelId: level.id,
    });
    expect(arcade).toMatchObject({
      gameId: 'smilefall',
      boardId: 'arcade',
      context: { difficulty },
      label: expect.stringContaining('Arcade Run'),
      path: expect.stringContaining('/games/smilefall/?'),
    });
    expect(individual).toMatchObject({
      gameId: 'smilefall',
      boardId: 'level',
      context: { difficulty, levelId: level.id },
      label: expect.stringContaining(level.title),
      path: expect.stringContaining(`level=${encodeURIComponent(level.id)}`),
    });
    expect(arcade.boardKey).not.toBe(individual.boardKey);
    expect((await resolveBoardInstance(env, adapter, 'arcade', {
      difficulty: authority.difficulties.at(-1)!,
    })).boardKey).not.toBe(arcade.boardKey);
  });

  it('rejects unknown and cross-scope context instead of merging boards', () => {
    const difficulty = authority.difficulties[0]!;
    const levelId = authority.levels[0]!.id;
    expect(() => adapter.resolveBoard('arcade', { difficulty, levelId })).toThrow(/context/iu);
    expect(() => adapter.resolveBoard('level', { difficulty })).toThrow(/context/iu);
    expect(() => adapter.resolveBoard('level', { difficulty, levelId: 'not-a-level' })).toThrow(/identifier/iu);
    expect(() => adapter.resolveBoard('arcade', { difficulty: 'impossible' })).toThrow(/difficulty/iu);
    expect(() => adapter.resolveBoard('daily', { difficulty })).toThrow(/not found/iu);
  });

  it('registers game and every catalog level as a private-note feedback subject', () => {
    expect(feedbackSubject(adapter, 'game', 'smilefall')).toEqual({ kind: 'game', id: 'smilefall' });
    for (const level of authority.levels) {
      expect(feedbackSubject(adapter, 'level', level.id)).toEqual({ kind: 'level', id: level.id });
    }
    expect(() => feedbackSubject(adapter, 'level', 'not-a-level')).toThrow(/not found/iu);
    expect(() => feedbackSubject(adapter, 'comment', authority.levels[0]!.id)).toThrow(/not found/iu);
  });

  it('serves run, leaderboard, and private-note feedback routes through the shared API', async () => {
    const difficulty = authority.difficulties[0]!;
    const level = authority.levels[0]!;
    const started = await workerFetch(`${API}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameVersion: authority.gameVersion,
        boardId: 'level',
        context: { difficulty, levelId: level.id },
      }),
    });
    expect(started.status, await started.clone().text()).toBe(201);
    const cookie = started.headers.get('set-cookie')!.split(';')[0]!;
    const run = await started.json() as { id: string; seed: number; gameVersion: string };
    expect(run).toMatchObject({ gameVersion: authority.gameVersion });
    expect(Number.isInteger(run.seed)).toBe(true);
    await expect(env.DB.prepare(`
      SELECT game_id, board_id, context_json, consumed_entry_id
      FROM shared_run_challenges WHERE id = ?
    `).bind(run.id).first()).resolves.toEqual({
      game_id: 'smilefall',
      board_id: 'level',
      context_json: JSON.stringify({ difficulty, levelId: level.id }),
      consumed_entry_id: null,
    });

    const listed = await workerFetch(
      `${API}/leaderboards/level?filter.difficulty=${encodeURIComponent(difficulty)}&filter.levelId=${encodeURIComponent(level.id)}`,
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ entries: [] });

    const feedback = await workerFetch(`${API}/feedback/level/${encodeURIComponent(level.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        gameVersion: authority.gameVersion,
        vote: 1,
        note: 'The first landing teaches the bounce clearly.',
      }),
    });
    expect(feedback.status, await feedback.clone().text()).toBe(200);
    await expect(feedback.json()).resolves.toMatchObject({
      up: 1,
      down: 0,
      viewerVote: 1,
      note: 'The first landing teaches the bounce clearly.',
    });
  });

  it('orders verified arcade and level results without client rank fields', () => {
    const arcade = {
      scope: 'arcade' as const,
      difficulty: authority.difficulties[1]!,
      completed: false,
      stageReached: 4,
      stagesCleared: 3,
      score: 12_345,
      totalTicks: 3_000,
      popped: 2,
    };
    expect(smilefallRankComponents(arcade)).toEqual([0, -3, -12345, 3000, 2, 0, 0, 0]);
    expect(smilefallRankComponents({ ...arcade, completed: true })[0]).toBeLessThan(
      smilefallRankComponents({ ...arcade, completed: false, score: 999_999 })[0]!,
    );
    expect(smilefallRankComponents({ ...arcade, stagesCleared: 4 })[1]).toBeLessThan(
      smilefallRankComponents(arcade)[1]!,
    );
    expect(smilefallRankComponents({ ...arcade, score: arcade.score + 1 })[2]).toBeLessThan(
      smilefallRankComponents(arcade)[2]!,
    );

    const level = {
      scope: 'level' as const,
      difficulty: authority.difficulties[1]!,
      levelId: authority.levels[0]!.id,
      won: true,
      score: 900,
      totalTicks: 400,
      popped: 1,
      caught: 5,
    };
    expect(smilefallRankComponents(level)).toEqual([-1, -900, 400, 1, -5, 0, 0, 0]);
  });

  it.each(['arcade', 'level'] as const)(
    'accepts a verified input-only %s proof through the shared score and activity pipeline',
    async (boardId) => {
      const difficulty = authority.difficulties[0]!;
      const levelId = authority.levels[0]!.id;
      const run = await beginRanked(boardId, difficulty, levelId);
      const verified = idleProof(run, boardId, difficulty, levelId);
      const playerName = `SMILE ${boardId.toUpperCase()}`;
      await allowCallsign(playerName);
      const response = await workerFetch(`${API}/leaderboards/${boardId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: run.cookie },
        body: JSON.stringify({
          gameVersion: authority.gameVersion,
          runId: run.id,
          playerName,
          score: verified.score,
          proof: verified.proof,
          publication: PUBLICATION,
        }),
      });
      const body = await response.json() as {
        entry?: { id: string; gameId: string; board: { id: string }; result: unknown };
        publication?: { rankAtSubmission: number; replaySaved: boolean };
        error?: string;
      };
      expect(response.status, JSON.stringify(body)).toBe(201);
      expect(body.entry).toMatchObject({
        gameId: 'smilefall',
        board: { id: boardId },
        result: verified.score,
      });
      expect(body.publication).toMatchObject({ rankAtSubmission: 1, replaySaved: true });
      const entry = await env.DB.prepare(`
        SELECT run_id, game_id, board_id, result_json, replay_object_id
        FROM leaderboard_entries WHERE id = ?
      `).bind(body.entry!.id).first<{
        run_id: string;
        game_id: string;
        board_id: string;
        result_json: string;
        replay_object_id: string;
      }>();
      expect(entry).toMatchObject({ run_id: run.id, game_id: 'smilefall', board_id: boardId });
      expect(JSON.parse(entry!.result_json)).toEqual(verified.score);
      expect(entry!.replay_object_id).toBeTruthy();
      const feed = await workerFetch(`${V2_API}/activity?gameId=smilefall&limit=50`);
      const activity = await feed.json() as { entries: Array<Record<string, unknown>> };
      expect(activity.entries).toContainEqual(expect.objectContaining({
        entryId: body.entry!.id,
        gameId: 'smilefall',
        gameTitle: 'Smilefall',
        leaderboardPath: expect.stringContaining('/games/smilefall/'),
      }));
    },
  );

  it('rejects an inflated client score without consuming the ranked run', async () => {
    const boardId = 'arcade';
    const difficulty = authority.difficulties[0]!;
    const run = await beginRanked(boardId, difficulty);
    const verified = idleProof(run, boardId, difficulty);
    const playerName = 'SMILE HONEST';
    await allowCallsign(playerName);
    const response = await workerFetch(`${API}/leaderboards/${boardId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: run.cookie },
      body: JSON.stringify({
        gameVersion: authority.gameVersion,
        runId: run.id,
        playerName,
        score: { ...verified.score, score: Number(verified.score.score) + 1 },
        proof: verified.proof,
        publication: PUBLICATION,
      }),
    });
    expect(response.status).toBe(400);
    await expect(env.DB.prepare(`
      SELECT consumed_entry_id FROM shared_run_challenges WHERE id = ?
    `).bind(run.id).first('consumed_entry_id')).resolves.toBeNull();
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM leaderboard_entries WHERE run_id = ?
    `).bind(run.id).first('count')).resolves.toBe(0);
  });

  it('refuses to consume a challenge after its competition closes', async () => {
    const difficulty = authority.difficulties[0]!;
    const run = await beginRanked('arcade', difficulty);
    const sessionId = run.cookie.replace('ab_session=', '').split('.')[0]!;
    const board = await resolveBoardInstance(env, adapter, 'arcade', { difficulty });
    try {
      await env.DB.prepare(`
        UPDATE seasons SET state = 'archived' WHERE id = 'smilefall-launch-1'
      `).run();
      const consumed = await adapter.consumeChallengeStatement({
        env,
        runId: run.id,
        sessionId,
        entryId: 'score_closed_smilefall',
        board,
        at: new Date().toISOString(),
      }).run();
      expect(consumed.meta.changes).toBe(0);
    } finally {
      await env.DB.prepare(`
        UPDATE seasons SET state = 'active' WHERE id = 'smilefall-launch-1'
      `).run();
    }
  });
});

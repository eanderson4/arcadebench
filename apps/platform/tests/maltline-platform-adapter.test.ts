import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MALTLINE_CURRENT_CABINET_AUTHORITY as authority } from '@arcadebench/maltline/verifier';
import { buildMaltlineCabinetProof, verifyMaltlineCabinetProof } from '../../../games/maltline/src/core/cabinet-proof';
import { cabinetReplays } from '../../../games/maltline/tests/support/cabinet-fixtures';
import { maltlinePlatformAdapter as adapter, maltlineCabinetRankComponents } from '../src/maltline-platform-adapter';
import { registerGameAdapter } from '../src/shared/registry';
import { resolveBoardInstance } from '../src/shared/leaderboards';
import { PUBLICATION, V2_API, allowCallsign, workerFetch } from './support/partition-fixtures';

const API = `${V2_API}/games/maltline`;
const replay = cabinetReplays(false, authority);
const name = 'CABINET PILOT';

async function activateCabinet() {
  await env.DB.batch([
    env.DB.prepare("UPDATE seasons SET state = 'archived' WHERE game_id = 'maltline'"),
    env.DB.prepare("UPDATE seasons SET state = 'active' WHERE id = ?").bind(authority.seasonId),
  ]);
}
async function begin() {
  const response = await workerFetch(`${API}/runs`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
    body: JSON.stringify({ gameVersion: authority.gameVersion, boardId: 'arcade', context: {} }) });
  const body = await response.json() as { id: string; seed: number };
  expect(response.status, JSON.stringify(body)).toBe(201);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  return { runId: body.id, seed: body.seed, cookie, sessionId: cookie.replace('ab_session=', '').split('.')[0]! };
}
async function submit(run: Awaited<ReturnType<typeof begin>>, extra: Record<string, unknown> = {}) {
  const challenge = { runId: run.runId, nonce: run.seed };
  const proof = buildMaltlineCabinetProof(replay, challenge, authority.gameVersion);
  return workerFetch(`${API}/leaderboards/arcade`, { method: 'POST',
    headers: { 'content-type': 'application/json', cookie: run.cookie, 'cf-connecting-ip': '203.0.113.50' },
    body: JSON.stringify({ gameVersion: authority.gameVersion, runId: run.runId,
      playerName: name, score: verifyMaltlineCabinetProof(proof, challenge).summary,
      proof, publication: PUBLICATION, ...extra }) });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  registerGameAdapter(adapter);
  await allowCallsign(name);
  await activateCabinet();
});
beforeEach(activateCabinet);

describe('Maltline cabinet shared platform adapter', () => {
  it('publishes an activity deep link to the arcade Shift Board', () => {
    expect(adapter.describeBoard('arcade', {}).path)
      .toBe('/games/maltline/?mode=leaderboard&board=arcade');
  });

  it('rejects generation-two season and unsupported board context', async () => {
    await env.DB.prepare("UPDATE seasons SET state = 'archived' WHERE id = ?").bind(authority.seasonId).run();
    await env.DB.prepare("UPDATE seasons SET state = 'active' WHERE id = 'maltline-generation-2'").run();
    await expect(adapter.activeSeason(env)).rejects.toThrow(/not open/);
    expect(() => adapter.resolveBoard('arcade', { difficulty: 'easy' })).toThrow(/empty/);
    expect(() => adapter.resolveBoard('level', {})).toThrow(/not found/);
  });

  it('accepts a verified run through v2 and the common entry/archive/activity pipeline', async () => {
    const run = await begin();
    const response = await submit(run);
    const body = await response.json() as { entry: { id: string; gameId: string; result: unknown }; publication: unknown };
    expect(response.status, JSON.stringify(body)).toBe(201);
    expect(body.entry.gameId).toBe('maltline');
    expect(body.entry.result).toMatchObject({ score: 0, stageReached: 1, completed: false });
    expect(body.publication).toMatchObject({ rankAtSubmission: 1, replaySaved: true, expiresAt: null });
    const entry = await env.DB.prepare('SELECT * FROM leaderboard_entries WHERE id = ?').bind(body.entry.id).first();
    expect(entry).toMatchObject({ game_version: 'cabinet-2', rank_1: 0, rank_2: -1, rank_3: 0 });
    const activity = await workerFetch(`${V2_API}/activity?limit=50`);
    expect(await activity.text()).toContain('maltline');
    expect((await submit(run)).status).toBe(409);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM maltline_scores').first('count')).toBe(0);
  });

  it('rejects an old cabinet proof even when its challenge and first-stage result match', async () => {
    const run = await begin();
    const proof = buildMaltlineCabinetProof(cabinetReplays(false), { runId: run.runId, nonce: run.seed });
    expect((await submit(run, { proof })).status).toBe(400);
    expect(await env.DB.prepare('SELECT consumed_entry_id FROM shared_run_challenges WHERE id = ?')
      .bind(run.runId).first('consumed_entry_id')).toBeNull();
  });

  it('requires explicit valid publication policy and rejects inflated client score', async () => {
    const run = await begin();
    expect((await submit(run, { score: { score: 999999 } })).status).toBe(400);
    expect((await submit(run, { publication: { policyVersion: 'training-v1', socialMedia: false } })).status).toBe(400);
    const row = await env.DB.prepare('SELECT consumed_entry_id FROM shared_run_challenges WHERE id = ?').bind(run.runId).first();
    expect(row?.consumed_entry_id).toBeNull();
  });

  it('binds proof nonce and authenticated session without consuming failed runs', async () => {
    const run = await begin();
    const wrongProof = buildMaltlineCabinetProof(replay, { runId: run.runId, nonce: (run.seed + 1) >>> 0 }, authority.gameVersion);
    expect((await submit(run, { proof: wrongProof })).status).toBe(400);
    await expect(adapter.loadChallenge({ env, runId: run.runId, sessionId: 'another-session',
      gameVersion: authority.gameVersion, boardId: 'arcade' })).rejects.toThrow(/not found/);
  });

  it('checks expiry and season again at one-time SQL consumption', async () => {
    const run = await begin();
    const board = await resolveBoardInstance(env, adapter, 'arcade', {});
    const loaded = await adapter.loadChallenge({ env, runId: run.runId, sessionId: run.sessionId,
      boardId: 'arcade', gameVersion: authority.gameVersion });
    expect(loaded).toMatchObject({ boardKey: board.boardKey, seasonId: authority.seasonId, gameVersion: authority.gameVersion });
    await env.DB.prepare("UPDATE shared_run_challenges SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(run.runId).run();
    const expired = await adapter.consumeChallengeStatement({ env, runId: run.runId, sessionId: run.sessionId,
      entryId: 'score_expired', at: '1999-01-01T00:00:00.000Z', board }).run();
    expect(expired.meta.changes).toBe(0);
    await env.DB.prepare("UPDATE shared_run_challenges SET expires_at = '2099-01-01T00:00:00.000Z' WHERE id = ?").bind(run.runId).run();
    await env.DB.prepare("UPDATE seasons SET state = 'archived' WHERE id = ?").bind(authority.seasonId).run();
    const closed = await adapter.consumeChallengeStatement({ env, runId: run.runId, sessionId: run.sessionId,
      entryId: 'score_closed', at: new Date().toISOString(), board }).run();
    expect(closed.meta.changes).toBe(0);
  });

  it('rejects mismatched board identity before verification', async () => {
    const run = await begin();
    const board = await resolveBoardInstance(env, adapter, 'arcade', {});
    const challenge = await adapter.loadChallenge({ env, runId: run.runId, sessionId: run.sessionId,
      boardId: 'arcade', gameVersion: authority.gameVersion });
    expect(() => adapter.verifySubmission({ board, challenge: { ...challenge, seasonId: 'another-season' },
      score: {}, proof: {} })).toThrow(/does not match/);
  });

  it('preserves ranking priority across completed, progress, score, ticks and fulfilled ties', () => {
    const base = verifyMaltlineCabinetProof(buildMaltlineCabinetProof(replay, { runId: 'run_rank', nonce: 1 }, authority.gameVersion),
      { runId: 'run_rank', nonce: 1 }).summary;
    expect(maltlineCabinetRankComponents({ ...base, completed: true, stageReached: 8,
      score: 36255, totalTicks: 21662, fulfilled: 145 })).toEqual([-1, -8, -36255, 21662, -145, 0, 0, 0]);
    const compare = (a: number[], b: number[]) => a.findIndex((value, i) => value !== b[i]);
    for (const [better, worse, index] of [
      [{ completed: true }, { completed: false, score: 99999 }, 0],
      [{ stageReached: 3 }, { stageReached: 2, score: 99999 }, 1],
      [{ score: 100 }, { score: 99, totalTicks: 1 }, 2],
      [{ totalTicks: 100 }, { totalTicks: 101, fulfilled: 99 }, 3],
      [{ fulfilled: 10 }, { fulfilled: 9 }, 4],
    ] as const) {
      const a = maltlineCabinetRankComponents({ ...base, ...better });
      const b = maltlineCabinetRankComponents({ ...base, ...worse });
      expect(compare(a, b)).toBe(index);
      expect(a[index]!).toBeLessThan(b[index]!);
    }
  });

  it('verifies full-campaign and adversarial per-tick encodings identically in Workers', () => {
    const challenge = { runId: 'run_workers_cabinet_campaign', nonce: 123 };
    const proof = buildMaltlineCabinetProof(cabinetReplays(true, authority), challenge, authority.gameVersion);
    const segmented = { ...proof, stages: proof.stages.map(stage => ({ ...stage,
      inputRuns: stage.inputRuns.flatMap(({ ticks, ...input }) =>
        Array.from({ length: ticks }, () => ({ ticks: 1, ...input }))),
    })) };
    expect(segmented.stages.reduce((count, stage) => count + stage.inputRuns.length, 0)).toBe(21657);
    expect(new TextEncoder().encode(JSON.stringify(segmented)).byteLength).toBeLessThan(1_600_000);
    expect(verifyMaltlineCabinetProof(segmented, challenge))
      .toEqual(verifyMaltlineCabinetProof(proof, challenge));
  });
});

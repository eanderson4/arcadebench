import { describe, expect, it, vi } from 'vitest';
import { createArcadeBenchGameClient, type NormalizedSubmission } from '@arcadebench/sdk';
import { MALTLINE_CURRENT_CABINET_AUTHORITY as MALTLINE_CABINET_AUTHORITY } from '../src/core/cabinet-authorities';
import { MaltlineEngine } from '../src/core/engine';
import { replayMaltlineCabinet } from '../src/core/replay';
import { IDLE_INPUT } from '../src/core/types';
import type { MaltlineCabinetSummary } from '../src/core/cabinet-proof';
import {
  cabinetLeaderboardDeepLinkRequested,
  cabinetServicesEnabled,
  MaltlineCabinetLeaderboardSession,
} from '../src/viewer/cabinet-leaderboard';

const authority = MALTLINE_CABINET_AUTHORITY;
const engine = new MaltlineEngine(authority.campaign[0]!, authority.initialRun, 'two-button-v1');
const inputs = [];
while (engine.snapshot().status === 'running') {
  engine.setInput(IDLE_INPUT); inputs.push({ ...IDLE_INPUT }); engine.step();
}
const replay = replayMaltlineCabinet(authority.campaign[0]!, authority.initialRun, inputs);
const now = Date.parse('2026-09-15T12:00:00Z');
const challenge = { id: 'run_cabinet-challenge', seed: 12, gameVersion: 'cabinet-2', expiresAt: '2026-09-15T13:00:00Z' };
const summary: MaltlineCabinetSummary = { score: 0, lives: 0, stageReached: 1, stagesCleared: 0, completed: false,
  totalTicks: replay.finalState.tick, fulfilled: 0, serviceActions: 0, walkouts: 4, resolved: 4, exited: 0 };
const receipt: NormalizedSubmission<MaltlineCabinetSummary> = {
  entry: { id: 'entry-one', gameId: 'maltline', gameVersion: 'cabinet-2', board: { id: 'arcade', label: 'Cabinet', context: {} },
    playerName: 'Milk', result: summary, createdAt: '2026-09-15T12:30:00Z' },
  publication: { rankAtSubmission: 12, replaySaved: true, expiresAt: null },
};
function setup(responses: unknown[] = [challenge, receipt]) {
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(responses.shift());
  }) as unknown as typeof fetch;
  const client = createArcadeBenchGameClient({ gameId: 'maltline', gameVersion: 'cabinet-2', fetchImpl });
  return { session: new MaltlineCabinetLeaderboardSession(true, client, () => now), client, requests };
}

describe('shared cabinet leaderboard client', () => {
  it('recognizes only the authored arcade-board deep link and preserves unrelated query parameters', () => {
    expect(cabinetLeaderboardDeepLinkRequested({ search: '?mode=leaderboard&board=arcade' })).toBe(true);
    expect(cabinetLeaderboardDeepLinkRequested({ search: '?ranked=preview&mode=leaderboard&board=arcade' })).toBe(true);
    expect(cabinetLeaderboardDeepLinkRequested({ search: '?mode=leaderboard' })).toBe(false);
    expect(cabinetLeaderboardDeepLinkRequested({ search: '?mode=leaderboard&board=level' })).toBe(false);
    expect(cabinetLeaderboardDeepLinkRequested({ search: '?mode=play&board=arcade' })).toBe(false);
  });

  it('keeps local preview explicitly unranked unless opted into the dev API', async () => {
    expect(cabinetServicesEnabled({ hostname: 'arcadebench.org', search: '' }, false)).toBe(true);
    expect(cabinetServicesEnabled({ hostname: 'localhost', search: '' }, true)).toBe(false);
    expect(cabinetServicesEnabled({ hostname: '127.0.0.1', search: '?ranked=preview' }, false)).toBe(false);
    expect(cabinetServicesEnabled({ hostname: '127.0.0.1', search: '?ranked=preview' }, true)).toBe(true);
    const { client, requests } = setup();
    const local = new MaltlineCabinetLeaderboardSession(false, client, () => now);
    await local.startAttempt(); local.lockForPlay(); local.complete([replay]);
    expect(local.rankEligible()).toBe(false); expect(local.terminal).toBeNull(); expect(requests).toEqual([]);
  });

  for (const socialMedia of [false, true]) {
    it(`submits the terminal cabinet proof with explicit social choice ${socialMedia}`, async () => {
      const { session, requests } = setup();
      await session.startAttempt(); session.lockForPlay(); session.complete([replay]);
      expect(session.terminal).not.toBeNull();
      expect(await session.submit(' Milk ', socialMedia)).toEqual(receipt);
      expect(requests[0]).toEqual({ url: '/api/v2/games/maltline/runs',
        body: { gameVersion: 'cabinet-2', boardId: 'arcade', context: {} } });
      expect(requests[1]!.body).toMatchObject({ gameVersion: 'cabinet-2', runId: challenge.id, playerName: 'Milk',
        proof: { gameId: 'maltline', gameVersion: 'cabinet-2', challenge: { runId: challenge.id, nonce: challenge.seed } },
        publication: { policyVersion: 'top50-social-v1', socialMedia } });
      await expect(session.submit('Milk', !socialMedia)).rejects.toThrow('not available');
    });
  }

  for (const invalid of [
    { ...challenge, gameVersion: '2' }, { ...challenge, seed: '12' },
    { ...challenge, seed: -1 }, { ...challenge, expiresAt: '2026-09-15T11:00:00Z' },
  ]) it('rejects an invalid or expired challenge before gameplay is ranked', async () => {
    const { session } = setup([invalid]); await session.startAttempt();
    expect(session.challengeStatus).toBe('unavailable'); expect(session.rankEligible()).toBe(false);
  });

  it('never upgrades an unranked run when the challenge arrives late', async () => {
    const { client } = setup();
    let resolve!: (value: typeof challenge) => void;
    client.runs.begin = () => new Promise(r => { resolve = r; });
    const session = new MaltlineCabinetLeaderboardSession(true, client, () => now);
    const pending = session.startAttempt(); session.lockForPlay(); resolve(challenge); await pending;
    expect(session.rankEligible()).toBe(false); expect(session.challengeStatus).toBe('unavailable');
  });

  it('ignores an old attempt response and clears submission state on a new run', async () => {
    const { session } = setup([challenge, receipt, challenge]);
    await session.startAttempt(); session.lockForPlay(); session.complete([replay]); await session.submit('Milk', true);
    await session.startAttempt();
    expect(session.submitted).toBeNull(); expect(session.terminal).toBeNull(); expect(session.rankEligible()).toBe(true);
  });

  it('rejects partial runs and invalidated timing', async () => {
    const { session } = setup(); await session.startAttempt(); session.lockForPlay();
    session.complete([replayMaltlineCabinet(authority.campaign[0]!, authority.initialRun, [IDLE_INPUT])]);
    expect(session.rankEligible()).toBe(false); expect(session.terminal).toBeNull();
    const other = setup().session; await other.startAttempt(); other.lockForPlay(); other.invalidate('Focus lost');
    other.complete([replay]); await expect(other.submit('Milk', false)).rejects.toThrow('not available');
  });

  it('uses the normalized board response and rejects a generation-2 entry', async () => {
    const { session, requests } = setup([{ entries: [receipt.entry] }, { entries: [{ ...receipt.entry, gameVersion: '2' }] }]);
    expect(await session.list()).toEqual([receipt.entry]);
    expect(requests[0]!.url).toBe('/api/v2/games/maltline/leaderboards/arcade?limit=50');
    await expect(session.list()).rejects.toThrow('invalid leaderboard');
  });

  it('does not claim archival success for inconsistent publication metadata', async () => {
    const { session } = setup([challenge, { ...receipt, publication: { rankAtSubmission: 51, replaySaved: true, expiresAt: null } }]);
    await session.startAttempt(); session.lockForPlay(); session.complete([replay]);
    await expect(session.submit('Milk', false)).rejects.toThrow('invalid score receipt');
    expect(session.submitted).toBeNull(); expect(session.submitting).toBe(false);
  });
});

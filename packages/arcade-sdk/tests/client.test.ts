import { describe, expect, it } from 'vitest';
import { ArcadeBenchApiError, createArcadeBenchClient } from '../src';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ArcadeBenchClient', () => {
  it('calls the default browser fetch with its global receiver', async () => {
    const originalFetch = globalThis.fetch;
    let receiver: unknown;
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(jsonResponse({
        id: 'run-browser',
        seed: 17,
        gameVersion: 'dev-0',
        expiresAt: '2026-08-22T18:00:00Z',
      }));
    } as typeof fetch;

    try {
      const client = createArcadeBenchClient({ gameId: 'partition', gameVersion: 'dev-0' });
      const run = await client.runs.begin({ boardId: 'arcade' });

      expect(run.id).toBe('run-browser');
      expect(receiver).toBe(globalThis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('lists a game leaderboard with stable generic filters', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = createArcadeBenchClient({
      gameId: 'partition',
      gameVersion: 'dev-0',
      baseUrl: '/api/v1',
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return jsonResponse({ entries: [{ name: 'SPARK' }] });
      },
    });

    const page = await client.leaderboards.list<{ name: string }>({
      boardId: 'level',
      filters: { levelId: 'first-light', difficulty: 'medium' },
      limit: 10,
    });

    expect(page.entries).toEqual([{ name: 'SPARK' }]);
    expect(requests[0]?.url).toBe('/api/v1/games/partition/leaderboards/level?limit=10&filter.difficulty=medium&filter.levelId=first-light');
    expect(new Headers(requests[0]?.init?.headers).get('x-arcadebench-client')).toBe('0.1.0');
  });

  it('submits game-owned score and proof without any platform credential', async () => {
    let request: RequestInit | undefined;
    const client = createArcadeBenchClient({
      gameId: 'partition',
      gameVersion: 'dev-0',
      fetchImpl: async (_url, init) => {
        request = init;
        return jsonResponse({ entry: { id: 'score-1' } });
      },
    });

    await client.leaderboards.submit({
      boardId: 'arcade',
      runId: 'run-7',
      playerName: 'SPARK',
      score: { stageReached: 7 },
      proof: { replay: 'opaque-to-sdk' },
    });

    expect(request?.credentials).toBe('same-origin');
    expect(JSON.parse(String(request?.body))).toEqual({
      gameVersion: 'dev-0',
      runId: 'run-7',
      playerName: 'SPARK',
      score: { stageReached: 7 },
      proof: { replay: 'opaque-to-sdk' },
    });
    expect(new Headers(request?.headers).has('authorization')).toBe(false);
  });

  it('starts a one-time ranked run challenge', async () => {
    let body: unknown;
    const client = createArcadeBenchClient({
      gameId: 'partition',
      gameVersion: 'dev-0',
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ id: 'run-7', seed: 71, gameVersion: 'dev-0', expiresAt: '2026-08-18T00:00:00Z' });
      },
    });

    const run = await client.runs.begin({
      boardId: 'level',
      context: { levelId: 'event-horizon', difficulty: 'hard' },
    });

    expect(run.id).toBe('run-7');
    expect(body).toEqual({
      gameVersion: 'dev-0',
      boardId: 'level',
      context: { levelId: 'event-horizon', difficulty: 'hard' },
    });
  });

  it('supports social voting on game-owned levels', async () => {
    let url = '';
    let request: RequestInit | undefined;
    const client = createArcadeBenchClient({
      gameId: 'partition',
      gameVersion: 'dev-0',
      fetchImpl: async (input, init) => {
        url = String(input);
        request = init;
        return jsonResponse({ up: 8, down: 1, score: 7, viewerVote: 1 });
      },
    });

    const vote = await client.social.vote({ kind: 'level', id: 'event-horizon' }, 1);

    expect(url).toBe('/api/v1/games/partition/votes/level/event-horizon');
    expect(request?.method).toBe('PUT');
    expect(vote.score).toBe(7);
  });

  it('returns safe typed API failures', async () => {
    const client = createArcadeBenchClient({
      gameId: 'partition',
      gameVersion: 'dev-0',
      fetchImpl: async () => jsonResponse({ error: 'Callsign rejected.' }, 400),
    });

    await expect(client.leaderboards.list({ boardId: 'arcade' })).rejects.toEqual(
      new ArcadeBenchApiError(400, 'Callsign rejected.'),
    );
  });
});

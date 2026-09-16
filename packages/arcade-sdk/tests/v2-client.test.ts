import { describe, expect, it } from 'vitest';
import {
  ARCADEBENCH_PUBLICATION_POLICY_VERSION,
  ARCADEBENCH_V2_BASE_URL,
  ArcadeBenchApiError,
  createArcadeBenchGameClient,
  createArcadeBenchPlatformClient,
} from '../src';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Recorded {
  url: string;
  init: RequestInit;
  headers: Headers;
  body: unknown;
}

function recorder(response: () => Response = () => jsonResponse({})): {
  requests: Recorded[];
  fetchImpl: typeof fetch;
} {
  const requests: Recorded[] = [];
  return {
    requests,
    fetchImpl: async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        init: init ?? {},
        headers,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return response();
    },
  };
}

describe('ArcadeBenchGameClient', () => {
  it('defaults to the v2 protocol and keeps the game credential free', async () => {
    const client = createArcadeBenchGameClient({ gameId: 'partition', gameVersion: '0.1.0' });
    expect(ARCADEBENCH_V2_BASE_URL).toBe('/api/v2');
    expect(ARCADEBENCH_PUBLICATION_POLICY_VERSION).toBe('top50-social-v1');
    expect(client).toBeTruthy();
  });

  it('starts a ranked run with the same one-time challenge contract', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse({
      id: 'run-1',
      seed: 41,
      gameVersion: '0.1.0',
      expiresAt: '2026-09-16T00:00:00.000Z',
    }));
    const client = createArcadeBenchGameClient({
      gameId: 'partition',
      gameVersion: '0.1.0',
      fetchImpl,
    });
    const run = await client.runs.begin({
      boardId: 'level',
      context: { levelId: 'event-horizon', difficulty: 'hard' },
    });

    expect(run.id).toBe('run-1');
    expect(requests[0]?.url).toBe('/api/v2/games/partition/runs');
    expect(requests[0]?.init.method).toBe('POST');
    expect(requests[0]?.init.credentials).toBe('same-origin');
    expect(requests[0]?.headers.get('x-arcadebench-client')).toBe('0.1.0');
    expect(requests[0]?.headers.has('authorization')).toBe(false);
    expect(requests[0]?.body).toEqual({
      gameVersion: '0.1.0',
      boardId: 'level',
      context: { levelId: 'event-horizon', difficulty: 'hard' },
    });
  });

  it('lists normalized entries with sorted generic filters', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse({ entries: [] }));
    const client = createArcadeBenchGameClient({
      gameId: 'partition',
      gameVersion: '0.1.0',
      fetchImpl,
    });
    await client.leaderboards.list({
      boardId: 'level',
      filters: { levelId: 'first-light', difficulty: 'medium' },
      limit: 10,
      cursor: 'offset:10',
    });

    expect(requests[0]?.url).toBe(
      '/api/v2/games/partition/leaderboards/level?limit=10&cursor=offset%3A10&filter.difficulty=medium&filter.levelId=first-light',
    );
    expect(requests[0]?.init.method).toBeUndefined();
    expect(requests[0]?.headers.has('authorization')).toBe(false);
  });

  it('submits the opaque score and proof with an explicit publication decision', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse({
      entry: { id: 'score-1', gameId: 'partition' },
      publication: { rankAtSubmission: 3, replaySaved: true, expiresAt: null },
    }, 201));
    const client = createArcadeBenchGameClient({
      gameId: 'partition',
      gameVersion: '0.1.0',
      fetchImpl,
    });
    const submitted = await client.leaderboards.submit<{ stageReached: number }, { replays: string[] }>({
      boardId: 'arcade',
      runId: 'run-7',
      playerName: 'SPARK',
      score: { stageReached: 7 },
      proof: { replays: ['opaque-to-sdk'] },
      publication: { policyVersion: 'top50-social-v1', socialMedia: false },
    });

    expect(submitted.publication).toEqual({ rankAtSubmission: 3, replaySaved: true, expiresAt: null });
    expect(requests[0]?.url).toBe('/api/v2/games/partition/leaderboards/arcade');
    expect(requests[0]?.body).toEqual({
      gameVersion: '0.1.0',
      runId: 'run-7',
      playerName: 'SPARK',
      score: { stageReached: 7 },
      proof: { replays: ['opaque-to-sdk'] },
      publication: { policyVersion: 'top50-social-v1', socialMedia: false },
    });
    // The publication object is required: nothing is defaulted in the client.
    expect(Object.keys(requests[0]?.body as Record<string, unknown>)).toContain('publication');
    expect(requests[0]?.headers.has('authorization')).toBe(false);
    expect(requests[0]?.init.credentials).toBe('same-origin');
  });

  it('reads and writes feedback on a registered channel', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse({
      up: 4,
      down: 1,
      score: 3,
      viewerVote: 1,
      note: 'private text',
      noteExpiresAt: '2026-12-14T00:00:00.000Z',
    }));
    const client = createArcadeBenchGameClient({
      gameId: 'partition',
      gameVersion: '0.1.0',
      fetchImpl,
    });

    const summary = await client.feedback.get({
      subject: { kind: 'level', id: 'first-light' },
      channel: 'overall',
    });
    expect(summary.note).toBe('private text');
    expect(requests[0]?.url).toBe(
      '/api/v2/games/partition/feedback/level/first-light?channel=overall',
    );
    expect(requests[0]?.init.method).toBeUndefined();

    await client.feedback.set({
      subject: { kind: 'level', id: 'first-light' },
      vote: -1,
    });
    // An omitted note is truly omitted, so the server preserves the stored one.
    expect(requests[1]?.body).toEqual({ gameVersion: '0.1.0', vote: -1 });
    expect(requests[1]?.init.method).toBe('PUT');

    await client.feedback.set({
      subject: { kind: 'game', id: 'partition' },
      channel: 'overall',
      vote: 0,
      note: '',
    });
    expect(requests[2]?.url).toBe('/api/v2/games/partition/feedback/game/partition?channel=overall');
    expect(requests[2]?.body).toEqual({ gameVersion: '0.1.0', vote: 0, note: '' });
    expect(requests[2]?.headers.has('authorization')).toBe(false);
  });

  it('forwards an explicit replay share request', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse({
      id: 'replay_1',
      url: 'https://arcadebench.org/r/replay_1',
      expiresAt: '2026-09-20T00:00:00.000Z',
    }, 201));
    const client = createArcadeBenchGameClient({
      gameId: 'partition',
      gameVersion: '0.1.0',
      fetchImpl,
    });
    await client.replays.publish({ replay: { version: 1 } });

    expect(requests[0]?.url).toBe('/api/v2/games/partition/replays');
    expect(requests[0]?.body).toEqual({
      gameVersion: '0.1.0',
      replay: { version: 1 },
      expiresInDays: 5,
    });
    expect(requests[0]?.headers.has('authorization')).toBe(false);
  });

  it('escapes identifiers in the path and reports typed failures', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse(
      { error: 'Publication policy contains unsupported fields.' },
      400,
    ));
    const client = createArcadeBenchGameClient({
      gameId: 'partition',
      gameVersion: '0.1.0',
      fetchImpl,
    });
    await expect(client.feedback.get({ subject: { kind: 'level', id: 'first light' } }))
      .rejects.toEqual(new ArcadeBenchApiError(400, 'Publication policy contains unsupported fields.'));
    expect(requests[0]?.url).toBe('/api/v2/games/partition/feedback/level/first%20light');
  });
});

describe('ArcadeBenchPlatformClient', () => {
  it('reads one global activity stream without a game or a credential', async () => {
    const { requests, fetchImpl } = recorder(() => jsonResponse({
      protocolVersion: 1,
      entries: [{
        id: 'event_1',
        type: 'leaderboard.qualified',
        entryId: 'score_1',
        gameId: 'partition',
        gameTitle: 'Partition',
        board: { id: 'level', label: 'First Light · Medium', context: { difficulty: 'medium' } },
        playerName: 'SPARK',
        rankAtSubmission: 8,
        occurredAt: '2026-09-15T10:00:00.000Z',
        leaderboardPath: '/games/partition/?board=level',
      }],
    }));
    const platform = createArcadeBenchPlatformClient({ fetchImpl });

    const page = await platform.activity.list({ limit: 8 });
    expect(page.protocolVersion).toBe(1);
    expect(page.entries[0]?.gameTitle).toBe('Partition');
    expect(requests[0]?.url).toBe('/api/v2/activity?limit=8');
    expect(requests[0]?.init.credentials).toBe('same-origin');
    expect(requests[0]?.headers.has('authorization')).toBe(false);

    const filtered = await createArcadeBenchPlatformClient({ fetchImpl }).activity.list();
    expect(filtered).toBeTruthy();
    expect(requests[1]?.url).toBe('/api/v2/activity');

    await platform.activity.list({ limit: 50, cursor: 'abc', gameId: 'partition' });
    expect(requests[2]?.url).toBe('/api/v2/activity?limit=50&cursor=abc&gameId=partition');
  });
});

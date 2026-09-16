import { describe, expect, it } from 'vitest';
import type { SmilefallGameClient } from '../src/viewer/game-client';
import {
  LocalLeaderboardStore,
  SmilefallLeaderboardService,
  type SmilefallLeaderboardResult,
} from '../src/viewer/leaderboard';

const RESULT: SmilefallLeaderboardResult = {
  scope: 'arcade',
  difficulty: 'chuckle',
  completed: true,
  stageReached: 10,
  stagesCleared: 10,
  score: 12_000,
  totalTicks: 4_200,
  popped: 2,
};

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

describe('Smilefall leaderboard presentation', () => {
  it('shows an accepted score even while the board GET is still stale', async () => {
    const stalePage = { entries: [], nextCursor: null };
    const accepted = {
      id: 'entry-new',
      gameId: 'smilefall',
      gameVersion: '1.0.0',
      board: { id: 'arcade', label: 'Arcade Run', context: { difficulty: 'chuckle' } },
      playerName: 'SUNBEAM',
      result: RESULT,
      createdAt: '2026-09-16T18:00:00.000Z',
    };
    const client = {
      leaderboards: {
        list: async () => stalePage,
        submit: async () => ({
          entry: accepted,
          publication: { rankAtSubmission: 1, replaySaved: true, expiresAt: null },
        }),
      },
    } as unknown as SmilefallGameClient;
    const service = new SmilefallLeaderboardService(new LocalLeaderboardStore(memoryStorage()), client);

    await expect(service.list({ scope: 'arcade', difficulty: 'chuckle' })).resolves.toEqual([]);
    await service.submit({
      name: 'SUNBEAM',
      result: RESULT,
      proof: { replay: true },
      runId: 'run-1',
      socialMedia: false,
    });

    await expect(service.list({ scope: 'arcade', difficulty: 'chuckle' })).resolves.toEqual([
      { id: accepted.id, name: accepted.playerName, createdAt: accepted.createdAt, result: RESULT },
    ]);
  });
});

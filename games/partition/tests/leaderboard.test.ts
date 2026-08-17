import { describe, expect, it } from 'vitest';
import {
  elapsedMilliseconds,
  LocalLeaderboardStore,
  rankLeaderboardEntries,
  reviewPlayerName,
  type LeaderboardEntry,
} from '../src/viewer/leaderboard';

function arcade(overrides: Partial<LeaderboardEntry> & { id: string }): LeaderboardEntry {
  const { id, ...rest } = overrides;
  return {
    id,
    scope: 'arcade',
    name: 'PLAYER',
    difficulty: 'medium',
    elapsedMs: 60_000,
    partitions: 8,
    createdAt: '2026-08-17T00:00:00.000Z',
    stageReached: 4,
    stagesCleared: 3,
    completed: false,
    ...rest,
  } as LeaderboardEntry;
}

describe('Partition leaderboard', () => {
  it('ranks arcade runs by stage reached and then fastest time', () => {
    const ranked = rankLeaderboardEntries([
      arcade({ id: 'slow', elapsedMs: 90_000 }),
      arcade({ id: 'far', stageReached: 7, elapsedMs: 150_000 }),
      arcade({ id: 'fast', elapsedMs: 45_000 }),
    ], { scope: 'arcade', difficulty: 'medium' });
    expect(ranked.map((entry) => entry.id)).toEqual(['far', 'fast', 'slow']);
  });

  it('puts a completed final stage above a loss on that stage', () => {
    const ranked = rankLeaderboardEntries([
      arcade({ id: 'lost-ten', stageReached: 10, stagesCleared: 9, elapsedMs: 30_000 }),
      arcade({ id: 'won-ten', stageReached: 10, stagesCleared: 10, completed: true, elapsedMs: 80_000 }),
    ], { scope: 'arcade', difficulty: 'medium' });
    expect(ranked.map((entry) => entry.id)).toEqual(['won-ten', 'lost-ten']);
  });

  it('ranks field wins before attempts and retains partition counts', () => {
    const entries: LeaderboardEntry[] = [
      {
        id: 'attempt', scope: 'level', name: 'TRY', difficulty: 'hard', elapsedMs: 20_000,
        partitions: 4, createdAt: '2026-08-17T00:00:00.000Z', levelId: 'first-light',
        levelNumber: 1, levelTitle: 'First Light', won: false, capturedFraction: 0.57,
      },
      {
        id: 'win', scope: 'level', name: 'ACE', difficulty: 'hard', elapsedMs: 35_000,
        partitions: 2, createdAt: '2026-08-17T00:00:00.000Z', levelId: 'first-light',
        levelNumber: 1, levelTitle: 'First Light', won: true, capturedFraction: 0.62,
      },
    ];
    const ranked = rankLeaderboardEntries(entries, { scope: 'level', difficulty: 'hard', levelId: 'first-light' });
    expect(ranked.map((entry) => entry.id)).toEqual(['win', 'attempt']);
    expect(ranked[0]?.partitions).toBe(2);
  });

  it('normalizes safe names and rejects unsuitable public names', () => {
    expect(reviewPlayerName('  Spark   Pilot  ')).toEqual({ allowed: true, normalizedName: 'Spark Pilot' });
    expect(reviewPlayerName('https://spam.test').allowed).toBe(false);
    expect(reviewPlayerName('shit').allowed).toBe(false);
    expect(reviewPlayerName('12345678901234567').allowed).toBe(false);
  });

  it('persists valid scores and ignores corrupt storage records', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const store = new LocalLeaderboardStore(storage);
    store.submit('Nova', {
      scope: 'arcade', difficulty: 'easy', elapsedMs: 50_000, partitions: 3,
      stageReached: 2, stagesCleared: 1, completed: false,
    });
    expect(store.list({ scope: 'arcade', difficulty: 'easy' })[0]?.name).toBe('Nova');
    values.set('arcadebench.partition.leaderboard.v1', JSON.stringify([{ nope: true }]));
    expect(store.list({ scope: 'arcade', difficulty: 'easy' })).toEqual([]);
  });

  it('sums deterministic stage tick durations', () => {
    expect(elapsedMilliseconds([
      { levelId: 'one', levelNumber: 1, levelTitle: 'One', won: true, elapsedTicks: 45, ticksPerSecond: 30, partitions: 1, capturedFraction: 0.6 },
      { levelId: 'two', levelNumber: 2, levelTitle: 'Two', won: false, elapsedTicks: 75, ticksPerSecond: 30, partitions: 2, capturedFraction: 0.4 },
    ])).toBe(4_000);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { NormalizedScoreEntry, PartitionGameClient } from '../src/viewer/game-client';
import {
  adaptLeaderboardEntry,
  adaptPublication,
  elapsedMilliseconds,
  LeaderboardService,
  LocalLeaderboardStore,
  publicationFor,
  rankLeaderboardEntries,
  reviewPlayerName,
  RunConsent,
  submissionOutcomeMessage,
  TOP50_SOCIAL_POLICY_VERSION,
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
    expect(reviewPlayerName('4uck').allowed).toBe(false);
    expect(reviewPlayerName('f_u_c_k').allowed).toBe(false);
    expect(reviewPlayerName('sh1t').allowed).toBe(false);
    expect(reviewPlayerName(`safe\u200bname`).allowed).toBe(false);
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

function arcadeResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scope: 'arcade',
    difficulty: 'medium',
    stageReached: 4,
    stagesCleared: 3,
    completed: false,
    elapsedMs: 60_000,
    partitions: 8,
    ...overrides,
  };
}

function normalizedEntry<Result>(result: Result): NormalizedScoreEntry<Result> {
  return {
    id: 'entry-1',
    gameId: 'partition',
    gameVersion: '1.0.0',
    board: { id: 'arcade', label: 'Arcade run', context: { difficulty: 'medium' } },
    playerName: 'NOVA',
    result,
    createdAt: '2026-08-17T00:00:00.000Z',
  };
}

describe('Partition platform submission', () => {
  it('adapts a normalized arcade entry onto the game view model', () => {
    expect(adaptLeaderboardEntry(normalizedEntry(arcadeResult()))).toEqual({
      id: 'entry-1',
      name: 'NOVA',
      createdAt: '2026-08-17T00:00:00.000Z',
      scope: 'arcade',
      difficulty: 'medium',
      stageReached: 4,
      stagesCleared: 3,
      completed: false,
      elapsedMs: 60_000,
      partitions: 8,
    });
  });

  it('adapts a normalized field entry and keeps its authored identity', () => {
    const adapted = adaptLeaderboardEntry(normalizedEntry({
      scope: 'level',
      difficulty: 'hard',
      levelId: 'first-light',
      levelNumber: 1,
      levelTitle: 'First Light',
      won: true,
      capturedFraction: 0.62,
      elapsedMs: 35_000,
      partitions: 2,
    }));
    expect(adapted).toMatchObject({
      scope: 'level',
      name: 'NOVA',
      levelId: 'first-light',
      levelNumber: 1,
      levelTitle: 'First Light',
      won: true,
      partitions: 2,
    });
  });

  it('drops a normalized entry whose verified result is unusable', () => {
    expect(adaptLeaderboardEntry(normalizedEntry(arcadeResult({ difficulty: 'nightmare' })))).toBeNull();
    expect(adaptLeaderboardEntry(normalizedEntry(arcadeResult({ elapsedMs: -1 })))).toBeNull();
    expect(adaptLeaderboardEntry(normalizedEntry(arcadeResult({ scope: 'level' })))).toBeNull();
    expect(adaptLeaderboardEntry(normalizedEntry('not-a-result'))).toBeNull();
    expect(adaptLeaderboardEntry(normalizedEntry(null))).toBeNull();
    expect(adaptLeaderboardEntry(null)).toBeNull();
    // The envelope owns identity: a result cannot rename or re-time an entry.
    expect(adaptLeaderboardEntry({
      ...normalizedEntry(arcadeResult()),
      playerName: '',
    })).toBeNull();
  });

  it('reads the publication envelope defensively', () => {
    expect(adaptPublication({ rankAtSubmission: 12, replaySaved: true, expiresAt: null }))
      .toEqual({ rankAtSubmission: 12, replaySaved: true, expiresAt: null });
    expect(adaptPublication({ rankAtSubmission: 51, replaySaved: false, expiresAt: '2026-09-20T00:00:00.000Z' }))
      .toEqual({ rankAtSubmission: 51, replaySaved: false, expiresAt: '2026-09-20T00:00:00.000Z' });
    expect(adaptPublication({ rankAtSubmission: 0, replaySaved: true, expiresAt: null })).toBeNull();
    expect(adaptPublication({ rankAtSubmission: 12, replaySaved: 'yes' })).toBeNull();
    expect(adaptPublication({ rankAtSubmission: 12, replaySaved: true, expiresAt: 'soon' })).toBeNull();
    expect(adaptPublication(undefined)).toBeNull();
  });

  it('serializes the social choice for every public submission', () => {
    // Declining is still a decision, so the policy object is always present.
    expect(publicationFor(false)).toEqual({
      policyVersion: TOP50_SOCIAL_POLICY_VERSION,
      socialMedia: false,
    });
    expect(publicationFor(true)).toEqual({
      policyVersion: TOP50_SOCIAL_POLICY_VERSION,
      socialMedia: true,
    });
    expect(Object.keys(publicationFor(false)).sort()).toEqual(['policyVersion', 'socialMedia']);
  });

  it('starts every run unchecked and clears the choice afterwards', () => {
    const consent = new RunConsent();
    expect(consent.allowed).toBe(false);
    expect(consent.publication().socialMedia).toBe(false);
    consent.set(true);
    expect(consent.allowed).toBe(true);
    expect(consent.publication().socialMedia).toBe(true);
    // The next run never inherits the last one's permission.
    consent.reset();
    expect(consent.allowed).toBe(false);
    expect(consent.publication()).toEqual(publicationFor(false));
    // Only a deliberate true is consent; anything else declines.
    consent.set('yes' as unknown as boolean);
    expect(consent.publication().socialMedia).toBe(false);
  });

  it('preserves the local store when no platform client is connected', async () => {
    const values = new Map<string, string>();
    const service = new LeaderboardService(new LocalLeaderboardStore({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    }));
    expect(service.mode).toBe('local');
    const submitted = await service.submit('Nova', {
      scope: 'arcade', difficulty: 'easy', elapsedMs: 50_000, partitions: 3,
      stageReached: 2, stagesCleared: 1, completed: false,
    }, { replays: [] });
    expect(submitted.publication).toBeNull();
    expect(submitted.entry.name).toBe('Nova');
    expect(await service.list({ scope: 'arcade', difficulty: 'easy' })).toEqual([submitted.entry]);
  });

  it('maps a normalized page onto view models while preserving server order', async () => {
    const list = vi.fn(async () => ({
      entries: [
        normalizedEntry(arcadeResult({ elapsedMs: 90_000, stageReached: 3 })),
        { ...normalizedEntry(arcadeResult({ elapsedMs: 40_000, stageReached: 6 })), id: 'entry-2' },
        { ...normalizedEntry(arcadeResult({ elapsedMs: 0, stageReached: 'many' })), id: 'entry-3' },
        { ...normalizedEntry(arcadeResult({ difficulty: 'impossible' })), id: 'entry-4' },
      ],
    }));
    const service = new LeaderboardService(
      new LocalLeaderboardStore({ getItem: () => null, setItem: () => {} }),
      { leaderboards: { list, submit: vi.fn() } } as unknown as PartitionGameClient,
    );
    expect(service.mode).toBe('public');
    const ranked = await service.list({ scope: 'arcade', difficulty: 'medium' }, 10);
    expect(list).toHaveBeenCalledWith({
      boardId: 'arcade',
      filters: { difficulty: 'medium' },
      limit: 10,
    });
    // The unreadable result and the other difficulty are dropped, not shown.
    expect(ranked.map((entry) => entry.id)).toEqual(['entry-1', 'entry-2']);
  });

  it('preserves authoritative binary ID ordering when all score and timestamp components tie', async () => {
    const entries = ['score_Z', 'score_a'].map(id => ({ ...normalizedEntry(arcadeResult()), id }));
    const service = new LeaderboardService(
      new LocalLeaderboardStore({ getItem: () => null, setItem: () => {} }),
      { leaderboards: { list: async () => ({ entries }), submit: vi.fn() } } as unknown as PartitionGameClient,
    );
    expect((await service.list({ scope: 'arcade', difficulty: 'medium' })).map(entry => entry.id))
      .toEqual(['score_Z', 'score_a']);
  });

  it('sends the publication object and reports back what was actually decided', async () => {
    const submit = vi.fn(async () => ({
      entry: normalizedEntry(arcadeResult()),
      publication: { rankAtSubmission: 7, replaySaved: true, expiresAt: null },
    }));
    const service = new LeaderboardService(
      new LocalLeaderboardStore({ getItem: () => null, setItem: () => {} }),
      { leaderboards: { list: vi.fn(), submit } } as unknown as PartitionGameClient,
    );
    const consent = new RunConsent();
    const draft = {
      scope: 'arcade' as const, difficulty: 'medium' as const, elapsedMs: 60_000, partitions: 8,
      stageReached: 4, stagesCleared: 3, completed: false,
    };
    const proof = { replays: [] };

    const declined = await service.submit('Nova', draft, proof, { runId: 'run-1', consent });
    expect(submit).toHaveBeenLastCalledWith({
      boardId: 'arcade',
      runId: 'run-1',
      playerName: 'Nova',
      score: draft,
      proof,
      publication: { policyVersion: TOP50_SOCIAL_POLICY_VERSION, socialMedia: false },
    });
    expect(declined.publication).toEqual({ rankAtSubmission: 7, replaySaved: true, expiresAt: null });
    expect(declined.entry.name).toBe('NOVA');

    consent.set(true);
    await service.submit('Nova', draft, proof, { runId: 'run-1', consent });
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publication: { policyVersion: TOP50_SOCIAL_POLICY_VERSION, socialMedia: true },
      }),
    );
  });

  it('keeps the submission result brief while the privacy page owns retention details', () => {
    const entry = adaptLeaderboardEntry(normalizedEntry(arcadeResult()))!;
    const outcome = (
      replaySaved: boolean,
      expiresAt: string | null,
      rankAtSubmission = 7,
    ) => submissionOutcomeMessage(
      { entry, publication: { rankAtSubmission, replaySaved, expiresAt } },
      'public',
    );
    expect(outcome(true, null)).toBe('SCORE SAVED');
    expect(outcome(false, '2026-09-20T00:00:00.000Z')).toBe('SCORE SAVED');
    expect(outcome(false, null)).toBe('SCORE SAVED');
    expect(outcome(true, null, 1)).toBe('SCORE SAVED');
    expect(submissionOutcomeMessage({ entry, publication: null }, 'public')).toBe('SCORE SAVED');
    // The local store never speaks for the platform.
    expect(submissionOutcomeMessage({ entry, publication: null }, 'local'))
      .toBe('SCORE SAVED ON THIS DEVICE');
  });

  it('refuses to submit publicly without a challenge or a readable entry', async () => {
    const submit = vi.fn(async () => ({
      entry: { ...normalizedEntry(arcadeResult()), id: 'entry-1', result: { scope: 'arcade' } },
      publication: { rankAtSubmission: 7, replaySaved: true, expiresAt: null },
    }));
    const service = new LeaderboardService(
      new LocalLeaderboardStore({ getItem: () => null, setItem: () => {} }),
      { leaderboards: { list: vi.fn(), submit } } as unknown as PartitionGameClient,
    );
    const draft = {
      scope: 'arcade' as const, difficulty: 'medium' as const, elapsedMs: 60_000, partitions: 8,
      stageReached: 4, stagesCleared: 3, completed: false,
    };
    await expect(service.submit('Nova', draft, { replays: [] })).rejects
      .toThrow('This was an unranked run. Start a new ranked attempt.');
    expect(submit).not.toHaveBeenCalled();
    await expect(service.submit('Nova', draft, { replays: [] }, { runId: 'run-1' })).rejects
      .toThrow('Leaderboard returned an invalid score.');
  });
});

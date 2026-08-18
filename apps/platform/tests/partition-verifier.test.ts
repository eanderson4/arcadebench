import { describe, expect, it } from 'vitest';
import {
  ContinuousPartitionSession,
  PartitionEngine,
  applyDifficulty,
  createPartitionCampaign,
  resolvePartitionProgression,
  type PartitionReplay,
  type PartitionScenario,
} from '@arcadebench/partition';
import { verifyPartitionReplay, verifyRankedScore } from '../src/partition-verifier';

function losingReplay(scenario: PartitionScenario): PartitionReplay {
  const session = new ContinuousPartitionSession(new PartitionEngine(scenario));
  while (session.engine.snapshot().status === 'running') session.tick();
  return session.replay();
}

describe('authoritative Partition replay verification', () => {
  it('reconstructs a canonical replay and its partition count', () => {
    const level = createPartitionCampaign(71)[0]!;
    const replay = losingReplay(applyDifficulty(level.scenario, 'medium'));

    const verified = verifyPartitionReplay(replay);

    expect(verified.finalState).toEqual(replay.finalState);
    expect(verified.finalState.status).toBe('lost');
    expect(verified.partitions).toBe(0);
  });

  it('rejects tampered final state and continued terminal ticks', () => {
    const level = createPartitionCampaign(72)[0]!;
    const replay = losingReplay(applyDifficulty(level.scenario, 'medium'));
    const tampered = structuredClone(replay);
    tampered.finalState.capturedFraction = 0.5;
    expect(() => verifyPartitionReplay(tampered)).toThrow(/final state/i);

    const continued = structuredClone(replay);
    continued.ticks.push({
      tick: replay.finalState.tick + 1,
      input: { direction: 'idle', draw: 'off' },
      controllerVersion: 0,
      events: [],
    });
    expect(() => verifyPartitionReplay(continued)).toThrow(/continued after/i);
  });

  it('binds a field score to the server-authored seed, field, and difficulty', () => {
    const seed = 73;
    const level = createPartitionCampaign(seed)[0]!;
    const replay = losingReplay(applyDifficulty(level.scenario, 'hard'));
    const score = {
      scope: 'level',
      difficulty: 'hard',
      levelId: level.metadata.slug,
      levelNumber: level.metadata.number,
      levelTitle: level.metadata.title,
      won: false,
      capturedFraction: 0,
      elapsedMs: Math.round(replay.finalState.tick / replay.scenario.ticksPerSecond * 1000),
      partitions: 0,
    };

    const verified = verifyRankedScore(
      { boardId: 'level', difficulty: 'hard', levelId: level.metadata.slug, seed },
      score,
      JSON.parse(JSON.stringify({ replays: [replay] })),
    );
    expect(verified.score).toEqual(score);

    const easierScenario = applyDifficulty(level.scenario, 'easy');
    expect(() => verifyRankedScore(
      { boardId: 'level', difficulty: 'hard', levelId: level.metadata.slug, seed },
      score,
      { replays: [losingReplay(easierScenario)] },
    )).toThrow(/ranked field challenge/i);
  });

  it('derives an arcade loss from the ordered launch progression', () => {
    const seed = 74;
    const first = resolvePartitionProgression(undefined, seed)[0]!;
    const replay = losingReplay(applyDifficulty(first.scenario, 'medium'));
    const score = {
      scope: 'arcade',
      difficulty: 'medium',
      stageReached: 1,
      stagesCleared: 0,
      completed: false,
      elapsedMs: Math.round(replay.finalState.tick / replay.scenario.ticksPerSecond * 1000),
      partitions: 0,
    };

    expect(verifyRankedScore(
      { boardId: 'arcade', difficulty: 'medium', levelId: null, seed },
      score,
      { replays: [replay] },
    ).score).toEqual(score);
  });

  it('rejects unknown replay fields rather than hashing ambiguous payloads', () => {
    const level = createPartitionCampaign(75)[0]!;
    const replay = losingReplay(applyDifficulty(level.scenario, 'medium')) as PartitionReplay & { surprise?: boolean };
    replay.surprise = true;
    expect(() => verifyPartitionReplay(replay)).toThrow(/unsupported fields/i);
  });
});

import { describe, expect, it } from 'vitest';
import { BlockshopEngine } from '../src/core/engine';
import { replayBlockshop, type BlockshopReplay } from '../src/core/replay';
import type { BlockshopInput } from '../src/core/types';
import { BLOCKSHOP_STAGES } from '../src/levels';

describe('Blockshop replays', () => {
  it('reproduces an input sequence tick for tick', () => {
    const stage = BLOCKSHOP_STAGES[0]!;
    const inputs: BlockshopInput[] = [];
    const engine = new BlockshopEngine(stage);
    for (let tick = 0; tick < 240; tick++) {
      const input: BlockshopInput = {
        move: tick % 120 < 60 ? 1 : -1,
        action: tick === 0,
      };
      inputs.push(input);
      engine.step(input);
    }
    const replay: BlockshopReplay = {
      schema: 1,
      stageId: stage.id,
      startingScore: 0,
      startingLives: 3,
      inputs,
    };
    expect(replayBlockshop(stage, replay)).toEqual(engine.snapshot());
  });

  it('rejects a replay for a different stage', () => {
    const replay: BlockshopReplay = {
      schema: 1,
      stageId: 'wrong',
      startingScore: 0,
      startingLives: 3,
      inputs: [],
    };
    expect(() => replayBlockshop(BLOCKSHOP_STAGES[0]!, replay)).toThrow(/does not match/);
  });

  it('rejects controls outside the replay protocol', () => {
    const stage = BLOCKSHOP_STAGES[0]!;
    const base: BlockshopReplay = {
      schema: 1,
      stageId: stage.id,
      startingScore: 0,
      startingLives: 3,
      inputs: [],
    };
    const invalidMove = {
      ...base,
      inputs: [{ move: 999, action: false }],
    } as unknown as BlockshopReplay;
    const invalidAction = {
      ...base,
      inputs: [{ move: 0, action: 1 }],
    } as unknown as BlockshopReplay;

    expect(() => replayBlockshop(stage, invalidMove)).toThrow(/invalid control input/);
    expect(() => replayBlockshop(stage, invalidAction)).toThrow(/invalid control input/);
  });

  it('rejects invalid starting score and ball counts', () => {
    const stage = BLOCKSHOP_STAGES[0]!;
    const base: BlockshopReplay = {
      schema: 1,
      stageId: stage.id,
      startingScore: 0,
      startingLives: 3,
      inputs: [],
    };
    const invalidReplays = [
      { ...base, startingScore: -1 },
      { ...base, startingScore: Number.NaN },
      { ...base, startingScore: 1_000_000_001 },
      { ...base, startingLives: 0 },
      { ...base, startingLives: 6 },
      { ...base, startingLives: 2.5 },
    ];

    for (const replay of invalidReplays) {
      expect(() => replayBlockshop(stage, replay)).toThrow(/invalid starting/);
    }
  });
});

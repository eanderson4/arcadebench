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
});

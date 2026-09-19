import { describe, expect, it } from 'vitest';
import { BlockshopEngine } from '../src/core/engine';
import { TICKS_PER_SECOND } from '../src/core/constants';
import { BLOCKSHOP_STAGES } from '../src/levels';

/**
 * A deliberately simple reference player. It tracks the lowest descending
 * bearing and never plans a bank shot. Clearing with this controller proves a
 * rack cannot lock its final blocks behind steel or a repeating trajectory.
 */
function followLowestBall(engine: BlockshopEngine, maximumTicks: number): number {
  let actionPulse = false;
  for (let tick = 0; tick < maximumTicks; tick++) {
    const state = engine.snapshot();
    if (state.status === 'won' || state.status === 'lost') return tick;
    const target = [...state.balls]
      .filter((ball) => ball.vy > 0)
      .sort((left, right) => right.y - left.y)[0] ?? state.balls[0];
    const move = target === undefined || Math.abs(target.x - state.paddleX) <= 8
      ? 0
      : target.x < state.paddleX ? -1 : 1;
    actionPulse = state.balls.some((ball) => ball.stuck) && !actionPulse;
    engine.step({ move, action: actionPulse });
    if (actionPulse) actionPulse = false;
  }
  return maximumTicks;
}

describe('Blockshop arcade racks', () => {
  it('keeps every authored rack clearable by a reactive one-ball player', () => {
    const maximumTicks = 3 * 60 * TICKS_PER_SECOND;
    for (const stage of BLOCKSHOP_STAGES) {
      const engine = new BlockshopEngine(stage);
      const elapsed = followLowestBall(engine, maximumTicks);
      const result = engine.snapshot();
      expect(result.status, `${stage.title} status after ${elapsed} ticks`).toBe('won');
      expect(result.blocksRemaining, stage.title).toBe(0);
      expect(result.lives, stage.title).toBeGreaterThan(0);
    }
  });
});

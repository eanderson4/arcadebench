import { describe, expect, it } from 'vitest';
import { BlockshopEngine } from '../src/core/engine';
import type { BlockshopStage } from '../src/core/types';
import { BLOCKSHOP_STAGES } from '../src/levels';

function tinyStage(overrides: Partial<BlockshopStage> = {}): BlockshopStage {
  return {
    id: 'tiny',
    number: 1,
    title: 'Tiny',
    lesson: 'Test',
    accent: '#000',
    ballSpeed: 8,
    bricks: [{ id: 'only', column: 5, row: 0, material: 'paint', hits: 1, power: null }],
    ...overrides,
  };
}

describe('BlockshopEngine', () => {
  it('holds the bearing on the moving tray until Action is pressed', () => {
    const engine = new BlockshopEngine(tinyStage());
    const before = engine.snapshot();
    engine.step({ move: 1, action: false });
    const moved = engine.snapshot();
    expect(moved.paddleX).toBeGreaterThan(before.paddleX);
    expect(moved.balls[0]?.stuck).toBe(true);
    expect(moved.balls[0]?.x).toBe(moved.paddleX);

    const result = engine.step({ move: 0, action: true });
    expect(result.state.status).toBe('running');
    expect(result.state.balls[0]?.stuck).toBe(false);
    expect(result.events.some((event) => event.type === 'ball_launched')).toBe(true);
  });

  it('does not retrigger Action while the button remains held', () => {
    const engine = new BlockshopEngine(tinyStage());
    engine.step({ move: 0, action: true });
    const firstTick = engine.snapshot().tick;
    const next = engine.step({ move: 0, action: true });
    expect(next.events.some((event) => event.type === 'ball_launched')).toBe(false);
    expect(next.state.tick).toBe(firstTick + 1);
  });

  it('carries a held Action into the replacement ball after a miss', () => {
    const engine = new BlockshopEngine(tinyStage());
    engine.step({ move: -1, action: true });

    let replacementReady = false;
    for (let tick = 0; tick < 600; tick += 1) {
      const result = engine.step({ move: -1, action: true });
      if (result.state.lives === 2 && result.state.balls[0]?.stuck) {
        replacementReady = true;
        break;
      }
    }

    expect(replacementReady).toBe(true);
    const relaunched = engine.step({ move: -1, action: true });
    expect(relaunched.events.some((event) => event.type === 'ball_launched')).toBe(true);
    expect(relaunched.state.balls[0]?.stuck).toBe(false);
  });

  it('gives steel no role in the stage-clear count', () => {
    const stage = tinyStage({
      bricks: [
        { id: 'breakable', column: 0, row: 0, material: 'paint', hits: 1, power: null },
        { id: 'steel', column: 1, row: 0, material: 'steel', hits: 99, power: null },
      ],
    });
    expect(new BlockshopEngine(stage).snapshot().blocksRemaining).toBe(1);
  });

  it('starts every catalog stage with its authored number of breakable blocks', () => {
    for (const stage of BLOCKSHOP_STAGES) {
      const expected = stage.bricks.filter((brick) => brick.material !== 'steel').length;
      expect(new BlockshopEngine(stage).snapshot().blocksRemaining, stage.id).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    }
  });

  it('returns cloned snapshots that cannot mutate the engine', () => {
    const engine = new BlockshopEngine(tinyStage());
    const snapshot = engine.snapshot();
    snapshot.balls[0]!.x = -100;
    snapshot.bricks[0]!.alive = false;
    const fresh = engine.snapshot();
    expect(fresh.balls[0]?.x).toBeGreaterThan(0);
    expect(fresh.bricks[0]?.alive).toBe(true);
  });
});

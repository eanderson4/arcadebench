import { describe, expect, it } from 'vitest';
import {
  PADDLE_Y,
  POWER_DROP_HEIGHT,
  POWER_DROP_SPEED,
  POWER_DROP_WIDTH,
} from '../src/core/constants';
import { BlockshopEngine } from '../src/core/engine';
import type { BlockshopStage, BlockshopState } from '../src/core/types';
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

function mutableState(engine: BlockshopEngine): BlockshopState {
  return (engine as unknown as { state: BlockshopState }).state;
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

  it('separates the bearing after one hit on a hardwood block', () => {
    const engine = new BlockshopEngine(tinyStage({
      bricks: [{ id: 'wood', column: 7, row: 0, material: 'hardwood', hits: 2, power: null }],
    }));
    let contact = null as ReturnType<BlockshopEngine['step']> | null;
    for (let tick = 0; tick < 120; tick += 1) {
      const result = engine.step({ move: 0, action: tick === 0 });
      if (result.events.some((event) => event.type === 'brick_hit')) {
        contact = result;
        break;
      }
    }

    expect(contact).not.toBeNull();
    expect(contact!.events.filter((event) => event.type === 'brick_hit')).toHaveLength(1);
    expect(contact!.state.bricks[0]).toMatchObject({ alive: true, hitsRemaining: 1 });
    const separated = engine.step({ move: 0, action: false });
    expect(separated.events.some((event) => event.type === 'brick_hit')).toBe(false);
  });

  it('reflects away from steel without repeated contact', () => {
    const engine = new BlockshopEngine(tinyStage({
      bricks: [
        { id: 'steel', column: 7, row: 0, material: 'steel', hits: 99, power: null },
        { id: 'target', column: 0, row: 6, material: 'paint', hits: 1, power: null },
      ],
    }));
    let contact = null as ReturnType<BlockshopEngine['step']> | null;
    for (let tick = 0; tick < 120; tick += 1) {
      const result = engine.step({ move: 0, action: tick === 0 });
      if (result.events.some((event) => event.type === 'brick_hit' && event.brickId === 'steel')) {
        contact = result;
        break;
      }
    }

    expect(contact).not.toBeNull();
    expect(contact!.events.filter((event) => event.type === 'brick_hit' && event.brickId === 'steel')).toHaveLength(1);
    const contactY = contact!.state.balls[0]!.y;
    const separated = engine.step({ move: 0, action: false });
    expect(separated.events.some((event) => event.type === 'brick_hit' && event.brickId === 'steel')).toBe(false);
    expect(separated.state.balls[0]!.y).toBeGreaterThan(contactY);
  });

  it('collects a power tag when its visible edge overlaps the tray', () => {
    const engine = new BlockshopEngine(tinyStage());
    const state = mutableState(engine);
    const paddleLeft = state.paddleX - state.paddleWidth / 2;
    state.powerDrops = [{
      id: 1,
      kind: 'extra',
      x: paddleLeft - POWER_DROP_WIDTH / 2 + 1,
      y: PADDLE_Y - POWER_DROP_HEIGHT / 2 - POWER_DROP_SPEED,
      vy: POWER_DROP_SPEED,
    }];

    const result = engine.step({ move: 0, action: false });
    expect(result.events).toContainEqual({ tick: 1, type: 'power_collected', power: 'extra' });
    expect(result.state.lives).toBe(4);
    expect(result.state.powerDrops).toHaveLength(0);
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

import { describe, expect, it } from 'vitest';
import {
  BRACED_MAX_SPEED,
  RollSignalEngine,
  getRollSignalCourse,
  toFixed,
} from '../src';

describe('RollSignalEngine controls', () => {
  it('carries momentum and makes brace a real braking and traction choice', () => {
    const course = getRollSignalCourse('first-chime');
    const rolling = new RollSignalEngine(course);
    const braced = new RollSignalEngine(course);
    for (let tick = 0; tick < 45; tick++) {
      rolling.step({ steerX: 1, steerY: 0, brace: false });
      braced.step({ steerX: 1, steerY: 0, brace: true });
    }
    expect(rolling.snapshot().velocity.x).toBeGreaterThan(braced.snapshot().velocity.x);
    expect(braced.snapshot().velocity.x).toBeLessThanOrEqual(BRACED_MAX_SPEED);

    const beforeCoast = rolling.snapshot().velocity.x;
    rolling.step({ steerX: 0, steerY: 0, brace: false });
    expect(rolling.snapshot().velocity.x).toBeGreaterThan(0);
    expect(rolling.snapshot().velocity.x).toBeLessThan(beforeCoast);

    for (let tick = 0; tick < 12; tick++) rolling.step({ steerX: 0, steerY: 0, brace: true });
    expect(rolling.snapshot().velocity.x).toBeLessThan(beforeCoast / 2);
  });

  it('rejects malformed input and returns independent deep snapshots', () => {
    const engine = new RollSignalEngine(getRollSignalCourse('first-chime'));
    expect(() => engine.setInput({ steerX: 2, steerY: 0, brace: false } as never)).toThrow(/steerX/);
    const snapshot = engine.snapshot();
    snapshot.position.x = 999;
    snapshot.currentInput.steerX = 1;
    snapshot.obstacles.push({ id: 'fake', x: 0, y: 0, width: 1, height: 1 });
    expect(engine.snapshot().position.x).toBe(toFixed(3));
    expect(engine.snapshot().currentInput.steerX).toBe(0);
    expect(engine.snapshot().obstacles).toHaveLength(0);
  });
});

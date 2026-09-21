import { describe, expect, it } from 'vitest';
import { ROLLSIGNAL_COURSES, RollSignalEngine, createReferenceController } from '../src';

describe('authored reference controller', () => {
  for (const course of ROLLSIGNAL_COURSES) {
    it(`clears ${course.name} within its verified limit`, () => {
      const engine = new RollSignalEngine(course);
      const controller = createReferenceController(course);
      while (engine.snapshot().status === 'running' && engine.snapshot().tick < course.referenceMaxTicks) {
        engine.step(controller.input(engine.snapshot()));
      }
      const state = engine.snapshot();
      expect(state.status).toBe('won');
      expect(state.tick).toBeLessThanOrEqual(course.referenceMaxTicks);
      expect(state.ringsCollected).toHaveLength(course.rings.length);
      expect(state.falls).toBe(0);
    });
  }
});

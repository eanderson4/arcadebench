import { expect, it } from 'vitest';
import {
  FINISH_SCORE,
  ROLLSIGNAL_COURSES,
  RollSignalEngine,
  createReferenceController,
} from '../src';

it('awards collected tone rings and a deterministic time score at the goal', () => {
  const course = ROLLSIGNAL_COURSES[0]!;
  const earlyGoal = new RollSignalEngine({ ...course, goal: { ...course.goal, x: course.spawn.x, y: course.spawn.y } });
  const directState = earlyGoal.step({ steerX: 0, steerY: 0, brace: false }).state;
  expect(directState.status).toBe('won');
  expect(directState.ringsCollected).toEqual([]);
  expect(directState.score).toBe(FINISH_SCORE - 50);

  const engine = new RollSignalEngine(course);
  const controller = createReferenceController(course);
  const eventTypes: string[] = [];
  while (engine.snapshot().status === 'running') {
    const result = engine.step(controller.input(engine.snapshot()));
    eventTypes.push(...result.events.map((event) => event.type));
  }
  const state = engine.snapshot();
  expect(state.status).toBe('won');
  expect(state.ringsCollected).toEqual(['first-low', 'first-high']);
  expect(eventTypes.filter((type) => type === 'tone_ring')).toHaveLength(2);
  expect(eventTypes.at(-1)).toBe('goal_reached');
  expect(state.score).toBe(2_000 + FINISH_SCORE - state.effectiveTimeTicks * 50);
});

it('allows courses with no tone rings to finish normally', () => {
  const source = ROLLSIGNAL_COURSES[0]!;
  const engine = new RollSignalEngine({
    ...source,
    rings: [],
    goal: { ...source.goal, x: source.spawn.x, y: source.spawn.y },
  });
  const result = engine.step({ steerX: 0, steerY: 0, brace: false });
  expect(result.state.status).toBe('won');
  expect(result.state.score).toBe(FINISH_SCORE - 50);
});

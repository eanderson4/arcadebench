import { expect, it } from 'vitest';
import { RollSignalEngine, type RollSignalCourse, toFixed } from '../src';

const checkpointCourse: RollSignalCourse = {
  id: 'checkpoint-test', number: 1, name: 'Checkpoint Test', tagline: 'test',
  timeLimitTicks: 1_000, parTicks: 500, referenceMaxTicks: 800, fallPenaltyTicks: 90,
  spawn: { x: 2, y: 2 },
  decks: [{ id: 'deck', x: 0, y: 0, width: 12, height: 5 }],
  rails: [],
  checkpoints: [{ id: 'middle', x: 6, y: 2, radius: 1 }],
  rings: [{ id: 'ring', x: 9, y: 2, radius: 1 }],
  goal: { id: 'goal', x: 11, y: 2, radius: 1 },
  referenceWaypoints: [{ x: 6, y: 2 }, { x: 9, y: 2 }, { x: 11, y: 2 }],
};

it('falls, adds deterministic time, and respawns at the latest checkpoint', () => {
  const engine = new RollSignalEngine(checkpointCourse);
  let reached = false;
  for (let tick = 0; tick < 80 && !reached; tick++) {
    const result = engine.step({ steerX: 1, steerY: 0, brace: tick > 35 });
    reached ||= result.events.some((event) => event.type === 'checkpoint_reached');
  }
  expect(reached).toBe(true);
  expect(engine.snapshot().checkpointId).toBe('middle');

  let fallEvents: ReturnType<RollSignalEngine['step']>['events'] = [];
  for (let tick = 0; tick < 100; tick++) {
    const result = engine.step({ steerX: 0, steerY: -1, brace: false });
    if (result.events.some((event) => event.type === 'fell')) {
      fallEvents = result.events;
      break;
    }
  }
  const state = engine.snapshot();
  expect(fallEvents.map((event) => event.type)).toEqual(['fell', 'respawned']);
  expect(state.position).toEqual({ x: toFixed(6), y: toFixed(2) });
  expect(state.velocity).toEqual({ x: 0, y: 0 });
  expect(state.falls).toBe(1);
  expect(state.penaltyTicks).toBe(90);
  expect(state.effectiveTimeTicks).toBe(state.tick + 90);
});

it('ends the run when elapsed ticks plus penalties consume the clock', () => {
  const engine = new RollSignalEngine({ ...checkpointCourse, timeLimitTicks: 3, parTicks: 2, referenceMaxTicks: 3 });
  expect(engine.step({ steerX: 0, steerY: 0, brace: false }).state.status).toBe('running');
  expect(engine.step({ steerX: 0, steerY: 0, brace: false }).state.status).toBe('running');
  const result = engine.step({ steerX: 0, steerY: 0, brace: false });
  expect(result.state.status).toBe('time_up');
  expect(result.state.timeRemainingTicks).toBe(0);
  expect(result.events).toEqual([{ tick: 3, type: 'time_expired' }]);
});

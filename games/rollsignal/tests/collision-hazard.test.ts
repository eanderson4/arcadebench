import { expect, it } from 'vitest';
import { RollSignalEngine, type RollSignalCourse, toFixed } from '../src';

const hazardCourse: RollSignalCourse = {
  id: 'hazard-test', number: 1, name: 'Hazard Test', tagline: 'test',
  timeLimitTicks: 1_000, parTicks: 500, referenceMaxTicks: 800,
  spawn: { x: 2, y: 5 },
  decks: [{ id: 'deck', x: 0, y: 0, width: 20, height: 10 }],
  rails: [{ id: 'rail', x: 11, y: 0, width: 1, height: 10 }],
  checkpoints: [],
  rings: [{ id: 'ring', x: 16, y: 5, radius: 1 }],
  goal: { id: 'goal', x: 18, y: 5, radius: 1 },
  obstacles: [{ id: 'piston', x: 6, y: 3, width: 1, height: 4, penaltyTicks: 25 }],
  zones: [{ id: 'fan', kind: 'wind', x: 2, y: 2, width: 3, height: 6, forceX: 2, forceY: 3 }],
  referenceWaypoints: [{ x: 16, y: 5 }, { x: 18, y: 5 }],
};

it('applies authored forces and resolves obstacle and rail collisions', () => {
  const engine = new RollSignalEngine(hazardCourse);
  const first = engine.step({ steerX: 1, steerY: 0, brace: false }).state;
  expect(first.velocity.y).toBeGreaterThan(0);

  let obstacleHits = 0;
  for (let tick = 0; tick < 100; tick++) {
    const result = engine.step({ steerX: 1, steerY: 0, brace: false });
    obstacleHits += result.events.filter((event) => event.type === 'obstacle_hit').length;
  }
  expect(obstacleHits).toBeGreaterThanOrEqual(1);
  expect(engine.snapshot().penaltyTicks).toBe(obstacleHits * 25);
  expect(engine.snapshot().position.x).toBeLessThan(toFixed(7));

  const railEngine = new RollSignalEngine({ ...hazardCourse, obstacles: [], zones: [] });
  let railHits = 0;
  for (let tick = 0; tick < 150; tick++) {
    const result = railEngine.step({ steerX: 1, steerY: 0, brace: false });
    railHits += result.events.filter((event) => event.type === 'rail_hit').length;
  }
  expect(railHits).toBeGreaterThanOrEqual(1);
  expect(railEngine.snapshot().position.x).toBeLessThan(toFixed(11));
});

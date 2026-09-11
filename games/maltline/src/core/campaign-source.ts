import type { MaltlineScenario } from './types';

/**
 * Authored stage scripts. Every Tapper-style lever is a scenario field, so a
 * stage is just a knob setting: menu breadth, blend dwell, jar pool, spawn
 * interval, march speed. Stages are deterministic from `seed`.
 */
const BASE: Omit<MaltlineScenario, 'id' | 'name' | 'stations' | 'lanes' | 'customerCount' | 'seed'> = {
  ticksPerSecond: 60,
  laneLength: 100,
  jarPoolSize: 5,
  blendTicks: 45,
  washTicks: 120,
  drinkTicks: 60,
  spawnIntervalTicks: 170,
  spawnAccelerationTicks: 4,
  spawnIntervalFloorTicks: 80,
  marchSpeed: 0.1,
  leaveSpeed: 0.5,
  slideSpeed: 1.6,
  returnSpeed: 1.2,
  resumeExitThreshold: 0.5,
  stationRepeatTicks: 5,
  laneRepeatTicks: 5,
  lives: 4,
};

// Generation 2 stage 4–8 tuples: customers / initial / floor / acceleration.
// Exact tested integers after 1.20× interval/floor and rounded 0.50× acceleration:
// 4: 20/180/96/3; 5: 20/204/96/2; 6: 17/192/96/2;
// 7: 27/144/66/2; 8: 31/132/60/2.
export function createAuthoredGeneration2Campaign(): MaltlineScenario[] {
  return [
  {
    ...BASE,
    id: 'maltline-01-first-pour',
    name: 'First Pour',
    stations: ['vanilla'],
    lanes: 2,
    customerCount: 8,
    spawnIntervalTicks: 200,
    marchSpeed: 0.08,
    seed: 1101,
  },
  {
    ...BASE,
    id: 'maltline-02-two-tap',
    name: 'Two-Tap',
    stations: ['vanilla', 'chocolate'],
    lanes: 2,
    customerCount: 10,
    seed: 1102,
  },
  {
    ...BASE,
    id: 'maltline-03-three-windows',
    name: 'Three Windows',
    stations: ['vanilla', 'chocolate', 'strawberry'],
    lanes: 3,
    customerCount: 12,
    seed: 1103,
  },
  {
    ...BASE,
    id: 'maltline-04-lunch-rush',
    name: 'Lunch Rush',
    stations: ['vanilla', 'chocolate', 'strawberry'],
    lanes: 3,
    customerCount: 20,
    spawnIntervalTicks: 180,
    spawnAccelerationTicks: 3,
    spawnIntervalFloorTicks: 96,
    marchSpeed: 0.11,
    seed: 1104,
  },
  {
    ...BASE,
    id: 'maltline-05-jar-shortage',
    name: 'Jar Shortage',
    stations: ['vanilla', 'chocolate', 'strawberry'],
    lanes: 3,
    customerCount: 20,
    spawnIntervalTicks: 204,
    spawnAccelerationTicks: 2,
    spawnIntervalFloorTicks: 96,
    jarPoolSize: 4,
    washTicks: 160,
    seed: 1105,
  },
  {
    ...BASE,
    id: 'maltline-06-thick-shakes',
    name: 'Thick Shakes',
    stations: ['vanilla', 'chocolate', 'strawberry'],
    lanes: 3,
    customerCount: 17,
    blendTicks: 75,
    spawnIntervalTicks: 192,
    spawnAccelerationTicks: 2,
    spawnIntervalFloorTicks: 96,
    marchSpeed: 0.09,
    seed: 1106,
  },
  {
    ...BASE,
    id: 'maltline-07-happy-hour',
    name: 'Happy Hour',
    stations: ['vanilla', 'chocolate', 'strawberry'],
    lanes: 3,
    customerCount: 27,
    spawnIntervalTicks: 144,
    spawnAccelerationTicks: 2,
    spawnIntervalFloorTicks: 66,
    marchSpeed: 0.12,
    jarPoolSize: 6,
    seed: 1107,
  },
  {
    ...BASE,
    id: 'maltline-08-closing-time',
    name: 'Closing Time',
    stations: ['vanilla', 'chocolate', 'strawberry'],
    lanes: 3,
    customerCount: 31,
    spawnIntervalTicks: 132,
    spawnAccelerationTicks: 2,
    spawnIntervalFloorTicks: 60,
    marchSpeed: 0.13,
    jarPoolSize: 6,
    resumeExitThreshold: 0.55,
    seed: 1108,
  },
  ];
}

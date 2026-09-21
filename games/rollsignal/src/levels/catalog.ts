import type { AuthoredRollSignalCourse } from './types';

function horizontalRails(prefix: string, length: number, height: number): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  return [
    { id: `${prefix}-north`, x: 0, y: -0.3, width: length, height: 0.3 },
    { id: `${prefix}-south`, x: 0, y: height, width: length, height: 0.3 },
  ];
}

export const ROLLSIGNAL_COURSES: readonly AuthoredRollSignalCourse[] = [
  {
    id: 'first-chime', number: 1, name: 'First Chime',
    tagline: 'Find the line, carry your momentum, and ring the silver road awake.',
    timeLimitTicks: 1_500, parTicks: 620, referenceMaxTicks: 1_100,
    spawn: { x: 3, y: 6 },
    decks: [{ id: 'first-deck', x: 0, y: 0, width: 58, height: 12 }],
    rails: horizontalRails('first-rail', 58, 12),
    checkpoints: [{ id: 'first-checkpoint', x: 29, y: 6, radius: 1.5 }],
    rings: [
      { id: 'first-low', x: 17, y: 6, radius: 1.35 },
      { id: 'first-high', x: 39, y: 6, radius: 1.35 },
    ],
    goal: { id: 'first-goal', x: 54, y: 6, radius: 1.65 },
    referenceWaypoints: [{ x: 17, y: 6 }, { x: 29, y: 6 }, { x: 39, y: 6 }, { x: 54, y: 6 }],
    metadata: { mechanics: ['momentum', 'brace', 'rails', 'checkpoints'], difficulty: 1 },
  },
  {
    id: 'silver-switchbacks', number: 2, name: 'Silver Switchbacks',
    tagline: 'Brake into each bell and carve a clean zigzag through the gallery.',
    timeLimitTicks: 1_800, parTicks: 820, referenceMaxTicks: 1_350,
    spawn: { x: 3, y: 8 },
    decks: [{ id: 'switch-deck', x: 0, y: 0, width: 68, height: 16 }],
    rails: [
      { id: 'switch-north-a', x: 0, y: -0.3, width: 26, height: 0.3 },
      { id: 'switch-north-b', x: 42, y: -0.3, width: 26, height: 0.3 },
      { id: 'switch-south', x: 0, y: 16, width: 68, height: 0.3 },
    ],
    checkpoints: [{ id: 'switch-checkpoint', x: 34, y: 12, radius: 1.6 }],
    rings: [
      { id: 'switch-one', x: 17, y: 4, radius: 1.4 },
      { id: 'switch-two', x: 34, y: 12, radius: 1.4 },
      { id: 'switch-three', x: 51, y: 4, radius: 1.4 },
    ],
    goal: { id: 'switch-goal', x: 64, y: 8, radius: 1.7 },
    referenceWaypoints: [{ x: 17, y: 4 }, { x: 34, y: 12 }, { x: 51, y: 4 }, { x: 64, y: 8 }],
    metadata: { mechanics: ['momentum', 'brace', 'checkpoints', 'switchbacks', 'rails'], difficulty: 2 },
  },
  {
    id: 'glass-current', number: 3, name: 'Glass Current',
    tagline: 'The polished deck keeps every mistake moving.',
    timeLimitTicks: 1_900, parTicks: 880, referenceMaxTicks: 1_450,
    spawn: { x: 3, y: 7 },
    decks: [{ id: 'glass-deck', x: 0, y: 0, width: 74, height: 14, surface: 'slick' }],
    rails: [{ id: 'glass-north', x: 0, y: -0.3, width: 30, height: 0.3 }],
    checkpoints: [{ id: 'glass-checkpoint', x: 38, y: 7, radius: 1.6 }],
    rings: [
      { id: 'glass-one', x: 20, y: 4, radius: 1.5 },
      { id: 'glass-two', x: 38, y: 10, radius: 1.5 },
      { id: 'glass-three', x: 57, y: 4, radius: 1.5 },
    ],
    goal: { id: 'glass-goal', x: 70, y: 7, radius: 1.8 },
    referenceWaypoints: [{ x: 20, y: 4 }, { x: 38, y: 10 }, { x: 57, y: 4 }, { x: 70, y: 7 }],
    metadata: { mechanics: ['momentum', 'brace', 'slick', 'checkpoints'], difficulty: 2 },
  },
  {
    id: 'crosswind-causeway', number: 4, name: 'Crosswind Causeway',
    tagline: 'Read the pennants and lean into two opposing gusts.',
    timeLimitTicks: 2_100, parTicks: 940, referenceMaxTicks: 1_600,
    spawn: { x: 3, y: 7 },
    decks: [{ id: 'wind-deck', x: 0, y: 0, width: 78, height: 14 }],
    rails: [
      { id: 'wind-south-a', x: 14, y: 14, width: 22, height: 0.3 },
      { id: 'wind-north-b', x: 40, y: -0.3, width: 22, height: 0.3 },
    ],
    checkpoints: [{ id: 'wind-checkpoint', x: 40, y: 7, radius: 1.7 }],
    rings: [
      { id: 'wind-one', x: 22, y: 5, radius: 1.55 },
      { id: 'wind-two', x: 47, y: 9, radius: 1.55 },
      { id: 'wind-three', x: 64, y: 6, radius: 1.55 },
    ],
    goal: { id: 'wind-goal', x: 74, y: 7, radius: 1.8 },
    zones: [
      { id: 'south-gust', kind: 'wind', x: 14, y: 0, width: 22, height: 14, forceX: 0, forceY: 5 },
      { id: 'north-gust', kind: 'wind', x: 40, y: 0, width: 22, height: 14, forceX: 0, forceY: -6 },
    ],
    referenceWaypoints: [{ x: 22, y: 5 }, { x: 40, y: 7 }, { x: 47, y: 9 }, { x: 64, y: 6 }, { x: 74, y: 7 }],
    metadata: { mechanics: ['momentum', 'brace', 'wind', 'checkpoints', 'rails'], difficulty: 3 },
  },
  {
    id: 'brass-transit', number: 5, name: 'Brass Transit',
    tagline: 'Conveyor plates pull the route sideways beneath your roll.',
    timeLimitTicks: 2_200, parTicks: 1_000, referenceMaxTicks: 1_700,
    spawn: { x: 3, y: 8 },
    decks: [{ id: 'transit-deck', x: 0, y: 0, width: 82, height: 16 }],
    rails: horizontalRails('transit-rail', 82, 16),
    checkpoints: [{ id: 'transit-checkpoint', x: 42, y: 8, radius: 1.7 }],
    rings: [
      { id: 'transit-one', x: 20, y: 5, radius: 1.5 },
      { id: 'transit-two', x: 42, y: 11, radius: 1.5 },
      { id: 'transit-three', x: 63, y: 5, radius: 1.5 },
    ],
    goal: { id: 'transit-goal', x: 78, y: 8, radius: 1.8 },
    zones: [
      { id: 'belt-east', kind: 'conveyor', x: 12, y: 0, width: 24, height: 16, forceX: 4, forceY: 3 },
      { id: 'belt-west', kind: 'conveyor', x: 47, y: 0, width: 22, height: 16, forceX: -3, forceY: -4 },
    ],
    referenceWaypoints: [{ x: 20, y: 5 }, { x: 42, y: 11 }, { x: 63, y: 5 }, { x: 78, y: 8 }],
    metadata: { mechanics: ['momentum', 'brace', 'conveyor', 'checkpoints', 'rails'], difficulty: 3 },
  },
  {
    id: 'clockwork-crossing', number: 6, name: 'Clockwork Crossing',
    tagline: 'Moving brass bars turn open lanes into a timing problem.',
    timeLimitTicks: 2_500, parTicks: 1_150, referenceMaxTicks: 2_000,
    spawn: { x: 3, y: 9 },
    decks: [{ id: 'clock-deck', x: 0, y: 0, width: 86, height: 18 }],
    rails: horizontalRails('clock-rail', 86, 18),
    checkpoints: [{ id: 'clock-checkpoint', x: 44, y: 9, radius: 1.7 }],
    rings: [
      { id: 'clock-one', x: 20, y: 14, radius: 1.5 },
      { id: 'clock-two', x: 44, y: 4, radius: 1.5 },
      { id: 'clock-three', x: 68, y: 14, radius: 1.5 },
    ],
    goal: { id: 'clock-goal', x: 82, y: 9, radius: 1.9 },
    obstacles: [
      { id: 'clock-bar-a', x: 29, y: 1, width: 2.2, height: 4, motion: { axis: 'y', range: 11, periodTicks: 260 }, penaltyTicks: 30 },
      { id: 'clock-bar-b', x: 55, y: 2, width: 2.2, height: 4, motion: { axis: 'y', range: 10, periodTicks: 220, phaseTicks: 90 }, penaltyTicks: 30 },
    ],
    referenceWaypoints: [{ x: 20, y: 14 }, { x: 34, y: 15 }, { x: 44, y: 4 }, { x: 60, y: 3 }, { x: 68, y: 14 }, { x: 82, y: 9 }],
    metadata: { mechanics: ['momentum', 'brace', 'moving-obstacles', 'checkpoints', 'rails'], difficulty: 4 },
  },
  {
    id: 'relay-run', number: 7, name: 'Relay Run',
    tagline: 'Touch both signal plates to retract the gate before the final straight.',
    timeLimitTicks: 2_600, parTicks: 1_250, referenceMaxTicks: 2_100,
    spawn: { x: 3, y: 8 },
    decks: [{ id: 'relay-deck', x: 0, y: 0, width: 90, height: 16 }],
    rails: horizontalRails('relay-rail', 90, 16),
    checkpoints: [{ id: 'relay-checkpoint', x: 46, y: 8, radius: 1.7 }],
    rings: [
      { id: 'relay-one', x: 26, y: 8, radius: 1.5 },
      { id: 'relay-two', x: 57, y: 8, radius: 1.5 },
      { id: 'relay-three', x: 74, y: 5, radius: 1.5 },
    ],
    goal: { id: 'relay-goal', x: 86, y: 8, radius: 1.9 },
    relayPads: [
      { id: 'relay-pad-blue', gateId: 'relay-gate', x: 17, y: 4, radius: 1.8 },
      { id: 'relay-pad-gold', gateId: 'relay-gate', x: 36, y: 12, radius: 1.8 },
    ],
    gates: [{ id: 'relay-gate', x: 47, y: 0, width: 1.2, height: 16, requiredPadIds: ['relay-pad-blue', 'relay-pad-gold'] }],
    referenceWaypoints: [{ x: 17, y: 4 }, { x: 26, y: 8 }, { x: 36, y: 12 }, { x: 46, y: 8 }, { x: 57, y: 8 }, { x: 74, y: 5 }, { x: 86, y: 8 }],
    metadata: { mechanics: ['momentum', 'brace', 'relay-gates', 'checkpoints', 'rails'], difficulty: 4 },
  },
  {
    id: 'signal-crown', number: 8, name: 'Signal Crown',
    tagline: 'Master glass, gust, machinery, and relay light in one last ascent.',
    timeLimitTicks: 3_400, parTicks: 1_600, referenceMaxTicks: 2_900,
    spawn: { x: 3, y: 10 },
    decks: [
      { id: 'crown-deck-normal', x: 0, y: 0, width: 28, height: 20 },
      { id: 'crown-deck-glass', x: 28, y: 0, width: 32, height: 20, surface: 'slick' },
      { id: 'crown-deck-final', x: 60, y: 0, width: 42, height: 20 },
    ],
    rails: [
      { id: 'crown-north-a', x: 0, y: -0.3, width: 45, height: 0.3 },
      { id: 'crown-south-b', x: 45, y: 20, width: 57, height: 0.3 },
    ],
    checkpoints: [
      { id: 'crown-checkpoint-one', x: 36, y: 14, radius: 1.8 },
      { id: 'crown-checkpoint-two', x: 71, y: 5, radius: 1.8 },
    ],
    rings: [
      { id: 'crown-one', x: 19, y: 5, radius: 1.55 },
      { id: 'crown-two', x: 40, y: 15, radius: 1.55 },
      { id: 'crown-three', x: 64, y: 5, radius: 1.55 },
      { id: 'crown-four', x: 84, y: 15, radius: 1.55 },
    ],
    goal: { id: 'crown-goal', x: 98, y: 10, radius: 2 },
    zones: [
      { id: 'crown-gust', kind: 'wind', x: 12, y: 0, width: 14, height: 20, forceX: 0, forceY: 6 },
      { id: 'crown-belt', kind: 'conveyor', x: 61, y: 0, width: 17, height: 20, forceX: 3, forceY: -5 },
    ],
    obstacles: [
      { id: 'crown-bar', x: 51, y: 2, width: 2, height: 4, motion: { axis: 'y', range: 12, periodTicks: 230, phaseTicks: 30 }, penaltyTicks: 40 },
    ],
    relayPads: [
      { id: 'crown-pad', gateId: 'crown-gate', x: 76, y: 5, radius: 1.9 },
    ],
    gates: [{ id: 'crown-gate', x: 89, y: 0, width: 1.2, height: 20, requiredPadIds: ['crown-pad'] }],
    referenceWaypoints: [
      { x: 19, y: 5 }, { x: 36, y: 14 }, { x: 40, y: 15 }, { x: 55, y: 16 },
      { x: 64, y: 5 }, { x: 71, y: 5 }, { x: 76, y: 5 }, { x: 84, y: 15 }, { x: 98, y: 10 },
    ],
    metadata: { mechanics: ['momentum', 'brace', 'slick', 'wind', 'conveyor', 'moving-obstacles', 'relay-gates', 'checkpoints'], difficulty: 5 },
  },
] as const;

export function getRollSignalCourse(id: string): AuthoredRollSignalCourse {
  const course = ROLLSIGNAL_COURSES.find((candidate) => candidate.id === id);
  if (!course) throw new Error(`unknown Roll Signal course: ${id}`);
  return course;
}

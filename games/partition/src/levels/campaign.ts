import type { Edge } from '../core/types';
import { asciiMask, cloneCampaignLevel, defineLevel, wallLine } from './toolbox';
import type { BoardMask, PartitionCampaignLevel, PartitionDifficultyId } from './types';

export const PARTITION_CAMPAIGN_SEED = 0x50415254;

const OPEN = asciiMask([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
], 2);

const PINCHED = asciiMask([
  '###..........###',
  '##............##',
  '#..............#',
  '................',
  '................',
  '................',
  '................',
  '#..............#',
  '##............##',
  '###..........###',
], 2);

const HOLLOW_CORE = asciiMask([
  '................',
  '................',
  '.......##.......',
  '.....######.....',
  '....########....',
  '....########....',
  '.....######.....',
  '.......##.......',
  '................',
  '................',
], 2);

const ISLANDS = asciiMask([
  '................',
  '..##........##..',
  '..##........##..',
  '................',
  '......####......',
  '......####......',
  '................',
  '..##........##..',
  '..##........##..',
  '................',
], 2);

const LONG_HALL = asciiMask([
  '#####......#####',
  '####........####',
  '###..........###',
  '##............##',
  '#..............#',
  '#..............#',
  '##............##',
  '###..........###',
  '####........####',
  '#####......#####',
], 2);

const OFFSET_GATES = asciiMask([
  '................',
  '....##..........',
  '....##..........',
  '....##.....##...',
  '...........##...',
  '...##...........',
  '...##.....##....',
  '..........##....',
  '..........##....',
  '................',
], 2);

const BOW_TIE = asciiMask([
  '##............##',
  '.##..........##.',
  '..##........##..',
  '...##......##...',
  '....##....##....',
  '....##....##....',
  '...##......##...',
  '..##........##..',
  '.##..........##.',
  '##............##',
], 2);

const ARCHIPELAGO = asciiMask([
  '................',
  '.###.......##...',
  '.###.......##...',
  '.........###....',
  '...##....###....',
  '...##...........',
  '......###....##.',
  '......###....##.',
  '..##............',
  '................',
], 2);

const RAZOR_FRAME = asciiMask([
  '####........####',
  '##............##',
  '................',
  '...#........#...',
  '...##......##...',
  '...##......##...',
  '...#........#...',
  '................',
  '##............##',
  '####........####',
], 2);

const BLACK_DIAMOND = asciiMask([
  '####........####',
  '###..........###',
  '##.....##.....##',
  '#....######....#',
  '....########....',
  '....########....',
  '#....######....#',
  '##.....##.....##',
  '###..........###',
  '####........####',
], 2);

const SHATTERED = asciiMask([
  '................',
  '..##...##...##..',
  '.......##.......',
  '.###........###.',
  '.......##.......',
  '.......##.......',
  '.###........###.',
  '.......##.......',
  '..##...##...##..',
  '................',
], 2);

const EVENT_HORIZON = asciiMask([
  '................',
  '......####......',
  '....##....##....',
  '...##......##...',
  '...#........#...',
  '...#........#...',
  '...##......##...',
  '....##....##....',
  '......####......',
  '................',
], 2);

function vertical(x: number, fromY: number, toY: number): Edge[] {
  return wallLine({ x, y: fromY }, { x, y: toY });
}

function horizontal(y: number, fromX: number, toX: number): Edge[] {
  return wallLine({ x: fromX, y }, { x: toX, y });
}

function splitGate(board: BoardMask): Edge[] {
  const x = board.width / 2;
  const gapTop = board.height / 2 - 2;
  return [...vertical(x, 0, gapTop), ...vertical(x, gapTop + 4, board.height)];
}

function brokenCross(board: BoardMask): Edge[] {
  const x = board.width / 2;
  const y = board.height / 2;
  return [
    ...vertical(x, 0, y - 2),
    ...vertical(x, y + 2, board.height),
    ...horizontal(y, 0, x - 2),
    ...horizontal(y, x + 2, board.width),
  ];
}

function switchbacks(board: BoardMask): Edge[] {
  return [
    ...horizontal(5, 0, board.width - 6),
    ...horizontal(10, 6, board.width),
    ...horizontal(15, 0, board.width - 6),
  ];
}

function circuitWalls(board: BoardMask): Edge[] {
  const x = board.width / 2;
  const y = board.height / 2;
  return [
    ...vertical(6, 0, y - 2),
    ...vertical(board.width - 6, y + 2, board.height),
    ...horizontal(4, x, board.width),
    ...horizontal(board.height - 4, 0, x),
    ...vertical(x, 6, board.height - 6),
  ];
}

interface LevelDraft {
  slug: string;
  title: string;
  tier: PartitionDifficultyId;
  tagline: string;
  challenge: string;
  features: string[];
  board: BoardMask;
  anomalyCount: number;
  filamentCount?: number;
  anomalySpeed: readonly [number, number];
  targetFraction: number;
  integrity: number;
  sparkMoveEveryTicks: number;
  timeLimitTicks: number;
  parTicks: number;
  initialWalls?: readonly Edge[];
}

function campaignSeed(baseSeed: number, levelNumber: number): number {
  return (baseSeed ^ Math.imul(levelNumber, 0x9e3779b1)) >>> 0;
}

function authoredLevel(number: number, seed: number, draft: LevelDraft): PartitionCampaignLevel {
  return defineLevel({ number, seed: campaignSeed(seed, number), ...draft });
}

/** The canonical twenty-stage catalog. A seed affects motion, never geometry or metadata. */
export function createPartitionCampaign(seed = PARTITION_CAMPAIGN_SEED): PartitionCampaignLevel[] {
  return [
    authoredLevel(1, seed, {
      slug: 'first-light', title: 'First Light', tier: 'easy', tagline: 'One field. One anomaly. One clean cut.',
      challenge: 'Learn safe-wall travel and reach the standard target against one slow anomaly.', features: ['open-field', 'single-anomaly', 'long-clock'],
      board: OPEN, anomalyCount: 1, anomalySpeed: [0.075, 0.095], targetFraction: 0.75, integrity: 5,
      sparkMoveEveryTicks: 3, timeLimitTicks: 5_400, parTicks: 2_700,
    }),
    authoredLevel(2, seed, {
      slug: 'twin-drift', title: 'Twin Drift', tier: 'easy', tagline: 'Two trajectories, plenty of room.',
      challenge: 'Watch two slow anomaly paths before committing to a long trace.', features: ['open-field', 'two-anomalies', 'observation'],
      board: OPEN, anomalyCount: 2, anomalySpeed: [0.08, 0.105], targetFraction: 0.75, integrity: 5,
      sparkMoveEveryTicks: 3, timeLimitTicks: 5_100, parTicks: 2_750,
    }),
    authoredLevel(3, seed, {
      slug: 'soft-corners', title: 'Soft Corners', tier: 'easy', tagline: 'The rectangle begins to bend.',
      challenge: 'Use the angled-looking stepped frontier to make shorter, safer cuts.', features: ['pinched-silhouette', 'mask-frontier', 'two-anomalies'],
      board: PINCHED, anomalyCount: 2, anomalySpeed: [0.085, 0.11], targetFraction: 0.75, integrity: 4,
      sparkMoveEveryTicks: 3, timeLimitTicks: 4_800, parTicks: 2_650,
    }),
    authoredLevel(4, seed, {
      slug: 'garden-gate', title: 'Garden Gate', tier: 'easy', tagline: 'A divider with one inviting opening.',
      challenge: 'Choose which side of the broken center wall to reduce first.', features: ['split-wall', 'central-gate', 'route-choice'],
      board: OPEN, initialWalls: splitGate(OPEN), anomalyCount: 2, anomalySpeed: [0.09, 0.115], targetFraction: 0.75, integrity: 4,
      sparkMoveEveryTicks: 3, timeLimitTicks: 4_500, parTicks: 2_500,
    }),
    authoredLevel(5, seed, {
      slug: 'quiet-islands', title: 'Quiet Islands', tier: 'easy', tagline: 'Small voids turn one field into a coastline.',
      challenge: 'Navigate permanent island walls while tracking three slow anomalies.', features: ['islands', 'three-anomalies', 'short-traces'],
      board: ISLANDS, anomalyCount: 3, anomalySpeed: [0.09, 0.12], targetFraction: 0.75, integrity: 4,
      sparkMoveEveryTicks: 3, timeLimitTicks: 4_350, parTicks: 2_550,
    }),

    authoredLevel(6, seed, {
      slug: 'crosswind', title: 'Crosswind', tier: 'medium', tagline: 'Familiar space, less forgiving motion.',
      challenge: 'Meet the first long-body Filament while reading a tighter Spark-to-anomaly speed ratio.', features: ['open-field', 'first-filament', 'timing-pressure'],
      board: OPEN, anomalyCount: 3, filamentCount: 1, anomalySpeed: [0.12, 0.155], targetFraction: 0.75, integrity: 4,
      sparkMoveEveryTicks: 3, timeLimitTicks: 4_050, parTicks: 2_400,
    }),
    authoredLevel(7, seed, {
      slug: 'long-hall', title: 'Long Hall', tier: 'medium', tagline: 'A narrow waist rewards decisive cuts.',
      challenge: 'Exploit the tapered silhouette without getting cornered in its wide ends.', features: ['tapered-silhouette', 'narrow-waist', 'three-anomalies'],
      board: LONG_HALL, anomalyCount: 3, anomalySpeed: [0.125, 0.16], targetFraction: 0.75, integrity: 4,
      sparkMoveEveryTicks: 3, timeLimitTicks: 3_900, parTicks: 2_350,
    }),
    authoredLevel(8, seed, {
      slug: 'broken-compass', title: 'Broken Compass', tier: 'medium', tagline: 'Four spokes, four tempting approaches.',
      challenge: 'Use a broken cross of safe walls while anomalies migrate through its gaps.', features: ['broken-cross', 'internal-walls', 'four-quadrants'],
      board: OPEN, initialWalls: brokenCross(OPEN), anomalyCount: 4, filamentCount: 1, anomalySpeed: [0.125, 0.165], targetFraction: 0.75, integrity: 3,
      sparkMoveEveryTicks: 3, timeLimitTicks: 3_750, parTicks: 2_300,
    }),
    authoredLevel(9, seed, {
      slug: 'hollow-core', title: 'Hollow Core', tier: 'medium', tagline: 'The center is missing; the routes are not.',
      challenge: 'Cut around a large diamond-like void whose frontier creates many junctions.', features: ['central-void', 'non-rectangular', 'wall-junctions'],
      board: HOLLOW_CORE, anomalyCount: 4, filamentCount: 1, anomalySpeed: [0.13, 0.17], targetFraction: 0.75, integrity: 3,
      sparkMoveEveryTicks: 3, timeLimitTicks: 3_600, parTicks: 2_250,
    }),
    authoredLevel(10, seed, {
      slug: 'three-body-plus-one', title: 'Three Body, Plus One', tier: 'medium', tagline: 'Prediction gets crowded.',
      challenge: 'Coordinate cut timing against four fast trajectories in an uncluttered arena.', features: ['open-field', 'four-anomalies', 'temporal-prediction'],
      board: OPEN, anomalyCount: 4, filamentCount: 1, anomalySpeed: [0.145, 0.185], targetFraction: 0.75, integrity: 3,
      sparkMoveEveryTicks: 3, timeLimitTicks: 3_450, parTicks: 2_150,
    }),

    authoredLevel(11, seed, {
      slug: 'razor-frame', title: 'Razor Frame', tier: 'hard', tagline: 'Every inward tooth changes the bounce.',
      challenge: 'Read ricochets created by a jagged frontier and commit with fewer lives.', features: ['jagged-silhouette', 'ricochets', 'low-lives'],
      board: RAZOR_FRAME, anomalyCount: 4, filamentCount: 1, anomalySpeed: [0.165, 0.215], targetFraction: 0.75, integrity: 3,
      sparkMoveEveryTicks: 3, timeLimitTicks: 3_150, parTicks: 2_050,
    }),
    authoredLevel(12, seed, {
      slug: 'switchback', title: 'Switchback', tier: 'hard', tagline: 'The safe route zigzags; the danger does not.',
      challenge: 'Traverse alternating wall shelves to find short trace opportunities.', features: ['switchback-walls', 'route-planning', 'five-anomalies'],
      board: OPEN, initialWalls: switchbacks(OPEN), anomalyCount: 5, filamentCount: 2, anomalySpeed: [0.17, 0.22], targetFraction: 0.75, integrity: 3,
      sparkMoveEveryTicks: 3, timeLimitTicks: 3_000, parTicks: 1_950,
    }),
    authoredLevel(13, seed, {
      slug: 'archipelago', title: 'Archipelago', tier: 'hard', tagline: 'Many shores, nowhere to stop watching.',
      challenge: 'Use scattered obstacle frontiers while five anomalies rebound unpredictably.', features: ['asymmetric-islands', 'five-anomalies', 'dense-frontier'],
      board: ARCHIPELAGO, anomalyCount: 5, filamentCount: 1, anomalySpeed: [0.175, 0.225], targetFraction: 0.75, integrity: 3,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_900, parTicks: 1_900,
    }),
    authoredLevel(14, seed, {
      slug: 'offset-gates', title: 'Offset Gates', tier: 'hard', tagline: 'No route stays straight for long.',
      challenge: 'Thread staggered obstacle gates and isolate anomalies on opposite sides.', features: ['offset-obstacles', 'narrow-gates', 'separation'],
      board: OFFSET_GATES, anomalyCount: 6, filamentCount: 2, anomalySpeed: [0.18, 0.23], targetFraction: 0.75, integrity: 2,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_800, parTicks: 1_850,
    }),
    authoredLevel(15, seed, {
      slug: 'pressure-front', title: 'Pressure Front', tier: 'hard', tagline: 'The clock joins the swarm.',
      challenge: 'Reach the standard target against six anomalies before a deliberately tight clock.', features: ['time-pressure', 'six-anomalies', 'standard-target'],
      board: PINCHED, anomalyCount: 6, filamentCount: 2, anomalySpeed: [0.185, 0.24], targetFraction: 0.75, integrity: 2,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_650, parTicks: 1_750,
    }),

    authoredLevel(16, seed, {
      slug: 'bow-tie', title: 'Bow Tie', tier: 'impossible', tagline: 'Two chambers share a dangerous throat.',
      challenge: 'Control the Spark around diagonal-looking walls and a seven-anomaly swarm.', features: ['bow-tie-silhouette', 'seven-anomalies', 'tight-routing'],
      board: BOW_TIE, anomalyCount: 7, filamentCount: 3, anomalySpeed: [0.21, 0.27], targetFraction: 0.75, integrity: 2,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_400, parTicks: 1_650,
    }),
    authoredLevel(17, seed, {
      slug: 'event-horizon', title: 'Event Horizon', tier: 'impossible', tagline: 'A ring of walls bends every forecast.',
      challenge: 'Plan around a hollow ring that repeatedly redirects eight anomalies.', features: ['ring-silhouette', 'eight-anomalies', 'complex-ricochets'],
      board: EVENT_HORIZON, anomalyCount: 8, filamentCount: 3, anomalySpeed: [0.215, 0.28], targetFraction: 0.75, integrity: 2,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_645, parTicks: 1_600,
    }),
    authoredLevel(18, seed, {
      slug: 'shattered-circuit', title: 'Shattered Circuit', tier: 'impossible', tagline: 'The board is a diagram with missing connections.',
      challenge: 'Combine fragmented mask frontiers with a permanent circuit of safe walls.', features: ['fragmented-mask', 'circuit-walls', 'eight-anomalies'],
      board: SHATTERED, initialWalls: circuitWalls(SHATTERED), anomalyCount: 8, filamentCount: 3, anomalySpeed: [0.22, 0.29], targetFraction: 0.75, integrity: 2,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_200, parTicks: 1_550,
    }),
    authoredLevel(19, seed, {
      slug: 'black-diamond', title: 'Black Diamond', tier: 'impossible', tagline: 'A hard silhouette with almost no quiet space.',
      challenge: 'Find viable cuts between a central diamond, closing corners, and nine anomalies.', features: ['compound-silhouette', 'nine-anomalies', 'one-mistake-margin'],
      board: BLACK_DIAMOND, anomalyCount: 9, filamentCount: 4, anomalySpeed: [0.225, 0.30], targetFraction: 0.75, integrity: 2,
      sparkMoveEveryTicks: 3, timeLimitTicks: 2_100, parTicks: 1_500,
    }),
    authoredLevel(20, seed, {
      slug: 'last-partition', title: 'Last Partition', tier: 'impossible', tagline: 'Everything moves faster than your first instinct.',
      challenge: 'Clear the standard target with nine anomalies, one life, and the shortest clock.', features: ['broken-cross', 'nine-anomalies', 'maximum-pressure', 'single-life'],
      board: RAZOR_FRAME, initialWalls: brokenCross(RAZOR_FRAME), anomalyCount: 9, filamentCount: 4, anomalySpeed: [0.24, 0.315], targetFraction: 0.75, integrity: 1,
      sparkMoveEveryTicks: 3, timeLimitTicks: 1_950, parTicks: 1_450,
    }),
  ];
}

const CANONICAL_CAMPAIGN = createPartitionCampaign();

/** Returns defensive copies so a game session cannot mutate the level catalog. */
export function listCampaignLevels(tier?: PartitionDifficultyId): PartitionCampaignLevel[] {
  return CANONICAL_CAMPAIGN
    .filter((level) => tier === undefined || level.metadata.tier === tier)
    .map(cloneCampaignLevel);
}

export function getCampaignLevel(idOrNumber: string | number): PartitionCampaignLevel | undefined {
  const level = CANONICAL_CAMPAIGN.find((candidate) =>
    typeof idOrNumber === 'number'
      ? candidate.metadata.number === idOrNumber
      : candidate.scenario.id === idOrNumber || candidate.metadata.slug === idOrNumber,
  );
  return level ? cloneCampaignLevel(level) : undefined;
}

export const createPartitionStageCatalog = createPartitionCampaign;
export const listPartitionStages = listCampaignLevels;
export const getPartitionStage = getCampaignLevel;

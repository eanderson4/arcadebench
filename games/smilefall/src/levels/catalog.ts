import type { SmilefallLevelScenario, SmilefallStage } from './types';
import { dropPairs, dropRun, dropVolley, ledges, rockRun, rockWall, spikeStrips } from './toolbox';

const FIELD_WIDTH = 32;
const FIELD_HEIGHT = 20;
const TICKS_PER_SECOND = 30;

function field(overrides: Omit<SmilefallLevelScenario, 'width' | 'height' | 'ticksPerSecond'>): SmilefallLevelScenario {
  return {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    ticksPerSecond: TICKS_PER_SECOND,
    ...overrides,
  };
}

const firstGiggle: SmilefallStage = {
  metadata: {
    number: 1,
    slug: 'first-giggle',
    title: 'First Giggle',
    tier: 'giggle',
    tagline: 'Three buckets, ten smiles, and one shared steering wheel.',
    challenge: 'Lean the whole flock together. The floor always sends a missed smile back up.',
    features: ['bouncy ground', 'wide buckets', 'no lethal hazards'],
    mechanics: ['shared-lean', 'flock-hop'],
    parTicks: 720,
  },
  scenario: field({
    id: 'first-giggle',
    name: 'First Giggle',
    moodId: 'giggle',
    hopCharges: 4,
    hopRechargeTicks: 75,
    timeLimitTicks: 1200,
    buckets: [
      { id: 'b1', x: 3, width: 4.8, capacity: 2 },
      { id: 'b2', x: 13.6, width: 4.8, capacity: 2 },
      { id: 'b3', x: 24.2, width: 4.8, capacity: 2 },
    ],
    drops: dropRun(35, 10, 60, [6, 16, 26, 10, 22]),
    rocks: [],
  }),
};

/** Merges the useful lessons from the prototype's Rock Season and Wobble Row. */
const wobbleSeason: SmilefallStage = {
  metadata: {
    number: 2,
    slug: 'wobble-season',
    title: 'Wobble Season',
    tier: 'giggle',
    tagline: 'The buckets wander and the first soft rocks roll through.',
    challenge: 'Lead a moving bucket, then hop over the slow rocks. Every collision is survivable.',
    features: ['gently moving buckets', 'plain rocks bruise', 'bouncy ground'],
    mechanics: ['shared-lean', 'flock-hop', 'plain-rocks', 'moving-buckets'],
    parTicks: 880,
  },
  scenario: field({
    id: 'wobble-season',
    name: 'Wobble Season',
    moodId: 'giggle',
    hopCharges: 4,
    hopRechargeTicks: 70,
    timeLimitTicks: 1400,
    buckets: [
      { id: 'b1', x: 2, width: 4.4, capacity: 3, drift: { speed: 0.025, minX: 1, maxX: 5 } },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 3 },
      { id: 'b3', x: 25, width: 4.4, capacity: 3, drift: { speed: -0.025, minX: 22.5, maxX: 27 } },
    ],
    drops: dropRun(30, 15, 54, [6, 17, 25, 10, 22]),
    rocks: rockRun(150, 6, 160, [6, 11, 15], 0.17, 'pebble', 'plain'),
  }),
};

const bucketBrigade: SmilefallStage = {
  metadata: {
    number: 3,
    slug: 'bucket-brigade',
    title: 'Bucket Brigade',
    tier: 'chuckle',
    tagline: 'Two smiles fall together while every bucket keeps moving.',
    challenge: 'Compromise between paired drops. Nothing in this stage can pop a smile.',
    features: ['paired drops', 'moving buckets', 'no lethal hazards'],
    mechanics: ['shared-lean', 'flock-hop', 'moving-buckets', 'paired-drops'],
    parTicks: 940,
  },
  scenario: field({
    id: 'bucket-brigade',
    name: 'Bucket Brigade',
    moodId: 'chuckle',
    hopCharges: 4,
    hopRechargeTicks: 65,
    timeLimitTicks: 1450,
    buckets: [
      { id: 'b1', x: 2, width: 4.2, capacity: 3, drift: { speed: 0.04, minX: 0.5, maxX: 7 } },
      { id: 'b2', x: 14, width: 4.2, capacity: 3, drift: { speed: -0.035, minX: 12, maxX: 17 } },
      { id: 'b3', x: 25, width: 4.2, capacity: 3, drift: { speed: 0.045, minX: 22, maxX: 27.5 } },
    ],
    drops: dropPairs(35, 7, 94, [8, 24]),
    rocks: [],
  }),
};

const pinCushion: SmilefallStage = {
  metadata: {
    number: 4,
    slug: 'pin-cushion',
    title: 'Pin Cushion',
    tier: 'chuckle',
    tagline: 'The first sharp thing has arrived.',
    challenge: 'The floor still bounces. The clearly marked spike beds pop on contact.',
    features: ['first lethal spikes', '5-smile reserve', 'safe floor'],
    mechanics: ['shared-lean', 'flock-hop', 'fixed-spikes', 'reserve-budget'],
    parTicks: 980,
  },
  scenario: field({
    id: 'pin-cushion',
    name: 'Pin Cushion',
    moodId: 'chuckle',
    hopCharges: 4,
    hopRechargeTicks: 60,
    timeLimitTicks: 1500,
    buckets: [
      { id: 'b1', x: 2, width: 4.2, capacity: 3 },
      { id: 'b2', x: 13.9, width: 4.2, capacity: 3 },
      { id: 'b3', x: 25.8, width: 4.2, capacity: 3 },
    ],
    spikes: spikeStrips('pin', [
      [7.2, 20, 4.8],
      [19.7, 20, 4.8],
    ]),
    drops: dropRun(30, 14, 55, [5, 16, 27, 10, 22]),
    rocks: [],
  }),
};

const rockAlley: SmilefallStage = {
  metadata: {
    number: 5,
    slug: 'rock-alley',
    title: 'Rock Alley',
    tier: 'guffaw',
    tagline: 'Round rocks bruise. Spiked rocks pop.',
    challenge: 'Read the silhouette, find the gap, and spend hops only on the sharp walls.',
    features: ['plain + spiked rocks', 'rock walls', '6-smile reserve'],
    mechanics: ['shared-lean', 'flock-hop', 'plain-rocks', 'spiked-rocks', 'rock-walls', 'reserve-budget'],
    parTicks: 1100,
  },
  scenario: field({
    id: 'rock-alley',
    name: 'Rock Alley',
    moodId: 'guffaw',
    hopCharges: 5,
    hopRechargeTicks: 52,
    timeLimitTicks: 1650,
    buckets: [
      { id: 'b1', x: 3, width: 4.8, capacity: 4 },
      { id: 'b2', x: 24.2, width: 4.8, capacity: 4 },
    ],
    drops: dropRun(35, 14, 65, [9, 17, 6, 25]),
    rocks: [
      ...rockRun(90, 7, 115, [5, 9, 13], 0.24, 'pebble', 'plain'),
      ...rockWall(520, [4, 7, 10, 13], 10, 0.25, 'boulder', 'spiked'),
      ...rockWall(980, [4, 7, 10, 13], 4, 0.27, 'pebble', 'spiked'),
    ],
  }),
};

const splitDecision: SmilefallStage = {
  metadata: {
    number: 6,
    slug: 'split-decision',
    title: 'Split Decision',
    tier: 'guffaw',
    tagline: 'Buckets in the corners. Smiles down the middle. Pick a side.',
    challenge: 'Commit each shared stream early while mixed rocks cross the center.',
    features: ['corner buckets', 'centre streams', 'mixed rocks'],
    mechanics: ['shared-lean', 'flock-hop', 'plain-rocks', 'spiked-rocks', 'split-targets', 'center-streams'],
    parTicks: 1180,
  },
  scenario: field({
    id: 'split-decision',
    name: 'Split Decision',
    moodId: 'guffaw',
    hopCharges: 4,
    hopRechargeTicks: 58,
    timeLimitTicks: 1700,
    buckets: [
      { id: 'b1', x: 0.6, width: 5, capacity: 5 },
      { id: 'b2', x: 26.4, width: 5, capacity: 5 },
    ],
    drops: [
      ...dropRun(35, 8, 65, [15, 17, 16]),
      ...dropPairs(590, 4, 100, [14, 18]),
    ],
    rocks: [
      ...rockRun(160, 6, 145, [8, 12], 0.23, 'boulder', 'plain'),
      ...rockRun(420, 3, 260, [10], 0.25, 'pebble', 'spiked'),
    ],
  }),
};

const swarmHour: SmilefallStage = {
  metadata: {
    number: 7,
    slug: 'swarm-hour',
    title: 'Swarm Hour',
    tier: 'cackle',
    tagline: 'Three at a time, five narrow pails, and one shared lean.',
    challenge: 'Keep a whole volley aligned while the mixed rock traffic closes in.',
    features: ['volley drops', '5 narrow buckets', 'mixed hazards'],
    mechanics: ['shared-lean', 'flock-hop', 'plain-rocks', 'spiked-rocks', 'volley-drops', 'narrow-buckets'],
    parTicks: 1280,
  },
  scenario: field({
    id: 'swarm-hour',
    name: 'Swarm Hour',
    moodId: 'cackle',
    hopCharges: 5,
    hopRechargeTicks: 50,
    timeLimitTicks: 1750,
    buckets: [
      { id: 'b1', x: 1, width: 3.4, capacity: 2 },
      { id: 'b2', x: 7, width: 3.4, capacity: 2 },
      { id: 'b3', x: 13, width: 3.4, capacity: 2 },
      { id: 'b4', x: 19, width: 3.4, capacity: 2 },
      { id: 'b5', x: 25, width: 3.4, capacity: 2 },
    ],
    drops: [
      ...dropVolley(35, 5, 112, [6, 16, 26]),
      ...dropRun(650, 2, 90, [11, 21]),
    ],
    rocks: [
      ...rockRun(150, 7, 125, [6, 10, 14], 0.27, 'pebble', 'plain'),
      ...rockRun(470, 4, 210, [8, 13], 0.22, 'boulder', 'spiked'),
    ],
  }),
};

const stairMaster: SmilefallStage = {
  metadata: {
    number: 8,
    slug: 'stair-master',
    title: 'Stair Master',
    tier: 'guffaw',
    tagline: 'The room grows upward and the safe route becomes a staircase.',
    challenge: 'Use the landings to guide the flock down through a tall, spiked room.',
    features: ['vertical room', 'walkways', 'spiked landings'],
    mechanics: ['shared-lean', 'flock-hop', 'fixed-spikes', 'platforms', 'vertical-camera'],
    parTicks: 1450,
  },
  scenario: {
    id: 'stair-master',
    name: 'Stair Master',
    width: 32,
    height: 30,
    viewHeight: 17,
    ticksPerSecond: TICKS_PER_SECOND,
    moodId: 'guffaw',
    hopCharges: 5,
    hopRechargeTicks: 42,
    timeLimitTicks: 2400,
    timeBonusPerTick: 2,
    dropY: 10,
    buckets: [
      { id: 'b1', x: 1, width: 4.4, capacity: 3 },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 3 },
      { id: 'b3', x: 26.6, width: 4.4, capacity: 3 },
    ],
    platforms: ledges('step', [
      [3, 16, 7],
      [12.5, 20, 7],
      [22, 24, 7],
    ]),
    spikes: spikeStrips('stair', [
      [0, 30, 1],
      [6, 30, 7],
      [19, 30, 7],
      [8, 16, 2],
      [17.5, 20, 2],
    ]),
    // Keep each entry lane readable: the old x=9 drop began directly above
    // stair4 and could pop before a player had a fair steering window.
    drops: dropRun(20, 15, 60, [4, 12, 16, 22, 28]),
    rocks: [],
  },
};

const lowCeiling: SmilefallStage = {
  metadata: {
    number: 9,
    slug: 'low-ceiling',
    title: 'Low Ceiling',
    tier: 'cackle',
    tagline: 'Every bucket has a roof. Some roofs have teeth underneath.',
    challenge: 'Walk off each landing, fold back beneath it, and avoid the downward spikes.',
    features: ['low roofs', 'downward spikes', 'vertical route'],
    mechanics: ['shared-lean', 'flock-hop', 'fixed-spikes', 'platforms', 'vertical-camera', 'low-ceilings', 'downward-spikes'],
    parTicks: 1550,
  },
  scenario: {
    id: 'low-ceiling',
    name: 'Low Ceiling',
    width: 32,
    height: 30,
    viewHeight: 18,
    ticksPerSecond: TICKS_PER_SECOND,
    moodId: 'cackle',
    hopCharges: 4,
    hopRechargeTicks: 50,
    timeLimitTicks: 2500,
    timeBonusPerTick: 2,
    dropY: 9,
    buckets: [
      { id: 'b1', x: 2, width: 4.4, capacity: 3 },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 3 },
      { id: 'b3', x: 25.6, width: 4.4, capacity: 3 },
    ],
    platforms: ledges('roof', [
      [0, 17, 8.5],
      [11.8, 13, 8.5],
      [23.5, 17, 8.5],
    ]),
    spikes: spikeStrips('ceiling', [
      [3, 17.9, 2.4, 'down'],
      [14.8, 13.9, 2.4, 'down'],
      [26.5, 17.9, 2.4, 'down'],
      [8.5, 30, 3],
      [20.5, 30, 3],
    ]),
    drops: dropRun(20, 14, 54, [10, 22, 5, 27, 16]),
    rocks: [],
  },
};

const skyLadder: SmilefallStage = {
  metadata: {
    number: 10,
    slug: 'sky-ladder',
    title: 'Sky Ladder',
    tier: 'cackle',
    tagline: 'Climb the staircase and fill buckets on three different floors.',
    challenge: 'Combine shared steering, landings, stacked buckets, and every kind of spike.',
    features: ['stacked buckets', 'stair climb', 'plain + spiked rocks'],
    mechanics: [
      'shared-lean',
      'flock-hop',
      'plain-rocks',
      'spiked-rocks',
      'fixed-spikes',
      'platforms',
      'vertical-camera',
      'stacked-buckets',
    ],
    parTicks: 1800,
  },
  scenario: {
    id: 'sky-ladder',
    name: 'Sky Ladder',
    width: 32,
    height: 36,
    viewHeight: 17,
    ticksPerSecond: TICKS_PER_SECOND,
    moodId: 'cackle',
    hopCharges: 6,
    hopRechargeTicks: 35,
    timeLimitTicks: 3200,
    timeBonusPerTick: 3,
    dropY: 21,
    buckets: [
      { id: 'b1', x: 1, width: 4.4, capacity: 3 },
      { id: 'b2', x: 6, width: 4.4, capacity: 3 },
      { id: 'b3', x: 28.6, width: 3.2, capacity: 2, baseY: 27 },
      { id: 'b4', x: 19.5, width: 3.2, capacity: 2, baseY: 18 },
    ],
    platforms: ledges('ladder', [
      [11, 33, 6.5],
      [18.5, 30, 6.5],
      [26, 27, 6],
      [18.5, 24, 6.5],
      [11, 21, 6.5],
      [18.5, 18, 6.5],
    ]),
    spikes: spikeStrips('sky', [
      [11, 36, 7],
      [19, 36, 7],
      [23, 30, 2],
      [18.5, 24, 2],
    ]),
    // Two lanes feed the upper route so the top pail is achievable with the
    // shared lean + hop controls instead of depending on a lucky rebound.
    drops: dropRun(20, 18, 55, [3, 8, 18, 10, 22, 6]),
    rocks: [
      ...rockRun(180, 7, 145, [16, 20, 24], 0.24, 'pebble', 'plain'),
      // One late spiked boulder asks for a final read without letting a dense
      // rock train erase the entire flock during the ladder climb.
      ...rockRun(900, 1, 210, [14], 0.22, 'boulder', 'spiked', 0.02),
    ],
  },
};

// Catalog-only challenge stages. They can grow without lengthening the arcade run.
const bounceHouse: SmilefallStage = {
  metadata: {
    number: 11,
    slug: 'bounce-house',
    title: 'Bounce House',
    tier: 'chuckle',
    tagline: 'No hazards. The whole score is speed and clean catches.',
    challenge: 'Sweep a fixed flock through three buckets before the clock drains the bonus.',
    features: ['safe time trial', 'rapid volleys', 'clean-catch scoring'],
    mechanics: ['shared-lean', 'flock-hop', 'volley-drops'],
    parTicks: 620,
  },
  scenario: field({
    id: 'bounce-house',
    name: 'Bounce House',
    moodId: 'chuckle',
    hopCharges: 4,
    hopRechargeTicks: 48,
    timeLimitTicks: 1250,
    timeBonusPerTick: 6,
    buckets: [
      { id: 'b1', x: 3, width: 4.4, capacity: 4 },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 4 },
      { id: 'b3', x: 24.6, width: 4.4, capacity: 4 },
    ],
    drops: [
      ...dropVolley(20, 4, 42, [8, 16, 24]),
      ...dropRun(210, 2, 42, [12, 20]),
    ],
    rocks: [],
  }),
};

const secondWind: SmilefallStage = {
  metadata: {
    number: 12,
    slug: 'second-wind',
    title: 'Second Wind',
    tier: 'chuckle',
    tagline: 'A miss is another lap across the room.',
    challenge: 'Fill two deep corner buckets as quickly and cleanly as possible.',
    features: ['corner buckets', 'safe time trial', 'long traversals'],
    mechanics: ['shared-lean', 'flock-hop', 'split-targets'],
    parTicks: 760,
  },
  scenario: field({
    id: 'second-wind',
    name: 'Second Wind',
    moodId: 'chuckle',
    hopCharges: 4,
    hopRechargeTicks: 45,
    timeLimitTicks: 1600,
    timeBonusPerTick: 8,
    buckets: [
      { id: 'b1', x: 0, width: 4.4, capacity: 6 },
      { id: 'b2', x: 27.6, width: 4.4, capacity: 6 },
    ],
    drops: dropVolley(20, 7, 28, [13, 19]),
    rocks: [],
  }),
};

const smileyStorm: SmilefallStage = {
  metadata: {
    number: 13,
    slug: 'smiley-storm',
    title: 'Smiley Storm',
    tier: 'cackle',
    tagline: 'Four wide volleys turn shared steering into crowd control.',
    challenge: 'Line up whole rows while a dense field of plain rocks breaks your combo.',
    features: ['4-wide volleys', 'plain-rock storm', 'high score challenge'],
    mechanics: ['shared-lean', 'flock-hop', 'plain-rocks', 'volley-drops'],
    parTicks: 1450,
  },
  scenario: field({
    id: 'smiley-storm',
    name: 'Smiley Storm',
    moodId: 'cackle',
    hopCharges: 5,
    hopRechargeTicks: 42,
    timeLimitTicks: 1850,
    buckets: [
      { id: 'b1', x: 1.5, width: 4.2, capacity: 6 },
      { id: 'b2', x: 9, width: 4.2, capacity: 6 },
      { id: 'b3', x: 16.5, width: 4.2, capacity: 6 },
      { id: 'b4', x: 24, width: 4.2, capacity: 6 },
    ],
    drops: dropVolley(30, 8, 70, [6.6, 14.1, 21.6, 29.1]),
    rocks: rockRun(80, 24, 48, [3, 7, 11, 15, 5, 13], 0.28, 'pebble', 'plain'),
  }),
};

const chonkParade: SmilefallStage = {
  metadata: {
    number: 14,
    slug: 'chonk-parade',
    title: 'Chonk Parade',
    tier: 'cackle',
    tagline: 'Huge round rocks hide a few unmistakably spiked ones.',
    challenge: 'Read each silhouette early. The harmless-looking route is usually the right one.',
    features: ['giant rocks', 'mixed silhouettes', 'catalog challenge'],
    mechanics: ['shared-lean', 'flock-hop', 'plain-rocks', 'spiked-rocks'],
    parTicks: 1320,
  },
  scenario: field({
    id: 'chonk-parade',
    name: 'Chonk Parade',
    moodId: 'cackle',
    hopCharges: 4,
    hopRechargeTicks: 52,
    timeLimitTicks: 1800,
    buckets: [
      { id: 'b1', x: 5, width: 5, capacity: 3 },
      { id: 'b2', x: 14, width: 5, capacity: 3 },
      { id: 'b3', x: 23, width: 5, capacity: 3 },
    ],
    drops: dropRun(40, 17, 65, [8, 25, 16, 4, 20]),
    rocks: [
      ...rockRun(100, 7, 150, [5, 10, 15], 0.2, 'chonk', 'plain'),
      ...rockRun(320, 5, 190, [7, 12], 0.24, 'boulder', 'spiked'),
    ],
  }),
};

/** The public level catalog can be broader than a single arcade run. */
export const smilefallCatalog: readonly SmilefallStage[] = [
  firstGiggle,
  wobbleSeason,
  bucketBrigade,
  pinCushion,
  rockAlley,
  splitDecision,
  swarmHour,
  stairMaster,
  lowCeiling,
  skyLadder,
  bounceHouse,
  secondWind,
  smileyStorm,
  chonkParade,
];

/** Version 1's deliberately paced ten-stage arcade progression. */
export const smilefallArcadeRun: readonly SmilefallStage[] = [
  firstGiggle,
  wobbleSeason,
  bucketBrigade,
  pinCushion,
  rockAlley,
  splitDecision,
  swarmHour,
  stairMaster,
  lowCeiling,
  skyLadder,
];

export function stageBySlug(slug: string): SmilefallStage | undefined {
  return smilefallCatalog.find((stage) => stage.metadata.slug === slug);
}

export function stageByNumber(numberValue: number): SmilefallStage | undefined {
  return smilefallCatalog.find((stage) => stage.metadata.number === numberValue);
}

export function arcadeStageByNumber(numberValue: number): SmilefallStage | undefined {
  return smilefallArcadeRun[numberValue - 1];
}

export function nextArcadeStage(slug: string): SmilefallStage | undefined {
  const index = smilefallArcadeRun.findIndex((stage) => stage.metadata.slug === slug);
  return index === -1 ? undefined : smilefallArcadeRun[index + 1];
}

/** @deprecated Use nextArcadeStage; this alias keeps the first viewer moving. */
export const nextStage = nextArcadeStage;

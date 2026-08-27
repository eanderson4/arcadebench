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
    tagline: 'Three buckets. Plenty of smilies. One shared steering wheel.',
    challenge: 'Learn that leaning moves every smiley in the sky at the same time.',
    features: ['3 buckets', 'gentle pebbles', 'rocks bruise'],
    parTicks: 900,
  },
  scenario: field({
    id: 'first-giggle',
    name: 'First Giggle',
    moodId: 'giggle',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 6,
    hopCharges: 3,
    hopRechargeTicks: 90,
    timeLimitTicks: 1200,
    buckets: [
      { id: 'b1', x: 3, width: 4.4, capacity: 3 },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 3 },
      { id: 'b3', x: 24.6, width: 4.4, capacity: 3 },
    ],
    drops: dropRun(40, 18, 54, [7, 18, 24, 4, 14, 28]),
    rocks: rockRun(120, 5, 150, [6, 11, 8], 0.16, 'pebble'),
  }),
};

const rockSeason: SmilefallStage = {
  metadata: {
    number: 2,
    slug: 'rock-season',
    title: 'Rock Season',
    tier: 'chuckle',
    tagline: 'The sky is busy and the rocks are not sorry.',
    challenge: 'Hop the whole flock over incoming rocks without losing the bucket you were aiming at.',
    features: ['4 buckets', 'rock volleys', 'paired drops'],
    parTicks: 1150,
  },
  scenario: field({
    id: 'rock-season',
    name: 'Rock Season',
    moodId: 'chuckle',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 6,
    hopCharges: 3,
    hopRechargeTicks: 80,
    timeLimitTicks: 1500,
    buckets: [
      { id: 'b1', x: 2.2, width: 3.6, capacity: 3 },
      { id: 'b2', x: 9.6, width: 3.6, capacity: 3 },
      { id: 'b3', x: 17, width: 3.6, capacity: 3 },
      { id: 'b4', x: 24.4, width: 3.6, capacity: 3 },
    ],
    drops: [
      ...dropRun(36, 12, 46, [5, 24, 14, 29]),
      ...dropPairs(560, 6, 92, [7, 23]),
    ],
    rocks: [
      ...rockRun(90, 8, 120, [5, 13, 9], 0.2, 'boulder', 0.02),
      ...rockRun(600, 5, 150, [7, 12], 0.26, 'pebble'),
    ],
  }),
};

const wobbleRow: SmilefallStage = {
  metadata: {
    number: 3,
    slug: 'wobble-row',
    title: 'Wobble Row',
    tier: 'guffaw',
    tagline: 'The buckets refuse to stand still and a chonk is on the way.',
    challenge: 'Lead the drifting buckets while a very large rock takes up the middle lane.',
    features: ['drifting buckets', 'chonk rocks', 'deeper buckets'],
    parTicks: 1050,
  },
  scenario: field({
    id: 'wobble-row',
    name: 'Wobble Row',
    moodId: 'guffaw',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 6,
    hopCharges: 2,
    hopRechargeTicks: 70,
    timeLimitTicks: 1400,
    buckets: [
      { id: 'b1', x: 3, width: 4.2, capacity: 4, drift: { speed: 0.03, minX: 1, maxX: 6.5 } },
      { id: 'b2', x: 14, width: 4.2, capacity: 4, drift: { speed: -0.035, minX: 12, maxX: 17 } },
      { id: 'b3', x: 25, width: 4.2, capacity: 4, drift: { speed: 0.04, minX: 22.5, maxX: 27.5 } },
    ],
    drops: dropRun(30, 24, 44, [8, 21, 3, 15, 28, 11]),
    rocks: [
      ...rockRun(100, 6, 130, [4, 10, 14], 0.24, 'boulder', 0.03),
      ...rockRun(240, 4, 210, [8], 0.19, 'chonk'),
    ],
  }),
};

/**
 * 04 isolates the steering wheel: no rocks at all, but every bucket is sliding.
 * If leading a moving target with one shared lean does not feel good here, it
 * will never feel good anywhere.
 */
const bucketBrigade: SmilefallStage = {
  metadata: {
    number: 4,
    slug: 'bucket-brigade',
    title: 'Bucket Brigade',
    tier: 'chuckle',
    tagline: 'Nothing is trying to hurt you. Everything is running away.',
    challenge: 'No rocks — just three buckets sprinting back and forth. Lead them.',
    features: ['zero rocks', 'fast drifting buckets', 'pure steering'],
    parTicks: 1100,
  },
  scenario: field({
    id: 'bucket-brigade',
    name: 'Bucket Brigade',
    moodId: 'chuckle',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 6,
    hopCharges: 2,
    hopRechargeTicks: 90,
    timeLimitTicks: 1400,
    buckets: [
      { id: 'b1', x: 2, width: 4, capacity: 4, drift: { speed: 0.055, minX: 0.5, maxX: 8.5 } },
      { id: 'b2', x: 14, width: 4, capacity: 4, drift: { speed: -0.05, minX: 13, maxX: 18 } },
      { id: 'b3', x: 24, width: 4, capacity: 4, drift: { speed: 0.06, minX: 22.5, maxX: 27.5 } },
    ],
    drops: dropRun(30, 20, 48, [6, 20, 15, 27, 3]),
    rocks: [],
  }),
};

/**
 * 05 isolates the hop: a narrow, busy gauntlet where the buckets are far apart
 * and rocks keep arriving in walls with exactly one hole in them.
 */
const rockAlley: SmilefallStage = {
  metadata: {
    number: 5,
    slug: 'rock-alley',
    title: 'Rock Alley',
    tier: 'guffaw',
    tagline: 'Two buckets, a very long walk, and traffic the whole way.',
    challenge: 'Rock walls with one gap. Spend hops to get through, not to look busy.',
    features: ['2 far buckets', 'rock walls', 'fast hop refill'],
    parTicks: 1250,
  },
  scenario: field({
    id: 'rock-alley',
    name: 'Rock Alley',
    moodId: 'guffaw',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 5,
    hopCharges: 4,
    hopRechargeTicks: 55,
    timeLimitTicks: 1500,
    buckets: [
      { id: 'b1', x: 4, width: 4.6, capacity: 4 },
      { id: 'b2', x: 23, width: 4.6, capacity: 4 },
    ],
    drops: dropRun(40, 20, 60, [10, 18, 6, 25]),
    rocks: [
      ...rockRun(80, 14, 55, [5, 9, 13, 7], 0.3, 'pebble'),
      ...rockWall(700, [4, 7, 10, 13], 10, 0.26, 'pebble'),
      ...rockWall(1000, [4, 7, 10, 13], 4, 0.26, 'pebble'),
    ],
  }),
};

/**
 * 06 is the thesis statement of the whole game: the buckets are in opposite
 * corners and every smiley drops down the middle, so the flock has to commit
 * to one side together and live with it.
 */
const splitDecision: SmilefallStage = {
  metadata: {
    number: 6,
    slug: 'split-decision',
    title: 'Split Decision',
    tier: 'chuckle',
    tagline: 'Buckets in the corners. Smilies down the middle. Pick a side.',
    challenge: 'One steering wheel, two destinations. Commit early or lose the whole volley.',
    features: ['corner buckets', 'centre drops', 'lazy boulders'],
    parTicks: 1300,
  },
  scenario: field({
    id: 'split-decision',
    name: 'Split Decision',
    moodId: 'chuckle',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 6,
    hopCharges: 3,
    hopRechargeTicks: 85,
    timeLimitTicks: 1600,
    buckets: [
      { id: 'b1', x: 0.6, width: 5, capacity: 5 },
      { id: 'b2', x: 26.4, width: 5, capacity: 5 },
    ],
    drops: [
      // Singles first, so the choice is obvious; then pairs, so it hurts.
      ...dropRun(36, 10, 58, [15, 17, 16]),
      ...dropPairs(640, 7, 74, [14, 18]),
    ],
    rocks: rockRun(150, 9, 105, [8, 12], 0.26, 'boulder'),
  }),
};

/**
 * 07 is the control group for the rock rule: the only stage where a rock still
 * deletes a smiley outright. Play it back to back with 05 to feel the
 * difference between bruising and smashing.
 */
const chonkParade: SmilefallStage = {
  metadata: {
    number: 7,
    slug: 'chonk-parade',
    title: 'Chonk Parade',
    tier: 'guffaw',
    tagline: 'Enormous, slow, and entirely uninterested in your feelings.',
    challenge: 'The one stage where rocks smash instead of bruise. Read the gaps early.',
    features: ['rocks SMASH', 'chonk lanes', 'slow traffic'],
    parTicks: 1300,
  },
  scenario: field({
    id: 'chonk-parade',
    name: 'Chonk Parade',
    moodId: 'guffaw',
    rockRule: 'smash',
    floorRule: 'splat',
    frownLimit: 6,
    hopCharges: 3,
    hopRechargeTicks: 70,
    timeLimitTicks: 1700,
    buckets: [
      { id: 'b1', x: 5, width: 5, capacity: 3 },
      { id: 'b2', x: 14, width: 5, capacity: 3 },
      { id: 'b3', x: 23, width: 5, capacity: 3 },
    ],
    drops: dropRun(40, 20, 62, [8, 25, 16, 4, 20]),
    rocks: [
      ...rockRun(100, 9, 120, [4.5, 9, 13.5], 0.22, 'chonk'),
      ...rockRun(260, 6, 150, [7, 11], 0.26, 'boulder', 0.02),
    ],
  }),
};

/**
 * 08 turns the volume up: whole volleys drop at once into five narrow pails,
 * so the shared lean is always the wrong answer for somebody.
 */
const swarmHour: SmilefallStage = {
  metadata: {
    number: 8,
    slug: 'swarm-hour',
    title: 'Swarm Hour',
    tier: 'cackle',
    tagline: 'Three at a time, five narrow pails, and the sky is full of gravel.',
    challenge: 'Volleys of three. Whatever you lean is wrong for at least one of them.',
    features: ['5 narrow buckets', 'volley drops', 'mixed rocks'],
    parTicks: 1400,
  },
  scenario: field({
    id: 'swarm-hour',
    name: 'Swarm Hour',
    moodId: 'cackle',
    rockRule: 'bruise',
    floorRule: 'splat',
    frownLimit: 7,
    hopCharges: 4,
    hopRechargeTicks: 60,
    timeLimitTicks: 1600,
    buckets: [
      { id: 'b1', x: 1, width: 3.4, capacity: 2 },
      { id: 'b2', x: 7, width: 3.4, capacity: 2 },
      { id: 'b3', x: 13, width: 3.4, capacity: 2 },
      { id: 'b4', x: 19, width: 3.4, capacity: 2 },
      { id: 'b5', x: 25, width: 3.4, capacity: 2 },
    ],
    drops: dropVolley(40, 8, 90, [6, 16, 26]),
    rocks: [
      ...rockRun(150, 8, 110, [6, 10, 14], 0.28, 'pebble'),
      ...rockRun(500, 4, 170, [8], 0.18, 'chonk'),
    ],
  }),
};

/**
 * 09 is the volume knob turned all the way up: five smilies at a time into
 * four pails while the sky fills with rocks. Nothing here is subtle — it is
 * the stage for finding out whether the shared wheel still reads when there
 * are ten smilies obeying it at once.
 */
const smileyStorm: SmilefallStage = {
  metadata: {
    number: 9,
    slug: 'smiley-storm',
    title: 'Smiley Storm',
    tier: 'cackle',
    tagline: 'Four at a time, forty-nine rocks, and one lean to line them all up.',
    challenge: 'The columns match the buckets. Line the whole volley up and post four at once.',
    features: ['4-wide volleys', '64 smilies', '49 rocks'],
    parTicks: 1500,
  },
  scenario: field({
    id: 'smiley-storm',
    name: 'Smiley Storm',
    moodId: 'cackle',
    rockRule: 'bruise',
    floorRule: 'splat',
    // Generous, because at this density losing smilies is the weather, not a
    // mistake. 70 drop and only 28 are needed.
    frownLimit: 24,
    hopCharges: 5,
    hopRechargeTicks: 45,
    timeLimitTicks: 1800,
    buckets: [
      // Deep pails on purpose: with this many smilies falling, shallow buckets
      // fill themselves by accident and the stage is over in ten seconds.
      { id: 'b1', x: 1.5, width: 4.2, capacity: 7 },
      { id: 'b2', x: 9, width: 4.2, capacity: 7 },
      { id: 'b3', x: 16.5, width: 4.2, capacity: 7 },
      { id: 'b4', x: 24, width: 4.2, capacity: 7 },
    ],
    // The columns are spaced exactly like the buckets and offset by three
    // units, so a single well-timed lean drops an entire volley into all four
    // pails at once. That is the whole lesson of the shared wheel, at volume.
    drops: dropVolley(30, 16, 48, [6.6, 14.1, 21.6, 29.1]),
    rocks: [
      ...rockRun(60, 32, 34, [3, 7, 11, 15, 5, 13], 0.3, 'pebble'),
      ...rockRun(200, 12, 90, [6, 12], 0.24, 'boulder', 0.03),
      ...rockRun(700, 5, 160, [9], 0.2, 'chonk'),
    ],
  }),
};

/**
 * 10 changes what a miss costs. Nothing breaks in here: the ground hands the
 * smiley straight back, bruised and worth half as much, so the roster is fixed
 * and the only real currency is time. It is a race, not a survival test.
 */
const bounceHouse: SmilefallStage = {
  metadata: {
    number: 10,
    slug: 'bounce-house',
    title: 'Bounce House',
    tier: 'chuckle',
    tagline: 'Nothing breaks in here. You only lose time.',
    challenge: 'Twelve smilies, twelve slots. The floor gives them back — every bounce halves what they pay.',
    features: ['fixed roster of 12', 'floor bounces', 'scored on speed'],
    parTicks: 600,
  },
  scenario: field({
    id: 'bounce-house',
    name: 'Bounce House',
    moodId: 'chuckle',
    rockRule: 'bruise',
    floorRule: 'bounce',
    // Nothing on this stage can remove a smiley, so the frown limit is
    // unreachable by construction. The clock is the whole threat.
    frownLimit: 1,
    hopCharges: 4,
    hopRechargeTicks: 50,
    timeLimitTicks: 1200,
    // Six points a tick makes finishing early worth far more than the catches
    // themselves, which is the entire point of the stage.
    timeBonusPerTick: 6,
    buckets: [
      { id: 'b1', x: 3, width: 4.4, capacity: 4 },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 4 },
      { id: 'b3', x: 24.6, width: 4.4, capacity: 4 },
    ],
    // Exactly twelve, all in the sky inside the first five seconds.
    drops: dropVolley(20, 4, 40, [8, 16, 24]),
    rocks: [],
  }),
};


/**
 * 11 is the introduction to a stacked stage, and the first one the camera has
 * to move for. Two pails sit on the ground in an open shaft; the rest of the
 * tower is a zig-zag of ledges climbing the right-hand side, and the pail at
 * the top starts off screen entirely. Fill the ground tier and the view pulls
 * back to show how much further up it goes.
 *
 * Everything about it is only possible because smilies bounce: the ground
 * hands them back, ledges hand them back for free, and the climb costs time
 * rather than lives.
 */
const stairMaster: SmilefallStage = {
  metadata: {
    number: 11,
    slug: 'stair-master',
    title: 'Stair Master',
    tier: 'chuckle',
    tagline: 'Fill the ground floor and the camera shows you the rest of the building.',
    challenge: 'Fifteen smilies, twelve slots. Three to spare, and the ground under the stairs is spiked.',
    features: ['stacked tiers', 'camera pulls back', 'spike strips'],
    parTicks: 1600,
  },
  scenario: {
    id: 'stair-master',
    name: 'Stair Master',
    width: 32,
    height: 36,
    // Only the bottom eighteen units are framed to begin with, so the top of
    // the tower is a reveal rather than a briefing.
    viewHeight: 16,
    ticksPerSecond: TICKS_PER_SECOND,
    moodId: 'chuckle',
    rockRule: 'bruise',
    floorRule: 'bounce',
    // Fifteen smilies, twelve slots: the fourth one lost is the run, whichever
    // way it goes. The frown limit is set to agree with that arithmetic rather
    // than to be a second, quieter budget.
    frownLimit: 4,
    hopCharges: 5,
    hopRechargeTicks: 35,
    timeLimitTicks: 3300,
    timeBonusPerTick: 3,
    // Smilies arrive halfway up so the opening framing has somewhere to put
    // them; the shaft on the left is deliberately clear of ledges.
    dropY: 22,
    buckets: [
      { id: 'b1', x: 1, width: 4.4, capacity: 4 },
      { id: 'b2', x: 6, width: 4.4, capacity: 4 },
      { id: 'b3', x: 28.6, width: 3.2, capacity: 2, baseY: 27 },
      { id: 'b4', x: 19.5, width: 3.2, capacity: 2, baseY: 18 },
    ],
    // Three columns, three units of rise per step, zig-zagging up. Three is
    // the number that matters: a free bounce lifts 3.2, so every step is
    // climbable without spending a hop. Same-column steps stay six apart so
    // nobody bonks their head on the one above.
    platforms: ledges('p', [
      [11, 33, 6.5],
      [18.5, 30, 6.5],
      [26, 27, 6],
      [18.5, 24, 6.5],
      [11, 21, 6.5],
      [18.5, 18, 6.5],
    ]),
    // Teeth where a mistake would otherwise be free. The ground under the
    // stairwell ends anyone who falls off the climb, and each landing has a
    // strip on the far side, so overshooting in the direction you are already
    // travelling is the thing that costs you.
    spikes: spikeStrips('x', [
      [11, 36, 7],
      [19, 36, 7],
      [23, 30, 2],
      [18.5, 24, 2],
    ]),
    // Fifteen smilies for twelve slots. Lose four and the run is over on the
    // spot: there is no longer any way to fill the buckets.
    drops: dropRun(20, 15, 40, [3, 8, 5, 10, 1.5]),
    rocks: [],
  },
};

/**
 * 12 is the visual-language stage. The ground is a trampoline and the rocks
 * are spikes, so the smilies show up as balloons: nothing that lands can
 * break, and everything in the air can pop. Play it straight after 10 to see
 * the same floor rule with the opposite sky.
 */
const pinCushion: SmilefallStage = {
  metadata: {
    number: 12,
    slug: 'pin-cushion',
    title: 'Pin Cushion',
    tier: 'guffaw',
    tagline: 'Soft floor, sharp sky. The smilies came as balloons and they know it.',
    challenge: 'The ground cannot hurt them. The spikes end them outright. Stay low, stay lucky.',
    features: ['balloons + spikes', 'rocks POP', 'floor bounces'],
    parTicks: 1150,
  },
  scenario: field({
    id: 'pin-cushion',
    name: 'Pin Cushion',
    moodId: 'guffaw',
    rockRule: 'smash',
    floorRule: 'bounce',
    frownLimit: 11,
    hopCharges: 4,
    hopRechargeTicks: 50,
    timeLimitTicks: 1600,
    timeBonusPerTick: 3,
    buckets: [
      { id: 'b1', x: 2, width: 4.2, capacity: 3 },
      { id: 'b2', x: 13.9, width: 4.2, capacity: 3 },
      { id: 'b3', x: 25.8, width: 4.2, capacity: 3 },
    ],
    drops: dropRun(30, 26, 40, [7, 20, 12, 27, 3]),
    rocks: [
      // A low lane on purpose: bouncing along the floor is the safe-looking
      // move, so that is exactly where the spikes live.
      ...rockRun(90, 8, 108, [15.9], 0.24, 'pebble'),
      ...rockRun(150, 8, 118, [10, 13], 0.23, 'boulder', 0.02),
      ...rockRun(520, 4, 190, [8], 0.19, 'chonk'),
    ],
  }),
};

/**
 * 13 is the purest expression of the bouncy floor: two pails, one at each end
 * of the field, and a fixed handful of smilies that simply cannot be lost. A
 * miss is a lap, not a death, so the entire stage is a question of how fast
 * you can sweep the flock back and forth.
 */
const secondWind: SmilefallStage = {
  metadata: {
    number: 13,
    slug: 'second-wind',
    title: 'Second Wind',
    tier: 'chuckle',
    tagline: 'A miss is a lap, not a loss. Now do it quickly.',
    challenge: 'Fourteen smilies, two deep pails at opposite walls. The floor keeps handing them back.',
    features: ['deep corner pails', 'nothing can break', 'scored on speed'],
    parTicks: 700,
  },
  scenario: field({
    id: 'second-wind',
    name: 'Second Wind',
    moodId: 'chuckle',
    rockRule: 'bruise',
    floorRule: 'bounce',
    frownLimit: 1,
    hopCharges: 4,
    hopRechargeTicks: 45,
    timeLimitTicks: 1600,
    // Speed is the whole score here, same as Bounce House.
    timeBonusPerTick: 8,
    buckets: [
      // Flush against the walls, so a smiley can never wedge itself in a slot
      // too narrow to bounce out of.
      { id: 'b1', x: 0, width: 4.4, capacity: 6 },
      { id: 'b2', x: 27.6, width: 4.4, capacity: 6 },
    ],
    drops: dropVolley(20, 7, 26, [13, 19]),
    rocks: [],
  }),
};

/**
 * 14 uses ledges as furniture rather than stairs. Every pail has a roof over
 * it, so the drops land on the roof and have to be walked off the edge and
 * folded back underneath — a shape of problem that only exists once smilies
 * survive hitting things.
 */
const lowCeiling: SmilefallStage = {
  metadata: {
    number: 14,
    slug: 'low-ceiling',
    title: 'Low Ceiling',
    tier: 'guffaw',
    tagline: 'Every bucket has a roof on it. Go around.',
    challenge: 'Bounce along the ledges, walk the flock off the edge, and fold it back underneath.',
    features: ['ledges as obstacles', 'spiked roof', 'floor bounces'],
    parTicks: 1000,
  },
  scenario: field({
    id: 'low-ceiling',
    name: 'Low Ceiling',
    moodId: 'guffaw',
    rockRule: 'bruise',
    floorRule: 'bounce',
    // Thirteen smilies, nine slots: four to spare, and the roof takes them.
    frownLimit: 5,
    hopCharges: 3,
    hopRechargeTicks: 60,
    timeLimitTicks: 1800,
    timeBonusPerTick: 4,
    buckets: [
      { id: 'b1', x: 2, width: 4.4, capacity: 3 },
      { id: 'b2', x: 13.8, width: 4.4, capacity: 3 },
      { id: 'b3', x: 25, width: 4.4, capacity: 3 },
    ],
    // Flush to the walls at both ends so nothing can wedge itself in a slot.
    platforms: ledges('c', [
      [0, 12, 8.5],
      [12, 9, 8],
      [23.5, 12, 8.5],
    ]),
    // The middle roof is not a rest stop. Land on the ends of it or not at all.
    spikes: spikeStrips('z', [[14.5, 9, 3]]),
    // Thirteen smilies for nine slots: four spare, and the roof takes them.
    drops: dropRun(24, 13, 52, [10, 21.5, 4, 27, 16]),
    rocks: [],
  }),
};

/**
 * 15 is the finale: the stacked tower of 11 with the spiky sky of 12. The
 * climb itself is safe — ledges never bruise anybody — but the rocks sweep
 * straight through the stairwell, and up here a hit is a pop.
 */
const skyLadder: SmilefallStage = {
  metadata: {
    number: 15,
    slug: 'sky-ladder',
    title: 'Sky Ladder',
    tier: 'cackle',
    tagline: 'The stairs are safe. Everything around them is not.',
    challenge: 'Four tiers, a spiked stairwell, and rocks crossing every landing. Twenty balloons for ten slots.',
    features: ['stacked tiers', 'rocks POP', 'spike strips'],
    parTicks: 1900,
  },
  scenario: {
    id: 'sky-ladder',
    name: 'Sky Ladder',
    width: 32,
    height: 30,
    viewHeight: 16,
    ticksPerSecond: TICKS_PER_SECOND,
    moodId: 'cackle',
    rockRule: 'smash',
    floorRule: 'bounce',
    // Twenty balloons, ten slots: ten to spare, and the sky will take most of
    // them. This is the finale; it is supposed to be close.
    frownLimit: 11,
    hopCharges: 5,
    hopRechargeTicks: 35,
    timeLimitTicks: 2600,
    timeBonusPerTick: 3,
    dropY: 16,
    buckets: [
      { id: 'b1', x: 1, width: 4.4, capacity: 3 },
      { id: 'b2', x: 6, width: 4.4, capacity: 3 },
      { id: 'b3', x: 28.6, width: 3.2, capacity: 2, baseY: 21 },
      { id: 'b4', x: 19.5, width: 3.2, capacity: 2, baseY: 12 },
    ],
    platforms: ledges('q', [
      [11, 27, 6.5],
      [18.5, 24, 6.5],
      [26, 21, 6],
      [18.5, 18, 6.5],
      [11, 15, 6.5],
      [18.5, 12, 6.5],
    ]),
    spikes: spikeStrips('y', [
      [11, 30, 7],
      [19, 30, 7],
      [23, 24, 2],
    ]),
    drops: dropRun(20, 20, 32, [3, 8, 5, 10, 1.5, 6]),
    rocks: [
      ...rockRun(120, 11, 84, [19, 23, 16], 0.28, 'pebble'),
      ...rockRun(300, 6, 150, [13, 25], 0.22, 'boulder', 0.02),
    ],
  },
};

/** Stage order is the arcade run order; the catalog shows the same list. */
export const smilefallCatalog: readonly SmilefallStage[] = [
  firstGiggle,
  rockSeason,
  wobbleRow,
  bucketBrigade,
  rockAlley,
  splitDecision,
  chonkParade,
  swarmHour,
  smileyStorm,
  bounceHouse,
  stairMaster,
  pinCushion,
  secondWind,
  lowCeiling,
  skyLadder,
];

export function stageBySlug(slug: string): SmilefallStage | undefined {
  return smilefallCatalog.find((stage) => stage.metadata.slug === slug);
}

export function stageByNumber(numberValue: number): SmilefallStage | undefined {
  return smilefallCatalog.find((stage) => stage.metadata.number === numberValue);
}

export function nextStage(slug: string): SmilefallStage | undefined {
  const index = smilefallCatalog.findIndex((stage) => stage.metadata.slug === slug);
  return index === -1 ? undefined : smilefallCatalog[index + 1];
}

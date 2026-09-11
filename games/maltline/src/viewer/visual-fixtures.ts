import { MALTLINE_CAMPAIGN } from '../core/campaign';
import { FIXED_SCALE, MaltlineEngine } from '../core/engine';
import { mulberry32 } from '../core/rng';
import type {
  GameEvent,
  MaltlineScenario,
  MaltlineState,
  PlayerState,
} from '../core/types';
import { prepareMaltlineFonts } from './fonts';
import {
  countdownPresentation,
  gameOverPresentation,
  instructionPresentation,
  stageCardPresentation,
  stageClearPresentation,
  titlePresentation,
  victoryPresentation,
} from './gameplay-flow';
import { MaltlineRenderer } from './renderer';
import {
  MALTLINE_RENDERER_FRAME,
  type MaltlineRendererLayout,
} from './renderer-layout';
import { mountMaltlineShell, type OverlayPresentation } from './shell';
import { deriveMaltlineStationActionPresentation } from './station-action-presentation';
import { MALTLINE_VISUAL_THEME } from './visual-theme';
import './visual-fixtures.css';

export const VISUAL_FIXTURE_RUNTIME_MARKER = 'maltline-visual-fixture-runtime';

type FixtureName =
  | 'title'
  | 'instructions'
  | 'stage-card'
  | 'countdown'
  | 'game-over'
  | 'victory'
  | 'first-pour-idle'
  | 'blend-half'
  | 'ready'
  | 'rush-three-lane'
  | 'stage-4-lunch-rush-pressure'
  | 'stage-4-traffic-corridor'
  | 'stage-4-traffic-corridor-reduced'
  | 'stage-5-jar-shortage-pressure'
  | 'stage-6-thick-shakes-pressure'
  | 'stage-6-station-tool-split'
  | 'stage-6-station-tool-split-reduced'
  | 'stage-7-happy-hour-pressure'
  | 'no-clean-jars'
  | 'reduced-motion'
  | 'stage-clear-walkout'
  | 'repeat-rescue'
  | 'serve-feedback'
  | 'jar-catch'
  | 'shake-launch'
  | 'return-window'
  | 'shake-miss'
  | 'jar-miss'
  | 'walkout';

interface VisualFixture {
  name: FixtureName;
  scenarioIndex: number;
  state: MaltlineState;
  events?: GameEvent[];
  effectAgeMs?: number;
  overlay?: OverlayPresentation;
  presentationTimeMs: number;
  randomSeed: number;
  reducedMotion?: boolean;
  provenance?: 'authored-static' | 'synthetic-pressure-envelope' | 'synthetic-isolated-event';
}

interface VisibleFixtureRegion {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colors: string[];
}

interface VisualFixtureMetadata {
  provenance: NonNullable<VisualFixture['provenance']>;
  reachability: 'engine-reachable' | 'presentation-only';
  rankEligibility: 'unranked-visual-evidence';
  scenarioIndex: number;
  scenarioId: string;
  effectAgeMs: number;
  eventTypes: GameEvent['type'][];
  entityIds: {
    customers: number[];
    slides: number[];
    jars: number[];
  };
  stationAction: {
    mode: 'holding' | 'blending' | 'blocked-no-jars' | 'idle';
    selectedStationIndex: number;
    selectedFlavor: string;
    processingFlavor: string | null;
    heldFlavor: string | null;
    actionFlavor: string;
    quantizedPercent: number | null;
  };
  counts: {
    customers: number;
    openOrders: number;
    slides: number;
    jars: number;
    washing: number;
    jarsAvailable: number;
    held: number;
    blending: number;
    drinking: number;
    accountedJars: number;
    occupiedOrderLanes: number;
    distinctOrderFlavors: number;
    impatientOrders: number;
    closeOpenOrderPairs: number;
    sameLaneTrafficPairs: number;
    blendPercent: number;
    spawned: number;
    serviceActions: number;
    fulfilled: number;
    resolved: number;
    exited: number;
    walkouts: number;
  };
  visibleRegions: VisibleFixtureRegion[];
}

type StateOverrides = Omit<Partial<MaltlineState>, 'player'> & {
  player?: Partial<PlayerState>;
};

const FIXTURE_NAMES: readonly FixtureName[] = [
  'title',
  'instructions',
  'stage-card',
  'countdown',
  'game-over',
  'victory',
  'first-pour-idle',
  'blend-half',
  'ready',
  'rush-three-lane',
  'stage-4-lunch-rush-pressure',
  'stage-4-traffic-corridor',
  'stage-4-traffic-corridor-reduced',
  'stage-5-jar-shortage-pressure',
  'stage-6-thick-shakes-pressure',
  'stage-6-station-tool-split',
  'stage-6-station-tool-split-reduced',
  'stage-7-happy-hour-pressure',
  'no-clean-jars',
  'reduced-motion',
  'stage-clear-walkout',
  'repeat-rescue',
  'serve-feedback',
  'jar-catch',
  'shake-launch',
  'return-window',
  'shake-miss',
  'jar-miss',
  'walkout',
];

function fp(position: number): number {
  return Math.round(position * FIXED_SCALE);
}

function makeState(scenario: MaltlineScenario, overrides: StateOverrides = {}): MaltlineState {
  const baseline = new MaltlineEngine(scenario).snapshot();
  return {
    ...baseline,
    ...overrides,
    player: {
      ...baseline.player,
      ...overrides.player,
    },
  };
}

function makeFixtures(): Record<FixtureName, VisualFixture> {
  const firstPour = MALTLINE_CAMPAIGN[0]!;
  const lunchRush = MALTLINE_CAMPAIGN[3]!;
  const jarShortage = MALTLINE_CAMPAIGN[4]!;
  const thickShakes = MALTLINE_CAMPAIGN[5]!;
  const rush = MALTLINE_CAMPAIGN[6]!;
  const firstCustomer = {
    id: 1,
    lane: 0,
    x: fp(76),
    flavor: 'vanilla' as const,
    phase: 'marching' as const,
    timer: 0,
    fulfilled: false,
    requeues: 0,
    catchBonusEligible: false,
    exitAfterDrink: false,
  };
  const titleState = makeState(firstPour);
  const gameOverState = makeState(firstPour, {
    tick: 2_410,
    status: 'lost',
    score: 940,
    lives: 0,
    streak: 0,
    spawned: 8,
    serviceActions: 5,
    fulfilled: 5,
    walkouts: 3,
    resolved: 8,
    exited: 5,
  });
  const victoryState = makeState(MALTLINE_CAMPAIGN[7]!, {
    tick: 7_800,
    status: 'won',
    score: 12_840,
    lives: 1,
    streak: 6,
    spawned: MALTLINE_CAMPAIGN[7]!.customerCount,
    serviceActions: MALTLINE_CAMPAIGN[7]!.customerCount,
    fulfilled: MALTLINE_CAMPAIGN[7]!.customerCount,
    resolved: MALTLINE_CAMPAIGN[7]!.customerCount,
    exited: MALTLINE_CAMPAIGN[7]!.customerCount,
  });
  const idleState = makeState(firstPour, {
    tick: 160,
    customers: [firstCustomer],
    spawned: 1,
    spawnCountdown: 145,
  });
  const noCleanState = makeState(firstPour, {
    ...idleState,
    tick: 260,
    jarsAvailable: 0,
    washing: [45, 105],
    jars: [
      { id: 61, customerId: 2, lane: 1, x: fp(38), catchBonusEligible: true },
      { id: 62, customerId: 3, lane: 0, x: fp(72), catchBonusEligible: false },
      { id: 63, customerId: 4, lane: 1, x: fp(88), catchBonusEligible: true },
    ],
  });
  const reducedMotionState = makeState(rush, {
    tick: 1_111,
    score: 1_840,
    lives: 2,
    streak: 3,
    player: {
      lane: 1,
      station: 1,
      holding: null,
      blending: 'chocolate',
      blendProgress: Math.floor(rush.blendTicks / 2),
    },
    customers: [
      { id: 71, lane: 0, x: fp(72), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 72, lane: 1, x: fp(48), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 73, lane: 2, x: fp(80), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
    ],
    slides: [{ id: 74, lane: 0, x: fp(32), flavor: 'vanilla' }],
    jarsAvailable: 2,
    washing: [70],
    spawned: 6,
    fulfilled: 4,
    serviceActions: 4,
    resolved: 3,
    exited: 3,
    spawnCountdown: 35,
  });
  const stage4TrafficCorridorState = makeState(lunchRush, {
    tick: 2_290,
    score: 3_300,
    lives: 3,
    streak: 4,
    player: { lane: 0, station: 1 },
    customers: [
      { id: 201, lane: 0, x: fp(18), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 202, lane: 0, x: fp(27), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 203, lane: 1, x: fp(43), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 204, lane: 1, x: fp(76), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 205, lane: 2, x: fp(35), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
    ],
    slides: [{ id: 211, lane: 0, x: fp(48), flavor: 'chocolate' }],
    jars: [{ id: 212, customerId: 198, lane: 0, x: fp(52), catchBonusEligible: true }],
    washing: [84],
    jarsAvailable: 2,
    spawned: 8,
    serviceActions: 4,
    fulfilled: 4,
    resolved: 3,
    exited: 3,
    spawnCountdown: 17,
  });
  const stage6PressureState = makeState(thickShakes, {
    tick: 2_180,
    score: 5_460,
    lives: 2,
    streak: 3,
    player: {
      lane: 1,
      station: 2,
      holding: null,
      blending: 'strawberry',
      blendProgress: Math.floor(thickShakes.blendTicks * 0.9),
    },
    customers: [
      { id: 121, lane: 0, x: fp(18), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 122, lane: 0, x: fp(31), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 123, lane: 1, x: fp(43), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 124, lane: 1, x: fp(76), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 125, lane: 2, x: fp(22), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
      { id: 126, lane: 2, x: fp(62), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
    ],
    jars: [{ id: 131, customerId: 118, lane: 2, x: fp(45), catchBonusEligible: true }],
    washing: [118],
    jarsAvailable: 2,
    spawned: 12,
    serviceActions: 6,
    fulfilled: 6,
    resolved: 6,
    exited: 6,
    spawnCountdown: 20,
  });
  const stage6StationToolSplitState: MaltlineState = {
    ...stage6PressureState,
    player: {
      ...stage6PressureState.player,
      station: 1,
      blendProgress: Math.floor(thickShakes.blendTicks / 2),
    },
  };
  const stageClearWalkoutState = makeState(firstPour, {
    tick: 3_200,
    status: 'won',
    score: 1_275,
    lives: 2,
    streak: 0,
    customers: [],
    slides: [],
    jars: [],
    washing: [],
    jarsAvailable: firstPour.jarPoolSize,
    spawned: firstPour.customerCount,
    serviceActions: 7,
    fulfilled: 7,
    walkouts: 1,
    resolved: firstPour.customerCount,
    exited: 7,
    spawnCountdown: 60,
  });

  return {
    title: {
      name: 'title',
      scenarioIndex: 0,
      state: titleState,
      overlay: titlePresentation(),
      presentationTimeMs: 120_000,
      randomSeed: 1001,
    },
    instructions: {
      name: 'instructions',
      scenarioIndex: 0,
      state: titleState,
      overlay: instructionPresentation(),
      presentationTimeMs: 120_000,
      randomSeed: 1013,
    },
    'stage-card': {
      name: 'stage-card',
      scenarioIndex: 0,
      state: titleState,
      overlay: stageCardPresentation(firstPour, 0, MALTLINE_CAMPAIGN.length),
      presentationTimeMs: 120_000,
      randomSeed: 1014,
    },
    countdown: {
      name: 'countdown',
      scenarioIndex: 0,
      state: titleState,
      overlay: countdownPresentation(3, firstPour, 0, MALTLINE_CAMPAIGN.length),
      presentationTimeMs: 120_000,
      randomSeed: 1015,
    },
    'game-over': {
      name: 'game-over',
      scenarioIndex: 0,
      provenance: 'synthetic-isolated-event',
      state: gameOverState,
      overlay: gameOverPresentation(
        gameOverState,
        0,
        MALTLINE_CAMPAIGN.length,
        firstPour.name,
        'jar_smashed',
      ),
      events: [
        { tick: gameOverState.tick, type: 'jar_smashed', lane: 0 },
        { tick: gameOverState.tick, type: 'life_lost', reason: 'jar_smashed', lives: 0 },
        { tick: gameOverState.tick, type: 'game_lost' },
      ],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1016,
    },
    victory: {
      name: 'victory',
      scenarioIndex: 7,
      state: victoryState,
      overlay: victoryPresentation(victoryState, MALTLINE_CAMPAIGN.length),
      presentationTimeMs: 120_000,
      randomSeed: 1017,
    },
    'first-pour-idle': {
      name: 'first-pour-idle',
      scenarioIndex: 0,
      state: idleState,
      presentationTimeMs: 120_000,
      randomSeed: 1002,
    },
    'blend-half': {
      name: 'blend-half',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        ...idleState,
        player: {
          lane: 0,
          station: 0,
          holding: null,
          blending: 'vanilla',
          blendProgress: Math.floor(firstPour.blendTicks / 2),
        },
        jarsAvailable: firstPour.jarPoolSize - 1,
      }),
      presentationTimeMs: 120_000,
      randomSeed: 1003,
    },
    ready: {
      name: 'ready',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        ...idleState,
        tick: 205,
        player: {
          lane: 0,
          station: 0,
          holding: 'vanilla',
          blending: null,
          blendProgress: 0,
        },
        jarsAvailable: firstPour.jarPoolSize - 1,
      }),
      events: [{ tick: 205, type: 'blend_completed', flavor: 'vanilla' }],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1004,
    },
    'rush-three-lane': {
      name: 'rush-three-lane',
      scenarioIndex: 6,
      state: makeState(rush, {
        tick: 1_920,
        score: 2_450,
        lives: 2,
        streak: 4,
        player: { lane: 1, station: 1 },
        customers: [
          { id: 11, lane: 0, x: fp(74), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 12, lane: 0, x: fp(42), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 13, lane: 1, x: fp(55), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 14, lane: 2, x: fp(25), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 15, lane: 2, x: fp(82), flavor: 'vanilla', phase: 'drinking', timer: 31, fulfilled: true, requeues: 0, catchBonusEligible: true, exitAfterDrink: true },
        ],
        slides: [
          { id: 21, lane: 1, x: fp(31), flavor: 'chocolate' },
        ],
        jars: [
          { id: 22, customerId: 10, lane: 0, x: fp(51), catchBonusEligible: true },
        ],
        washing: [70],
        jarsAvailable: 2,
        spawned: 8,
        serviceActions: 5,
        fulfilled: 5,
        walkouts: 0,
        resolved: 3,
        exited: 3,
        spawnCountdown: 42,
      }),
      presentationTimeMs: 120_000,
      randomSeed: 1005,
    },
    'stage-4-lunch-rush-pressure': {
      name: 'stage-4-lunch-rush-pressure',
      scenarioIndex: 3,
      provenance: 'synthetic-pressure-envelope',
      state: makeState(lunchRush, {
        tick: 2_260,
        score: 3_180,
        lives: 3,
        streak: 5,
        player: { lane: 0, station: 1 },
        customers: [
          { id: 81, lane: 0, x: fp(16), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 82, lane: 0, x: fp(25), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 83, lane: 0, x: fp(68), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 84, lane: 1, x: fp(46), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 85, lane: 1, x: fp(77), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 86, lane: 2, x: fp(35), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
        ],
        slides: [{ id: 91, lane: 0, x: fp(47), flavor: 'chocolate' }],
        jars: [{ id: 92, customerId: 78, lane: 0, x: fp(55), catchBonusEligible: true }],
        washing: [84],
        jarsAvailable: 2,
        spawned: 11,
        serviceActions: 5,
        fulfilled: 5,
        resolved: 5,
        exited: 5,
        spawnCountdown: 18,
      }),
      presentationTimeMs: 120_000,
      randomSeed: 1104,
    },
    'stage-4-traffic-corridor': {
      name: 'stage-4-traffic-corridor',
      scenarioIndex: 3,
      provenance: 'synthetic-pressure-envelope',
      state: stage4TrafficCorridorState,
      presentationTimeMs: 120_000,
      randomSeed: 1154,
    },
    'stage-4-traffic-corridor-reduced': {
      name: 'stage-4-traffic-corridor-reduced',
      scenarioIndex: 3,
      provenance: 'synthetic-pressure-envelope',
      state: stage4TrafficCorridorState,
      presentationTimeMs: 120_000,
      randomSeed: 1154,
      reducedMotion: true,
    },
    'stage-5-jar-shortage-pressure': {
      name: 'stage-5-jar-shortage-pressure',
      scenarioIndex: 4,
      provenance: 'synthetic-pressure-envelope',
      state: makeState(jarShortage, {
        tick: 2_740,
        score: 4_025,
        lives: 2,
        streak: 2,
        player: { lane: 2, station: 0 },
        customers: [
          { id: 101, lane: 0, x: fp(21), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 102, lane: 0, x: fp(63), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 103, lane: 1, x: fp(38), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 104, lane: 1, x: fp(75), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 105, lane: 2, x: fp(29), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
        ],
        jars: [
          { id: 111, customerId: 98, lane: 0, x: fp(34), catchBonusEligible: true },
          { id: 112, customerId: 99, lane: 2, x: fp(61), catchBonusEligible: false },
        ],
        washing: [42, 139],
        jarsAvailable: 0,
        spawned: 12,
        serviceActions: 7,
        fulfilled: 7,
        resolved: 7,
        exited: 7,
        spawnCountdown: 22,
      }),
      presentationTimeMs: 120_000,
      randomSeed: 1105,
    },
    'stage-6-thick-shakes-pressure': {
      name: 'stage-6-thick-shakes-pressure',
      scenarioIndex: 5,
      provenance: 'synthetic-pressure-envelope',
      state: stage6PressureState,
      presentationTimeMs: 120_000,
      randomSeed: 1106,
    },
    'stage-6-station-tool-split': {
      name: 'stage-6-station-tool-split',
      scenarioIndex: 5,
      provenance: 'synthetic-pressure-envelope',
      state: stage6StationToolSplitState,
      presentationTimeMs: 120_000,
      randomSeed: 1166,
    },
    'stage-6-station-tool-split-reduced': {
      name: 'stage-6-station-tool-split-reduced',
      scenarioIndex: 5,
      provenance: 'synthetic-pressure-envelope',
      state: stage6StationToolSplitState,
      presentationTimeMs: 120_000,
      randomSeed: 1166,
      reducedMotion: true,
    },
    'stage-7-happy-hour-pressure': {
      name: 'stage-7-happy-hour-pressure',
      scenarioIndex: 6,
      provenance: 'synthetic-pressure-envelope',
      state: makeState(rush, {
        tick: 2_860,
        score: 7_320,
        lives: 1,
        streak: 6,
        player: {
          lane: 0,
          station: 2,
          holding: 'strawberry',
          blending: null,
          blendProgress: 0,
        },
        customers: [
          { id: 141, lane: 0, x: fp(16), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 142, lane: 0, x: fp(25), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 143, lane: 0, x: fp(70), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 144, lane: 1, x: fp(39), flavor: 'chocolate', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 145, lane: 1, x: fp(73), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 146, lane: 2, x: fp(23), flavor: 'strawberry', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
          { id: 147, lane: 2, x: fp(84), flavor: 'vanilla', phase: 'drinking', timer: 24, fulfilled: true, requeues: 0, catchBonusEligible: true, exitAfterDrink: true },
        ],
        slides: [{ id: 151, lane: 0, x: fp(47), flavor: 'strawberry' }],
        jars: [{ id: 152, customerId: 138, lane: 0, x: fp(55), catchBonusEligible: true }],
        washing: [58],
        jarsAvailable: 1,
        spawned: 17,
        serviceActions: 11,
        fulfilled: 11,
        resolved: 10,
        exited: 10,
        spawnCountdown: 8,
      }),
      presentationTimeMs: 120_000,
      randomSeed: 1107,
    },
    'no-clean-jars': {
      name: 'no-clean-jars',
      scenarioIndex: 0,
      state: noCleanState,
      presentationTimeMs: 120_000,
      randomSeed: 1010,
    },
    'reduced-motion': {
      name: 'reduced-motion',
      scenarioIndex: 6,
      state: reducedMotionState,
      presentationTimeMs: 120_000,
      randomSeed: 1011,
      reducedMotion: true,
    },
    'stage-clear-walkout': {
      name: 'stage-clear-walkout',
      scenarioIndex: 0,
      state: stageClearWalkoutState,
      overlay: stageClearPresentation(stageClearWalkoutState, 500),
      presentationTimeMs: 120_000,
      randomSeed: 1012,
    },
    'repeat-rescue': {
      name: 'repeat-rescue',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        tick: 720,
        score: 515,
        streak: 3,
        customers: [{
          id: 41,
          lane: 0,
          x: fp(34),
          flavor: 'vanilla',
          phase: 'drinking',
          timer: 38,
          fulfilled: true,
          requeues: 1,
          catchBonusEligible: false,
          exitAfterDrink: true,
        }],
        jarsAvailable: 4,
        spawned: 4,
        serviceActions: 5,
        fulfilled: 4,
        resolved: 3,
        exited: 3,
        spawnCountdown: 70,
      }),
      events: [{
        tick: 720,
        type: 'served',
        customerId: 41,
        lane: 0,
        flavor: 'vanilla',
        exitAfterDrink: true,
        firstFulfillment: false,
        points: 0,
      }],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1006,
    },
    'serve-feedback': {
      name: 'serve-feedback',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        tick: 700,
        score: 630,
        streak: 4,
        customers: [{
          id: 61, lane: 0, x: fp(45), flavor: 'vanilla', phase: 'drinking', timer: 42,
          fulfilled: true, requeues: 0, catchBonusEligible: true, exitAfterDrink: true,
        }],
        jarsAvailable: 4,
        spawned: 4,
        serviceActions: 4,
        fulfilled: 4,
        resolved: 3,
        exited: 3,
      }),
      events: [{
        tick: 700, type: 'served', customerId: 61, lane: 0, flavor: 'vanilla',
        exitAfterDrink: true, firstFulfillment: true, points: 130,
      }],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1020,
    },
    'jar-catch': {
      name: 'jar-catch',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        tick: 710,
        score: 655,
        streak: 4,
        player: { lane: 0, station: 0 },
        jarsAvailable: 4,
        washing: [firstPour.washTicks],
        spawned: 3,
        serviceActions: 3,
        fulfilled: 3,
        resolved: 3,
        exited: 3,
      }),
      events: [{ tick: 710, type: 'jar_caught', customerId: 61, lane: 0, points: 25 }],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1021,
    },
    'shake-launch': {
      name: 'shake-launch',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        tick: 690,
        player: { lane: 0, station: 0 },
        slides: [{ id: 60, lane: 0, x: fp(36), flavor: 'vanilla' }],
        jarsAvailable: 4,
        spawned: 2,
        fulfilled: 2,
        serviceActions: 2,
        resolved: 2,
        exited: 2,
      }),
      events: [{ tick: 690, type: 'shake_launched', lane: 0, flavor: 'vanilla' }],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1022,
    },
    'return-window': {
      name: 'return-window',
      scenarioIndex: 0,
      provenance: 'synthetic-isolated-event',
      state: makeState(firstPour, {
        tick: 730,
        player: { lane: 0, station: 0 },
        jars: [
          { id: 62, customerId: 60, lane: 0, x: fp(18), catchBonusEligible: true },
          { id: 63, customerId: 59, lane: 1, x: fp(20), catchBonusEligible: false },
        ],
        jarsAvailable: 3,
        spawned: 4,
        serviceActions: 4,
        fulfilled: 4,
        resolved: 2,
        exited: 2,
      }),
      events: [
        { tick: 730, type: 'jar_returned', customerId: 60, lane: 0 },
        { tick: 730, type: 'jar_returned', customerId: 59, lane: 1 },
      ],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1023,
    },
    'shake-miss': {
      name: 'shake-miss',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        ...idleState,
        tick: 760,
        score: 300,
        lives: 2,
        streak: 0,
        jarsAvailable: firstPour.jarPoolSize - 1,
      }),
      events: [
        { tick: 760, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
        { tick: 760, type: 'life_lost', reason: 'shake_smashed', lives: 2 },
      ],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1007,
    },
    'jar-miss': {
      name: 'jar-miss',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        tick: 780,
        score: 325,
        lives: 2,
        player: { lane: 0, station: 0 },
        customers: [
          { id: 31, lane: 0, x: fp(65), flavor: 'vanilla', phase: 'marching', timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false },
        ],
        jarsAvailable: 3,
        spawned: 3,
        serviceActions: 3,
        fulfilled: 3,
        walkouts: 0,
        resolved: 2,
        exited: 2,
        spawnCountdown: 70,
      }),
      events: [
        { tick: 780, type: 'jar_smashed', lane: 1 },
        { tick: 780, type: 'life_lost', reason: 'jar_smashed', lives: 2 },
      ],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1008,
    },
    walkout: {
      name: 'walkout',
      scenarioIndex: 0,
      state: makeState(firstPour, {
        tick: 820,
        score: 325,
        lives: 2,
        streak: 0,
        player: { lane: 1, station: 0 },
        customers: [{
          ...firstCustomer,
          id: 51,
          lane: 1,
          x: fp(62),
        }],
        jarsAvailable: 4,
        spawned: 4,
        fulfilled: 2,
        serviceActions: 2,
        walkouts: 1,
        resolved: 3,
        exited: 2,
        spawnCountdown: 55,
      }),
      events: [
        { tick: 820, type: 'walkout', customerId: 50, lane: 0 },
        { tick: 820, type: 'life_lost', reason: 'walkout', lives: 2 },
      ],
      effectAgeMs: 90,
      presentationTimeMs: 120_000,
      randomSeed: 1009,
    },
  };
}

function requestedFixture(): FixtureName {
  const value = new URLSearchParams(window.location.search).get('fixture') ?? 'title';
  if ((FIXTURE_NAMES as readonly string[]).includes(value)) return value as FixtureName;
  throw new Error(`Unknown Maltline visual fixture: ${value}`);
}

const FIXTURE_FLAVOR_COLORS = Object.freeze({
  vanilla: MALTLINE_VISUAL_THEME.flavors.vanilla.base,
  chocolate: MALTLINE_VISUAL_THEME.flavors.chocolate.base,
  strawberry: MALTLINE_VISUAL_THEME.flavors.strawberry.base,
});

const FIXTURE_SKIN_COLORS = MALTLINE_VISUAL_THEME.customers.skin.map(([base]) => base);

function fixtureMetadata(
  fixture: VisualFixture,
  layout: MaltlineRendererLayout,
): VisualFixtureMetadata {
  const { scenario } = layout;
  const state = fixture.state;
  const provenance = fixture.provenance ?? 'authored-static';
  const reachability = provenance === 'synthetic-isolated-event'
    ? 'presentation-only'
    : 'engine-reachable';
  if (reachability === 'engine-reachable') assertReachableFixtureState(fixture, scenario);
  const stationAction = deriveMaltlineStationActionPresentation(scenario, state);
  const visibleRegions: VisibleFixtureRegion[] = [];
  const laneObjectY = (lane: number): number => layout.laneCenterY(lane) + 13;
  for (const customer of state.customers) {
    const x = layout.lanePx(customer.x);
    visibleRegions.push({
      label: `customer-${customer.id}`,
      x: x - 17,
      y: layout.laneCenterY(customer.lane) - 35,
      width: 34,
      height: 66,
      colors: [FIXTURE_SKIN_COLORS[(customer.id * 2 + 2) % FIXTURE_SKIN_COLORS.length]!],
    });
    if (customer.phase === 'marching') {
      const groundY = layout.laneBottom(customer.lane) - 18;
      const walking = !fixture.reducedMotion;
      const bob = walking ? Math.abs(Math.cos((state.tick + customer.id * 7) / 4.5)) * 2 : 0;
      const headY = groundY - 14 - bob - 28;
      const sway = fixture.reducedMotion ? 0 : Math.sin((state.tick + customer.id * 13) / 30) * 2;
      const ticketY = Math.max(MALTLINE_RENDERER_FRAME.hudHeight + 18, headY - 30 + sway);
      visibleRegions.push({
        label: `order-${customer.id}-${customer.flavor}`,
        x: x - 22,
        y: ticketY - 16,
        width: 44,
        height: 34,
        colors: [
          FIXTURE_FLAVOR_COLORS[customer.flavor],
          MALTLINE_VISUAL_THEME.customerOrder.ticketKeyline,
          MALTLINE_VISUAL_THEME.customerOrder.ticketConnector,
        ],
      });
      visibleRegions.push({
        label: `ticket-leader-${customer.id}`,
        x: x - 3,
        y: ticketY + 14,
        width: 6,
        height: 11,
        colors: [MALTLINE_VISUAL_THEME.customerOrder.ticketConnector],
      });
    }
  }
  for (const slide of state.slides) {
    const slideX = layout.lanePx(slide.x);
    visibleRegions.push({
      label: `slide-body-${slide.id}-${slide.flavor}`,
      x: slideX - 17,
      y: laneObjectY(slide.lane) - 43,
      width: 34,
      height: 64,
      colors: [
        MALTLINE_VISUAL_THEME.outgoingShake.edge,
        FIXTURE_FLAVOR_COLORS[slide.flavor],
      ],
    });
    visibleRegions.push({
      label: `slide-trail-${slide.id}`,
      x: slideX - 70,
      y: laneObjectY(slide.lane) - 10,
      width: 58,
      height: 20,
      colors: [MALTLINE_VISUAL_THEME.outgoingShake.edge, MALTLINE_VISUAL_THEME.outgoingShake.trail],
    });
  }
  for (const jar of state.jars) {
    const projection = layout.projectReturningJar(jar.x, jar.lane);
    const jarX = projection.anchorX;
    visibleRegions.push({
      label: `jar-${jar.id}`,
      x: jarX - 18,
      y: laneObjectY(jar.lane) - 25,
      width: 82,
      height: 48,
      colors: [MALTLINE_VISUAL_THEME.returnJar.rim, MALTLINE_VISUAL_THEME.returnJar.trail],
    });
    if (projection.catchCue !== null) {
      visibleRegions.push({
        label: jar.lane === state.player.lane
          ? `return-target-${jar.lane}-catch`
          : `return-target-${jar.lane}-move`,
        ...projection.catchCue,
        colors: [jar.lane === state.player.lane
          ? MALTLINE_VISUAL_THEME.feedback.ready
          : MALTLINE_VISUAL_THEME.returnJar.trail],
      });
    }
  }
  visibleRegions.push({
    label: 'player',
    x: 46,
    y: layout.laneCenterY(state.player.lane) - 35,
    width: 36,
    height: 68,
    colors: ['#2a8a67', '#f3e9d2'],
  });
  const selectedStation = layout.stations[stationAction.selectedStation.index]!;
  const selectionFrame = selectedStation.selectionFrame;
  const selectionTab = selectedStation.selectionTab;
  const selectionColor = stationAction.mode === 'blocked-no-jars'
    ? MALTLINE_VISUAL_THEME.station.blocked
    : MALTLINE_VISUAL_THEME.station.selectedKeyline;
  visibleRegions.push({
    label: `selected-station-${state.player.station}`,
    x: selectionFrame.x,
    y: Math.min(selectionFrame.y, selectionTab.y),
    width: selectionTab.x + selectionTab.width - selectionFrame.x,
    height: Math.max(
      selectionFrame.y + selectionFrame.height,
      selectionTab.y + selectionTab.height,
    ) - Math.min(selectionFrame.y, selectionTab.y),
    colors: [selectionColor, MALTLINE_VISUAL_THEME.station.selectedTab],
  });
  visibleRegions.push({
    label: `selected-station-tab-${state.player.station}-${stationAction.selectedStation.flavor}`,
    ...selectionTab,
    colors: [selectionColor, MALTLINE_VISUAL_THEME.station.selectedTab],
  });
  if (stationAction.mode === 'blending' && stationAction.processingFlavor !== null) {
    const processingIndex = scenario.stations.indexOf(stationAction.processingFlavor);
    const processingStation = layout.stations[processingIndex]!;
    visibleRegions.push({
      label: `processing-station-${processingIndex}-${stationAction.processingFlavor}`,
      ...processingStation.processingFrame,
      colors: [MALTLINE_VISUAL_THEME.station.processing],
    });
    visibleRegions.push({
      label: `processing-meter-${processingIndex}-${stationAction.quantizedPercent}`,
      ...processingStation.processingMeter,
      colors: [
        MALTLINE_VISUAL_THEME.station.processing,
        MALTLINE_VISUAL_THEME.station.progressTrack,
      ],
    });
  }
  visibleRegions.push({
    label: `action-status-${stationAction.mode}`,
    ...MALTLINE_RENDERER_FRAME.actionStatus,
    colors: [
      MALTLINE_VISUAL_THEME.station.statusText,
      stationAction.mode === 'holding'
        ? MALTLINE_VISUAL_THEME.station.ready
        : stationAction.mode === 'blending'
          ? MALTLINE_VISUAL_THEME.station.processing
          : stationAction.mode === 'blocked-no-jars'
            ? MALTLINE_VISUAL_THEME.station.blocked
            : MALTLINE_VISUAL_THEME.station.selectedKeyline,
    ],
  });
  visibleRegions.push({
    label: `action-badge-${stationAction.mode}-${stationAction.actionFlavor}`,
    ...MALTLINE_RENDERER_FRAME.actionBadge,
    colors: [MALTLINE_VISUAL_THEME.station.statusText,
      stationAction.mode === 'holding'
        ? MALTLINE_VISUAL_THEME.station.ready
        : stationAction.mode === 'blending'
          ? MALTLINE_VISUAL_THEME.station.processing
          : stationAction.mode === 'blocked-no-jars'
            ? MALTLINE_VISUAL_THEME.station.blocked
            : MALTLINE_VISUAL_THEME.station.selectedKeyline],
  });
  visibleRegions.push({
    label: state.jarsAvailable === 0 ? 'no-clean-jar-gauge' : 'jar-gauge',
    ...layout.jarGauge,
    colors: [state.jarsAvailable === 0
      ? MALTLINE_VISUAL_THEME.feedback.blocked
      : MALTLINE_VISUAL_THEME.scene.cream,
    MALTLINE_VISUAL_THEME.scene.creamDim,
    MALTLINE_VISUAL_THEME.returnJar.rim],
  });
  visibleRegions.push({
    label: `orders-role-${Math.max(0, scenario.customerCount - state.resolved)}`,
    ...MALTLINE_RENDERER_FRAME.hudOrders,
    colors: [
      MALTLINE_VISUAL_THEME.scene.cream,
      MALTLINE_VISUAL_THEME.scene.creamDim,
    ],
  });
  visibleRegions.push({
    label: `lives-role-${state.lives}`,
    ...MALTLINE_RENDERER_FRAME.hudLives,
    colors: [
      MALTLINE_VISUAL_THEME.scene.cream,
      MALTLINE_VISUAL_THEME.scene.creamDim,
      ...(state.lives > 0 ? [MALTLINE_VISUAL_THEME.flavors.strawberry.base] : []),
    ],
  });

  const drinking = state.customers.filter((customer) => customer.phase === 'drinking').length;
  const openOrders = state.customers.filter((customer) => customer.phase === 'marching');
  let closeOpenOrderPairs = 0;
  for (let first = 0; first < openOrders.length; first++) {
    for (let second = first + 1; second < openOrders.length; second++) {
      if (openOrders[first]!.lane === openOrders[second]!.lane
        && Math.abs(openOrders[first]!.x - openOrders[second]!.x) <= 10 * FIXED_SCALE) {
        closeOpenOrderPairs++;
      }
    }
  }
  const held = Number(state.player.holding !== null);
  const blending = Number(state.player.blending !== null);
  return {
    provenance,
    reachability,
    rankEligibility: 'unranked-visual-evidence',
    scenarioIndex: fixture.scenarioIndex,
    scenarioId: scenario.id,
    effectAgeMs: fixture.effectAgeMs ?? 0,
    eventTypes: fixture.events?.map((event) => event.type) ?? [],
    entityIds: {
      customers: state.customers.map((customer) => customer.id),
      slides: state.slides.map((slide) => slide.id),
      jars: state.jars.map((jar) => jar.id),
    },
    stationAction: {
      mode: stationAction.mode,
      selectedStationIndex: stationAction.selectedStation.index,
      selectedFlavor: stationAction.selectedStation.flavor,
      processingFlavor: stationAction.processingFlavor,
      heldFlavor: stationAction.heldFlavor,
      actionFlavor: stationAction.actionFlavor,
      quantizedPercent: stationAction.quantizedPercent,
    },
    counts: {
      customers: state.customers.length,
      openOrders: openOrders.length,
      slides: state.slides.length,
      jars: state.jars.length,
      washing: state.washing.length,
      jarsAvailable: state.jarsAvailable,
      held,
      blending,
      drinking,
      accountedJars: state.jarsAvailable + state.washing.length + state.slides.length
        + state.jars.length + held + blending + drinking,
      occupiedOrderLanes: new Set(openOrders.map((customer) => customer.lane)).size,
      distinctOrderFlavors: new Set(openOrders.map((customer) => customer.flavor)).size,
      impatientOrders: openOrders.filter((customer) =>
        customer.x < scenario.laneLength * FIXED_SCALE * 0.28).length,
      closeOpenOrderPairs,
      sameLaneTrafficPairs: state.slides.reduce((pairs, slide) =>
        pairs + state.jars.filter((jar) => jar.lane === slide.lane).length, 0),
      blendPercent: state.player.blending === null
        ? 0
        : Math.round(state.player.blendProgress / scenario.blendTicks * 20) * 5,
      spawned: state.spawned,
      serviceActions: state.serviceActions,
      fulfilled: state.fulfilled,
      resolved: state.resolved,
      exited: state.exited,
      walkouts: state.walkouts,
    },
    visibleRegions,
  };
}

function assertReachableFixtureState(fixture: VisualFixture, scenario: MaltlineScenario): void {
  const state = fixture.state;
  const label = `fixture ${fixture.name}`;
  const integerFields = {
    tick: state.tick,
    score: state.score,
    lives: state.lives,
    streak: state.streak,
    jarsAvailable: state.jarsAvailable,
    spawned: state.spawned,
    serviceActions: state.serviceActions,
    fulfilled: state.fulfilled,
    resolved: state.resolved,
    exited: state.exited,
    walkouts: state.walkouts,
  };
  for (const [name, value] of Object.entries(integerFields)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} ${name} must be a non-negative safe integer.`);
    }
  }
  if (state.scenarioId !== scenario.id) throw new Error(`${label} scenario identity is inconsistent.`);
  if (state.customers.length + state.resolved !== state.spawned) {
    throw new Error(`${label} must account for every spawned customer.`);
  }
  if (state.exited + state.walkouts !== state.resolved) {
    throw new Error(`${label} resolved-customer accounting is inconsistent.`);
  }
  if (state.fulfilled > state.serviceActions || state.fulfilled > state.spawned) {
    throw new Error(`${label} fulfillment accounting is inconsistent.`);
  }
  if (!Number.isSafeInteger(state.player.lane) || state.player.lane < 0
    || state.player.lane >= scenario.lanes
    || !Number.isSafeInteger(state.player.station) || state.player.station < 0
    || state.player.station >= scenario.stations.length) {
    throw new Error(`${label} player selection is outside the scenario.`);
  }

  const laneLength = scenario.laneLength * FIXED_SCALE;
  const entities = [...state.customers, ...state.slides, ...state.jars];
  const ids = entities.map((entity) => entity.id);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) {
    throw new Error(`${label} entity IDs must be unique positive safe integers.`);
  }
  for (const entity of entities) {
    if (!Number.isSafeInteger(entity.lane) || entity.lane < 0 || entity.lane >= scenario.lanes
      || !Number.isSafeInteger(entity.x) || entity.x < 0 || entity.x > laneLength) {
      throw new Error(`${label} entity position is outside the scenario.`);
    }
  }
  if (state.washing.some((ticks) => !Number.isSafeInteger(ticks) || ticks <= 0
    || ticks > scenario.washTicks)) {
    throw new Error(`${label} washing timers are outside the scenario.`);
  }
  const drinking = state.customers.filter((customer) => customer.phase === 'drinking').length;
  const accountedJars = state.jarsAvailable + state.washing.length + state.slides.length
    + state.jars.length + Number(state.player.holding !== null)
    + Number(state.player.blending !== null) + drinking;
  if (accountedJars > scenario.jarPoolSize) {
    throw new Error(`${label} accounts for more jars than the scenario owns.`);
  }
  if (fixture.provenance === 'synthetic-pressure-envelope'
    && accountedJars !== scenario.jarPoolSize) {
    throw new Error(`${label} pressure envelope must conserve the complete jar pool.`);
  }
}

async function renderFixture(): Promise<void> {
  document.documentElement.dataset.fixtureRuntime = VISUAL_FIXTURE_RUNTIME_MARKER;
  const shell = mountMaltlineShell();
  shell.root.dataset.visualFixture = '';
  shell.hideOverlay();
  const fonts = await prepareMaltlineFonts();
  if (fonts.status !== 'ready') {
    throw new Error(`Visual fixtures require the bundled fonts: ${fonts.diagnostic ?? 'unknown failure'}`);
  }

  const fixtures = makeFixtures();
  const fixture = fixtures[requestedFixture()];
  const scenario = MALTLINE_CAMPAIGN[fixture.scenarioIndex]!;
  const context = shell.canvas.getContext('2d');
  if (!context) throw new Error('Visual fixture needs a 2D canvas');

  const renderer = new MaltlineRenderer({
    random: mulberry32(fixture.randomSeed),
    nowMs: () => fixture.presentationTimeMs,
    reducedMotion: fixture.reducedMotion ?? false,
  });
  const layout = renderer.setScenario(scenario);
  const metadata = fixtureMetadata(fixture, layout);
  if (fixture.events) renderer.pushEvents(fixture.events, fixture.state);
  if (fixture.effectAgeMs) renderer.update(fixture.effectAgeMs);
  renderer.draw(context, fixture.state, {
    stageIndex: fixture.scenarioIndex,
    stageCount: MALTLINE_CAMPAIGN.length,
  });

  if (fixture.overlay) {
    shell.showOverlay(fixture.overlay);
  }

  const metadataNode = document.createElement('script');
  metadataNode.id = 'visual-fixture-metadata';
  metadataNode.type = 'application/json';
  metadataNode.textContent = JSON.stringify(metadata);
  document.body.append(metadataNode);

  document.title = `Maltline fixture: ${fixture.name}`;
  document.documentElement.dataset.fixture = fixture.name;
  document.documentElement.dataset.fixtureProvenance = metadata.provenance;
  document.documentElement.dataset.fixtureReachability = metadata.reachability;
  document.documentElement.dataset.fixtureRankEligibility = metadata.rankEligibility;
  document.documentElement.dataset.fixtureScenario = metadata.scenarioId;
  document.documentElement.dataset.motionMode = fixture.reducedMotion ? 'reduced' : 'full';
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  document.documentElement.dataset.fixtureReady = 'true';
}

renderFixture().catch((error: unknown) => {
  document.documentElement.dataset.fixtureReady = 'error';
  document.body.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
  throw error;
});

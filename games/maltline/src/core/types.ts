export type FlavorId = 'vanilla' | 'chocolate' | 'strawberry';
export type CustomerPhase = 'marching' | 'drinking' | 'leaving';
export type EpisodeStatus = 'running' | 'won' | 'lost';
export type LifeLossReason = 'walkout' | 'shake_smashed' | 'jar_smashed';

/**
 * Per-tick control state. Level-based (like Partition's direction/draw pair):
 * `blend` is held while a station works, `serve` fires on the false→true edge
 * so a held key launches exactly one shake.
 */
export interface MaltlineInput {
  stationDir: -1 | 0 | 1;
  laneDir: -1 | 0 | 1;
  blend: boolean;
  serve: boolean;
}

export const IDLE_INPUT: MaltlineInput = { stationDir: 0, laneDir: 0, blend: false, serve: false };

export interface MaltlineScenario {
  id: string;
  name: string;
  ticksPerSecond: number;
  /** Horizontal lanes; customers march from the door toward the counter. */
  lanes: number;
  /** Lane length in abstract units. Positions are stored × FIXED_SCALE. */
  laneLength: number;
  /** Station bank layout, left to right. The menu is exactly what stations sell. */
  stations: readonly FlavorId[];
  jarPoolSize: number;
  /** Station dwell to produce one shake, in ticks. */
  blendTicks: number;
  /** Caught empty jars spend this long washing before rejoining the pool. */
  washTicks: number;
  /** Customer dwell after catching a shake, in ticks. */
  drinkTicks: number;
  /** Total customers this stage. */
  customerCount: number;
  /** Spawns start at this interval and accelerate per customer served. */
  spawnIntervalTicks: number;
  spawnAccelerationTicks: number;
  spawnIntervalFloorTicks: number;
  /** Lane-units per tick (floats in the scenario, × FIXED_SCALE inside the engine). */
  marchSpeed: number;
  leaveSpeed: number;
  slideSpeed: number;
  returnSpeed: number;
  /**
   * Customers caught beyond this fraction of the lane finish and exit;
   * closer ones finish, return their jar, and resume marching.
   */
  resumeExitThreshold: number;
  /** Input cadence: station/lane selection moves once per this many ticks. */
  stationRepeatTicks: number;
  laneRepeatTicks: number;
  lives: number;
  seed: number;
}

/** Lives and score carried between stages of a run. */
export interface RunContext {
  lives: number;
  score: number;
}

export interface CustomerState {
  id: number;
  lane: number;
  x: number;
  flavor: FlavorId;
  phase: CustomerPhase;
  /** Ticks remaining in the current phase (drinking). */
  timer: number;
  /** Whether this customer's authored order has already awarded serve points. */
  fulfilled: boolean;
  /** Number of late-service returns to the line; capped at one by the engine. */
  requeues: number;
  /** Whether the jar from the current drink may award its one-time catch bonus. */
  catchBonusEligible: boolean;
  exitAfterDrink: boolean;
}

/** A finished shake sliding from the counter toward the door. */
export interface SlideState {
  id: number;
  lane: number;
  x: number;
  flavor: FlavorId;
}

/** An empty jar sliding back toward the counter after a customer finishes. */
export interface JarState {
  id: number;
  customerId: number;
  lane: number;
  x: number;
  /** Catch points are tied to the customer's first fulfillment, not each refill. */
  catchBonusEligible: boolean;
}

export interface PlayerState {
  lane: number;
  station: number;
  holding: FlavorId | null;
  blending: FlavorId | null;
  blendProgress: number;
}

export interface MaltlineState {
  tick: number;
  scenarioId: string;
  status: EpisodeStatus;
  score: number;
  lives: number;
  streak: number;
  player: PlayerState;
  customers: CustomerState[];
  slides: SlideState[];
  jars: JarState[];
  /** Wash ticks remaining per jar. */
  washing: number[];
  jarsAvailable: number;
  spawned: number;
  /** Every shake-to-customer collision, including the one permitted re-service. */
  serviceActions: number;
  /** Distinct customers whose authored order has been fulfilled at least once. */
  fulfilled: number;
  /** Customers removed after reaching the counter. */
  walkouts: number;
  /** All removed customers: successful exits plus walkouts. */
  resolved: number;
  /** Successfully served customers that finished drinking and left. */
  exited: number;
  spawnCountdown: number;
  currentInput: MaltlineInput;
}

export type GameEvent =
  | { tick: number; type: 'customer_spawned'; customerId: number; lane: number; flavor: FlavorId }
  | { tick: number; type: 'shake_launched'; lane: number; flavor: FlavorId }
  | {
      tick: number;
      type: 'served';
      customerId: number;
      lane: number;
      flavor: FlavorId;
      exitAfterDrink: boolean;
      firstFulfillment: boolean;
      points: number;
    }
  | { tick: number; type: 'customer_exited'; customerId: number }
  | { tick: number; type: 'jar_returned'; customerId: number; lane: number }
  | { tick: number; type: 'jar_caught'; customerId: number; lane: number; points: number }
  | { tick: number; type: 'shake_smashed'; lane: number; flavor: FlavorId }
  | { tick: number; type: 'jar_smashed'; lane: number }
  | { tick: number; type: 'walkout'; customerId: number; lane: number }
  | { tick: number; type: 'life_lost'; reason: LifeLossReason; lives: number }
  | { tick: number; type: 'blend_completed'; flavor: FlavorId }
  | { tick: number; type: 'stage_cleared'; bonus: number }
  | { tick: number; type: 'game_lost' };

export interface TickResult {
  state: MaltlineState;
  events: GameEvent[];
}

export interface ReplayTick {
  tick: number;
  input: MaltlineInput;
  events: GameEvent[];
}

export interface MaltlineReplay {
  version: 2;
  scenario: MaltlineScenario;
  run: RunContext;
  ticks: ReplayTick[];
  finalState: MaltlineState;
}

export const FLAVORS: readonly FlavorId[] = ['vanilla', 'chocolate', 'strawberry'];

export const FLAVOR_LABELS: Record<FlavorId, string> = {
  vanilla: 'Vanilla',
  chocolate: 'Chocolate',
  strawberry: 'Strawberry',
};

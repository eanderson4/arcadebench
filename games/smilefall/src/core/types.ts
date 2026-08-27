export type LeanDirection = 'left' | 'right' | 'none';
export type EpisodeStatus = 'running' | 'won' | 'lost';
export type FailureReason = 'too_grumpy' | 'out_of_smilies' | 'timeout';
export type SplatReason = 'floor' | 'rim' | 'too_bouncy' | 'spikes';
export type RockKind = 'pebble' | 'boulder' | 'chonk';
/** How a stage settles an argument between a smiley and a rock. */
export type RockRule = 'smash' | 'bruise';
/**
 * What the ground does. 'splat' removes the smiley and spends a frown;
 * 'bounce' throws it back up, bruised and worth less, so the only thing a
 * miss actually costs is time.
 */
export type FloorRule = 'splat' | 'bounce';
export type BruiseCause = 'rock' | 'floor' | 'rim' | 'burp';
/** Surfaces that hand a smiley straight back without costing it anything. */
export type BounceSurface = 'ledge';
export type MoodId = 'giggle' | 'chuckle' | 'guffaw' | 'cackle';

/** Every simulated coordinate is fixed-point so that ticks stay reproducible. */
export interface FixedPoint {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ControlInput {
  /** Nudges every falling smiley at once. */
  lean: LeanDirection;
  /** Edge-triggered: the whole flock hops when this goes from false to true. */
  hop: boolean;
}

export interface SmileyState {
  id: string;
  position: FixedPoint;
  velocity: FixedPoint;
  radius: number;
  /** Burps off full buckets. A smiley that keeps bouncing eventually splats. */
  bounces: number;
  /** Bonks taken. Past BRUISE_LIMIT the next rock is the last one. */
  bruises: number;
  /** Ticks of post-bonk invulnerability left; the renderer flashes them. */
  graceTicks: number;
  spawnTick: number;
}

/**
 * A solid ledge. Smilies land on top of it and bounce, bonk their heads on the
 * underside, and slide along its sides — it is the only piece of level
 * geometry that exists above the ground line, and it is what makes stacked
 * tiers of buckets reachable.
 */
export interface PlatformSpec {
  id: string;
  /** Left edge, in whole units. */
  x: number;
  /** Top surface line. Smaller is higher up the field. */
  y: number;
  width: number;
}

/**
 * A fixed bed of spikes. Unlike a rock it never moves and never bruises: it is
 * simply a piece of the level that ends any smiley that touches it. On a stage
 * where the ground is a trampoline this is the only thing that can actually
 * cost you a smiley, which is what makes the roster mean something.
 */
export interface SpikeStripSpec {
  id: string;
  /** Left edge, in whole units. */
  x: number;
  /** The surface line the teeth grow out of. */
  y: number;
  width: number;
  /** Which way the teeth point. Defaults to 'up'. */
  facing?: 'up' | 'down';
}

export interface SpikeStripState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  facing: 'up' | 'down';
}

export interface PlatformState {
  id: string;
  /** Fixed-point, like every other simulated coordinate. */
  x: number;
  y: number;
  width: number;
  thickness: number;
}

export interface RockState {
  id: string;
  position: FixedPoint;
  velocity: FixedPoint;
  radius: number;
  kind: RockKind;
}

export interface BucketState {
  id: string;
  /** Left edge of the bucket in fixed-point units. */
  x: number;
  width: number;
  capacity: number;
  filled: number;
  velocity: number;
  minX: number;
  maxX: number;
  /** The surface this pail stands on: the ground, or the top of a ledge. */
  baseY: number;
  /** The line a smiley has to cross to be caught by this particular pail. */
  mouthY: number;
}

export interface SmileyDrop {
  tick: number;
  /** Spawn column in whole units. */
  x: number;
  /** Spawn height; defaults to the scenario's dropY, or the top of the field. */
  y?: number;
  vx?: number;
}

export interface RockSpawn {
  tick: number;
  y: number;
  /** Leftward speed in units per tick; stored as a positive number. */
  speed: number;
  drift?: number;
  kind?: RockKind;
}

export interface BucketSpec {
  id: string;
  x: number;
  width: number;
  capacity: number;
  /**
   * The line the pail stands on. Defaults to the field floor; set it to a
   * platform's `y` to stand the pail on a ledge.
   */
  baseY?: number;
  drift?: {
    speed: number;
    minX: number;
    maxX: number;
  };
}

export interface SmilefallScenario {
  id: string;
  name: string;
  width: number;
  height: number;
  ticksPerSecond: number;
  moodId?: MoodId;
  /** Missed smilies allowed before the run turns grumpy. */
  frownLimit: number;
  /** Defaults to 'bruise': rocks knock smilies around instead of deleting them. */
  rockRule?: RockRule;
  /** Defaults to 'splat': the ground is fatal. */
  floorRule?: FloorRule;
  /** Overrides TIME_BONUS_PER_TICK, for stages scored on speed. */
  timeBonusPerTick?: number;
  hopCharges: number;
  hopRechargeTicks: number;
  timeLimitTicks?: number;
  buckets: BucketSpec[];
  /** Solid ledges. Empty on a flat stage. */
  platforms?: PlatformSpec[];
  /** Fixed spike beds. Touching one ends a smiley outright. */
  spikes?: SpikeStripSpec[];
  drops: SmileyDrop[];
  rocks: RockSpawn[];
  /** Default spawn height for drops. Defaults to the top of the field. */
  dropY?: number;
  /**
   * How much of a tall field the camera frames to begin with. Purely a viewing
   * hint — the simulation never reads it — but it is authored alongside the
   * geometry, so it lives with the scenario.
   */
  viewHeight?: number;
}

export interface SmilefallState {
  tick: number;
  scenarioId: string;
  width: number;
  height: number;
  status: EpisodeStatus;
  failureReason: FailureReason | null;
  smilies: SmileyState[];
  rocks: RockState[];
  buckets: BucketState[];
  platforms: PlatformState[];
  spikes: SpikeStripState[];
  caught: number;
  missed: number;
  /** Cumulative bonks taken across the run; bonks cost combo, not frowns. */
  bonks: number;
  frownsRemaining: number;
  dropsRemaining: number;
  combo: number;
  bestCombo: number;
  score: number;
  hopCharges: number;
  hopChargesMax: number;
  hopRechargeTicks: number;
  hopRechargeProgress: number;
  bucketsFilled: number;
  bucketCount: number;
  /** Slots still to fill across every bucket. */
  slotsRemaining: number;
  /** Smilies still in play plus smilies still to drop. */
  smiliesRemaining: number;
  /**
   * How many smilies you can still afford to lose. Zero means the next one is
   * the run: this is the real fail meter on a stage where nothing splats.
   */
  spareSmilies: number;
  moodId: MoodId;
  rockRule: RockRule;
  floorRule: FloorRule;
  /** Mirrors the scenario so the renderer can frame a tall field. */
  viewHeight: number;
  /** Fixed-point height the next smiley will appear at. */
  dropY: number;
  timeRemainingTicks: number | null;
  controllerVersion: number;
  currentInput: ControlInput;
}

export type GameEvent =
  | { tick: number; type: 'smiley_dropped'; smileyId: string }
  | {
      tick: number;
      type: 'smiley_caught';
      smileyId: string;
      bucketId: string;
      filled: number;
      points: number;
      bruised: boolean;
    }
  | { tick: number; type: 'smiley_splatted'; smileyId: string; reason: SplatReason; at: Point }
  | { tick: number; type: 'smiley_smashed'; smileyId: string; rockId: string; at: Point }
  | {
      tick: number;
      type: 'smiley_bruised';
      smileyId: string;
      cause: BruiseCause;
      rockId?: string;
      at: Point;
      bruises: number;
    }
  | {
      tick: number;
      type: 'smiley_bounced';
      smileyId: string;
      surface: BounceSurface;
      at: Point;
    }
  | { tick: number; type: 'bucket_burped'; smileyId: string; bucketId: string }
  | { tick: number; type: 'bucket_filled'; bucketId: string }
  | { tick: number; type: 'flock_hopped'; smilies: number; chargesRemaining: number }
  | { tick: number; type: 'rock_spawned'; rockId: string; kind: RockKind }
  | { tick: number; type: 'time_expired' }
  | { tick: number; type: 'level_won'; score: number }
  | { tick: number; type: 'game_lost'; reason: FailureReason }
  | { tick: number; type: 'controller_installed'; version: number };

export interface TickResult {
  state: SmilefallState;
  events: GameEvent[];
}

export interface ReplayTick {
  tick: number;
  input: ControlInput;
  controllerVersion: number;
  controlEvents?: GameEvent[];
  events: GameEvent[];
}

export interface SmilefallReplay {
  version: 1;
  scenario: SmilefallScenario;
  ticks: ReplayTick[];
  finalState: SmilefallState;
}

export const IDLE_INPUT: ControlInput = { lean: 'none', hop: false };

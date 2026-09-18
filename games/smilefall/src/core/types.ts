export type LeanDirection = 'left' | 'right' | 'none';
export type EpisodeStatus = 'running' | 'won' | 'lost';
export type FailureReason = 'out_of_smilies' | 'timeout';
export type RockKind = 'pebble' | 'boulder' | 'chonk';
/** The silhouette is the rule: only visibly spiked rocks can pop a smiley. */
export type RockHazard = 'plain' | 'spiked';
export type PopCause = 'spike_strip' | 'spiked_rock';
export type BruiseCause = 'rock' | 'floor' | 'rim' | 'burp' | 'platform' | 'wall' | 'bucket';
export type BounceSurface = 'floor' | 'rim' | 'ledge';
export type MoodId = 'giggle' | 'chuckle' | 'guffaw' | 'cackle';

/** Every simulated coordinate is fixed-point so ticks reproduce exactly. */
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
  /** Number of times a full bucket has returned this smiley to the field. */
  bounces: number;
  /** Every safe impact adds a frown and lowers this smiley's catch value. */
  bruises: number;
  /** Ticks of post-rock invulnerability so one rock cannot chain-hit. */
  graceTicks: number;
  spawnTick: number;
}

export interface PlatformSpec {
  id: string;
  x: number;
  /** Top surface line. Smaller is higher up the field. */
  y: number;
  width: number;
}

export interface SpikeStripSpec {
  id: string;
  x: number;
  /** The surface line the teeth grow out of. */
  y: number;
  width: number;
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
  hazard: RockHazard;
}

export interface BucketState {
  id: string;
  x: number;
  width: number;
  capacity: number;
  filled: number;
  velocity: number;
  minX: number;
  maxX: number;
  baseY: number;
  mouthY: number;
}

export interface SmileyDrop {
  tick: number;
  x: number;
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
  /** Defaults to plain. A spiked rock pops immediately on contact. */
  hazard?: RockHazard;
  /** Defaults to right. Ranked mirrored layouts enter from the opposite wall. */
  from?: 'left' | 'right';
}

export interface BucketSpec {
  id: string;
  x: number;
  width: number;
  capacity: number;
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
  timeBonusPerTick?: number;
  hopCharges: number;
  hopRechargeTicks: number;
  timeLimitTicks?: number;
  buckets: BucketSpec[];
  platforms?: PlatformSpec[];
  spikes?: SpikeStripSpec[];
  drops: SmileyDrop[];
  rocks: RockSpawn[];
  dropY?: number;
  /** Viewing hint for tall stages; the simulation does not read it. */
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
  /** Smilies popped by visibly lethal hazards. */
  missed: number;
  /** Total safe impacts. These break combo and reduce catch value. */
  bonks: number;
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
  slotsRemaining: number;
  smiliesRemaining: number;
  /** Remaining loss budget. Reaching zero ends the stage unless it is complete. */
  reserveSmilies: number;
  /** @deprecated Use reserveSmilies. Kept while the first viewer migrates. */
  spareSmilies: number;
  moodId: MoodId;
  viewHeight: number;
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
  | {
      tick: number;
      type: 'smiley_popped';
      smileyId: string;
      cause: PopCause;
      sourceId: string;
      at: Point;
    }
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
  | { tick: number; type: 'rock_spawned'; rockId: string; kind: RockKind; hazard: RockHazard }
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
  version: 2;
  scenario: SmilefallScenario;
  ticks: ReplayTick[];
  finalState: SmilefallState;
}

export const IDLE_INPUT: ControlInput = { lean: 'none', hop: false };

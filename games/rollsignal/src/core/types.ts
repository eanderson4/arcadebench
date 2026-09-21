export type AxisInput = -1 | 0 | 1;
export type RunStatus = 'running' | 'won' | 'time_up';
export type SurfaceKind = 'normal' | 'slick';
export type ForceZoneKind = 'wind' | 'conveyor';

export interface Point {
  x: number;
  y: number;
}

/** Integer fixed-point coordinate. Divide by FIXED_SCALE only for presentation. */
export interface FixedPoint {
  x: number;
  y: number;
}

export interface RollSignalInput {
  steerX: AxisInput;
  steerY: AxisInput;
  /** Brace trades top speed for braking and traction. */
  brace: boolean;
}

export interface RectangleSpec {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeckSpec extends RectangleSpec {
  surface?: SurfaceKind;
}

/** A solid authored wall. Thin rectangles make deck-edge rails. */
export interface RailSpec extends RectangleSpec {}

export interface CircleSpec {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface CheckpointSpec extends CircleSpec {}

export interface ToneRingSpec extends CircleSpec {
  points?: number;
}

export interface GoalSpec extends CircleSpec {}

export interface ForceZoneSpec extends RectangleSpec {
  kind: ForceZoneKind;
  /** Fixed-point acceleration per tick, despite authored geometry using world units. */
  forceX: number;
  forceY: number;
}

export interface ObstacleMotionSpec {
  axis: 'x' | 'y';
  /** Travel in world units from the obstacle's authored origin. */
  range: number;
  periodTicks: number;
  phaseTicks?: number;
}

export interface ObstacleSpec extends RectangleSpec {
  motion?: ObstacleMotionSpec;
  penaltyTicks?: number;
}

export interface RelayPadSpec extends CircleSpec {
  gateId: string;
}

export interface GateSpec extends RectangleSpec {
  /** Every listed pad must be active before this gate disappears. */
  requiredPadIds: readonly string[];
}

export interface RollSignalCourse {
  id: string;
  number: number;
  name: string;
  tagline: string;
  timeLimitTicks: number;
  parTicks: number;
  spawn: Point;
  decks: readonly DeckSpec[];
  rails: readonly RailSpec[];
  checkpoints: readonly CheckpointSpec[];
  rings: readonly ToneRingSpec[];
  goal: GoalSpec;
  zones?: readonly ForceZoneSpec[];
  obstacles?: readonly ObstacleSpec[];
  relayPads?: readonly RelayPadSpec[];
  gates?: readonly GateSpec[];
  fallPenaltyTicks?: number;
  /** Presentation and deterministic reference-controller route data. */
  referenceWaypoints: readonly Point[];
  referenceMaxTicks: number;
}

export interface DynamicObstacleState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RollSignalState {
  tick: number;
  courseId: string;
  status: RunStatus;
  position: FixedPoint;
  velocity: FixedPoint;
  checkpointId: string | null;
  checkpoint: FixedPoint;
  falls: number;
  penaltyTicks: number;
  elapsedTicks: number;
  effectiveTimeTicks: number;
  timeRemainingTicks: number;
  ringsCollected: string[];
  score: number;
  currentInput: RollSignalInput;
  onDeck: boolean;
  surface: SurfaceKind;
  activeRelayPads: string[];
  openGateIds: string[];
  obstacles: DynamicObstacleState[];
}

export type RollSignalEvent =
  | { tick: number; type: 'checkpoint_reached'; checkpointId: string }
  | { tick: number; type: 'tone_ring'; ringId: string; points: number }
  | { tick: number; type: 'relay_pad'; padId: string; gateId: string }
  | { tick: number; type: 'gate_opened'; gateId: string }
  | { tick: number; type: 'rail_hit'; railId: string }
  | { tick: number; type: 'obstacle_hit'; obstacleId: string; penaltyTicks: number }
  | { tick: number; type: 'fell'; at: Point; penaltyTicks: number }
  | { tick: number; type: 'respawned'; checkpointId: string | null; at: Point }
  | { tick: number; type: 'goal_reached'; score: number }
  | { tick: number; type: 'time_expired' };

export interface TickResult {
  state: RollSignalState;
  events: RollSignalEvent[];
}

export interface ReplayTick {
  tick: number;
  input: RollSignalInput;
  events: RollSignalEvent[];
}

export interface RollSignalReplay {
  version: 1;
  course: RollSignalCourse;
  ticks: ReplayTick[];
  finalState: RollSignalState;
}

export const IDLE_INPUT: RollSignalInput = { steerX: 0, steerY: 0, brace: false };

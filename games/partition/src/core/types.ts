export type Direction = 'up' | 'down' | 'left' | 'right' | 'idle';
export type DrawMode = 'off' | 'fast' | 'slow';
export type EpisodeStatus = 'running' | 'won' | 'lost';
export type FailureReason = 'integrity' | 'timeout';
export type DifficultyId = 'easy' | 'medium' | 'hard' | 'impossible';

export interface Point {
  x: number;
  y: number;
}

export interface FixedPoint {
  x: number;
  y: number;
}

export interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface ControlInput {
  direction: Direction;
  draw: DrawMode;
}

export interface SparkState {
  position: Point;
  heading: Direction;
  drawing: boolean;
  drawMode: DrawMode;
  integrity: number;
}

export interface AnomalyState {
  id: string;
  position: FixedPoint;
  velocity: FixedPoint;
}

export interface PartitionScenario {
  id: string;
  name: string;
  width: number;
  height: number;
  ticksPerSecond: number;
  targetFraction: number;
  integrity: number;
  difficultyId?: DifficultyId;
  sparkStart?: Point;
  sparkMoveEveryTicks?: number;
  timeLimitTicks?: number;
  blockedCells?: number[];
  initialWalls?: Edge[];
  anomalies: Array<{
    id: string;
    position: [number, number];
    velocity: [number, number];
  }>;
}

export interface PartitionState {
  tick: number;
  scenarioId: string;
  width: number;
  height: number;
  status: EpisodeStatus;
  failureReason: FailureReason | null;
  spark: SparkState;
  anomalies: AnomalyState[];
  walls: Edge[];
  trace: Edge[];
  stabilizedCells: number[];
  capturedFraction: number;
  targetFraction: number;
  difficultyId: DifficultyId;
  blockedCells: number[];
  playableCellCount: number;
  timeRemainingTicks: number | null;
  sparkMoveEveryTicks: number;
  controllerVersion: number;
  currentInput: ControlInput;
}

export type GameEvent =
  | { tick: number; type: 'trace_started'; at: Point }
  | { tick: number; type: 'trace_completed'; capturedCells: number }
  | { tick: number; type: 'trace_hit'; anomalyId: string; integrity: number }
  | { tick: number; type: 'time_expired' }
  | { tick: number; type: 'level_won'; capturedFraction: number }
  | { tick: number; type: 'game_lost' }
  | { tick: number; type: 'controller_installed'; version: number };

export interface TickResult {
  state: PartitionState;
  events: GameEvent[];
}

export interface ReplayTick {
  tick: number;
  input: ControlInput;
  controllerVersion: number;
  controlEvents?: GameEvent[];
  events: GameEvent[];
}

export interface PartitionReplay {
  version: 1;
  scenario: PartitionScenario;
  ticks: ReplayTick[];
  finalState: PartitionState;
}

export const IDLE_INPUT: ControlInput = { direction: 'idle', draw: 'off' };

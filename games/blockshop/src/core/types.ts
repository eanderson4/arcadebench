export type PowerKind = 'wide' | 'slow' | 'multi' | 'sticky' | 'heavy' | 'extra';
export type BrickMaterial = 'paint' | 'hardwood' | 'steel';
export type StageStatus = 'ready' | 'running' | 'won' | 'lost';

export interface BlockshopInput {
  move: -1 | 0 | 1;
  /** Edge-triggered. Launches a waiting or sticky-caught ball. */
  action: boolean;
}

export interface BrickSpec {
  id: string;
  column: number;
  row: number;
  material: BrickMaterial;
  hits: number;
  power: PowerKind | null;
}

export interface BlockshopStage {
  id: string;
  number: number;
  title: string;
  lesson: string;
  accent: string;
  ballSpeed: number;
  bricks: readonly BrickSpec[];
}

export interface BrickState extends BrickSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  hitsRemaining: number;
  alive: boolean;
}

export interface BallState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  stuck: boolean;
  stuckOffset: number;
}

export interface PowerDropState {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
  vy: number;
}

export interface BlockshopState {
  tick: number;
  stageId: string;
  status: StageStatus;
  score: number;
  stageScore: number;
  lives: number;
  combo: number;
  bestCombo: number;
  /** Drives a deterministic angle nudge when a rally stops reaching new blocks. */
  ticksWithoutBreak: number;
  paddleX: number;
  paddleWidth: number;
  balls: BallState[];
  bricks: BrickState[];
  powerDrops: PowerDropState[];
  wideTicks: number;
  slowTicks: number;
  heavyTicks: number;
  stickyCharges: number;
  blocksRemaining: number;
}

export type BlockshopEvent =
  | { tick: number; type: 'ball_launched'; ballId: number }
  | { tick: number; type: 'paddle_hit'; ballId: number }
  | { tick: number; type: 'brick_hit'; brickId: string; material: BrickMaterial }
  | { tick: number; type: 'brick_broken'; brickId: string; points: number; power: PowerKind | null }
  | { tick: number; type: 'power_collected'; power: PowerKind }
  | { tick: number; type: 'ball_lost'; lives: number }
  | { tick: number; type: 'stage_won'; bonus: number }
  | { tick: number; type: 'stage_lost' };

export interface StepResult {
  state: BlockshopState;
  events: BlockshopEvent[];
}

import { BlockshopEngine } from './engine';
import type { BlockshopInput, BlockshopStage, BlockshopState } from './types';

export interface BlockshopReplay {
  schema: 1;
  stageId: string;
  startingScore: number;
  startingLives: number;
  inputs: BlockshopInput[];
}

const MAX_STARTING_SCORE = 1_000_000_000;
const MAX_STARTING_LIVES = 5;
const MAX_REPLAY_TICKS = 30 * 60 * 60;

function isReplayInput(input: unknown): input is BlockshopInput {
  if (input === null || typeof input !== 'object') return false;
  const candidate = input as Partial<BlockshopInput>;
  return (candidate.move === -1 || candidate.move === 0 || candidate.move === 1)
    && typeof candidate.action === 'boolean';
}

export function replayBlockshop(stage: BlockshopStage, replay: BlockshopReplay): BlockshopState {
  if (replay === null || typeof replay !== 'object'
    || replay.schema !== 1 || replay.stageId !== stage.id) {
    throw new Error('Blockshop replay does not match this stage.');
  }
  if (!Number.isSafeInteger(replay.startingScore)
    || replay.startingScore < 0 || replay.startingScore > MAX_STARTING_SCORE) {
    throw new Error('Blockshop replay has an invalid starting score.');
  }
  if (!Number.isSafeInteger(replay.startingLives)
    || replay.startingLives < 1 || replay.startingLives > MAX_STARTING_LIVES) {
    throw new Error('Blockshop replay has an invalid starting ball count.');
  }
  if (!Array.isArray(replay.inputs) || replay.inputs.length > MAX_REPLAY_TICKS
    || !replay.inputs.every(isReplayInput)) {
    throw new Error('Blockshop replay has invalid control input.');
  }
  const engine = new BlockshopEngine(stage, { score: replay.startingScore, lives: replay.startingLives });
  for (const input of replay.inputs) engine.step(input);
  return engine.snapshot();
}

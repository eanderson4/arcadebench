import { BlockshopEngine } from './engine';
import type { BlockshopInput, BlockshopStage, BlockshopState } from './types';

export interface BlockshopReplay {
  schema: 1;
  stageId: string;
  startingScore: number;
  startingLives: number;
  inputs: BlockshopInput[];
}

export function replayBlockshop(stage: BlockshopStage, replay: BlockshopReplay): BlockshopState {
  if (replay.schema !== 1 || replay.stageId !== stage.id) throw new Error('Blockshop replay does not match this stage.');
  const engine = new BlockshopEngine(stage, { score: replay.startingScore, lives: replay.startingLives });
  for (const input of replay.inputs) engine.step(input);
  return engine.snapshot();
}

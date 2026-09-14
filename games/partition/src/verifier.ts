/** Production verifier surface for server runtimes. */
export { PartitionEngine } from './core/engine';
export { applyDifficulty } from './core/difficulty';
export { PARTITION_GAME_ID, PARTITION_GAME_VERSION } from './core/version';
export { createPartitionCampaign } from './levels/campaign';
export { resolvePartitionProgression } from './levels/progressions';
export type {
  ControlInput,
  DifficultyId,
  GameEvent,
  PartitionReplay,
  PartitionScenario,
  PartitionState,
  ReplayTick,
} from './core/types';

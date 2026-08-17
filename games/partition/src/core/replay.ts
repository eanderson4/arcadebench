import { PartitionEngine } from './engine';
import type { PartitionReplay, PartitionState } from './types';

export function replayPartition(replay: PartitionReplay): PartitionState {
  if (replay.version !== 1) throw new Error(`unsupported Partition replay version: ${replay.version}`);
  const engine = new PartitionEngine(replay.scenario);
  for (const record of replay.ticks) {
    if (record.tick !== engine.snapshot().tick + 1) throw new Error(`non-contiguous replay tick: ${record.tick}`);
    engine.setInput(record.input);
    const result = engine.step();
    if (JSON.stringify(result.events) !== JSON.stringify(record.events)) {
      throw new Error(`replay event mismatch at tick ${record.tick}`);
    }
  }
  return engine.snapshot();
}


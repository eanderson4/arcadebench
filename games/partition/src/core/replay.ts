import { PartitionEngine } from './engine';
import type { GameEvent, PartitionReplay, PartitionState } from './types';

export interface PartitionReplayFrame {
  state: PartitionState;
  events: GameEvent[];
}

export function replayPartitionFrames(replay: PartitionReplay): PartitionReplayFrame[] {
  if (replay.version !== 1) throw new Error(`unsupported Partition replay version: ${String(replay.version)}`);
  const engine = new PartitionEngine(replay.scenario);
  const frames: PartitionReplayFrame[] = [{ state: engine.snapshot(), events: [] }];
  for (const record of replay.ticks) {
    if (record.tick !== engine.snapshot().tick + 1) throw new Error(`non-contiguous replay tick: ${record.tick}`);
    engine.setControllerVersion(record.controllerVersion ?? 0);
    engine.setInput(record.input);
    const result = engine.step();
    if (JSON.stringify(result.events) !== JSON.stringify(record.events)) {
      throw new Error(`replay event mismatch at tick ${record.tick}`);
    }
    frames.push({
      state: result.state,
      events: structuredClone([...(record.controlEvents ?? []), ...result.events]),
    });
  }
  if (JSON.stringify(frames.at(-1)!.state) !== JSON.stringify(replay.finalState)) {
    throw new Error('replay final state does not match reconstructed state');
  }
  return frames;
}

export function replayPartition(replay: PartitionReplay): PartitionState {
  return replayPartitionFrames(replay).at(-1)!.state;
}

export function parsePartitionReplay(json: string): PartitionReplay {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object') throw new Error('replay must be a JSON object');
  const replay = value as Partial<PartitionReplay>;
  if (replay.version !== 1) throw new Error(`unsupported Partition replay version: ${String(replay.version)}`);
  if (!replay.scenario || !Array.isArray(replay.ticks) || !replay.finalState) {
    throw new Error('replay is missing scenario, ticks, or finalState');
  }
  return replay as PartitionReplay;
}

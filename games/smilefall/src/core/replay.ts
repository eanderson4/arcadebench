import { SmilefallEngine } from './engine';
import type { GameEvent, SmilefallReplay, SmilefallState } from './types';

export interface SmilefallReplayFrame {
  state: SmilefallState;
  events: GameEvent[];
}

function matchesRecordedState(actual: unknown, recorded: unknown): boolean {
  if (recorded === null || typeof recorded !== 'object') return Object.is(actual, recorded);
  if (Array.isArray(recorded)) {
    return Array.isArray(actual)
      && actual.length === recorded.length
      && recorded.every((value, index) => matchesRecordedState(actual[index], value));
  }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  return Object.entries(recorded).every(([key, value]) =>
    matchesRecordedState((actual as Record<string, unknown>)[key], value));
}

export function replaySmilefallFrames(replay: SmilefallReplay): SmilefallReplayFrame[] {
  if (replay.version !== 1) throw new Error(`unsupported Smilefall replay version: ${String(replay.version)}`);
  const engine = new SmilefallEngine(replay.scenario);
  const frames: SmilefallReplayFrame[] = [{ state: engine.snapshot(), events: [] }];
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
  // Display-only fields may be added to a version-1 state over time. A stored
  // artifact still has to validate every field it actually recorded.
  if (!matchesRecordedState(frames.at(-1)!.state, replay.finalState)) {
    throw new Error('replay final state does not match reconstructed state');
  }
  return frames;
}

export function replaySmilefall(replay: SmilefallReplay): SmilefallState {
  return replaySmilefallFrames(replay).at(-1)!.state;
}

export function parseSmilefallReplay(json: string): SmilefallReplay {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object') throw new Error('replay must be a JSON object');
  const replay = value as Partial<SmilefallReplay>;
  if (replay.version !== 1) throw new Error(`unsupported Smilefall replay version: ${String(replay.version)}`);
  if (!replay.scenario || !Array.isArray(replay.ticks) || !replay.finalState) {
    throw new Error('replay is missing scenario, ticks, or finalState');
  }
  return replay as SmilefallReplay;
}

import { describe, expect, it } from 'vitest';
import {
  IDLE_INPUT,
  getRollSignalCourse,
  parseRollSignalReplay,
  recordRollSignalReplay,
  replayRollSignal,
} from '../src';

describe('versioned bounded replay', () => {
  it('reproduces state exactly and parses a valid JSON artifact', () => {
    const inputs = Array.from({ length: 120 }, (_, index) => ({
      steerX: (index < 80 ? 1 : 0) as 0 | 1,
      steerY: 0 as const,
      brace: index >= 80,
    }));
    const replay = recordRollSignalReplay(getRollSignalCourse('first-chime'), inputs);
    expect(replayRollSignal(replay)).toEqual(replay.finalState);
    expect(parseRollSignalReplay(JSON.stringify(replay))).toEqual(replay);
  });

  it('rejects unsupported, malformed, non-contiguous, and tampered artifacts', () => {
    const replay = recordRollSignalReplay(getRollSignalCourse('first-chime'), [IDLE_INPUT, IDLE_INPUT]);
    expect(() => parseRollSignalReplay(JSON.stringify({ ...replay, version: 2 }))).toThrow(/unsupported/);
    expect(() => parseRollSignalReplay(JSON.stringify({ ...replay, ticks: [{ ...replay.ticks[0], tick: 2 }] }))).toThrow(/non-contiguous/);
    expect(() => parseRollSignalReplay(JSON.stringify({ ...replay, ticks: [{ ...replay.ticks[0], input: { steerX: 7, steerY: 0, brace: false } }] }))).toThrow(/steerX/);
    expect(() => replayRollSignal({ ...replay, finalState: { ...replay.finalState, score: 99 } })).toThrow(/final state/);
  });
});

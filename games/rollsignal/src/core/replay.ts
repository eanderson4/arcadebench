import { MAX_REPLAY_BYTES, MAX_REPLAY_TICKS } from './constants';
import { assertRollSignalInput, RollSignalEngine } from './engine';
import type {
  RollSignalCourse,
  RollSignalEvent,
  RollSignalInput,
  RollSignalReplay,
  RollSignalState,
} from './types';
import { validateRollSignalCourse } from '../levels/validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equalValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return equalValue(leftKeys, rightKeys)
    && leftKeys.every((key) => equalValue(left[key], right[key]));
}

function assertReplayCourse(value: unknown): asserts value is RollSignalCourse {
  if (!isRecord(value)) throw new Error('replay course must be an object');
  for (const field of ['decks', 'rails', 'checkpoints', 'rings', 'referenceWaypoints'] as const) {
    if (!Array.isArray(value[field])) throw new Error(`replay course ${field} must be an array`);
  }
  if (!isRecord(value.spawn) || !isRecord(value.goal)) throw new Error('replay course needs a spawn and goal');
  const result = validateRollSignalCourse(value as unknown as RollSignalCourse);
  if (!result.valid) throw new Error(`invalid replay course: ${result.errors.join('; ')}`);
}

function assertEventArray(value: unknown, tick: number): asserts value is RollSignalEvent[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error(`replay tick ${tick} has invalid events`);
  for (const event of value) {
    if (!isRecord(event) || event.tick !== tick || typeof event.type !== 'string') {
      throw new Error(`replay tick ${tick} has a malformed event`);
    }
  }
}

function validateReplayValue(value: unknown): RollSignalReplay {
  if (!isRecord(value)) throw new Error('replay must be a JSON object');
  if (value.version !== 1) throw new Error(`unsupported Roll Signal replay version: ${String(value.version)}`);
  assertReplayCourse(value.course);
  if (!Array.isArray(value.ticks)) throw new Error('replay ticks must be an array');
  if (value.ticks.length > MAX_REPLAY_TICKS) throw new Error(`replay exceeds ${MAX_REPLAY_TICKS} ticks`);
  if (!isRecord(value.finalState)) throw new Error('replay finalState must be an object');

  for (let index = 0; index < value.ticks.length; index++) {
    const frame = value.ticks[index];
    if (!isRecord(frame)) throw new Error(`replay tick ${index + 1} must be an object`);
    if (frame.tick !== index + 1) throw new Error(`non-contiguous replay tick: ${String(frame.tick)}`);
    assertRollSignalInput(frame.input);
    assertEventArray(frame.events, index + 1);
    if (Object.keys(frame).some((key) => !['tick', 'input', 'events'].includes(key))) {
      throw new Error(`replay tick ${index + 1} contains unsupported fields`);
    }
  }
  return value as unknown as RollSignalReplay;
}

export function replayRollSignal(replay: RollSignalReplay): RollSignalState {
  const checked = validateReplayValue(replay);
  const engine = new RollSignalEngine(checked.course);
  for (const frame of checked.ticks) {
    const result = engine.step(frame.input);
    if (!equalValue(result.events, frame.events)) throw new Error(`replay event mismatch at tick ${frame.tick}`);
  }
  const state = engine.snapshot();
  if (!equalValue(state, checked.finalState)) throw new Error('replay final state does not match reconstructed state');
  return state;
}

export function parseRollSignalReplay(json: string): RollSignalReplay {
  if (new TextEncoder().encode(json).byteLength > MAX_REPLAY_BYTES) {
    throw new Error(`replay exceeds ${MAX_REPLAY_BYTES} bytes`);
  }
  const replay = validateReplayValue(JSON.parse(json));
  replayRollSignal(replay);
  return structuredClone(replay);
}

export function recordRollSignalReplay(
  course: RollSignalCourse,
  inputs: readonly RollSignalInput[],
): RollSignalReplay {
  if (inputs.length > MAX_REPLAY_TICKS) throw new Error(`replay exceeds ${MAX_REPLAY_TICKS} ticks`);
  const engine = new RollSignalEngine(course);
  const ticks = inputs.map((input, index) => {
    const result = engine.step(input);
    return {
      tick: index + 1,
      input: { ...input },
      events: structuredClone(result.events),
    };
  });
  return {
    version: 1,
    course: structuredClone(course),
    ticks,
    finalState: engine.snapshot(),
  };
}

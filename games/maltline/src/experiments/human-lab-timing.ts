export type P108HumanLabInterruptionKind = 'blur' | 'hidden' | 'unsupported-width'
  | 'width-stratum-mismatch' | 'clock-backlog' | 'test-request';

export interface P108HumanLabInterruption {
  sequence: number;
  kind: P108HumanLabInterruptionKind;
  phase: string;
  surface: string;
  startedAtMs: number;
  durationMs: number;
}

interface P108OpenHumanLabInterruption extends Omit<P108HumanLabInterruption, 'durationMs'> {
  pausedBeforeMs: number;
}

export interface P108HumanLabTimingState {
  originAtMs: number;
  lastAtMs: number;
  active: boolean;
  activePlayMs: number;
  pausedMs: number;
  interruptions: readonly P108HumanLabInterruption[];
  openInterruption: Readonly<P108OpenHumanLabInterruption> | null;
}

export type P108HumanLabTimingEvent =
  | { type: 'set-active'; nowMs: number; active: boolean }
  | { type: 'pause'; nowMs: number; kind: P108HumanLabInterruptionKind;
    phase: string; surface: string }
  | { type: 'resume'; nowMs: number; active: boolean };

export interface P108HumanLabTimingSnapshot {
  elapsedMs: number;
  activePlayMs: number;
  pausedMs: number;
  interruptions: readonly P108HumanLabInterruption[];
}

export const P108_HUMAN_LAB_MAX_INTERRUPTION_COUNT = 1_024;
const MAX_LABEL_LENGTH = 64;

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Reflect.ownKeys(value);
  const allowed = new Set(keys);
  if (actual.some((key) => typeof key !== 'string' || !allowed.has(key))
    || keys.some((key) => !actual.includes(key))) {
    throw new Error(`${label} contains missing or unsupported fields`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function exactArray(value: unknown, maximum: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum
    || Reflect.ownKeys(value).some((key) => key !== 'length'
      && (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key)
        || Number(key) >= value.length))) {
    throw new Error(`${label} must be an exact array with at most ${maximum} entries`);
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}[${index}] must be an enumerable data property`);
    }
  }
  return value;
}

function freeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && 'value' in descriptor) freeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}

function milliseconds(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} must be finite nonnegative milliseconds within the safe range`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function sequence(value: unknown, expected: number, label: string): number {
  if (value !== expected) throw new Error(`${label} must be ${expected}`);
  return expected;
}

function checkedAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} exceeds the safe millisecond range`);
  }
  return result;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function kind(value: unknown, label: string): P108HumanLabInterruptionKind {
  if (value !== 'blur' && value !== 'hidden' && value !== 'unsupported-width'
    && value !== 'width-stratum-mismatch' && value !== 'clock-backlog'
    && value !== 'test-request') {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function boundedLabel(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const result = value.trim();
  if (result.length === 0 || result.length > MAX_LABEL_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new Error(`${label} must contain 1 through ${MAX_LABEL_LENGTH} non-control characters`);
  }
  return result;
}

function normalizeCompleted(
  value: unknown,
  expectedSequence: number,
  originAtMs: number,
  lastAtMs: number,
  previousEndMs: number,
): P108HumanLabInterruption {
  const entry = exact(value, ['sequence', 'kind', 'phase', 'surface', 'startedAtMs', 'durationMs'],
    `interruption ${expectedSequence}`);
  const startedAtMs = milliseconds(entry.startedAtMs, `interruption ${expectedSequence}.startedAtMs`);
  const durationMs = milliseconds(entry.durationMs, `interruption ${expectedSequence}.durationMs`);
  const endedAtMs = checkedAdd(startedAtMs, durationMs, `interruption ${expectedSequence}`);
  if (startedAtMs < originAtMs || startedAtMs < previousEndMs || endedAtMs > lastAtMs) {
    throw new Error(`interruption ${expectedSequence} is outside monotonic timing bounds`);
  }
  return freeze({ sequence: sequence(entry.sequence, expectedSequence,
    `interruption ${expectedSequence}.sequence`), kind: kind(entry.kind, `interruption ${expectedSequence}.kind`),
  phase: boundedLabel(entry.phase, `interruption ${expectedSequence}.phase`),
  surface: boundedLabel(entry.surface, `interruption ${expectedSequence}.surface`), startedAtMs, durationMs });
}

/** Strict clone/freeze boundary for timing state received from any caller. */
export function normalizeP108HumanLabTimingState(value: unknown): P108HumanLabTimingState {
  const state = exact(value, ['originAtMs', 'lastAtMs', 'active', 'activePlayMs', 'pausedMs',
    'interruptions', 'openInterruption'], 'human-lab timing state');
  const originAtMs = milliseconds(state.originAtMs, 'timing originAtMs');
  const lastAtMs = milliseconds(state.lastAtMs, 'timing lastAtMs');
  if (lastAtMs < originAtMs) throw new Error('timing lastAtMs cannot precede originAtMs');
  const active = boolean(state.active, 'timing active');
  const activePlayMs = milliseconds(state.activePlayMs, 'timing activePlayMs');
  const pausedMs = milliseconds(state.pausedMs, 'timing pausedMs');
  const rawInterruptions = exactArray(state.interruptions,
    P108_HUMAN_LAB_MAX_INTERRUPTION_COUNT, 'timing interruptions');
  let previousEndMs = originAtMs;
  let completedPausedMs = 0;
  const interruptions = rawInterruptions.map((entry, index) => {
    const normalized = normalizeCompleted(entry, index + 1, originAtMs, lastAtMs, previousEndMs);
    previousEndMs = normalized.startedAtMs + normalized.durationMs;
    completedPausedMs = checkedAdd(completedPausedMs, normalized.durationMs, 'timing pausedMs');
    return normalized;
  });
  let openInterruption: Readonly<P108OpenHumanLabInterruption> | null = null;
  if (state.openInterruption !== null) {
    const open = exact(state.openInterruption,
      ['sequence', 'kind', 'phase', 'surface', 'startedAtMs', 'pausedBeforeMs'], 'open interruption');
    const startedAtMs = milliseconds(open.startedAtMs, 'open interruption.startedAtMs');
    const pausedBeforeMs = milliseconds(open.pausedBeforeMs, 'open interruption.pausedBeforeMs');
    if (startedAtMs < previousEndMs || startedAtMs > lastAtMs
      || pausedBeforeMs !== completedPausedMs
      || pausedMs !== checkedAdd(pausedBeforeMs, lastAtMs - startedAtMs, 'timing pausedMs')) {
      throw new Error('open interruption does not reconcile with timing state');
    }
    openInterruption = freeze({ sequence: sequence(open.sequence, interruptions.length + 1,
      'open interruption.sequence'), kind: kind(open.kind, 'open interruption.kind'),
    phase: boundedLabel(open.phase, 'open interruption.phase'),
    surface: boundedLabel(open.surface, 'open interruption.surface'), startedAtMs, pausedBeforeMs });
    if (active) throw new Error('timing cannot be active during an open interruption');
  } else if (pausedMs !== completedPausedMs) {
    throw new Error('timing pausedMs does not equal completed interruption duration');
  }
  return freeze({ originAtMs, lastAtMs, active, activePlayMs, pausedMs,
    interruptions: freeze(interruptions), openInterruption }) as P108HumanLabTimingState;
}

export function createP108HumanLabTiming(value: unknown): P108HumanLabTimingState {
  const creation = exact(value, ['nowMs', 'active'], 'human-lab timing creation');
  const nowMs = milliseconds(creation.nowMs, 'timing creation nowMs');
  return normalizeP108HumanLabTimingState({ originAtMs: nowMs, lastAtMs: nowMs,
    active: boolean(creation.active, 'timing creation active'), activePlayMs: 0, pausedMs: 0,
    interruptions: [], openInterruption: null });
}

function eventTime(value: unknown, state: P108HumanLabTimingState): number {
  const nowMs = milliseconds(value, 'timing event nowMs');
  if (nowMs < state.lastAtMs) throw new Error('timing event nowMs cannot move backward');
  return nowMs;
}

function accrueActive(state: P108HumanLabTimingState, nowMs: number): number {
  return state.active
    ? checkedAdd(state.activePlayMs, nowMs - state.lastAtMs, 'timing activePlayMs')
    : state.activePlayMs;
}

/** Pure transition function; all elapsed time comes from the event's injected nowMs. */
export function reduceP108HumanLabTiming(
  stateValue: unknown,
  eventValue: unknown,
): P108HumanLabTimingState {
  const state = normalizeP108HumanLabTimingState(stateValue);
  const typeDescriptor = eventValue !== null && typeof eventValue === 'object' && !Array.isArray(eventValue)
    ? Object.getOwnPropertyDescriptor(eventValue, 'type') : undefined;
  if (typeDescriptor === undefined || !typeDescriptor.enumerable || !('value' in typeDescriptor)) {
    throw new Error('timing event.type must be an enumerable data property');
  }
  if (typeDescriptor.value === 'set-active') {
    const event = exact(eventValue, ['type', 'nowMs', 'active'], 'set-active event');
    const nowMs = eventTime(event.nowMs, state);
    if (state.openInterruption !== null) throw new Error('activity cannot change during an open interruption');
    return normalizeP108HumanLabTimingState({ ...state, lastAtMs: nowMs,
      active: boolean(event.active, 'set-active event.active'), activePlayMs: accrueActive(state, nowMs) });
  }
  if (typeDescriptor.value === 'pause') {
    const event = exact(eventValue, ['type', 'nowMs', 'kind', 'phase', 'surface'], 'pause event');
    const nowMs = eventTime(event.nowMs, state);
    const eventKind = kind(event.kind, 'pause event.kind');
    const phase = boundedLabel(event.phase, 'pause event.phase');
    const surface = boundedLabel(event.surface, 'pause event.surface');
    if (state.openInterruption !== null) {
      return normalizeP108HumanLabTimingState({ ...state, lastAtMs: nowMs, active: false,
        pausedMs: checkedAdd(state.openInterruption.pausedBeforeMs,
          nowMs - state.openInterruption.startedAtMs, 'timing pausedMs') });
    }
    if (state.interruptions.length >= P108_HUMAN_LAB_MAX_INTERRUPTION_COUNT) {
      throw new Error('timing interruption count exceeds its cap');
    }
    return normalizeP108HumanLabTimingState({ ...state, lastAtMs: nowMs, active: false,
      activePlayMs: accrueActive(state, nowMs), openInterruption: {
        sequence: state.interruptions.length + 1, kind: eventKind, phase, surface,
        startedAtMs: nowMs, pausedBeforeMs: state.pausedMs,
      } });
  }
  if (typeDescriptor.value === 'resume') {
    const event = exact(eventValue, ['type', 'nowMs', 'active'], 'resume event');
    const nowMs = eventTime(event.nowMs, state);
    if (state.openInterruption === null) throw new Error('resume requires an open interruption');
    const open = state.openInterruption;
    const durationMs = nowMs - open.startedAtMs;
    return normalizeP108HumanLabTimingState({ ...state, lastAtMs: nowMs,
      active: boolean(event.active, 'resume event.active'),
      pausedMs: checkedAdd(open.pausedBeforeMs, durationMs, 'timing pausedMs'),
      interruptions: [...state.interruptions, { sequence: open.sequence, kind: open.kind,
        phase: open.phase, surface: open.surface, startedAtMs: open.startedAtMs, durationMs }],
      openInterruption: null });
  }
  throw new Error('timing event type is unsupported');
}

/** Final snapshot. An open interruption is rejected rather than represented as completed. */
export function snapshotP108HumanLabTiming(stateValue: unknown, nowValue: unknown): P108HumanLabTimingSnapshot {
  const state = normalizeP108HumanLabTimingState(stateValue);
  const atMs = eventTime(nowValue, state);
  if (state.openInterruption !== null) throw new Error('timing snapshot requires all interruptions to be resumed');
  return normalizeP108HumanLabTimingSnapshot({ elapsedMs: atMs - state.originAtMs,
    activePlayMs: accrueActive(state, atMs), pausedMs: state.pausedMs,
    interruptions: state.interruptions.map((entry) => ({ ...entry,
      startedAtMs: entry.startedAtMs - state.originAtMs })) });
}

/** Strict clone/freeze boundary for the relative timing data stored in an artifact. */
export function normalizeP108HumanLabTimingSnapshot(value: unknown): P108HumanLabTimingSnapshot {
  const snapshot = exact(value, ['elapsedMs', 'activePlayMs', 'pausedMs', 'interruptions'],
    'human-lab timing snapshot');
  const elapsedMs = milliseconds(snapshot.elapsedMs, 'timing snapshot.elapsedMs');
  const activePlayMs = milliseconds(snapshot.activePlayMs, 'timing snapshot.activePlayMs');
  const pausedMs = milliseconds(snapshot.pausedMs, 'timing snapshot.pausedMs');
  const rawInterruptions = exactArray(snapshot.interruptions,
    P108_HUMAN_LAB_MAX_INTERRUPTION_COUNT, 'timing snapshot.interruptions');
  let previousEndMs = 0;
  let interruptionTotalMs = 0;
  const interruptions = rawInterruptions.map((entry, index) => {
    const normalized = normalizeCompleted(entry, index + 1, 0, elapsedMs, previousEndMs);
    previousEndMs = normalized.startedAtMs + normalized.durationMs;
    interruptionTotalMs = checkedAdd(interruptionTotalMs, normalized.durationMs,
      'timing snapshot.pausedMs');
    return normalized;
  });
  if (pausedMs !== interruptionTotalMs || activePlayMs + pausedMs > elapsedMs) {
    throw new Error('timing snapshot totals do not reconcile with elapsed time');
  }
  return freeze({ elapsedMs, activePlayMs, pausedMs,
    interruptions: freeze(interruptions) }) as P108HumanLabTimingSnapshot;
}

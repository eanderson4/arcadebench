import { describe, expect, it } from 'vitest';
import {
  createP108HumanLabTiming,
  normalizeP108HumanLabTimingState,
  reduceP108HumanLabTiming,
  snapshotP108HumanLabTiming,
} from '../src/experiments/human-lab-timing';

describe('P1-10 human-lab timing core', () => {
  it('accounts only active play and completed pauses across inactive transitions', () => {
    let state = createP108HumanLabTiming({ nowMs: 100, active: false });
    state = reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: 110, active: true });
    state = reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: 160, active: false });
    state = reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 180, kind: 'blur', phase: 'round1', surface: 'playing',
    });
    state = reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 200, kind: 'hidden', phase: 'ignored', surface: 'ignored',
    });
    expect(state.openInterruption).toMatchObject({
      sequence: 1, kind: 'blur', phase: 'round1', surface: 'playing', startedAtMs: 180,
    });
    expect(state.pausedMs).toBe(20);
    state = reduceP108HumanLabTiming(state, { type: 'resume', nowMs: 230, active: true });
    state = reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: 250, active: false });
    const snapshot = snapshotP108HumanLabTiming(state, 300);
    expect(snapshot).toEqual({ elapsedMs: 200, activePlayMs: 70, pausedMs: 50,
      interruptions: [{ sequence: 1, kind: 'blur', phase: 'round1', surface: 'playing',
        startedAtMs: 80, durationMs: 50 }] });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.interruptions)).toBe(true);
    expect(Object.isFrozen(snapshot.interruptions[0])).toBe(true);
  });

  it('does not count inactive or paused gaps as catch-up play and resumes into the requested mode', () => {
    let state = createP108HumanLabTiming({ nowMs: 0, active: true });
    state = reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 10, kind: 'clock-backlog', phase: 'round2', surface: 'playing',
    });
    state = reduceP108HumanLabTiming(state, { type: 'resume', nowMs: 1_010, active: false });
    state = reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: 2_010, active: true });
    expect(snapshotP108HumanLabTiming(state, 2_020)).toMatchObject({
      activePlayMs: 20, pausedMs: 1_000,
    });
  });

  it('records an assigned-width mismatch distinctly from an unsupported width', () => {
    const state = createP108HumanLabTiming({ nowMs: 0, active: false });
    const paused = reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 4, kind: 'width-stratum-mismatch',
      phase: 'practice', surface: 'stage-card',
    });
    const resumed = reduceP108HumanLabTiming(paused, {
      type: 'resume', nowMs: 10, active: false,
    });
    expect(snapshotP108HumanLabTiming(resumed, 10).interruptions).toEqual([{
      sequence: 1, kind: 'width-stratum-mismatch', phase: 'practice',
      surface: 'stage-card', startedAtMs: 4, durationMs: 6,
    }]);
  });

  it('rejects an open snapshot, resume without pause, and activity changes while paused', () => {
    const state = createP108HumanLabTiming({ nowMs: 5, active: false });
    expect(() => reduceP108HumanLabTiming(state, { type: 'resume', nowMs: 5, active: true }))
      .toThrow(/requires an open/u);
    const paused = reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 6, kind: 'test-request', phase: 'comparison', surface: 'comparison',
    });
    expect(() => snapshotP108HumanLabTiming(paused, 7)).toThrow(/all interruptions/u);
    expect(() => reduceP108HumanLabTiming(paused, { type: 'set-active', nowMs: 7, active: true }))
      .toThrow(/during an open/u);
  });

  it('strictly rejects malformed, extra, accessor, nonfinite, and backward input', () => {
    expect(() => createP108HumanLabTiming({ nowMs: Number.NaN, active: true })).toThrow(/finite/u);
    expect(() => createP108HumanLabTiming({ nowMs: 0, active: true, extra: true })).toThrow(/unsupported/u);
    const state = createP108HumanLabTiming({ nowMs: 10, active: true });
    expect(() => reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: 9, active: false }))
      .toThrow(/backward/u);
    expect(() => reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: Infinity, active: false }))
      .toThrow(/finite/u);
    expect(() => reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 10, kind: 'resize', phase: 'round1', surface: 'playing',
    })).toThrow(/kind/u);
    expect(() => reduceP108HumanLabTiming(state, {
      type: 'pause', nowMs: 10, kind: 'blur', phase: 'x'.repeat(65), surface: 'playing',
    })).toThrow(/64/u);
    let calls = 0;
    const accessor = Object.defineProperty({ nowMs: 11, active: false }, 'type', {
      enumerable: true, get: () => { calls++; return 'set-active'; },
    });
    expect(() => reduceP108HumanLabTiming(state, accessor)).toThrow(/data property/u);
    expect(calls).toBe(0);
    expect(() => normalizeP108HumanLabTimingState({ ...state, extra: true })).toThrow(/unsupported/u);
    const arrayWithExtra = [...state.interruptions] as unknown[] & { extra?: boolean };
    arrayWithExtra.extra = true;
    expect(() => normalizeP108HumanLabTimingState({ ...state, interruptions: arrayWithExtra }))
      .toThrow(/exact array/u);
  });

  it('overflow-checks accumulation', () => {
    const state = normalizeP108HumanLabTimingState({
      ...createP108HumanLabTiming({ nowMs: 0, active: true }),
      lastAtMs: 1,
      activePlayMs: Number.MAX_SAFE_INTEGER,
    });
    expect(() => reduceP108HumanLabTiming(state, { type: 'set-active', nowMs: 2, active: false }))
      .toThrow(/safe millisecond range/u);
  });

  it('clones inputs, freezes every output, and produces deterministic JSON', () => {
    const original = {
      ...createP108HumanLabTiming({ nowMs: 0.5, active: true }),
      interruptions: [] as Array<Record<string, unknown>>,
    };
    const normalized = normalizeP108HumanLabTimingState(original);
    original.interruptions.push({ changed: true });
    expect(normalized.interruptions).toEqual([]);
    expect(Object.isFrozen(normalized)).toBe(true);
    const event = { type: 'pause', nowMs: 2.5, kind: 'hidden', phase: ' round1 ', surface: ' playing ' };
    const first = reduceP108HumanLabTiming(normalized, event);
    expect(event).toEqual({ type: 'pause', nowMs: 2.5, kind: 'hidden',
      phase: ' round1 ', surface: ' playing ' });
    const second = reduceP108HumanLabTiming(normalizeP108HumanLabTimingState(normalized), event);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.openInterruption).toMatchObject({ phase: 'round1', surface: 'playing' });
    expect(Object.isFrozen(first.openInterruption)).toBe(true);
  });
});

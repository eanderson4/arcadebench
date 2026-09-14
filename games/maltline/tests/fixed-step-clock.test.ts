import { describe, expect, it } from 'vitest';
import {
  FixedStepClock,
  MALTLINE_VIEWER_MAXIMUM_CATCH_UP_TICKS,
} from '../src/viewer/fixed-step-clock';

const TICKS_PER_SECOND = 60;
const MAXIMUM_CATCH_UP_TICKS = MALTLINE_VIEWER_MAXIMUM_CATCH_UP_TICKS;

interface ScheduleResult {
  ticks: number;
  droppedMs: number;
}

function runSchedule(timestamps: readonly number[]): ScheduleResult {
  const clock = new FixedStepClock(TICKS_PER_SECOND, MAXIMUM_CATCH_UP_TICKS);
  let ticks = 0;
  let droppedMs = 0;
  for (const timestamp of timestamps) {
    const frame = clock.advance(timestamp);
    ticks += frame.ticks;
    droppedMs += frame.droppedMs;
  }
  return { ticks, droppedMs };
}

function refreshSchedule(refreshRate: number, seconds: number): number[] {
  const frameCount = refreshRate * seconds;
  return Array.from({ length: frameCount + 1 }, (_, frame) =>
    frame * 1000 / refreshRate);
}

function jitterSchedule(durationMs: number): number[] {
  const deltas = [7, 19, 11, 23, 5, 17, 13, 29, 9, 21];
  const timestamps = [0];
  let elapsed = 0;
  let index = 0;
  while (elapsed < durationMs) {
    elapsed = Math.min(durationMs, elapsed + deltas[index % deltas.length]!);
    timestamps.push(elapsed);
    index++;
  }
  return timestamps;
}

describe('FixedStepClock', () => {
  for (const refreshRate of [30, 60, 90, 120, 144]) {
    it(`produces exactly 600 ticks over 10 seconds at ${refreshRate} Hz`, () => {
      expect(runSchedule(refreshSchedule(refreshRate, 10))).toEqual({
        ticks: 600,
        droppedMs: 0,
      });
    });
  }

  it('retains fractional time across an uninterrupted jittered schedule', () => {
    expect(runSchedule(jitterSchedule(10_000))).toEqual({
      ticks: 600,
      droppedMs: 0,
    });
  });

  it('bounds a hitch to the catch-up budget and reports discarded time', () => {
    const clock = new FixedStepClock(TICKS_PER_SECOND, MAXIMUM_CATCH_UP_TICKS);
    expect(clock.advance(0)).toEqual({ ticks: 0, elapsedMs: 0, droppedMs: 0 });

    const hitch = clock.advance(1000);
    expect(hitch.ticks).toBe(MAXIMUM_CATCH_UP_TICKS);
    expect(hitch.elapsedMs).toBe(1000);
    expect(hitch.droppedMs).toBeCloseTo(700, 8);

    // The discarded hitch does not leak into later frames as hidden backlog.
    expect(clock.advance(1000 + 1000 / TICKS_PER_SECOND)).toMatchObject({
      ticks: 1,
      droppedMs: 0,
    });
  });

  it.each([50, 100, 150, 250])('retains an ordinary %d ms scheduling hiccup', (hiccupMs) => {
    const clock = new FixedStepClock(TICKS_PER_SECOND, MAXIMUM_CATCH_UP_TICKS);
    clock.advance(0);
    // A nearly complete pending tick is the worst ordinary accumulator state.
    clock.advance(1000 / TICKS_PER_SECOND - 0.001);

    const advance = clock.advance(1000 / TICKS_PER_SECOND - 0.001 + hiccupMs);
    expect(advance.elapsedMs).toBeCloseTo(hiccupMs, 8);
    expect(advance.droppedMs).toBe(0);
    expect(advance.ticks).toBe(Math.floor((hiccupMs + 1000 / TICKS_PER_SECOND - 0.001)
      / (1000 / TICKS_PER_SECOND)));
  });

  it('drops only the portion beyond the 300 ms live-viewer backlog', () => {
    const clock = new FixedStepClock(TICKS_PER_SECOND, MAXIMUM_CATCH_UP_TICKS);
    clock.advance(0);
    expect(clock.advance(300)).toEqual({ ticks: 18, elapsedMs: 300, droppedMs: 0 });
    expect(clock.advance(650)).toEqual({ ticks: 18, elapsedMs: 350, droppedMs: 50 });
  });

  it('reset discards a pre-pause fraction and anchors on the next sample', () => {
    const clock = new FixedStepClock(TICKS_PER_SECOND, MAXIMUM_CATCH_UP_TICKS);
    clock.advance(0);
    expect(clock.advance(10).ticks).toBe(0);

    clock.reset();
    expect(clock.advance(10_000)).toEqual({ ticks: 0, elapsedMs: 0, droppedMs: 0 });
    expect(clock.advance(10_000 + 1000 / TICKS_PER_SECOND).ticks).toBe(1);
  });

  it('resets accumulated time when the tick rate changes', () => {
    const clock = new FixedStepClock(TICKS_PER_SECOND, MAXIMUM_CATCH_UP_TICKS);
    clock.advance(0);
    clock.advance(10);
    clock.setTicksPerSecond(30);

    expect(clock.advance(100)).toEqual({ ticks: 0, elapsedMs: 0, droppedMs: 0 });
    expect(clock.advance(100 + 1000 / 30).ticks).toBe(1);
  });
});

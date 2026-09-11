import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import type { GameEvent, MaltlineState, TickResult } from '../src/core/types';
import { IDLE_INPUT } from '../src/core/types';
import {
  advanceP108HumanLabObservation,
  P108_HUMAN_LAB_ZERO_OBSERVATION,
} from '../src/experiments/human-lab-observation';

function stateAfter(
  before: MaltlineState,
  player: Partial<MaltlineState['player']> = {},
): MaltlineState {
  return {
    ...structuredClone(before),
    tick: before.tick + 1,
    player: { ...before.player, ...player },
  };
}

function result(
  before: MaltlineState,
  player: Partial<MaltlineState['player']> = {},
  events: GameEvent[] = [],
): TickResult {
  return { state: stateAfter(before, player), events };
}

function event(tick: number, value: Record<string, unknown>): GameEvent {
  return { tick, ...value } as GameEvent;
}

function mutableZero(): {
  lossReasons: { walkout: number; shake_smashed: number; jar_smashed: number };
  interactionCounts: {
    executedStationMoves: number;
    executedLaneMoves: number;
    blendStarts: number;
    blendCancels: number;
    shakeLaunches: number;
    jarCatches: number;
  };
} {
  return structuredClone(P108_HUMAN_LAB_ZERO_OBSERVATION);
}

describe('P1-10 human-lab observation fold', () => {
  it('exposes a deeply immutable zero accumulator', () => {
    expect(P108_HUMAN_LAB_ZERO_OBSERVATION).toEqual({
      lossReasons: { walkout: 0, shake_smashed: 0, jar_smashed: 0 },
      interactionCounts: {
        executedStationMoves: 0,
        executedLaneMoves: 0,
        blendStarts: 0,
        blendCancels: 0,
        shakeLaunches: 0,
        jarCatches: 0,
      },
    });
    expect(Object.isFrozen(P108_HUMAN_LAB_ZERO_OBSERVATION)).toBe(true);
    expect(Object.isFrozen(P108_HUMAN_LAB_ZERO_OBSERVATION.lossReasons)).toBe(true);
    expect(Object.isFrozen(P108_HUMAN_LAB_ZERO_OBSERVATION.interactionCounts)).toBe(true);
  });

  it('counts reachable engine movement, blend start, and blend cancellation', () => {
    const engine = new MaltlineEngine({
      ...MALTLINE_CAMPAIGN[2]!,
      stationRepeatTicks: 1,
      laneRepeatTicks: 1,
    });
    let observation = P108_HUMAN_LAB_ZERO_OBSERVATION;

    let before = engine.snapshot();
    engine.setInput({ ...IDLE_INPUT, stationDir: 1, laneDir: 1 });
    let step = engine.step();
    observation = advanceP108HumanLabObservation(observation, before, step);
    expect(observation.interactionCounts).toMatchObject({
      executedStationMoves: 1,
      executedLaneMoves: 1,
    });

    before = step.state;
    engine.setInput({ ...IDLE_INPUT, blend: true });
    step = engine.step();
    observation = advanceP108HumanLabObservation(observation, before, step);
    expect(observation.interactionCounts.blendStarts).toBe(1);

    before = step.state;
    engine.setInput(IDLE_INPUT);
    step = engine.step();
    observation = advanceP108HumanLabObservation(observation, before, step);
    expect(observation.interactionCounts.blendCancels).toBe(1);
    expect(engine.snapshot().player.blending).toBeNull();
  });

  it('classifies event counts and does not call blend completion a cancellation', () => {
    const before = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!).snapshot();
    before.player.blending = 'vanilla';
    const tick = before.tick + 1;
    const events: GameEvent[] = [
      event(tick, { type: 'blend_completed', flavor: 'vanilla' }),
      event(tick, { type: 'shake_launched', lane: 0, flavor: 'vanilla' }),
      event(tick, { type: 'shake_launched', lane: 0, flavor: 'vanilla' }),
      event(tick, { type: 'jar_caught', customerId: 1, lane: 0, points: 25 }),
      event(tick, { type: 'life_lost', reason: 'walkout', lives: 2 }),
      event(tick, { type: 'life_lost', reason: 'shake_smashed', lives: 1 }),
      event(tick, { type: 'life_lost', reason: 'jar_smashed', lives: 0 }),
    ];
    const observation = advanceP108HumanLabObservation(
      P108_HUMAN_LAB_ZERO_OBSERVATION,
      before,
      result(before, { blending: null, holding: 'vanilla' }, events),
    );
    expect(observation).toEqual({
      lossReasons: { walkout: 1, shake_smashed: 1, jar_smashed: 1 },
      interactionCounts: {
        executedStationMoves: 0,
        executedLaneMoves: 0,
        blendStarts: 0,
        blendCancels: 0,
        shakeLaunches: 2,
        jarCatches: 1,
      },
    });
  });

  it('counts each observable transition once and accumulates without mutating sources', () => {
    const before = new MaltlineEngine(MALTLINE_CAMPAIGN[2]!).snapshot();
    const accumulator = mutableZero();
    accumulator.lossReasons.walkout = 2;
    accumulator.interactionCounts.jarCatches = 3;
    const accumulatorBytes = JSON.stringify(accumulator);
    const nextResult = result(before, {
      station: before.player.station + 1,
      lane: before.player.lane + 1,
      blending: 'chocolate',
    }, [event(before.tick + 1, { type: 'jar_caught', customerId: 2, lane: 1, points: 25 })]);
    const resultBytes = JSON.stringify(nextResult);

    const observation = advanceP108HumanLabObservation(accumulator, before, nextResult);
    expect(observation).toMatchObject({
      lossReasons: { walkout: 2 },
      interactionCounts: {
        executedStationMoves: 1,
        executedLaneMoves: 1,
        blendStarts: 1,
        jarCatches: 4,
      },
    });
    expect(JSON.stringify(accumulator)).toBe(accumulatorBytes);
    expect(JSON.stringify(nextResult)).toBe(resultBytes);
    expect(observation).not.toBe(accumulator);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.lossReasons)).toBe(true);
    expect(Object.isFrozen(observation.interactionCounts)).toBe(true);
  });

  it('rejects malformed, extra, accessor, and unsafe accumulator fields without invoking getters', () => {
    expect(() => advanceP108HumanLabObservation({}, new MaltlineEngine(MALTLINE_CAMPAIGN[0]!).snapshot(),
      result(new MaltlineEngine(MALTLINE_CAMPAIGN[0]!).snapshot()))).toThrow(/missing or unsupported/u);

    const before = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!).snapshot();
    const validResult = result(before);
    expect(() => advanceP108HumanLabObservation({ ...mutableZero(), extra: true }, before, validResult))
      .toThrow(/unsupported/u);
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '1', Number.MAX_SAFE_INTEGER + 1]) {
      const accumulator = mutableZero() as unknown as {
        lossReasons: { walkout: unknown };
      };
      accumulator.lossReasons.walkout = invalid;
      expect(() => advanceP108HumanLabObservation(accumulator, before, validResult))
        .toThrow(/nonnegative safe integer/u);
    }

    let getterCalls = 0;
    const accessor = Object.defineProperty(mutableZero(), 'lossReasons', {
      enumerable: true,
      get: () => {
        getterCalls++;
        return P108_HUMAN_LAB_ZERO_OBSERVATION.lossReasons;
      },
    });
    expect(() => advanceP108HumanLabObservation(accessor, before, validResult)).toThrow(/data property/u);
    expect(getterCalls).toBe(0);
  });

  it('rejects count overflow and invalid one-step transitions', () => {
    const before = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!).snapshot();
    const overflow = mutableZero();
    overflow.interactionCounts.shakeLaunches = Number.MAX_SAFE_INTEGER;
    expect(() => advanceP108HumanLabObservation(overflow, before, result(before, {}, [
      event(before.tick + 1, { type: 'shake_launched', lane: 0, flavor: 'vanilla' }),
    ]))).toThrow(/overflowed/u);

    const stale = result(before);
    stale.state.tick = before.tick;
    expect(() => advanceP108HumanLabObservation(mutableZero(), before, stale)).toThrow(/one advancing/u);
    const skipped = result(before);
    skipped.state.tick = before.tick + 2;
    expect(() => advanceP108HumanLabObservation(mutableZero(), before, skipped)).toThrow(/one advancing/u);
    const changedScenario = result(before);
    changedScenario.state.scenarioId = 'another-stage';
    expect(() => advanceP108HumanLabObservation(mutableZero(), before, changedScenario))
      .toThrow(/scenarioId/u);
    const wrongEventTick = result(before, {}, [
      event(before.tick + 2, { type: 'life_lost', reason: 'walkout', lives: 2 }),
    ]);
    expect(() => advanceP108HumanLabObservation(mutableZero(), before, wrongEventTick))
      .toThrow(/event tick/u);
  });
});

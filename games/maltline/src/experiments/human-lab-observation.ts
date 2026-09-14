import type { GameEvent, MaltlineState, TickResult } from '../core/types';

export interface P108HumanLabLossReasons {
  readonly walkout: number;
  readonly shake_smashed: number;
  readonly jar_smashed: number;
}

export interface P108HumanLabInteractionCounts {
  readonly executedStationMoves: number;
  readonly executedLaneMoves: number;
  readonly blendStarts: number;
  readonly blendCancels: number;
  readonly shakeLaunches: number;
  readonly jarCatches: number;
}

export interface P108HumanLabObservation {
  readonly lossReasons: P108HumanLabLossReasons;
  readonly interactionCounts: P108HumanLabInteractionCounts;
}

export const P108_HUMAN_LAB_ZERO_OBSERVATION: P108HumanLabObservation = Object.freeze({
  lossReasons: Object.freeze({
    walkout: 0,
    shake_smashed: 0,
    jar_smashed: 0,
  }),
  interactionCounts: Object.freeze({
    executedStationMoves: 0,
    executedLaneMoves: 0,
    blendStarts: 0,
    blendCancels: 0,
    shakeLaunches: 0,
    jarCatches: 0,
  }),
});

const LOSS_REASON_KEYS = ['walkout', 'shake_smashed', 'jar_smashed'] as const;
const INTERACTION_KEYS = [
  'executedStationMoves',
  'executedLaneMoves',
  'blendStarts',
  'blendCancels',
  'shakeLaunches',
  'jarCatches',
] as const;

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
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

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function addCount(value: number, increment: number, label: string): number {
  const result = value + increment;
  if (!Number.isSafeInteger(result)) throw new Error(`${label} overflowed the safe-integer range`);
  return result;
}

function normalizeObservation(value: unknown): P108HumanLabObservation {
  const observation = exactObject(value, ['lossReasons', 'interactionCounts'], 'human-lab observation');
  const losses = exactObject(observation.lossReasons, LOSS_REASON_KEYS, 'human-lab lossReasons');
  const interactions = exactObject(
    observation.interactionCounts,
    INTERACTION_KEYS,
    'human-lab interactionCounts',
  );
  return Object.freeze({
    lossReasons: Object.freeze({
      walkout: count(losses.walkout, 'human-lab lossReasons.walkout'),
      shake_smashed: count(losses.shake_smashed, 'human-lab lossReasons.shake_smashed'),
      jar_smashed: count(losses.jar_smashed, 'human-lab lossReasons.jar_smashed'),
    }),
    interactionCounts: Object.freeze({
      executedStationMoves: count(
        interactions.executedStationMoves,
        'human-lab interactionCounts.executedStationMoves',
      ),
      executedLaneMoves: count(
        interactions.executedLaneMoves,
        'human-lab interactionCounts.executedLaneMoves',
      ),
      blendStarts: count(interactions.blendStarts, 'human-lab interactionCounts.blendStarts'),
      blendCancels: count(interactions.blendCancels, 'human-lab interactionCounts.blendCancels'),
      shakeLaunches: count(interactions.shakeLaunches, 'human-lab interactionCounts.shakeLaunches'),
      jarCatches: count(interactions.jarCatches, 'human-lab interactionCounts.jarCatches'),
    }),
  });
}

function eventCounts(events: readonly GameEvent[], tick: number): {
  losses: Record<(typeof LOSS_REASON_KEYS)[number], number>;
  shakeLaunches: number;
  jarCatches: number;
  blendCompleted: boolean;
} {
  const losses = { walkout: 0, shake_smashed: 0, jar_smashed: 0 };
  let shakeLaunches = 0;
  let jarCatches = 0;
  let blendCompleted = false;
  for (const event of events) {
    if (event.tick !== tick) throw new Error('human-lab observation event tick does not match result state');
    if (event.type === 'life_lost') {
      if (event.reason !== 'walkout' && event.reason !== 'shake_smashed'
        && event.reason !== 'jar_smashed') {
        throw new Error('human-lab observation contains an unsupported life-loss reason');
      }
      losses[event.reason]++;
    } else if (event.type === 'shake_launched') {
      shakeLaunches++;
    } else if (event.type === 'jar_caught') {
      jarCatches++;
    } else if (event.type === 'blend_completed') {
      blendCompleted = true;
    }
  }
  return { losses, shakeLaunches, jarCatches, blendCompleted };
}

/**
 * Fold one real engine step into bounded lab diagnostics. The accumulator is
 * treated as untrusted input, defensively cloned, and never mutated.
 */
export function advanceP108HumanLabObservation(
  accumulatorValue: unknown,
  before: Readonly<MaltlineState>,
  result: Readonly<TickResult>,
): P108HumanLabObservation {
  const accumulator = normalizeObservation(accumulatorValue);
  if (!Number.isSafeInteger(before.tick) || before.tick < 0
    || !Number.isSafeInteger(result.state.tick)
    || result.state.tick !== before.tick + 1) {
    throw new Error('human-lab observation requires exactly one advancing engine tick');
  }
  if (result.state.scenarioId !== before.scenarioId) {
    throw new Error('human-lab observation scenarioId changed within one engine step');
  }
  if (!Array.isArray(result.events)) throw new Error('human-lab observation events must be an array');

  const events = eventCounts(result.events, result.state.tick);
  const stationMoved = result.state.player.station !== before.player.station ? 1 : 0;
  const laneMoved = result.state.player.lane !== before.player.lane ? 1 : 0;
  const blendStarted = before.player.blending === null && result.state.player.blending !== null ? 1 : 0;
  const blendCancelled = before.player.blending !== null
    && result.state.player.blending === null
    && !events.blendCompleted ? 1 : 0;

  return Object.freeze({
    lossReasons: Object.freeze({
      walkout: addCount(accumulator.lossReasons.walkout, events.losses.walkout, 'walkout losses'),
      shake_smashed: addCount(
        accumulator.lossReasons.shake_smashed,
        events.losses.shake_smashed,
        'shake-smashed losses',
      ),
      jar_smashed: addCount(
        accumulator.lossReasons.jar_smashed,
        events.losses.jar_smashed,
        'jar-smashed losses',
      ),
    }),
    interactionCounts: Object.freeze({
      executedStationMoves: addCount(
        accumulator.interactionCounts.executedStationMoves,
        stationMoved,
        'executed station moves',
      ),
      executedLaneMoves: addCount(
        accumulator.interactionCounts.executedLaneMoves,
        laneMoved,
        'executed lane moves',
      ),
      blendStarts: addCount(
        accumulator.interactionCounts.blendStarts,
        blendStarted,
        'blend starts',
      ),
      blendCancels: addCount(
        accumulator.interactionCounts.blendCancels,
        blendCancelled,
        'blend cancels',
      ),
      shakeLaunches: addCount(
        accumulator.interactionCounts.shakeLaunches,
        events.shakeLaunches,
        'shake launches',
      ),
      jarCatches: addCount(
        accumulator.interactionCounts.jarCatches,
        events.jarCatches,
        'jar catches',
      ),
    }),
  });
}

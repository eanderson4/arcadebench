import type { GameEvent } from '../core/types';

type EventOf<Type extends GameEvent['type']> = Extract<GameEvent, { type: Type }>;

type OrderedFact<Type extends GameEvent['type']> = Readonly<
  EventOf<Type> & { ordinal: number }
>;

export type MaltlineEventPresentationFact = {
  readonly [Type in GameEvent['type']]: OrderedFact<Type>;
}[GameEvent['type']];

type FactOf<Type extends GameEvent['type']> = Extract<
  MaltlineEventPresentationFact,
  { type: Type }
>;

type FactBuilderTable = {
  readonly [Type in GameEvent['type']]: (event: EventOf<Type>, ordinal: number) => FactOf<Type>;
};

/**
 * The exhaustive event-to-fact boundary. Explicit field copies keep viewer
 * presentation coupled to the authoritative event union without retaining a
 * mutable engine event or accidentally admitting later incidental fields.
 */
const FACT_BUILDERS = {
  customer_spawned: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    customerId: event.customerId,
    lane: event.lane,
    flavor: event.flavor,
  }),
  shake_launched: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    lane: event.lane,
    flavor: event.flavor,
  }),
  served: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    customerId: event.customerId,
    lane: event.lane,
    flavor: event.flavor,
    exitAfterDrink: event.exitAfterDrink,
    firstFulfillment: event.firstFulfillment,
    points: event.points,
  }),
  customer_exited: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    customerId: event.customerId,
  }),
  jar_returned: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    customerId: event.customerId,
    lane: event.lane,
  }),
  jar_caught: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    customerId: event.customerId,
    lane: event.lane,
    points: event.points,
  }),
  shake_smashed: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    lane: event.lane,
    flavor: event.flavor,
  }),
  jar_smashed: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    lane: event.lane,
  }),
  walkout: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    customerId: event.customerId,
    lane: event.lane,
  }),
  life_lost: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    reason: event.reason,
    lives: event.lives,
  }),
  blend_completed: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    flavor: event.flavor,
  }),
  stage_cleared: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
    bonus: event.bonus,
  }),
  game_lost: (event, ordinal) => Object.freeze({
    ordinal,
    tick: event.tick,
    type: event.type,
  }),
} satisfies FactBuilderTable;

export const MALTLINE_LIVE_EVENT_PRIORITY = Object.freeze([
  'game_lost',
  'life_lost',
  'stage_cleared',
  'served',
  'jar_caught',
  'blend_completed',
] as const);

export const MALTLINE_REPLAY_RECENT_EVENT_PRIORITY = Object.freeze([
  'life_lost',
  'stage_cleared',
  'reverse-most-recent-non-spawn',
] as const);

export const MALTLINE_REPLAY_ANNOUNCEMENT_PRIORITY = Object.freeze([
  'game_lost',
  'stage_cleared',
  'life_lost',
] as const);

export type MaltlineLiveSelectedFact = FactOf<
  typeof MALTLINE_LIVE_EVENT_PRIORITY[number]
>;
export type MaltlineReplayRecentFact = Exclude<
  MaltlineEventPresentationFact,
  FactOf<'customer_spawned'>
>;
export type MaltlineReplayAnnouncementFact = FactOf<
  typeof MALTLINE_REPLAY_ANNOUNCEMENT_PRIORITY[number]
>;

export interface MaltlineLiveEventSelection {
  readonly event: MaltlineLiveSelectedFact;
  /** Supplies the authoritative cause when game_lost wins the live priority. */
  readonly relatedLifeLoss: FactOf<'life_lost'> | null;
}

export interface MaltlineTerminalLossFacts {
  readonly gameLost: FactOf<'game_lost'>;
  /** Null is an explicit malformed/legacy fallback; copy must not cite a nonfatal loss. */
  readonly lifeLoss: FactOf<'life_lost'> | null;
}

export interface MaltlineEventPresentationBatch {
  readonly tick: number | null;
  readonly facts: readonly MaltlineEventPresentationFact[];
  readonly terminalLoss: MaltlineTerminalLossFacts | null;
  readonly lastLifeLoss: FactOf<'life_lost'> | null;
  readonly stageClear: FactOf<'stage_cleared'> | null;
  readonly firstServe: FactOf<'served'> | null;
  readonly firstCatch: FactOf<'jar_caught'> | null;
  readonly firstReady: FactOf<'blend_completed'> | null;
  readonly lastNonSpawn: MaltlineReplayRecentFact | null;
  readonly live: MaltlineLiveEventSelection | null;
  readonly replayRecent: MaltlineReplayRecentFact | null;
  readonly replayAnnouncement: MaltlineReplayAnnouncementFact | null;
}

const EMPTY_FACTS: readonly MaltlineEventPresentationFact[] = Object.freeze([]);

function eventFact(event: GameEvent, ordinal: number): MaltlineEventPresentationFact {
  // The table is exhaustive by event discriminator; this cast only reconnects
  // the correlated union key and argument that indexed access cannot retain.
  const builder = FACT_BUILDERS[event.type] as (
    value: GameEvent,
    position: number,
  ) => MaltlineEventPresentationFact;
  return builder(event, ordinal);
}

function firstOfType<Type extends GameEvent['type']>(
  facts: readonly MaltlineEventPresentationFact[],
  type: Type,
): FactOf<Type> | null {
  return (facts.find((fact): fact is FactOf<Type> => fact.type === type) ?? null);
}

function lastOfType<Type extends GameEvent['type']>(
  facts: readonly MaltlineEventPresentationFact[],
  type: Type,
): FactOf<Type> | null {
  for (let index = facts.length - 1; index >= 0; index--) {
    const fact = facts[index]!;
    if (fact.type === type) return fact as FactOf<Type>;
  }
  return null;
}

function selectLive(
  facts: Pick<MaltlineEventPresentationBatch,
    'terminalLoss' | 'lastLifeLoss' | 'stageClear' | 'firstServe' | 'firstCatch' | 'firstReady'>,
): MaltlineLiveEventSelection | null {
  const event = facts.terminalLoss?.gameLost
    ?? facts.lastLifeLoss
    ?? facts.stageClear
    ?? facts.firstServe
    ?? facts.firstCatch
    ?? facts.firstReady;
  return event === undefined || event === null
    ? null
    : Object.freeze({
        event,
        relatedLifeLoss: event.type === 'game_lost' ? facts.terminalLoss?.lifeLoss ?? null : null,
      });
}

function selectReplayRecent(
  facts: Pick<MaltlineEventPresentationBatch, 'lastLifeLoss' | 'stageClear' | 'lastNonSpawn'>,
): MaltlineReplayRecentFact | null {
  return facts.lastLifeLoss ?? facts.stageClear ?? facts.lastNonSpawn;
}

function selectReplayAnnouncement(
  facts: Pick<MaltlineEventPresentationBatch, 'terminalLoss' | 'stageClear' | 'lastLifeLoss'>,
): MaltlineReplayAnnouncementFact | null {
  return facts.terminalLoss?.gameLost ?? facts.stageClear ?? facts.lastLifeLoss;
}

/**
 * Derives immutable presentation facts and each context's named selection.
 * Engine batches are one tick; rejecting mixed ticks avoids inventing a false
 * shared timestamp or silently reordering events from different steps.
 */
export function deriveMaltlineEventPresentation(
  events: readonly GameEvent[],
): MaltlineEventPresentationBatch {
  if (events.length === 0) {
    return Object.freeze({
      tick: null,
      facts: EMPTY_FACTS,
      terminalLoss: null,
      lastLifeLoss: null,
      stageClear: null,
      firstServe: null,
      firstCatch: null,
      firstReady: null,
      lastNonSpawn: null,
      live: null,
      replayRecent: null,
      replayAnnouncement: null,
    });
  }
  const tick = events[0]!.tick;
  if (events.some((event) => event.tick !== tick)) {
    throw new Error('Maltline presentation event batches must contain exactly one tick');
  }
  const facts = Object.freeze(events.map(eventFact));
  const gameLost = firstOfType(facts, 'game_lost');
  const terminalLifeLoss = [...facts].reverse().find(
    (fact): fact is FactOf<'life_lost'> => fact.type === 'life_lost' && fact.lives === 0,
  ) ?? null;
  const terminalLoss = gameLost === null
    ? null
    : Object.freeze({ gameLost, lifeLoss: terminalLifeLoss });
  const lastLifeLoss = lastOfType(facts, 'life_lost');
  const stageClear = firstOfType(facts, 'stage_cleared');
  const firstServe = firstOfType(facts, 'served');
  const firstCatch = firstOfType(facts, 'jar_caught');
  const firstReady = firstOfType(facts, 'blend_completed');
  let lastNonSpawn: MaltlineReplayRecentFact | null = null;
  for (let index = facts.length - 1; index >= 0; index--) {
    const fact = facts[index]!;
    if (fact.type !== 'customer_spawned') {
      lastNonSpawn = fact;
      break;
    }
  }
  const selections = {
    terminalLoss,
    lastLifeLoss,
    stageClear,
    firstServe,
    firstCatch,
    firstReady,
    lastNonSpawn,
  };
  return Object.freeze({
    tick,
    facts,
    ...selections,
    live: selectLive(selections),
    replayRecent: selectReplayRecent(selections),
    replayAnnouncement: selectReplayAnnouncement(selections),
  });
}

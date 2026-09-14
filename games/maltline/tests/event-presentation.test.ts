import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/core/types';
import {
  deriveMaltlineEventPresentation,
  MALTLINE_LIVE_EVENT_PRIORITY,
  MALTLINE_REPLAY_ANNOUNCEMENT_PRIORITY,
  MALTLINE_REPLAY_RECENT_EVENT_PRIORITY,
} from '../src/viewer/event-presentation';

type EventByType = {
  readonly [Type in GameEvent['type']]: Extract<GameEvent, { type: Type }>;
};

const EVENTS = {
  customer_spawned: { tick: 40, type: 'customer_spawned', customerId: 101, lane: 2, flavor: 'strawberry' },
  shake_launched: { tick: 40, type: 'shake_launched', lane: 1, flavor: 'chocolate' },
  served: {
    tick: 40,
    type: 'served',
    customerId: 102,
    lane: 3,
    flavor: 'vanilla',
    exitAfterDrink: false,
    firstFulfillment: false,
    points: 0,
  },
  customer_exited: { tick: 40, type: 'customer_exited', customerId: 103 },
  jar_returned: { tick: 40, type: 'jar_returned', customerId: 104, lane: 2 },
  jar_caught: { tick: 40, type: 'jar_caught', customerId: 105, lane: 1, points: 0 },
  shake_smashed: { tick: 40, type: 'shake_smashed', lane: 3, flavor: 'strawberry' },
  jar_smashed: { tick: 40, type: 'jar_smashed', lane: 2 },
  walkout: { tick: 40, type: 'walkout', customerId: 106, lane: 1 },
  life_lost: { tick: 40, type: 'life_lost', reason: 'jar_smashed', lives: 0 },
  blend_completed: { tick: 40, type: 'blend_completed', flavor: 'chocolate' },
  stage_cleared: { tick: 40, type: 'stage_cleared', bonus: 875 },
  game_lost: { tick: 40, type: 'game_lost' },
} satisfies EventByType;

const EVENT_ORDER = Object.keys(EVENTS) as Array<keyof EventByType>;

function fact<Type extends keyof EventByType>(type: Type, ordinal = EVENT_ORDER.indexOf(type)) {
  return { ordinal, ...EVENTS[type] };
}

describe('Maltline shared event presentation facts', () => {
  it('copies every authoritative field for all 13 event variants exhaustively', () => {
    const source = Object.values(EVENTS);
    const presentation = deriveMaltlineEventPresentation(source);

    expect(presentation.tick).toBe(40);
    expect(presentation.facts).toEqual(source.map((event, ordinal) => ({ ordinal, ...event })));
    expect(presentation.facts.map(({ type }) => type)).toEqual(Object.keys(EVENTS));
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.facts)).toBe(true);
    for (const fact of presentation.facts) expect(Object.isFrozen(fact), fact.type).toBe(true);
  });

  it('publishes the context-specific selection policies without merging them', () => {
    expect(MALTLINE_LIVE_EVENT_PRIORITY).toEqual([
      'game_lost', 'life_lost', 'stage_cleared', 'served', 'jar_caught', 'blend_completed',
    ]);
    expect(MALTLINE_REPLAY_RECENT_EVENT_PRIORITY).toEqual([
      'life_lost', 'stage_cleared', 'reverse-most-recent-non-spawn',
    ]);
    expect(MALTLINE_REPLAY_ANNOUNCEMENT_PRIORITY).toEqual([
      'game_lost', 'stage_cleared', 'life_lost',
    ]);
    expect(Object.isFrozen(MALTLINE_LIVE_EVENT_PRIORITY)).toBe(true);
    expect(Object.isFrozen(MALTLINE_REPLAY_RECENT_EVENT_PRIORITY)).toBe(true);
    expect(Object.isFrozen(MALTLINE_REPLAY_ANNOUNCEMENT_PRIORITY)).toBe(true);
  });

  it('preserves fatal-batch live cause while retaining distinct replay priorities', () => {
    const presentation = deriveMaltlineEventPresentation([
      EVENTS.jar_smashed,
      EVENTS.life_lost,
      EVENTS.game_lost,
    ]);

    expect(presentation.live).toEqual({
      event: fact('game_lost', 2),
      relatedLifeLoss: fact('life_lost', 1),
    });
    expect(presentation.replayRecent).toEqual(fact('life_lost', 1));
    expect(presentation.replayAnnouncement).toEqual(fact('game_lost', 2));
    expect(Object.isFrozen(presentation.live)).toBe(true);
  });

  it('uses the final same-tick loss and the zero-life cause in mixed fatal batches', () => {
    const firstLoss: GameEvent = { tick: 70, type: 'life_lost', reason: 'shake_smashed', lives: 1 };
    const fatalLoss: GameEvent = { tick: 70, type: 'life_lost', reason: 'jar_smashed', lives: 0 };
    const presentation = deriveMaltlineEventPresentation([
      { tick: 70, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      firstLoss,
      { tick: 70, type: 'jar_smashed', lane: 1 },
      fatalLoss,
      { tick: 70, type: 'game_lost' },
    ]);

    expect(presentation.facts.map(({ type }) => type)).toEqual([
      'shake_smashed', 'life_lost', 'jar_smashed', 'life_lost', 'game_lost',
    ]);
    expect(presentation.lastLifeLoss).toEqual({ ordinal: 3, ...fatalLoss });
    expect(presentation.terminalLoss).toEqual({
      gameLost: { ordinal: 4, tick: 70, type: 'game_lost' },
      lifeLoss: { ordinal: 3, ...fatalLoss },
    });
    expect(presentation.live?.event.type).toBe('game_lost');
    expect(presentation.live?.relatedLifeLoss).toEqual({ ordinal: 3, ...fatalLoss });
    expect(presentation.replayRecent).toEqual({ ordinal: 3, ...fatalLoss });
    expect(presentation.replayAnnouncement?.type).toBe('game_lost');

    const missingFatalCause = deriveMaltlineEventPresentation([
      firstLoss,
      { tick: 70, type: 'game_lost' },
    ]);
    expect(missingFatalCause.terminalLoss?.lifeLoss).toBeNull();
    expect(missingFatalCause.live?.relatedLifeLoss).toBeNull();
  });

  it('retains duplicate same-type events in engine order', () => {
    const presentation = deriveMaltlineEventPresentation([
      { tick: 80, type: 'jar_smashed', lane: 0 },
      { tick: 80, type: 'jar_smashed', lane: 2 },
      { tick: 80, type: 'life_lost', reason: 'jar_smashed', lives: 2 },
      { tick: 80, type: 'life_lost', reason: 'jar_smashed', lives: 1 },
    ]);
    expect(presentation.facts).toHaveLength(4);
    expect(presentation.facts.map(({ ordinal }) => ordinal)).toEqual([0, 1, 2, 3]);
    expect(presentation.lastLifeLoss).toMatchObject({ ordinal: 3, lives: 1 });
    expect(presentation.live?.event).toBe(presentation.lastLifeLoss);
    expect(presentation.replayRecent).toBe(presentation.lastLifeLoss);
    expect(presentation.replayAnnouncement).toBe(presentation.lastLifeLoss);
  });

  it('keeps life, clear, and action ordering exact in a simultaneous batch', () => {
    const walkoutLoss = { tick: 40, type: 'life_lost', reason: 'walkout', lives: 1 } as const;
    const lifeAndClear = deriveMaltlineEventPresentation([
      EVENTS.served,
      EVENTS.stage_cleared,
      walkoutLoss,
    ]);
    expect(lifeAndClear.live?.event).toEqual({ ordinal: 2, ...walkoutLoss });
    expect(lifeAndClear.replayRecent).toEqual({ ordinal: 2, ...walkoutLoss });
    expect(lifeAndClear.replayAnnouncement).toEqual(fact('stage_cleared', 1));

    const clearAndActions = deriveMaltlineEventPresentation([
      EVENTS.blend_completed,
      EVENTS.jar_caught,
      EVENTS.served,
      EVENTS.stage_cleared,
    ]);
    expect(clearAndActions.live?.event).toEqual(fact('stage_cleared', 3));
    expect(clearAndActions.replayRecent).toEqual(fact('stage_cleared', 3));
    expect(clearAndActions.replayAnnouncement).toEqual(fact('stage_cleared', 3));
  });

  it('uses first matching live events and reverse-most-recent replay fallback', () => {
    const firstServed = { ...EVENTS.served, customerId: 201 };
    const secondServed = { ...EVENTS.served, customerId: 202 };
    const presentation = deriveMaltlineEventPresentation([
      EVENTS.customer_spawned,
      firstServed,
      EVENTS.jar_returned,
      secondServed,
    ]);
    expect(presentation.live?.event).toEqual({ ordinal: 1, ...firstServed });
    expect(presentation.replayRecent).toEqual({ ordinal: 3, ...secondServed });
    expect(presentation.replayAnnouncement).toBeNull();

    const spawnOnly = deriveMaltlineEventPresentation([EVENTS.customer_spawned]);
    expect(spawnOnly.live).toBeNull();
    expect(spawnOnly.replayRecent).toBeNull();
    expect(spawnOnly.replayAnnouncement).toBeNull();
  });

  it('retains zero-point and fulfillment facts and isolates them from source mutation', () => {
    const event = {
      ...EVENTS.served,
      incidental: 'must not cross the presentation boundary',
    } as Extract<GameEvent, { type: 'served' }> & { incidental: string };
    const presentation = deriveMaltlineEventPresentation([event]);
    const fact = presentation.facts[0]!;

    expect(fact).toEqual({ ordinal: 0, ...EVENTS.served });
    expect('incidental' in fact).toBe(false);
    event.points = 999;
    event.firstFulfillment = true;
    expect(fact).toEqual({ ordinal: 0, ...EVENTS.served });
    expect(presentation.live?.event).toBe(fact);
    expect(presentation.replayRecent).toBe(fact);
  });

  it('defines empty batches and rejects mixed-tick batches without mutation', () => {
    const empty = deriveMaltlineEventPresentation([]);
    expect(empty).toEqual({
      tick: null,
      facts: [],
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
    expect(Object.isFrozen(empty.facts)).toBe(true);

    const events: GameEvent[] = [
      EVENTS.shake_launched,
      { ...EVENTS.jar_caught, tick: 41 },
    ];
    const before = structuredClone(events);
    expect(() => deriveMaltlineEventPresentation(events)).toThrow(/exactly one tick/u);
    expect(events).toEqual(before);
  });
});

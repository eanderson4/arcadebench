import { describe, expect, it, vi } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { FIXED_SCALE, MaltlineEngine } from '../src/core/engine';
import type { CustomerState, GameEvent, MaltlineState } from '../src/core/types';
import { MaltlineRendererEffects } from '../src/viewer/renderer-effects';
import { deriveMaltlineRendererLayout } from '../src/viewer/renderer-layout';

const scenario = MALTLINE_CAMPAIGN[0]!;
const layout = deriveMaltlineRendererLayout(scenario);

function stateWithCustomer(): MaltlineState {
  const state = new MaltlineEngine(scenario).snapshot();
  const customer: CustomerState = {
    id: 17,
    lane: 1,
    x: 12_000,
    flavor: 'strawberry',
    phase: 'marching',
    timer: 0,
    fulfilled: false,
    requeues: 0,
    catchBonusEligible: false,
    exitAfterDrink: false,
  };
  return {
    ...state,
    player: { ...state.player, lane: 1 },
    customers: [customer],
  };
}

describe('MaltlineRendererEffects', () => {
  it('preserves event-order RNG consumption and the resulting records', () => {
    let calls = 0;
    const random = vi.fn(() => ++calls / 1_000);
    const effects = new MaltlineRendererEffects(random, false);
    const state = stateWithCustomer();
    const events: GameEvent[] = [
      { tick: 1, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      { tick: 1, type: 'life_lost', reason: 'shake_smashed', lives: 3 },
      { tick: 1, type: 'jar_smashed', lane: 1 },
      { tick: 1, type: 'life_lost', reason: 'jar_smashed', lives: 2 },
      { tick: 1, type: 'walkout', customerId: 8, lane: 0 },
      { tick: 1, type: 'life_lost', reason: 'walkout', lives: 1 },
      { tick: 1, type: 'jar_caught', customerId: 9, lane: 1, points: 25 },
      {
        tick: 1,
        type: 'served',
        customerId: 17,
        lane: 1,
        flavor: 'strawberry',
        exitAfterDrink: true,
        firstFulfillment: true,
        points: 100,
      },
    ];

    effects.pushEvents(events, state, layout);

    // 22 shake particles + phase, 12 jar particles + phase, 10 walkout
    // particles + phase, 6 catch particles, and 7 serve particles.
    expect(random).toHaveBeenCalledTimes(231);
    expect(effects.particles).toHaveLength(57);
    expect(effects.popups.map((popup) => popup.text)).toEqual(['+25', '+100']);
    expect(effects.flashes).toEqual([expect.objectContaining({ lane: 0, age: 0, ttl: 480 })]);
    expect(effects.failureCallouts.map((callout) => callout.lane)).toEqual([0, 1, 0]);

    const first = effects.particles[0]!;
    const firstAngle = 0.001 * 0.6;
    const firstSpeed = 50 + 0.002 * 110;
    expect(first.ttl).toBe(420 + 0.003 * 260);
    expect(first.size).toBe(1.6 + 0.004 * 2.6);

    // The final shake trigger is the walkout phase at call 179. Later catch
    // and serve bursts consume entropy without changing that phase.
    effects.advance(100);
    const agedFirst = effects.particles[0]!;
    expect(agedFirst.x).toBeCloseTo(layout.project(scenario.laneLength * FIXED_SCALE, layout.vesselY(0)).x + Math.cos(firstAngle) * firstSpeed * 0.1, 12);
    expect(agedFirst.y).toBeCloseTo(
      layout.vesselY(0) - 12 * layout.project(0, layout.vesselY(0)).scale + (Math.sin(firstAngle) * firstSpeed - 30) * 0.1 + 1.5,
      12,
    );
    const translation = effects.shakeTranslation();
    const agedShake = 8 * Math.pow(0.03, 0.1);
    expect(translation?.x).toBeCloseTo(
      Math.sin(6.5 + 0.179 * Math.PI * 2) * agedShake * 0.5,
      12,
    );
    expect(translation?.y).toBeCloseTo(
      Math.cos(6.5 * 1.37 + 0.179 * Math.PI * 2) * agedShake * 0.5,
      12,
    );
  });

  it('pairs failure callouts with the immediately preceding failed lane and then falls back', () => {
    const effects = new MaltlineRendererEffects(() => 0.5, true);
    const state = stateWithCustomer();

    effects.pushEvents([
      { tick: 1, type: 'shake_smashed', lane: 0, flavor: 'chocolate' },
      { tick: 1, type: 'life_lost', reason: 'shake_smashed', lives: 3 },
      { tick: 1, type: 'jar_smashed', lane: 0 },
      { tick: 1, type: 'jar_caught', customerId: 4, lane: 1, points: 0 },
      { tick: 1, type: 'life_lost', reason: 'jar_smashed', lives: 2 },
      { tick: 1, type: 'life_lost', reason: 'walkout', lives: 1 },
    ], state, layout);

    expect(effects.failureCallouts.map(({ lane, text }) => ({ lane, text }))).toEqual([
      { lane: 0, text: 'LIFE LOST · SHAKE MISSED' },
      { lane: 0, text: 'LIFE LOST · RETURN JAR MISSED' },
      { lane: 1, text: 'LIFE LOST · CUSTOMER REACHED COUNTER' },
    ]);
    expect(effects.popups[0]?.text).toBe('RETURN CAUGHT · 0 PTS');
  });

  it('keeps exact expiry boundaries and suppresses motion entropy in reduced motion', () => {
    const random = vi.fn(() => 0.25);
    const effects = new MaltlineRendererEffects(random, true);
    const state = stateWithCustomer();
    effects.pushEvents([
      { tick: 1, type: 'walkout', customerId: 4, lane: 0 },
      { tick: 1, type: 'life_lost', reason: 'walkout', lives: 3 },
      { tick: 1, type: 'jar_caught', customerId: 4, lane: 0, points: 0 },
    ], state, layout);

    expect(random).not.toHaveBeenCalled();
    expect(effects.particles).toHaveLength(0);
    expect(effects.shakeTranslation()).toBeNull();
    expect(effects.flashes).toHaveLength(1);
    expect(effects.popups).toHaveLength(1);
    expect(effects.failureCallouts).toHaveLength(1);

    const popupY = effects.popups[0]!.y;
    effects.advance(479);
    expect(effects.flashes).toHaveLength(1);
    expect(effects.popups[0]?.y).toBe(popupY);
    effects.advance(1);
    expect(effects.flashes).toHaveLength(0);
    effects.advance(420);
    expect(effects.popups).toHaveLength(0);
    expect(effects.failureCallouts).toHaveLength(1);
    effects.advance(500);
    expect(effects.failureCallouts).toHaveLength(0);
  });

  it('advances from origins independent of frame partition and resets every record', () => {
    const state = stateWithCustomer();
    const create = (): MaltlineRendererEffects => {
      const effects = new MaltlineRendererEffects(() => 0.3, false);
      effects.pushEvents([
        { tick: 1, type: 'jar_caught', customerId: 4, lane: 1, points: 25 },
        { tick: 1, type: 'walkout', customerId: 4, lane: 1 },
        { tick: 1, type: 'life_lost', reason: 'walkout', lives: 3 },
      ], state, layout);
      return effects;
    };
    const single = create();
    const partitioned = create();

    single.advance(125);
    partitioned.advance(40);
    partitioned.advance(85);

    expect(partitioned.particles).toEqual(single.particles);
    expect(partitioned.popups).toEqual(single.popups);
    expect(partitioned.flashes).toEqual(single.flashes);
    expect(partitioned.failureCallouts).toEqual(single.failureCallouts);
    expect(partitioned.shakeTranslation()).toEqual(single.shakeTranslation());

    single.reset();
    expect(single.particles).toEqual([]);
    expect(single.popups).toEqual([]);
    expect(single.flashes).toEqual([]);
    expect(single.failureCallouts).toEqual([]);
    expect(single.shakeTranslation()).toBeNull();
  });

  it('clears motion-only effects and freezes retained feedback without resetting its age', () => {
    const random = vi.fn(() => 0.25);
    const effects = new MaltlineRendererEffects(random, false);
    const state = stateWithCustomer();
    effects.pushEvents([
      { tick: 1, type: 'walkout', customerId: 4, lane: 0 },
      { tick: 1, type: 'life_lost', reason: 'walkout', lives: 3 },
      { tick: 1, type: 'jar_caught', customerId: 4, lane: 0, points: 25 },
    ], state, layout);
    effects.advance(100);
    const popupY = effects.popups[0]!.y;
    const entropyCalls = random.mock.calls.length;

    expect(effects.setReducedMotion(false)).toBe(false);
    expect(effects.setReducedMotion(true)).toBe(true);
    expect(effects.particles).toEqual([]);
    expect(effects.shakeTranslation()).toBeNull();
    expect(effects.flashes[0]?.age).toBe(100);
    expect(effects.popups[0]).toMatchObject({ age: 100, y: popupY });
    expect(effects.failureCallouts[0]?.age).toBe(100);
    expect(random).toHaveBeenCalledTimes(entropyCalls);

    effects.advance(100);
    expect(effects.popups[0]).toMatchObject({ age: 200, y: popupY });
    expect(effects.flashes[0]?.age).toBe(200);
    expect(effects.failureCallouts[0]?.age).toBe(200);

    expect(effects.setReducedMotion(true)).toBe(false);
    expect(effects.setReducedMotion(false)).toBe(true);
    expect(effects.particles).toEqual([]);
    expect(effects.shakeTranslation()).toBeNull();
    effects.advance(100);
    expect(effects.popups[0]?.age).toBe(300);
    expect(effects.popups[0]?.y).toBeCloseTo(popupY - 3.4, 12);
    expect(random).toHaveBeenCalledTimes(entropyCalls);
  });

  it('expires retained feedback while reduced and never resurrects discarded motion', () => {
    const effects = new MaltlineRendererEffects(() => 0.4, false);
    const state = stateWithCustomer();
    effects.pushEvents([
      { tick: 1, type: 'walkout', customerId: 4, lane: 0 },
      { tick: 1, type: 'life_lost', reason: 'walkout', lives: 3 },
      { tick: 1, type: 'jar_caught', customerId: 4, lane: 0, points: 25 },
    ], state, layout);

    effects.setReducedMotion(true);
    effects.advance(1_400);
    expect(effects.particles).toEqual([]);
    expect(effects.popups).toEqual([]);
    expect(effects.flashes).toEqual([]);
    expect(effects.failureCallouts).toEqual([]);

    effects.setReducedMotion(false);
    expect(effects.particles).toEqual([]);
    expect(effects.shakeTranslation()).toBeNull();
  });
});

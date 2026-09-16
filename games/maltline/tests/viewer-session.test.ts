import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import type { GameEvent, MaltlineState } from '../src/core/types';
import {
  eventAnnouncement,
  MaltlineEventAnnouncer,
  semanticPlayStatus,
} from '../src/viewer/semantic-status';
import {
  isRepeatedPresentationAction,
  MaltlineRunEligibility,
} from '../src/viewer/viewer-session';

describe('viewer presentation keys', () => {
  it('suppresses repeats for one-shot flow and restart actions only', () => {
    for (const code of ['Enter', 'Space', 'KeyR']) {
      expect(isRepeatedPresentationAction(code, true), code).toBe(true);
      expect(isRepeatedPresentationAction(code, false), code).toBe(false);
    }

    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyF']) {
      expect(isRepeatedPresentationAction(code, true), code).toBe(false);
    }
  });
});

describe('viewer run eligibility', () => {
  it('makes dropped browser time explicit without changing engine state', () => {
    const eligibility = new MaltlineRunEligibility();
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const engine = new MaltlineEngine(scenario);
    const before = engine.snapshot();

    eligibility.interrupt('clock_backlog_dropped', 900);

    expect(eligibility.snapshot()).toEqual({
      rankEligible: false,
      interruptionReason: 'clock_backlog_dropped',
      droppedMs: 900,
    });
    expect(engine.snapshot()).toEqual(before);
  });

  it('accumulates dropped time, preserves the first interruption, and resets per run', () => {
    const eligibility = new MaltlineRunEligibility();
    eligibility.interrupt('clock_backlog_dropped', 400);
    eligibility.interrupt('document_hidden');
    eligibility.interrupt('clock_backlog_dropped', 250);
    eligibility.interrupt('unsupported_width');
    expect(eligibility.snapshot()).toEqual({
      rankEligible: false,
      interruptionReason: 'clock_backlog_dropped',
      droppedMs: 650,
    });

    eligibility.reset();
    expect(eligibility.snapshot()).toEqual({
      rankEligible: true,
      interruptionReason: null,
      droppedMs: 0,
    });
  });

  it('rejects invalid dropped-time observations', () => {
    const eligibility = new MaltlineRunEligibility();
    expect(() => eligibility.interrupt('clock_backlog_dropped', -1)).toThrow(/nonnegative/);
    expect(() => eligibility.interrupt('clock_backlog_dropped', Number.NaN)).toThrow(/finite/);
  });
});

describe('semantic play status and live events', () => {
  it('describes action, lane, orders, lives, and jar economy without canvas pixels', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      score: 425,
      streak: 11,
      lives: 1,
      resolved: 3,
      jarsAvailable: 0,
      washing: [20, 40],
      player: { ...baseline.player, lane: 1 },
    };

    const text = semanticPlayStatus(scenario, state, { stageIndex: 0, stageCount: 8 });
    expect(text).toContain('Stage 1 of 8, First Pour.');
    expect(text).toContain('Score 425. CHAIN 11. 1 life. 5 orders left.');
    expect(text).toContain('Window 2 of 2. No clean jars. Run along a lane to intercept a returning jar.');
    expect(text).toContain('0 clean jars; 2 washing.');
    expect(text).not.toMatch(/STREAK|×/u);
  });

  it('quantizes blend progress and describes ready state', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const blending = {
      ...baseline,
      player: {
        ...baseline.player,
        blending: 'vanilla' as const,
        blendProgress: Math.floor(scenario.blendTicks / 2),
      },
    };
    expect(semanticPlayStatus(scenario, blending, { stageIndex: 0, stageCount: 8 }))
      .toContain('Blending Vanilla, 50 percent.');

    const ready = {
      ...blending,
      player: { ...blending.player, blending: null, holding: 'vanilla' as const },
    };
    expect(semanticPlayStatus(scenario, ready, { stageIndex: 0, stageCount: 8 }))
      .toContain('Vanilla shake ready. Release button 1 (Space) to toss. Press button 2 (Enter) to replace it and switch flavor.');
  });

  it('keeps the numeric life count equivalent for zero through four', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    for (const lives of [0, 1, 2, 4]) {
      const text = semanticPlayStatus(scenario, { ...baseline, lives }, {
        stageIndex: 0,
        stageCount: 8,
      });
      expect(text).toContain(`${lives} ${lives === 1 ? 'life' : 'lives'}.`);
    }
  });

  it('prioritizes one useful live message and deduplicates a replayed batch', () => {
    const events: GameEvent[] = [
      { tick: 40, type: 'walkout', customerId: 2, lane: 1 },
      { tick: 40, type: 'life_lost', reason: 'walkout', lives: 2 },
    ];
    expect(eventAnnouncement(events)).toEqual({
      id: '40:life-lost:walkout:2',
      text: 'Life lost: customer reached the counter. 2 lives remaining.',
    });

    let text = '';
    let writes = 0;
    const target = {
      ownerDocument: { createTextNode: (value: string) => value },
      replaceChildren: (...values: string[]) => {
        text = values.join('');
        writes++;
      },
    } as unknown as HTMLElement;
    const announcer = new MaltlineEventAnnouncer(target);
    expect(announcer.push(events)).toBe(true);
    expect(announcer.push(events)).toBe(false);
    expect(text).toBe('Life lost: customer reached the counter. 2 lives remaining.');
    expect(writes).toBe(1);
  });

  it('keeps zero-point repeat service and catches honest in live copy', () => {
    const firstFulfillment = eventAnnouncement([{
      tick: 59,
      type: 'served',
      customerId: 3,
      lane: 0,
      flavor: 'vanilla',
      exitAfterDrink: true,
      firstFulfillment: true,
      points: 137,
    }])?.text;
    expect(firstFulfillment).toBe('Order served. 137 points.');
    expect(firstFulfillment).not.toMatch(/CHAIN|STREAK|×/u);
    expect(eventAnnouncement([{
      tick: 60,
      type: 'served',
      customerId: 4,
      lane: 0,
      flavor: 'vanilla',
      exitAfterDrink: true,
      firstFulfillment: false,
      points: 0,
    }])?.text).toBe('Order served. Repeat rescue, no points.');
    expect(eventAnnouncement([{
      tick: 61,
      type: 'jar_caught',
      customerId: 4,
      lane: 0,
      points: 0,
    }])?.text).toBe('Return jar caught. No points.');
  });

  it('announces the terminal zero-life cause from a same-tick multi-loss batch', () => {
    const fatal: GameEvent[] = [
      { tick: 75, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      { tick: 75, type: 'life_lost', reason: 'shake_smashed', lives: 1 },
      { tick: 75, type: 'jar_smashed', lane: 1 },
      { tick: 75, type: 'life_lost', reason: 'jar_smashed', lives: 0 },
      { tick: 75, type: 'game_lost' },
    ];
    expect(eventAnnouncement(fatal)).toEqual({
      id: '75:game-lost',
      text: 'Game over. Life lost: return jar missed.',
    });

    expect(eventAnnouncement(fatal.slice(0, -1))).toEqual({
      id: '75:life-lost:jar_smashed:0',
      text: 'Life lost: return jar missed. 0 lives remaining.',
    });
    expect(eventAnnouncement([
      { tick: 76, type: 'life_lost', reason: 'walkout', lives: 1 },
      { tick: 76, type: 'game_lost' },
    ])).toEqual({
      id: '76:game-lost',
      text: 'Game over. Run ended.',
    });
  });
});

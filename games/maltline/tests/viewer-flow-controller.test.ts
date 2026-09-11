import { describe, expect, it } from 'vitest';
import type { LifeLossReason } from '../src/core/types';
import type { MaltlineFlowScreen } from '../src/viewer/gameplay-flow';
import {
  MaltlineViewerFlowController,
  type MaltlineViewerFlowEvent,
  type MaltlineViewerFlowScheduler,
  type MaltlineViewerFlowTransition,
} from '../src/viewer/viewer-flow-controller';

interface ScheduledTask {
  callback: () => void;
  delayMs: number;
  active: boolean;
}

class FakeScheduler implements MaltlineViewerFlowScheduler {
  readonly tasks = new Map<number, ScheduledTask>();
  readonly delays: number[] = [];
  readonly cancelled: number[] = [];
  failNext = false;
  fireSynchronously = false;
  fireDuringCancel = false;
  private nextHandle = 1;

  schedule(callback: () => void, delayMs: number): number {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('schedule failed');
    }
    const handle = this.nextHandle++;
    this.tasks.set(handle, { callback, delayMs, active: true });
    this.delays.push(delayMs);
    if (this.fireSynchronously) {
      this.tasks.get(handle)!.active = false;
      callback();
    }
    return handle;
  }

  cancel(handle: unknown): void {
    const numericHandle = handle as number;
    this.cancelled.push(numericHandle);
    const task = this.tasks.get(numericHandle);
    if (task === undefined) return;
    task.active = false;
    if (this.fireDuringCancel) task.callback();
  }

  activeHandles(): number[] {
    return [...this.tasks]
      .filter(([, task]) => task.active)
      .map(([handle]) => handle);
  }

  fire(handle: number): void {
    const task = this.tasks.get(handle);
    if (task === undefined) throw new Error(`unknown task ${handle}`);
    task.active = false;
    task.callback();
  }

  fireRetained(handle: number): void {
    const task = this.tasks.get(handle);
    if (task === undefined) throw new Error(`unknown task ${handle}`);
    task.callback();
  }
}

class UndefinedHandleScheduler implements MaltlineViewerFlowScheduler {
  callback: (() => void) | null = null;
  readonly cancellations: unknown[] = [];

  schedule(callback: () => void): undefined {
    this.callback = callback;
    return undefined;
  }

  cancel(handle: unknown): void {
    this.cancellations.push(handle);
  }

  fireRetained(): void {
    if (this.callback === null) throw new Error('no retained callback');
    this.callback();
  }
}

interface Fixture {
  controller: MaltlineViewerFlowController;
  scheduler: FakeScheduler;
  transitions: MaltlineViewerFlowTransition[];
  setPlayable(value: boolean): void;
}

function fixture(options: {
  stageCount?: number;
  onTransition?: (
    transition: MaltlineViewerFlowTransition,
    controller: MaltlineViewerFlowController,
  ) => void;
} = {}): Fixture {
  const scheduler = new FakeScheduler();
  const transitions: MaltlineViewerFlowTransition[] = [];
  let playable = true;
  let controller!: MaltlineViewerFlowController;
  controller = new MaltlineViewerFlowController({
    stageCount: options.stageCount ?? 8,
    countdownStepMs: 650,
    countdownServeMs: 350,
    scheduler,
    isPlayable: () => playable,
    onTransition: (next) => {
      transitions.push(next);
      options.onTransition?.(next, controller);
    },
  });
  return {
    controller,
    scheduler,
    transitions,
    setPlayable(value) {
      playable = value;
    },
  };
}

function startStageCard(target: Fixture): void {
  target.controller.dispatch({ type: 'restart' });
}

function enterPlaying(target: Fixture): void {
  startStageCard(target);
  target.controller.dispatch({ type: 'advance' });
  target.controller.dispatch({ type: 'advance' });
  expect(target.controller.snapshot().screen).toBe('playing');
}

function finishCurrentStage(target: Fixture): void {
  const current = target.controller.snapshot();
  target.controller.dispatch({
    type: 'stage-cleared',
    attempt: current.attempt,
    stageIndex: current.stageIndex,
    bonus: 1_000,
  });
}

function buildScreen(screen: MaltlineFlowScreen): Fixture {
  const target = fixture();
  if (screen === 'title') return target;
  if (screen === 'instructions') {
    target.controller.dispatch({ type: 'advance' });
    return target;
  }
  if (screen === 'stage-card') {
    startStageCard(target);
    return target;
  }
  enterPlaying(target);
  if (screen === 'playing') return target;
  if (screen === 'interrupted') {
    target.controller.dispatch({ type: 'interrupt', reason: 'window_blur' });
    return target;
  }
  if (screen === 'cleared') {
    finishCurrentStage(target);
    return target;
  }
  if (screen === 'gameover') {
    const current = target.controller.snapshot();
    target.controller.dispatch({
      type: 'game-lost',
      attempt: current.attempt,
      stageIndex: current.stageIndex,
      fatalReason: 'walkout',
    });
    return target;
  }
  if (screen === 'countdown') {
    target.controller.dispatch({ type: 'restart' });
    target.controller.dispatch({ type: 'advance' });
    return target;
  }

  for (let stage = 0; stage < 8; stage++) {
    if (stage > 0) {
      target.controller.dispatch({ type: 'advance' });
      target.controller.dispatch({ type: 'advance' });
      target.controller.dispatch({ type: 'advance' });
    }
    finishCurrentStage(target);
  }
  target.controller.dispatch({ type: 'advance' });
  expect(target.controller.snapshot().screen).toBe('victory');
  return target;
}

function currentTerminalEvent(
  target: Fixture,
  type: 'stage-cleared' | 'game-lost',
): MaltlineViewerFlowEvent {
  const state = target.controller.snapshot();
  return type === 'stage-cleared'
    ? { type, attempt: state.attempt, stageIndex: state.stageIndex, bonus: 1_000 }
    : { type, attempt: state.attempt, stageIndex: state.stageIndex, fatalReason: 'walkout' };
}

describe('MaltlineViewerFlowController', () => {
  it('advances the complete legal presentation path and all stage boundaries', () => {
    const target = fixture();
    expect(target.controller.snapshot()).toMatchObject({ screen: 'title', stageIndex: 0, stageCount: 8 });
    expect(target.controller.dispatch({ type: 'advance' }).current.screen).toBe('instructions');
    expect(target.controller.dispatch({ type: 'advance' }).current.screen).toBe('stage-card');

    for (let stage = 0; stage < 8; stage++) {
      target.controller.dispatch({ type: 'advance' });
      target.controller.dispatch({ type: 'advance' });
      expect(target.controller.snapshot()).toMatchObject({ screen: 'playing', stageIndex: stage });
      finishCurrentStage(target);
      expect(target.controller.snapshot()).toMatchObject({ screen: 'cleared', stageIndex: stage });
      const result = target.controller.dispatch({ type: 'advance' });
      expect(result.current.screen).toBe(stage === 7 ? 'victory' : 'stage-card');
      expect(result.current.stageIndex).toBe(stage === 7 ? 7 : stage + 1);
    }
  });

  it('schedules exactly 650/650/650/350 and validates each expected step', () => {
    const target = fixture();
    startStageCard(target);
    target.controller.dispatch({ type: 'advance' });
    expect(target.controller.snapshot().countdown?.step).toBe(3);

    for (const expected of [2, 1, 'SERVE', null] as const) {
      const [handle] = target.scheduler.activeHandles();
      expect(handle).toBeDefined();
      target.scheduler.fire(handle!);
      if (expected === null) expect(target.controller.snapshot().screen).toBe('playing');
      else expect(target.controller.snapshot().countdown?.step).toBe(expected);
    }
    expect(target.scheduler.delays).toEqual([650, 650, 650, 350]);
    expect(target.scheduler.activeHandles()).toEqual([]);
  });

  it('returns an automatic or manually skipped countdown to its card when play is unavailable', () => {
    for (const automatic of [false, true]) {
      const target = fixture();
      startStageCard(target);
      target.controller.dispatch({ type: 'advance' });
      target.setPlayable(false);
      if (automatic) {
        for (let step = 0; step < 4; step++) {
          target.scheduler.fire(target.scheduler.activeHandles()[0]!);
        }
      } else {
        target.controller.dispatch({ type: 'advance' });
      }
      expect(target.controller.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: 0 });
      expect(target.transitions.at(-1)?.effect).toEqual({
        type: 'show-stage-card', constructStage: false, schedulerFailed: false,
      });
    }
  });

  it('exhausts direct legal and illegal events for every screen', () => {
    const screens: MaltlineFlowScreen[] = [
      'title', 'instructions', 'stage-card', 'countdown', 'playing',
      'interrupted', 'cleared', 'gameover', 'victory',
    ];
    const expected: Record<'advance' | 'stage-cleared' | 'game-lost' | 'interrupt' | 'resume', MaltlineFlowScreen[]> = {
      advance: ['title', 'instructions', 'stage-card', 'countdown', 'cleared', 'gameover', 'victory'],
      'stage-cleared': ['playing'],
      'game-lost': ['playing'],
      interrupt: ['countdown', 'playing', 'interrupted'],
      resume: ['interrupted'],
    };

    for (const screen of screens) {
      for (const eventType of Object.keys(expected) as (keyof typeof expected)[]) {
        const target = buildScreen(screen);
        const before = target.controller.snapshot();
        const observed = target.transitions.length;
        const event: MaltlineViewerFlowEvent = eventType === 'stage-cleared' || eventType === 'game-lost'
          ? currentTerminalEvent(target, eventType)
          : eventType === 'interrupt'
            ? { type: 'interrupt', reason: 'window_blur' }
            : { type: eventType };
        const result = target.controller.dispatch(event);
        const accepted = expected[eventType].includes(screen);
        expect(result.accepted, `${screen}/${eventType}`).toBe(accepted);
        expect(target.transitions.length, `${screen}/${eventType}`).toBe(observed + (accepted ? 1 : 0));
        if (!accepted) {
          expect(result.current).toBe(before);
          expect(target.controller.snapshot()).toBe(before);
          expect(result.effect).toBeNull();
        }
      }
    }
  });

  it('restarts every screen with a fresh opaque attempt at Stage 1', () => {
    const screens: MaltlineFlowScreen[] = [
      'title', 'instructions', 'stage-card', 'countdown', 'playing',
      'interrupted', 'cleared', 'gameover', 'victory',
    ];
    for (const screen of screens) {
      const target = buildScreen(screen);
      const before = target.controller.snapshot();
      const result = target.controller.dispatch({ type: 'restart' });
      expect(result.accepted, screen).toBe(true);
      expect(result.current, screen).toMatchObject({ screen: 'stage-card', stageIndex: 0, countdown: null });
      expect(result.current.attempt, screen).not.toBe(before.attempt);
      expect(result.effect).toEqual({ type: 'start-fresh-run' });
    }
  });

  it('rejects stale, duplicate, wrong-stage, and malformed terminal events without effects', () => {
    const target = fixture();
    enterPlaying(target);
    const firstAttempt = target.controller.snapshot().attempt;
    target.controller.dispatch({ type: 'restart' });
    target.controller.dispatch({ type: 'advance' });
    target.controller.dispatch({ type: 'advance' });
    const before = target.controller.snapshot();
    const observed = target.transitions.length;
    const timersBefore = target.scheduler.activeHandles();

    const negativeBonus = target.controller.dispatch({
      type: 'stage-cleared', attempt: before.attempt, stageIndex: 0, bonus: -1,
    });
    expect(negativeBonus).toEqual({
      accepted: false,
      previous: before,
      current: before,
      effect: null,
    });
    expect(target.controller.snapshot()).toBe(before);
    expect(target.scheduler.activeHandles()).toEqual(timersBefore);
    expect(target.transitions).toHaveLength(observed);

    const invalidEvents: MaltlineViewerFlowEvent[] = [
      { type: 'stage-cleared', attempt: firstAttempt, stageIndex: 0, bonus: 1_000 },
      { type: 'stage-cleared', attempt: before.attempt, stageIndex: 1, bonus: 1_000 },
      { type: 'stage-cleared', attempt: before.attempt, stageIndex: 0, bonus: Number.NaN },
      { type: 'game-lost', attempt: firstAttempt, stageIndex: 0, fatalReason: 'walkout' },
      { type: 'game-lost', attempt: before.attempt, stageIndex: 8, fatalReason: 'walkout' },
      {
        type: 'game-lost', attempt: before.attempt, stageIndex: 0,
        fatalReason: 'not-a-reason' as LifeLossReason,
      },
    ];
    for (const event of invalidEvents) expect(target.controller.dispatch(event).accepted).toBe(false);
    expect(target.controller.snapshot()).toBe(before);
    expect(target.transitions).toHaveLength(observed);

    const accepted = target.controller.dispatch(currentTerminalEvent(target, 'stage-cleared'));
    expect(accepted.accepted).toBe(true);
    const terminal = target.controller.snapshot();
    expect(target.controller.dispatch(currentTerminalEvent(target, 'stage-cleared')).accepted).toBe(false);
    expect(target.controller.dispatch({
      type: 'game-lost', attempt: before.attempt, stageIndex: 0, fatalReason: 'walkout',
    }).accepted).toBe(false);
    expect(target.controller.snapshot()).toBe(terminal);
  });

  it('keeps retained canceled, out-of-order, and double-fired callbacks inert', () => {
    const target = fixture();
    startStageCard(target);
    target.controller.dispatch({ type: 'advance' });
    const first = target.scheduler.activeHandles()[0]!;
    target.scheduler.fire(first);
    const second = target.scheduler.activeHandles()[0]!;
    const atTwo = target.controller.snapshot();
    const observedAtTwo = target.transitions.length;
    target.scheduler.fireRetained(first);
    target.scheduler.fireRetained(first);
    expect(target.controller.snapshot()).toBe(atTwo);
    expect(target.transitions).toHaveLength(observedAtTwo);

    target.controller.dispatch({ type: 'restart' });
    target.controller.dispatch({ type: 'advance' });
    const newCountdown = target.controller.snapshot();
    const currentHandle = target.scheduler.activeHandles()[0]!;
    target.scheduler.fireRetained(second);
    target.scheduler.fireRetained(first);
    expect(target.controller.snapshot()).toBe(newCountdown);
    expect(target.scheduler.activeHandles()).toEqual([currentHandle]);
  });

  it('rejects a wrong countdown token, attempt, stage, or expected step before touching its handle', () => {
    const target = fixture();
    const foreign = fixture();
    startStageCard(target);
    target.controller.dispatch({ type: 'advance' });
    startStageCard(foreign);
    foreign.controller.dispatch({ type: 'advance' });
    const state = target.controller.snapshot();
    const foreignState = foreign.controller.snapshot();
    const handle = target.scheduler.activeHandles()[0]!;
    const observed = target.transitions.length;
    const base = {
      type: 'countdown-elapsed' as const,
      attempt: state.attempt,
      stageIndex: state.stageIndex,
      countdown: state.countdown!.identity,
      expectedStep: state.countdown!.step,
    };
    const staleEvents: MaltlineViewerFlowEvent[] = [
      { ...base, attempt: foreignState.attempt },
      { ...base, stageIndex: 1 },
      { ...base, countdown: foreignState.countdown!.identity },
      { ...base, expectedStep: 2 },
    ];
    for (const event of staleEvents) expect(target.controller.dispatch(event).accepted).toBe(false);
    expect(target.controller.snapshot()).toBe(state);
    expect(target.transitions).toHaveLength(observed);
    expect(target.scheduler.activeHandles()).toEqual([handle]);

    target.scheduler.fire(handle);
    expect(target.controller.snapshot().countdown?.step).toBe(2);
  });

  it('invalidates before cancellation even when cancel invokes the old callback', () => {
    const target = fixture();
    startStageCard(target);
    target.controller.dispatch({ type: 'advance' });
    const staleHandle = target.scheduler.activeHandles()[0]!;
    target.scheduler.fireDuringCancel = true;
    target.controller.dispatch({ type: 'advance' });
    const playing = target.controller.snapshot();
    expect(playing.screen).toBe('playing');
    target.scheduler.fireRetained(staleHandle);
    expect(target.controller.snapshot()).toBe(playing);
    expect(target.scheduler.cancelled).toContain(staleHandle);
  });

  it('is safe under observer and synchronous-scheduler reentrancy', () => {
    const observerTarget = fixture({
      onTransition: (next, controller) => {
        if (next.effect?.type === 'show-countdown') controller.dispatch({ type: 'restart' });
      },
    });
    startStageCard(observerTarget);
    const observerResult = observerTarget.controller.dispatch({ type: 'advance' });
    expect(observerTarget.controller.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: 0 });
    expect(observerResult).toMatchObject({
      accepted: true,
      current: observerTarget.controller.snapshot(),
      effect: { type: 'start-fresh-run' },
    });
    expect(observerResult.current).toBe(observerTarget.controller.snapshot());
    expect(observerTarget.scheduler.activeHandles()).toEqual([]);

    const synchronousTarget = fixture();
    synchronousTarget.scheduler.fireSynchronously = true;
    startStageCard(synchronousTarget);
    const synchronousResult = synchronousTarget.controller.dispatch({ type: 'advance' });
    expect(synchronousTarget.controller.snapshot().screen).toBe('playing');
    expect(synchronousResult).toMatchObject({
      accepted: true,
      current: synchronousTarget.controller.snapshot(),
      effect: { type: 'enter-playing' },
    });
    expect(synchronousResult.current).toBe(synchronousTarget.controller.snapshot());
    expect(synchronousTarget.scheduler.activeHandles()).toEqual([]);
  });

  it('fails a scheduling attempt closed on the current stage card', () => {
    const target = fixture();
    startStageCard(target);
    target.scheduler.failNext = true;
    const result = target.controller.dispatch({ type: 'advance' });
    expect(target.controller.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: 0 });
    expect(result).toMatchObject({
      accepted: true,
      current: target.controller.snapshot(),
      effect: { type: 'show-stage-card', constructStage: false, schedulerFailed: true },
    });
    expect(result.current).toBe(target.controller.snapshot());
    expect(target.transitions.slice(-2).map((entry) => entry.effect)).toEqual([
      { type: 'show-countdown', step: 3 },
      { type: 'show-stage-card', constructStage: false, schedulerFailed: true },
    ]);
    expect(target.scheduler.activeHandles()).toEqual([]);
  });

  it('registers and cancels an undefined scheduler handle before retained work can run', () => {
    const scheduler = new UndefinedHandleScheduler();
    const transitions: MaltlineViewerFlowTransition[] = [];
    const controller = new MaltlineViewerFlowController({
      stageCount: 8,
      countdownStepMs: 650,
      countdownServeMs: 350,
      scheduler,
      isPlayable: () => true,
      onTransition: (next) => transitions.push(next),
    });
    controller.dispatch({ type: 'restart' });
    controller.dispatch({ type: 'advance' });
    const retained = scheduler.callback!;
    const result = controller.dispatch({ type: 'advance' });
    expect(result.current).toBe(controller.snapshot());
    expect(controller.snapshot().screen).toBe('playing');
    expect(scheduler.cancellations).toEqual([undefined]);
    const observed = transitions.length;
    retained();
    expect(controller.snapshot().screen).toBe('playing');
    expect(transitions).toHaveLength(observed);

    controller.dispatch({ type: 'restart' });
    controller.dispatch({ type: 'advance' });
    const replacedCallback = scheduler.callback!;
    controller.dispatch({ type: 'restart' });
    expect(scheduler.cancellations).toEqual([undefined, undefined]);
    const replacementCard = controller.snapshot();
    replacedCallback();
    expect(controller.snapshot()).toBe(replacementCard);

    controller.dispatch({ type: 'advance' });
    controller.dispose();
    expect(scheduler.cancellations).toEqual([undefined, undefined, undefined]);
    const disposed = controller.snapshot();
    scheduler.fireRetained();
    expect(controller.snapshot()).toBe(disposed);
  });

  it('preserves countdown/interruption and explicit resume policy', () => {
    const countdownTarget = fixture();
    startStageCard(countdownTarget);
    countdownTarget.controller.dispatch({ type: 'advance' });
    const result = countdownTarget.controller.dispatch({
      type: 'interrupt', reason: 'document_hidden', droppedMs: 0,
    });
    expect(result.current.screen).toBe('stage-card');
    expect(result.effect?.type).toBe('show-stage-card');

    const target = fixture();
    enterPlaying(target);
    expect(target.controller.dispatch({
      type: 'interrupt', reason: 'clock_backlog_dropped', droppedMs: 900,
    }).effect).toEqual({
      type: 'record-interruption', reason: 'clock_backlog_dropped', droppedMs: 900,
    });
    expect(target.controller.dispatch({ type: 'interrupt', reason: 'window_blur' }).accepted).toBe(true);
    target.setPlayable(false);
    const interrupted = target.controller.snapshot();
    expect(target.controller.dispatch({ type: 'resume' }).accepted).toBe(false);
    expect(target.controller.snapshot()).toBe(interrupted);
    target.setPlayable(true);
    expect(target.controller.dispatch({ type: 'resume' }).current.screen).toBe('playing');
  });

  it('rejects invalid values without mutation or notification', () => {
    expect(() => fixture({ stageCount: 0 })).toThrow(/stageCount/);
    expect(() => new MaltlineViewerFlowController({
      stageCount: 8,
      countdownStepMs: Number.NaN,
      countdownServeMs: 350,
      scheduler: new FakeScheduler(),
      isPlayable: () => true,
      onTransition: () => undefined,
    })).toThrow(/delays/);

    const target = fixture();
    enterPlaying(target);
    const before = target.controller.snapshot();
    const observed = target.transitions.length;
    for (const event of [
      { type: 'interrupt', reason: 'window_blur', droppedMs: -1 },
      { type: 'interrupt', reason: 'bad-reason', droppedMs: 0 },
      { type: 'unknown' },
    ] as unknown as MaltlineViewerFlowEvent[]) {
      const result = target.controller.dispatch(event);
      expect(result).toMatchObject({ accepted: false, effect: null });
      expect(result.previous).toBe(before);
      expect(result.current).toBe(before);
    }
    expect(target.transitions).toHaveLength(observed);
  });

  it('returns deeply immutable state/transitions and disposes idempotently', () => {
    const target = fixture();
    startStageCard(target);
    const transition = target.controller.dispatch({ type: 'advance' });
    const state = target.controller.snapshot();
    const handle = target.scheduler.activeHandles()[0]!;
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.attempt)).toBe(true);
    expect(Object.isFrozen(state.countdown)).toBe(true);
    expect(Object.isFrozen(state.countdown?.identity)).toBe(true);
    expect(Object.isFrozen(transition)).toBe(true);
    expect(Object.isFrozen(transition.effect)).toBe(true);

    target.controller.dispose();
    target.controller.dispose();
    const disposed = target.controller.snapshot();
    expect(target.scheduler.cancelled.filter((candidate) => candidate === handle)).toHaveLength(1);
    target.scheduler.fireRetained(handle);
    expect(target.controller.snapshot()).toBe(disposed);
    const result = target.controller.dispatch({ type: 'restart' });
    expect(result.accepted).toBe(false);
    expect(result.current).toBe(disposed);
  });
});

import type { LifeLossReason } from '../core/types';
import type { MaltlineFlowScreen } from './gameplay-flow';
import type { MaltlineTimingInterruptionReason } from './viewer-session';

export type MaltlineCountdownStep = 3 | 2 | 1 | 'SERVE';

declare const attemptIdentityBrand: unique symbol;
declare const countdownIdentityBrand: unique symbol;

export interface MaltlineViewerAttemptIdentity {
  readonly [attemptIdentityBrand]: true;
}

export interface MaltlineViewerCountdownIdentity {
  readonly [countdownIdentityBrand]: true;
}

export interface MaltlineViewerFlowState {
  readonly screen: MaltlineFlowScreen;
  readonly stageIndex: number;
  readonly stageCount: number;
  readonly attempt: MaltlineViewerAttemptIdentity;
  readonly countdown: Readonly<{
    identity: MaltlineViewerCountdownIdentity;
    step: MaltlineCountdownStep;
  }> | null;
}

export type MaltlineViewerFlowEvent =
  | Readonly<{ type: 'advance' }>
  | Readonly<{ type: 'restart' }>
  | Readonly<{
      type: 'countdown-elapsed';
      attempt: MaltlineViewerAttemptIdentity;
      stageIndex: number;
      countdown: MaltlineViewerCountdownIdentity;
      expectedStep: MaltlineCountdownStep;
    }>
  | Readonly<{
      type: 'stage-cleared';
      attempt: MaltlineViewerAttemptIdentity;
      stageIndex: number;
      bonus: number;
    }>
  | Readonly<{
      type: 'game-lost';
      attempt: MaltlineViewerAttemptIdentity;
      stageIndex: number;
      fatalReason: LifeLossReason | null;
    }>
  | Readonly<{
      type: 'interrupt';
      reason: MaltlineTimingInterruptionReason;
      droppedMs?: number;
    }>
  | Readonly<{ type: 'resume' }>;

export type MaltlineViewerFlowEffect =
  | Readonly<{ type: 'show-instructions' }>
  | Readonly<{ type: 'start-fresh-run' }>
  | Readonly<{ type: 'show-stage-card'; constructStage: boolean; schedulerFailed: boolean }>
  | Readonly<{ type: 'show-countdown'; step: MaltlineCountdownStep }>
  | Readonly<{ type: 'enter-playing' }>
  | Readonly<{ type: 'finish-stage'; bonus: number }>
  | Readonly<{ type: 'show-victory' }>
  | Readonly<{ type: 'show-game-over'; fatalReason: LifeLossReason | null }>
  | Readonly<{
      type: 'record-interruption';
      reason: MaltlineTimingInterruptionReason;
      droppedMs: number;
    }>
  | Readonly<{ type: 'resume-playing' }>;

export interface MaltlineViewerFlowTransition {
  /** Whether the dispatched semantic event was legal in its entry state. */
  readonly accepted: boolean;
  /** State when dispatch() was entered. Observer callbacks receive atomic transitions. */
  readonly previous: MaltlineViewerFlowState;
  /** Settled controller state when dispatch() returns. */
  readonly current: MaltlineViewerFlowState;
  /** Last effect applied by the event's synchronous transition chain. */
  readonly effect: MaltlineViewerFlowEffect | null;
}

export interface MaltlineViewerFlowScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface MaltlineViewerFlowControllerOptions {
  readonly stageCount: number;
  readonly countdownStepMs: number;
  readonly countdownServeMs: number;
  readonly scheduler: MaltlineViewerFlowScheduler;
  readonly isPlayable: () => boolean;
  readonly onTransition: (transition: MaltlineViewerFlowTransition) => void;
}

interface TimerSlot {
  readonly state: MaltlineViewerFlowState;
  readonly attempt: MaltlineViewerAttemptIdentity;
  readonly stageIndex: number;
  readonly countdown: MaltlineViewerCountdownIdentity;
  readonly expectedStep: MaltlineCountdownStep;
  handleRegistered: boolean;
  handle?: unknown;
}

const INTERRUPTION_REASONS = new Set<MaltlineTimingInterruptionReason>([
  'clock_backlog_dropped',
  'document_hidden',
  'window_blur',
  'unsupported_width',
]);

function attemptIdentity(): MaltlineViewerAttemptIdentity {
  return Object.freeze({}) as MaltlineViewerAttemptIdentity;
}

function countdownIdentity(): MaltlineViewerCountdownIdentity {
  return Object.freeze({}) as MaltlineViewerCountdownIdentity;
}

function countdownValue(
  identity: MaltlineViewerCountdownIdentity,
  step: MaltlineCountdownStep,
): NonNullable<MaltlineViewerFlowState['countdown']> {
  return Object.freeze({ identity, step });
}

function flowState(
  stageCount: number,
  screen: MaltlineFlowScreen,
  stageIndex: number,
  attempt: MaltlineViewerAttemptIdentity,
  countdown: MaltlineViewerFlowState['countdown'] = null,
): MaltlineViewerFlowState {
  return Object.freeze({ screen, stageIndex, stageCount, attempt, countdown });
}

function freezeEffect(effect: MaltlineViewerFlowEffect): MaltlineViewerFlowEffect {
  return Object.freeze(effect);
}

function transition(
  accepted: boolean,
  previous: MaltlineViewerFlowState,
  current: MaltlineViewerFlowState,
  effect: MaltlineViewerFlowEffect | null,
): MaltlineViewerFlowTransition {
  return Object.freeze({ accepted, previous, current, effect });
}

function validStageIndex(value: unknown, stageCount: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < stageCount;
}

function nextCountdownStep(step: MaltlineCountdownStep): MaltlineCountdownStep | null {
  if (step === 3) return 2;
  if (step === 2) return 1;
  if (step === 1) return 'SERVE';
  return null;
}

/**
 * Viewer-only presentation flow. Engine state, proofs, eligibility, replay data,
 * DOM work, focus, and RAF timing deliberately remain with the caller.
 */
export class MaltlineViewerFlowController {
  private readonly options: MaltlineViewerFlowControllerOptions;
  private state: MaltlineViewerFlowState;
  private timerSlot: TimerSlot | null = null;
  private lastAtomicTransition: MaltlineViewerFlowTransition | null = null;
  private disposed = false;

  constructor(options: MaltlineViewerFlowControllerOptions) {
    if (!Number.isSafeInteger(options.stageCount) || options.stageCount <= 0) {
      throw new Error('Maltline viewer flow stageCount must be a positive safe integer.');
    }
    if (!Number.isFinite(options.countdownStepMs) || options.countdownStepMs < 0
      || !Number.isFinite(options.countdownServeMs) || options.countdownServeMs < 0) {
      throw new Error('Maltline viewer countdown delays must be finite and nonnegative.');
    }
    this.options = options;
    this.state = flowState(options.stageCount, 'title', 0, attemptIdentity());
  }

  snapshot(): MaltlineViewerFlowState {
    return this.state;
  }

  /**
   * Observers receive each atomic transition in order. The return value is the
   * settled summary of this synchronous dispatch chain: `accepted` describes
   * the caller's event, `current` is the state at return, and `effect` is the
   * final effect applied before that state settled.
   */
  dispatch(event: MaltlineViewerFlowEvent): MaltlineViewerFlowTransition {
    const entryState = this.state;
    const result = this.dispatchEvent(event);
    if (result.current === this.state) return result;
    return transition(
      result.accepted,
      entryState,
      this.state,
      this.lastAtomicTransition?.effect ?? null,
    );
  }

  private dispatchEvent(event: MaltlineViewerFlowEvent): MaltlineViewerFlowTransition {
    const previous = this.state;
    if (this.disposed || !event || typeof event !== 'object') return this.reject(previous);

    switch (event.type) {
      case 'advance':
        return this.advance(previous);
      case 'restart':
        return this.commit(
          flowState(this.options.stageCount, 'stage-card', 0, attemptIdentity()),
          freezeEffect({ type: 'start-fresh-run' }),
        );
      case 'countdown-elapsed':
        return this.countdownElapsed(previous, event);
      case 'stage-cleared':
        if (previous.screen !== 'playing'
          || event.attempt !== previous.attempt
          || event.stageIndex !== previous.stageIndex
          || !validStageIndex(event.stageIndex, previous.stageCount)
          || !Number.isSafeInteger(event.bonus)
          || event.bonus < 0) return this.reject(previous);
        return this.commit(
          flowState(previous.stageCount, 'cleared', previous.stageIndex, previous.attempt),
          freezeEffect({ type: 'finish-stage', bonus: event.bonus }),
        );
      case 'game-lost':
        if (previous.screen !== 'playing'
          || event.attempt !== previous.attempt
          || event.stageIndex !== previous.stageIndex
          || !validStageIndex(event.stageIndex, previous.stageCount)
          || (event.fatalReason !== null && !INTERRUPTION_SAFE_LOSS_REASONS.has(event.fatalReason))) {
          return this.reject(previous);
        }
        return this.commit(
          flowState(previous.stageCount, 'gameover', previous.stageIndex, previous.attempt),
          freezeEffect({ type: 'show-game-over', fatalReason: event.fatalReason }),
        );
      case 'interrupt': {
        const droppedMs = event.droppedMs ?? 0;
        if (!INTERRUPTION_REASONS.has(event.reason)
          || !Number.isFinite(droppedMs) || droppedMs < 0) return this.reject(previous);
        if (previous.screen === 'countdown') {
          return this.commit(
            flowState(previous.stageCount, 'stage-card', previous.stageIndex, previous.attempt),
            freezeEffect({ type: 'show-stage-card', constructStage: false, schedulerFailed: false }),
          );
        }
        if (previous.screen !== 'playing' && previous.screen !== 'interrupted') {
          return this.reject(previous);
        }
        return this.commit(
          flowState(previous.stageCount, 'interrupted', previous.stageIndex, previous.attempt),
          freezeEffect({ type: 'record-interruption', reason: event.reason, droppedMs }),
        );
      }
      case 'resume':
        if (previous.screen !== 'interrupted' || !this.options.isPlayable()) {
          return this.reject(previous);
        }
        return this.commit(
          flowState(previous.stageCount, 'playing', previous.stageIndex, previous.attempt),
          freezeEffect({ type: 'resume-playing' }),
        );
      default:
        return this.reject(previous);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidateAndCancelTimer();
  }

  private advance(previous: MaltlineViewerFlowState): MaltlineViewerFlowTransition {
    switch (previous.screen) {
      case 'title':
        return this.commit(
          flowState(previous.stageCount, 'instructions', previous.stageIndex, previous.attempt),
          freezeEffect({ type: 'show-instructions' }),
        );
      case 'instructions':
      case 'gameover':
      case 'victory':
        return this.commit(
          flowState(previous.stageCount, 'stage-card', 0, attemptIdentity()),
          freezeEffect({ type: 'start-fresh-run' }),
        );
      case 'stage-card':
        return this.startCountdown(previous);
      case 'countdown':
        return this.enterPlayingOrReturnToCard(previous);
      case 'cleared':
        if (previous.stageIndex + 1 === previous.stageCount) {
          return this.commit(
            flowState(previous.stageCount, 'victory', previous.stageIndex, previous.attempt),
            freezeEffect({ type: 'show-victory' }),
          );
        }
        return this.commit(
          flowState(previous.stageCount, 'stage-card', previous.stageIndex + 1, previous.attempt),
          freezeEffect({ type: 'show-stage-card', constructStage: true, schedulerFailed: false }),
        );
      default:
        return this.reject(previous);
    }
  }

  private startCountdown(previous: MaltlineViewerFlowState): MaltlineViewerFlowTransition {
    const identity = countdownIdentity();
    return this.commit(
      flowState(
        previous.stageCount,
        'countdown',
        previous.stageIndex,
        previous.attempt,
        countdownValue(identity, 3),
      ),
      freezeEffect({ type: 'show-countdown', step: 3 }),
    );
  }

  private countdownElapsed(
    previous: MaltlineViewerFlowState,
    event: Extract<MaltlineViewerFlowEvent, { type: 'countdown-elapsed' }>,
  ): MaltlineViewerFlowTransition {
    const slot = this.timerSlot;
    if (previous.screen !== 'countdown'
      || previous.countdown === null
      || slot === null
      || slot.state !== previous
      || event.attempt !== previous.attempt
      || event.stageIndex !== previous.stageIndex
      || event.countdown !== previous.countdown.identity
      || event.expectedStep !== previous.countdown.step
      || slot.attempt !== event.attempt
      || slot.stageIndex !== event.stageIndex
      || slot.countdown !== event.countdown
      || slot.expectedStep !== event.expectedStep) return this.reject(previous);

    // Validation above intentionally precedes even clearing this callback's slot.
    this.timerSlot = null;
    const next = nextCountdownStep(previous.countdown.step);
    if (next === null) return this.enterPlayingOrReturnToCard(previous);
    return this.commit(
      flowState(
        previous.stageCount,
        'countdown',
        previous.stageIndex,
        previous.attempt,
        countdownValue(previous.countdown.identity, next),
      ),
      freezeEffect({ type: 'show-countdown', step: next }),
    );
  }

  private enterPlayingOrReturnToCard(
    previous: MaltlineViewerFlowState,
  ): MaltlineViewerFlowTransition {
    if (!this.options.isPlayable()) {
      return this.commit(
        flowState(previous.stageCount, 'stage-card', previous.stageIndex, previous.attempt),
        freezeEffect({ type: 'show-stage-card', constructStage: false, schedulerFailed: false }),
      );
    }
    return this.commit(
      flowState(previous.stageCount, 'playing', previous.stageIndex, previous.attempt),
      freezeEffect({ type: 'enter-playing' }),
    );
  }

  private commit(
    current: MaltlineViewerFlowState,
    effect: MaltlineViewerFlowEffect,
  ): MaltlineViewerFlowTransition {
    const previous = this.state;
    const oldSlot = this.timerSlot;
    this.timerSlot = null;
    this.state = current;

    // State/token invalidation must happen before best-effort cancellation: a
    // hostile scheduler may invoke the retained callback from cancel().
    if (oldSlot?.handleRegistered) {
      try {
        this.options.scheduler.cancel(oldSlot.handle);
      } catch {
        // Cancellation is advisory; identity validation keeps retained work inert.
      }
    }

    const accepted = transition(true, previous, current, effect);
    try {
      this.publishAtomicTransition(accepted);
    } finally {
      if (!this.disposed && this.state === current && current.screen === 'countdown') {
        this.scheduleCountdown(current);
      }
    }
    return accepted;
  }

  private scheduleCountdown(state: MaltlineViewerFlowState): void {
    const countdown = state.countdown;
    if (countdown === null) return;
    const slot: TimerSlot = {
      state,
      attempt: state.attempt,
      stageIndex: state.stageIndex,
      countdown: countdown.identity,
      expectedStep: countdown.step,
      handleRegistered: false,
    };
    this.timerSlot = slot;
    const callback = (): void => {
      this.dispatch({
        type: 'countdown-elapsed',
        attempt: slot.attempt,
        stageIndex: slot.stageIndex,
        countdown: slot.countdown,
        expectedStep: slot.expectedStep,
      });
    };

    try {
      const handle = this.options.scheduler.schedule(
        callback,
        countdown.step === 'SERVE'
          ? this.options.countdownServeMs
          : this.options.countdownStepMs,
      );
      if (this.timerSlot === slot && this.state === state) {
        slot.handle = handle;
        slot.handleRegistered = true;
      } else {
        try {
          this.options.scheduler.cancel(handle);
        } catch {
          // A synchronously fired callback is already identity-invalid here.
        }
      }
    } catch {
      if (this.timerSlot !== slot || this.state !== state) return;
      this.timerSlot = null;
      const fallback = flowState(state.stageCount, 'stage-card', state.stageIndex, state.attempt);
      this.state = fallback;
      this.publishAtomicTransition(transition(
        true,
        state,
        fallback,
        freezeEffect({ type: 'show-stage-card', constructStage: false, schedulerFailed: true }),
      ));
    }
  }

  private invalidateAndCancelTimer(): void {
    const slot = this.timerSlot;
    this.timerSlot = null;
    if (!slot?.handleRegistered) return;
    try {
      this.options.scheduler.cancel(slot.handle);
    } catch {
      // Best effort; the detached slot cannot pass callback validation.
    }
  }

  private reject(previous: MaltlineViewerFlowState): MaltlineViewerFlowTransition {
    return transition(false, previous, previous, null);
  }

  private publishAtomicTransition(next: MaltlineViewerFlowTransition): void {
    this.lastAtomicTransition = next;
    this.options.onTransition(next);
  }
}

const INTERRUPTION_SAFE_LOSS_REASONS = new Set<LifeLossReason>([
  'walkout',
  'shake_smashed',
  'jar_smashed',
]);

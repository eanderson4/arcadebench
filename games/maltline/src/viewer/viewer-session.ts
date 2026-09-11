export type MaltlineTimingInterruptionReason =
  | 'clock_backlog_dropped'
  | 'document_hidden'
  | 'window_blur'
  | 'unsupported_width';

export interface MaltlineRunEligibilitySnapshot {
  rankEligible: boolean;
  interruptionReason: MaltlineTimingInterruptionReason | null;
  droppedMs: number;
}

/** Viewer-only fairness state; wall time never enters the deterministic engine. */
export class MaltlineRunEligibility {
  private rankEligible = true;
  private interruptionReason: MaltlineTimingInterruptionReason | null = null;
  private droppedMs = 0;

  interrupt(reason: MaltlineTimingInterruptionReason, droppedMs = 0): void {
    if (!Number.isFinite(droppedMs) || droppedMs < 0) {
      throw new Error('viewer droppedMs must be finite and nonnegative');
    }
    this.rankEligible = false;
    this.interruptionReason ??= reason;
    this.droppedMs += droppedMs;
  }

  reset(): void {
    this.rankEligible = true;
    this.interruptionReason = null;
    this.droppedMs = 0;
  }

  snapshot(): MaltlineRunEligibilitySnapshot {
    return Object.freeze({
      rankEligible: this.rankEligible,
      interruptionReason: this.interruptionReason,
      droppedMs: this.droppedMs,
    });
  }
}

export function isEditableOrInteractiveTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest([
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
  ].join(',')) !== null;
}

/**
 * Native key repeat must not retrigger one-shot viewer flow commands. Direction
 * repeats are intentionally left to the simulation-tick input adapter.
 */
export function isRepeatedPresentationAction(code: string, repeat: boolean): boolean {
  return repeat && (code === 'Enter' || code === 'Space' || code === 'KeyR');
}

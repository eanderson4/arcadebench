export interface FixedStepAdvance {
  /** Whole simulation ticks to execute for this animation frame. */
  ticks: number;
  /** Monotonic wall-clock time observed since the previous sample. */
  elapsedMs: number;
  /** Wall-clock time explicitly discarded by the hitch/backlog ceiling. */
  droppedMs: number;
}

/**
 * Converts monotonic animation-frame timestamps into a bounded fixed-step
 * budget. Fractional time survives between ordinary frames; only time beyond
 * the explicit backlog ceiling is discarded.
 */
export class FixedStepClock {
  private tickMs: number;
  private maximumBacklogMs: number;
  private previousTimeMs: number | null = null;
  private accumulatorMs = 0;

  constructor(
    ticksPerSecond: number,
    private readonly maximumCatchUpTicks: number,
  ) {
    if (!Number.isFinite(maximumCatchUpTicks)
      || !Number.isInteger(maximumCatchUpTicks)
      || maximumCatchUpTicks < 1) {
      throw new Error('maximumCatchUpTicks must be a positive integer');
    }
    this.tickMs = this.resolveTickMilliseconds(ticksPerSecond);
    this.maximumBacklogMs = this.tickMs * maximumCatchUpTicks;
  }

  setTicksPerSecond(ticksPerSecond: number): void {
    this.tickMs = this.resolveTickMilliseconds(ticksPerSecond);
    this.maximumBacklogMs = this.tickMs * this.maximumCatchUpTicks;
    this.reset();
  }

  /** Drops any pre-pause fraction and makes the next timestamp an anchor. */
  reset(): void {
    this.previousTimeMs = null;
    this.accumulatorMs = 0;
  }

  advance(nowMs: number): FixedStepAdvance {
    if (!Number.isFinite(nowMs)) throw new Error('clock timestamp must be finite');
    if (this.previousTimeMs === null) {
      this.previousTimeMs = nowMs;
      return { ticks: 0, elapsedMs: 0, droppedMs: 0 };
    }

    // requestAnimationFrame timestamps are monotonic, but treating a backwards
    // sample as a fresh anchor keeps a platform clock discontinuity contained.
    if (nowMs < this.previousTimeMs) {
      this.previousTimeMs = nowMs;
      this.accumulatorMs = 0;
      return { ticks: 0, elapsedMs: 0, droppedMs: 0 };
    }

    const elapsedMs = nowMs - this.previousTimeMs;
    this.previousTimeMs = nowMs;
    this.accumulatorMs += elapsedMs;

    const droppedMs = Math.max(0, this.accumulatorMs - this.maximumBacklogMs);
    if (droppedMs > 0) this.accumulatorMs = this.maximumBacklogMs;

    // The tolerance only absorbs floating-point error at an exact tick
    // boundary; it is far too small to manufacture a tick from real time.
    const boundaryToleranceMs = this.tickMs * 1e-9;
    const ticks = Math.min(
      this.maximumCatchUpTicks,
      Math.floor((this.accumulatorMs + boundaryToleranceMs) / this.tickMs),
    );
    this.accumulatorMs -= ticks * this.tickMs;
    if (Math.abs(this.accumulatorMs) <= boundaryToleranceMs) this.accumulatorMs = 0;

    return { ticks, elapsedMs, droppedMs };
  }

  private resolveTickMilliseconds(ticksPerSecond: number): number {
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
      throw new Error('ticksPerSecond must be positive and finite');
    }
    return 1000 / ticksPerSecond;
  }
}

import type { FlavorId, MaltlineInput } from '../core/types';

export const MALTLINE_DIRECTION_INITIAL_REPEAT_MULTIPLIER = 3;
export const MALTLINE_VIEWER_INPUT_ADAPTER_ID = 'viewer-keyboard-input-v2' as const;
export const MALTLINE_VIEWER_SERVE_LATCH_POLICY = 'pre-step-blend-or-held-one-shot-v1' as const;

export interface MaltlineViewerInputCadence {
  stationRepeatTicks: number;
  laneRepeatTicks: number;
  lanes?: number;
}

export interface MaltlineViewerPreStepState {
  readonly player: Readonly<{
    lane?: number;
    holding: FlavorId | null;
    blending: FlavorId | null;
  }>;
}

type Direction = -1 | 0 | 1;

interface AxisBinding {
  readonly negativeCodes: ReadonlySet<string>;
  readonly positiveCodes: ReadonlySet<string>;
}

interface AxisState {
  pending: Direction;
  nextRepeatTick: number | null;
}

const STATION_BINDING: AxisBinding = {
  negativeCodes: new Set(['KeyA']),
  positiveCodes: new Set(['KeyD']),
};

const RUN_BINDING: AxisBinding = {
  negativeCodes: new Set(['ArrowLeft']),
  positiveCodes: new Set(['ArrowRight']),
};

const LANE_BINDING: AxisBinding = {
  negativeCodes: new Set(['ArrowUp', 'KeyW']),
  positiveCodes: new Set(['ArrowDown', 'KeyS']),
};

/**
 * Turns physical keyboard state into ordinary per-tick MaltlineInput.
 *
 * A fresh exclusive direction is latched through the next engine-eligible
 * cadence tick, so a short tap cannot disappear between ticks. A held key
 * moves on that first eligible tick, waits three authored repeat intervals,
 * then repeats once per authored interval. Opposite-direction chords are
 * neutral; releasing one side treats the remaining side as a fresh press.
 * Blend remains level-based. A fresh serve action is retained while blending
 * and emits one tick only after a shake is held, so physical taps cannot vanish
 * between simulation ticks or just before blend completion.
 */
export class MaltlineViewerInputAdapter {
  private readonly heldCodes = new Set<string>();
  private readonly stationState: AxisState = { pending: 0, nextRepeatTick: null };
  private readonly laneState: AxisState = { pending: 0, nextRepeatTick: null };
  private pendingServePress = false;
  private forceServeFalse = false;
  private stationRepeatTicks: number;
  private laneRepeatTicks: number;
  private lanes: number | null;

  constructor(cadence: MaltlineViewerInputCadence) {
    this.stationRepeatTicks = validCadence(cadence.stationRepeatTicks, 'stationRepeatTicks');
    this.laneRepeatTicks = validCadence(cadence.laneRepeatTicks, 'laneRepeatTicks');
    this.lanes = validOptionalLaneCount(cadence.lanes);
  }

  setCadence(cadence: MaltlineViewerInputCadence): void {
    this.stationRepeatTicks = validCadence(cadence.stationRepeatTicks, 'stationRepeatTicks');
    this.laneRepeatTicks = validCadence(cadence.laneRepeatTicks, 'laneRepeatTicks');
    this.lanes = validOptionalLaneCount(cadence.lanes);
    this.reset();
  }

  keyDown(code: string): void {
    if (this.heldCodes.has(code)) return;
    const serveBefore = serveHeld(this.heldCodes);
    const stationBefore = heldDirection(this.heldCodes, STATION_BINDING);
    const laneBefore = heldDirection(this.heldCodes, LANE_BINDING);
    this.heldCodes.add(code);
    if (!serveBefore && serveHeld(this.heldCodes)) this.pendingServePress = true;
    this.updateAxisAfterPhysicalChange(
      this.stationState,
      stationBefore,
      heldDirection(this.heldCodes, STATION_BINDING),
      true,
    );
    this.updateAxisAfterPhysicalChange(
      this.laneState,
      laneBefore,
      heldDirection(this.heldCodes, LANE_BINDING),
      true,
    );
  }

  keyUp(code: string): void {
    if (!this.heldCodes.has(code)) return;
    const stationBefore = heldDirection(this.heldCodes, STATION_BINDING);
    const laneBefore = heldDirection(this.heldCodes, LANE_BINDING);
    this.heldCodes.delete(code);
    this.updateAxisAfterPhysicalChange(
      this.stationState,
      stationBefore,
      heldDirection(this.heldCodes, STATION_BINDING),
      false,
    );
    this.updateAxisAfterPhysicalChange(
      this.laneState,
      laneBefore,
      heldDirection(this.heldCodes, LANE_BINDING),
      false,
    );
  }

  inputForTick(
    simulationTick: number,
    preStepState: MaltlineViewerPreStepState,
  ): MaltlineInput {
    if (!Number.isSafeInteger(simulationTick) || simulationTick < 1) {
      throw new Error('simulationTick must be a positive safe integer');
    }
    if (preStepState === null || typeof preStepState !== 'object'
      || preStepState.player === null || typeof preStepState.player !== 'object') {
      throw new Error('preStepState must provide the current player state');
    }
    const runDir = heldDirection(this.heldCodes, RUN_BINDING);
    const stationDir = runDir === 0
      ? this.axisInputForTick(
        simulationTick,
        this.stationRepeatTicks,
        STATION_BINDING,
        this.stationState,
      )
      : runDir;
    const requestedLaneDir = this.axisInputForTick(
      simulationTick,
      this.laneRepeatTicks,
      LANE_BINDING,
      this.laneState,
    );
    const laneDir = this.lanes !== null && preStepState.player.lane !== undefined
      && ((requestedLaneDir < 0 && preStepState.player.lane <= 0)
        || (requestedLaneDir > 0 && preStepState.player.lane >= this.lanes - 1))
      ? 0
      : requestedLaneDir;
    return {
      stationDir,
      laneDir,
      // Blend + serve + direction is the deterministic engine's run signal.
      // A real blend/serve is emitted only when no run arrow is held.
      blend: runDir !== 0 || this.heldCodes.has('Space'),
      serve: runDir !== 0 || this.serveInputForTick(preStepState),
    };
  }

  reset(): void {
    this.heldCodes.clear();
    resetAxis(this.stationState);
    resetAxis(this.laneState);
    this.pendingServePress = false;
    this.forceServeFalse = false;
  }

  private updateAxisAfterPhysicalChange(
    state: AxisState,
    before: Direction,
    after: Direction,
    cancelPendingOnNeutral: boolean,
  ): void {
    if (before === after) return;
    state.nextRepeatTick = null;
    if (after !== 0) {
      state.pending = after;
      return;
    }
    // Releasing a short exclusive tap preserves its pending pulse. Entering
    // an opposite-direction chord cancels the queued direction instead.
    if (cancelPendingOnNeutral) state.pending = 0;
  }

  private axisInputForTick(
    simulationTick: number,
    repeatTicks: number,
    binding: AxisBinding,
    state: AxisState,
  ): Direction {
    if (simulationTick % repeatTicks !== 0) return 0;
    const held = heldDirection(this.heldCodes, binding);
    if (state.pending !== 0) {
      const direction = state.pending;
      state.pending = 0;
      state.nextRepeatTick = held === direction
        ? simulationTick + repeatTicks * MALTLINE_DIRECTION_INITIAL_REPEAT_MULTIPLIER
        : null;
      return direction;
    }
    if (held === 0 || state.nextRepeatTick === null || simulationTick < state.nextRepeatTick) {
      return 0;
    }
    state.nextRepeatTick = simulationTick + repeatTicks;
    return held;
  }

  private serveInputForTick(preStepState: MaltlineViewerPreStepState): boolean {
    const canArm = preStepState.player.blending !== null
      || preStepState.player.holding !== null;
    if (this.pendingServePress && !canArm) this.pendingServePress = false;
    if (this.forceServeFalse) {
      this.forceServeFalse = false;
      return false;
    }
    if (!this.pendingServePress || preStepState.player.holding === null) return false;
    this.pendingServePress = false;
    this.forceServeFalse = true;
    return true;
  }
}

function validOptionalLaneCount(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('lanes must be a positive safe integer');
  }
  return value;
}

function heldDirection(heldCodes: ReadonlySet<string>, binding: AxisBinding): Direction {
  const negative = intersects(heldCodes, binding.negativeCodes);
  const positive = intersects(heldCodes, binding.positiveCodes);
  return negative === positive ? 0 : negative ? -1 : 1;
}

function intersects(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  for (const value of second) {
    if (first.has(value)) return true;
  }
  return false;
}

function serveHeld(heldCodes: ReadonlySet<string>): boolean {
  return heldCodes.has('KeyF') || heldCodes.has('Enter');
}

function resetAxis(state: AxisState): void {
  state.pending = 0;
  state.nextRepeatTick = null;
}

function validCadence(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

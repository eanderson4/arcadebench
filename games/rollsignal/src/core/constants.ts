/** The simulation advances exactly sixty integer-only steps per second. */
export const TICKS_PER_SECOND = 60;
/** Authored world units are converted to integer thousandths for simulation. */
export const FIXED_SCALE = 1_000;
export const MARBLE_RADIUS = 450;
export const STEER_ACCELERATION = 11;
export const BRACE_ACCELERATION = 8;
export const MAX_SPEED = 190;
export const BRACED_MAX_SPEED = 118;
export const NORMAL_DRAG_NUMERATOR = 985;
export const SLICK_DRAG_NUMERATOR = 997;
export const BRACE_DRAG_NUMERATOR = 900;
export const DRAG_DENOMINATOR = 1_000;
export const WALL_BOUNCE_NUMERATOR = 420;
export const WALL_BOUNCE_DENOMINATOR = 1_000;
export const DEFAULT_FALL_PENALTY_TICKS = 180;
export const RING_POINTS = 1_000;
export const FINISH_SCORE = 100_000;
export const MAX_REPLAY_TICKS = 60 * 60 * 10;
export const MAX_REPLAY_BYTES = 2_000_000;

export function toFixed(units: number): number {
  if (!Number.isFinite(units)) throw new Error('world coordinate must be finite');
  return Math.round(units * FIXED_SCALE);
}

export function toWorldUnits(fixed: number): number {
  return fixed / FIXED_SCALE;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

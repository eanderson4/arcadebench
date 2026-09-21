export const FIELD_WIDTH = 1200;
export const FIELD_HEIGHT = 760;
export const TICKS_PER_SECOND = 60;
export const PADDLE_Y = 696;
export const PADDLE_HEIGHT = 24;
export const PADDLE_NORMAL_WIDTH = 164;
export const PADDLE_WIDE_WIDTH = 248;
export const PADDLE_SPEED = 15;
export const BALL_RADIUS = 11;
export const BRICK_WIDTH = 88;
export const BRICK_HEIGHT = 34;
export const BRICK_GAP_X = 12;
export const BRICK_GAP_Y = 12;
export const BRICK_ORIGIN_X = 106;
export const BRICK_ORIGIN_Y = 150;
export const POWER_DROP_WIDTH = 110;
export const POWER_DROP_HEIGHT = 25;
export const POWER_DROP_SPEED = 4;
export const WIDE_DURATION = 15 * TICKS_PER_SECOND;
export const SLOW_DURATION = 10 * TICKS_PER_SECOND;
export const HEAVY_DURATION = 9 * TICKS_PER_SECOND;

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

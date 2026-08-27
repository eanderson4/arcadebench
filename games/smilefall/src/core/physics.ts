/**
 * Every value below is fixed-point (1 unit = FIXED_SCALE) so the simulation is
 * pure integer arithmetic and reproduces tick for tick on any machine.
 */
export const FIXED_SCALE = 1024;

export function fx(units: number): number {
  return Math.round(units * FIXED_SCALE);
}

export function toUnits(fixed: number): number {
  return fixed / FIXED_SCALE;
}

/** Downward pull applied to every smiley, per tick. */
export const GRAVITY = fx(0.013);
/** Smilies never fall faster than this, so a drop is always readable. */
export const TERMINAL_FALL = fx(0.34);
/** Sideways push from the lean input. */
export const LEAN_ACCEL = fx(0.019);
export const LEAN_MAX = fx(0.26);
/** Sideways drift decays to a stop when nobody is leaning. */
export const LEAN_DRAG_NUMERATOR = 29;
export const LEAN_DRAG_DENOMINATOR = 32;
/** The whole flock pops upward by this much on a hop. */
export const HOP_IMPULSE = fx(0.4);
/** Side walls are bouncy but lossy. */
export const WALL_BOUNCE_NUMERATOR = 3;
export const WALL_BOUNCE_DENOMINATOR = 4;

export const SMILEY_RADIUS = fx(0.7);
/** How tall a bucket stands above the floor. */
export const BUCKET_HEIGHT = fx(2.2);
/** Landing on the rim instead of the mouth is a splat. */
export const BUCKET_RIM = fx(0.32);
/** A full bucket burps smilies back up until they run out of patience. */
export const BURP_IMPULSE = fx(0.3);
export const BURP_SIDEKICK = fx(0.13);
export const MAX_BOUNCES = 2;

/**
 * Rocks bonk rather than vaporise. A hit knocks the smiley up and along with
 * the rock, leaves it bruised, and grants a few ticks of flashing grace so one
 * rock cannot chain-hit the same smiley.
 */
export const BONK_LIFT = fx(0.24);
export const BONK_PUSH = fx(0.15);
export const BONK_GRACE_TICKS = 26;
/** How many rock hits a smiley shrugs off before the next one splats it. */
export const BRUISE_LIMIT = 2;
/**
 * On a `floorRule: 'bounce'` stage nothing kills a smiley, so bruises are
 * capped here instead — past this the value has bottomed out and there is
 * nothing left to lose.
 */
export const MAX_BRUISES = 4;
/** Each bruise halves what a catch pays, down to this floor. */
export const BRUISED_CATCH_DENOMINATOR = 2;
export const MIN_CATCH_POINTS = 10;
/** How hard the ground throws a smiley back on a bouncy stage. */
export const FLOOR_BOUNCE = fx(0.29);
export const RIM_BOUNCE = fx(0.24);

/**
 * Ledges are furniture, not hazards. They throw a smiley back exactly as hard
 * as the ground does but never bruise it, so the intended route up a staircase
 * costs time and nothing else — landing in the dirt is the mistake, landing on
 * a step is the plan.
 *
 * A free bounce lifts FLOOR_BOUNCE^2 / (2 * GRAVITY) = 3.2 units, so a step
 * rise under about three units is climbable on bounces alone and anything
 * taller needs a hop (HOP_IMPULSE reaches 6.1).
 */
export const LEDGE_BOUNCE = FLOOR_BOUNCE;
/** How deep a ledge is, so a smiley can bonk its head on the underside. */
export const PLATFORM_THICKNESS = fx(0.9);
/** How far the teeth of a spike strip reach off their surface. */
export const SPIKE_HEIGHT = fx(0.55);

export const CATCH_BASE_POINTS = 100;
export const CATCH_COMBO_POINTS = 25;
export const MAX_COMBO_STEP = 8;
/** Finishing early is worth something; one point per remaining tick. */
export const TIME_BONUS_PER_TICK = 1;

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const reach = ar + br;
  return dx * dx + dy * dy <= reach * reach;
}

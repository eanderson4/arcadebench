import { FIXED_SCALE } from '../core/engine';
import { BUCKET_HEIGHT, BUCKET_RIM, LEAN_MAX, MAX_BRUISES, TERMINAL_FALL, clamp, toUnits } from '../core/physics';
import type {
  BucketState,
  GameEvent,
  PlatformState,
  SpikeStripState,
  RockState,
  SmileyState,
  SmilefallState,
} from '../core/types';

const INK = '#2c1b47';
const PAPER = '#fff8ec';
const YOLK = '#ffd23f';
const YOLK_DEEP = '#f2a413';
const GRASS = '#6fd66f';
const GRASS_DEEP = '#3fae55';
const GRAPE = '#8b5cf6';
const BRUISE = '#c084fc';
const ROCK = '#9aa0b8';
const ROCK_DEEP = '#5f657f';
const SPIKE = '#6b7280';
const SPIKE_DEEP = '#3f4453';
const DANGER = '#e03a6d';
const LEDGE = '#c99a63';
const LEDGE_DEEP = '#8f6a3d';
const SKY_OUTSIDE = 'rgba(44, 27, 71, 0.14)';
const BUCKET_FACES = ['#2fd39b', '#ff5d8f', '#8b5cf6', '#ff8a3d', '#52c8ff'];
const DISPLAY_FONT = '"Baloo 2", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';

/** How each kind of knock reads on screen. */
const BRUISE_JUICE: Record<
  'rock' | 'floor' | 'rim' | 'burp',
  { text: string; ink: string; splat: string; spokes: number; shake: number }
> = {
  rock: { text: 'ow!', ink: '#a855f7', splat: '#c084fc', spokes: 6, shake: 6 },
  floor: { text: 'boing!', ink: '#3fae55', splat: '#9c7a4a', spokes: 5, shake: 3 },
  rim: { text: 'clang!', ink: '#f2a413', splat: '#f2a413', spokes: 4, shake: 4 },
  burp: { text: 'nope!', ink: '#f2a413', splat: '#ffd23f', spokes: 4, shake: 2 },
};

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  drift: number;
}

interface Splat {
  x: number;
  y: number;
  born: number;
  color: string;
  spokes: number;
}

/** Expanding ring, used for the shared hop shockwave. */
interface Ring {
  x: number;
  y: number;
  born: number;
  color: string;
  life: number;
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: string;
  spin: number;
}

export interface RenderOptions {
  /** Seconds since the page loaded; drives cosmetic motion only. */
  time: number;
  paused?: boolean;
}

/**
 * Whether anything on this stage kills on contact. It drives the whole visual
 * language: if something here can pop a smiley, the smilies show up as
 * balloons and the hazards show up sharp.
 */
function popsOnContact(state: SmilefallState): boolean {
  return state.rockRule === 'smash' || state.spikes.length > 0;
}

/**
 * Stable pseudo-random in [0, 1) from any string, so rocks keep their shape.
 *
 * The FNV-1a accumulation on its own barely avalanches: keys that differ only
 * in their last character — which is exactly how every shape here is seeded,
 * `rock:0`, `rock:1`, `rock:2` — come back within a thousandth of each other.
 * Every vertex of a rock then drew the same radius and the whole thing came
 * out a regular polygon. The murmur3 finaliser is what actually scrambles it.
 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function roundedPath(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  radius: number,
): void {
  context.beginPath();
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const previous = points[(index - 1 + points.length) % points.length]!;
    const toPrevious = normalize(previous[0] - current[0], previous[1] - current[1]);
    const toNext = normalize(next[0] - current[0], next[1] - current[1]);
    const start: [number, number] = [current[0] + toPrevious[0] * radius, current[1] + toPrevious[1] * radius];
    const end: [number, number] = [current[0] + toNext[0] * radius, current[1] + toNext[1] * radius];
    if (index === 0) context.moveTo(start[0], start[1]);
    else context.lineTo(start[0], start[1]);
    context.quadraticCurveTo(current[0], current[1], end[0], end[1]);
  }
  context.closePath();
}

/**
 * A balloon silhouette: round and full across the shoulders, pinched into a
 * neck at the bottom. It is deliberately the same width and height as the
 * collision circle — only the *shape* inside that box changes — so a smiley
 * that looks like a balloon still hits like the ball it is.
 *
 * `sag` in [0, 1] lets the air out: the shoulders spread, the crown drops, and
 * the neck slackens, so a battered balloon reads as half-deflated rather than
 * as a smiley that has simply gone a duller colour.
 */
function balloonPath(context: CanvasRenderingContext2D, radius: number, sag = 0): void {
  const wide = 1 + sag * 0.15;
  const tall = 1 - sag * 0.2;
  const r = radius;
  const w = (value: number): number => value * r * wide;
  const h = (value: number): number => value * r * tall;
  const neck = 0.15 + sag * 0.16;
  context.beginPath();
  context.moveTo(0, h(-1));
  // Shoulders: wide and high, which is what makes it read as inflated.
  context.bezierCurveTo(w(0.66), h(-1), w(1.0), h(-0.44), w(0.98), h(0.1));
  // Taper down into the neck.
  context.bezierCurveTo(w(0.94), h(0.62), w(0.44), h(0.9), w(neck), h(1));
  context.lineTo(w(-neck), h(1));
  context.bezierCurveTo(w(-0.44), h(0.9), w(-0.94), h(0.62), w(-0.98), h(0.1));
  context.bezierCurveTo(w(-1.0), h(-0.44), w(-0.66), h(-1), 0, h(-1));
  context.closePath();
}

function normalize(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

export class SmilefallRenderer {
  private readonly context: CanvasRenderingContext2D;
  private floaters: Floater[] = [];
  private splats: Splat[] = [];
  private confetti: Confetto[] = [];
  private rings: Ring[] = [];
  private shake = 0;
  private scale = 40;
  /** Camera window, in field units. Eased so a tier reveal reads as a move. */
  private viewTop = 0;
  private viewHeight = 20;
  private originX = 0;
  private originY = 0;
  private lastScenarioId: string | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    this.context = context;
  }

  reset(): void {
    this.floaters = [];
    this.splats = [];
    this.confetti = [];
    this.rings = [];
    this.shake = 0;
  }

  /** Gameplay events become juice: floating points, splats, confetti, shake. */
  pushEvents(events: readonly GameEvent[], state: SmilefallState, time: number): void {
    for (const event of events) {
      switch (event.type) {
        case 'smiley_caught': {
          const bucket = state.buckets.find((candidate) => candidate.id === event.bucketId);
          const x = bucket ? toUnits(bucket.x + bucket.width / 2) : state.width / 2;
          const y = (bucket ? toUnits(bucket.mouthY) : state.height - toUnits(BUCKET_HEIGHT)) - 0.4;
          this.floaters.push({ x, y, text: `+${event.points}`, color: '#14a877', born: time, drift: -1.7 });
          this.spawnConfetti(x, y, time, 10);
          break;
        }
        case 'smiley_splatted': {
          // Spikes are never a bruise and never a splat: they are a pop, and
          // they get the loudest reaction on the board.
          const popped = event.reason === 'spikes';
          this.splats.push({
            x: event.at.x,
            y: event.at.y,
            born: time,
            color: popped ? '#ff5d8f' : YOLK_DEEP,
            spokes: popped ? 9 : 7,
          });
          this.floaters.push({
            x: event.at.x,
            y: event.at.y - 0.6,
            text: popped ? 'POP!' : 'oof',
            color: '#e03a6d',
            born: time,
            drift: popped ? -1.4 : -1.1,
          });
          if (popped) {
            this.rings.push({ x: event.at.x, y: event.at.y, born: time, color: '#ff5d8f', life: 0.4 });
            this.spawnConfetti(event.at.x, event.at.y, time, 14);
          }
          this.shake = Math.max(this.shake, popped ? 10 : 5);
          break;
        }
        case 'smiley_bruised': {
          // A rock hurts. The ground is just embarrassing. They should not
          // look the same.
          const cosmetic = BRUISE_JUICE[event.cause];
          this.splats.push({
            x: event.at.x,
            y: event.at.y,
            born: time,
            color: cosmetic.splat,
            spokes: cosmetic.spokes,
          });
          this.floaters.push({
            x: event.at.x,
            y: event.at.y - 0.6,
            text: event.cause === 'rock' && event.bruises > 1 ? 'OW!!' : cosmetic.text,
            color: cosmetic.ink,
            born: time,
            drift: -1.2,
          });
          this.shake = Math.max(this.shake, cosmetic.shake);
          break;
        }
        case 'smiley_smashed':
          // On a spiky stage a smiley is a balloon, so it does not get bonked,
          // it pops — burst ring, shredded latex, and a bigger kick.
          this.splats.push({ x: event.at.x, y: event.at.y, born: time, color: '#ff5d8f', spokes: 9 });
          this.floaters.push({
            x: event.at.x,
            y: event.at.y - 0.6,
            text: state.rockRule === 'smash' ? 'POP!' : 'BONK',
            color: '#e03a6d',
            born: time,
            drift: -1.4,
          });
          if (state.rockRule === 'smash') {
            this.rings.push({ x: event.at.x, y: event.at.y, born: time, color: '#ff5d8f', life: 0.4 });
            this.spawnConfetti(event.at.x, event.at.y, time, 14);
          }
          this.shake = Math.max(this.shake, 11);
          break;
        case 'smiley_bounced':
          // Free bounce off a ledge: a puff of dust, no frown, no bruise.
          this.rings.push({ x: event.at.x, y: event.at.y + 0.5, born: time, color: '#c99a63', life: 0.32 });
          break;
        case 'bucket_burped': {
          const bucket = state.buckets.find((candidate) => candidate.id === event.bucketId);
          const x = bucket ? toUnits(bucket.x + bucket.width / 2) : state.width / 2;
          this.floaters.push({
            x,
            y: (bucket ? toUnits(bucket.mouthY) : state.height - toUnits(BUCKET_HEIGHT)) - 0.5,
            text: 'FULL!',
            color: '#f2a413',
            born: time,
            drift: -1.2,
          });
          break;
        }
        case 'bucket_filled': {
          const bucket = state.buckets.find((candidate) => candidate.id === event.bucketId);
          if (!bucket) break;
          this.spawnConfetti(toUnits(bucket.x + bucket.width / 2), toUnits(bucket.mouthY) - 0.8, time, 26);
          break;
        }
        case 'flock_hopped':
          // One ring per smiley, all born on the same tick: the whole point is
          // that they read as a single synchronised pop.
          for (const smiley of state.smilies) {
            this.rings.push({
              x: toUnits(smiley.position.x),
              y: toUnits(smiley.position.y),
              born: time,
              color: '#52c8ff',
              life: 0.5,
            });
          }
          for (const smiley of state.smilies) {
            this.floaters.push({
              x: toUnits(smiley.position.x),
              y: toUnits(smiley.position.y) + 0.8,
              text: 'hup!',
              color: '#52c8ff',
              born: time,
              drift: 1.4,
            });
          }
          break;
        default:
          break;
      }
    }
  }

  render(state: SmilefallState, options: RenderOptions): void {
    const context = this.context;
    if (state.scenarioId !== this.lastScenarioId) {
      this.lastScenarioId = state.scenarioId;
      this.reset();
      this.snapCamera(state);
    }
    this.resizeToField(state);
    const { time } = options;
    this.updateCamera(state);

    context.setTransform(1, 0, 0, 1, 0, 0);
    // The sky is painted in screen space so it always fills the canvas, even
    // when the camera has pulled back past the edges of the field.
    this.drawSky(state, time);
    this.drawLeanWind(state, time);

    context.save();
    if (this.shake > 0.2) {
      const angle = time * 47;
      context.translate(Math.sin(angle) * this.shake, Math.cos(angle * 1.3) * this.shake * 0.6);
      this.shake *= 0.86;
    }
    // Everything from here down is drawn in field units times the scale, with
    // the camera applied once as a translation.
    context.translate(this.originX, this.originY);

    this.drawGround(state);
    for (const platform of state.platforms) this.drawPlatform(state, platform, time);
    for (const strip of state.spikes) this.drawSpikeStrip(strip, time);
    for (const bucket of state.buckets) this.drawBucket(state, bucket, time);
    for (const rock of state.rocks) this.drawRock(state, rock, time);
    for (const smiley of state.smilies) this.drawSpeedLines(state, smiley);
    for (const smiley of state.smilies) this.drawSmiley(state, smiley, time);
    for (const smiley of state.smilies) this.drawLeanChevron(state, smiley, time);
    this.drawRings(time);
    this.drawSplats(time);
    this.drawConfetti(time);
    this.drawFloaters(time);
    this.drawFieldEdges(state);
    context.restore();
  }

  /**
   * The canvas keeps the aspect the stage was authored for. A tall stage says
   * how much of itself it wants framed to begin with; the camera does the rest.
   */
  private resizeToField(state: SmilefallState): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = this.canvas.clientWidth || 960;
    const base = Math.min(state.viewHeight, state.height);
    const width = Math.round(cssWidth * ratio);
    const height = Math.round((cssWidth * base / state.width) * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * Frames everything that still matters: the flock, every pail that is not
   * full yet, the line the drops arrive on, and always the ground. On a flat
   * stage that is the whole field and the camera never moves. On a stacked one
   * it means the view widens out by itself the moment the flock starts
   * climbing, which is the reveal: you finish the bottom tier and the game
   * shows you how much further up it goes.
   */
  private cameraTarget(state: SmilefallState): { top: number; height: number } {
    const base = Math.min(state.viewHeight, state.height);
    let top = state.height - base;
    for (const smiley of state.smilies) top = Math.min(top, toUnits(smiley.position.y - smiley.radius) - 1.2);
    // Only the *next* objective, never all of them: the lowest pail that still
    // has room. Framing every unfilled pail at once would show the whole tower
    // in the opening shot and there would be nothing left to reveal.
    const nextUp = state.buckets
      .filter((bucket) => bucket.filled < bucket.capacity)
      .reduce((lowest, bucket) => Math.max(lowest, bucket.mouthY), Number.NEGATIVE_INFINITY);
    if (Number.isFinite(nextUp)) top = Math.min(top, toUnits(nextUp) - 2.4);
    if (state.dropsRemaining > 0) top = Math.min(top, toUnits(state.dropY) - 1.4);
    top = Math.max(0, top);
    return { top, height: Math.max(base, state.height - top) };
  }

  private snapCamera(state: SmilefallState): void {
    const target = this.cameraTarget(state);
    this.viewTop = target.top;
    this.viewHeight = target.height;
  }

  private updateCamera(state: SmilefallState): void {
    const target = this.cameraTarget(state);
    // Plain exponential smoothing: fast enough to follow a climbing flock,
    // slow enough that unlocking a tier reads as a deliberate pull-back.
    this.viewTop += (target.top - this.viewTop) * 0.07;
    this.viewHeight += (target.height - this.viewHeight) * 0.05;
    this.scale = Math.min(this.canvas.width / state.width, this.canvas.height / this.viewHeight);
    this.originX = (this.canvas.width - state.width * this.scale) / 2;
    this.originY = -this.viewTop * this.scale;
  }

  /** A soft veil over everything outside the field, so the walls still read. */
  private drawFieldEdges(state: SmilefallState): void {
    if (this.originX < 1) return;
    const context = this.context;
    const right = state.width * this.scale;
    const overscan = this.canvas.height * 2;
    context.save();
    context.fillStyle = SKY_OUTSIDE;
    context.fillRect(-this.originX, -overscan, this.originX, overscan * 3);
    context.fillRect(right, -overscan, this.originX, overscan * 3);
    this.ink();
    context.beginPath();
    context.moveTo(0, -overscan);
    context.lineTo(0, overscan * 2);
    context.moveTo(right, -overscan);
    context.lineTo(right, overscan * 2);
    context.stroke();
    context.restore();
  }

  private get lineWidth(): number {
    return Math.max(2, this.scale * 0.085);
  }

  private ink(width = this.lineWidth): void {
    this.context.strokeStyle = INK;
    this.context.lineWidth = width;
    this.context.lineJoin = 'round';
    this.context.lineCap = 'round';
  }

  private drawSky(state: SmilefallState, time: number): void {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#8ee6ff');
    sky.addColorStop(0.55, '#cdf3ff');
    sky.addColorStop(1, '#ffeed6');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    // Sun.
    context.fillStyle = '#fff3b0';
    context.beginPath();
    context.arc(width * 0.9, height * 0.12, this.scale * 1.9, 0, Math.PI * 2);
    context.fill();

    // Lazy clouds, purely cosmetic.
    context.fillStyle = 'rgba(255, 255, 255, 0.86)';
    for (let index = 0; index < 5; index++) {
      const seed = hashString(`cloud${index}`);
      const speed = 6 + seed * 10;
      const x = ((seed * width + time * speed) % (width + this.scale * 8)) - this.scale * 4;
      const y = height * (0.08 + seed * 0.34);
      const size = this.scale * (1.1 + seed * 1.3);
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.arc(x + size * 0.9, y + size * 0.2, size * 0.78, 0, Math.PI * 2);
      context.arc(x - size * 0.9, y + size * 0.25, size * 0.66, 0, Math.PI * 2);
      context.fill();
    }
  }

  /**
   * The single loudest "you are steering all of them" cue: while the player
   * leans, the entire sky streaks the same way. It costs nothing and it reads
   * instantly, even before you notice the smilies themselves moving together.
   */
  private drawLeanWind(state: SmilefallState, time: number): void {
    const lean = state.currentInput.lean;
    if (lean === 'none') return;
    const context = this.context;
    const direction = lean === 'left' ? -1 : 1;
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    context.lineCap = 'round';
    for (let index = 0; index < 24; index++) {
      const seed = hashString(`wind${index}`);
      const y = height * (0.05 + seed * 0.78);
      const length = this.scale * (1.6 + seed * 3.4);
      const speed = this.scale * (9 + seed * 16);
      const span = width + length * 2;
      const travel = (time * speed) % span;
      const x = direction > 0
        ? ((seed * span + travel) % span) - length
        : width + length - ((seed * span + travel) % span);
      context.globalAlpha = 0.32 + seed * 0.34;
      context.lineWidth = Math.max(2, this.scale * (0.07 + seed * 0.09));
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length * direction, y);
      context.stroke();
    }
    context.restore();
  }

  /**
   * Cartoon speed lines trailing each smiley. Every smiley in the sky gets the
   * same length at the same angle because they are all obeying the same lean,
   * so the flock visibly moves as one body without drawing anything between
   * them.
   */
  private drawSpeedLines(state: SmilefallState, smiley: SmileyState): void {
    const context = this.context;
    const speed = toUnits(smiley.velocity.x);
    if (Math.abs(speed) < 0.05) return;
    const radius = toUnits(smiley.radius) * this.scale;
    const x = toUnits(smiley.position.x) * this.scale;
    const y = toUnits(smiley.position.y) * this.scale;
    const direction = speed < 0 ? -1 : 1;
    const reach = Math.min(1, Math.abs(speed) / toUnits(LEAN_MAX)) * radius * 2.6;

    context.save();
    context.strokeStyle = YOLK_DEEP;
    context.lineCap = 'round';
    for (const [index, offset] of [-0.5, 0, 0.5].entries()) {
      context.globalAlpha = 0.55 - Math.abs(offset) * 0.26;
      context.lineWidth = Math.max(2, this.scale * (0.11 - Math.abs(offset) * 0.03));
      const startX = x - direction * radius * (0.9 + index * 0.08);
      const lineY = y + offset * radius * 1.05;
      context.beginPath();
      context.moveTo(startX, lineY);
      context.lineTo(startX - direction * reach * (1 - Math.abs(offset) * 0.35), lineY);
      context.stroke();
    }
    context.restore();
  }

  /**
   * One chevron over every smiley, all pointing the same way at the same time.
   * Where the wind sells "the world is leaning", this sells "and every single
   * one of these is taking the same order".
   */
  private drawLeanChevron(state: SmilefallState, smiley: SmileyState, time: number): void {
    const lean = state.currentInput.lean;
    if (lean === 'none') return;
    const context = this.context;
    const direction = lean === 'left' ? -1 : 1;
    const radius = toUnits(smiley.radius) * this.scale;
    const size = radius * 0.55;
    // Keep it on screen even when the flock is pinned against a wall; the
    // direction is what matters, and it must stay identical for everyone.
    const x = clamp(
      toUnits(smiley.position.x) * this.scale + direction * radius * 1.6,
      size * 2,
      state.width * this.scale - size * 2,
    );
    const y = toUnits(smiley.position.y) * this.scale;
    const pulse = 0.8 + Math.sin(time * 12) * 0.2;
    context.save();
    context.globalAlpha = pulse;
    context.strokeStyle = GRAPE;
    context.lineWidth = Math.max(2.5, this.scale * 0.13);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const offset of [0, size * 0.85]) {
      context.beginPath();
      context.moveTo(x + (offset - size) * direction, y - size);
      context.lineTo(x + offset * direction, y);
      context.lineTo(x + (offset - size) * direction, y + size);
      context.stroke();
    }
    context.restore();
  }

  private drawRings(time: number): void {
    const context = this.context;
    this.rings = this.rings.filter((ring) => time - ring.born < ring.life);
    for (const ring of this.rings) {
      const age = (time - ring.born) / ring.life;
      context.save();
      context.globalAlpha = (1 - age) * 0.8;
      context.strokeStyle = ring.color;
      context.lineWidth = Math.max(2, this.scale * 0.12 * (1 - age));
      context.beginPath();
      context.arc(ring.x * this.scale, ring.y * this.scale, this.scale * (0.5 + age * 2.4), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  private drawGround(state: SmilefallState): void {
    const context = this.context;
    const floor = state.height * this.scale;
    const grassTop = floor - this.scale * 0.62;
    // Overscan sideways: when the camera pulls back there is canvas either
    // side of the field and the ground should still reach the frame.
    const left = -this.canvas.width;
    const span = this.canvas.width * 3;
    const bouncy = state.floorRule === 'bounce';
    context.fillStyle = bouncy ? '#7ad3a3' : GRASS;
    context.fillRect(left, grassTop, span, this.canvas.height * 2);
    context.fillStyle = bouncy ? '#2fb37a' : GRASS_DEEP;
    context.fillRect(left, floor - this.scale * 0.2, span, this.scale * 0.2);
    this.ink();
    context.beginPath();
    context.moveTo(left, grassTop);
    context.lineTo(left + span, grassTop);
    context.stroke();

    if (!bouncy) return;
    // A springy stage says so in the ground itself: stitched trampoline seams
    // instead of grass, because nothing that lands here is going to break.
    context.save();
    context.strokeStyle = 'rgba(255, 248, 236, 0.8)';
    context.lineWidth = Math.max(1.5, this.scale * 0.06);
    context.setLineDash([this.scale * 0.24, this.scale * 0.2]);
    for (const offset of [0.18, 0.4]) {
      context.beginPath();
      context.moveTo(left, grassTop + this.scale * offset);
      context.lineTo(left + span, grassTop + this.scale * offset);
      context.stroke();
    }
    context.restore();
  }

  /**
   * A ledge. Painted as a wooden shelf rather than more ground, because it
   * behaves differently: bouncing off one is free, and the whole point of a
   * stacked stage is that the steps are the safe route up.
   */
  private drawPlatform(state: SmilefallState, platform: PlatformState, time: number): void {
    const context = this.context;
    const left = toUnits(platform.x) * this.scale;
    const top = toUnits(platform.y) * this.scale;
    const width = toUnits(platform.width) * this.scale;
    const height = toUnits(platform.thickness) * this.scale;

    context.save();
    context.fillStyle = LEDGE;
    roundedPath(context, [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height],
    ], this.scale * 0.14);
    context.fill();
    this.ink();
    context.stroke();

    // A springy top edge, so it reads as something to bounce on.
    context.strokeStyle = LEDGE_DEEP;
    context.lineWidth = Math.max(2, this.scale * 0.1);
    context.beginPath();
    const steps = Math.max(4, Math.round(toUnits(platform.width)));
    for (let index = 0; index <= steps; index++) {
      const x = left + (width / steps) * index;
      const wobble = Math.sin(time * 3 + index * 0.9) * this.scale * 0.03;
      if (index === 0) context.moveTo(x, top + height * 0.62 + wobble);
      else context.lineTo(x, top + height * 0.62 + wobble);
    }
    context.stroke();
    context.restore();
  }

  private drawBucket(state: SmilefallState, bucket: BucketState, time: number): void {
    const context = this.context;
    const index = state.buckets.indexOf(bucket);
    const face = BUCKET_FACES[index % BUCKET_FACES.length]!;
    const left = toUnits(bucket.x) * this.scale;
    const width = toUnits(bucket.width) * this.scale;
    const mouthY = toUnits(bucket.mouthY) * this.scale;
    const floorY = toUnits(bucket.baseY) * this.scale - this.scale * 0.18;
    const taper = width * 0.13;
    const full = bucket.filled >= bucket.capacity;

    context.save();
    if (full) {
      // A finished bucket gives a happy little shimmy.
      context.translate(left + width / 2, floorY);
      context.rotate(Math.sin(time * 5) * 0.035);
      context.translate(-(left + width / 2), -floorY);
    }

    context.fillStyle = face;
    roundedPath(context, [
      [left, mouthY],
      [left + width, mouthY],
      [left + width - taper, floorY],
      [left + taper, floorY],
    ], this.scale * 0.16);
    context.fill();
    this.ink();
    context.stroke();

    // Smiley juice: the pail fills up as it collects.
    const ratio = bucket.filled / Math.max(1, bucket.capacity);
    if (ratio > 0) {
      context.save();
      roundedPath(context, [
        [left, mouthY],
        [left + width, mouthY],
        [left + width - taper, floorY],
        [left + taper, floorY],
      ], this.scale * 0.16);
      context.clip();
      const surface = floorY - (floorY - mouthY) * ratio * 0.94;
      const juice = context.createLinearGradient(0, surface, 0, floorY);
      juice.addColorStop(0, '#fff2b8');
      juice.addColorStop(1, YOLK_DEEP);
      context.fillStyle = juice;
      context.beginPath();
      context.moveTo(left, floorY);
      context.lineTo(left, surface);
      // A lazy wobble on the surface so the juice feels alive.
      const wobble = this.scale * 0.07;
      for (let step = 0; step <= 6; step++) {
        const x = left + (width / 6) * step;
        context.lineTo(x, surface + Math.sin(time * 3 + step * 1.1 + left) * wobble);
      }
      context.lineTo(left + width, floorY);
      context.closePath();
      context.fill();
      context.restore();
    }

    // Rim.
    const rimHeight = this.scale * 0.42;
    context.fillStyle = PAPER;
    roundedPath(context, [
      [left - this.scale * 0.1, mouthY - rimHeight],
      [left + width + this.scale * 0.1, mouthY - rimHeight],
      [left + width + this.scale * 0.1, mouthY + rimHeight * 0.35],
      [left - this.scale * 0.1, mouthY + rimHeight * 0.35],
    ], this.scale * 0.18);
    context.fill();
    this.ink();
    context.stroke();

    // The mouth opening the smilies actually have to hit.
    const rim = toUnits(BUCKET_RIM) * this.scale;
    context.strokeStyle = 'rgba(44, 27, 71, 0.35)';
    context.lineWidth = Math.max(1.5, this.lineWidth * 0.4);
    context.setLineDash([this.scale * 0.18, this.scale * 0.18]);
    context.beginPath();
    context.moveTo(left + rim, mouthY - rimHeight * 0.2);
    context.lineTo(left + width - rim, mouthY - rimHeight * 0.2);
    context.stroke();
    context.setLineDash([]);

    // Capacity readout, outlined so it survives any fill level behind it.
    const label = `${bucket.filled}/${bucket.capacity}`;
    const labelX = left + width / 2;
    const labelY = mouthY + (floorY - mouthY) * 0.44;
    context.font = `800 ${Math.round(this.scale * 0.62)}px ${DISPLAY_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = this.scale * 0.16;
    context.lineJoin = 'round';
    context.strokeStyle = PAPER;
    context.strokeText(label, labelX, labelY);
    context.fillStyle = full ? '#14532d' : INK;
    context.fillText(label, labelX, labelY);
    context.restore();
  }

  /**
   * A bed of teeth. Same jagged, uneven language as a smash rock, so the two
   * hazards that end a smiley outright read as the same family, and nothing
   * that merely bruises ever looks like this.
   */
  private drawSpikeStrip(strip: SpikeStripState, time: number): void {
    const context = this.context;
    const left = toUnits(strip.x) * this.scale;
    const width = toUnits(strip.width) * this.scale;
    const surface = toUnits(strip.y) * this.scale;
    const reach = toUnits(strip.height) * this.scale;
    const direction = strip.facing === 'up' ? -1 : 1;
    const teeth = Math.max(3, Math.round(toUnits(strip.width) * 1.7));

    context.save();
    // Base rail, so the strip reads as bolted onto the surface.
    context.fillStyle = SPIKE_DEEP;
    context.fillRect(left, surface - this.scale * 0.09, width, this.scale * 0.18);

    context.fillStyle = SPIKE;
    context.beginPath();
    context.moveTo(left, surface);
    for (let index = 0; index < teeth; index++) {
      const seed = hashString(`${strip.id}:${index}`);
      const start = left + (width / teeth) * index;
      const end = left + (width / teeth) * (index + 1);
      // Uneven heights and off-centre tips: a broken row, not a comb.
      const tip = start + (end - start) * (0.28 + seed * 0.46);
      context.lineTo(start, surface);
      context.lineTo(tip, surface + direction * reach * (0.66 + seed * 0.5));
      context.lineTo(end, surface);
    }
    context.lineTo(left + width, surface);
    context.closePath();
    context.fill();
    this.ink(Math.max(1.5, this.lineWidth * 0.7));
    context.lineJoin = 'miter';
    context.miterLimit = 6;
    context.stroke();

    // A slow glint travelling along the row, so a static hazard still moves.
    context.fillStyle = DANGER;
    for (let index = 0; index < teeth; index++) {
      const seed = hashString(`${strip.id}:glint${index}`);
      context.globalAlpha = Math.max(0, Math.sin(time * 2.4 + index * 0.8 + seed * 5)) * 0.85;
      const tip = left + (width / teeth) * (index + 0.4 + seed * 0.3);
      context.beginPath();
      context.arc(tip, surface + direction * reach * 0.72, this.scale * 0.07, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  /**
   * Rocks look like what they do. On a stage where a hit only bruises, they are
   * round, dopey boulders. On a stage where a hit is fatal they grow spikes and
   * turn cold — the shape is the rule, so the player never has to read the HUD
   * to know whether the thing coming at them ends a smiley.
   */
  private drawRock(state: SmilefallState, rock: RockState, time: number): void {
    const context = this.context;
    const x = toUnits(rock.position.x) * this.scale;
    const y = toUnits(rock.position.y) * this.scale;
    const radius = toUnits(rock.radius) * this.scale;
    const seed = hashString(rock.id);
    const spiky = state.rockRule === 'smash';

    context.save();
    context.translate(x, y);
    context.rotate(time * (0.7 + seed) * -0.55);

    if (spiky) {
      // A shattered shard, not a compass rose. Vertices strictly alternate
      // between a tooth and a notch — that is what makes it read as jagged
      // rather than lumpy — but every tooth gets its own length, its own
      // width and its own angle, so no two are alike and the silhouette never
      // looks machined.
      const teeth = 9;
      const shape: Array<[number, number]> = [];
      const tips: number[] = [];
      for (let index = 0; index < teeth * 2; index++) {
        const wobble = hashString(`${rock.id}:ang${index}`);
        const reach = hashString(`${rock.id}:len${index}`);
        const angle = ((index + (wobble - 0.5) * 0.7) / (teeth * 2)) * Math.PI * 2;
        // Outer vertices are the points; the odd ones cut back in to a notch.
        // The longest point stays near the collision radius, so a near miss
        // never looks like a hit.
        const spike = index % 2 === 0 ? 0.94 + reach * 0.34 : 0.42 + reach * 0.26;
        if (index % 2 === 0) tips.push(index);
        shape.push([Math.cos(angle) * radius * spike, Math.sin(angle) * radius * spike]);
      }

      context.fillStyle = SPIKE;
      context.beginPath();
      for (const [index, [px, py]] of shape.entries()) {
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();

      // The outer third of each tooth, painted hot. This is the part that
      // actually says "do not touch me".
      context.fillStyle = DANGER;
      context.globalAlpha = 0.55 + Math.sin(time * 7 + seed * 6) * 0.2;
      for (const index of tips) {
        const [tx, ty] = shape[index]!;
        const [lx, ly] = shape[(index - 1 + shape.length) % shape.length]!;
        const [rx, ry] = shape[(index + 1) % shape.length]!;
        context.beginPath();
        context.moveTo(tx, ty);
        context.lineTo(tx + (lx - tx) * 0.42, ty + (ly - ty) * 0.42);
        context.lineTo(tx + (rx - tx) * 0.42, ty + (ry - ty) * 0.42);
        context.closePath();
        context.fill();
      }
      context.globalAlpha = 1;

      // A dark core so the teeth read as growing out of a solid lump — built
      // from the notch vertices pulled inward, so even the middle is a
      // faceted chunk rather than a circle.
      context.fillStyle = SPIKE_DEEP;
      context.beginPath();
      for (let index = 1, drawn = 0; index < shape.length; index += 2, drawn++) {
        const [px, py] = shape[index]!;
        if (drawn === 0) context.moveTo(px * 0.72, py * 0.72);
        else context.lineTo(px * 0.72, py * 0.72);
      }
      context.closePath();
      context.fill();

      this.ink();
      context.lineJoin = 'miter';
      context.miterLimit = 8;
      context.beginPath();
      for (const [index, [px, py]] of shape.entries()) {
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.stroke();
      context.restore();
      return;
    }

    // A bruising rock is still a broken chunk of stone: few vertices, wide
    // swings in radius, jittered angles and hard straight edges between them.
    // Round it off and it turns into a ball, which is the one thing a rock
    // must never look like.
    const corners = 8;
    const chunk: Array<[number, number]> = [];
    for (let index = 0; index < corners; index++) {
      const wobble = hashString(`${rock.id}:a${index}`);
      const reach = hashString(`${rock.id}:r${index}`);
      const angle = ((index + (wobble - 0.5) * 0.72) / corners) * Math.PI * 2;
      const lump = 0.62 + reach * 0.56;
      chunk.push([Math.cos(angle) * radius * lump, Math.sin(angle) * radius * lump]);
    }

    context.fillStyle = ROCK;
    context.beginPath();
    for (const [index, [px, py]] of chunk.entries()) {
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();

    // Facets rather than craters: wedges from an off-centre point out to each
    // pair of corners, shaded so the stone reads as flat broken planes.
    // The pivot moves per rock, so the wedges never all converge on the middle
    // and the shading reads as broken planes instead of a pinwheel.
    const pivotX = radius * (hashString(`${rock.id}:px`) - 0.5) * 0.62;
    const pivotY = radius * (hashString(`${rock.id}:py`) - 0.5) * 0.62;
    for (const [index, corner] of chunk.entries()) {
      const shade = hashString(`${rock.id}:f${index}`);
      if (shade < 0.5) continue;
      const next = chunk[(index + 1) % chunk.length]!;
      context.save();
      context.globalAlpha = 0.14 + shade * 0.26;
      context.fillStyle = shade > 0.74 ? '#c3c8da' : ROCK_DEEP;
      context.beginPath();
      context.moveTo(pivotX, pivotY);
      context.lineTo(corner[0], corner[1]);
      context.lineTo(next[0], next[1]);
      context.closePath();
      context.fill();
      context.restore();
    }

    // Mitred joins keep the corners actually sharp.
    this.ink();
    context.lineJoin = 'miter';
    context.miterLimit = 5;
    context.beginPath();
    for (const [index, [px, py]] of chunk.entries()) {
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.stroke();

    // One cracked seam across the face, aimed at real corners so the fracture
    // agrees with the silhouette.
    const seam = Math.floor(hashString(`${rock.id}:seam`) * chunk.length);
    const from = chunk[seam]!;
    const to = chunk[(seam + 3) % chunk.length]!;
    context.strokeStyle = ROCK_DEEP;
    context.lineWidth = Math.max(1.5, this.lineWidth * 0.5);
    context.beginPath();
    context.moveTo(from[0] * 0.86, from[1] * 0.86);
    context.lineTo(pivotX, pivotY);
    context.lineTo(to[0] * 0.86, to[1] * 0.86);
    context.stroke();
    context.restore();
  }

  private drawSmiley(state: SmilefallState, smiley: SmileyState, time: number): void {
    const context = this.context;
    const x = toUnits(smiley.position.x) * this.scale;
    const y = toUnits(smiley.position.y) * this.scale;
    const radius = toUnits(smiley.radius) * this.scale;
    const fallRatio = smiley.velocity.y / TERMINAL_FALL;
    // Squash on the way up, stretch on the way down.
    const stretch = 1 + Math.max(-0.22, Math.min(0.22, fallRatio * 0.22));
    const nervous = state.rocks.some((rock) => {
      const dx = toUnits(rock.position.x - smiley.position.x);
      const dy = toUnits(rock.position.y - smiley.position.y);
      return Math.hypot(dx, dy) < 4.2;
    });
    const lean = state.currentInput.lean;
    const gaze = lean === 'left' ? -0.16 : lean === 'right' ? 0.16 : Math.sin(time * 2 + x) * 0.04;
    const hurt = smiley.bruises > 0;
    // Where a rock is fatal, a smiley is a balloon: taut, glossy, tied off at
    // the bottom. Where a rock only bruises, it is a rubber ball. The player
    // should be able to tell which game they are playing from one frame.
    const balloon = popsOnContact(state);
    // A balloon loses air as it takes knocks, so a battered one is visibly
    // slack rather than merely a different colour.
    const sag = balloon && hurt ? Math.min(1, smiley.bruises / MAX_BRUISES) : 0;

    context.save();
    // Flash while the post-bonk grace window is still protecting them.
    if (smiley.graceTicks > 0) context.globalAlpha = Math.sin(time * 34) > 0 ? 1 : 0.42;
    context.translate(x, y);
    // The loudest cue of all: everybody banks the same way by the same amount,
    // because everybody is taking the same order.
    context.rotate(clamp(smiley.velocity.x / LEAN_MAX, -1, 1) * 0.38);
    context.scale(1 / stretch, stretch);

    const skin = hurt ? '#b98436' : YOLK_DEEP;
    if (balloon) {
      // String and knot go down first so the body overlaps them. The string
      // hangs off the bottom and, because the whole smiley is rotated by the
      // shared bank angle, it trails the lean along with everyone else's.
      context.save();
      context.globalAlpha = 0.7;
      this.ink(Math.max(1.2, this.lineWidth * 0.42));
      context.beginPath();
      context.moveTo(0, radius * (1.16 - sag * 0.2));
      context.bezierCurveTo(
        radius * 0.36, radius * 1.46,
        -radius * 0.32, radius * 1.68,
        radius * 0.14, radius * 1.98,
      );
      context.stroke();
      context.restore();

      // The knot itself: a stubby little pinch, not a spike.
      context.fillStyle = skin;
      const knotY = radius * (0.9 - sag * 0.2);
      const knotTip = radius * (1.2 - sag * 0.2);
      const knotHalf = radius * (0.17 + sag * 0.06);
      context.beginPath();
      context.moveTo(-knotHalf, knotY);
      context.lineTo(knotHalf, knotY);
      context.lineTo(radius * 0.1, knotTip);
      context.lineTo(-radius * 0.1, knotTip);
      context.closePath();
      context.fill();
      this.ink(Math.max(1.5, this.lineWidth * 0.7));
      context.stroke();
    }

    // Latex takes a harder, more off-centre light than rubber does: the
    // gradient is pushed further into the top-left shoulder so the lower right
    // falls away into a deep, saturated edge.
    const body = balloon
      ? context.createRadialGradient(-radius * 0.42, -radius * 0.5, radius * 0.04, radius * 0.1, radius * 0.16, radius * 1.24)
      : context.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
    body.addColorStop(0, hurt ? '#fff0e2' : '#fffbe0');
    body.addColorStop(balloon ? 0.42 : 0.55, hurt ? '#eaba74' : YOLK);
    body.addColorStop(1, hurt ? '#bb8639' : skin);
    context.fillStyle = body;
    if (balloon) balloonPath(context, radius, sag);
    else {
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
    }
    context.fill();
    this.ink();
    context.stroke();

    if (balloon) {
      context.save();
      // Everything below is clipped to the body, so a highlight can run right
      // up to the edge without spilling past the outline.
      balloonPath(context, radius, sag);
      context.clip();

      // A soft sheen down the whole lit side, then the hard pinpoint on top of
      // it. Two levels of specular is the thing that reads as stretched latex
      // rather than a painted ball.
      const sheen = context.createLinearGradient(-radius, -radius, radius * 0.4, radius);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
      context.fillStyle = sheen;
      context.fillRect(-radius, -radius, radius * 2, radius * 2.2);

      context.globalAlpha = 0.92;
      context.fillStyle = PAPER;
      context.beginPath();
      context.ellipse(-radius * 0.44, -radius * 0.4, radius * 0.15, radius * 0.34, -0.42, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.6;
      context.beginPath();
      context.ellipse(-radius * 0.18, -radius * 0.66, radius * 0.09, radius * 0.15, -0.42, 0, Math.PI * 2);
      context.fill();

      // A rim light hugging the shaded edge, which is what gives a balloon its
      // roundness in every cartoon ever drawn.
      context.globalAlpha = 0.4;
      context.strokeStyle = '#fff6c9';
      context.lineWidth = Math.max(1.5, this.lineWidth * 0.55);
      context.beginPath();
      context.arc(0, 0, radius * 0.78, -0.16 * Math.PI, 0.5 * Math.PI);
      context.stroke();

      // Slack latex creases. They only appear once a balloon is properly
      // battered, which makes them a readout of how much value is left in it.
      if (sag > 0.35) {
        context.globalAlpha = 0.3 * sag;
        context.strokeStyle = '#7c5320';
        context.lineWidth = Math.max(1.5, this.lineWidth * 0.5);
        for (const [index, offset] of [-0.34, 0.1].entries()) {
          context.beginPath();
          context.arc(radius * offset, radius * (0.5 + index * 0.2), radius * 0.42, 0.1 * Math.PI, 0.62 * Math.PI);
          context.stroke();
        }
      }
      context.restore();
    }

    context.fillStyle = INK;
    const eyeY = -radius * 0.22;
    const eyeR = radius * (nervous ? 0.2 : 0.15);
    for (const side of [-1, 1]) {
      context.beginPath();
      context.ellipse(
        side * radius * 0.36 + gaze * radius,
        eyeY,
        eyeR,
        eyeR * (nervous ? 1.15 : 1.35),
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    if (hurt) {
      // Sad brows, one bruise blotch, and a plaster. It still counts, it just
      // has had a day.
      this.ink(Math.max(1.5, this.lineWidth * 0.55));
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(side * radius * 0.62 + gaze * radius, -radius * 0.62);
        context.lineTo(side * radius * 0.16 + gaze * radius, -radius * 0.46);
        context.stroke();
      }
      context.save();
      context.globalAlpha = 0.55;
      context.fillStyle = BRUISE;
      context.beginPath();
      context.ellipse(-radius * 0.56, radius * 0.28, radius * 0.28, radius * 0.2, -0.4, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.save();
      // High on the cheek, clear of the frown, which is the thing to read.
      context.translate(radius * 0.46, -radius * 0.54);
      context.rotate(-0.6);
      context.fillStyle = PAPER;
      context.fillRect(-radius * 0.32, -radius * 0.13, radius * 0.64, radius * 0.26);
      this.ink(Math.max(1.5, this.lineWidth * 0.5));
      context.strokeRect(-radius * 0.32, -radius * 0.13, radius * 0.64, radius * 0.26);
      context.restore();
    }

    this.ink(Math.max(2, this.lineWidth * 0.8));
    context.beginPath();
    if (hurt) {
      // A proper upside-down grin. This is the whole point of bruising.
      context.arc(0, radius * 0.78, radius * 0.5, 1.16 * Math.PI, 1.84 * Math.PI);
    } else if (nervous) {
      // Wobbly worried mouth.
      context.moveTo(-radius * 0.34, radius * 0.36);
      context.quadraticCurveTo(-radius * 0.1, radius * 0.18, 0, radius * 0.34);
      context.quadraticCurveTo(radius * 0.14, radius * 0.5, radius * 0.34, radius * 0.3);
    } else {
      context.arc(0, radius * 0.02, radius * 0.46, 0.22 * Math.PI, 0.78 * Math.PI);
    }
    context.stroke();

    if (smiley.velocity.y < 0) {
      // Motion lines while the flock is hopping.
      context.strokeStyle = 'rgba(82, 200, 255, 0.85)';
      context.lineWidth = Math.max(2, this.lineWidth * 0.6);
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(side * radius * 0.9, radius * 0.9);
        context.lineTo(side * radius * 1.25, radius * 1.7);
        context.stroke();
      }
    }
    context.restore();
  }

  private spawnConfetti(x: number, y: number, time: number, count: number): void {
    const palette = ['#ffd23f', '#ff5d8f', '#8b5cf6', '#2fd39b', '#52c8ff'];
    for (let index = 0; index < count; index++) {
      const seed = hashString(`${x}:${y}:${time}:${index}`);
      const angle = -Math.PI / 2 + (seed - 0.5) * 2.2;
      const speed = 3 + seed * 6;
      this.confetti.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: time,
        color: palette[index % palette.length]!,
        spin: (seed - 0.5) * 12,
      });
    }
  }

  private drawFloaters(time: number): void {
    const context = this.context;
    this.floaters = this.floaters.filter((floater) => time - floater.born < 1.1);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const floater of this.floaters) {
      const age = (time - floater.born) / 1.1;
      const y = (floater.y + floater.drift * age) * this.scale;
      context.save();
      context.globalAlpha = 1 - age * age;
      context.font = `800 ${Math.round(this.scale * 0.72)}px ${DISPLAY_FONT}`;
      context.lineWidth = this.scale * 0.16;
      context.strokeStyle = INK;
      context.lineJoin = 'round';
      context.strokeText(floater.text, floater.x * this.scale, y);
      context.fillStyle = floater.color;
      context.fillText(floater.text, floater.x * this.scale, y);
      context.restore();
    }
  }

  private drawSplats(time: number): void {
    const context = this.context;
    this.splats = this.splats.filter((splat) => time - splat.born < 0.65);
    for (const splat of this.splats) {
      const age = (time - splat.born) / 0.65;
      const radius = this.scale * (0.4 + age * 1.5);
      context.save();
      context.globalAlpha = 1 - age;
      context.translate(splat.x * this.scale, splat.y * this.scale);
      context.strokeStyle = splat.color;
      context.lineWidth = this.scale * 0.16;
      context.lineCap = 'round';
      for (let index = 0; index < splat.spokes; index++) {
        const angle = (index / splat.spokes) * Math.PI * 2 + age;
        context.beginPath();
        context.moveTo(Math.cos(angle) * radius * 0.35, Math.sin(angle) * radius * 0.35);
        context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        context.stroke();
      }
      context.restore();
    }
  }

  private drawConfetti(time: number): void {
    const context = this.context;
    this.confetti = this.confetti.filter((piece) => time - piece.born < 1.3);
    for (const piece of this.confetti) {
      const age = time - piece.born;
      const x = (piece.x + piece.vx * age) * this.scale;
      const y = (piece.y + piece.vy * age + 9 * age * age) * this.scale;
      context.save();
      context.globalAlpha = Math.max(0, 1 - age / 1.3);
      context.translate(x, y);
      context.rotate(piece.spin * age);
      context.fillStyle = piece.color;
      context.fillRect(-this.scale * 0.12, -this.scale * 0.08, this.scale * 0.24, this.scale * 0.16);
      context.restore();
    }
  }
}

export const FIELD_FIXED_SCALE = FIXED_SCALE;

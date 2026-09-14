import { FIXED_SCALE } from '../core/engine';
import type { NormalizedMaltlineScenario } from '../core/scenario';
import type {
  CustomerState,
  FlavorId,
  GameEvent,
  MaltlineScenario,
  MaltlineState,
} from '../core/types';
import { FLAVOR_LABELS } from '../core/types';
import {
  deriveMaltlineStationActionPresentation,
  type MaltlineStationActionPresentation,
} from './station-action-presentation';
import { MALTLINE_VISUAL_THEME } from './visual-theme';
import {
  deriveMaltlineRendererLayout,
  MALTLINE_RENDERER_FRAME,
  type MaltlineRendererLayout,
  type MaltlineStationLayout,
} from './renderer-layout';
import { MaltlineRendererEffects } from './renderer-effects';
import { activeChainText } from './presentation-copy';
import {
  drawMaltlineCup,
  drawMaltlineJar,
  drawMaltlineFlavorSymbol,
  drawMaltlinePouringCup,
} from './renderer-vessel-painters';

const {
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  hudHeight: HUD_H,
  awningHeight: AWNING_H,
  lanesTop: LANES_TOP,
  counterX: COUNTER_X,
  doorX: DOOR_X,
  bankTop: BANK_TOP,
  machineBaseline: MACHINE_BASELINE,
} = MALTLINE_RENDERER_FRAME;

const {
  wallTop: WALL_TOP,
  cream: CREAM,
  creamDim: CREAM_DIM,
  brass: BRASS,
  ink: INK,
  steamPrefix: STEAM,
} = MALTLINE_VISUAL_THEME.scene;
const FLAVOR_ART = MALTLINE_VISUAL_THEME.flavors;
const FEEDBACK = MALTLINE_VISUAL_THEME.feedback;
const RETURN_JAR = MALTLINE_VISUAL_THEME.returnJar;
const CUSTOMER_ORDER = MALTLINE_VISUAL_THEME.customerOrder;
const OUTGOING_SHAKE = MALTLINE_VISUAL_THEME.outgoingShake;
const STATION = MALTLINE_VISUAL_THEME.station;
const AMBIENCE = MALTLINE_VISUAL_THEME.ambience;

interface MaltlineRendererBinding {
  readonly scenario: NormalizedMaltlineScenario;
  readonly layout: MaltlineRendererLayout;
}

export interface DrawMeta {
  stageIndex: number;
  stageCount: number;
}

/**
 * Presentation-only entropy, time, and motion preference. None may affect the engine.
 *
 * Live callers can omit both dependencies. Fixture and replay callers can
 * inject a seeded random function and a manually advanced clock; `update`
 * remains the exact advancement seam for transient particles and popups.
 */
export interface MaltlinePresentationDependencies {
  random?: () => number;
  nowMs?: () => number;
  reducedMotion?: boolean;
}

const LIVE_RANDOM = Math.random;
const LIVE_NOW_MS = Date.now;
const LIVE_REDUCED_MOTION = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Deterministic per-index shuffle for hair/wardrobe pairing. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length]!;
}

const SHIRTS = MALTLINE_VISUAL_THEME.customers.shirts;
const HAIRS = MALTLINE_VISUAL_THEME.customers.hair;
const SKINS = MALTLINE_VISUAL_THEME.customers.skin;

export class MaltlineRenderer {
  private binding: MaltlineRendererBinding | null = null;
  private readonly effects: MaltlineRendererEffects;
  private readonly nowMs: () => number;
  private reducedMotion: boolean;

  constructor(dependencies: MaltlinePresentationDependencies = {}) {
    const random = dependencies.random ?? LIVE_RANDOM;
    this.nowMs = dependencies.nowMs ?? LIVE_NOW_MS;
    this.reducedMotion = dependencies.reducedMotion ?? LIVE_REDUCED_MOTION();
    this.effects = new MaltlineRendererEffects(random, this.reducedMotion);
  }

  setScenario(scenario: NormalizedMaltlineScenario): MaltlineRendererLayout {
    const layout = deriveMaltlineRendererLayout(scenario);
    this.binding = Object.freeze({ scenario, layout });
    return layout;
  }

  /** Clears effects that must never cross a run or stage boundary. */
  resetPresentation(): void {
    this.effects.reset();
  }

  /** Updates presentation motion without replacing scenario or engine state. */
  setReducedMotion(reducedMotion: boolean): boolean {
    if (reducedMotion === this.reducedMotion) return false;
    this.reducedMotion = reducedMotion;
    this.effects.setReducedMotion(reducedMotion);
    return true;
  }

  private requireBinding(state?: Readonly<MaltlineState>): MaltlineRendererBinding {
    const binding = this.binding;
    if (binding === null) throw new Error('Maltline renderer needs a bound scenario.');
    if (state !== undefined && state.scenarioId !== binding.scenario.id) {
      throw new Error(
        `Maltline renderer scenario mismatch: bound ${binding.scenario.id}, received ${state.scenarioId}.`,
      );
    }
    return binding;
  }

  private get layout(): MaltlineRendererLayout {
    return this.requireBinding().layout;
  }

  private laneCenterY(lane: number): number {
    return this.layout.laneCenterY(lane);
  }

  pushEvents(events: GameEvent[], state: MaltlineState): void {
    const { layout } = this.requireBinding(state);
    this.effects.pushEvents(events, state, layout);
  }

  update(dtMs: number): void {
    this.effects.advance(dtMs);
  }

  draw(ctx: CanvasRenderingContext2D, state: MaltlineState, meta: DrawMeta): void {
    const { scenario } = this.requireBinding(state);
    // Keep enlarged canvas artwork sharp without changing logical game geometry.
    // A two-times backing-store cap bounds the cost on high-density displays.
    const canvas = ctx.canvas;
    if (canvas && typeof canvas.clientWidth === 'number' && canvas.clientWidth > 0) {
      const density = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
      const scale = Math.min(2, Math.max(1, canvas.clientWidth * density / CANVAS_W));
      const width = Math.round(CANVAS_W * scale);
      const height = Math.round(CANVAS_H * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(width / CANVAS_W, 0, 0, height / CANVAS_H, 0, 0);
    }
    const presentationTimeMs = this.nowMs();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    const shakeTranslation = this.effects.shakeTranslation();
    if (shakeTranslation !== null) {
      ctx.translate(shakeTranslation.x, shakeTranslation.y);
    }

    this.drawWall(ctx, state);
    this.drawAwning(ctx);
    for (let lane = 0; lane < scenario.lanes; lane++) {
      this.drawDoors(ctx, scenario, lane);
      this.drawCustomers(ctx, scenario, state, lane);
      this.drawCounters(ctx, scenario, state, lane);
      this.drawSlides(ctx, scenario, state, lane);
      this.drawJars(ctx, state, lane);
      if (state.player.lane === lane) {
        this.drawPlayer(ctx, scenario, state);
        this.drawFlavorSelector(ctx, scenario, state);
      }
    }
    this.drawControlRail(ctx, scenario, state);
    this.drawStationBank(ctx, scenario, state, presentationTimeMs);
    this.drawParticles(ctx);
    this.drawPopups(ctx);
    this.drawVignette(ctx);

    ctx.restore();
    this.drawFailureCallouts(ctx);
    this.drawHud(ctx, scenario, state, meta);
  }

  // ---- Scene -----------------------------------------------------------

  private drawWall(ctx: CanvasRenderingContext2D, state: MaltlineState): void {
    ctx.fillStyle = WALL_TOP;
    ctx.fillRect(0, HUD_H, CANVAS_W, BANK_TOP - HUD_H);
    const end = this.layout.scenario.laneLength * FIXED_SCALE * 1.22;
    // Every floor seam is a ray toward the same vanishing point as the bars.
    for (let lane = 0; lane < this.layout.scenario.lanes; lane++) {
      const upper = this.layout.laneTop(lane);
      const lower = this.layout.laneBottom(lane);
      const a = this.layout.project(0, upper, -104);
      const b = this.layout.project(end, upper, -104);
      const c = this.layout.project(end, lower, -104);
      const d = this.layout.project(0, lower, -104);
      ctx.fillStyle = lane % 2 === 0 ? '#28695e' : '#245e55';
      this.polygon(ctx, [a, b, c, d]);
      ctx.fill();
      ctx.strokeStyle = '#d7bc87';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(243,233,210,0.12)';
      ctx.lineWidth = 1;
      for (let depth = 0; depth <= 1; depth += 0.125) {
        const top = this.layout.project(end * depth, upper, -104);
        const bottom = this.layout.project(end * depth, lower, -104);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
      }
    }
  }

  private polygon(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }

  private drawAwning(ctx: CanvasRenderingContext2D): void {
    const y = HUD_H;
    const scallop = 48;
    for (let x = 0; x < CANVAS_W + scallop; x += scallop) {
      const stripe = ctx.createLinearGradient(0, y, 0, y + AWNING_H);
      if ((x / scallop) % 2 === 0) {
        stripe.addColorStop(0, '#ef7257');
        stripe.addColorStop(1, '#c94b3d');
      } else {
        stripe.addColorStop(0, '#f3e9d2');
        stripe.addColorStop(1, '#d9c8a6');
      }
      ctx.fillStyle = stripe;
      ctx.fillRect(x - scallop / 2, y, scallop, AWNING_H - 6);
      ctx.beginPath();
      ctx.arc(x, y + AWNING_H - 6, scallop / 2, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(4, 12, 9, 0.35)';
    ctx.fillRect(0, y + AWNING_H + 16, CANVAS_W, 5);
  }

  private drawControlRail(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
  ): void {
    const railX = 8;
    const railWidth = 30;
    const railTop = LANES_TOP + 8;
    const railHeight = scenario.lanes * this.layout.laneHeight - 24;

    ctx.fillStyle = 'rgba(5, 24, 18, 0.72)';
    ctx.beginPath();
    ctx.roundRect(railX, railTop, railWidth, railHeight, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159, 196, 178, 0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(159, 196, 178, 0.9)';
    ctx.font = '800 7px "Maltline UI", system-ui, sans-serif';
    ctx.fillText('WIN', railX + railWidth / 2, railTop + 11);
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const active = lane === state.player.lane;
      const returnApproaching = state.jars.some((jar) =>
        jar.lane === lane && jar.x <= this.layout.returnApproachMaxFixedX);
      const centerY = this.laneCenterY(lane);
      ctx.fillStyle = active ? CREAM : returnApproaching
        ? withAlpha(RETURN_JAR.trail, 0.34)
        : 'rgba(159, 196, 178, 0.16)';
      ctx.beginPath();
      ctx.roundRect(railX + 4, centerY - 14, railWidth - 8, 28, 8);
      ctx.fill();
      if (returnApproaching) {
        ctx.strokeStyle = active ? FEEDBACK.ready : RETURN_JAR.trail;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = active ? INK : 'rgba(243, 233, 210, 0.72)';
      ctx.font = '800 12px "Maltline UI", system-ui, sans-serif';
      ctx.fillText(String(lane + 1), railX + railWidth / 2, centerY + 1);
      if (active) {
        ctx.fillStyle = CREAM;
        ctx.beginPath();
        ctx.moveTo(railX + railWidth + 4, centerY);
        ctx.lineTo(railX + railWidth + 11, centerY - 5);
        ctx.lineTo(railX + railWidth + 11, centerY + 5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }


  private drawCounters(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState, lane: number): void {
    const layout = this.layout;
    const end = scenario.laneLength * FIXED_SCALE;
    const back = layout.counterBackY(lane);
    const front = layout.counterFrontY(lane);
    const bottom = layout.floorY(lane) + 3 * layout.actorScale;
    const nearBack = layout.project(0, back, 12);
    const farBack = layout.project(end, back, 12);
    const nearFront = layout.project(0, front, -12);
    const farFront = layout.project(end, front, -12);
    const nearBottom = layout.project(0, bottom, -12);
    const farBottom = layout.project(end, bottom, -12);

    // Customers are painted first. This solid top and fascia hide their legs;
    // only vessels are subsequently painted on the serving surface.
    ctx.fillStyle = '#ae4837';
    this.polygon(ctx, [nearBack, nearFront, nearBottom, layout.project(0, bottom, 12)]);
    ctx.fill();
    const top = ctx.createLinearGradient(0, back, 0, front);
    top.addColorStop(0, '#fff0c4');
    top.addColorStop(1, '#efc77f');
    ctx.fillStyle = top;
    ctx.strokeStyle = '#915033';
    ctx.lineWidth = 1.5;
    this.polygon(ctx, [nearBack, farBack, farFront, nearFront]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d96b50';
    this.polygon(ctx, [nearFront, farFront, farBottom, nearBottom]);
    ctx.fill();
    ctx.strokeStyle = '#934635';
    ctx.lineWidth = 1;
    for (let depth = 0; depth < 1; depth += 0.125) {
      const start = depth * end;
      const finish = (depth + 0.10) * end;
      this.polygon(ctx, [
        layout.project(start, front + 3, -12),
        layout.project(finish, front + 3, -12),
        layout.project(finish, bottom - 3, -12),
        layout.project(start, bottom - 3, -12),
      ]);
      ctx.stroke();
    }
    ctx.strokeStyle = lane === state.player.lane ? AMBIENCE.activeLane : '#ffe6ac';
    ctx.lineWidth = lane === state.player.lane ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(nearFront.x, nearFront.y);
    ctx.lineTo(farFront.x, farFront.y);
    ctx.stroke();
    ctx.strokeStyle = '#763d2e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nearBottom.x, nearBottom.y);
    ctx.lineTo(farBottom.x, farBottom.y);
    ctx.stroke();

    for (const flash of this.effects.flashes.filter((candidate) => candidate.lane === lane)) {
      ctx.fillStyle = withAlpha(FEEDBACK.urgent, Math.max(0, 1 - flash.age / flash.ttl) * 0.4);
      this.polygon(ctx, [nearBack, farBack, farBottom, nearBottom]);
      ctx.fill();
    }
  }

  private drawDoors(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, lane: number): void {
    const point = this.layout.project(scenario.laneLength * FIXED_SCALE, this.layout.floorY(lane), 22);
    const scale = point.scale * this.layout.actorScale;
    const w = 29 * scale;
    const h = 64 * scale;
    const x = point.x - w / 2;
    const y = point.y - h;
    ctx.fillStyle = '#173e35';
    ctx.beginPath();
    ctx.roundRect(x - 4 * scale, y - 4 * scale, w + 8 * scale, h + 5 * scale, 4);
    ctx.fill();
    ctx.fillStyle = '#f6ddb0';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.fillStyle = '#bd9462';
    ctx.fillRect(x + 4 * scale, y + 5 * scale, w - 8 * scale, h * 0.62);
    ctx.fillStyle = '#725b42';
    ctx.beginPath();
    ctx.arc(point.x, y + 22 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(point.x - 7 * scale, y + 28 * scale, 14 * scale, 14 * scale, 4);
    ctx.fill();
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(x + w - 6 * scale, y + h * 0.7, 3 * scale, 7 * scale);
  }


  // ---- Actors ----------------------------------------------------------

  private drawCustomers(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState, lane: number): void {
    for (const customer of state.customers.filter((customer) => customer.lane === lane).sort((a, b) => b.x - a.x)) {
      const point = this.layout.project(customer.x, this.layout.floorY(lane));
      this.drawPerson(ctx, customer, point.x, point.y, state, scenario);
    }
  }

  private drawPerson(
    ctx: CanvasRenderingContext2D,
    customer: CustomerState,
    px: number,
    groundY: number,
    state: MaltlineState,
    scenario: MaltlineScenario,
  ): void {
    ctx.save();
    const actorScale = this.layout.actorScale * this.layout.project(customer.x, 0).scale;
    ctx.translate(px, groundY);
    ctx.scale(actorScale, actorScale);
    ctx.translate(-px, -groundY);
    const [shirt, shirtDark] = pick(SHIRTS, customer.id);
    const [hair, hairDark] = pick(HAIRS, customer.id * 3 + 1);
    const [skin, skinDark] = pick(SKINS, customer.id * 2 + 2);
    const walking = customer.phase === 'marching' && !this.reducedMotion;
    const stride = walking ? Math.sin((state.tick + customer.id * 7) / 4.5) : 0;
    const bob = walking ? Math.abs(Math.cos((state.tick + customer.id * 7) / 4.5)) * 2 : 0;
    const impatient = walking && customer.x < scenario.laneLength * FIXED_SCALE * 0.28;

    const cx = px;
    const footY = groundY;

    const bodyY = footY - 14 - bob;

    // Legs with stride.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 4, bodyY + 6);
    ctx.lineTo(cx - 4 + stride * 3.5, footY - 1);
    ctx.moveTo(cx + 4, bodyY + 6);
    ctx.lineTo(cx + 4 - stride * 3.5, footY - 1);
    ctx.stroke();

    // Body capsule in shirt gradient.
    const bodyGrad = ctx.createLinearGradient(cx - 10, bodyY - 20, cx + 10, bodyY + 8);
    bodyGrad.addColorStop(0, shirt);
    bodyGrad.addColorStop(1, shirtDark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(cx - 10, bodyY - 20, 20, 28, 9);
    ctx.fill();
    ctx.strokeStyle = CUSTOMER_ORDER.silhouetteKeyline;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Swinging arms.
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.moveTo(cx - 5, bodyY - 19);
    ctx.lineTo(cx, bodyY - 12);
    ctx.lineTo(cx + 5, bodyY - 19);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shirtDark;
    ctx.fillRect(cx + 3, bodyY - 8, 5, 5);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(cx - 9 + stride * 3.5, footY - 4, 10, 5, 2);
    ctx.roundRect(cx + 1 - stride * 3.5, footY - 4, 10, 5, 2);
    ctx.fill();

    // Swinging arms.
    ctx.strokeStyle = skinDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 9, bodyY - 14);
    ctx.lineTo(cx - 13 - stride * 2, bodyY - 3);
    ctx.moveTo(cx + 9, bodyY - 14);
    ctx.lineTo(cx + 13 + stride * 2, bodyY - 3);
    ctx.stroke();

    // Head.
    const headY = bodyY - 28;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(cx, headY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CUSTOMER_ORDER.silhouetteKeyline;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.arc(cx + 3, headY + 2, 8, 0.2, Math.PI - 0.4);
    ctx.fill();

    // Hair style variants.
    ctx.fillStyle = hair;
    const style = customer.id % 4;
    ctx.beginPath();
    if (style === 0) {
      ctx.arc(cx, headY - 2, 10.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
    } else if (style === 1) {
      ctx.moveTo(cx - 10, headY - 2);
      for (let spike = 0; spike <= 4; spike++) {
        const sx = cx - 10 + spike * 5;
        ctx.lineTo(sx + 2.5, headY - 14 - (spike % 2) * 3);
        ctx.lineTo(sx + 5, headY - 3);
      }
      ctx.closePath();
      ctx.fill();
    } else if (style === 2) {
      ctx.arc(cx - 1, headY - 3, 10.5, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - 9, headY + 2, 4, 7, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(cx, headY - 2, 10.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, headY - 12, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.ellipse(cx + 6, headY - 6, 5, 3, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Profile nose and eye whites read at arcade speed.
    ctx.fillStyle = skin;
    ctx.strokeStyle = CUSTOMER_ORDER.silhouetteKeyline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx - 9, headY + 1, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.ellipse(cx - 5, headY - 1, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 2, headY - 1, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face by mood. Everyone faces the counter (left).
    const eyeY = headY - 1;
    if (customer.phase === 'drinking') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx - 5, eyeY, 2.4, Math.PI * 0.15, Math.PI * 0.85);
      ctx.arc(cx + 2, eyeY, 2.4, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 1, eyeY + 6, 3, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else if (customer.phase === 'leaving') {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx - 5, eyeY, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 2, eyeY, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx - 1.5, eyeY + 5, 3, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx - 5, eyeY, 1.7, 0, Math.PI * 2);
      ctx.arc(cx + 2, eyeY, 1.7, 0, Math.PI * 2);
      ctx.fill();
      if (impatient) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - 7.5, eyeY - 4);
        ctx.lineTo(cx - 2.5, eyeY - 2.5);
        ctx.moveTo(cx + 4.5, eyeY - 2.5);
        ctx.lineTo(cx - 0.5, eyeY - 4);
        ctx.stroke();
        // Sweat drop.
        const sweat = this.reducedMotion ? 0.45 : ((state.tick + customer.id * 11) % 40) / 40;
        ctx.fillStyle = 'rgba(140, 200, 255, 0.85)';
        ctx.beginPath();
        ctx.ellipse(cx + 8, headY - 10 + sweat * 8, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx - 4, eyeY + 5.5);
        ctx.lineTo(cx + 1, eyeY + 5.5);
        ctx.stroke();
      }
    }

    if (customer.phase === 'drinking') {
      // Progress halo + cup at the lips.
      const progress = 1 - customer.timer / scenario.drinkTicks;
      ctx.strokeStyle = FLAVOR_ART[customer.flavor].base;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, headY, 15, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
      drawMaltlineCup(ctx, cx - 13, headY + 2, customer.flavor, 0.75, -0.5);
    } else if (customer.phase === 'leaving') {
      ctx.fillStyle = 'rgba(159, 196, 178, 0.95)';
      ctx.font = '13px system-ui, sans-serif';
      const hop = this.reducedMotion ? 0 : Math.sin((state.tick + customer.id * 5) / 5) * 2;
      ctx.fillText('♪', cx + 11, headY - 8 + hop);
    } else {
      // Order bubble.
      const sway = this.reducedMotion ? 0 : Math.sin((state.tick + customer.id * 13) / 30) * 2;
      const ticketY = headY - 4 + sway;
      this.drawOrderBubble(ctx, cx - 33, ticketY, customer.flavor);
      if (impatient) {
        ctx.strokeStyle = withAlpha(FEEDBACK.urgent, 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, headY, 14.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawOrderBubble(ctx: CanvasRenderingContext2D, x: number, y: number, flavor: FlavorId): void {
    ctx.save();
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = CUSTOMER_ORDER.ticketPanel;
    ctx.beginPath();
    ctx.roundRect(x - 20, y - 14, 40, 28, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = CUSTOMER_ORDER.ticketKeyline;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.roundRect(x - 20, y - 14, 40, 28, 8);
    ctx.stroke();
    ctx.strokeStyle = FLAVOR_ART[flavor].base;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x - 20, y - 14, 40, 28, 8);
    ctx.stroke();
    ctx.strokeStyle = CUSTOMER_ORDER.ticketConnector;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + 15);
    ctx.lineTo(x, y + 22);
    ctx.stroke();
    ctx.fillStyle = CUSTOMER_ORDER.ticketConnector;
    ctx.beginPath();
    ctx.arc(x, y + 22, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 12);
    ctx.lineTo(x + 4, y + 12);
    ctx.lineTo(x, y + 17);
    ctx.closePath();
    ctx.fillStyle = CUSTOMER_ORDER.ticketPanel;
    ctx.fill();
    ctx.strokeStyle = FLAVOR_ART[flavor].base;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    drawMaltlineFlavorSymbol(ctx, x, y + 1, flavor, 0.9);
    ctx.restore();
  }

  private drawVesselTrail(
    ctx: CanvasRenderingContext2D, fixedX: number, lane: number, direction: 1 | -1,
    color: string, edge: string, opacity: number,
  ): void {
    const unit = this.layout.scenario.laneLength * FIXED_SCALE / 100;
    const nearY = this.layout.vesselY(lane) - 10;
    const head = this.layout.project(fixedX - direction * 2 * unit, nearY);
    const tail = this.layout.project(fixedX - direction * 8 * unit, nearY);
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, withAlpha(color, 0));
    gradient.addColorStop(1, withAlpha(color, opacity));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 5 * head.scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    for (const offset of [4, 6]) {
      const point = this.layout.project(fixedX - direction * offset * unit, nearY);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.atan2(head.y - tail.y, head.x - tail.x));
      ctx.scale(point.scale, point.scale);
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(-3, -5);
      ctx.lineTo(-3, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSlides(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState, lane: number): void {
    for (const slide of state.slides.filter((slide) => slide.lane === lane)) {
      const point = this.layout.project(slide.x, this.layout.vesselY(lane));
      const px = point.x;
      const groundY = point.y;
      this.drawVesselTrail(ctx, slide.x, lane, 1, OUTGOING_SHAKE.trail, OUTGOING_SHAKE.edge, 0.72);
      const wobble = this.reducedMotion ? 0 : Math.sin((state.tick + slide.id * 5) / 3.2) * 0.1;
      const vesselScale = 1.35 * point.scale;
      drawMaltlineCup(ctx, px, groundY - 12 * vesselScale, slide.flavor, vesselScale, wobble, true);
    }
  }

  private drawJars(ctx: CanvasRenderingContext2D, state: MaltlineState, lane: number): void {
    for (const jar of state.jars.filter((jar) => jar.lane === lane)) {
      const projection = this.layout.projectReturningJar(jar.x, jar.lane);
      const px = projection.anchorX;
      const groundY = projection.groundY;
      if (projection.catchCue !== null) {
        const catchReady = jar.lane === state.player.lane;
        const { x: cueX, y: cueY, width: cueWidth, height: cueHeight } = projection.catchCue;
        ctx.fillStyle = withAlpha(RETURN_JAR.shadow, 0.92);
        ctx.beginPath();
        ctx.roundRect(cueX, cueY, cueWidth, cueHeight, 9);
        ctx.fill();
        ctx.strokeStyle = catchReady ? FEEDBACK.ready : RETURN_JAR.trail;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = catchReady ? FEEDBACK.ready : RETURN_JAR.edge;
        ctx.font = '800 10px "Maltline UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(catchReady ? '◀ CATCH' : `WINDOW ${jar.lane + 1}`, cueX + 35, cueY + 10);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      const pulse = this.reducedMotion ? 0.72 : 0.64 + Math.sin((state.tick + jar.id * 7) / 6) * 0.12;
      this.drawVesselTrail(ctx, jar.x, lane, -1, RETURN_JAR.trail, RETURN_JAR.edge, pulse);
      const vesselScale = 1.5 * projection.scale;
      drawMaltlineJar(ctx, px, groundY - 12 * vesselScale, vesselScale, true);
    }
  }

  private drawStationBank(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    presentationTimeMs: number,
  ): void {
    // Shop floor.
    const floor = ctx.createLinearGradient(0, BANK_TOP - 12, 0, CANVAS_H);
    floor.addColorStop(0, '#ffe5b2');
    floor.addColorStop(1, '#edbb77');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.roundRect(0, BANK_TOP - 12, CANVAS_W, CANVAS_H - BANK_TOP + 12, 14);
    ctx.fill();

    // Checker tiles and a coral cabinet keep the workbench part of the shop.
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 25; column++) {
        if ((row + column) % 2 === 0) {
          ctx.fillStyle = '#e2af75';
          ctx.fillRect(column * 40, BANK_TOP - 12 + row * 40, 40, 40);
        }
      }
    }
    ctx.fillStyle = '#dc654b';
    ctx.fillRect(COUNTER_X - 40, MACHINE_BASELINE + 9, DOOR_X - COUNTER_X + 54, 58);
    ctx.strokeStyle = '#a94333';
    ctx.lineWidth = 2;
    for (let x = COUNTER_X - 20; x < DOOR_X; x += 110) {
      ctx.strokeRect(x, MACHINE_BASELINE + 18, 90, 37);
    }

    // Steel worktop with reflections.
    const steel = ctx.createLinearGradient(0, MACHINE_BASELINE - 6, 0, MACHINE_BASELINE + 12);
    steel.addColorStop(0, '#e7eeeb');
    steel.addColorStop(0.4, '#b7c6c1');
    steel.addColorStop(1, '#7e918a');
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.roundRect(COUNTER_X - 44, MACHINE_BASELINE - 6, DOOR_X - COUNTER_X + 62, 16, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(COUNTER_X - 40, MACHINE_BASELINE - 5, DOOR_X - COUNTER_X + 54, 2.5);

    this.drawFlavorKey(ctx, scenario);
    const action = deriveMaltlineStationActionPresentation(scenario, state);
    this.drawActionStatus(ctx, action);

    let processingStation = -1;
    if (action.mode === 'blending' && action.processingFlavor !== null) {
      const matches = scenario.stations.flatMap((flavor, index) =>
        flavor === action.processingFlavor ? [index] : []);
      if (matches.length !== 1) {
        throw new Error('Maltline presentation needs one station for the processing flavor.');
      }
      processingStation = matches[0]!;
    }

    for (let index = 0; index < scenario.stations.length; index++) {
      const flavor = scenario.stations[index]!;
      this.drawMachine(
        ctx,
        this.layout.stations[index]!,
        flavor,
        scenario,
        state,
        index === action.selectedStation.index,
        index === processingStation,
        action.mode === 'blocked-no-jars',
      );
    }

    this.drawJarGauge(ctx, scenario, state, presentationTimeMs);
  }

  private drawFlavorKey(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    const flavors = [...new Set(scenario.stations)];
    const x = 10;
    const y = 388;
    const width = 98;
    const height = 25 + flavors.length * 22;
    ctx.fillStyle = 'rgba(8, 32, 24, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 169, 97, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(159, 196, 178, 0.9)';
    ctx.font = '700 8px "Maltline UI", system-ui, sans-serif';
    ctx.fillText('FLAVOR KEY', x + 9, y + 14);
    for (const [index, flavor] of flavors.entries()) {
      const rowY = y + 29 + index * 22;
      drawMaltlineFlavorSymbol(ctx, x + 17, rowY - 1, flavor, 0.63);
      ctx.fillStyle = CREAM;
      ctx.font = '700 8px "Maltline UI", system-ui, sans-serif';
      ctx.fillText(FLAVOR_LABELS[flavor].toUpperCase(), x + 32, rowY + 2);
    }
  }

  private drawActionStatus(
    ctx: CanvasRenderingContext2D,
    presentation: MaltlineStationActionPresentation,
  ): void {
    const color = presentation.tone === 'selected-flavor'
      ? STATION.selectedKeyline
      : presentation.tone === 'ready'
        ? STATION.ready
        : presentation.tone === 'blending'
          ? STATION.processing
          : STATION.blocked;

    const { x, y, width, height } = MALTLINE_RENDERER_FRAME.actionStatus;
    ctx.fillStyle = STATION.statusPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 15);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    const {
      x: badgeX,
      y: badgeY,
      width: badgeWidth,
      height: badgeHeight,
    } = MALTLINE_RENDERER_FRAME.actionBadge;
    ctx.fillStyle = presentation.mode === 'holding' ? color : STATION.selectedTab;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = presentation.mode === 'holding' ? INK : color;
    ctx.font = '800 13px "Maltline UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (presentation.mode === 'blocked-no-jars') {
      ctx.fillText('0', badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);
    } else {
      drawMaltlineFlavorSymbol(ctx, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2,
        presentation.actionFlavor, 0.58);
    }

    ctx.fillStyle = STATION.statusText;
    ctx.font = '800 13px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(presentation.canvasText, x + 32 + (width - 36) / 2, y + height / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawMachine(
    ctx: CanvasRenderingContext2D,
    layout: MaltlineStationLayout,
    flavor: FlavorId,
    scenario: MaltlineScenario,
    state: MaltlineState,
    selected: boolean,
    processing: boolean,
    blocked: boolean,
  ): void {
    const art = FLAVOR_ART[flavor];
    const { centerX: cx, machine } = layout;
    const { x, y, width: mw, height: mh } = machine;
    const baseline = y + mh;
    const progress = processing
      ? Math.max(0, Math.min(1, state.player.blendProgress / scenario.blendTicks))
      : 0;

    if (selected || processing) {
      // Soft selection halo.
      const halo = ctx.createRadialGradient(cx, y + mh / 2, 20, cx, y + mh / 2, 90);
      halo.addColorStop(0, processing
        ? 'rgba(255, 215, 107, 0.15)'
        : 'rgba(243, 233, 210, 0.10)');
      halo.addColorStop(1, processing
        ? 'rgba(255, 215, 107, 0)'
        : 'rgba(243, 233, 210, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, y + mh / 2, 90, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;

    // Base cabinet.
    const cabinet = ctx.createLinearGradient(x, 0, x + mw, 0);
    cabinet.addColorStop(0, '#0f4434');
    cabinet.addColorStop(0.5, '#1c6a50');
    cabinet.addColorStop(1, '#0f4434');
    ctx.fillStyle = cabinet;
    ctx.beginPath();
    ctx.roundRect(x, y + 26, mw, mh - 26, 9);
    ctx.fill();
    ctx.restore();
    if (selected) {
      const selectionColor = blocked ? STATION.blocked : STATION.selectedKeyline;
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(
        layout.selectionFrame.x,
        layout.selectionFrame.y,
        layout.selectionFrame.width,
        layout.selectionFrame.height,
        11,
      );
      ctx.stroke();

      // The selected ingredient silhouette remains readable without motion.
      const {
        x: tabX,
        y: tabY,
        width: tabW,
        height: tabH,
      } = layout.selectionTab;
      ctx.fillStyle = STATION.selectedTab;
      ctx.beginPath();
      ctx.roundRect(tabX, tabY, tabW, tabH, 7);
      ctx.fill();
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = selectionColor;
      ctx.beginPath();
      ctx.moveTo(tabX + tabW / 2, tabY + 8);
      ctx.lineTo(tabX + tabW / 2 - 5, tabY + 3);
      ctx.lineTo(tabX + tabW / 2 + 5, tabY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.font = '800 16px "Maltline UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawMaltlineFlavorSymbol(ctx, tabX + tabW / 2, tabY + 22, flavor, 0.65);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    if (processing) {
      ctx.strokeStyle = STATION.processing;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(
        layout.processingFrame.x,
        layout.processingFrame.y,
        layout.processingFrame.width,
        layout.processingFrame.height,
        8,
      );
      ctx.stroke();
    }

    // Glass hopper with liquid.
    const hopperX = x + 10;
    const hopperW = mw - 20;
    const hopperY = y + 6;
    const hopperH = 34;
    ctx.fillStyle = 'rgba(220, 235, 230, 0.28)';
    ctx.beginPath();
    ctx.roundRect(hopperX, hopperY, hopperW, hopperH, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 248, 245, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const liquidH = (hopperH - 8) * (processing ? 0.25 + 0.75 * progress : 0.9);
    const liquid = ctx.createLinearGradient(0, hopperY + hopperH - liquidH, 0, hopperY + hopperH);
    liquid.addColorStop(0, art.light);
    liquid.addColorStop(1, art.dark);
    ctx.fillStyle = liquid;
    ctx.beginPath();
    ctx.roundRect(hopperX + 3, hopperY + hopperH - liquidH - 3, hopperW - 6, liquidH, 5);
    ctx.fill();
    if (processing) {
      // Swirl surface.
      ctx.strokeStyle = withAlpha(art.light, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const sx = hopperX + 4 + (i / 12) * (hopperW - 8);
        const motionTick = this.reducedMotion ? 0 : state.tick;
        const sy = hopperY + hopperH - liquidH - 3 + Math.sin(i / 2 + motionTick / 3) * 2;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // One large ingredient emblem matches the order tickets and selected tab.
    ctx.fillStyle = STATION.statusPanel;
    ctx.beginPath();
    ctx.roundRect(cx - 18, y + 44, 36, 30, 7);
    ctx.fill();
    drawMaltlineFlavorSymbol(ctx, cx, y + 59, flavor, 0.9);

    if (processing) {
      // The tall meter shows exact progress; fixed bands preserve scale without
      // rounding the fill into coarse, overstated steps.
      const {
        x: meterX,
        y: meterY,
        width: meterW,
        height: meterH,
      } = layout.processingMeter;
      const innerX = meterX + 3;
      const innerY = meterY + 4;
      const innerW = meterW - 6;
      const innerH = meterH - 8;
      ctx.fillStyle = STATION.progressTrack;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, meterW, meterH, 6);
      ctx.fill();
      ctx.strokeStyle = STATION.processing;
      ctx.lineWidth = 2;
      ctx.stroke();

      const fillH = innerH * progress;
      ctx.fillStyle = STATION.processing;
      ctx.fillRect(innerX, innerY + innerH - fillH, innerW, fillH);

      // Four fixed divider marks communicate fifths in monochrome while the
      // continuous fill remains the source of progress truth.
      ctx.strokeStyle = STATION.statusText;
      ctx.lineWidth = 1;
      for (let band = 1; band < 5; band++) {
        const bandY = innerY + innerH * band / 5;
        ctx.beginPath();
        ctx.moveTo(innerX, bandY);
        ctx.lineTo(innerX + innerW, bandY);
        ctx.stroke();
      }
    }

    // Station lamps communicate selection/processing/blocked without green.
    const indicatorX = cx - 8;
    const indicatorY = y + mh - 10;
    const indicatorColor = processing
      ? STATION.processing
      : selected && blocked
        ? STATION.blocked
        : selected
          ? STATION.selectedKeyline
          : STATION.quietIndicator;
    ctx.globalAlpha = selected || processing ? 1 : 0.22;
    ctx.strokeStyle = indicatorColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(indicatorX - 3, indicatorY - 3, 6, 6, 1.5);
    ctx.stroke();
    if (selected && blocked) {
      ctx.beginPath();
      ctx.moveTo(indicatorX - 4, indicatorY + 4);
      ctx.lineTo(indicatorX + 4, indicatorY - 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Brass spout over the drip tray.
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.roundRect(cx - 3, y + mh - 22, 6, 8, 2);
    ctx.fill();

    if (processing) {
      // Streaming into a filling cup + steam.
      const cupTop = baseline - 4 - 26;
      ctx.strokeStyle = art.base;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(cx, y + mh - 14);
      ctx.lineTo(cx, baseline - 10 - progress * 12);
      ctx.stroke();
      const fillProgress = Math.max(0, progress * 1.15 - 0.15);
      ctx.save();
      ctx.translate(cx, baseline - 4);
      const body = ctx.createLinearGradient(-7, 0, 7, 0);
      body.addColorStop(0, CREAM_DIM);
      body.addColorStop(0.4, '#fdf6e4');
      body.addColorStop(1, CREAM_DIM);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-7, -13);
      ctx.lineTo(7, -13);
      ctx.lineTo(5, 13);
      ctx.lineTo(-5, 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha(art.base, 0.95);
      ctx.beginPath();
      ctx.moveTo(-6.4 + (1 - fillProgress) * 0.6, -12 + (1 - fillProgress) * 22);
      ctx.lineTo(6.4 - (1 - fillProgress) * 0.6, -12 + (1 - fillProgress) * 22);
      ctx.lineTo(5, 13);
      ctx.lineTo(-5, 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      for (let b = 0; b < 3; b++) {
        const phase = this.reducedMotion ? (b + 1) / 4 : ((state.tick + b * 9) % 30) / 30;
        ctx.fillStyle = `${STEAM} ${(1 - phase) * 0.5})`;
        ctx.beginPath();
        const drift = this.reducedMotion ? 0 : Math.sin(state.tick / 5 + b) * 3;
        ctx.arc(cx - 12 + b * 12 + drift, y + 8 - phase * 22, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawJarGauge(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    presentationTimeMs: number,
  ): void {
    const jw = 17;
    const gap = 4;
    const { x, y, width: w, height } = this.layout.jarGauge;
    const washingCount = state.washing.length;
    const inPlayCount = Math.max(0, scenario.jarPoolSize - state.jarsAvailable - washingCount);
    ctx.fillStyle = 'rgba(7, 26, 20, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, height, 9);
    ctx.fill();
    ctx.strokeStyle = state.jarsAvailable === 0 ? FEEDBACK.blocked : 'rgba(243, 233, 210, 0.3)';
    ctx.lineWidth = state.jarsAvailable === 0 ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = state.jarsAvailable === 0 ? FEEDBACK.blocked : CREAM;
    ctx.font = '800 12px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(`CLEAN ${state.jarsAvailable}`, x + 10, y + 15);
    ctx.fillStyle = CREAM_DIM;
    ctx.font = '700 10px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(`WASH ${washingCount} · IN PLAY ${inPlayCount}`, x + 85, y + 15);
    for (let i = 0; i < scenario.jarPoolSize; i++) {
      const filled = i < state.jarsAvailable;
      const washing = i >= state.jarsAvailable && i < state.jarsAvailable + state.washing.length;
      const washPulse = this.reducedMotion ? 0.58 : 0.58 + Math.sin(i + presentationTimeMs / 300) * 0.14;
      ctx.globalAlpha = filled ? 1 : washing ? washPulse : 0.18;
      const jarX = x + 11 + i * (jw + gap) + jw / 2;
      drawMaltlineJar(ctx, jarX, y + 37, 0.85);
      if (washing) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = FEEDBACK.washing;
        ctx.font = '800 8px "Maltline UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('W', jarX, y + 52);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    if (state.jarsAvailable === 0) {
      ctx.fillStyle = FEEDBACK.blocked;
      ctx.font = '800 9px "Maltline UI", system-ui, sans-serif';
      ctx.fillText('CATCH A RETURN', x + 137, y + 39);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const point = this.layout.project(state.player.x, this.layout.floorY(state.player.lane) + 6, -37);
    const px = point.x;
    const groundY = point.y;
    ctx.save();
    const actorScale = this.layout.actorScale * point.scale;
    ctx.translate(px, groundY);
    ctx.scale(actorScale, actorScale);
    ctx.translate(-px, -groundY);
    const running = state.currentInput.serve && state.currentInput.stationDir !== 0;
    const stride = running && !this.reducedMotion ? Math.sin(state.tick / 2.2) : 0;
    const breathing = this.reducedMotion ? 0 : running
      ? Math.abs(Math.cos(state.tick / 2.2)) * 2
      : Math.sin(state.tick / 18);
    const working = state.player.blending !== null;
    const hasCup = working || state.player.holding !== null;
    const bodyY = groundY - 14 + (working ? 0 : breathing);
    const leverMotion = working && !this.reducedMotion ? Math.sin(state.tick / 2.4) * 3 : 0;

    ctx.fillStyle = 'rgba(4, 12, 9, 0.4)';
    ctx.beginPath();
    ctx.ellipse(px, groundY + 3, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - 4, bodyY + 6);
    ctx.lineTo(px - 5 + stride * 6, groundY - 1);
    ctx.moveTo(px + 4, bodyY + 6);
    ctx.lineTo(px + 5 - stride * 6, groundY - 1);
    ctx.stroke();

    // Green shirt.
    const shirt = ctx.createLinearGradient(px - 10, bodyY - 20, px + 10, bodyY + 8);
    shirt.addColorStop(0, '#ef6756');
    shirt.addColorStop(1, '#b63d38');
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.roundRect(px - 10, bodyY - 20, 20, 28, 9);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cream apron with a tiny mark.
    ctx.fillStyle = '#f3e9d2';
    ctx.beginPath();
    ctx.roundRect(px - 6.5, bodyY - 10, 13, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#fdf2cf';
    ctx.beginPath();
    ctx.arc(px, bodyY + 1, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // While pouring the left hand supports the cup and the right pulls the tap.
    ctx.strokeStyle = '#caa27a';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(px - 9, bodyY - 13);
    ctx.lineTo(px - 13, bodyY - 2);
    if (hasCup) ctx.lineTo(px + 20, bodyY + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + 9, bodyY - 13);
    if (working) {
      ctx.lineTo(px + 17, bodyY - 25);
      ctx.lineTo(px + 40, bodyY - 38 + leverMotion);
    } else if (state.player.holding !== null) {
      ctx.lineTo(px + 20, bodyY + 4);
    } else {
      ctx.lineTo(px + 12, bodyY - 1);
    }
    ctx.stroke();

    // Head with a relaxed smile.
    const headY = bodyY - 28;
    ctx.fillStyle = '#e9c39b';
    ctx.beginPath();
    ctx.arc(px, headY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(px - 4, headY - 1, 1.7, 0, Math.PI * 2);
    ctx.arc(px + 3, headY - 1, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px, headY + 3.5, 3, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    // Cream soda-jerk cap with a coral band.
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath();
    ctx.arc(px, headY - 3, 10.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = '#e46150';
    ctx.beginPath();
    ctx.roundRect(px - 10, headY - 5, 22, 4.5, 2.5);
    ctx.fill();

    if (state.player.blending !== null) {
      const flavor = state.player.blending;
      const progress = Math.min(1, Math.max(0, state.player.blendProgress / scenario.blendTicks));
      const phase = this.reducedMotion ? null : (state.tick % 18) / 18;
      const cupX = px + 27;
      const cupY = bodyY - 3;
      // Compact chrome tap at the service end, physically connected to the cup.
      ctx.strokeStyle = '#13342d';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(px + 49, bodyY + 5);
      ctx.lineTo(px + 49, bodyY - 34);
      ctx.lineTo(cupX, bodyY - 34);
      ctx.lineTo(cupX, bodyY - 29);
      ctx.stroke();
      ctx.strokeStyle = '#ddebdc';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffe1a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 45, bodyY - 33);
      ctx.lineTo(px + 40, bodyY - 38 + leverMotion);
      ctx.stroke();
      ctx.fillStyle = FLAVOR_ART[flavor].base;
      ctx.beginPath();
      ctx.arc(px + 40, bodyY - 38 + leverMotion, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // A continuous stream is visible even with reduced motion enabled.
      ctx.strokeStyle = FLAVOR_ART[flavor].light;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cupX, bodyY - 28);
      ctx.lineTo(cupX, cupY - 20);
      ctx.stroke();
      drawMaltlinePouringCup(ctx, cupX, cupY, flavor, progress, 1.15, phase);
      if (!this.reducedMotion) {
        ctx.fillStyle = FLAVOR_ART[flavor].light;
        for (let drop = 0; drop < 2; drop++) {
          const flight = ((state.tick + drop * 5) % 12) / 12;
          ctx.beginPath();
          ctx.arc(cupX + (drop === 0 ? -1 : 1) * (4 + flight * 8),
            cupY - 22 - Math.sin(flight * Math.PI) * 5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Fingers wrap the vessel, making the cup belong visibly to the player.
      ctx.strokeStyle = '#edc397';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cupX - 12, cupY + 9);
      ctx.lineTo(cupX - 7, cupY + 10);
      ctx.stroke();
    } else if (state.player.holding !== null) {
      ctx.fillStyle = STATION.statusPanel;
      ctx.beginPath();
      ctx.roundRect(px + 12, bodyY - 46, 31, 64, 9);
      ctx.fill();
      ctx.strokeStyle = STATION.ready;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawMaltlineCup(ctx, px + 27, bodyY - 3, state.player.holding, 1.45);
      ctx.strokeStyle = '#edc397';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px + 15, bodyY + 6);
      ctx.lineTo(px + 20, bodyY + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFlavorSelector(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const home = this.layout.project(0, this.layout.floorY(state.player.lane) + 6, -37);
    const scale = this.layout.actorScale;
    ctx.save();
    ctx.translate(home.x, home.y);
    ctx.scale(scale, scale);
    const x = 66;
    const y = -54;
    ctx.fillStyle = 'rgba(12,40,32,0.94)';
    ctx.beginPath();
    ctx.roundRect(x - 17, y - 23, scenario.stations.length * 30 + 8, 43, 7);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = '800 7px "Maltline UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(scenario.stations.length > 1 ? 'A / D  FLAVOR' : 'FLAVOR', x - 10, y - 14);
    for (const [index, flavor] of scenario.stations.entries()) {
      const selected = index === state.player.station;
      const cx = x + index * 30;
      ctx.fillStyle = selected ? '#315e43' : '#153b32';
      ctx.beginPath();
      ctx.roundRect(cx - 12, y - 9, 25, 27, 5);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = '#ffe39a';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#ffe39a';
        ctx.beginPath();
        ctx.moveTo(cx - 3, y + 21);
        ctx.lineTo(cx + 4, y + 21);
        ctx.lineTo(cx + 0.5, y + 17);
        ctx.closePath();
        ctx.fill();
      }
      drawMaltlineFlavorSymbol(ctx, cx, y + 5, flavor, 0.68);
    }
    ctx.restore();
  }

  // ---- FX and HUD ------------------------------------------------------

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.effects.particles) {
      const alpha = Math.max(0, 1 - particle.age / particle.ttl);
      ctx.fillStyle = withAlpha(particle.color, alpha * 0.95);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    for (const popup of this.effects.popups) {
      const alpha = Math.max(0, 1 - popup.age / popup.ttl);
      const scale = 1 + Math.min(popup.age / 120, 1) * 0.25;
      ctx.save();
      ctx.translate(popup.x, popup.y);
      ctx.scale(scale, scale);
      ctx.font = '800 15px "Maltline UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(7, 26, 20, 0.8)';
      ctx.fillText(popup.text, 1, 1);
      ctx.fillStyle = withAlpha(popup.color, alpha);
      ctx.fillText(popup.text, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  private drawFailureCallouts(ctx: CanvasRenderingContext2D): void {
    for (const callout of this.effects.failureCallouts) {
      const fadeIn = Math.min(1, callout.age / 90);
      const fadeOut = Math.min(1, (callout.ttl - callout.age) / 280);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const x = COUNTER_X + 18;
      const y = this.laneCenterY(callout.lane) - 19;
      const width = 330;
      const height = 38;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(5, 15, 11, 0.92)';
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 9);
      ctx.fill();
      ctx.strokeStyle = callout.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = callout.color;
      ctx.font = '800 14px "Maltline UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(callout.text, x + width / 2, y + height / 2 + 1);
      ctx.restore();
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const vignette = ctx.createRadialGradient(
      CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.42,
      CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.06)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  private drawHud(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    meta: DrawMeta,
  ): void {
    const bar = ctx.createLinearGradient(0, 0, 0, HUD_H);
    bar.addColorStop(0, 'rgba(5, 15, 11, 0.97)');
    bar.addColorStop(1, 'rgba(5, 15, 11, 0.82)');
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.fillStyle = 'rgba(243, 233, 210, 0.14)';
    ctx.fillRect(0, HUD_H - 1.5, CANVAS_W, 1.5);

    ctx.textBaseline = 'middle';
    // Score block.
    ctx.fillStyle = CREAM;
    ctx.font = '800 24px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(String(state.score).padStart(6, '0'), 18, HUD_H / 2 + 1);
    const chainText = activeChainText(state.streak);
    if (chainText !== null) {
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(state.tick / 5) * 0.04;
      ctx.save();
      ctx.translate(126, HUD_H / 2);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255, 215, 107, 0.16)';
      ctx.beginPath();
      ctx.roundRect(-8, -11, 92, 22, 11);
      ctx.fill();
      ctx.fillStyle = FEEDBACK.blending;
      ctx.font = '700 11px "Maltline UI", system-ui, sans-serif';
      ctx.fillText(chainText, 0, 1);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159, 196, 178, 0.95)';
    ctx.font = '700 11px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(
      `STAGE ${meta.stageIndex + 1}/${meta.stageCount} · ${scenario.name.toUpperCase()}`,
      CANVAS_W / 2,
      HUD_H / 2 + 1,
    );
    ctx.textAlign = 'left';

    // Queue counter chip.
    const remaining = Math.max(0, scenario.customerCount - state.resolved);
    const ordersChip = MALTLINE_RENDERER_FRAME.hudOrders;
    ctx.fillStyle = 'rgba(159, 196, 178, 0.14)';
    ctx.beginPath();
    ctx.roundRect(ordersChip.x, ordersChip.y, ordersChip.width, ordersChip.height, 12);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = '700 12px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(
      `ORDERS LEFT ${remaining}`,
      ordersChip.x + 10,
      ordersChip.y + ordersChip.height / 2 + 1,
    );

    // Numeric role label is primary; the shake is a subdued cabinet motif.
    const livesChip = MALTLINE_RENDERER_FRAME.hudLives;
    ctx.fillStyle = 'rgba(159, 196, 178, 0.14)';
    ctx.beginPath();
    ctx.roundRect(livesChip.x, livesChip.y, livesChip.width, livesChip.height, 12);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = '800 13px "Maltline UI", system-ui, sans-serif';
    ctx.fillText(
      `LIVES ${state.lives}`,
      livesChip.x + 10,
      livesChip.y + livesChip.height / 2 + 1,
    );
    if (state.lives > 0) {
      ctx.save();
      ctx.globalAlpha = 0.62;
      drawMaltlineCup(
        ctx,
        livesChip.x + livesChip.width - 16,
        livesChip.y + livesChip.height / 2 + 3,
        'strawberry',
        0.58,
      );
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  drawMaltlineSoftServe,
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
  wallBottom: WALL_BOTTOM,
  wood: WOOD,
  woodLight: WOOD_LIGHT,
  woodDark: WOOD_DARK,
  cream: CREAM,
  creamDim: CREAM_DIM,
  brass: BRASS,
  brassDark: BRASS_DARK,
  ink: INK,
  steamPrefix: STEAM,
} = MALTLINE_VISUAL_THEME.scene;
const FLAVOR_CUES = MALTLINE_VISUAL_THEME.flavorCues;
const FLAVOR_ART = MALTLINE_VISUAL_THEME.flavors;
const FEEDBACK = MALTLINE_VISUAL_THEME.feedback;
const RETURN_JAR = MALTLINE_VISUAL_THEME.returnJar;
const CUSTOMER_ORDER = MALTLINE_VISUAL_THEME.customerOrder;
const OUTGOING_SHAKE = MALTLINE_VISUAL_THEME.outgoingShake;
const STATION = MALTLINE_VISUAL_THEME.station;

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
  private motes = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 373 % CANVAS_W),
    y: 80 + (i * 197 % 240),
    phase: (i * 0.7) % (Math.PI * 2),
    speed: 0.3 + (i % 5) * 0.12,
  }));

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

  private lanePx(x: number): number {
    return this.layout.lanePx(x);
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
    const presentationTimeMs = this.nowMs();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    const shakeTranslation = this.effects.shakeTranslation();
    if (shakeTranslation !== null) {
      ctx.translate(shakeTranslation.x, shakeTranslation.y);
    }

    this.drawWall(ctx, state);
    this.drawAwning(ctx);
    this.drawControlRail(ctx, scenario, state);
    this.drawLamps(ctx, scenario);
    this.drawCounters(ctx, scenario, state);
    this.drawDoors(ctx, scenario);
    this.drawMotes(ctx, state);
    this.drawCustomers(ctx, scenario, state);
    this.drawSlides(ctx, scenario, state);
    this.drawJars(ctx, state);
    this.drawStationBank(ctx, scenario, state, presentationTimeMs);
    this.drawPlayer(ctx, scenario, state);
    this.drawParticles(ctx);
    this.drawPopups(ctx);
    this.drawVignette(ctx);

    ctx.restore();
    this.drawFailureCallouts(ctx);
    this.drawHud(ctx, scenario, state, meta);
  }

  // ---- Scene -----------------------------------------------------------

  private drawWall(ctx: CanvasRenderingContext2D, state: MaltlineState): void {
    const wall = ctx.createLinearGradient(0, HUD_H, 0, BANK_TOP);
    wall.addColorStop(0, WALL_TOP);
    wall.addColorStop(1, WALL_BOTTOM);
    ctx.fillStyle = wall;
    ctx.fillRect(0, HUD_H, CANVAS_W, BANK_TOP - HUD_H);

    // Subtle diagonal tile texture.
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 1;
    for (let y = HUD_H + 24; y < BANK_TOP; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y - 14);
      ctx.stroke();
    }
    ctx.restore();

    // Warm pool of room light from above.
    const glow = ctx.createRadialGradient(CANVAS_W / 2, HUD_H + 40, 40, CANVAS_W / 2, HUD_H + 40, 520);
    glow.addColorStop(0, 'rgba(255, 215, 107, 0.10)');
    glow.addColorStop(1, 'rgba(255, 215, 107, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, HUD_H, CANVAS_W, BANK_TOP - HUD_H);
  }

  private drawAwning(ctx: CanvasRenderingContext2D): void {
    const y = HUD_H;
    const scallop = 48;
    for (let x = 0; x < CANVAS_W + scallop; x += scallop) {
      const stripe = ctx.createLinearGradient(0, y, 0, y + AWNING_H);
      if ((x / scallop) % 2 === 0) {
        stripe.addColorStop(0, '#1c6a50');
        stripe.addColorStop(1, '#12503e');
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

  private drawLamps(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const cx = COUNTER_X + (DOOR_X - COUNTER_X) * 0.45;
      const y = this.layout.laneTop(lane);
      const top = HUD_H + AWNING_H;

      // Light cone behind everything in the lane.
      const cone = ctx.createLinearGradient(0, top, 0, this.layout.laneBottom(lane));
      cone.addColorStop(0, 'rgba(255, 215, 107, 0.13)');
      cone.addColorStop(1, 'rgba(255, 215, 107, 0.02)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(cx - 12, top);
      ctx.lineTo(cx + 12, top);
      ctx.lineTo(cx + 90, this.layout.laneBottom(lane));
      ctx.lineTo(cx - 90, this.layout.laneBottom(lane));
      ctx.closePath();
      ctx.fill();

      // Cord and brass dome shade.
      ctx.strokeStyle = 'rgba(217, 200, 166, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, top + 26);
      ctx.stroke();
      const flicker = 0.9 + Math.sin(lane * 2.1) * 0.05;
      const dome = ctx.createLinearGradient(cx - 22, 0, cx + 22, 0);
      dome.addColorStop(0, BRASS_DARK);
      dome.addColorStop(0.5, BRASS);
      dome.addColorStop(1, BRASS_DARK);
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.arc(cx, top + 34, 20, Math.PI, 0);
      ctx.lineTo(cx + 22, top + 40);
      ctx.lineTo(cx - 22, top + 40);
      ctx.closePath();
      ctx.fill();

      const bulbGlow = ctx.createRadialGradient(cx, top + 44, 2, cx, top + 44, 46);
      bulbGlow.addColorStop(0, `rgba(255, 224, 130, ${0.85 * flicker})`);
      bulbGlow.addColorStop(0.35, `rgba(255, 215, 107, ${0.28 * flicker})`);
      bulbGlow.addColorStop(1, 'rgba(255, 215, 107, 0)');
      ctx.fillStyle = bulbGlow;
      ctx.beginPath();
      ctx.arc(cx, top + 44, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(cx, top + 44, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCounters(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = this.layout.laneTop(lane);
      const h = this.layout.laneHeight - 24;
      const active = lane === state.player.lane;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 7;
      const wood = ctx.createLinearGradient(0, y + 8, 0, y + 8 + h);
      wood.addColorStop(0, WOOD_LIGHT);
      wood.addColorStop(0.28, WOOD);
      wood.addColorStop(1, WOOD_DARK);
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 14, y + 8, DOOR_X - COUNTER_X + 12, h, 10);
      ctx.fill();
      ctx.restore();

      // Wood grain streaks.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const gy = y + 22 + i * (h - 30) / 2.4;
        ctx.beginPath();
        ctx.moveTo(COUNTER_X + 8, gy);
        ctx.bezierCurveTo(COUNTER_X + 260, gy - 4, DOOR_X - 280, gy + 5, DOOR_X - 6, gy - 2);
        ctx.stroke();
      }
      ctx.restore();

      // Glossy top edge catching the lamps.
      const gloss = ctx.createLinearGradient(0, y + 8, 0, y + 22);
      gloss.addColorStop(0, 'rgba(255, 248, 234, 0.35)');
      gloss.addColorStop(1, 'rgba(255, 248, 234, 0)');
      ctx.fillStyle = gloss;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 14, y + 8, DOOR_X - COUNTER_X + 12, 14, [10, 10, 0, 0]);
      ctx.fill();

      // Service lip on the player's side.
      ctx.fillStyle = active ? CREAM : CREAM_DIM;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 26, y + 14, 12, h - 12, 5);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = 'rgba(255, 248, 234, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(COUNTER_X - 26, y + 14, 12, h - 12, 5);
        ctx.stroke();

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 248, 234, 0.72)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.roundRect(COUNTER_X - 14, y + 8, DOOR_X - COUNTER_X + 12, h, 10);
        ctx.stroke();
        ctx.restore();
      }

      for (const flash of this.effects.flashes.filter((candidate) => candidate.lane === lane)) {
        const alpha = Math.max(0, 1 - flash.age / flash.ttl) * 0.4;
        ctx.fillStyle = withAlpha(FEEDBACK.urgent, alpha);
        ctx.beginPath();
        ctx.roundRect(COUNTER_X - 14, y + 8, DOOR_X - COUNTER_X + 12, h, 10);
        ctx.fill();
      }
    }
  }

  private drawDoors(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = this.layout.laneTop(lane);
      const w = 42;
      const h = Math.min(66, this.layout.laneHeight - 18);
      const x = DOOR_X - 4;

      // Warm interior spilling out.
      const spill = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, 70);
      spill.addColorStop(0, 'rgba(255, 215, 107, 0.22)');
      spill.addColorStop(1, 'rgba(255, 215, 107, 0)');
      ctx.fillStyle = spill;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#f3e9d2';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 7);
      ctx.fill();
      ctx.restore();

      const glass = ctx.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, '#ffe9b8');
      glass.addColorStop(0.5, '#f7d089');
      glass.addColorStop(1, '#e8b95f');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.roundRect(x + 5, y + 5, w - 10, h - 10, 5);
      ctx.fill();

      // Silhouettes of the queue outside.
      ctx.fillStyle = 'rgba(90, 60, 30, 0.35)';
      ctx.beginPath();
      ctx.arc(x + 13, y + h * 0.42, 5, 0, Math.PI * 2);
      ctx.arc(x + 26, y + h * 0.48, 5, 0, Math.PI * 2);
      ctx.fill();

      // Brass handle.
      ctx.fillStyle = BRASS;
      ctx.beginPath();
      ctx.roundRect(x + w - 12, y + h / 2 - 8, 4, 16, 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(159, 196, 178, 0.9)';
    ctx.font = '600 10px "Maltline UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('QUEUE →', DOOR_X - 10, LANES_TOP - 10);
    ctx.textAlign = 'left';
  }

  private drawMotes(ctx: CanvasRenderingContext2D, state: MaltlineState): void {
    ctx.save();
    for (const mote of this.motes) {
      const t = (this.reducedMotion ? 0 : state.tick / 60) + mote.phase;
      const x = mote.x + Math.sin(t * mote.speed) * 14;
      const y = mote.y + Math.cos(t * mote.speed * 0.8) * 10;
      const alpha = 0.06 + 0.05 * Math.sin(t * 2);
      ctx.fillStyle = `rgba(255, 232, 170, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Actors ----------------------------------------------------------

  private drawCustomers(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const customer of state.customers) {
      const px = this.lanePx(customer.x);
      const groundY = this.layout.laneBottom(customer.lane) - 18;
      this.drawPerson(ctx, customer, px, groundY, state, scenario);
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
    const [shirt, shirtDark] = pick(SHIRTS, customer.id);
    const [hair, hairDark] = pick(HAIRS, customer.id * 3 + 1);
    const [skin, skinDark] = pick(SKINS, customer.id * 2 + 2);
    const walking = customer.phase === 'marching' && !this.reducedMotion;
    const stride = walking ? Math.sin((state.tick + customer.id * 7) / 4.5) : 0;
    const bob = walking ? Math.abs(Math.cos((state.tick + customer.id * 7) / 4.5)) * 2 : 0;
    const impatient = walking && customer.x < scenario.laneLength * FIXED_SCALE * 0.28;

    const cx = px;
    const footY = groundY;

    // Ground shadow.
    ctx.fillStyle = 'rgba(4, 12, 9, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, footY + 3, 14, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

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
      const ticketY = Math.max(HUD_H + 18, headY - 30 + sway);
      this.drawOrderBubble(ctx, cx, ticketY, customer.flavor);
      if (impatient) {
        ctx.strokeStyle = withAlpha(FEEDBACK.urgent, 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, headY, 14.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
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

    drawMaltlineSoftServe(ctx, x - 6, y + 2, flavor, 0.82);
    ctx.fillStyle = CREAM;
    ctx.font = '800 11px "Maltline UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(FLAVOR_CUES[flavor], x + 10, y + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  private drawSlides(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const slide of state.slides) {
      const px = this.lanePx(slide.x);
      const groundY = this.layout.laneBottom(slide.lane) - 22;
      // A filled rightward delivery trail opposes the return jar's leftward arrows.
      const trail = ctx.createLinearGradient(px - 70, 0, px - 14, 0);
      trail.addColorStop(0, 'rgba(255,255,255,0)');
      trail.addColorStop(1, withAlpha(OUTGOING_SHAKE.trail, 0.72));
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.roundRect(px - 68, groundY - 19, 54, 14, 7);
      ctx.fill();
      ctx.fillStyle = OUTGOING_SHAKE.edge;
      for (const offset of [-50, -32]) {
        ctx.beginPath();
        ctx.moveTo(px + offset + 6, groundY - 12);
        ctx.lineTo(px + offset, groundY - 18);
        ctx.lineTo(px + offset, groundY - 6);
        ctx.closePath();
        ctx.fill();
      }
      const wobble = this.reducedMotion ? 0 : Math.sin((state.tick + slide.id * 5) / 3.2) * 0.1;
      drawMaltlineCup(ctx, px, groundY - 12, slide.flavor, 1.4, wobble, true);
    }
  }

  private drawJars(ctx: CanvasRenderingContext2D, state: MaltlineState): void {
    for (const jar of state.jars) {
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
      const trail = ctx.createLinearGradient(px + 12, 0, px + 64, 0);
      trail.addColorStop(0, withAlpha(RETURN_JAR.trail, pulse));
      trail.addColorStop(1, withAlpha(RETURN_JAR.trail, 0));
      ctx.strokeStyle = trail;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px + 13, groundY - 14);
      ctx.lineTo(px + 62, groundY - 14);
      ctx.stroke();
      ctx.fillStyle = RETURN_JAR.edge;
      for (const offset of [27, 43]) {
        ctx.beginPath();
        ctx.moveTo(px + offset - 6, groundY - 14);
        ctx.lineTo(px + offset, groundY - 20);
        ctx.lineTo(px + offset, groundY - 8);
        ctx.closePath();
        ctx.fill();
      }
      drawMaltlineJar(ctx, px, groundY - 12, 1.55, true);
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
    floor.addColorStop(0, '#0a231b');
    floor.addColorStop(1, '#050f0b');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.roundRect(0, BANK_TOP - 12, CANVAS_W, CANVAS_H - BANK_TOP + 12, 14);
    ctx.fill();

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
    const width = 84;
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
      ctx.fillStyle = FLAVOR_ART[flavor].base;
      ctx.beginPath();
      ctx.roundRect(x + 8, rowY - 10, 18, 17, 5);
      ctx.fill();
      ctx.fillStyle = flavor === 'vanilla' ? '#54301a' : '#fff8ea';
      ctx.font = '800 10px "Maltline UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(FLAVOR_CUES[flavor], x + 17, rowY + 2);
      ctx.textAlign = 'left';
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
    ctx.fillText(
      presentation.mode === 'blocked-no-jars'
        ? '0'
        : FLAVOR_CUES[presentation.actionFlavor],
      badgeX + badgeWidth / 2,
      badgeY + badgeHeight / 2 + 0.5,
    );

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

      // A fixed tab and letter make selection readable without color or motion.
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
      ctx.fillText(FLAVOR_CUES[flavor], tabX + tabW / 2, tabY + 22);
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

    // Brand plate + label.
    ctx.fillStyle = art.base;
    ctx.beginPath();
    ctx.roundRect(cx - 35, y + 48, 70, 16, 4);
    ctx.fill();
    ctx.fillStyle = flavor === 'vanilla' ? '#54301a' : '#fdf6e4';
    ctx.font = '700 8px "Maltline UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${FLAVOR_CUES[flavor]} · ${FLAVOR_LABELS[flavor].toUpperCase()}`, cx, y + 59);
    ctx.textAlign = 'left';

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
    const px = 64;
    const groundY = this.layout.laneBottom(state.player.lane) - 16;
    const breathing = this.reducedMotion ? 0 : Math.sin(state.tick / 18) * 1;
    const bodyY = groundY - 14 + breathing;

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
    ctx.lineTo(px - 5, groundY - 1);
    ctx.moveTo(px + 4, bodyY + 6);
    ctx.lineTo(px + 5, groundY - 1);
    ctx.stroke();

    // Green shirt.
    const shirt = ctx.createLinearGradient(px - 10, bodyY - 20, px + 10, bodyY + 8);
    shirt.addColorStop(0, '#2a8a67');
    shirt.addColorStop(1, '#175640');
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.roundRect(px - 10, bodyY - 20, 20, 28, 9);
    ctx.fill();

    // Cream apron with a tiny mark.
    ctx.fillStyle = '#f3e9d2';
    ctx.beginPath();
    ctx.roundRect(px - 6.5, bodyY - 10, 13, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#1c6a50';
    ctx.beginPath();
    ctx.arc(px, bodyY + 1, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Arms: one steadies, one works.
    ctx.strokeStyle = '#caa27a';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(px - 9, bodyY - 13);
    ctx.lineTo(px - 13, bodyY - 2);
    ctx.stroke();
    const working = state.player.blending !== null;
    ctx.beginPath();
    ctx.moveTo(px + 9, bodyY - 13);
    ctx.lineTo(px + (working ? 15 : 12), bodyY + (working ? -4 : -1));
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

    // Cap with brim toward the lanes.
    ctx.fillStyle = '#1c6a50';
    ctx.beginPath();
    ctx.arc(px, headY - 3, 10.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(px - 10, headY - 5, 22, 4.5, 2.5);
    ctx.fill();

    if (state.player.holding !== null) {
      ctx.fillStyle = STATION.statusPanel;
      ctx.beginPath();
      ctx.roundRect(px + 3, bodyY - 34, 28, 48, 9);
      ctx.fill();
      ctx.strokeStyle = STATION.ready;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawMaltlineCup(ctx, px + 15, bodyY - 6, state.player.holding, 1.05, 0.12);
    }
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
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
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

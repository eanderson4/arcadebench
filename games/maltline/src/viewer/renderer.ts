import { FIXED_SCALE } from '../core/engine';
import type { NormalizedMaltlineScenario } from '../core/scenario';
import type {
  CustomerState,
  FlavorId,
  GameEvent,
  MaltlineScenario,
  MaltlineState,
} from '../core/types';
import { MALTLINE_VISUAL_THEME } from './visual-theme';
import {
  deriveMaltlineRendererLayout,
  MALTLINE_RENDERER_FRAME,
  type MaltlineRendererLayout,
  type MaltlineWorkstationGeometry,
} from './renderer-layout';
import { MaltlineRendererEffects } from './renderer-effects';
import { activeChainText } from './presentation-copy';
import {
  drawMaltlineCup,
  drawMaltlineJar,
  drawMaltlineFlavorSymbol,
} from './renderer-vessel-painters';

const {
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  hudHeight: HUD_H,
} = MALTLINE_RENDERER_FRAME;

const {
  cream: CREAM,
  creamDim: CREAM_DIM,
  brass: BRASS,
  ink: INK,
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
  /** Accepted for caller compatibility; motion advances exclusively through update. */
  nowMs?: () => number;
  reducedMotion?: boolean;
}

const LIVE_RANDOM = Math.random;
const LIVE_REDUCED_MOTION = (): boolean =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Deterministic per-index shuffle for hair/wardrobe pairing. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length]!;
}

const SHIRTS = MALTLINE_VISUAL_THEME.customers.shirts;
const HAIRS = MALTLINE_VISUAL_THEME.customers.hair;
const SKINS = MALTLINE_VISUAL_THEME.customers.skin;

export interface MaltlineCustomerWalkPose {
  readonly walking: boolean;
  readonly facing: -1 | 1;
  readonly stride: number;
  readonly leftFootLift: number;
  readonly rightFootLift: number;
  readonly bob: number;
}

/**
 * Derives a customer's presentation-only gait from distance travelled. Using
 * position instead of elapsed wall time keeps the feet tied to ground motion
 * across every authored march/exit speed.
 */
export function deriveMaltlineCustomerWalkPose(
  customer: Pick<CustomerState, 'id' | 'phase' | 'x'>,
  reducedMotion: boolean,
): MaltlineCustomerWalkPose {
  const walking = customer.phase === 'marching' || customer.phase === 'leaving';
  const facing = customer.phase === 'leaving' ? 1 : -1;
  if (!walking || reducedMotion) {
    return Object.freeze({
      walking,
      facing,
      stride: 0,
      leftFootLift: 0,
      rightFootLift: 0,
      bob: 0,
    });
  }
  const cycleDistance = 7.5;
  const phase =
    (customer.x / (FIXED_SCALE * cycleDistance)) * Math.PI * 2 +
    customer.id * 0.8;
  const strideWave = Math.sin(phase);
  const passingWave = Math.cos(phase);
  return Object.freeze({
    walking,
    facing,
    stride: strideWave * 6,
    leftFootLift: Math.max(0, passingWave) * 2.4,
    rightFootLift: Math.max(0, -passingWave) * 2.4,
    bob: Math.abs(passingWave) * 0.9,
  });
}

export class MaltlineRenderer {
  private observedStation: number | null = null;
  private stationFrom = 0;
  private stationTarget = 0;
  private stationElapsedMs = 200;

  private resetStationMotion(): void {
    this.observedStation = null;
    this.stationFrom = 0;
    this.stationTarget = 0;
    this.stationElapsedMs = 200;
  }

  private stationTurn(): number {
    if (this.stationElapsedMs >= 200) return this.observedStation ?? 0;
    return (
      this.stationFrom +
      ((this.stationTarget - this.stationFrom) * this.stationElapsedMs) / 200
    );
  }

  private observeStation(station: number): void {
    const count = this.layout.scenario.stations.length;
    if (!Number.isSafeInteger(station) || station < 0 || station >= count) {
      throw new Error('Maltline renderer station is out of range.');
    }
    if (this.observedStation === null || this.reducedMotion) {
      this.observedStation = station;
      this.stationFrom = station;
      this.stationTarget = station;
      this.stationElapsedMs = 200;
      return;
    }
    if (station === this.observedStation) return;
    const current = this.stationTurn();
    const previousTarget =
      this.stationElapsedMs >= 200 ? this.observedStation : this.stationTarget;
    let direction = station - this.observedStation;
    if (direction > count / 2) direction -= count;
    if (direction < -count / 2) direction += count;
    this.stationFrom = current;
    this.stationTarget = previousTarget + direction;
    this.stationElapsedMs = 0;
    this.observedStation = station;
  }

  private binding: MaltlineRendererBinding | null = null;
  private readonly effects: MaltlineRendererEffects;
  private reducedMotion: boolean;

  constructor(dependencies: MaltlinePresentationDependencies = {}) {
    const random = dependencies.random ?? LIVE_RANDOM;
    this.reducedMotion = dependencies.reducedMotion ?? LIVE_REDUCED_MOTION();
    this.effects = new MaltlineRendererEffects(random, this.reducedMotion);
  }

  setScenario(scenario: NormalizedMaltlineScenario): MaltlineRendererLayout {
    const layout = deriveMaltlineRendererLayout(scenario);
    this.binding = Object.freeze({ scenario, layout });
    this.resetStationMotion();
    this.effects.reset();
    return layout;
  }

  /** Clears effects that must never cross a run or stage boundary. */
  resetPresentation(): void {
    this.resetStationMotion();
    this.effects.reset();
  }

  /** Updates presentation motion without replacing scenario or engine state. */
  setReducedMotion(reducedMotion: boolean): boolean {
    if (reducedMotion === this.reducedMotion) return false;
    this.reducedMotion = reducedMotion;
    this.effects.setReducedMotion(reducedMotion);
    if (reducedMotion) this.stationElapsedMs = 200;
    return true;
  }

  private requireBinding(
    state?: Readonly<MaltlineState>,
  ): MaltlineRendererBinding {
    const binding = this.binding;
    if (binding === null)
      throw new Error('Maltline renderer needs a bound scenario.');
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
    if (!Number.isFinite(dtMs) || dtMs < 0)
      throw new Error(
        'Maltline presentation elapsed time must be finite and nonnegative.',
      );
    this.stationElapsedMs = Math.min(200, this.stationElapsedMs + dtMs);
    this.effects.advance(dtMs);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    state: MaltlineState,
    meta: DrawMeta,
  ): void {
    const { scenario } = this.requireBinding(state);
    this.observeStation(state.player.station);
    const workstation = this.layout.workstation(
      state.player.lane,
      this.stationTurn(),
    );
    // Keep enlarged canvas artwork sharp without changing logical game geometry.
    // A two-times backing-store cap bounds the cost on high-density displays.
    const canvas = ctx.canvas;
    if (
      canvas &&
      typeof canvas.clientWidth === 'number' &&
      canvas.clientWidth > 0
    ) {
      const density =
        typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
      const scale = Math.min(
        2,
        Math.max(1, (canvas.clientWidth * density) / CANVAS_W),
      );
      const width = Math.round(CANVAS_W * scale);
      const height = Math.round(CANVAS_H * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(width / CANVAS_W, 0, 0, height / CANVAS_H, 0, 0);
    }
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    const shakeTranslation = this.effects.shakeTranslation();
    if (shakeTranslation !== null) {
      ctx.translate(shakeTranslation.x, shakeTranslation.y);
    }

    this.drawWall(ctx, state);
    this.drawAwning(ctx);
    this.drawRoomWorkstation(ctx, scenario);
    this.drawCleanCupRack(ctx, scenario, state);
    for (let lane = 0; lane < scenario.lanes; lane++) {
      this.drawDoors(ctx, scenario, lane);
      this.drawCustomers(ctx, scenario, state, lane);
      this.drawCounters(ctx, scenario, state, lane);
      this.drawSlides(ctx, scenario, state, lane);
      this.drawJars(ctx, state, lane);
      if (state.player.lane === lane) {
        this.drawServiceBank(ctx, scenario, state, false, workstation);
        this.drawPlayer(ctx, state);
        this.drawServiceBank(ctx, scenario, state, true, workstation);
      }
    }
    this.drawBlenderStatus(ctx, scenario, state, workstation);
    this.drawParticles(ctx);
    this.drawPopups(ctx);
    this.drawVignette(ctx);

    ctx.restore();
    this.drawFailureCallouts(ctx);
    this.drawHud(ctx, scenario, state, meta);
  }

  // ---- Scene -----------------------------------------------------------

  private roomX(anchor: number, y: number): number {
    return this.layout.roomPoint(anchor, y).x;
  }

  private roomScale(y: number): number {
    return this.layout.roomScale(y);
  }

  private workPoint(fraction: number, y: number) {
    return this.layout.workPoint(fraction, y);
  }

  private drawWall(ctx: CanvasRenderingContext2D, _state: MaltlineState): void {
    // Locked construction planes, with restrained material lighting.
    const surfaces = [
      {
        color: '#e6c890',
        points: [
          { x: 0, y: 46 },
          { x: 224, y: 46 },
          { x: 224, y: 118 },
          { x: this.roomX(18, 540), y: 540 },
          { x: 0, y: 540 },
        ],
      },
      {
        color: '#c6b783',
        points: [
          { x: 735, y: 46 },
          { x: 960, y: 46 },
          { x: 960, y: 540 },
          { x: this.roomX(940, 540), y: 540 },
          { x: 735, y: 118 },
        ],
      },
      {
        color: '#b8c8a4',
        points: [
          { x: 224, y: 46 },
          { x: 735, y: 46 },
          { x: 735, y: 118 },
          { x: 224, y: 118 },
        ],
      },
      {
        color: '#326b58',
        points: [
          { x: 224, y: 118 },
          { x: 735, y: 118 },
          { x: this.roomX(940, 540), y: 540 },
          { x: this.roomX(18, 540), y: 540 },
        ],
      },
    ];
    ctx.fillStyle = '#e6c890';
    ctx.fillRect(0, 46, 960, 494);
    for (const [index, surface] of surfaces.entries()) {
      const light = ctx.createLinearGradient(0, 46, index < 2 ? 960 : 0, 540);
      const colors = [
        ['#efdaad', '#d2b478'],
        ['#d4c595', '#b6aa7d'],
        ['#c1cfac', '#a5b695'],
        ['#285748', '#387661'],
      ][index]!;
      light.addColorStop(0, colors[0]!);
      light.addColorStop(1, colors[1]!);
      ctx.fillStyle = light;
      this.polygon(ctx, surface.points);
      ctx.fill();
      ctx.strokeStyle = '#516b50';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // Rear-wall panel joints remain vertical below the contained valance.
    ctx.save();
    ctx.beginPath();
    ctx.rect(224, 84, 511, 32);
    ctx.clip();
    for (let x = 242; x < 735; x += 62) {
      ctx.fillStyle = 'rgba(50,78,48,.12)';
      ctx.fillRect(x, 84, 2, 32);
      ctx.fillStyle = 'rgba(235,239,193,.18)';
      ctx.fillRect(x + 2, 84, 1, 32);
    }
    ctx.restore();
    for (const anchor of [108, 215, 360, 505, 650, 795]) {
      ctx.strokeStyle = 'rgba(207,221,169,.12)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(this.roomX(anchor, 118), 118);
      ctx.lineTo(this.roomX(anchor, 540), 540);
      ctx.stroke();
    }
    for (const y of [190, 266, 353, 454, 520]) {
      ctx.strokeStyle = 'rgba(17,51,36,.2)';
      ctx.beginPath();
      ctx.moveTo(this.roomX(18, y), y);
      ctx.lineTo(this.roomX(940, y), y);
      ctx.stroke();
    }
    ctx.fillStyle = '#244e3f';
    ctx.fillRect(224, 116, 511, 4);
    ctx.fillStyle = '#d0d5a7';
    ctx.fillRect(224, 115, 511, 1);
    ctx.fillStyle = 'rgba(20,46,31,.14)';
    ctx.fillRect(224, 120, 511, 3);
    this.drawWallMenu(ctx);
  }

  private wallPoint(
    left: number,
    right: number,
    top: number,
    bottom: number,
    u: number,
    v: number,
  ) {
    const x = left + (right - left) * u;
    const depth = (x - 480) / (left - 480);
    return { x, y: -300 + (top + (bottom - top) * v + 300) * depth };
  }

  private drawWallMenu(ctx: CanvasRenderingContext2D): void {
    const left = 50,
      right = 98,
      top = 155,
      bottom = 345;
    const p = (u: number, v: number) =>
      this.wallPoint(left, right, top, bottom, u, v);
    const quad = (u0: number, v0: number, u1: number, v1: number) => [
      p(u0, v0),
      p(u1, v0),
      p(u1, v1),
      p(u0, v1),
    ];
    ctx.fillStyle = 'rgba(79,63,36,.18)';
    this.polygon(
      ctx,
      quad(0, 0, 1, 1).map((q) => ({ x: q.x + 3, y: q.y + 3 })),
    );
    ctx.fill();
    const wood = ctx.createLinearGradient(left, top, right, bottom);
    wood.addColorStop(0, '#b16a4c');
    wood.addColorStop(1, '#824d36');
    ctx.fillStyle = wood;
    this.roundedPolygon(ctx, quad(0, 0, 1, 1), 2);
    ctx.fill();
    ctx.fillStyle = '#153d34';
    this.roundedPolygon(ctx, quad(0.07, 0.035, 0.93, 0.965), 1.5);
    ctx.fill();
    ctx.strokeStyle = '#cfb882';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    for (const [label, v, size] of [
      ['MALTS', 0.2, 9],
      ['VAN', 0.4, 6.5],
      ['CHOC', 0.58, 6.5],
      ['BERRY', 0.76, 6.5],
    ] as const) {
      const q = p(0.5, v),
        depth = (q.x - 480) / (left - 480),
        slope = (top + (bottom - top) * v + 300) / (left - 480);
      ctx.save();
      ctx.transform(1, slope, 0, depth, q.x, q.y);
      ctx.fillStyle = '#d0caa5';
      ctx.font = `700 ${size}px "Maltline UI",system-ui,sans-serif`;
      ctx.textAlign = 'center';
      if (label === 'MALTS') ctx.fillText(label, 0, 0);
      else {
        const flavor: FlavorId =
          label === 'VAN'
            ? 'vanilla'
            : label === 'CHOC'
              ? 'chocolate'
              : 'strawberry';
        drawMaltlineFlavorSymbol(ctx, -14, -2.5, flavor, 0.3);
        ctx.fillStyle = '#d0caa5';
        ctx.fillText(label, 6, 0);
      }
      ctx.restore();
    }
    for (const u of [0.18, 0.82]) {
      const q = p(u, 0.025);
      ctx.fillStyle = '#d7b67a';
      ctx.beginPath();
      ctx.arc(q.x, q.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const v of [0.28, 0.9]) {
      const a = p(0.17, v),
        b = p(0.83, v);
      ctx.strokeStyle = 'rgba(206,190,140,.36)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  private roundedPolygon(
    ctx: CanvasRenderingContext2D,
    points: readonly { x: number; y: number }[],
    radius: number,
  ): void {
    // Tangent points stay on the existing projected edges; only the corners
    // are eased. This never substitutes an axis-aligned box for a wall plane.
    const corners = points.map((point, index) => {
      const previous = points[(index + points.length - 1) % points.length]!,
        next = points[(index + 1) % points.length]!;
      const before = Math.hypot(previous.x - point.x, previous.y - point.y),
        after = Math.hypot(next.x - point.x, next.y - point.y);
      const distance = Math.min(radius, before / 3, after / 3);
      return {
        point,
        entry: {
          x: point.x + ((previous.x - point.x) * distance) / before,
          y: point.y + ((previous.y - point.y) * distance) / before,
        },
        exit: {
          x: point.x + ((next.x - point.x) * distance) / after,
          y: point.y + ((next.y - point.y) * distance) / after,
        },
      };
    });
    ctx.beginPath();
    ctx.moveTo(corners[0]!.entry.x, corners[0]!.entry.y);
    for (const corner of corners) {
      ctx.lineTo(corner.entry.x, corner.entry.y);
      ctx.quadraticCurveTo(
        corner.point.x,
        corner.point.y,
        corner.exit.x,
        corner.exit.y,
      );
    }
    ctx.closePath();
  }

  private polygon(
    ctx: CanvasRenderingContext2D,
    points: readonly { x: number; y: number }[],
  ): void {
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }

  private drawAwning(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(224, 46, 511, 72);
    ctx.clip();
    for (let x = 224; x < 759; x += 32) {
      const coral = ((x - 224) / 32) % 2 === 0,
        cloth = ctx.createLinearGradient(0, 46, 0, 80);
      cloth.addColorStop(0, coral ? '#e48162' : '#f4e6c8');
      cloth.addColorStop(0.62, coral ? '#d96b50' : '#ecdbb6');
      cloth.addColorStop(1, coral ? '#ba5743' : '#d0bc93');
      ctx.fillStyle = cloth;
      ctx.fillRect(x, 46, 32, 10);
      ctx.beginPath();
      ctx.moveTo(x, 56);
      ctx.lineTo(x + 32, 56);
      ctx.lineTo(x + 32, 64);
      ctx.arc(x + 16, 64, 16, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = coral
        ? 'rgba(250,182,144,.45)'
        : 'rgba(255,247,218,.55)';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.arc(x + 16, 64, 13, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(80,62,38,.1)';
      ctx.beginPath();
      ctx.moveTo(x + 1, 47);
      ctx.lineTo(x + 1, 63);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,57,39,.14)';
    ctx.fillRect(224, 80, 511, 4);
    ctx.restore();
  }

  private drawCounters(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    lane: number,
  ): void {
    const layout = this.layout,
      geometry = layout.counter(lane);
    const [lb, rb, rf, lf] = geometry.top;
    const back = lb.y,
      front = lf.y,
      scale = geometry.scale;
    const { apronBottom, groundY } = geometry;
    const la = geometry.apron[3]!,
      ra = geometry.apron[2]!;
    const lg = geometry.leftEnd[2]!,
      lbg = geometry.leftEnd[3]!;
    // A full-depth aisle-end panel reaches the floor; its vertical edges
    // preserve x, while its bottom depth edge points to the room VP.
    ctx.fillStyle = 'rgba(10,37,25,.16)';
    this.polygon(ctx, [
      lg,
      { x: rf.x, y: groundY },
      { x: rf.x + 3 * scale, y: groundY + 3 * scale },
      { x: lg.x + 3 * scale, y: groundY + 3 * scale },
    ]);
    ctx.fill();
    const endShade = ctx.createLinearGradient(lb.x, back, lf.x, groundY);
    endShade.addColorStop(0, '#bd6247');
    endShade.addColorStop(1, '#874b38');
    ctx.fillStyle = endShade;
    this.polygon(ctx, [lb, lf, lg, lbg]);
    ctx.fill();
    ctx.strokeStyle = '#854632';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Three narrow vertical supports leave the floor visible under the bar.
    for (const supportGeometry of geometry.supports) {
      const { body, foot } = supportGeometry;
      const x = body.x + body.width / 2;
      ctx.fillStyle = 'rgba(9,34,23,.26)';
      ctx.beginPath();
      ctx.ellipse(
        x + 2 * scale,
        groundY,
        7 * scale,
        2 * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      const support = ctx.createLinearGradient(
        x - 3 * scale,
        0,
        x + 3 * scale,
        0,
      );
      support.addColorStop(0, '#d07b55');
      support.addColorStop(0.45, '#a85b40');
      support.addColorStop(1, '#794530');
      ctx.fillStyle = support;
      ctx.beginPath();
      ctx.roundRect(body.x, body.y, body.width, body.height, scale);
      ctx.fill();
      ctx.fillStyle = '#744936';
      ctx.beginPath();
      ctx.roundRect(foot.x, foot.y, foot.width, foot.height, scale);
      ctx.fill();
    }
    const top = ctx.createLinearGradient(0, back, 0, front);
    top.addColorStop(0, '#fff0c4');
    top.addColorStop(1, '#edc682');
    ctx.fillStyle = top;
    this.roundedPolygon(ctx, [lb, rb, rf, lf], 2.5 * scale);
    ctx.fill();
    ctx.strokeStyle = '#9c6645';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    const apron = ctx.createLinearGradient(0, front, 0, apronBottom);
    apron.addColorStop(0, '#df7956');
    apron.addColorStop(1, '#ba533f');
    ctx.fillStyle = apron;
    this.roundedPolygon(ctx, [lf, rf, ra, la], 2 * scale);
    ctx.fill();
    ctx.strokeStyle = '#954935';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle =
      lane === state.player.lane ? AMBIENCE.activeLane : '#ffe6ac';
    ctx.lineWidth = lane === state.player.lane ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(lf.x, lf.y);
    ctx.lineTo(rf.x, rf.y);
    ctx.stroke();
    ctx.strokeStyle = '#763d2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y);
    ctx.lineTo(ra.x, ra.y);
    ctx.stroke();
    for (const flash of this.effects.flashes.filter(
      (candidate) => candidate.lane === lane,
    )) {
      ctx.fillStyle = withAlpha(
        FEEDBACK.urgent,
        Math.max(0, 1 - flash.age / flash.ttl) * 0.4,
      );
      this.polygon(ctx, [lb, rb, ra, la]);
      ctx.fill();
    }
  }

  private drawDoors(
    ctx: CanvasRenderingContext2D,
    _scenario: MaltlineScenario,
    lane: number,
  ): void {
    const front = this.layout.counterFrontY(lane),
      scale = Math.max(0.78, this.roomScale(front));
    const baseN = front - 6,
      xN = this.roomX(940, baseN) - 10 * scale,
      xF = xN - 28 * scale,
      topN = baseN - 64 * scale;
    const rayY = (x: number, y: number) =>
      -300 + ((y + 300) * (x - 480)) / (xN - 480);
    const topF = rayY(xF, topN),
      baseF = rayY(xF, baseN);
    const p = (u: number, v: number) =>
      this.wallPoint(xF, xN, topF, baseF, u, v);
    const quad = (u0: number, v0: number, u1: number, v1: number) => [
      p(u0, v0),
      p(u1, v0),
      p(u1, v1),
      p(u0, v1),
    ];
    ctx.fillStyle = 'rgba(56,54,32,.19)';
    this.polygon(
      ctx,
      quad(0, 0, 1, 1).map((q) => ({ x: q.x + 2, y: q.y + 2 })),
    );
    ctx.fill();
    ctx.fillStyle = '#234d3e';
    this.roundedPolygon(ctx, quad(0, 0, 1, 1), 2.5 * scale);
    ctx.fill();
    ctx.strokeStyle = '#173b30';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#dac397';
    this.roundedPolygon(ctx, quad(0.1, 0.035, 0.9, 0.965), 2.5 * scale);
    ctx.fill();
    ctx.fillStyle = '#142e23';
    this.roundedPolygon(ctx, quad(0.16, 0.075, 0.84, 0.94), 2.5 * scale);
    ctx.fill();
    const door = ctx.createLinearGradient(xF, topF, xN, baseN);
    door.addColorStop(0, '#b5a378');
    door.addColorStop(1, '#81734f');
    ctx.fillStyle = door;
    this.roundedPolygon(ctx, quad(0.23, 0.09, 0.8, 0.92), 2.5 * scale);
    ctx.fill();
    const oval = Array.from({ length: 32 }, (_, i) => {
      const angle = (i * Math.PI) / 16;
      return p(0.51 + Math.cos(angle) * 0.17, 0.34 + Math.sin(angle) * 0.17);
    });
    ctx.fillStyle = '#3d6653';
    this.polygon(ctx, oval);
    ctx.fill();
    ctx.strokeStyle = '#cdbd8b';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.save();
    this.polygon(ctx, oval);
    ctx.clip();
    const glintA = p(0.45, 0.22),
      glintB = p(0.41, 0.41);
    ctx.strokeStyle = 'rgba(230,236,199,.45)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(glintA.x, glintA.y);
    ctx.lineTo(glintB.x, glintB.y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#d5bd82';
    this.polygon(ctx, quad(0.7, 0.54, 0.77, 0.7));
    ctx.fill();
    ctx.fillStyle = '#f0dba2';
    this.polygon(ctx, quad(0.7, 0.54, 0.72, 0.7));
    ctx.fill();
    ctx.strokeStyle = '#7c7450';
    ctx.lineWidth = 1;
    this.roundedPolygon(ctx, quad(0.3, 0.63, 0.7, 0.83), 2.5 * scale);
    ctx.stroke();
  }

  // ---- Actors ----------------------------------------------------------

  private drawCustomers(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    lane: number,
  ): void {
    for (const customer of state.customers
      .filter((customer) => customer.lane === lane)
      .sort((a, b) => b.x - a.x)) {
      const point = this.layout.project(
        customer.x,
        this.layout.counterFrontY(lane),
      );
      this.drawPerson(
        ctx,
        customer,
        point.x,
        point.y + 2 * point.scale,
        state,
        scenario,
      );
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
    const actorScale =
      this.layout.actorScale *
      this.layout.project(customer.x, this.layout.counterFrontY(customer.lane))
        .scale;
    ctx.translate(px, groundY);
    ctx.scale(actorScale, actorScale);
    ctx.translate(-px, -groundY);
    const [shirt, shirtDark] = pick(SHIRTS, customer.id);
    const [hair, hairDark] = pick(HAIRS, customer.id * 3 + 1);
    const [skin, skinDark] = pick(SKINS, customer.id * 2 + 2);
    const walk = deriveMaltlineCustomerWalkPose(customer, this.reducedMotion);
    const impatient =
      customer.phase === 'marching' &&
      customer.x < scenario.laneLength * FIXED_SCALE * 0.28;

    const cx = px;
    const laneFront = this.layout.counterFrontY(customer.lane);
    const footTarget = laneFront + 38 * this.roomScale(laneFront);
    const footY = groundY + (footTarget - groundY) / actorScale - 1;
    const bodyY = groundY - 14 - walk.bob;

    // Leaving customers turn toward the door. Keep the phase overlays outside
    // this local mirror so notes and order art never render backwards.
    ctx.save();
    if (walk.facing === 1) {
      ctx.translate(cx * 2, 0);
      ctx.scale(-1, 1);
    }

    const airborne = Math.max(walk.leftFootLift, walk.rightFootLift);
    ctx.fillStyle = `rgba(8,29,20,${0.24 - airborne * 0.018})`;
    ctx.beginPath();
    ctx.ellipse(cx, footY + 1, 13 - airborne * 0.45, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Alternating planted/lifted feet give each step a readable contact phase.
    // Hips remain behind the apron while shoes meet the counter-support floor.
    ctx.lineCap = 'round';
    const leftFootX = cx - 5 + walk.stride;
    const rightFootX = cx + 5 - walk.stride;
    const leftFootY = footY - 1 - walk.leftFootLift;
    const rightFootY = footY - 1 - walk.rightFootLift;
    const leftHipX = cx - 2;
    const rightHipX = cx + 2;
    const kneeY = (bodyY + 6 + footY) / 2;
    const legs = [
      {
        hipX: leftHipX,
        footX: leftFootX,
        footY: leftFootY,
        lift: walk.leftFootLift,
      },
      {
        hipX: rightHipX,
        footX: rightFootX,
        footY: rightFootY,
        lift: walk.rightFootLift,
      },
    ].sort((a, b) => b.footX - a.footX);
    for (const [index, leg] of legs.entries()) {
      ctx.strokeStyle = index === 0 ? '#34483f' : INK;
      ctx.lineWidth = index === 0 ? 4.5 : 5.2;
      ctx.beginPath();
      ctx.moveTo(leg.hipX, bodyY + 6);
      ctx.lineTo(
        leg.hipX + (leg.footX - leg.hipX) * 0.45 - leg.lift * 0.7,
        kneeY - leg.lift * 0.35,
      );
      ctx.lineTo(leg.footX, leg.footY);
      ctx.stroke();
    }

    // Body capsule in shirt gradient.
    const bodyGrad = ctx.createLinearGradient(
      cx - 10,
      bodyY - 20,
      cx + 10,
      bodyY + 8,
    );
    bodyGrad.addColorStop(0, shirt);
    bodyGrad.addColorStop(1, shirtDark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(cx - 10, bodyY - 20, 20, 28, 9);
    ctx.fill();
    ctx.strokeStyle = CUSTOMER_ORDER.silhouetteKeyline;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shirt details and shoes.
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
    ctx.roundRect(leftFootX - 6, leftFootY - 3, 9, 4, 2);
    ctx.roundRect(rightFootX - 6, rightFootY - 3, 9, 4, 2);
    ctx.fill();

    // A restrained counter-swing keeps the gait readable without flapping.
    const armSwing = walk.stride * 0.35;
    ctx.strokeStyle = skinDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 9, bodyY - 14);
    ctx.lineTo(cx - 13 - armSwing, bodyY - 3);
    ctx.moveTo(cx + 9, bodyY - 14);
    ctx.lineTo(cx + 13 - armSwing, bodyY - 3);
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

    // Face by mood; the local actor mirror turns departing customers right.
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
        const sweat = this.reducedMotion
          ? 0.45
          : ((state.tick + customer.id * 11) % 40) / 40;
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

    ctx.restore();

    if (customer.phase === 'drinking') {
      // Progress halo + cup at the lips.
      const progress = 1 - customer.timer / scenario.drinkTicks;
      ctx.strokeStyle = FLAVOR_ART[customer.flavor].base;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        cx,
        headY,
        15,
        -Math.PI / 2,
        -Math.PI / 2 + progress * Math.PI * 2,
      );
      ctx.stroke();
      drawMaltlineCup(ctx, cx - 13, headY + 2, customer.flavor, 0.75, -0.5);
    } else if (customer.phase === 'leaving') {
      ctx.fillStyle = 'rgba(159, 196, 178, 0.95)';
      ctx.font = '13px system-ui, sans-serif';
      const hop = this.reducedMotion
        ? 0
        : Math.sin((state.tick + customer.id * 5) / 5) * 2;
      ctx.fillText('♪', cx + 11, headY - 8 + hop);
    } else {
      // Order bubble.
      const sway = this.reducedMotion
        ? 0
        : Math.sin((state.tick + customer.id * 13) / 30) * 2;
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

  private drawOrderBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    flavor: FlavorId,
  ): void {
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
    ctx: CanvasRenderingContext2D,
    fixedX: number,
    lane: number,
    direction: 1 | -1,
    color: string,
    edge: string,
    opacity: number,
  ): void {
    const unit = (this.layout.scenario.laneLength * FIXED_SCALE) / 100;
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
      const point = this.layout.project(
        fixedX - direction * offset * unit,
        nearY,
      );
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

  private drawSlides(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    lane: number,
  ): void {
    for (const slide of state.slides.filter((slide) => slide.lane === lane)) {
      const point = this.layout.project(slide.x, this.layout.vesselY(lane));
      const px = point.x;
      const groundY = point.y;
      this.drawVesselTrail(
        ctx,
        slide.x,
        lane,
        1,
        OUTGOING_SHAKE.trail,
        OUTGOING_SHAKE.edge,
        0.72,
      );
      const wobble = this.reducedMotion
        ? 0
        : Math.sin((state.tick + slide.id * 5) / 3.2) * 0.1;
      const vesselScale = 1.35 * point.scale;
      drawMaltlineCup(
        ctx,
        px,
        groundY - 12 * vesselScale,
        slide.flavor,
        vesselScale,
        wobble,
        true,
      );
    }
  }

  private drawJars(
    ctx: CanvasRenderingContext2D,
    state: MaltlineState,
    lane: number,
  ): void {
    for (const jar of state.jars.filter((jar) => jar.lane === lane)) {
      const projection = this.layout.projectReturningJar(jar.x, jar.lane);
      const px = projection.anchorX;
      const groundY = projection.groundY;
      if (projection.catchCue !== null) {
        const catchReady = jar.lane === state.player.lane;
        const {
          x: cueX,
          y: cueY,
          width: cueWidth,
          height: cueHeight,
        } = projection.catchCue;
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
        ctx.fillText(
          catchReady ? '◀ CATCH' : `WINDOW ${jar.lane + 1}`,
          cueX + 35,
          cueY + 10,
        );
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      const pulse = this.reducedMotion
        ? 0.72
        : 0.64 + Math.sin((state.tick + jar.id * 7) / 6) * 0.12;
      this.drawVesselTrail(
        ctx,
        jar.x,
        lane,
        -1,
        RETURN_JAR.trail,
        RETURN_JAR.edge,
        pulse,
      );
      const vesselScale = 1.5 * projection.scale;
      drawMaltlineJar(ctx, px, groundY - 12 * vesselScale, vesselScale, true);
    }
  }

  private drawCleanCupRack(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
  ): void {
    const rack = this.layout.cleanRack;
    ctx.fillStyle = '#637661';
    this.roundedPolygon(ctx, rack.outline, 2);
    ctx.fill();
    ctx.strokeStyle = '#b7bea0';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Only reviewed physical seats are painted, even for a large custom pool.
    for (const [index, slot] of rack.slots.entries()) {
      const { center, scale } = slot;
      ctx.strokeStyle = 'rgba(30,55,40,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(
        center.x,
        center.y + 10 * scale,
        7 * scale,
        2.5 * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      if (index < state.jarsAvailable)
        drawMaltlineJar(ctx, center.x, center.y, scale, true);
    }
    const overflow = Math.max(0, state.jarsAvailable - rack.capacity);
    if (overflow > 0) {
      ctx.fillStyle = '#142f25';
      ctx.font = '800 10px "Maltline UI",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `+${overflow}`,
        rack.overflowAnchor.x,
        rack.overflowAnchor.y,
      );
      ctx.textAlign = 'left';
    }
  }

  private drawBlenderStatus(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    station: MaltlineWorkstationGeometry,
  ): void {
    const processing = state.player.blending,
      holding = state.player.holding;
    const blocked =
      state.jarsAvailable === 0 && processing === null && holding === null;
    if (processing === null && holding === null && !blocked) return;
    const motor = station.motor.anchor;
    const { x, y, width, height } = station.status.bounds;
    const progress =
      processing === null
        ? 1
        : Math.min(1, state.player.blendProgress / scenario.blendTicks);
    const flavor = processing ?? holding;
    const accent = blocked
      ? STATION.blocked
      : holding !== null
        ? STATION.ready
        : FLAVOR_ART[flavor!].base;
    ctx.strokeStyle = '#9ba487';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(station.status.tether[0]!.x, station.status.tether[0]!.y);
    ctx.lineTo(station.status.tether[1]!.x, station.status.tether[1]!.y);
    ctx.stroke();
    ctx.fillStyle = '#122e24';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.fill();
    if (processing !== null) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.68;
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, width * progress, height);
      ctx.restore();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.stroke();
    const label = blocked
      ? 'NO CLEAN CUPS'
      : holding !== null
        ? 'READY'
        : `BLEND ${Math.round(progress * 20) * 5}%`;
    ctx.font = `800 ${blocked ? 11 : 13}px "Maltline UI",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(9,30,22,.8)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(label, x + width / 2, y + height / 2 + 1);
    ctx.fillStyle = '#fff3d9';
    ctx.fillText(label, x + width / 2, y + height / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    state: MaltlineState,
  ): void {
    const point = this.layout.project(
      state.player.x,
      this.layout.counterFrontY(state.player.lane),
      -53.5,
    );
    const px = point.x;
    const groundY = point.y + 16 * point.scale;
    ctx.save();
    const actorScale = this.layout.actorScale * point.scale;
    ctx.translate(px, groundY);
    ctx.scale(actorScale, actorScale);
    ctx.translate(-px, -groundY);
    const running =
      state.currentInput.serve && state.currentInput.stationDir !== 0;
    const stride =
      running && !this.reducedMotion ? Math.sin(state.tick / 2.2) : 0;
    const breathing = this.reducedMotion
      ? 0
      : running
        ? Math.abs(Math.cos(state.tick / 2.2)) * 2
        : Math.sin(state.tick / 18);
    const working = state.player.blending !== null;
    const bodyY = groundY - 14 + (working ? 0 : breathing);

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
    const shirt = ctx.createLinearGradient(
      px - 10,
      bodyY - 20,
      px + 10,
      bodyY + 8,
    );
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

    // The working hand reaches toward the service bay, leaving traffic clear.
    ctx.strokeStyle = '#caa27a';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(px - 9, bodyY - 13);
    ctx.lineTo(px - 14, bodyY - 6);
    ctx.lineTo(px - (working ? 23 : 13), bodyY - (working ? 11 : 1));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + 9, bodyY - 13);
    ctx.lineTo(px + 12, bodyY - 1);
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

    ctx.restore();
  }

  private drawRoomWorkstation(
    ctx: CanvasRenderingContext2D,
    _scenario: MaltlineScenario,
  ): void {
    const [outerFar, innerFar, innerNear, outerNear] = this.layout.worktop;
    const cream = ctx.createLinearGradient(0, 118, 0, 540);
    cream.addColorStop(0, '#fff0c4');
    cream.addColorStop(1, '#edc682');
    ctx.fillStyle = cream;
    this.roundedPolygon(ctx, [outerFar, innerFar, innerNear, outerNear], 2);
    ctx.fill();
    ctx.strokeStyle = '#915033';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // A continuous low coral apron faces the diagonal bartender aisle.
    const apron = ctx.createLinearGradient(innerFar.x, 118, innerNear.x, 553);
    apron.addColorStop(0, '#df7956');
    apron.addColorStop(1, '#ae503b');
    ctx.fillStyle = apron;
    this.roundedPolygon(
      ctx,
      [
        innerFar,
        innerNear,
        { x: innerNear.x, y: 553 },
        { x: innerFar.x, y: 125 },
      ],
      1.5,
    );
    ctx.fill();
    ctx.strokeStyle = '#934635';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#763d2e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerFar.x, 125);
    ctx.lineTo(innerNear.x, 553);
    ctx.stroke();
    ctx.strokeStyle = '#fff3d3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerFar.x, 118);
    ctx.lineTo(innerNear.x, 540);
    ctx.stroke();
    ctx.fillStyle = '#344e38';
    this.polygon(ctx, [
      this.workPoint(0.1, 132),
      this.workPoint(0.18, 132),
      this.workPoint(0.18, 440),
      this.workPoint(0.1, 440),
    ]);
    ctx.fill();
    ctx.strokeStyle = '#91a17a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(this.workPoint(0.18, 132).x, 132);
    ctx.lineTo(this.workPoint(0.18, 440).x, 440);
    ctx.stroke();
    for (const y of [143, 258, 431]) {
      const p = this.workPoint(0.14, y);
      ctx.fillStyle = '#bca16c';
      ctx.beginPath();
      ctx.ellipse(p.x, y, 3 * p.scale, 1.6 * p.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const y of [185, 315, 449]) {
      const point = this.workPoint(0.93, y),
        scale = point.scale;
      ctx.fillStyle = '#70412e';
      ctx.fillRect(point.x - 2 * scale, y + 5 * scale, 4 * scale, 17 * scale);
    }
  }

  private drawServiceBank(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    front: boolean,
    geometry: MaltlineWorkstationGeometry,
  ): void {
    const count = scenario.stations.length;
    const motor = geometry.motor.anchor;
    if (!front) {
      // Short individual contact pads preserve the narrow wood worktop; there
      // is no tall wall panel and no full-height selector rail.
      if (count > 1)
        for (const point of geometry.slots) {
          ctx.fillStyle = '#526747';
          ctx.beginPath();
          ctx.ellipse(
            point.x,
            point.y,
            14 * point.scale,
            5 * point.scale,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
    } else {
      ctx.fillStyle = '#657650';
      ctx.beginPath();
      ctx.ellipse(
        motor.x,
        motor.y,
        21 * motor.scale,
        7 * motor.scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      this.drawProjectedMotor(
        ctx,
        motor.x,
        motor.y,
        motor.scale,
        state.player.blending !== null,
        state.player.holding !== null,
      );
      if (
        state.jarsAvailable === 0 &&
        state.player.blending === null &&
        state.player.holding === null
      ) {
        ctx.strokeStyle = STATION.blocked;
        ctx.lineWidth = 2 * motor.scale;
        ctx.beginPath();
        ctx.ellipse(
          motor.x,
          motor.y - 16 * motor.scale,
          16 * motor.scale,
          4 * motor.scale,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.fillStyle = STATION.blocked;
        ctx.beginPath();
        ctx.arc(
          motor.x + 13 * motor.scale,
          motor.y - 6 * motor.scale,
          2.4 * motor.scale,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    for (const item of geometry.pitchers.filter(
      (item) => item.dock > 0 === front,
    )) {
      this.drawQueuePitcher(
        ctx,
        state,
        scenario,
        scenario.stations[item.stationIndex]!,
        item.stationIndex,
        item.anchor.x,
        item.anchor.y,
        item.scale,
      );
    }
    if (front) {
      for (let index = 0; index < count; index++) {
        ctx.fillStyle = index === state.player.station ? '#ead79f' : '#8c8057';
        ctx.beginPath();
        ctx.arc(
          motor.x + (index - (count - 1) / 2) * 5 * motor.scale,
          motor.y + 4 * motor.scale,
          1.2 * motor.scale,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }

  private drawProjectedMotor(
    ctx: CanvasRenderingContext2D,
    cx: number,
    y: number,
    scale: number,
    processing: boolean,
    ready: boolean,
  ): void {
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#253f30';
    ctx.fillRect(-17, -2, 6, 5);
    ctx.fillRect(11, -2, 6, 5);
    const enamel = ctx.createLinearGradient(-20, -15, 18, 0);
    enamel.addColorStop(0, '#ed8962');
    enamel.addColorStop(1, '#9f4b35');
    ctx.fillStyle = enamel;
    ctx.beginPath();
    ctx.moveTo(-15, -16);
    ctx.lineTo(15, -16);
    ctx.lineTo(21, -2);
    ctx.quadraticCurveTo(21, 1, 17, 1);
    ctx.lineTo(-17, 1);
    ctx.quadraticCurveTo(-22, 0, -21, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#35442e';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = '#a9b493';
    ctx.beginPath();
    ctx.ellipse(0, -16, 16, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe3c2';
    ctx.beginPath();
    ctx.arc(0, -7, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#384931';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(processing ? 3 : -2, -10);
    ctx.stroke();
    ctx.fillStyle = ready
      ? STATION.ready
      : processing
        ? STATION.processing
        : STATION.selectedKeyline;
    ctx.beginPath();
    ctx.arc(13, -6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bcc8ac';
    ctx.fillRect(-15, -9, 5, 4);
    ctx.restore();
  }

  private drawQueuePitcher(
    ctx: CanvasRenderingContext2D,
    state: MaltlineState,
    scenario: MaltlineScenario,
    flavor: FlavorId,
    index: number,
    cx: number,
    contactY: number,
    scale: number,
  ): void {
    const selected = index === state.player.station;
    const processing = state.player.blending === flavor;
    const ready = state.player.holding === flavor;
    const art = FLAVOR_ART[flavor];
    const fill = ready
      ? 1
      : processing
        ? Math.min(1, state.player.blendProgress / scenario.blendTicks)
        : 0;
    ctx.fillStyle = 'rgba(43,54,29,0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, contactY + 1, 16 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#294733';
    ctx.beginPath();
    ctx.ellipse(cx, contactY, 13 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, contactY + 29 * scale);
    ctx.scale(scale, scale);
    // The clear tapered pitcher and open handle look like kitchen equipment,
    // not a dispenser. Liquid is shown only in the actual processing/held flavor.
    ctx.strokeStyle = '#b6d0bb';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, -58);
    ctx.lineTo(23, -57);
    ctx.quadraticCurveTo(29, -43, 17, -33);
    ctx.stroke();
    ctx.strokeStyle = '#e7f2d9';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#18392c';
    ctx.fillRect(-9, -28, 18, 5);
    ctx.fillStyle = 'rgba(195,224,196,0.48)';
    ctx.beginPath();
    ctx.moveTo(-15, -61);
    ctx.lineTo(15, -61);
    ctx.lineTo(11, -29);
    ctx.lineTo(-10, -29);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (fill > 0) {
      const liquidTop = -30 - 27 * fill;
      ctx.fillStyle = art.base;
      ctx.fillRect(-16, liquidTop, 32, 33);
      ctx.fillStyle = art.light;
      ctx.beginPath();
      ctx.ellipse(0, liquidTop, 14, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (processing) {
        ctx.strokeStyle = art.dark;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, liquidTop + 5, 8, 2, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#e2eed3';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-15, -61);
    ctx.lineTo(15, -61);
    ctx.lineTo(11, -29);
    ctx.lineTo(-10, -29);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,234,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -56);
    ctx.lineTo(-8, -35);
    ctx.stroke();
    ctx.strokeStyle = '#719b80';
    ctx.lineWidth = 1;
    for (const y of [-51, -44, -37]) {
      ctx.beginPath();
      ctx.moveTo(7, y);
      ctx.lineTo(12, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#223c2d';
    ctx.beginPath();
    ctx.roundRect(-17, -65, 35, 5, 2);
    ctx.fill();
    ctx.fillStyle = '#556e53';
    ctx.beginPath();
    ctx.roundRect(-5, -69, 11, 5, 2);
    ctx.fill();
    // A dark enamel flavor badge remains readable even on an empty pitcher.
    ctx.fillStyle = '#214b3d';
    ctx.beginPath();
    ctx.roundRect(-9, -54, 18, 21, 3);
    ctx.fill();
    drawMaltlineFlavorSymbol(ctx, 0, -43, flavor, 0.52);

    // A small physical collar carries ready/processing information even while
    // a different flavor is selected in the retained comparison fixture.
    if (selected || processing || ready) {
      ctx.fillStyle = ready
        ? STATION.ready
        : processing
          ? STATION.processing
          : STATION.selectedKeyline;
      ctx.fillRect(-7, -30, 14, 2);
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
      ctx.font = '800 15px "Maltline UI", system-ui, sans-serif';
      const halfWidth = (ctx.measureText(popup.text).width * scale) / 2 + 8;
      ctx.translate(
        Math.max(halfWidth, Math.min(CANVAS_W - halfWidth, popup.x)),
        popup.y,
      );
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
      const service = this.layout.project(
        0,
        this.layout.counterFrontY(callout.lane),
      );
      const x = service.x + 18;
      const y = service.y - 65 * service.scale;
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
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_H * 0.42,
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_W * 0.72,
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
      const pulse = this.reducedMotion
        ? 1
        : 1 + Math.sin(state.tick / 5) * 0.04;
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
    ctx.roundRect(
      ordersChip.x,
      ordersChip.y,
      ordersChip.width,
      ordersChip.height,
      12,
    );
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
    ctx.roundRect(
      livesChip.x,
      livesChip.y,
      livesChip.width,
      livesChip.height,
      12,
    );
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

import { FIXED_SCALE, MARBLE_RADIUS, toWorldUnits } from '../core/constants';
import type {
  DeckSpec,
  DynamicObstacleState,
  GateSpec,
  RectangleSpec,
  RollSignalCourse,
  RollSignalEvent,
  RollSignalState,
} from '../core/types';

const WIDTH = 1200;
const HEIGHT = 760;
const MODEL_TOP = 76;
const MODEL_BOTTOM = 704;

interface ProjectedPoint { x: number; y: number }
interface ViewTransform { scale: number; centerX: number; offsetY: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string }

const COLORS = {
  void: '#10132e',
  voidLine: 'rgba(102, 122, 196, .12)',
  deck: '#e8dfca',
  deckLight: '#f6efdf',
  deckSide: '#a49c91',
  deckEdge: '#24294f',
  slick: '#b9d5d0',
  teal: '#3f9993',
  tealDark: '#286b6a',
  coral: '#ef705f',
  coralDark: '#a84543',
  brass: '#d8aa48',
  cobalt: '#5577e2',
  bone: '#f2ead7',
};

export class RollSignalRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private course: RollSignalCourse | null = null;
  private view: ViewTransform = { scale: 1, centerX: WIDTH / 2, offsetY: 150 };
  private readonly sparks: Spark[] = [];
  private previousOrb: ProjectedPoint | null = null;
  private kick = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  notify(events: readonly RollSignalEvent[], state: RollSignalState): void {
    for (const event of events) {
      if (event.type === 'obstacle_hit' || event.type === 'rail_hit') this.kick = Math.max(this.kick, 3.5);
      if (this.reducedMotion) continue;
      if (event.type === 'tone_ring') this.emitAtState(state, COLORS.brass, 14);
      if (event.type === 'checkpoint_reached' || event.type === 'relay_pad') this.emitAtState(state, COLORS.teal, 10);
      if (event.type === 'fell') this.emitAtState(state, COLORS.coral, 18);
      if (event.type === 'goal_reached') this.emitAtState(state, COLORS.brass, 34);
    }
  }

  draw(state: RollSignalState, course: RollSignalCourse, elapsed = performance.now()): void {
    if (this.course !== course) {
      this.course = course;
      this.view = this.createView(course);
      this.previousOrb = null;
    }
    const context = this.context;
    context.save();
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (this.kick > .1 && !this.reducedMotion) {
      context.translate(Math.sin(elapsed * .18) * this.kick, Math.cos(elapsed * .14) * this.kick * .45);
      this.kick *= .76;
    }
    this.drawVoid();
    this.drawModelShadow(course);
    this.drawDecks(course, elapsed);
    this.drawZones(course, elapsed);
    this.drawPads(course, state, elapsed);
    this.drawRings(course, state, elapsed);
    this.drawCheckpoints(course, state, elapsed);
    this.drawGoal(course, state, elapsed);
    this.drawRails(course);
    this.drawGates(course, state);
    this.drawObstacles(state.obstacles, elapsed);
    this.drawOrb(state, elapsed);
    this.drawSparks();
    this.drawModelMarks(course);
    context.restore();
  }

  private createView(course: RollSignalCourse): ViewTransform {
    const points: ProjectedPoint[] = [];
    const addRect = (rect: RectangleSpec): void => {
      for (const [x, y] of [
        [rect.x, rect.y], [rect.x + rect.width, rect.y],
        [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height],
      ]) points.push(this.projectRaw(x, y));
    };
    for (const deck of course.decks) addRect(deck);
    for (const rail of course.rails) addRect(rail);
    for (const gate of course.gates ?? []) addRect(gate);
    for (const obstacle of course.obstacles ?? []) {
      addRect(obstacle);
      if (obstacle.motion) {
        addRect({ ...obstacle, x: obstacle.x + (obstacle.motion.axis === 'x' ? obstacle.motion.range : 0), y: obstacle.y + (obstacle.motion.axis === 'y' ? obstacle.motion.range : 0) });
      }
    }
    if (points.length === 0) return { scale: 1, centerX: WIDTH / 2, offsetY: 120 };
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const scale = Math.min((WIDTH - 150) / Math.max(1, maxX - minX), (MODEL_BOTTOM - MODEL_TOP) / Math.max(1, maxY - minY));
    return {
      scale,
      centerX: WIDTH / 2 - ((minX + maxX) / 2) * scale,
      offsetY: MODEL_TOP - minY * scale,
    };
  }

  private projectRaw(x: number, y: number): ProjectedPoint {
    return { x: (x - y) * .8660254, y: (x + y) * .5 };
  }

  private project(x: number, y: number, z = 0): ProjectedPoint {
    const raw = this.projectRaw(x, y);
    return {
      x: this.view.centerX + raw.x * this.view.scale,
      y: this.view.offsetY + raw.y * this.view.scale - z * this.view.scale,
    };
  }

  private drawVoid(): void {
    const context = this.context;
    const gradient = context.createRadialGradient(790, 270, 20, 610, 380, 710);
    gradient.addColorStop(0, '#222650');
    gradient.addColorStop(.46, COLORS.void);
    gradient.addColorStop(1, '#090b22');
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.strokeStyle = COLORS.voidLine;
    context.lineWidth = 1;
    for (let y = -160; y < HEIGHT + 180; y += 46) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(WIDTH, y + 240);
      context.stroke();
      context.beginPath();
      context.moveTo(0, y + 240);
      context.lineTo(WIDTH, y);
      context.stroke();
    }
  }

  private drawModelShadow(course: RollSignalCourse): void {
    const context = this.context;
    context.save();
    context.translate(22, 30);
    context.fillStyle = 'rgba(1, 3, 17, .32)';
    for (const deck of course.decks) this.fillProjectedRect(deck, 0);
    context.restore();
  }

  private drawDecks(course: RollSignalCourse, elapsed: number): void {
    const ordered = [...course.decks].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const deck of ordered) this.drawDeck(deck, elapsed);
  }

  private drawDeck(deck: DeckSpec, elapsed: number): void {
    const context = this.context;
    const depth = 8;
    const corners = this.rectCorners(deck);
    const lowered = corners.map((point) => ({ x: point.x, y: point.y + depth }));
    context.fillStyle = COLORS.deckSide;
    context.beginPath();
    context.moveTo(corners[2]!.x, corners[2]!.y);
    context.lineTo(corners[3]!.x, corners[3]!.y);
    context.lineTo(lowered[3]!.x, lowered[3]!.y);
    context.lineTo(lowered[2]!.x, lowered[2]!.y);
    context.closePath();
    context.fill();
    context.fillStyle = '#777586';
    context.beginPath();
    context.moveTo(corners[1]!.x, corners[1]!.y);
    context.lineTo(corners[2]!.x, corners[2]!.y);
    context.lineTo(lowered[2]!.x, lowered[2]!.y);
    context.lineTo(lowered[1]!.x, lowered[1]!.y);
    context.closePath();
    context.fill();
    context.fillStyle = deck.surface === 'slick' ? COLORS.slick : COLORS.deck;
    this.pathProjectedRect(deck);
    context.fill();
    context.strokeStyle = COLORS.deckEdge;
    context.lineWidth = 2.2;
    context.stroke();

    context.save();
    this.pathProjectedRect(deck);
    context.clip();
    context.strokeStyle = deck.surface === 'slick' ? 'rgba(32,93,102,.28)' : 'rgba(43,45,70,.11)';
    context.lineWidth = 1;
    const phase = this.reducedMotion ? 0 : (elapsed * .008) % 16;
    for (let x = -WIDTH; x < WIDTH * 2; x += 16) {
      context.beginPath();
      context.moveTo(x + phase, 0);
      context.lineTo(x - 180 + phase, HEIGHT);
      context.stroke();
    }
    context.restore();
  }

  private drawZones(course: RollSignalCourse, elapsed: number): void {
    const context = this.context;
    for (const zone of course.zones ?? []) {
      context.save();
      this.pathProjectedRect(zone);
      context.clip();
      context.globalAlpha = .68;
      context.fillStyle = zone.kind === 'wind' ? 'rgba(85,119,226,.16)' : 'rgba(216,170,72,.22)';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      const magnitude = Math.hypot(zone.forceX, zone.forceY) || 1;
      const ux = zone.forceX / magnitude;
      const uy = zone.forceY / magnitude;
      const projected = this.projectRaw(ux, uy);
      const phase = this.reducedMotion ? 0 : (elapsed * .05) % 34;
      context.strokeStyle = zone.kind === 'wind' ? COLORS.cobalt : COLORS.brass;
      context.lineWidth = zone.kind === 'wind' ? 2 : 4;
      for (let offset = -800; offset < 900; offset += 34) {
        const x = 600 + offset + phase;
        const y = 360 + offset * .2;
        context.beginPath();
        context.moveTo(x - projected.x * 13, y - projected.y * 13);
        context.lineTo(x + projected.x * 13, y + projected.y * 13);
        context.stroke();
      }
      context.restore();
    }
  }

  private drawPads(course: RollSignalCourse, state: RollSignalState, elapsed: number): void {
    const context = this.context;
    for (const pad of course.relayPads ?? []) {
      const point = this.project(pad.x, pad.y, .04);
      const active = state.activeRelayPads.includes(pad.id);
      const radius = Math.max(8, pad.radius * this.view.scale * .75);
      context.save();
      context.translate(point.x, point.y);
      context.scale(1, .56);
      context.fillStyle = active ? COLORS.teal : '#c9c2b3';
      context.strokeStyle = active ? '#9ff7e9' : COLORS.cobalt;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(0, 0, radius * (.48 + Math.sin(elapsed * .004) * .05), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  private drawRings(course: RollSignalCourse, state: RollSignalState, elapsed: number): void {
    const context = this.context;
    for (const ring of course.rings) {
      if (state.ringsCollected.includes(ring.id)) continue;
      const point = this.project(ring.x, ring.y, .8);
      const radius = Math.max(8, ring.radius * this.view.scale * .68);
      const bob = this.reducedMotion ? 0 : Math.sin(elapsed * .005 + ring.x) * 3;
      context.save();
      context.translate(point.x, point.y + bob);
      context.strokeStyle = COLORS.brass;
      context.shadowColor = COLORS.brass;
      context.shadowBlur = 13;
      context.lineWidth = 5;
      context.beginPath();
      context.ellipse(0, 0, radius, radius * .74, -.52, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  private drawCheckpoints(course: RollSignalCourse, state: RollSignalState, elapsed: number): void {
    const context = this.context;
    for (const checkpoint of course.checkpoints) {
      const base = this.project(checkpoint.x, checkpoint.y, .05);
      const active = state.checkpointId === checkpoint.id;
      const height = Math.max(18, checkpoint.radius * this.view.scale * 1.2);
      const glow = active && !this.reducedMotion ? .65 + Math.sin(elapsed * .008) * .2 : .28;
      context.save();
      context.strokeStyle = active ? '#93f0df' : COLORS.tealDark;
      context.shadowColor = COLORS.teal;
      context.shadowBlur = active ? 14 : 0;
      context.globalAlpha = glow + .35;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(base.x - 9, base.y - height);
      context.lineTo(base.x - 9, base.y - 6);
      context.quadraticCurveTo(base.x, base.y + 2, base.x + 9, base.y - 6);
      context.lineTo(base.x + 9, base.y - height);
      context.stroke();
      context.restore();
    }
  }

  private drawGoal(course: RollSignalCourse, state: RollSignalState, elapsed: number): void {
    const context = this.context;
    const goal = course.goal;
    const base = this.project(goal.x, goal.y, .05);
    const width = Math.max(30, goal.radius * this.view.scale * 1.4);
    const pulse = state.status === 'won' && !this.reducedMotion ? Math.sin(elapsed * .025) * 7 : 0;
    context.save();
    context.translate(base.x, base.y);
    context.strokeStyle = COLORS.brass;
    context.fillStyle = '#7a5624';
    context.lineWidth = 7;
    context.shadowColor = COLORS.brass;
    context.shadowBlur = 12 + Math.abs(pulse);
    context.beginPath();
    context.moveTo(-width * .55, -width * .8);
    context.lineTo(-width * .55 + pulse * .12, -8);
    context.quadraticCurveTo(0, width * .18, width * .55 - pulse * .12, -8);
    context.lineTo(width * .55, -width * .8);
    context.stroke();
    context.beginPath();
    context.ellipse(0, 1, width * .8, width * .28, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawRails(course: RollSignalCourse): void {
    for (const rail of course.rails) this.drawRaisedRect(rail, COLORS.tealDark, COLORS.teal, 12);
  }

  private drawGates(course: RollSignalCourse, state: RollSignalState): void {
    for (const gate of course.gates ?? []) {
      if (state.openGateIds.includes(gate.id)) continue;
      this.drawRaisedRect(gate, COLORS.coralDark, COLORS.coral, 20);
    }
  }

  private drawObstacles(obstacles: readonly DynamicObstacleState[], elapsed: number): void {
    for (const obstacle of obstacles) {
      const rect = {
        id: obstacle.id,
        x: obstacle.x / FIXED_SCALE,
        y: obstacle.y / FIXED_SCALE,
        width: obstacle.width / FIXED_SCALE,
        height: obstacle.height / FIXED_SCALE,
      };
      this.drawRaisedRect(rect, COLORS.coralDark, COLORS.coral, 15);
      const center = this.project(rect.x + rect.width / 2, rect.y + rect.height / 2, .32);
      const context = this.context;
      context.save();
      context.translate(center.x, center.y);
      context.rotate(this.reducedMotion ? 0 : elapsed * .002);
      context.fillStyle = COLORS.bone;
      context.fillRect(-2, -8, 4, 16);
      context.fillRect(-8, -2, 16, 4);
      context.restore();
    }
  }

  private drawRaisedRect(rect: RectangleSpec, side: string, top: string, lift: number): void {
    const context = this.context;
    const corners = this.rectCorners(rect);
    context.fillStyle = side;
    context.beginPath();
    context.moveTo(corners[1]!.x, corners[1]!.y - lift);
    context.lineTo(corners[2]!.x, corners[2]!.y - lift);
    context.lineTo(corners[2]!.x, corners[2]!.y);
    context.lineTo(corners[1]!.x, corners[1]!.y);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(corners[2]!.x, corners[2]!.y - lift);
    context.lineTo(corners[3]!.x, corners[3]!.y - lift);
    context.lineTo(corners[3]!.x, corners[3]!.y);
    context.lineTo(corners[2]!.x, corners[2]!.y);
    context.closePath();
    context.fill();
    context.save();
    context.translate(0, -lift);
    context.fillStyle = top;
    context.strokeStyle = COLORS.deckEdge;
    context.lineWidth = 1.6;
    this.pathProjectedRect(rect);
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawOrb(state: RollSignalState, elapsed: number): void {
    const x = toWorldUnits(state.position.x);
    const y = toWorldUnits(state.position.y);
    const speed = Math.hypot(state.velocity.x, state.velocity.y);
    const radius = Math.max(8, (MARBLE_RADIUS / FIXED_SCALE) * this.view.scale * .9);
    const point = this.project(x, y, .48);
    const ground = this.project(x, y, .02);
    const context = this.context;

    if (this.previousOrb && !this.reducedMotion && speed > 16) {
      context.strokeStyle = `rgba(104, 213, 229, ${Math.min(.38, speed / 520)})`;
      context.lineWidth = radius * .8;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(this.previousOrb.x, this.previousOrb.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    this.previousOrb = point;

    context.save();
    context.translate(ground.x, ground.y + 4);
    context.scale(1, .46);
    context.fillStyle = 'rgba(4,6,24,.4)';
    context.beginPath();
    context.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const gradient = context.createRadialGradient(point.x - radius * .38, point.y - radius * .42, 1, point.x, point.y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(.18, '#c7fbff');
    gradient.addColorStop(.5, '#62cde0');
    gradient.addColorStop(.78, '#5577e2');
    gradient.addColorStop(1, '#1f285e');
    context.fillStyle = gradient;
    context.shadowColor = '#62cde0';
    context.shadowBlur = 12 + Math.min(18, speed / 10);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(255,255,255,.65)';
    context.lineWidth = 1.5;
    context.stroke();
    context.save();
    context.translate(point.x, point.y);
    context.rotate((state.tick * speed) / 9000);
    context.strokeStyle = 'rgba(255,255,255,.55)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, radius * .55, -.9, .9);
    context.stroke();
    context.restore();

    if (state.currentInput.brace) {
      context.strokeStyle = COLORS.teal;
      context.lineWidth = 3;
      context.setLineDash([5, 6]);
      context.beginPath();
      context.ellipse(ground.x, ground.y + 2, radius * 1.7, radius * .7, 0, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
  }

  private drawModelMarks(course: RollSignalCourse): void {
    const context = this.context;
    context.fillStyle = 'rgba(242,234,215,.56)';
    context.font = '800 10px ui-monospace, monospace';
    context.letterSpacing = '1px';
    context.fillText(`RS / ${String(course.number).padStart(2, '0')}`, 28, HEIGHT - 26);
    context.textAlign = 'right';
    context.fillText('MUNICIPAL SIGNAL MODEL · 60 HZ', WIDTH - 28, HEIGHT - 26);
    context.textAlign = 'left';
  }

  private emitAtState(state: RollSignalState, color: string, count: number): void {
    const point = this.project(toWorldUnits(state.position.x), toWorldUnits(state.position.y), .5);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const speed = 1.5 + (index % 5) * .55;
      this.sparks.push({ x: point.x, y: point.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.2, life: 22 + index % 13, color });
    }
  }

  private drawSparks(): void {
    const context = this.context;
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index]!;
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vy += .09;
      spark.life -= 1;
      if (spark.life <= 0) {
        this.sparks.splice(index, 1);
        continue;
      }
      context.globalAlpha = Math.min(1, spark.life / 12);
      context.fillStyle = spark.color;
      context.fillRect(spark.x - 2, spark.y - 2, 4, 4);
    }
    context.globalAlpha = 1;
  }

  private rectCorners(rect: RectangleSpec): ProjectedPoint[] {
    return [
      this.project(rect.x, rect.y),
      this.project(rect.x + rect.width, rect.y),
      this.project(rect.x + rect.width, rect.y + rect.height),
      this.project(rect.x, rect.y + rect.height),
    ];
  }

  private pathProjectedRect(rect: RectangleSpec): void {
    const corners = this.rectCorners(rect);
    const context = this.context;
    context.beginPath();
    context.moveTo(corners[0]!.x, corners[0]!.y);
    for (let index = 1; index < corners.length; index += 1) context.lineTo(corners[index]!.x, corners[index]!.y);
    context.closePath();
  }

  private fillProjectedRect(rect: RectangleSpec, z: number): void {
    const context = this.context;
    const corners = [
      this.project(rect.x, rect.y, z),
      this.project(rect.x + rect.width, rect.y, z),
      this.project(rect.x + rect.width, rect.y + rect.height, z),
      this.project(rect.x, rect.y + rect.height, z),
    ];
    context.beginPath();
    context.moveTo(corners[0]!.x, corners[0]!.y);
    for (let index = 1; index < corners.length; index += 1) context.lineTo(corners[index]!.x, corners[index]!.y);
    context.closePath();
    context.fill();
  }
}

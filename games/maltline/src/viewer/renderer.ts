import { FIXED_SCALE } from '../core/engine';
import type {
  CustomerState,
  FlavorId,
  GameEvent,
  MaltlineScenario,
  MaltlineState,
} from '../core/types';
import { FLAVOR_LABELS } from '../core/types';

const CANVAS_W = 960;
const CANVAS_H = 540;
const HUD_H = 46;
const AWNING_H = 16;
const LANES_TOP = 60;
const LANES_BOTTOM = 350;
const COUNTER_X = 104;
const DOOR_X = 900;
const BANK_TOP = 372;
const MACHINE_BASELINE = 466;

const WALL_TOP = '#0e3a2c';
const WALL_BOTTOM = '#07211a';
const WOOD = '#8a5a33';
const WOOD_LIGHT = '#b07a44';
const WOOD_DARK = '#5d3a20';
const CREAM = '#f3e9d2';
const CREAM_DIM = '#d9c8a6';
const BRASS = '#c9a961';
const BRASS_DARK = '#8a6f3a';
const INK = '#122822';
const STEAM = 'rgba(246, 231, 201,';

interface FlavorArt {
  base: string;
  dark: string;
  light: string;
  glow: string;
}

const FLAVOR_ART: Record<FlavorId, FlavorArt> = {
  vanilla: { base: '#f6e7c9', dark: '#d6b98a', light: '#fff8ea', glow: '#ffe9b8' },
  chocolate: { base: '#7a4a24', dark: '#54301a', light: '#a06a38', glow: '#c98a4a' },
  strawberry: { base: '#f28cb4', dark: '#c9557f', light: '#ffb3d0', glow: '#ff9ec4' },
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  size: number;
  color: string;
  gravity: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
  ttl: number;
  color: string;
}

interface Flash {
  lane: number;
  age: number;
  ttl: number;
  color: string;
}

export interface DrawMeta {
  stageIndex: number;
  stageCount: number;
}

/** Deterministic per-index shuffle for hair/wardrobe pairing. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length]!;
}

const SHIRTS: ReadonlyArray<[string, string]> = [
  ['#e8b04b', '#c58a2d'],
  ['#d97742', '#b25a2e'],
  ['#8f7fb8', '#6d5f96'],
  ['#5f9ea0', '#467c7e'],
  ['#b85f75', '#96475c'],
  ['#7f9e5f', '#62804a'],
  ['#5b8bd0', '#43699f'],
];
const HAIRS: ReadonlyArray<[string, string]> = [
  ['#2b1d12', '#46301c'],
  ['#6b4726', '#8a5f36'],
  ['#1d2b12', '#33471f'],
  ['#513045', '#6f4460'],
  ['#3a3f44', '#565c63'],
];
const SKINS: ReadonlyArray<[string, string]> = [
  ['#f0c8a0', '#d8a878'],
  ['#e9c39b', '#caa27a'],
  ['#c98e5f', '#a86f47'],
  ['#8d5a3a', '#6f452c'],
];

export class MaltlineRenderer {
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private flashes: Flash[] = [];
  private shake = 0;
  private laneHeight = 90;
  private scenario: MaltlineScenario | null = null;
  private motes = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 373 % CANVAS_W),
    y: 80 + (i * 197 % 240),
    phase: (i * 0.7) % (Math.PI * 2),
    speed: 0.3 + (i % 5) * 0.12,
  }));

  setScenario(scenario: MaltlineScenario): void {
    this.scenario = scenario;
    this.laneHeight = Math.min(92, (LANES_BOTTOM - LANES_TOP) / scenario.lanes);
  }

  laneCenterY(lane: number): number {
    return LANES_TOP + lane * this.laneHeight + this.laneHeight / 2;
  }

  lanePx(scenario: MaltlineScenario, x: number): number {
    return COUNTER_X + (x / (scenario.laneLength * FIXED_SCALE)) * (DOOR_X - COUNTER_X);
  }

  pushEvents(events: GameEvent[], state: MaltlineState): void {
    for (const event of events) {
      switch (event.type) {
        case 'shake_smashed':
          this.burst(DOOR_X - 18, this.laneCenterY(event.lane), FLAVOR_ART[event.flavor].base, 14);
          this.burst(DOOR_X - 18, this.laneCenterY(event.lane), FLAVOR_ART[event.flavor].light, 8);
          this.shake = Math.max(this.shake, 7);
          break;
        case 'jar_smashed':
          this.burst(COUNTER_X + 16, this.laneCenterY(event.lane), '#cfd8d4', 12);
          this.shake = Math.max(this.shake, 6);
          break;
        case 'walkout':
          this.flashes.push({ lane: event.lane, age: 0, ttl: 480, color: '#ff6b5e' });
          this.burst(COUNTER_X + 22, this.laneCenterY(event.lane), '#ff6b5e', 10);
          this.shake = Math.max(this.shake, 8);
          break;
        case 'jar_caught':
          this.burst(COUNTER_X + 28, this.laneCenterY(event.lane), CREAM, 6, -60);
          this.popup(COUNTER_X + 28, this.laneCenterY(event.lane) - 30, '+25', CREAM_DIM);
          break;
        case 'served': {
          const customer = state.customers.find((candidate) => candidate.id === event.customerId);
          if (customer && this.scenario) {
            const px = this.lanePx(this.scenario, customer.x);
            const bonus = state.streak > 1 ? ` ×${state.streak}` : '';
            this.popup(px, this.laneCenterY(customer.lane) - 34, `+${100 + Math.min(state.streak - 1, 10) * 10}${bonus}`, FLAVOR_ART[event.flavor].light);
            this.burst(px, this.laneCenterY(customer.lane), FLAVOR_ART[event.flavor].light, 7, -40);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private burst(x: number, y: number, color: string, count: number, lift = -30): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 50 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + lift,
        age: 0,
        ttl: 420 + Math.random() * 260,
        size: 1.6 + Math.random() * 2.6,
        color,
        gravity: 300,
      });
    }
  }

  private popup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, age: 0, ttl: 900, color });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.particles = this.particles.filter((particle) => {
      particle.age += dtMs;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      return particle.age < particle.ttl;
    });
    this.popups = this.popups.filter((popup) => {
      popup.age += dtMs;
      popup.y -= dt * 34;
      return popup.age < popup.ttl;
    });
    this.flashes = this.flashes.filter((flash) => {
      flash.age += dtMs;
      return flash.age < flash.ttl;
    });
    this.shake *= Math.pow(0.03, dt);
    if (this.shake < 0.2) this.shake = 0;
  }

  draw(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState, meta: DrawMeta): void {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawWall(ctx, state);
    this.drawAwning(ctx);
    this.drawMenuBoard(ctx, scenario);
    this.drawLamps(ctx, scenario);
    this.drawCounters(ctx, scenario, state);
    this.drawDoors(ctx, scenario);
    this.drawMotes(ctx, state);
    this.drawCustomers(ctx, scenario, state);
    this.drawSlides(ctx, scenario, state);
    this.drawJars(ctx, scenario, state);
    this.drawStationBank(ctx, scenario, state);
    this.drawPlayer(ctx, scenario, state);
    this.drawParticles(ctx);
    this.drawPopups(ctx);
    this.drawVignette(ctx);

    ctx.restore();
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

  private drawMenuBoard(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    const x = 10;
    const y = HUD_H + AWNING_H + 26;
    const w = COUNTER_X - 32;
    const h = 216;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#6b4426';
    ctx.beginPath();
    ctx.roundRect(x - 5, y - 5, w + 10, h + 10, 10);
    ctx.fill();
    ctx.restore();

    const board = ctx.createLinearGradient(0, y, 0, y + h);
    board.addColorStop(0, '#1d4433');
    board.addColorStop(1, '#132e23');
    ctx.fillStyle = board;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = CREAM;
    ctx.font = '700 15px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('M E N U', x + w / 2, y + 26);
    ctx.strokeStyle = 'rgba(159, 196, 178, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 36);
    ctx.lineTo(x + w - 12, y + 36);
    ctx.stroke();

    const flavors = [...new Set(scenario.stations)];
    let fy = y + 64;
    for (const flavor of flavors) {
      this.drawSoftServe(ctx, x + 24, fy + 12, flavor, 0.85);
      ctx.textAlign = 'left';
      ctx.fillStyle = CREAM;
      ctx.font = '600 12px "Avenir Next", system-ui, sans-serif';
      ctx.fillText(FLAVOR_LABELS[flavor], x + 44, fy + 10);
      ctx.fillStyle = BRASS;
      ctx.font = '700 12px "Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('4.50', x + w - 12, fy + 10);
      fy += 36;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(159, 196, 178, 0.75)';
    ctx.font = 'italic 10px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('hand-spun · fresh daily', x + 12, y + h - 14);
    ctx.textAlign = 'left';
  }

  private drawLamps(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const cx = COUNTER_X + (DOOR_X - COUNTER_X) * 0.45;
      const y = LANES_TOP + lane * this.laneHeight;
      const top = HUD_H + AWNING_H;

      // Light cone behind everything in the lane.
      const cone = ctx.createLinearGradient(0, top, 0, y + this.laneHeight);
      cone.addColorStop(0, 'rgba(255, 215, 107, 0.13)');
      cone.addColorStop(1, 'rgba(255, 215, 107, 0.02)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(cx - 12, top);
      ctx.lineTo(cx + 12, top);
      ctx.lineTo(cx + 90, y + this.laneHeight);
      ctx.lineTo(cx - 90, y + this.laneHeight);
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
      const y = LANES_TOP + lane * this.laneHeight;
      const h = this.laneHeight - 24;
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
      }

      for (const flash of this.flashes.filter((candidate) => candidate.lane === lane)) {
        const alpha = Math.max(0, 1 - flash.age / flash.ttl) * 0.4;
        ctx.fillStyle = `rgba(255, 107, 94, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(COUNTER_X - 14, y + 8, DOOR_X - COUNTER_X + 12, h, 10);
        ctx.fill();
      }
    }
  }

  private drawDoors(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = LANES_TOP + lane * this.laneHeight;
      const w = 42;
      const h = Math.min(66, this.laneHeight - 18);
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
    ctx.font = '600 10px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('QUEUE →', DOOR_X - 10, LANES_TOP - 10);
    ctx.textAlign = 'left';
  }

  private drawMotes(ctx: CanvasRenderingContext2D, state: MaltlineState): void {
    ctx.save();
    for (const mote of this.motes) {
      const t = state.tick / 60 + mote.phase;
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
      const px = this.lanePx(scenario, customer.x);
      const groundY = LANES_TOP + customer.lane * this.laneHeight + this.laneHeight - 18;
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
    const walking = customer.phase === 'marching';
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
        const sweat = ((state.tick + customer.id * 11) % 40) / 40;
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
      this.drawCup(ctx, cx - 13, headY + 2, customer.flavor, 0.75, -0.5);
    } else if (customer.phase === 'leaving') {
      ctx.fillStyle = 'rgba(159, 196, 178, 0.95)';
      ctx.font = '13px system-ui, sans-serif';
      const hop = Math.sin((state.tick + customer.id * 5) / 5) * 2;
      ctx.fillText('♪', cx + 11, headY - 8 + hop);
    } else {
      // Order bubble.
      const sway = Math.sin((state.tick + customer.id * 13) / 30) * 2;
      this.drawOrderBubble(ctx, cx, headY - 30 + sway, customer.flavor);
      if (impatient) {
        ctx.strokeStyle = 'rgba(255, 107, 94, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, headY, 14.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawOrderBubble(ctx: CanvasRenderingContext2D, x: number, y: number, flavor: FlavorId): void {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(10, 28, 21, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 13, 32, 26, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = FLAVOR_ART[flavor].base;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 13, 32, 26, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 12);
    ctx.lineTo(x + 4, y + 12);
    ctx.lineTo(x, y + 17);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10, 28, 21, 0.92)';
    ctx.fill();

    this.drawSoftServe(ctx, x, y + 2, flavor, 0.92);
  }

  /** Two-tone soft-serve swirl with a chocolate dip ring. */
  private drawSoftServe(ctx: CanvasRenderingContext2D, x: number, y: number, flavor: FlavorId, scale: number): void {
    const art = FLAVOR_ART[flavor];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // Swirl stacked blobs.
    const tiers: Array<[number, number, number]> = [[0, 2, 6.5], [0, -3, 5], [0, -7.5, 3.5], [0, -10.5, 2]];
    for (const [tx, ty, r] of tiers) {
      ctx.fillStyle = art.base;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = art.light;
    ctx.beginPath();
    ctx.arc(-1.5, -7, 2.2, 0, Math.PI * 2);
    ctx.arc(-2, 1, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = art.dark;
    ctx.beginPath();
    ctx.arc(2.5, 0.5, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCup(ctx: CanvasRenderingContext2D, x: number, y: number, flavor: FlavorId, scale: number, rotate = 0): void {
    const art = FLAVOR_ART[flavor];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.scale(scale, scale);

    // Cup body (tapered).
    const body = ctx.createLinearGradient(-7, 0, 7, 0);
    body.addColorStop(0, CREAM_DIM);
    body.addColorStop(0.35, '#fdf6e4');
    body.addColorStop(1, CREAM_DIM);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-7, -12);
    ctx.lineTo(7, -12);
    ctx.lineTo(5, 12);
    ctx.lineTo(-5, 12);
    ctx.closePath();
    ctx.fill();

    // Flavor band.
    ctx.fillStyle = art.base;
    ctx.beginPath();
    ctx.moveTo(-6.4, -4);
    ctx.lineTo(6.4, -4);
    ctx.lineTo(5.6, 4);
    ctx.lineTo(-5.6, 4);
    ctx.closePath();
    ctx.fill();

    // Glossy highlight.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.roundRect(-4.5, -11, 2.4, 20, 1.2);
    ctx.fill();

    // Dome lid with swirl on top.
    ctx.fillStyle = '#fdf6e4';
    ctx.beginPath();
    ctx.arc(0, -12, 7.4, Math.PI, 0);
    ctx.fill();
    this.drawSoftServe(ctx, 0, -14, flavor, 0.72);

    // Straw.
    ctx.strokeStyle = '#ff8f6b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(2.5, -16);
    ctx.lineTo(6.5, -25);
    ctx.stroke();
    ctx.restore();
  }

  private drawJar(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // Glass body with translucency.
    const glass = ctx.createLinearGradient(-7, 0, 7, 0);
    glass.addColorStop(0, 'rgba(207, 216, 212, 0.55)');
    glass.addColorStop(0.4, 'rgba(240, 246, 244, 0.35)');
    glass.addColorStop(1, 'rgba(180, 196, 190, 0.55)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-6.5, -10);
    ctx.lineTo(6.5, -10);
    ctx.lineTo(5, 11);
    ctx.lineTo(-5, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 240, 237, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Rim.
    ctx.fillStyle = '#cfd8d4';
    ctx.beginPath();
    ctx.roundRect(-7.5, -13, 15, 4, 2);
    ctx.fill();
    // Sparkle.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.roundRect(-3.5, -7, 2, 9, 1);
    ctx.fill();
    ctx.restore();
  }

  private drawSlides(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const slide of state.slides) {
      const px = this.lanePx(scenario, slide.x);
      const groundY = LANES_TOP + slide.lane * this.laneHeight + this.laneHeight - 22;
      // Motion trail.
      const art = FLAVOR_ART[slide.flavor];
      const trail = ctx.createLinearGradient(px - 46, 0, px - 6, 0);
      trail.addColorStop(0, 'rgba(255,255,255,0)');
      trail.addColorStop(1, withAlpha(art.light, 0.4));
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.roundRect(px - 46, groundY - 12, 40, 12, 6);
      ctx.fill();
      const wobble = Math.sin((state.tick + slide.id * 5) / 3.2) * 0.1;
      this.drawCup(ctx, px, groundY - 12, slide.flavor, 1.25, wobble);
    }
  }

  private drawJars(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const jar of state.jars) {
      const px = this.lanePx(scenario, jar.x);
      const groundY = LANES_TOP + jar.lane * this.laneHeight + this.laneHeight - 20;
      ctx.strokeStyle = 'rgba(207, 216, 212, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 10, groundY - 14);
      ctx.lineTo(px + 22, groundY - 14);
      ctx.stroke();
      this.drawJar(ctx, px, groundY - 12, 1.3);
    }
  }

  private drawStationBank(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
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

    ctx.fillStyle = 'rgba(159, 196, 178, 0.75)';
    ctx.font = '600 10px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('S T A T I O N S', COUNTER_X - 44, BANK_TOP + 2);

    const count = scenario.stations.length;
    const gap = 30;
    const width = (DOOR_X - COUNTER_X - gap * (count - 1)) / count;
    for (let index = 0; index < count; index++) {
      const flavor = scenario.stations[index]!;
      const cx = COUNTER_X + index * (width + gap) + width / 2;
      this.drawMachine(ctx, cx, MACHINE_BASELINE, flavor, scenario, state, index === state.player.station);
    }

    this.drawJarGauge(ctx, scenario, state);
  }

  private drawMachine(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseline: number,
    flavor: FlavorId,
    scenario: MaltlineScenario,
    state: MaltlineState,
    active: boolean,
  ): void {
    const art = FLAVOR_ART[flavor];
    const mw = 74;
    const mh = 96;
    const x = cx - mw / 2;
    const y = baseline - mh;
    const blending = active && state.player.blending !== null;
    const progress = blending ? Math.min(1, state.player.blendProgress / scenario.blendTicks) : 0;

    if (active) {
      // Soft selection halo.
      const halo = ctx.createRadialGradient(cx, y + mh / 2, 20, cx, y + mh / 2, 90);
      halo.addColorStop(0, 'rgba(243, 233, 210, 0.16)');
      halo.addColorStop(1, 'rgba(243, 233, 210, 0)');
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

    const liquidH = (hopperH - 8) * (blending ? 0.25 + 0.75 * progress : 0.9);
    const liquid = ctx.createLinearGradient(0, hopperY + hopperH - liquidH, 0, hopperY + hopperH);
    liquid.addColorStop(0, art.light);
    liquid.addColorStop(1, art.dark);
    ctx.fillStyle = liquid;
    ctx.beginPath();
    ctx.roundRect(hopperX + 3, hopperY + hopperH - liquidH - 3, hopperW - 6, liquidH, 5);
    ctx.fill();
    if (blending) {
      // Swirl surface.
      ctx.strokeStyle = withAlpha(art.light, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const sx = hopperX + 4 + (i / 12) * (hopperW - 8);
        const sy = hopperY + hopperH - liquidH - 3 + Math.sin(i / 2 + state.tick / 3) * 2;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // Brand plate + label.
    ctx.fillStyle = art.base;
    ctx.beginPath();
    ctx.roundRect(cx - 24, y + 48, 48, 16, 4);
    ctx.fill();
    ctx.fillStyle = flavor === 'vanilla' ? '#54301a' : '#fdf6e4';
    ctx.font = '700 10px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(FLAVOR_LABELS[flavor].toUpperCase(), cx, y + 59);
    ctx.textAlign = 'left';

    // Indicator lights.
    ctx.fillStyle = active ? '#7dffa8' : 'rgba(125, 255, 168, 0.25)';
    ctx.beginPath();
    ctx.arc(cx - 8, y + mh - 12, 3, 0, Math.PI * 2);
    ctx.fill();
    if (blending) {
      ctx.fillStyle = '#ffd76b';
      ctx.beginPath();
      ctx.arc(cx + 8, y + mh - 12, 3 + Math.sin(state.tick / 2.5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Brass spout over the drip tray.
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.roundRect(cx - 3, y + mh - 22, 6, 8, 2);
    ctx.fill();

    if (blending) {
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
        const phase = ((state.tick + b * 9) % 30) / 30;
        ctx.fillStyle = `${STEAM} ${(1 - phase) * 0.5})`;
        ctx.beginPath();
        ctx.arc(cx - 12 + b * 12 + Math.sin(state.tick / 5 + b) * 3, y + 8 - phase * 22, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (active) {
      // Floating selector chevron.
      const float = Math.sin(state.tick / 6) * 3;
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.moveTo(cx, y - 10 + float);
      ctx.lineTo(cx - 7, y - 20 + float);
      ctx.lineTo(cx + 7, y - 20 + float);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawJarGauge(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const jw = 17;
    const gap = 4;
    const w = scenario.jarPoolSize * (jw + gap) + 16;
    ctx.fillStyle = 'rgba(7, 26, 20, 0.9)';
    ctx.beginPath();
    ctx.roundRect(COUNTER_X - 48, CANVAS_H - 40, w, 34, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(243, 233, 210, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < scenario.jarPoolSize; i++) {
      const filled = i < state.jarsAvailable;
      const washing = i >= state.jarsAvailable && i < state.jarsAvailable + state.washing.length;
      ctx.globalAlpha = filled ? 1 : washing ? 0.5 + Math.sin(i + Date.now() / 300) * 0.15 : 0.22;
      this.drawJar(ctx, COUNTER_X - 40 + i * (jw + gap) + jw / 2, CANVAS_H - 23, 0.85);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const px = 48;
    const groundY = LANES_TOP + state.player.lane * this.laneHeight + this.laneHeight - 16;
    const breathing = Math.sin(state.tick / 18) * 1;
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
      this.drawCup(ctx, px + 15, bodyY - 6, state.player.holding, 1.05, 0.12);
    }
    if (working) {
      ctx.fillStyle = 'rgba(243, 233, 210, 0.9)';
      ctx.font = '700 9px "Avenir Next", system-ui, sans-serif';
      ctx.fillText('BLENDING', px - 24, groundY + 14);
    }
  }

  // ---- FX and HUD ------------------------------------------------------

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      const alpha = Math.max(0, 1 - particle.age / particle.ttl);
      ctx.fillStyle = withAlpha(particle.color, alpha * 0.95);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    for (const popup of this.popups) {
      const alpha = Math.max(0, 1 - popup.age / popup.ttl);
      const scale = 1 + Math.min(popup.age / 120, 1) * 0.25;
      ctx.save();
      ctx.translate(popup.x, popup.y);
      ctx.scale(scale, scale);
      ctx.font = '800 15px "Avenir Next", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(7, 26, 20, 0.8)';
      ctx.fillText(popup.text, 1, 1);
      ctx.fillStyle = withAlpha(popup.color, alpha);
      ctx.fillText(popup.text, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
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
    ctx.font = '800 24px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(String(state.score).padStart(6, '0'), 18, HUD_H / 2 + 1);
    if (state.streak > 1) {
      const pulse = 1 + Math.sin(state.tick / 5) * 0.04;
      ctx.save();
      ctx.translate(126, HUD_H / 2);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255, 215, 107, 0.16)';
      ctx.beginPath();
      ctx.roundRect(-8, -11, 92, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffd76b';
      ctx.font = '700 11px "Avenir Next", system-ui, sans-serif';
      ctx.fillText(`STREAK ×${state.streak}`, 0, 1);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159, 196, 178, 0.95)';
    ctx.font = '700 11px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(
      `STAGE ${meta.stageIndex + 1}/${meta.stageCount} · ${scenario.name.toUpperCase()}`,
      CANVAS_W / 2,
      HUD_H / 2 + 1,
    );
    ctx.textAlign = 'left';

    // Queue counter chip.
    const remaining = Math.max(0, scenario.customerCount - state.exited);
    ctx.fillStyle = 'rgba(159, 196, 178, 0.14)';
    ctx.beginPath();
    ctx.roundRect(CANVAS_W - 236, 11, 96, 24, 12);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = '700 12px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(`IN LINE ${remaining}`, CANVAS_W - 226, HUD_H / 2 + 1);

    // Lives as little shakes.
    for (let i = 0; i < state.lives; i++) {
      this.drawCup(ctx, CANVAS_W - 42 - i * 30, HUD_H / 2 + 2, 'strawberry', 0.95);
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

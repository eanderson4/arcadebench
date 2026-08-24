import { FIXED_SCALE } from '../core/engine';
import type {
  FlavorId,
  GameEvent,
  MaltlineScenario,
  MaltlineState,
} from '../core/types';

const CANVAS_W = 960;
const CANVAS_H = 540;
const HUD_H = 46;
const LANES_TOP = 58;
const LANES_BOTTOM = 352;
const COUNTER_X = 100;
const DOOR_X = 906;
const BANK_TOP = 374;
const BANK_BOTTOM = 524;

const COLORS = {
  bg: '#0c2f25',
  panel: '#12503e',
  panelDeep: '#0a231b',
  counter: '#f3e9d2',
  counterShade: '#d9c8a6',
  ink: '#f3e9d2',
  dim: '#9fc4b2',
  danger: '#ff6b5e',
  door: '#071a14',
  doorFrame: '#d9c8a6',
  player: '#1c6a50',
  apron: '#f3e9d2',
  skin: '#e9c39b',
  jar: '#cfd8d4',
} as const;

const FLAVOR_COLORS: Record<FlavorId, string> = {
  vanilla: '#f6e7c9',
  chocolate: '#7a4a24',
  strawberry: '#f28cb4',
};

const SHIRTS = ['#e8b04b', '#d97742', '#8f7fb8', '#5f9ea0', '#b85f75', '#7f9e5f', '#c2c26b'];
const HAIRS = ['#2b1d12', '#4a3520', '#6b6b6b', '#1d2b12', '#513045'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  size: number;
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

export class MaltlineRenderer {
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private laneHeight = 90;
  private scenario: MaltlineScenario | null = null;

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
          this.burst(DOOR_X - 8, this.laneCenterY(event.lane), FLAVOR_COLORS[event.flavor]);
          break;
        case 'jar_smashed':
          this.burst(COUNTER_X + 10, this.laneCenterY(event.lane), COLORS.jar);
          break;
        case 'walkout':
          this.flashes.push({ lane: event.lane, age: 0, ttl: 420, color: COLORS.danger });
          this.burst(COUNTER_X + 14, this.laneCenterY(event.lane), COLORS.danger);
          break;
        case 'jar_caught':
          this.burst(COUNTER_X + 22, this.laneCenterY(event.lane), COLORS.counter, 5);
          break;
        case 'served': {
          const customer = state.customers.find((candidate) => candidate.id === event.customerId);
          if (customer && this.scenario) {
            this.burst(this.lanePx(this.scenario, customer.x), this.laneCenterY(customer.lane), FLAVOR_COLORS[event.flavor], 6);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private burst(x: number, y: number, color: string, count = 9): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        age: 0,
        ttl: 380 + Math.random() * 220,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.particles = this.particles.filter((particle) => {
      particle.age += dtMs;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 320 * dt;
      return particle.age < particle.ttl;
    });
    this.flashes = this.flashes.filter((flash) => {
      flash.age += dtMs;
      return flash.age < flash.ttl;
    });
  }

  draw(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState, meta: DrawMeta): void {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawLanes(ctx, scenario, state);
    this.drawStationBank(ctx, scenario, state);
    this.drawDoors(ctx, scenario);
    this.drawCustomers(ctx, scenario, state);
    this.drawSlides(ctx, scenario, state);
    this.drawJars(ctx, scenario, state);
    this.drawPlayer(ctx, scenario, state);
    this.drawParticles(ctx);
    this.drawHud(ctx, scenario, state, meta);
  }

  private drawLanes(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = LANES_TOP + lane * this.laneHeight;
      const active = lane === state.player.lane;
      ctx.fillStyle = active ? '#175c46' : COLORS.panel;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X, y + 6, DOOR_X - COUNTER_X, this.laneHeight - 12, 10);
      ctx.fill();

      // Counter lip on the player's side of every lane.
      ctx.fillStyle = active ? COLORS.counter : COLORS.counterShade;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 14, y + 10, 12, this.laneHeight - 20, 4);
      ctx.fill();

      for (const flash of this.flashes.filter((candidate) => candidate.lane === lane)) {
        const alpha = Math.max(0, 1 - flash.age / flash.ttl) * 0.5;
        ctx.fillStyle = withAlpha(flash.color, alpha);
        ctx.beginPath();
        ctx.roundRect(COUNTER_X, y + 6, DOOR_X - COUNTER_X, this.laneHeight - 12, 10);
        ctx.fill();
      }
    }
    // Back wall behind the counter.
    ctx.fillStyle = COLORS.panelDeep;
    ctx.fillRect(0, LANES_TOP - 8, COUNTER_X - 14, LANES_BOTTOM - LANES_TOP + 16);
  }

  private drawDoors(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = LANES_TOP + lane * this.laneHeight;
      const h = this.laneHeight - 20;
      ctx.fillStyle = COLORS.doorFrame;
      ctx.beginPath();
      ctx.roundRect(DOOR_X - 6, y + 10, 22, h, 8);
      ctx.fill();
      ctx.fillStyle = COLORS.door;
      ctx.beginPath();
      ctx.roundRect(DOOR_X - 2, y + 14, 14, h - 8, 6);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 10px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('LINE FORMS →', DOOR_X - 10, LANES_TOP - 14);
    ctx.textAlign = 'left';
  }

  private drawStationBank(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    ctx.fillStyle = COLORS.panelDeep;
    ctx.beginPath();
    ctx.roundRect(0, BANK_TOP - 18, CANVAS_W, BANK_BOTTOM - BANK_TOP + 30, 14);
    ctx.fill();
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 10px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('STATIONS', COUNTER_X - 14, BANK_TOP - 2);

    const count = scenario.stations.length;
    const gap = 14;
    const width = (DOOR_X - COUNTER_X - gap * (count - 1)) / count;
    for (let index = 0; index < count; index++) {
      const flavor = scenario.stations[index]!;
      const x = COUNTER_X + index * (width + gap);
      const active = index === state.player.station;
      const blendingHere = active && state.player.blending !== null;

      ctx.fillStyle = active ? '#1b6b52' : COLORS.panel;
      ctx.beginPath();
      ctx.roundRect(x, BANK_TOP, width, BANK_BOTTOM - BANK_TOP, 12);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = COLORS.counter;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Machine face: color chip and tap.
      const chip = FLAVOR_COLORS[flavor];
      ctx.fillStyle = chip;
      ctx.beginPath();
      ctx.roundRect(x + 14, BANK_TOP + 16, width - 28, 26, 6);
      ctx.fill();
      ctx.fillStyle = COLORS.panelDeep;
      ctx.font = '700 13px "Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(flavorLabel(flavor), x + width / 2, BANK_TOP + 34);
      ctx.textAlign = 'left';

      // Tap spout.
      ctx.fillStyle = COLORS.counterShade;
      ctx.fillRect(x + width / 2 - 3, BANK_TOP + 42, 6, 14);
      if (blendingHere) {
        const progress = Math.min(1, state.player.blendProgress / scenario.blendTicks);
        ctx.fillStyle = withAlpha(chip, 0.9);
        const fillHeight = (BANK_BOTTOM - BANK_TOP - 74) * progress;
        ctx.beginPath();
        ctx.roundRect(x + 22, BANK_BOTTOM - 12 - fillHeight, width - 44, Math.max(fillHeight, 4), 5);
        ctx.fill();
        // Streaming into the cup.
        ctx.strokeStyle = chip;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + width / 2, BANK_TOP + 56);
        ctx.lineTo(x + width / 2, BANK_BOTTOM - 12 - fillHeight);
        ctx.stroke();
      }
    }

    // Jar pool gauge under the bank.
    const poolY = CANVAS_H - 9;
    for (let i = 0; i < scenario.jarPoolSize; i++) {
      const filled = i < state.jarsAvailable;
      const washing = i >= state.jarsAvailable && i < state.jarsAvailable + state.washing.length;
      ctx.fillStyle = filled ? COLORS.jar : washing ? withAlpha(COLORS.jar, 0.45) : withAlpha(COLORS.panelDeep, 0.8);
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 14 + i * 16, poolY - 8, 10, 10, 2);
      ctx.fill();
    }
  }

  private drawCustomers(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const customer of state.customers) {
      const px = this.lanePx(scenario, customer.x);
      const cy = this.laneCenterY(customer.lane);
      const shirt = SHIRTS[customer.id % SHIRTS.length]!;
      const hair = HAIRS[customer.id % HAIRS.length]!;

      // Body.
      ctx.fillStyle = customer.phase === 'leaving' ? withAlpha(shirt, 0.85) : shirt;
      ctx.beginPath();
      ctx.roundRect(px - 11, cy - 2, 22, 26, 8);
      ctx.fill();
      // Head.
      ctx.fillStyle = COLORS.skin;
      ctx.beginPath();
      ctx.arc(px, cy - 12, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(px, cy - 14, 9, Math.PI, Math.PI * 2);
      ctx.fill();

      if (customer.phase === 'drinking') {
        // Drink progress over the head.
        const progress = 1 - customer.timer / scenario.drinkTicks;
        ctx.strokeStyle = FLAVOR_COLORS[customer.flavor];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, cy - 12, 13, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
      } else if (customer.phase === 'leaving') {
        ctx.fillStyle = COLORS.dim;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText('♪', px + 8, cy - 16);
      } else {
        // Order bubble with a mini flavor cup.
        const bob = Math.sin((state.tick + customer.id * 9) / 22) * 2;
        const bx = px;
        const by = cy - 34 + bob;
        ctx.fillStyle = 'rgba(7, 26, 20, 0.85)';
        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = FLAVOR_COLORS[customer.flavor];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = FLAVOR_COLORS[customer.flavor];
        ctx.beginPath();
        ctx.roundRect(bx - 4, by - 5, 8, 10, 2);
        ctx.fill();
        // Patience tint as they near the counter.
        if (customer.x < scenario.laneLength * FIXED_SCALE * 0.25) {
          ctx.strokeStyle = withAlpha(COLORS.danger, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, cy - 12, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  private drawSlides(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const slide of state.slides) {
      const px = this.lanePx(scenario, slide.x);
      const cy = this.laneCenterY(slide.lane);
      // Motion streaks.
      ctx.strokeStyle = withAlpha(FLAVOR_COLORS[slide.flavor], 0.35);
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px - 14 - i * 7, cy + 4 - i * 2);
        ctx.lineTo(px - 6 - i * 7, cy + 4 - i * 2);
        ctx.stroke();
      }
      this.drawCup(ctx, px, cy + 6, FLAVOR_COLORS[slide.flavor], true);
    }
  }

  private drawJars(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const jar of state.jars) {
      const px = this.lanePx(scenario, jar.x);
      const cy = this.laneCenterY(jar.lane);
      ctx.strokeStyle = withAlpha(COLORS.jar, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 10, cy + 2);
      ctx.lineTo(px + 22, cy + 2);
      ctx.stroke();
      this.drawCup(ctx, px, cy + 6, COLORS.jar, false);
    }
  }

  private drawCup(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, withStraw: boolean): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 14);
    ctx.lineTo(x + 8, y - 14);
    ctx.lineTo(x + 5, y + 8);
    ctx.lineTo(x - 5, y + 8);
    ctx.closePath();
    ctx.fill();
    if (withStraw) {
      ctx.strokeStyle = COLORS.counterShade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 14);
      ctx.lineTo(x + 7, y - 24);
      ctx.stroke();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const px = 58;
    const cy = this.laneCenterY(state.player.lane);
    // Body and apron.
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.roundRect(px - 12, cy - 4, 24, 30, 8);
    ctx.fill();
    ctx.fillStyle = COLORS.apron;
    ctx.beginPath();
    ctx.roundRect(px - 8, cy + 4, 16, 20, 5);
    ctx.fill();
    // Head and cap.
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(px, cy - 14, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.counter;
    ctx.beginPath();
    ctx.arc(px, cy - 17, 9, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 9, cy - 18, 18, 3);
    // Held shake.
    if (state.player.holding !== null) {
      this.drawCup(ctx, px + 16, cy + 10, FLAVOR_COLORS[state.player.holding], true);
    }
    if (state.player.blending !== null) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = '700 10px "Avenir Next", system-ui, sans-serif';
      ctx.fillText('BLENDING…', px - 30, cy + 38);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      const alpha = Math.max(0, 1 - particle.age / particle.ttl);
      ctx.fillStyle = withAlpha(particle.color, alpha);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHud(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    meta: DrawMeta,
  ): void {
    ctx.fillStyle = COLORS.panelDeep;
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.fillStyle = withAlpha(COLORS.counter, 0.15);
    ctx.fillRect(0, HUD_H - 1, CANVAS_W, 1);

    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 22px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(String(state.score).padStart(6, '0'), 16, HUD_H / 2 + 1);
    if (state.streak > 1) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = '600 11px "Avenir Next", system-ui, sans-serif';
      ctx.fillText(`STREAK ×${state.streak}`, 112, HUD_H / 2 + 1);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 11px "Avenir Next", system-ui, sans-serif';
    ctx.fillText(
      `STAGE ${meta.stageIndex + 1}/${meta.stageCount} — ${scenario.name.toUpperCase()}`,
      CANVAS_W / 2,
      HUD_H / 2 + 1,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 12px "Avenir Next", system-ui, sans-serif';
    const remaining = Math.max(0, scenario.customerCount - state.exited);
    ctx.fillText(`IN LINE ${remaining}`, CANVAS_W - 16 - state.lives * 22 - 130, HUD_H / 2 + 1);
    for (let i = 0; i < state.lives; i++) {
      this.drawCup(ctx, CANVAS_W - 26 - i * 22, HUD_H / 2 + 14, COLORS.counter, true);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function flavorLabel(flavor: FlavorId): string {
  switch (flavor) {
    case 'vanilla':
      return 'VAN';
    case 'chocolate':
      return 'CHO';
    case 'strawberry':
      return 'STR';
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

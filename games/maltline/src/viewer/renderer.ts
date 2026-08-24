import { FIXED_SCALE } from '../core/engine';
import type {
  FlavorId,
  GameEvent,
  MaltlineScenario,
  MaltlineState,
} from '../core/types';
import { FLAVOR_LABELS } from '../core/types';
import {
  SPRITE_SCALE,
  customerVariant,
  getSprite,
} from './sprites';

const CANVAS_W = 960;
const CANVAS_H = 540;
const HUD_H = 46;
const AWNING_H = 12;
const LANES_TOP = 58;
const LANES_BOTTOM = 352;
const COUNTER_X = 100;
const DOOR_X = 906;
const BANK_TOP = 374;
const BANK_BOTTOM = 524;
const MACHINE_BASELINE = 468;

const COLORS = {
  bg: '#0c2f25',
  wall: '#0a2118',
  wallTile: 'rgba(243, 233, 210, 0.045)',
  panel: '#12503e',
  counter: '#f3e9d2',
  counterShade: '#d9c8a6',
  wood: '#8a5a33',
  woodDark: '#5d3a20',
  woodEdge: '#c98a4a',
  steel: '#cfd8d4',
  steelShade: '#8fa39c',
  ink: '#f3e9d2',
  dim: '#9fc4b2',
  danger: '#ff6b5e',
  chalk: '#173b2c',
  accent: '#f28cb4',
} as const;

const FLAVOR_COLORS: Record<FlavorId, string> = {
  vanilla: '#f6e7c9',
  chocolate: '#7a4a24',
  strawberry: '#f28cb4',
};

const FLAVOR_DARKS: Record<FlavorId, string> = {
  vanilla: '#d6b98a',
  chocolate: '#54301a',
  strawberry: '#c9557f',
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
  shard: boolean;
  spin: number;
}

interface Flash {
  lane: number;
  age: number;
  ttl: number;
  color: string;
}

interface Ding {
  lane: number;
  age: number;
}

export interface DrawMeta {
  stageIndex: number;
  stageCount: number;
}

export class MaltlineRenderer {
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private dings: Ding[] = [];
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
        case 'customer_spawned':
          this.dings.push({ lane: event.lane, age: 0 });
          break;
        case 'shake_smashed':
          this.burst(DOOR_X - 16, this.laneCenterY(event.lane), FLAVOR_COLORS[event.flavor], true);
          break;
        case 'jar_smashed':
          this.burst(COUNTER_X + 14, this.laneCenterY(event.lane), COLORS.steel, true);
          break;
        case 'walkout':
          this.flashes.push({ lane: event.lane, age: 0, ttl: 420, color: COLORS.danger });
          this.burst(COUNTER_X + 18, this.laneCenterY(event.lane), COLORS.danger, false);
          break;
        case 'jar_caught':
          this.burst(COUNTER_X + 24, this.laneCenterY(event.lane), COLORS.counter, false, 5);
          break;
        case 'served': {
          const customer = state.customers.find((candidate) => candidate.id === event.customerId);
          if (customer && this.scenario) {
            this.burst(
              this.lanePx(this.scenario, customer.x),
              this.laneCenterY(customer.lane),
              FLAVOR_COLORS[event.flavor],
              false,
              6,
            );
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private burst(x: number, y: number, color: string, shards: boolean, count = 9): void {
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
        size: shards ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
        color,
        shard: shards && i % 2 === 0,
        spin: Math.random() * Math.PI,
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
      particle.spin += dt * 6;
      return particle.age < particle.ttl;
    });
    this.flashes = this.flashes.filter((flash) => {
      flash.age += dtMs;
      return flash.age < flash.ttl;
    });
    this.dings = this.dings.filter((ding) => {
      ding.age += dtMs;
      return ding.age < 500;
    });
  }

  draw(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState, meta: DrawMeta): void {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawBackdrop(ctx, scenario);
    this.drawLanes(ctx, scenario, state);
    this.drawDoors(ctx, scenario, state);
    this.drawCustomers(ctx, scenario, state);
    this.drawSlides(ctx, scenario, state);
    this.drawJars(ctx, scenario, state);
    this.drawStationBank(ctx, scenario, state);
    this.drawPlayer(ctx, scenario, state);
    this.drawParticles(ctx);
    this.drawHud(ctx, scenario, state, meta);
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Tiled back wall behind the counters.
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(0, AWNING_H + HUD_H, CANVAS_W, BANK_TOP - HUD_H - AWNING_H);
    ctx.fillStyle = COLORS.wallTile;
    for (let y = HUD_H + AWNING_H + 10; y < BANK_TOP; y += 26) {
      for (let x = (y / 26) % 2 === 0 ? 0 : 26; x < CANVAS_W; x += 52) {
        ctx.fillRect(x, y, 48, 22);
      }
    }

    this.drawAwning(ctx);
    this.drawMenuBoard(ctx, scenario);
  }

  private drawAwning(ctx: CanvasRenderingContext2D): void {
    const y = HUD_H;
    for (let x = 0; x < CANVAS_W; x += 40) {
      ctx.fillStyle = (x / 40) % 2 === 0 ? COLORS.panel : COLORS.counterShade;
      ctx.fillRect(x, y, 40, AWNING_H - 4);
      ctx.beginPath();
      ctx.arc(x + 20, y + AWNING_H - 4, 20, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(16, 22, 20, 0.35)';
    ctx.fillRect(0, y + AWNING_H + 14, CANVAS_W, 3);
  }

  private drawMenuBoard(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario): void {
    const x = 8;
    const y = HUD_H + AWNING_H + 18;
    const w = COUNTER_X - 28;
    const h = 210;
    ctx.fillStyle = COLORS.woodDark;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.chalk;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 13px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MENU', x + w / 2, y + 22);
    ctx.strokeStyle = COLORS.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 30);
    ctx.lineTo(x + w - 10, y + 30);
    ctx.stroke();

    const flavors = [...new Set(scenario.stations)];
    let fy = y + 52;
    for (const flavor of flavors) {
      ctx.drawImage(getSprite(`mini-${flavor}`), x + 12, fy - 12, 10, 12);
      ctx.fillStyle = COLORS.ink;
      ctx.font = '600 11px "Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(FLAVOR_LABELS[flavor].toUpperCase(), x + 30, fy);
      fy += 30;
    }
    ctx.fillStyle = COLORS.dim;
    ctx.font = '500 9px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('FRESH · FAST · FRIENDLY', x + 12, y + h - 12);
    ctx.textAlign = 'left';
  }

  private drawLanes(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = LANES_TOP + lane * this.laneHeight;
      const active = lane === state.player.lane;

      // Wooden counter strip with a lit top edge and grounded shadow so
      // each lane reads as its own bar.
      ctx.fillStyle = COLORS.wood;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 12, y + 8, DOOR_X - COUNTER_X + 8, this.laneHeight - 22, 8);
      ctx.fill();
      ctx.fillStyle = COLORS.woodEdge;
      ctx.fillRect(COUNTER_X - 12, y + 8, DOOR_X - COUNTER_X + 8, 6);
      ctx.fillStyle = COLORS.woodDark;
      for (let plank = COUNTER_X + 58; plank < DOOR_X; plank += 116) {
        ctx.fillRect(plank, y + 16, 3, this.laneHeight - 34);
      }
      ctx.fillStyle = 'rgba(4, 12, 9, 0.45)';
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 12, y + this.laneHeight - 22, DOOR_X - COUNTER_X + 8, 8, 6);
      ctx.fill();

      // Cream service lip on the player's side; brighter on the active lane.
      ctx.fillStyle = active ? COLORS.counter : COLORS.counterShade;
      ctx.beginPath();
      ctx.roundRect(COUNTER_X - 22, y + 12, 12, this.laneHeight - 30, 4);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      for (const flash of this.flashes.filter((candidate) => candidate.lane === lane)) {
        const alpha = Math.max(0, 1 - flash.age / flash.ttl) * 0.45;
        ctx.fillStyle = withAlpha(flash.color, alpha);
        ctx.beginPath();
        ctx.roundRect(COUNTER_X - 12, y + 8, DOOR_X - COUNTER_X + 8, this.laneHeight - 22, 8);
        ctx.fill();
      }
    }
  }

  private drawDoors(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const door = getSprite('door');
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const y = LANES_TOP + lane * this.laneHeight;
      ctx.drawImage(door, DOOR_X - 6, y + 2, door.width * SPRITE_SCALE, door.height * SPRITE_SCALE);
      for (const ding of this.dings.filter((candidate) => candidate.lane === lane)) {
        const alpha = Math.max(0, 1 - ding.age / 500);
        ctx.fillStyle = withAlpha('#ffd76b', alpha);
        ctx.beginPath();
        ctx.arc(DOOR_X + 14, y - 2, 5 + alpha * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 10px "Avenir Next", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('LINE FORMS →', DOOR_X - 10, LANES_TOP - 8);
    ctx.textAlign = 'left';
  }

  private drawCustomers(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const customer of state.customers) {
      const px = this.lanePx(scenario, customer.x);
      const cy = this.laneCenterY(customer.lane);
      const sprite = getSprite('customer', customerVariant(customer.id));
      const w = sprite.width * SPRITE_SCALE;
      const h = sprite.height * SPRITE_SCALE;
      const bob = customer.phase === 'marching' && (state.tick + customer.id * 9) % 24 < 12 ? 1 : 0;
      const baseY = cy + this.laneHeight / 2 - h - 12 + bob;

      ctx.drawImage(sprite, Math.round(px - w / 2), baseY, w, h);

      if (customer.phase === 'drinking') {
        const progress = 1 - customer.timer / scenario.drinkTicks;
        ctx.strokeStyle = FLAVOR_COLORS[customer.flavor];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, cy - 20, 13, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
        const cup = getSprite(`cup-${customer.flavor}`);
        ctx.save();
        ctx.translate(px + 12, baseY + 8);
        ctx.rotate(0.5);
        ctx.drawImage(cup, 0, 0, cup.width * 2, cup.height * 2);
        ctx.restore();
      } else if (customer.phase === 'leaving') {
        ctx.fillStyle = COLORS.dim;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText('♪', px + 10, baseY - 2);
      } else {
        this.drawOrderBubble(ctx, scenario, customer, px, baseY);
        if (customer.x < scenario.laneLength * FIXED_SCALE * 0.25) {
          ctx.strokeStyle = withAlpha(COLORS.danger, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, cy - 20, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  private drawOrderBubble(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    customer: MaltlineState['customers'][number],
    px: number,
    baseY: number,
  ): void {
    const sway = Math.sin(customer.id * 1.7) * 1.5;
    const bx = px;
    const by = baseY - 26 + sway;
    ctx.fillStyle = 'rgba(16, 22, 20, 0.88)';
    ctx.strokeStyle = COLORS.counter;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx - 16, by - 24, 32, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + 3);
    ctx.lineTo(bx + 4, by + 3);
    ctx.lineTo(bx, by + 9);
    ctx.closePath();
    ctx.fill();

    const mini = getSprite(`mini-${customer.flavor}`);
    ctx.drawImage(mini, Math.round(bx - mini.width), by - 20, mini.width * 2, mini.height * 2);
  }

  private drawSlides(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    for (const slide of state.slides) {
      const px = this.lanePx(scenario, slide.x);
      const cy = this.laneCenterY(slide.lane) + this.laneHeight / 2 - 20;
      ctx.strokeStyle = withAlpha(FLAVOR_COLORS[slide.flavor], 0.3);
      ctx.lineWidth = 3;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(px - 16 - i * 9, cy - 4);
        ctx.lineTo(px - 8 - i * 9, cy - 4);
        ctx.stroke();
      }
      const cup = getSprite(`cup-${slide.flavor}`);
      const wobble = Math.sin((state.tick + slide.id * 5) / 4) * 0.09;
      ctx.save();
      ctx.translate(px, cy);
      ctx.rotate(wobble);
      ctx.drawImage(cup, -cup.width * 1.5, -cup.height * 3, cup.width * SPRITE_SCALE, cup.height * SPRITE_SCALE);
      ctx.restore();
    }
  }

  private drawJars(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const jar = getSprite('jar');
    for (const jarState of state.jars) {
      const px = this.lanePx(scenario, jarState.x);
      const cy = this.laneCenterY(jarState.lane) + this.laneHeight / 2 - 16;
      ctx.strokeStyle = withAlpha(COLORS.steel, 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 12, cy - 4);
      ctx.lineTo(px + 24, cy - 4);
      ctx.stroke();
      ctx.drawImage(jar, Math.round(px - jar.width * 1.5), cy - jar.height * 3, jar.width * SPRITE_SCALE, jar.height * SPRITE_SCALE);
    }
  }

  private drawStationBank(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    // Deep shop floor with a steel worktop.
    ctx.fillStyle = '#081b14';
    ctx.beginPath();
    ctx.roundRect(0, BANK_TOP - 16, CANVAS_W, BANK_BOTTOM - BANK_TOP + 28, 14);
    ctx.fill();
    ctx.fillStyle = COLORS.steelShade;
    ctx.fillRect(COUNTER_X - 40, MACHINE_BASELINE, DOOR_X - COUNTER_X + 60, 10);
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(COUNTER_X - 40, MACHINE_BASELINE - 4, DOOR_X - COUNTER_X + 60, 5);

    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 10px "Avenir Next", system-ui, sans-serif';
    ctx.fillText('STATIONS', COUNTER_X - 40, BANK_TOP + 4);

    const count = scenario.stations.length;
    const gap = 26;
    const width = (DOOR_X - COUNTER_X - gap * (count - 1)) / count;
    for (let index = 0; index < count; index++) {
      const flavor = scenario.stations[index]!;
      const cx = COUNTER_X + index * (width + gap) + width / 2;
      const active = index === state.player.station;
      const machine = getSprite('station');
      const mw = machine.width * SPRITE_SCALE;
      const mh = machine.height * SPRITE_SCALE;
      const mx = Math.round(cx - mw / 2);
      const my = MACHINE_BASELINE - mh;

      if (active) {
        ctx.strokeStyle = COLORS.counter;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(mx - 6, my - 6, mw + 12, mh + 10, 8);
        ctx.stroke();
        // Marker arrow above the selected machine.
        ctx.fillStyle = COLORS.counter;
        ctx.beginPath();
        ctx.moveTo(cx, my - 14);
        ctx.lineTo(cx - 6, my - 22);
        ctx.lineTo(cx + 6, my - 22);
        ctx.closePath();
        ctx.fill();
      }

      ctx.drawImage(machine, mx, my, mw, mh);

      // Flavor label plate on the machine face.
      ctx.fillStyle = FLAVOR_COLORS[flavor];
      ctx.beginPath();
      ctx.roundRect(cx - 22, my + 16, 44, 14, 3);
      ctx.fill();
      ctx.fillStyle = flavor === 'vanilla' ? '#54301a' : COLORS.ink;
      ctx.font = '700 9px "Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(FLAVOR_LABELS[flavor], cx, my + 26);
      ctx.textAlign = 'left';

      if (active && state.player.blending !== null) {
        const progress = Math.min(1, state.player.blendProgress / scenario.blendTicks);
        // Liquid rising in the machine glass (x 2..15, y 8..13 of the grid).
        const glassX = mx + 3 * SPRITE_SCALE;
        const glassW = 12 * SPRITE_SCALE;
        const glassBottom = my + 14 * SPRITE_SCALE;
        const fillH = 5 * SPRITE_SCALE * progress;
        ctx.fillStyle = FLAVOR_COLORS[flavor];
        ctx.fillRect(glassX, glassBottom - fillH, glassW, fillH);
        // Stream into a filling cup below.
        ctx.strokeStyle = FLAVOR_COLORS[flavor];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, my + 16 * SPRITE_SCALE);
        ctx.lineTo(cx, MACHINE_BASELINE - 6 - progress * 18);
        ctx.stroke();
        const cup = getSprite(`cup-${flavor}`);
        const cupH = cup.height * 2;
        ctx.drawImage(cup, cx - cup.width, MACHINE_BASELINE - cupH + progress * 8, cup.width * 2, cupH);
        // Blend bubbles.
        for (let b = 0; b < 3; b++) {
          const phase = ((state.tick + b * 9) % 27) / 27;
          ctx.fillStyle = withAlpha('#fff8ea', 1 - phase);
          ctx.beginPath();
          ctx.arc(cx - 14 + b * 14 + Math.sin(state.tick / 5 + b) * 3, my - phase * 20, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Jar pool gauge: filled, washing, empty — on a grounded backing panel.
    const jar = getSprite('jar');
    const jw = jar.width * 1.5;
    const jh = jar.height * 1.5;
    ctx.fillStyle = '#071a14';
    ctx.beginPath();
    ctx.roundRect(COUNTER_X - 46, CANVAS_H - 6 - jh, scenario.jarPoolSize * (jw + 4) + 12, jh + 10, 6);
    ctx.fill();
    ctx.strokeStyle = withAlpha(COLORS.counter, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < scenario.jarPoolSize; i++) {
      const filled = i < state.jarsAvailable;
      const washing = i >= state.jarsAvailable && i < state.jarsAvailable + state.washing.length;
      ctx.globalAlpha = filled ? 1 : washing ? 0.55 : 0.25;
      ctx.drawImage(jar, COUNTER_X - 40 + i * (jw + 4), CANVAS_H - 4 - jh, jw, jh);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, scenario: MaltlineScenario, state: MaltlineState): void {
    const px = 44;
    const cy = this.laneCenterY(state.player.lane);
    const sprite = getSprite('player');
    const w = sprite.width * SPRITE_SCALE;
    const h = sprite.height * SPRITE_SCALE;
    const baseY = cy + this.laneHeight / 2 - h - 8;
    const bob = state.player.blending !== null && state.tick % 14 < 7 ? 1 : 0;
    ctx.drawImage(sprite, px - w / 2, baseY + bob, w, h);

    if (state.player.holding !== null) {
      const cup = getSprite(`cup-${state.player.holding}`);
      ctx.drawImage(cup, px + w / 2 - 6, baseY + 10, cup.width * 2, cup.height * 2);
    }
    if (state.player.blending !== null) {
      ctx.fillStyle = COLORS.counter;
      ctx.font = '700 9px "Avenir Next", system-ui, sans-serif';
      ctx.fillText('BLENDING', px - 26, baseY + h + 14);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      const alpha = Math.max(0, 1 - particle.age / particle.ttl);
      ctx.fillStyle = withAlpha(particle.color, alpha);
      if (particle.shard) {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin);
        ctx.fillRect(-particle.size, -particle.size / 2, particle.size * 2, particle.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHud(
    ctx: CanvasRenderingContext2D,
    scenario: MaltlineScenario,
    state: MaltlineState,
    meta: DrawMeta,
  ): void {
    ctx.fillStyle = '#071a14';
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
    ctx.fillText(`IN LINE ${remaining}`, CANVAS_W - 16 - state.lives * 26 - 130, HUD_H / 2 + 1);
    for (let i = 0; i < state.lives; i++) {
      const cup = getSprite('cup-strawberry');
      ctx.drawImage(cup, CANVAS_W - 24 - i * 26 - cup.width, HUD_H / 2 - cup.height + 12, cup.width * 2, cup.height * 2);
    }
    ctx.textAlign = 'left';
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

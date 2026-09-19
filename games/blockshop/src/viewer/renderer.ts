import {
  BALL_RADIUS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_Y,
  POWER_DROP_SIZE,
} from '../core/constants';
import type {
  BlockshopEvent,
  BlockshopStage,
  BlockshopState,
  BrickState,
  PowerKind,
} from '../core/types';

const PAINTS = ['#ee6b4d', '#efb843', '#65a47a', '#4f83bd', '#a66abb', '#df7b43'];
const POWER_LABEL: Readonly<Record<PowerKind, string>> = {
  wide: '↔ WIDE',
  slow: '≋ SLOW',
  multi: '×3 MULTI',
  sticky: '● GLUE',
  heavy: '◆ HEAVY',
  extra: '+1 BALL',
};
const POWER_COLOR: Readonly<Record<PowerKind, string>> = {
  wide: '#f2bd3f',
  slow: '#65a47a',
  multi: '#4f86c6',
  sticky: '#9c6bc3',
  heavy: '#eb8245',
  extra: '#d45e88',
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export class BlockshopRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly particles: Particle[] = [];
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private kick = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  notify(events: readonly BlockshopEvent[], state: BlockshopState): void {
    for (const event of events) {
      if (event.type !== 'brick_broken') continue;
      const brick = state.bricks.find((candidate) => candidate.id === event.brickId);
      if (!brick || this.reducedMotion) continue;
      const color = brick.material === 'hardwood' ? '#a9683c' : PAINTS[brick.row % PAINTS.length]!;
      for (let index = 0; index < 7; index++) {
        this.particles.push({
          x: brick.x + brick.width / 2,
          y: brick.y + brick.height / 2,
          vx: (index - 3) * 0.75,
          vy: -2.5 - (index % 3),
          life: 28 + index,
          color,
        });
      }
      this.kick = 3;
    }
  }

  draw(state: BlockshopState, stage: BlockshopStage, elapsed = performance.now()): void {
    const context = this.context;
    context.save();
    context.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    if (this.kick > 0 && !this.reducedMotion) {
      context.translate(Math.sin(elapsed * 0.12) * this.kick, Math.cos(elapsed * 0.09) * this.kick * 0.45);
      this.kick *= 0.78;
    }
    this.drawRoom(stage);
    this.drawBricks(state, stage);
    this.drawDrops(state);
    this.drawBalls(state);
    this.drawPaddle(state);
    this.drawParticles();
    context.restore();
  }

  private drawRoom(stage: BlockshopStage): void {
    const context = this.context;
    context.fillStyle = '#ede4cf';
    context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    context.fillStyle = '#274e56';
    context.fillRect(0, 0, FIELD_WIDTH, 92);
    context.fillStyle = stage.accent;
    context.fillRect(0, 84, FIELD_WIDTH, 8);

    context.fillStyle = '#f5eedc';
    context.fillRect(16, 92, FIELD_WIDTH - 32, FIELD_HEIGHT - 120);
    context.strokeStyle = '#c2ae88';
    context.lineWidth = 3;
    context.strokeRect(17.5, 93.5, FIELD_WIDTH - 35, FIELD_HEIGHT - 123);

    context.fillStyle = '#d8c9aa';
    for (let y = 114; y < 670; y += 28) {
      for (let x = 40 + ((y / 28) % 2) * 4; x < FIELD_WIDTH - 30; x += 28) {
        context.beginPath();
        context.arc(x, y, 2.1, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.fillStyle = '#17383e';
    context.font = '800 22px ui-monospace, monospace';
    context.textBaseline = 'middle';
    context.fillText(`RACK ${String(stage.number).padStart(2, '0')}`, 34, 45);
    context.textAlign = 'right';
    context.fillStyle = '#f7f0df';
    context.font = '800 18px ui-monospace, monospace';
    context.fillText(stage.title.toUpperCase(), FIELD_WIDTH - 34, 45);
    context.textAlign = 'left';

    context.fillStyle = '#caa777';
    context.fillRect(0, 731, FIELD_WIDTH, 29);
    context.fillStyle = '#a67b4f';
    context.fillRect(0, 731, FIELD_WIDTH, 5);
    context.strokeStyle = 'rgba(85, 55, 30, .24)';
    context.lineWidth = 2;
    for (let x = -20; x < FIELD_WIDTH; x += 130) {
      context.beginPath();
      context.moveTo(x, 748);
      context.bezierCurveTo(x + 28, 740, x + 76, 757, x + 122, 744);
      context.stroke();
    }
  }

  private drawBricks(state: BlockshopState, stage: BlockshopStage): void {
    const context = this.context;
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      context.save();
      context.shadowColor = 'rgba(54, 42, 28, .25)';
      context.shadowBlur = 0;
      context.shadowOffsetY = 5;
      this.roundRect(brick.x, brick.y, brick.width, brick.height, 5);

      if (brick.material === 'steel') {
        const gradient = context.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
        gradient.addColorStop(0, '#dfe5e2');
        gradient.addColorStop(0.48, '#85979b');
        gradient.addColorStop(0.52, '#63777c');
        gradient.addColorStop(1, '#b9c5c3');
        context.fillStyle = gradient;
      } else if (brick.material === 'hardwood') {
        context.fillStyle = brick.hitsRemaining === 1 ? '#bf7444' : '#9b5e38';
      } else {
        context.fillStyle = brick.power ? POWER_COLOR[brick.power] : PAINTS[brick.row % PAINTS.length]!;
      }
      context.fill();
      context.shadowColor = 'transparent';
      context.strokeStyle = '#263f40';
      context.lineWidth = 2.5;
      context.stroke();

      if (brick.material === 'hardwood') this.drawWoodgrain(brick);
      if (brick.material === 'steel') this.drawSteel(brick);
      if (brick.hitsRemaining === 1 && brick.hits > 1) this.drawCrack(brick);
      if (brick.power) this.drawPowerLabel(brick, brick.power);
      context.restore();
    }
  }

  private drawWoodgrain(brick: BrickState): void {
    const context = this.context;
    context.strokeStyle = 'rgba(55, 34, 22, .34)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(brick.x + 8, brick.y + 9);
    context.bezierCurveTo(brick.x + 28, brick.y + 3, brick.x + 55, brick.y + 15, brick.x + 80, brick.y + 7);
    context.moveTo(brick.x + 10, brick.y + 26);
    context.bezierCurveTo(brick.x + 30, brick.y + 20, brick.x + 58, brick.y + 31, brick.x + 78, brick.y + 23);
    context.stroke();
  }

  private drawSteel(brick: BrickState): void {
    const context = this.context;
    context.fillStyle = '#435a5f';
    for (const x of [brick.x + 10, brick.x + brick.width - 10]) {
      context.beginPath();
      context.arc(x, brick.y + brick.height / 2, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  private drawCrack(brick: BrickState): void {
    const context = this.context;
    context.strokeStyle = '#542f23';
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(brick.x + brick.width * 0.54, brick.y + 1);
    context.lineTo(brick.x + brick.width * 0.48, brick.y + 12);
    context.lineTo(brick.x + brick.width * 0.58, brick.y + 18);
    context.lineTo(brick.x + brick.width * 0.46, brick.y + brick.height - 1);
    context.stroke();
  }

  private drawPowerLabel(brick: BrickState, power: PowerKind): void {
    const context = this.context;
    context.fillStyle = '#fff8e8';
    this.roundRect(brick.x + 5, brick.y + 6, brick.width - 10, brick.height - 12, 3);
    context.fill();
    context.fillStyle = '#19393e';
    context.font = '900 12px ui-monospace, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWER_LABEL[power], brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
    context.textAlign = 'left';
  }

  private drawDrops(state: BlockshopState): void {
    const context = this.context;
    for (const drop of state.powerDrops) {
      context.save();
      context.translate(drop.x, drop.y);
      context.rotate(Math.sin(drop.y * 0.035) * 0.08);
      context.fillStyle = POWER_COLOR[drop.kind];
      context.shadowColor = 'rgba(34, 44, 40, .32)';
      context.shadowOffsetY = 5;
      this.roundRect(-55, -POWER_DROP_SIZE / 2, 110, POWER_DROP_SIZE, 4);
      context.fill();
      context.shadowColor = 'transparent';
      context.strokeStyle = '#17383e';
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#fffaf0';
      context.font = '900 12px ui-monospace, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(POWER_LABEL[drop.kind], 0, 1);
      context.restore();
    }
  }

  private drawBalls(state: BlockshopState): void {
    const context = this.context;
    for (const ball of state.balls) {
      context.save();
      if (!ball.stuck) {
        context.globalAlpha = 0.14;
        context.fillStyle = state.heavyTicks > 0 ? '#e76439' : '#46646b';
        context.beginPath();
        context.arc(ball.x - ball.vx * 1.2, ball.y - ball.vy * 1.2, BALL_RADIUS * 0.75, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
      const gradient = context.createRadialGradient(
        ball.x - ball.radius * 0.35,
        ball.y - ball.radius * 0.4,
        1,
        ball.x,
        ball.y,
        ball.radius,
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.25, state.heavyTicks > 0 ? '#ffb455' : '#dfe7e5');
      gradient.addColorStop(0.72, state.heavyTicks > 0 ? '#d95734' : '#71868a');
      gradient.addColorStop(1, '#263f43');
      context.fillStyle = gradient;
      context.shadowColor = 'rgba(20, 30, 30, .4)';
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  private drawPaddle(state: BlockshopState): void {
    const context = this.context;
    const left = state.paddleX - state.paddleWidth / 2;
    context.save();
    context.shadowColor = 'rgba(49, 39, 29, .35)';
    context.shadowOffsetY = 7;
    context.fillStyle = '#b87343';
    this.roundRect(left, PADDLE_Y, state.paddleWidth, PADDLE_HEIGHT, 8);
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = '#243f42';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#e5a35e';
    this.roundRect(left + 8, PADDLE_Y + 4, state.paddleWidth - 16, 7, 3);
    context.fill();
    context.fillStyle = '#315b67';
    this.roundRect(left - 5, PADDLE_Y + 2, 15, PADDLE_HEIGHT - 4, 4);
    context.fill();
    this.roundRect(left + state.paddleWidth - 10, PADDLE_Y + 2, 15, PADDLE_HEIGHT - 4, 4);
    context.fill();
    if (state.stickyCharges > 0) {
      context.strokeStyle = '#9c6bc3';
      context.lineWidth = 5;
      context.setLineDash([10, 7]);
      context.beginPath();
      context.moveTo(left + 12, PADDLE_Y - 3);
      context.lineTo(left + state.paddleWidth - 12, PADDLE_Y - 3);
      context.stroke();
    }
    context.restore();
  }

  private drawParticles(): void {
    const context = this.context;
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]!;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.22;
      particle.life -= 1;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }
      context.globalAlpha = Math.min(1, particle.life / 12);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, 6, 6);
    }
    context.globalAlpha = 1;
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.context.beginPath();
    this.context.roundRect(x, y, width, height, radius);
  }
}

export { POWER_COLOR, POWER_LABEL };

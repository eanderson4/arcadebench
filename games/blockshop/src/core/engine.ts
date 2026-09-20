import {
  BALL_RADIUS,
  BRICK_GAP_X,
  BRICK_GAP_Y,
  BRICK_HEIGHT,
  BRICK_ORIGIN_X,
  BRICK_ORIGIN_Y,
  BRICK_WIDTH,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  HEAVY_DURATION,
  PADDLE_HEIGHT,
  PADDLE_NORMAL_WIDTH,
  PADDLE_SPEED,
  PADDLE_WIDE_WIDTH,
  PADDLE_Y,
  POWER_DROP_SIZE,
  POWER_DROP_SPEED,
  SLOW_DURATION,
  WIDE_DURATION,
  clamp,
} from './constants';
import type {
  BallState,
  BlockshopEvent,
  BlockshopInput,
  BlockshopStage,
  BlockshopState,
  BrickState,
  PowerDropState,
  PowerKind,
  StepResult,
} from './types';

const SUBSTEPS = 2;
const EMPTY_INPUT: BlockshopInput = { move: 0, action: false };

function cloneState(state: BlockshopState): BlockshopState {
  return {
    ...state,
    balls: state.balls.map((ball) => ({ ...ball })),
    bricks: state.bricks.map((brick) => ({ ...brick })),
    powerDrops: state.powerDrops.map((drop) => ({ ...drop })),
  };
}

function createBall(id: number, paddleX: number): BallState {
  return {
    id,
    x: paddleX,
    y: PADDLE_Y - BALL_RADIUS - 2,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    stuck: true,
    stuckOffset: 0,
  };
}

export class BlockshopEngine {
  readonly stage: BlockshopStage;
  private state: BlockshopState;
  private input: BlockshopInput = EMPTY_INPUT;
  private previousAction = false;
  private nextBallId = 2;
  private nextDropId = 1;

  constructor(stage: BlockshopStage, options: { score?: number; lives?: number } = {}) {
    this.stage = stage;
    const paddleX = FIELD_WIDTH / 2;
    const bricks: BrickState[] = stage.bricks.map((brick) => ({
      ...brick,
      x: BRICK_ORIGIN_X + brick.column * (BRICK_WIDTH + BRICK_GAP_X),
      y: BRICK_ORIGIN_Y + brick.row * (BRICK_HEIGHT + BRICK_GAP_Y),
      width: BRICK_WIDTH,
      height: BRICK_HEIGHT,
      hitsRemaining: brick.hits,
      alive: true,
    }));
    this.state = {
      tick: 0,
      stageId: stage.id,
      status: 'ready',
      score: options.score ?? 0,
      stageScore: 0,
      lives: options.lives ?? 3,
      combo: 0,
      bestCombo: 0,
      ticksWithoutBreak: 0,
      paddleX,
      paddleWidth: PADDLE_NORMAL_WIDTH,
      balls: [createBall(1, paddleX)],
      bricks,
      powerDrops: [],
      wideTicks: 0,
      slowTicks: 0,
      heavyTicks: 0,
      stickyCharges: 0,
      blocksRemaining: bricks.filter((brick) => brick.material !== 'steel').length,
    };
  }

  snapshot(): BlockshopState {
    return cloneState(this.state);
  }

  setInput(input: BlockshopInput): void {
    this.input = { move: input.move, action: input.action };
  }

  step(input?: BlockshopInput): StepResult {
    if (input) this.setInput(input);
    const events: BlockshopEvent[] = [];
    if (this.state.status === 'won' || this.state.status === 'lost') {
      return { state: this.snapshot(), events };
    }

    this.state.tick += 1;
    this.state.ticksWithoutBreak += 1;
    const actionPressed = this.input.action && !this.previousAction;
    this.previousAction = this.input.action;
    this.updateTimers();
    this.updatePaddle();

    if (actionPressed) {
      for (const ball of this.state.balls) {
        if (ball.stuck) this.launchBall(ball, events);
      }
    }

    if (this.state.status === 'ready' && this.state.balls.every((ball) => !ball.stuck)) {
      this.state.status = 'running';
    }

    this.updateDrops(events);
    this.updateBalls(events);
    this.checkOutcome(events);
    return { state: this.snapshot(), events };
  }

  private updateTimers(): void {
    if (this.state.wideTicks > 0) this.state.wideTicks -= 1;
    if (this.state.slowTicks > 0) this.state.slowTicks -= 1;
    if (this.state.heavyTicks > 0) this.state.heavyTicks -= 1;
    this.state.paddleWidth = this.state.wideTicks > 0 ? PADDLE_WIDE_WIDTH : PADDLE_NORMAL_WIDTH;
  }

  private updatePaddle(): void {
    const half = this.state.paddleWidth / 2;
    this.state.paddleX = clamp(
      this.state.paddleX + this.input.move * PADDLE_SPEED,
      half + 18,
      FIELD_WIDTH - half - 18,
    );
    for (const ball of this.state.balls) {
      if (!ball.stuck) continue;
      ball.x = clamp(this.state.paddleX + ball.stuckOffset, BALL_RADIUS, FIELD_WIDTH - BALL_RADIUS);
      ball.y = PADDLE_Y - BALL_RADIUS - 2;
    }
  }

  private launchBall(ball: BallState, events: BlockshopEvent[]): void {
    ball.stuck = false;
    const direction = ball.stuckOffset < 0 ? -1 : ball.stuckOffset > 0 ? 1 : (ball.id % 2 === 0 ? -1 : 1);
    ball.vx = direction * Math.max(4, this.stage.ballSpeed - 4);
    ball.vy = -this.stage.ballSpeed;
    events.push({ tick: this.state.tick, type: 'ball_launched', ballId: ball.id });
  }

  private updateDrops(events: BlockshopEvent[]): void {
    const paddleLeft = this.state.paddleX - this.state.paddleWidth / 2;
    const paddleRight = this.state.paddleX + this.state.paddleWidth / 2;
    const survivors: PowerDropState[] = [];
    for (const drop of this.state.powerDrops) {
      drop.y += drop.vy;
      const half = POWER_DROP_SIZE / 2;
      const caught = drop.y + half >= PADDLE_Y
        && drop.y - half <= PADDLE_Y + PADDLE_HEIGHT
        && drop.x + half >= paddleLeft
        && drop.x - half <= paddleRight;
      if (caught) {
        this.applyPower(drop.kind);
        events.push({ tick: this.state.tick, type: 'power_collected', power: drop.kind });
      } else if (drop.y - half < FIELD_HEIGHT) {
        survivors.push(drop);
      }
    }
    this.state.powerDrops = survivors;
  }

  private applyPower(kind: PowerKind): void {
    if (kind === 'wide') this.state.wideTicks = WIDE_DURATION;
    if (kind === 'slow') this.state.slowTicks = SLOW_DURATION;
    if (kind === 'heavy') this.state.heavyTicks = HEAVY_DURATION;
    if (kind === 'sticky') this.state.stickyCharges += 2;
    if (kind === 'extra' && this.state.lives < 5) this.state.lives += 1;
    if (kind === 'multi') this.addMultiball();
  }

  private addMultiball(): void {
    const source = this.state.balls.find((ball) => !ball.stuck) ?? this.state.balls[0];
    if (!source) return;
    const speed = Math.max(this.stage.ballSpeed, Math.abs(source.vy));
    for (const direction of [-1, 1] as const) {
      this.state.balls.push({
        id: this.nextBallId++,
        x: source.x,
        y: source.y,
        vx: direction * Math.max(6, speed - 2),
        vy: -Math.max(6, speed - 1),
        radius: BALL_RADIUS,
        stuck: false,
        stuckOffset: 0,
      });
    }
  }

  private updateBalls(events: BlockshopEvent[]): void {
    const survivors: BallState[] = [];
    for (const ball of this.state.balls) {
      if (!ball.stuck) {
        for (let substep = 0; substep < SUBSTEPS; substep++) {
          this.moveBall(ball, events);
          if (ball.y - ball.radius > FIELD_HEIGHT) break;
        }
      }
      if (ball.y - ball.radius <= FIELD_HEIGHT) survivors.push(ball);
    }
    this.state.balls = survivors;
    if (this.state.balls.length === 0 && this.state.blocksRemaining > 0) {
      this.state.lives -= 1;
      this.state.combo = 0;
      events.push({ tick: this.state.tick, type: 'ball_lost', lives: this.state.lives });
      if (this.state.lives > 0) {
        this.state.balls.push(createBall(this.nextBallId++, this.state.paddleX));
        this.state.status = 'ready';
        this.previousAction = false;
      }
    }
  }

  private moveBall(ball: BallState, events: BlockshopEvent[]): void {
    const divisor = this.state.slowTicks > 0 ? SUBSTEPS * 4 : SUBSTEPS;
    const speedScale = this.state.slowTicks > 0 ? 3 : 1;
    const previousX = ball.x;
    const previousY = ball.y;
    ball.x += (ball.vx * speedScale) / divisor;
    ball.y += (ball.vy * speedScale) / divisor;

    if (ball.x - ball.radius <= 16 && ball.vx < 0) {
      ball.x = 16 + ball.radius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.radius >= FIELD_WIDTH - 16 && ball.vx > 0) {
      ball.x = FIELD_WIDTH - 16 - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ball.radius <= 92 && ball.vy < 0) {
      ball.y = 92 + ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    if (this.hitPaddle(ball, previousY)) {
      events.push({ tick: this.state.tick, type: 'paddle_hit', ballId: ball.id });
    }
    this.hitBrick(ball, previousX, previousY, events);
  }

  private hitPaddle(ball: BallState, previousY: number): boolean {
    if (ball.vy <= 0 || previousY + ball.radius > PADDLE_Y) return false;
    const left = this.state.paddleX - this.state.paddleWidth / 2;
    const right = this.state.paddleX + this.state.paddleWidth / 2;
    if (ball.x + ball.radius < left || ball.x - ball.radius > right || ball.y + ball.radius < PADDLE_Y) return false;

    ball.y = PADDLE_Y - ball.radius;
    const relative = clamp((ball.x - this.state.paddleX) / (this.state.paddleWidth / 2), -1, 1);
    const speed = this.stage.ballSpeed + Math.min(3, Math.floor(this.state.tick / 1800));
    let horizontal = Math.round(relative * (speed - 1)) + this.input.move * 2;
    if (Math.abs(horizontal) < 3) horizontal = horizontal < 0 ? -3 : 3;
    if (this.state.ticksWithoutBreak > 3 * 60) {
      const nudge = Math.floor(this.state.tick / (3 * 60)) % 2 === 0 ? 5 : -5;
      horizontal += nudge;
    }
    ball.vx = clamp(horizontal, -speed, speed);
    ball.vy = -Math.max(6, speed - Math.floor(Math.abs(ball.vx) / 3));
    this.state.combo = 0;
    if (this.state.stickyCharges > 0) {
      this.state.stickyCharges -= 1;
      ball.stuck = true;
      ball.stuckOffset = clamp(ball.x - this.state.paddleX, -this.state.paddleWidth / 2 + 18, this.state.paddleWidth / 2 - 18);
      ball.vx = 0;
      ball.vy = 0;
    }
    return true;
  }

  private hitBrick(ball: BallState, previousX: number, previousY: number, events: BlockshopEvent[]): void {
    for (const brick of this.state.bricks) {
      if (!brick.alive) continue;
      const nearestX = clamp(ball.x, brick.x, brick.x + brick.width);
      const nearestY = clamp(ball.y, brick.y, brick.y + brick.height);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy > ball.radius * ball.radius) continue;

      events.push({ tick: this.state.tick, type: 'brick_hit', brickId: brick.id, material: brick.material });
      const penetrates = this.state.heavyTicks > 0 && brick.material !== 'steel';
      if (!penetrates) {
        const wasAbove = previousY + ball.radius <= brick.y;
        const wasBelow = previousY - ball.radius >= brick.y + brick.height;
        const wasLeft = previousX + ball.radius <= brick.x;
        const wasRight = previousX - ball.radius >= brick.x + brick.width;
        if (wasAbove || wasBelow) ball.vy *= -1;
        else if (wasLeft || wasRight) ball.vx *= -1;
        else ball.vy *= -1;
      }

      if (brick.material === 'steel') return;
      brick.hitsRemaining = penetrates ? 0 : brick.hitsRemaining - 1;
      if (brick.hitsRemaining <= 0) this.breakBrick(brick, events);
      return;
    }
  }

  private breakBrick(brick: BrickState, events: BlockshopEvent[]): void {
    brick.alive = false;
    this.state.blocksRemaining -= 1;
    this.state.combo += 1;
    this.state.ticksWithoutBreak = 0;
    this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
    const materialPoints = brick.material === 'hardwood' ? 140 : 100;
    const points = materialPoints + Math.min(10, this.state.combo - 1) * 20;
    this.state.score += points;
    this.state.stageScore += points;
    events.push({ tick: this.state.tick, type: 'brick_broken', brickId: brick.id, points, power: brick.power });
    if (brick.power) {
      this.state.powerDrops.push({
        id: this.nextDropId++,
        kind: brick.power,
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        vy: POWER_DROP_SPEED,
      });
    }
  }

  private checkOutcome(events: BlockshopEvent[]): void {
    if (this.state.blocksRemaining === 0 && this.state.status !== 'won') {
      const timeBonus = Math.max(0, 4200 - this.state.tick);
      const bonus = this.state.lives * 500 + timeBonus;
      this.state.score += bonus;
      this.state.stageScore += bonus;
      this.state.status = 'won';
      events.push({ tick: this.state.tick, type: 'stage_won', bonus });
    } else if (this.state.lives <= 0 && this.state.status !== 'lost') {
      this.state.status = 'lost';
      events.push({ tick: this.state.tick, type: 'stage_lost' });
    }
  }
}

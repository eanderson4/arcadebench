import {
  BRACE_ACCELERATION,
  BRACED_MAX_SPEED,
  BRACE_DRAG_NUMERATOR,
  DEFAULT_FALL_PENALTY_TICKS,
  DRAG_DENOMINATOR,
  FINISH_SCORE,
  FIXED_SCALE,
  MARBLE_RADIUS,
  MAX_SPEED,
  NORMAL_DRAG_NUMERATOR,
  RING_POINTS,
  SLICK_DRAG_NUMERATOR,
  STEER_ACCELERATION,
  WALL_BOUNCE_DENOMINATOR,
  WALL_BOUNCE_NUMERATOR,
  clamp,
  toFixed,
  toWorldUnits,
} from './constants';
import type {
  AxisInput,
  DynamicObstacleState,
  FixedPoint,
  ObstacleSpec,
  RectangleSpec,
  RollSignalCourse,
  RollSignalEvent,
  RollSignalInput,
  RollSignalState,
  RunStatus,
  SurfaceKind,
  TickResult,
} from './types';
import { IDLE_INPUT } from './types';

interface FixedRectangle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function isAxisInput(value: unknown): value is AxisInput {
  return value === -1 || value === 0 || value === 1;
}

export function assertRollSignalInput(input: unknown): asserts input is RollSignalInput {
  if (!input || typeof input !== 'object') throw new Error('input must be an object');
  const candidate = input as Partial<RollSignalInput>;
  if (!isAxisInput(candidate.steerX) || !isAxisInput(candidate.steerY) || typeof candidate.brace !== 'boolean') {
    throw new Error('input must contain steerX and steerY in -1, 0, 1 plus a boolean brace');
  }
  if (Object.keys(candidate).some((key) => !['steerX', 'steerY', 'brace'].includes(key))) {
    throw new Error('input contains unsupported fields');
  }
}

function fixedRectangle(spec: RectangleSpec): FixedRectangle {
  return {
    id: spec.id,
    x: toFixed(spec.x),
    y: toFixed(spec.y),
    width: toFixed(spec.width),
    height: toFixed(spec.height),
  };
}

function pointInRectangle(point: FixedPoint, rectangle: FixedRectangle): boolean {
  return point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height;
}

function pointInCircle(point: FixedPoint, x: number, y: number, radius: number): boolean {
  const dx = point.x - toFixed(x);
  const dy = point.y - toFixed(y);
  const fixedRadius = toFixed(radius);
  return dx * dx + dy * dy <= fixedRadius * fixedRadius;
}

function fixedSpeed(x: number, y: number): number {
  return Math.trunc(Math.sqrt(x * x + y * y));
}

function triangleOffset(tick: number, periodTicks: number, range: number, phaseTicks = 0): number {
  const phase = ((tick + phaseTicks) % periodTicks + periodTicks) % periodTicks;
  const doubled = phase * 2;
  const numerator = doubled <= periodTicks ? doubled : periodTicks * 2 - doubled;
  return Math.trunc((range * numerator) / periodTicks);
}

function dynamicObstacle(spec: ObstacleSpec, tick: number): DynamicObstacleState {
  const motion = spec.motion;
  const offset = motion
    ? triangleOffset(tick, motion.periodTicks, toFixed(motion.range), motion.phaseTicks)
    : 0;
  return {
    id: spec.id,
    x: toFixed(spec.x) + (motion?.axis === 'x' ? offset : 0),
    y: toFixed(spec.y) + (motion?.axis === 'y' ? offset : 0),
    width: toFixed(spec.width),
    height: toFixed(spec.height),
  };
}

/** Deterministic fixed-point Roll Signal simulation. Projection belongs to the viewer. */
export class RollSignalEngine {
  readonly course: RollSignalCourse;

  private tickNumber = 0;
  private status: RunStatus = 'running';
  private input: RollSignalInput = { ...IDLE_INPUT };
  private position: FixedPoint;
  private velocity: FixedPoint = { x: 0, y: 0 };
  private checkpointId: string | null = null;
  private checkpoint: FixedPoint;
  private falls = 0;
  private penaltyTicks = 0;
  private ringsCollected = new Set<string>();
  private activeRelayPads = new Set<string>();
  private openGateIds = new Set<string>();
  private previousRailContacts = new Set<string>();
  private previousObstacleContacts = new Set<string>();
  private score = 0;

  private readonly decks: Array<FixedRectangle & { surface: SurfaceKind }>;
  private readonly rails: FixedRectangle[];

  constructor(course: RollSignalCourse) {
    this.course = structuredClone(course);
    this.position = { x: toFixed(this.course.spawn.x), y: toFixed(this.course.spawn.y) };
    this.checkpoint = { ...this.position };
    this.decks = this.course.decks.map((deck) => ({ ...fixedRectangle(deck), surface: deck.surface ?? 'normal' }));
    this.rails = this.course.rails.map(fixedRectangle);
  }

  setInput(input: RollSignalInput): void {
    assertRollSignalInput(input);
    this.input = { ...input };
  }

  reset(): RollSignalState {
    this.tickNumber = 0;
    this.status = 'running';
    this.input = { ...IDLE_INPUT };
    this.position = { x: toFixed(this.course.spawn.x), y: toFixed(this.course.spawn.y) };
    this.velocity = { x: 0, y: 0 };
    this.checkpointId = null;
    this.checkpoint = { ...this.position };
    this.falls = 0;
    this.penaltyTicks = 0;
    this.ringsCollected.clear();
    this.activeRelayPads.clear();
    this.openGateIds.clear();
    this.previousRailContacts.clear();
    this.previousObstacleContacts.clear();
    this.score = 0;
    return this.snapshot();
  }

  snapshot(): RollSignalState {
    const deck = this.deckAt(this.position);
    const effectiveTimeTicks = this.tickNumber + this.penaltyTicks;
    return {
      tick: this.tickNumber,
      courseId: this.course.id,
      status: this.status,
      position: { ...this.position },
      velocity: { ...this.velocity },
      checkpointId: this.checkpointId,
      checkpoint: { ...this.checkpoint },
      falls: this.falls,
      penaltyTicks: this.penaltyTicks,
      elapsedTicks: this.tickNumber,
      effectiveTimeTicks,
      timeRemainingTicks: Math.max(0, this.course.timeLimitTicks - effectiveTimeTicks),
      ringsCollected: [...this.ringsCollected],
      score: this.score,
      currentInput: { ...this.input },
      onDeck: deck !== undefined,
      surface: deck?.surface ?? 'normal',
      activeRelayPads: [...this.activeRelayPads],
      openGateIds: [...this.openGateIds],
      obstacles: (this.course.obstacles ?? []).map((obstacle) => dynamicObstacle(obstacle, this.tickNumber)),
    };
  }

  step(input?: RollSignalInput): TickResult {
    if (input !== undefined) this.setInput(input);
    if (this.status !== 'running') return { state: this.snapshot(), events: [] };

    this.tickNumber++;
    const events: RollSignalEvent[] = [];
    const previous = { ...this.position };
    this.integrateVelocity();
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;

    this.resolveSolids(previous, events);
    const onDeck = this.deckAt(this.position) !== undefined;
    if (!onDeck) this.resolveFall(events);
    else {
      this.resolveCheckpoint(events);
      this.resolveRings(events);
      this.resolveRelayPads(events);
      this.resolveGoal(events);
    }

    if (this.status === 'running' && this.tickNumber + this.penaltyTicks >= this.course.timeLimitTicks) {
      this.status = 'time_up';
      events.push({ tick: this.tickNumber, type: 'time_expired' });
    }
    return { state: this.snapshot(), events };
  }

  private integrateVelocity(): void {
    const surface = this.deckAt(this.position)?.surface ?? 'normal';
    const acceleration = this.input.brace ? BRACE_ACCELERATION : STEER_ACCELERATION;
    this.velocity.x += this.input.steerX * acceleration;
    this.velocity.y += this.input.steerY * acceleration;

    for (const zone of this.course.zones ?? []) {
      if (pointInRectangle(this.position, fixedRectangle(zone))) {
        this.velocity.x += zone.forceX;
        this.velocity.y += zone.forceY;
      }
    }

    const drag = this.input.brace
      ? BRACE_DRAG_NUMERATOR
      : surface === 'slick' ? SLICK_DRAG_NUMERATOR : NORMAL_DRAG_NUMERATOR;
    this.velocity.x = Math.trunc((this.velocity.x * drag) / DRAG_DENOMINATOR);
    this.velocity.y = Math.trunc((this.velocity.y * drag) / DRAG_DENOMINATOR);

    const maximum = this.input.brace ? BRACED_MAX_SPEED : MAX_SPEED;
    const speed = fixedSpeed(this.velocity.x, this.velocity.y);
    if (speed > maximum) {
      this.velocity.x = Math.trunc((this.velocity.x * maximum) / speed);
      this.velocity.y = Math.trunc((this.velocity.y * maximum) / speed);
    }
  }

  private resolveSolids(previous: FixedPoint, events: RollSignalEvent[]): void {
    const railContacts = new Set<string>();
    const closedGates = (this.course.gates ?? [])
      .filter((gate) => !this.openGateIds.has(gate.id))
      .map((gate) => fixedRectangle(gate));
    for (const solid of [...this.rails, ...closedGates]) {
      if (!this.resolveRectangleCollision(solid, previous)) continue;
      railContacts.add(solid.id);
      if (!this.previousRailContacts.has(solid.id)) {
        events.push({ tick: this.tickNumber, type: 'rail_hit', railId: solid.id });
      }
    }
    this.previousRailContacts = railContacts;

    const obstacleContacts = new Set<string>();
    for (const obstacle of this.course.obstacles ?? []) {
      const state = dynamicObstacle(obstacle, this.tickNumber);
      if (!this.resolveRectangleCollision(state, previous)) continue;
      obstacleContacts.add(obstacle.id);
      if (!this.previousObstacleContacts.has(obstacle.id)) {
        const penalty = obstacle.penaltyTicks ?? 0;
        this.penaltyTicks += penalty;
        events.push({ tick: this.tickNumber, type: 'obstacle_hit', obstacleId: obstacle.id, penaltyTicks: penalty });
      }
    }
    this.previousObstacleContacts = obstacleContacts;
  }

  private resolveRectangleCollision(rectangle: FixedRectangle, previous: FixedPoint): boolean {
    const left = rectangle.x - MARBLE_RADIUS;
    const right = rectangle.x + rectangle.width + MARBLE_RADIUS;
    const top = rectangle.y - MARBLE_RADIUS;
    const bottom = rectangle.y + rectangle.height + MARBLE_RADIUS;
    if (this.position.x <= left || this.position.x >= right || this.position.y <= top || this.position.y >= bottom) {
      return false;
    }

    const distances = [
      { side: 'left' as const, distance: Math.abs(this.position.x - left) },
      { side: 'right' as const, distance: Math.abs(right - this.position.x) },
      { side: 'top' as const, distance: Math.abs(this.position.y - top) },
      { side: 'bottom' as const, distance: Math.abs(bottom - this.position.y) },
    ];
    if (previous.x <= left) distances[0]!.distance = -1;
    else if (previous.x >= right) distances[1]!.distance = -1;
    else if (previous.y <= top) distances[2]!.distance = -1;
    else if (previous.y >= bottom) distances[3]!.distance = -1;
    distances.sort((a, b) => a.distance - b.distance);
    const side = distances[0]!.side;
    if (side === 'left') {
      this.position.x = left;
      if (this.velocity.x > 0) this.velocity.x = -Math.trunc((this.velocity.x * WALL_BOUNCE_NUMERATOR) / WALL_BOUNCE_DENOMINATOR);
    } else if (side === 'right') {
      this.position.x = right;
      if (this.velocity.x < 0) this.velocity.x = -Math.trunc((this.velocity.x * WALL_BOUNCE_NUMERATOR) / WALL_BOUNCE_DENOMINATOR);
    } else if (side === 'top') {
      this.position.y = top;
      if (this.velocity.y > 0) this.velocity.y = -Math.trunc((this.velocity.y * WALL_BOUNCE_NUMERATOR) / WALL_BOUNCE_DENOMINATOR);
    } else {
      this.position.y = bottom;
      if (this.velocity.y < 0) this.velocity.y = -Math.trunc((this.velocity.y * WALL_BOUNCE_NUMERATOR) / WALL_BOUNCE_DENOMINATOR);
    }
    return true;
  }

  private deckAt(point: FixedPoint): (FixedRectangle & { surface: SurfaceKind }) | undefined {
    return this.decks.find((deck) => pointInRectangle(point, deck));
  }

  private resolveFall(events: RollSignalEvent[]): void {
    const penalty = this.course.fallPenaltyTicks ?? DEFAULT_FALL_PENALTY_TICKS;
    const at = { x: toWorldUnits(this.position.x), y: toWorldUnits(this.position.y) };
    this.falls++;
    this.penaltyTicks += penalty;
    events.push({ tick: this.tickNumber, type: 'fell', at, penaltyTicks: penalty });
    this.position = { ...this.checkpoint };
    this.velocity = { x: 0, y: 0 };
    this.previousRailContacts.clear();
    this.previousObstacleContacts.clear();
    events.push({
      tick: this.tickNumber,
      type: 'respawned',
      checkpointId: this.checkpointId,
      at: { x: toWorldUnits(this.position.x), y: toWorldUnits(this.position.y) },
    });
  }

  private resolveCheckpoint(events: RollSignalEvent[]): void {
    for (const checkpoint of this.course.checkpoints) {
      if (checkpoint.id === this.checkpointId || !pointInCircle(this.position, checkpoint.x, checkpoint.y, checkpoint.radius)) continue;
      this.checkpointId = checkpoint.id;
      this.checkpoint = { x: toFixed(checkpoint.x), y: toFixed(checkpoint.y) };
      events.push({ tick: this.tickNumber, type: 'checkpoint_reached', checkpointId: checkpoint.id });
    }
  }

  private resolveRings(events: RollSignalEvent[]): void {
    for (const ring of this.course.rings) {
      if (this.ringsCollected.has(ring.id) || !pointInCircle(this.position, ring.x, ring.y, ring.radius)) continue;
      this.ringsCollected.add(ring.id);
      const points = ring.points ?? RING_POINTS;
      this.score += points;
      events.push({ tick: this.tickNumber, type: 'tone_ring', ringId: ring.id, points });
    }
  }

  private resolveRelayPads(events: RollSignalEvent[]): void {
    for (const pad of this.course.relayPads ?? []) {
      if (this.activeRelayPads.has(pad.id) || !pointInCircle(this.position, pad.x, pad.y, pad.radius)) continue;
      this.activeRelayPads.add(pad.id);
      events.push({ tick: this.tickNumber, type: 'relay_pad', padId: pad.id, gateId: pad.gateId });
    }
    for (const gate of this.course.gates ?? []) {
      if (this.openGateIds.has(gate.id) || !gate.requiredPadIds.every((id) => this.activeRelayPads.has(id))) continue;
      this.openGateIds.add(gate.id);
      events.push({ tick: this.tickNumber, type: 'gate_opened', gateId: gate.id });
    }
  }

  private resolveGoal(events: RollSignalEvent[]): void {
    if (!pointInCircle(this.position, this.course.goal.x, this.course.goal.y, this.course.goal.radius)) return;
    this.status = 'won';
    const ringPoints = this.course.rings.reduce(
      (sum, ring) => sum + (this.ringsCollected.has(ring.id) ? ring.points ?? RING_POINTS : 0),
      0,
    );
    this.score = ringPoints + Math.max(0, FINISH_SCORE - (this.tickNumber + this.penaltyTicks) * 50);
    events.push({ tick: this.tickNumber, type: 'goal_reached', score: this.score });
  }
}

export { FIXED_SCALE };

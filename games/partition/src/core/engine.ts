import { captureEmptyComponents } from './capture';
import { boundaryEdges, edgeBetween, edgeKey, nextPoint, opposite } from './edges';
import type {
  AnomalyState,
  ControlInput,
  Direction,
  Edge,
  GameEvent,
  PartitionScenario,
  PartitionState,
  Point,
  TickResult,
} from './types';
import { IDLE_INPUT } from './types';

export const FIXED_SCALE = 1024;

function cloneEdge(edge: Edge): Edge {
  return { ...edge };
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function withinBoard(point: Point, width: number, height: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height;
}

export class PartitionEngine {
  private tickNumber = 0;
  private status: PartitionState['status'] = 'running';
  private input: ControlInput = { ...IDLE_INPUT };
  private sparkPosition: Point;
  private sparkHeading: Direction = 'idle';
  private drawing = false;
  private drawRequiresRelease = false;
  private drawMode: ControlInput['draw'] = 'off';
  private integrity: number;
  private traceStart: Point | null = null;
  private trace: Edge[] = [];
  private walls = new Map<string, Edge>();
  private wallPoints = new Set<string>();
  private stabilized = new Set<number>();
  private anomalies: AnomalyState[];
  private controllerVersion = 0;

  constructor(readonly scenario: PartitionScenario) {
    this.sparkPosition = { x: Math.floor(scenario.width / 2), y: scenario.height };
    this.integrity = scenario.integrity;
    this.anomalies = scenario.anomalies.map((anomaly) => ({
      id: anomaly.id,
      position: {
        x: Math.round(anomaly.position[0] * FIXED_SCALE),
        y: Math.round(anomaly.position[1] * FIXED_SCALE),
      },
      velocity: {
        x: Math.round(anomaly.velocity[0] * FIXED_SCALE),
        y: Math.round(anomaly.velocity[1] * FIXED_SCALE),
      },
    }));
    for (const edge of boundaryEdges(scenario.width, scenario.height)) this.addWall(edge);
  }

  setInput(input: ControlInput): void {
    if (input.draw === 'off') this.drawRequiresRelease = false;
    this.input = { ...input };
  }

  setControllerVersion(version: number): void {
    this.controllerVersion = version;
  }

  snapshot(): PartitionState {
    return {
      tick: this.tickNumber,
      scenarioId: this.scenario.id,
      width: this.scenario.width,
      height: this.scenario.height,
      status: this.status,
      spark: {
        position: { ...this.sparkPosition },
        heading: this.sparkHeading,
        drawing: this.drawing,
        drawMode: this.drawMode,
        integrity: this.integrity,
      },
      anomalies: this.anomalies.map((anomaly) => ({
        id: anomaly.id,
        position: { ...anomaly.position },
        velocity: { ...anomaly.velocity },
      })),
      walls: [...this.walls.values()].map(cloneEdge),
      trace: this.trace.map(cloneEdge),
      stabilizedCells: [...this.stabilized].sort((a, b) => a - b),
      capturedFraction: this.stabilized.size / (this.scenario.width * this.scenario.height),
      targetFraction: this.scenario.targetFraction,
      controllerVersion: this.controllerVersion,
      currentInput: { ...this.input },
    };
  }

  step(): TickResult {
    if (this.status !== 'running') return { state: this.snapshot(), events: [] };
    this.tickNumber++;
    const events: GameEvent[] = [];
    this.moveSpark(events);
    this.moveAnomalies(events);
    if (this.integrity <= 0 && this.status === 'running') {
      this.status = 'lost';
      events.push({ tick: this.tickNumber, type: 'game_lost' });
    }
    return { state: this.snapshot(), events };
  }

  private addWall(edge: Edge): void {
    this.walls.set(edgeKey(edge), cloneEdge(edge));
    this.wallPoints.add(pointKey({ x: edge.ax, y: edge.ay }));
    this.wallPoints.add(pointKey({ x: edge.bx, y: edge.by }));
  }

  private moveSpark(events: GameEvent[]): void {
    const direction = this.input.direction;
    if (direction === 'idle') return;
    if (this.drawing && opposite(direction) === this.sparkHeading) return;

    const target = nextPoint(this.sparkPosition, direction);
    if (!withinBoard(target, this.scenario.width, this.scenario.height)) return;
    const edge = edgeBetween(this.sparkPosition, target);
    const key = edgeKey(edge);
    const onExistingWall = this.walls.has(key);
    const onTrace = this.trace.some((candidate) => edgeKey(candidate) === key);

    if (!this.drawing) {
      if (onExistingWall) {
        this.sparkPosition = target;
        this.sparkHeading = direction;
        return;
      }
      if (this.input.draw === 'off' || this.drawRequiresRelease || onTrace) return;
      this.drawing = true;
      this.drawMode = this.input.draw;
      this.traceStart = { ...this.sparkPosition };
      events.push({ tick: this.tickNumber, type: 'trace_started', at: { ...this.sparkPosition } });
    } else if (onTrace || onExistingWall) {
      return;
    }

    this.trace.push(edge);
    this.sparkPosition = target;
    this.sparkHeading = direction;

    if (this.drawing && this.wallPoints.has(pointKey(target))) this.completeTrace(events);
  }

  private completeTrace(events: GameEvent[]): void {
    for (const edge of this.trace) this.addWall(edge);
    const result = captureEmptyComponents(
      this.scenario.width,
      this.scenario.height,
      this.walls.values(),
      this.stabilized,
      this.anomalies,
      FIXED_SCALE,
    );
    this.stabilized = result.stabilized;
    this.trace = [];
    this.traceStart = null;
    this.drawing = false;
    this.drawRequiresRelease = true;
    this.drawMode = 'off';
    this.input = { direction: this.input.direction, draw: 'off' };
    events.push({ tick: this.tickNumber, type: 'trace_completed', capturedCells: result.newlyStabilized });

    const capturedFraction = this.stabilized.size / (this.scenario.width * this.scenario.height);
    if (capturedFraction >= this.scenario.targetFraction) {
      this.status = 'won';
      events.push({ tick: this.tickNumber, type: 'level_won', capturedFraction });
    }
  }

  private moveAnomalies(events: GameEvent[]): void {
    for (const anomaly of this.anomalies) {
      let nextX = anomaly.position.x + anomaly.velocity.x;
      let nextY = anomaly.position.y + anomaly.velocity.y;
      const crossedVertical = Math.floor(anomaly.position.x / FIXED_SCALE) !== Math.floor(nextX / FIXED_SCALE);
      const crossedHorizontal = Math.floor(anomaly.position.y / FIXED_SCALE) !== Math.floor(nextY / FIXED_SCALE);

      if (crossedVertical) {
        const boundaryX = anomaly.velocity.x > 0 ? Math.floor(nextX / FIXED_SCALE) : Math.floor(anomaly.position.x / FIXED_SCALE);
        const cellY = Math.max(0, Math.min(this.scenario.height - 1, Math.floor(anomaly.position.y / FIXED_SCALE)));
        const edge = { ax: boundaryX, ay: cellY, bx: boundaryX, by: cellY + 1 };
        if (this.trace.some((candidate) => edgeKey(candidate) === edgeKey(edge))) {
          this.hitTrace(anomaly.id, events);
        } else if (this.walls.has(edgeKey(edge))) {
          anomaly.velocity.x *= -1;
          nextX = anomaly.position.x + anomaly.velocity.x;
        }
      }

      if (crossedHorizontal) {
        const boundaryY = anomaly.velocity.y > 0 ? Math.floor(nextY / FIXED_SCALE) : Math.floor(anomaly.position.y / FIXED_SCALE);
        const cellX = Math.max(0, Math.min(this.scenario.width - 1, Math.floor(anomaly.position.x / FIXED_SCALE)));
        const edge = { ax: cellX, ay: boundaryY, bx: cellX + 1, by: boundaryY };
        if (this.trace.some((candidate) => edgeKey(candidate) === edgeKey(edge))) {
          this.hitTrace(anomaly.id, events);
        } else if (this.walls.has(edgeKey(edge))) {
          anomaly.velocity.y *= -1;
          nextY = anomaly.position.y + anomaly.velocity.y;
        }
      }

      anomaly.position.x = Math.max(1, Math.min(this.scenario.width * FIXED_SCALE - 1, nextX));
      anomaly.position.y = Math.max(1, Math.min(this.scenario.height * FIXED_SCALE - 1, nextY));
      if (this.drawing) {
        const dx = anomaly.position.x - this.sparkPosition.x * FIXED_SCALE;
        const dy = anomaly.position.y - this.sparkPosition.y * FIXED_SCALE;
        const tipCollisionRadius = FIXED_SCALE / 3;
        if (dx * dx + dy * dy <= tipCollisionRadius * tipCollisionRadius) {
          this.hitTrace(anomaly.id, events);
        }
      }
    }
  }

  private hitTrace(anomalyId: string, events: GameEvent[]): void {
    if (!this.drawing || !this.traceStart) return;
    this.integrity--;
    this.sparkPosition = { ...this.traceStart };
    this.sparkHeading = 'idle';
    this.drawing = false;
    this.drawRequiresRelease = true;
    this.drawMode = 'off';
    this.traceStart = null;
    this.trace = [];
    this.input = { ...IDLE_INPUT };
    events.push({ tick: this.tickNumber, type: 'trace_hit', anomalyId, integrity: this.integrity });
  }
}

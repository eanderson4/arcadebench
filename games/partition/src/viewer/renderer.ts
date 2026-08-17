import { FIXED_SCALE } from '../core/engine';
import { filamentSegment } from '../core/anomalies';
import type { Edge, PartitionState } from '../core/types';

export interface RenderOptions {
  ambientTime?: number;
  emphasizeEvents?: boolean;
  smoothSpark?: boolean;
}

interface VisualPoint {
  x: number;
  y: number;
}

const COLORS = {
  background: '#050910',
  grid: 'rgba(93, 211, 231, 0.07)',
  wall: '#77edff',
  stable: '#20b7c6',
  trace: '#ffd35a',
  anomaly: '#ff3e91',
  anomalyCore: '#fff0f7',
  filament: '#ff5ab3',
  filamentHot: '#ffbd68',
  spark: '#e8fdff',
};

function edgePath(context: CanvasRenderingContext2D, edge: Edge, sx: number, sy: number): void {
  context.moveTo(edge.ax * sx, edge.ay * sy);
  context.lineTo(edge.bx * sx, edge.by * sy);
}

function hash(value: number): number {
  const n = Math.sin(value * 91.913 + 17.17) * 43_758.5453;
  return n - Math.floor(n);
}

function directionAngle(direction: PartitionState['spark']['heading']): number {
  switch (direction) {
    case 'up': return -Math.PI / 2;
    case 'down': return Math.PI / 2;
    case 'left': return Math.PI;
    case 'right': return 0;
    default: return -Math.PI / 2;
  }
}

export class PartitionRenderer {
  private readonly context: CanvasRenderingContext2D;
  private sparkFrom: VisualPoint | null = null;
  private sparkTarget: VisualPoint | null = null;
  private sparkTransitionStarted = 0;
  private sparkTransitionSeconds = 0.075;
  private lastScenarioId: string | null = null;
  private lastStateTick = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    this.context = context;
  }

  render(state: PartitionState, options: RenderOptions = {}): void {
    const { context, canvas } = this;
    const sx = canvas.width / state.width;
    const sy = canvas.height / state.height;
    const time = options.ambientTime ?? state.tick / 30;
    const visualSpark = this.resolveVisualSpark(state, time, options.smoothSpark ?? true);

    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    this.drawBackdrop(state, time, sx, sy);
    this.drawStabilizedField(state, time, sx, sy);
    this.drawGrid(state, sx, sy);
    this.drawBlockedField(state, time, sx, sy);
    this.drawWalls(state, sx, sy);
    this.drawTrace(state, time, sx, sy, visualSpark);
    this.drawAnomalies(state, time, sx, sy);
    this.drawSpark(state, time, sx, sy, visualSpark);
    this.drawFrame(state);
    context.restore();
  }

  private sampleSparkTransition(time: number): VisualPoint {
    if (!this.sparkFrom || !this.sparkTarget) return { x: 0, y: 0 };
    const raw = (time - this.sparkTransitionStarted) / this.sparkTransitionSeconds;
    const progress = Math.max(0, Math.min(1, raw));
    const eased = 1 - (1 - progress) ** 3;
    return {
      x: this.sparkFrom.x + (this.sparkTarget.x - this.sparkFrom.x) * eased,
      y: this.sparkFrom.y + (this.sparkTarget.y - this.sparkFrom.y) * eased,
    };
  }

  private resolveVisualSpark(state: PartitionState, time: number, smooth: boolean): VisualPoint {
    const target = { ...state.spark.position };
    const discontinuity = this.lastScenarioId !== state.scenarioId
      || state.tick < this.lastStateTick
      || state.tick - this.lastStateTick > Math.max(3, state.sparkMoveEveryTicks * 2);

    if (!smooth || !this.sparkTarget || !this.sparkFrom || discontinuity) {
      this.sparkFrom = target;
      this.sparkTarget = target;
      this.sparkTransitionStarted = time;
    } else if (target.x !== this.sparkTarget.x || target.y !== this.sparkTarget.y) {
      this.sparkFrom = this.sampleSparkTransition(time);
      this.sparkTarget = target;
      this.sparkTransitionStarted = time;
      this.sparkTransitionSeconds = Math.min(0.11, 0.024 * state.sparkMoveEveryTicks + 0.018);
    }

    this.lastScenarioId = state.scenarioId;
    this.lastStateTick = state.tick;
    return this.sampleSparkTransition(time);
  }

  private drawBackdrop(state: PartitionState, time: number, sx: number, sy: number): void {
    const { context, canvas } = this;
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const glowX = canvas.width * (0.46 + Math.sin(time * 0.17) * 0.08);
    const glowY = canvas.height * (0.42 + Math.cos(time * 0.13) * 0.07);
    const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, canvas.width * 0.68);
    glow.addColorStop(0, 'rgba(13, 66, 84, 0.25)');
    glow.addColorStop(0.48, 'rgba(10, 35, 51, 0.1)');
    glow.addColorStop(1, 'rgba(2, 5, 10, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < 34; index++) {
      const x = hash(index * 3.1 + state.scenarioId.length) * canvas.width;
      const y = (hash(index * 7.7) * canvas.height + time * (3 + hash(index) * 5)) % canvas.height;
      const alpha = 0.06 + hash(index * 11.2) * 0.1;
      context.fillStyle = `rgba(116, 227, 244, ${alpha})`;
      context.fillRect(x, y, 1, 1);
    }
    context.globalCompositeOperation = 'source-over';

    const scanY = (time * 24) % canvas.height;
    const scan = context.createLinearGradient(0, scanY - sy * 2, 0, scanY + sy * 2);
    scan.addColorStop(0, 'rgba(60, 224, 239, 0)');
    scan.addColorStop(0.5, 'rgba(60, 224, 239, 0.035)');
    scan.addColorStop(1, 'rgba(60, 224, 239, 0)');
    context.fillStyle = scan;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  private drawGrid(state: PartitionState, sx: number, sy: number): void {
    const { context, canvas } = this;
    context.save();
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 1; x < state.width; x++) {
      context.moveTo(Math.round(x * sx) + 0.5, 0);
      context.lineTo(Math.round(x * sx) + 0.5, canvas.height);
    }
    for (let y = 1; y < state.height; y++) {
      context.moveTo(0, Math.round(y * sy) + 0.5);
      context.lineTo(canvas.width, Math.round(y * sy) + 0.5);
    }
    context.stroke();
    context.restore();
  }

  private drawStabilizedField(state: PartitionState, time: number, sx: number, sy: number): void {
    if (state.stabilizedCells.length === 0) return;
    const { context } = this;
    context.save();
    for (const cell of state.stabilizedCells) {
      const x = cell % state.width;
      const y = Math.floor(cell / state.width);
      const shimmer = 0.105 + Math.sin(x * 0.55 + y * 0.31 + time * 1.4) * 0.018;
      context.fillStyle = `rgba(32, 183, 198, ${shimmer})`;
      context.fillRect(x * sx, y * sy, sx + 0.7, sy + 0.7);
    }

    context.beginPath();
    for (const cell of state.stabilizedCells) {
      const x = cell % state.width;
      const y = Math.floor(cell / state.width);
      context.rect(x * sx, y * sy, sx + 0.7, sy + 0.7);
    }
    context.clip();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = 'rgba(126, 242, 250, 0.035)';
    const stripeOffset = (time * 8) % 32;
    for (let x = -this.canvas.height + stripeOffset; x < this.canvas.width; x += 32) {
      context.beginPath();
      context.moveTo(x, this.canvas.height);
      context.lineTo(x + this.canvas.height, 0);
      context.lineTo(x + this.canvas.height + 5, 0);
      context.lineTo(x + 5, this.canvas.height);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  private drawBlockedField(state: PartitionState, time: number, sx: number, sy: number): void {
    if (state.blockedCells.length === 0) return;
    const { context } = this;
    context.save();
    context.fillStyle = 'rgba(2, 5, 9, 0.94)';
    context.beginPath();
    for (const cell of state.blockedCells) {
      const x = cell % state.width;
      const y = Math.floor(cell / state.width);
      context.rect(x * sx, y * sy, sx + 0.5, sy + 0.5);
    }
    context.fill();
    context.clip();

    const offset = (time * 5) % 24;
    context.strokeStyle = 'rgba(84, 199, 216, 0.055)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = -this.canvas.height + offset; x < this.canvas.width; x += 24) {
      context.moveTo(x, this.canvas.height);
      context.lineTo(x + this.canvas.height, 0);
    }
    context.stroke();
    context.restore();
  }

  private drawWalls(state: PartitionState, sx: number, sy: number): void {
    const { context } = this;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (const edge of state.walls) edgePath(context, edge, sx, sy);
    context.strokeStyle = 'rgba(27, 170, 193, 0.2)';
    context.shadowColor = COLORS.wall;
    context.shadowBlur = 17;
    context.lineWidth = 8;
    context.stroke();
    context.shadowBlur = 9;
    context.strokeStyle = 'rgba(77, 219, 239, 0.65)';
    context.lineWidth = 3;
    context.stroke();
    context.shadowBlur = 2;
    context.strokeStyle = COLORS.wall;
    context.lineWidth = 1.1;
    context.stroke();
    context.restore();
  }

  private drawTrace(
    state: PartitionState,
    time: number,
    sx: number,
    sy: number,
    visualSpark: VisualPoint,
  ): void {
    if (state.trace.length === 0) return;
    const { context } = this;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (let index = 0; index < state.trace.length; index++) {
      const edge = state.trace[index];
      if (index === state.trace.length - 1) {
        context.moveTo(edge.ax * sx, edge.ay * sy);
        context.lineTo(visualSpark.x * sx, visualSpark.y * sy);
      } else {
        edgePath(context, edge, sx, sy);
      }
    }
    context.strokeStyle = 'rgba(255, 174, 55, 0.3)';
    context.shadowColor = COLORS.trace;
    context.shadowBlur = 24;
    context.lineWidth = 11;
    context.stroke();
    context.strokeStyle = COLORS.trace;
    context.shadowBlur = 12;
    context.lineWidth = 3.5;
    context.stroke();
    context.setLineDash([2, 8]);
    context.lineDashOffset = -time * 36;
    context.strokeStyle = '#fff8cf';
    context.shadowBlur = 5;
    context.lineWidth = 1.4;
    context.stroke();
    context.restore();
  }

  private drawAnomalies(state: PartitionState, time: number, sx: number, sy: number): void {
    const { context } = this;
    for (let index = 0; index < state.anomalies.length; index++) {
      const anomaly = state.anomalies[index];
      if (anomaly.kind === 'filament') {
        this.drawFilament(state, anomaly, index, time, sx, sy);
        continue;
      }
      const x = (anomaly.position.x / FIXED_SCALE) * sx;
      const y = (anomaly.position.y / FIXED_SCALE) * sy;
      const vx = (anomaly.velocity.x / FIXED_SCALE) * sx;
      const vy = (anomaly.velocity.y / FIXED_SCALE) * sy;
      const phase = time * 4.3 + index * 2.7;

      context.save();
      context.globalCompositeOperation = 'screen';
      for (let trail = 5; trail >= 1; trail--) {
        const alpha = (6 - trail) * 0.014;
        context.fillStyle = `rgba(255, 48, 137, ${alpha})`;
        context.beginPath();
        context.arc(x - vx * trail * 1.6, y - vy * trail * 1.6, 8 + trail * 1.7, 0, Math.PI * 2);
        context.fill();
      }

      context.translate(x, y);
      context.rotate(phase * 0.17);
      context.shadowColor = COLORS.anomaly;
      context.shadowBlur = 28;
      context.strokeStyle = COLORS.anomaly;
      context.lineWidth = 2.1;
      context.beginPath();
      const vertices = 11;
      for (let vertex = 0; vertex <= vertices; vertex++) {
        const angle = (vertex / vertices) * Math.PI * 2;
        const radius = 8.5 + Math.sin(angle * 4 + phase) * 2.6 + hash(index * 37 + vertex) * 2.2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (vertex === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.stroke();

      context.rotate(-phase * 0.31);
      context.strokeStyle = 'rgba(255, 139, 190, 0.72)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(0, 0, 15 + Math.sin(phase) * 1.5, 0.4, Math.PI * 1.45);
      context.stroke();
      context.rotate(phase * 0.8);
      context.beginPath();
      context.arc(0, 0, 20, 0, Math.PI * 0.45);
      context.stroke();

      context.fillStyle = COLORS.anomalyCore;
      context.shadowBlur = 15;
      context.beginPath();
      context.arc(0, 0, 2.8, 0, Math.PI * 2);
      context.fill();

      for (let particle = 0; particle < 7; particle++) {
        const angle = hash(index * 71 + particle) * Math.PI * 2 + time * (particle % 2 ? 0.5 : -0.35);
        const radius = 18 + hash(particle * 19 + index) * 17;
        const size = 0.8 + hash(particle * 5.3) * 1.5;
        context.globalAlpha = 0.3 + hash(particle * 9.8 + Math.floor(time * 6)) * 0.6;
        context.fillStyle = particle % 3 === 0 ? '#ffd0e4' : COLORS.anomaly;
        context.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius, size, size);
      }
      context.restore();
    }
  }

  private drawFilament(
    state: PartitionState,
    anomaly: PartitionState['anomalies'][number],
    index: number,
    time: number,
    sx: number,
    sy: number,
  ): void {
    const { context } = this;
    const body = filamentSegment(anomaly, state.walls, FIXED_SCALE);
    const start = { x: body.start.x * sx, y: body.start.y * sy };
    const end = { x: body.end.x * sx, y: body.end.y * sy };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / magnitude, y: dx / magnitude };
    const phase = time * 7.5 + index * 1.91;

    context.save();
    context.globalCompositeOperation = 'screen';
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.strokeStyle = 'rgba(255, 60, 157, 0.12)';
    context.shadowColor = COLORS.filament;
    context.shadowBlur = 30;
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();

    for (let strand = 0; strand < 3; strand++) {
      context.strokeStyle = strand === 1 ? COLORS.filamentHot : COLORS.filament;
      context.shadowColor = strand === 1 ? COLORS.filamentHot : COLORS.filament;
      context.shadowBlur = strand === 1 ? 13 : 20;
      context.globalAlpha = strand === 1 ? 0.92 : 0.72;
      context.lineWidth = strand === 1 ? 1.5 : 2;
      context.beginPath();
      for (let point = 0; point <= 12; point++) {
        const amount = point / 12;
        const envelope = Math.sin(amount * Math.PI);
        const wave = Math.sin(amount * Math.PI * (4 + strand) + phase + strand * 2.3);
        const crackle = (hash(index * 103 + point * 7 + strand * 31 + Math.floor(time * 12)) - 0.5) * 4;
        const offset = envelope * (wave * (4 + strand * 1.5) + crackle);
        const x = start.x + dx * amount + normal.x * offset;
        const y = start.y + dy * amount + normal.y * offset;
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }

    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    context.globalAlpha = 1;
    context.shadowColor = COLORS.filamentHot;
    context.shadowBlur = 18;
    context.fillStyle = '#fff4d8';
    for (const amount of [0, 0.5, 1]) {
      const x = start.x + dx * amount;
      const y = start.y + dy * amount;
      context.beginPath();
      context.arc(x, y, amount === 0.5 ? 3.1 : 2.1, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = 'rgba(255, 189, 104, 0.55)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(centerX, centerY, 9 + Math.sin(phase) * 2, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  private drawSpark(
    state: PartitionState,
    time: number,
    sx: number,
    sy: number,
    visualSpark: VisualPoint,
  ): void {
    const { context } = this;
    const x = visualSpark.x * sx;
    const y = visualSpark.y * sy;
    const angle = directionAngle(state.spark.heading);
    const pulse = 1 + Math.sin(time * 7) * 0.08;
    const primary = state.spark.drawing ? COLORS.trace : COLORS.spark;

    context.save();
    context.translate(x, y);
    context.rotate(angle + Math.PI / 2);
    context.scale(pulse, pulse);
    context.globalCompositeOperation = 'screen';
    context.shadowColor = primary;
    context.shadowBlur = state.spark.drawing ? 28 : 20;
    context.fillStyle = primary;
    context.beginPath();
    context.moveTo(0, -9);
    context.lineTo(6.5, 0);
    context.lineTo(0, 9);
    context.lineTo(-6.5, 0);
    context.closePath();
    context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(0, 0, 2.2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = state.spark.drawing ? 'rgba(255, 211, 90, 0.7)' : 'rgba(159, 244, 255, 0.55)';
    context.lineWidth = 1;
    context.shadowBlur = 6;
    context.beginPath();
    context.arc(0, 0, 13 + Math.sin(time * 5) * 2, 0, Math.PI * 1.4);
    context.stroke();
    context.restore();
  }

  private drawFrame(state: PartitionState): void {
    const { context, canvas } = this;
    const progress = Math.min(1, state.capturedFraction / state.targetFraction);
    const barWidth = canvas.width * progress;
    context.save();
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#38bdcb');
    gradient.addColorStop(1, '#8af6ff');
    context.fillStyle = 'rgba(255, 255, 255, 0.06)';
    context.fillRect(0, 0, canvas.width, 3);
    context.fillStyle = gradient;
    context.shadowColor = COLORS.wall;
    context.shadowBlur = 12;
    context.fillRect(0, 0, barWidth, 3);

    const vignette = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.height * 0.2,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
}

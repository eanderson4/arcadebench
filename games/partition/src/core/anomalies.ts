import type { AnomalyState, Edge, FixedPoint } from './types';

export const DEFAULT_FILAMENT_LENGTH = 5.5;
export const FILAMENT_TRACE_RADIUS = 0.14;
export const FILAMENT_SPARK_RADIUS = 0.3;

interface CellSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function rayWallDistance(
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  walls: readonly Edge[],
  maximum: number,
): number {
  let distance = maximum;
  for (const wall of walls) {
    if (wall.ax === wall.bx && Math.abs(direction.x) > 1e-8) {
      const candidate = (wall.ax - origin.x) / direction.x;
      if (candidate <= 0 || candidate >= distance) continue;
      const y = origin.y + candidate * direction.y;
      if (y >= Math.min(wall.ay, wall.by) - 1e-8 && y <= Math.max(wall.ay, wall.by) + 1e-8) {
        distance = candidate;
      }
    } else if (wall.ay === wall.by && Math.abs(direction.y) > 1e-8) {
      const candidate = (wall.ay - origin.y) / direction.y;
      if (candidate <= 0 || candidate >= distance) continue;
      const x = origin.x + candidate * direction.x;
      if (x >= Math.min(wall.ax, wall.bx) - 1e-8 && x <= Math.max(wall.ax, wall.bx) + 1e-8) {
        distance = candidate;
      }
    }
  }
  return Math.max(0, distance - 0.08);
}

/** Returns the physical line body, clipped so it never reaches through a wall. */
export function filamentSegment(
  anomaly: AnomalyState,
  walls: readonly Edge[],
  fixedScale: number,
): CellSegment {
  const origin = {
    x: anomaly.position.x / fixedScale,
    y: anomaly.position.y / fixedScale,
  };
  const magnitude = Math.hypot(anomaly.velocity.x, anomaly.velocity.y);
  const direction = magnitude > 0
    ? { x: anomaly.velocity.x / magnitude, y: anomaly.velocity.y / magnitude }
    : { x: 1, y: 0 };
  const halfLength = Math.max(1, anomaly.length ?? DEFAULT_FILAMENT_LENGTH) / 2;
  const forward = rayWallDistance(origin, direction, walls, halfLength);
  const backwardDirection = { x: -direction.x, y: -direction.y };
  const backward = rayWallDistance(origin, backwardDirection, walls, halfLength);
  return {
    start: {
      x: origin.x + backwardDirection.x * backward,
      y: origin.y + backwardDirection.y * backward,
    },
    end: {
      x: origin.x + direction.x * forward,
      y: origin.y + direction.y * forward,
    },
  };
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(first: CellSegment, second: CellSegment): boolean {
  const a = orientation(first.start, first.end, second.start);
  const b = orientation(first.start, first.end, second.end);
  const c = orientation(second.start, second.end, first.start);
  const d = orientation(second.start, second.end, first.end);
  return ((a <= 0 && b >= 0) || (a >= 0 && b <= 0))
    && ((c <= 0 && d >= 0) || (c >= 0 && d <= 0));
}

function pointSegmentDistanceSquared(point: { x: number; y: number }, segment: CellSegment): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const denominator = dx * dx + dy * dy;
  const raw = denominator === 0
    ? 0
    : ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / denominator;
  const amount = Math.max(0, Math.min(1, raw));
  const x = segment.start.x + dx * amount;
  const y = segment.start.y + dy * amount;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function edgeSegment(edge: Edge): CellSegment {
  return {
    start: { x: edge.ax, y: edge.ay },
    end: { x: edge.bx, y: edge.by },
  };
}

export function filamentTouchesEdges(
  anomaly: AnomalyState,
  walls: readonly Edge[],
  edges: readonly Edge[],
  fixedScale: number,
  radius = FILAMENT_TRACE_RADIUS,
): boolean {
  const filament = filamentSegment(anomaly, walls, fixedScale);
  return edges.some((edge) => {
    const target = edgeSegment(edge);
    if (segmentsIntersect(filament, target)) return true;
    const distanceSquared = Math.min(
      pointSegmentDistanceSquared(filament.start, target),
      pointSegmentDistanceSquared(filament.end, target),
      pointSegmentDistanceSquared(target.start, filament),
      pointSegmentDistanceSquared(target.end, filament),
    );
    return distanceSquared <= radius * radius;
  });
}

export function filamentTouchesPoint(
  anomaly: AnomalyState,
  walls: readonly Edge[],
  point: FixedPoint,
  fixedScale: number,
  radius = FILAMENT_SPARK_RADIUS,
): boolean {
  const filament = filamentSegment(anomaly, walls, fixedScale);
  return pointSegmentDistanceSquared({ x: point.x / fixedScale, y: point.y / fixedScale }, filament) <= radius * radius;
}

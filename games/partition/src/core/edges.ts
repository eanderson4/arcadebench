import type { Direction, Edge, Point } from './types';

export function edgeKey(edge: Edge): string {
  const first = edge.ax < edge.bx || (edge.ax === edge.bx && edge.ay <= edge.by);
  return first
    ? `${edge.ax},${edge.ay}:${edge.bx},${edge.by}`
    : `${edge.bx},${edge.by}:${edge.ax},${edge.ay}`;
}

export function edgeBetween(a: Point, b: Point): Edge {
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
}

export function nextPoint(point: Point, direction: Direction): Point {
  switch (direction) {
    case 'up':
      return { x: point.x, y: point.y - 1 };
    case 'down':
      return { x: point.x, y: point.y + 1 };
    case 'left':
      return { x: point.x - 1, y: point.y };
    case 'right':
      return { x: point.x + 1, y: point.y };
    case 'idle':
      return { ...point };
  }
}

export function opposite(direction: Direction): Direction {
  switch (direction) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    case 'idle':
      return 'idle';
  }
}

export function boundaryEdges(width: number, height: number): Edge[] {
  const edges: Edge[] = [];
  for (let x = 0; x < width; x++) {
    edges.push({ ax: x, ay: 0, bx: x + 1, by: 0 });
    edges.push({ ax: x, ay: height, bx: x + 1, by: height });
  }
  for (let y = 0; y < height; y++) {
    edges.push({ ax: 0, ay: y, bx: 0, by: y + 1 });
    edges.push({ ax: width, ay: y, bx: width, by: y + 1 });
  }
  return edges;
}


import { edgeKey } from './edges';
import type { AnomalyState, Edge } from './types';

export interface CaptureResult {
  stabilized: Set<number>;
  newlyStabilized: number;
}

function cellIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function barrierBetween(ax: number, ay: number, bx: number, by: number, walls: Set<string>): boolean {
  if (bx === ax + 1) return walls.has(edgeKey({ ax: bx, ay, bx, by: by + 1 }));
  if (bx === ax - 1) return walls.has(edgeKey({ ax, ay, bx: ax, by: ay + 1 }));
  if (by === ay + 1) return walls.has(edgeKey({ ax, ay: by, bx: ax + 1, by }));
  return walls.has(edgeKey({ ax, ay, bx: ax + 1, by: ay }));
}

export function captureEmptyComponents(
  width: number,
  height: number,
  wallEdges: Iterable<Edge>,
  currentStabilized: ReadonlySet<number>,
  anomalies: readonly AnomalyState[],
  fixedScale: number,
  blockedCells: ReadonlySet<number> = new Set(),
): CaptureResult {
  const walls = new Set([...wallEdges].map(edgeKey));
  const stabilized = new Set(currentStabilized);
  const occupied = new Set<number>();
  for (const anomaly of anomalies) {
    const x = Math.max(0, Math.min(width - 1, Math.floor(anomaly.position.x / fixedScale)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(anomaly.position.y / fixedScale)));
    occupied.add(cellIndex(x, y, width));
  }

  const visited = new Set<number>();
  let newlyStabilized = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = cellIndex(x, y, width);
      if (stabilized.has(start) || blockedCells.has(start) || visited.has(start)) continue;

      const component: number[] = [];
      const queue: Array<[number, number]> = [[x, y]];
      visited.add(start);
      let containsAnomaly = false;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        const index = cellIndex(cx, cy, width);
        component.push(index);
        containsAnomaly ||= occupied.has(index);

        const neighbors: Array<[number, number]> = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = cellIndex(nx, ny, width);
          if (visited.has(next) || stabilized.has(next) || blockedCells.has(next) || barrierBetween(cx, cy, nx, ny, walls)) continue;
          visited.add(next);
          queue.push([nx, ny]);
        }
      }

      if (!containsAnomaly) {
        for (const index of component) stabilized.add(index);
        newlyStabilized += component.length;
      }
    }
  }
  return { stabilized, newlyStabilized };
}

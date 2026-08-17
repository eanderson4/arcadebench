import { describe, expect, it } from 'vitest';
import { captureEmptyComponents } from '../src/core/capture';
import { boundaryEdges } from '../src/core/edges';
import { FIXED_SCALE } from '../src/core/engine';
import type { AnomalyState, Edge } from '../src/core/types';

describe('captureEmptyComponents', () => {
  it('stabilizes the side of a partition without an anomaly', () => {
    const walls: Edge[] = [...boundaryEdges(4, 2)];
    for (let y = 0; y < 2; y++) walls.push({ ax: 2, ay: y, bx: 2, by: y + 1 });
    const anomalies: AnomalyState[] = [
      { id: 'a1', position: { x: FIXED_SCALE, y: FIXED_SCALE }, velocity: { x: 0, y: 0 } },
    ];
    const result = captureEmptyComponents(4, 2, walls, new Set(), anomalies, FIXED_SCALE);
    expect(result.newlyStabilized).toBe(4);
    expect([...result.stabilized].every((cell) => cell % 4 >= 2)).toBe(true);
  });

  it('keeps both sides live when each contains an anomaly', () => {
    const walls: Edge[] = [...boundaryEdges(4, 2)];
    for (let y = 0; y < 2; y++) walls.push({ ax: 2, ay: y, bx: 2, by: y + 1 });
    const anomalies: AnomalyState[] = [
      { id: 'a1', position: { x: FIXED_SCALE, y: FIXED_SCALE }, velocity: { x: 0, y: 0 } },
      { id: 'a2', position: { x: 3 * FIXED_SCALE, y: FIXED_SCALE }, velocity: { x: 0, y: 0 } },
    ];
    const result = captureEmptyComponents(4, 2, walls, new Set(), anomalies, FIXED_SCALE);
    expect(result.newlyStabilized).toBe(0);
  });
});


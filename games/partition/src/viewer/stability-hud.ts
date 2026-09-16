import type { PartitionState } from '../core/types';

type Bounds = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/** CSS-pixel approach margin around the actual panel, with a wider exit margin
 * to prevent jitter. Geometry works identically for live and replay states. */
export function actionNearStabilityHud(
  state: PartitionState, field: Bounds, panel: Bounds, alreadyFaded: boolean,
): boolean {
  if (field.width <= 0 || field.height <= 0) return false;
  const cell = Math.max(field.width / state.width, field.height / state.height);
  const margin = Math.max(40, cell * 2) + (alreadyFaded ? Math.max(24, cell) : 0);
  const left = panel.left - margin;
  const right = panel.right + margin;
  const top = panel.top - margin;
  const bottom = panel.bottom + margin;
  const x = (value: number) => field.left + value * field.width / state.width;
  const y = (value: number) => field.top + value * field.height / state.height;
  const inside = (px: number, py: number) => px >= left && px <= right && py >= top && py <= bottom;
  if (inside(x(state.spark.position.x), y(state.spark.position.y))) return true;
  // Engine edges are horizontal or vertical. Intersection also handles an edge
  // spanning the entire buffered rectangle without either endpoint inside it.
  return state.trace.some(edge => Math.max(x(edge.ax), x(edge.bx)) >= left
    && Math.min(x(edge.ax), x(edge.bx)) <= right
    && Math.max(y(edge.ay), y(edge.by)) >= top
    && Math.min(y(edge.ay), y(edge.by)) <= bottom);
}

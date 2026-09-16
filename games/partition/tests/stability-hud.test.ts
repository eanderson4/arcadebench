import { describe, expect, it } from 'vitest';
import type { PartitionState } from '../src/core/types';
import { actionNearStabilityHud } from '../src/viewer/stability-hud';
const bounds = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
const state = (x: number, y: number, trace: PartitionState['trace'] = []) => ({
  width: 100, height: 100, spark: { position: { x, y } }, trace,
}) as PartitionState;

describe('stability HUD avoidance', () => {
  it.each([
    { label: 'desktop', field: bounds(100, 100, 960, 640), hud: bounds(118, 620, 310, 100) },
    { label: 'compact', field: bounds(10, 80, 360, 500), hud: bounds(28, 365, 209, 100) },
  ])('fades before spark or active trace enters the actual $label panel, then restores beyond the exit buffer', ({ field, hud }) => {
    const x = (hud.right + 30 - field.left) / field.width * 100;
    const y = (hud.top + 20 - field.top) / field.height * 100;
    expect(actionNearStabilityHud(state(x, y), field, hud, false)).toBe(true);
    expect(actionNearStabilityHud(state(99, 0, [{ ax: x, ay: y, bx: x + 1, by: y }]), field, hud, false)).toBe(true);
    expect(actionNearStabilityHud(state(99, 0), field, hud, true)).toBe(false);
  });

  it('does not flicker while action crosses the approach boundary repeatedly', () => {
    const field = bounds(0, 0, 1000, 600), hud = bounds(20, 450, 300, 100);
    let faded = false;
    const values = [35.9, 36.1, 35.8, 36.2, 38.3, 38.5];
    expect(values.map(x => faded = actionNearStabilityHud(state(x, 80), field, hud, faded)))
      .toEqual([true, true, true, true, true, false]);
  });

  it('keeps the panel faded for a trace left behind after the spark moves away', () => {
    const field = bounds(0, 0, 1000, 600), hud = bounds(20, 450, 300, 100);
    const trace = [{ ax: 2, ay: 90, bx: 3, by: 90 }];
    expect(actionNearStabilityHud(state(90, 10, trace), field, hud, true)).toBe(true);
    expect(actionNearStabilityHud(state(90, 10), field, hud, true)).toBe(false);
  });

  it('is presentation-only and returns the same result for live/replay snapshots', () => {
    const current = state(33, 80, [{ ax: 30, ay: 80, bx: 31, by: 80 }]);
    const saved = structuredClone(current);
    const field = bounds(0, 0, 1000, 600), hud = bounds(20, 450, 300, 100);
    expect(actionNearStabilityHud(current, field, hud, false)).toBe(actionNearStabilityHud(saved, field, hud, false));
    expect(current).toEqual(saved);
    expect(actionNearStabilityHud(current, bounds(0, 0, 0, 0), hud, false)).toBe(false);
  });
});

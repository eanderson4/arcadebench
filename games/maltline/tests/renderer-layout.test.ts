import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { FIXED_SCALE } from '../src/core/engine';
import { normalizeMaltlineScenario } from '../src/core/scenario';
import {
  deriveMaltlineRendererLayout,
  MALTLINE_RENDERER_FRAME,
} from '../src/viewer/renderer-layout';

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

describe('Maltline renderer layout', () => {
  it('is deterministic, deeply frozen, and retains the normalized scenario authority', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const first = deriveMaltlineRendererLayout(scenario);
    const second = deriveMaltlineRendererLayout(scenario);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).not.toBe(second);
    expect(first.scenario).toBe(scenario);
    expectDeeplyFrozen(MALTLINE_RENDERER_FRAME);
    expect(MALTLINE_RENDERER_FRAME.hudOrders).toEqual({ x: 694, y: 11, width: 126, height: 24 });
    expect(MALTLINE_RENDERER_FRAME.hudLives).toEqual({ x: 828, y: 11, width: 120, height: 24 });
    expect(MALTLINE_RENDERER_FRAME.hudLives.x).toBe(
      MALTLINE_RENDERER_FRAME.hudOrders.x + MALTLINE_RENDERER_FRAME.hudOrders.width + 8,
    );
    expect(MALTLINE_RENDERER_FRAME.hudLives.x + MALTLINE_RENDERER_FRAME.hudLives.width)
      .toBe(MALTLINE_RENDERER_FRAME.canvasWidth - 12);
    expectDeeplyFrozen(first);
    expect(() => deriveMaltlineRendererLayout({ ...scenario }))
      .toThrow(/normalized frozen scenario/u);
  });

  it('maps exact lane centers and fixed-point track endpoints', () => {
    const twoLane = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[0]!);
    const threeLane = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[2]!);
    const fourLane = deriveMaltlineRendererLayout(normalizeMaltlineScenario({
      ...MALTLINE_CAMPAIGN[2]!,
      id: 'maltline-layout-four-lanes',
      lanes: 4,
    }));

    expect([twoLane.laneHeight, twoLane.laneCenterY(0), twoLane.laneCenterY(1)])
      .toEqual([145, 132.5, 277.5]);
    expect(threeLane.laneCenterY(0)).toBeCloseTo(108.333333);
    expect(threeLane.laneCenterY(1)).toBeCloseTo(205);
    expect(threeLane.laneCenterY(2)).toBeCloseTo(301.666667);
    for (const layout of [twoLane, threeLane, fourLane]) {
      expect(layout.laneBottom(layout.scenario.lanes - 1)).toBeCloseTo(350);
    }
    expect([0, 1, 2, 3].map((lane) => fourLane.laneCenterY(lane)))
      .toEqual([96.25, 168.75, 241.25, 313.75]);
    expect(threeLane.lanePx(0)).toBeCloseTo(MALTLINE_RENDERER_FRAME.counterX);
    expect(threeLane.lanePx(threeLane.scenario.laneLength * FIXED_SCALE))
      .toBeCloseTo(MALTLINE_RENDERER_FRAME.doorX);
    expect(() => threeLane.laneTop(-1)).toThrow(/lane is out of range/u);
    expect(() => threeLane.laneCenterY(3)).toThrow(/lane is out of range/u);
    expect(() => threeLane.laneBottom(0.5)).toThrow(/lane is out of range/u);
    expect(() => threeLane.lanePx(Number.NaN)).toThrow(/must be finite/u);
    expect(() => threeLane.lanePx(Number.POSITIVE_INFINITY)).toThrow(/must be finite/u);
  });

  it('projects every lane surface onto one vanishing point with shared depth scale', () => {
    const layout = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[2]!);
    const end = layout.scenario.laneLength * FIXED_SCALE;
    const vp = layout.vanishingPoint;
    for (let lane = 0; lane < layout.scenario.lanes; lane++) {
      for (const nearY of [layout.floorY(lane), layout.counterBackY(lane),
        layout.counterFrontY(lane), layout.vesselY(lane)]) {
        for (const transverse of [-12, 0, 12]) {
          const near = layout.project(0, nearY, transverse);
          const far = layout.project(end, nearY, transverse);
          // Cross-product zero proves these points and the common VP are collinear.
          const cross = (far.x - near.x) * (vp.y - near.y)
            - (far.y - near.y) * (vp.x - near.x);
          expect(cross).toBeCloseTo(0, 7);
          expect(far.scale).toBeCloseTo(MALTLINE_RENDERER_FRAME.farScale);
          expect((far.y - vp.y) / (near.y - vp.y)).toBeCloseTo(far.scale);
        }
      }
      const nearThickness = layout.counterFrontY(lane) - layout.counterBackY(lane);
      const farThickness = layout.project(end, layout.counterFrontY(lane)).y
        - layout.project(end, layout.counterBackY(lane)).y;
      expect(farThickness / nearThickness).toBeCloseTo(MALTLINE_RENDERER_FRAME.farScale);
      expect(layout.vesselY(lane)).toBeGreaterThan(layout.counterBackY(lane));
      expect(layout.vesselY(lane)).toBeLessThan(layout.counterFrontY(lane));
      expect(layout.floorY(lane)).toBeGreaterThan(layout.counterFrontY(lane));
    }
    const positions = Array.from({ length: 11 }, (_, index) => layout.project(end * index / 10, 200));
    for (let index = 1; index < positions.length; index++) {
      expect(positions[index]!.x).toBeGreaterThan(positions[index - 1]!.x);
      expect(positions[index]!.scale).toBeLessThan(positions[index - 1]!.scale);
    }
  });

  it('keeps return boundaries exact while projecting jars onto the shared serving surface', () => {
    for (const lanes of [2, 3, 4]) {
      const scenario = normalizeMaltlineScenario({
        ...MALTLINE_CAMPAIGN[2]!, id: 'maltline-projection-' + lanes, lanes,
      });
      const layout = deriveMaltlineRendererLayout(scenario);
      const threshold = scenario.laneLength * FIXED_SCALE * 0.25;
      for (let lane = 0; lane < lanes; lane++) {
        const before = layout.projectReturningJar(threshold - 1, lane);
        const at = layout.projectReturningJar(threshold, lane);
        const after = layout.projectReturningJar(threshold + 1, lane);
        expect(before.finalApproach).toBe(true);
        expect(at.finalApproach).toBe(true);
        expect(after.finalApproach).toBe(false);
        expect(after.catchCue).toBeNull();
        expect(before.catchCue).toEqual(at.catchCue);
        const surface = layout.project(threshold, layout.vesselY(lane));
        expect(at.anchorX).toBe(surface.x);
        expect(at.groundY).toBe(surface.y);
        expect(at.scale).toBe(surface.scale);
        expectDeeplyFrozen(at);
      }
      expect(layout.projectReturningJar(-FIXED_SCALE, 0).anchorX).toBeLessThan(104);
      expect(layout.projectReturningJar(101 * FIXED_SCALE, 0).anchorX).toBeGreaterThan(900);
      expect(() => layout.projectReturningJar(0, -1)).toThrow(/lane is out of range/u);
      expect(() => layout.projectReturningJar(Number.NaN, 0)).toThrow(/must be finite/u);
    }
  });

  it('derives exact one-, two-, and three-station geometry', () => {
    const one = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[0]!);
    const two = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[1]!);
    const three = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[2]!);

    expect(one.stations.map(({ centerX }) => centerX)).toEqual([502]);
    expect(two.stations.map(({ centerX }) => centerX)).toEqual([295.5, 708.5]);
    expect(three.stations.map(({ centerX }) => centerX)).toEqual([
      226.66666666666669,
      502.00000000000006,
      777.3333333333334,
    ]);
    expect(three.stations[2]).toMatchObject({
      machine: { x: 740.3333333333334, y: 382, width: 74, height: 96 },
      selectionFrame: { x: 738.3333333333334, y: 406, width: 78, height: 74 },
      selectionTab: { x: 818.3333333333334, y: 416, width: 26, height: 34 },
      processingFrame: { x: 742.3333333333334, y: 410, width: 70, height: 66 },
      processingMeter: { x: 723.3333333333334, y: 411, width: 12, height: 62 },
    });
    expect(three.jarGauge).toEqual({ x: 10, y: 478, width: 210, height: 56 });
  });
});

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
      .toEqual([92, 106, 198]);
    expect([0, 1, 2].map((lane) => threeLane.laneCenterY(lane)))
      .toEqual([106, 198, 290]);
    expect([0, 1, 2, 3].map((lane) => fourLane.laneCenterY(lane)))
      .toEqual([96.25, 168.75, 241.25, 313.75]);
    expect(threeLane.lanePx(0)).toBe(MALTLINE_RENDERER_FRAME.counterX);
    expect(threeLane.lanePx(threeLane.scenario.laneLength * FIXED_SCALE))
      .toBe(MALTLINE_RENDERER_FRAME.doorX);
    expect(() => threeLane.laneTop(-1)).toThrow(/lane is out of range/u);
    expect(() => threeLane.laneCenterY(3)).toThrow(/lane is out of range/u);
    expect(() => threeLane.laneBottom(0.5)).toThrow(/lane is out of range/u);
    expect(() => threeLane.lanePx(Number.NaN)).toThrow(/must be finite/u);
    expect(() => threeLane.lanePx(Number.POSITIVE_INFINITY)).toThrow(/must be finite/u);
  });

  it('projects returning jars at the exact final-approach boundary for every lane layout', () => {
    const twoLane = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[0]!);
    const threeLane = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[2]!);
    const fourLane = deriveMaltlineRendererLayout(normalizeMaltlineScenario({
      ...MALTLINE_CAMPAIGN[2]!,
      id: 'maltline-layout-four-lane-return',
      lanes: 4,
    }));
    const threshold = twoLane.scenario.laneLength * FIXED_SCALE * 0.25;

    expect(twoLane.returnApproachMaxFixedX).toBe(threshold);
    expect(threeLane.returnApproachMaxFixedX).toBe(threshold);
    expect(fourLane.returnApproachMaxFixedX).toBe(threshold);
    expect(twoLane.projectReturningJar(threshold - 1, 1)).toMatchObject({
      finalApproach: true,
      groundY: 224,
      catchCue: { x: 107, y: 181, width: 70, height: 19 },
    });
    expect(twoLane.projectReturningJar(threshold, 1)).toEqual({
      anchorX: 303,
      groundY: 224,
      finalApproach: true,
      catchCue: { x: 107, y: 181, width: 70, height: 19 },
    });
    expect(twoLane.projectReturningJar(threshold + 1, 1)).toMatchObject({
      finalApproach: false,
      groundY: 224,
      catchCue: null,
    });
    expect(threeLane.projectReturningJar(threshold, 2)).toEqual({
      anchorX: 303,
      groundY: 316,
      finalApproach: true,
      catchCue: { x: 107, y: 273, width: 70, height: 19 },
    });
    expect(fourLane.projectReturningJar(threshold, 3)).toEqual({
      anchorX: 303,
      groundY: 330,
      finalApproach: true,
      catchCue: { x: 107, y: 287, width: 70, height: 19 },
    });

    const frozen = threeLane.projectReturningJar(threshold, 0);
    expectDeeplyFrozen(frozen);
    expect(() => threeLane.projectReturningJar(0, -1)).toThrow(/lane is out of range/u);
    expect(() => threeLane.projectReturningJar(0, 3)).toThrow(/lane is out of range/u);
    expect(() => threeLane.projectReturningJar(Number.NaN, 0)).toThrow(/must be finite/u);
    expect(() => threeLane.projectReturningJar(Number.NEGATIVE_INFINITY, 0))
      .toThrow(/must be finite/u);

    expect(threeLane.projectReturningJar(-FIXED_SCALE, 0)).toMatchObject({
      anchorX: 96.04,
      finalApproach: true,
    });
    expect(threeLane.projectReturningJar(101 * FIXED_SCALE, 0)).toMatchObject({
      anchorX: 907.96,
      finalApproach: false,
      catchCue: null,
    });
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

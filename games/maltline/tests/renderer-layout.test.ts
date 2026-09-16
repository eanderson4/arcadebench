import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { FIXED_SCALE, MaltlineEngine } from '../src/core/engine';
import { normalizeMaltlineScenario } from '../src/core/scenario';
import {
  deriveMaltlineRendererLayout,
  MALTLINE_RENDERER_FRAME,
  MALTLINE_RENDERER_MAX_LANES,
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

  it('projects room depth toward one vanishing point while play stays horizontal within each row', () => {
    for (const lanes of [1, 2, 3, 4]) {
      const layout = deriveMaltlineRendererLayout(normalizeMaltlineScenario({ ...MALTLINE_CAMPAIGN[2]!, lanes }));
      const end = layout.scenario.laneLength * FIXED_SCALE;
      for (let lane = 0; lane < lanes; lane++) {
        const y = layout.counterFrontY(lane);
        const points = [0, .25, .5, 1].map(progress => layout.project(end * progress, y));
        for (let index = 1; index < points.length; index++) {
          expect(points[index]!.x).toBeGreaterThan(points[index - 1]!.x);
          expect(points[index]!.y).toBe(y);
          expect(points[index]!.scale).toBe(points[0]!.scale);
        }
        expect(points[0]!.x).toBeGreaterThan(0);
        expect(points.at(-1)!.x).toBeLessThan(MALTLINE_RENDERER_FRAME.canvasWidth);
        expect(layout.vesselY(lane)).toBeGreaterThan(layout.counterBackY(lane));
        expect(layout.vesselY(lane)).toBeLessThan(y);
        if (lane > 0) expect(points[0]!.scale).toBeGreaterThan(layout.project(0, layout.counterFrontY(lane - 1)).scale);
      }
      const vp = layout.vanishingPoint;
      for (const anchor of [18, 108, 215, 940]) {
        const a = layout.roomPoint(anchor, 118), b = layout.roomPoint(anchor, 454);
        expect((a.x - vp.x) * (b.y - vp.y) - (b.x - vp.x) * (a.y - vp.y)).toBeCloseTo(0, 7);
      }
      expect(() => layout.counter(-1)).toThrow(/lane is out of range/u);
      expect(() => layout.counter(lanes)).toThrow(/lane is out of range/u);
      expect(() => layout.project(Number.NaN, 200)).toThrow(/finite/i);
    }
  });

  it('admits the room\'s supported lanes without narrowing engine scenario authority', () => {
    expect(MALTLINE_RENDERER_MAX_LANES).toBe(4);
    for (let lanes = 1; lanes <= MALTLINE_RENDERER_MAX_LANES; lanes++) {
      const scenario = normalizeMaltlineScenario({ ...MALTLINE_CAMPAIGN[2]!, lanes });
      expect(deriveMaltlineRendererLayout(scenario).scenario).toBe(scenario);
    }
    for (const lanes of [5, 64]) {
      const scenario = normalizeMaltlineScenario({ ...MALTLINE_CAMPAIGN[2]!, lanes });
      expect(new MaltlineEngine(scenario).scenario.lanes).toBe(lanes);
      expect(() => deriveMaltlineRendererLayout(scenario))
        .toThrow(/room renderer supports 1–4 lanes/u);
    }
  });

  it('gives every counter a perspective top and vertical support down to the ground', () => {
    for (const scenario of MALTLINE_CAMPAIGN) {
      const layout = deriveMaltlineRendererLayout(scenario);
      for (let lane = 0; lane < scenario.lanes; lane++) {
        const counter = layout.counter(lane);
        expectDeeplyFrozen(counter);
        const [lb, rb, rf, lf] = counter.top;
        expect(lb.y).toBe(rb.y); expect(lf.y).toBe(rf.y);
        expect(lb.y).toBeLessThan(lf.y);
        expect(lb.x).toBeGreaterThan(lf.x); expect(rb.x).toBeLessThan(rf.x);
        expect(counter.leftEnd[2]!.x).toBe(lf.x);
        expect(counter.leftEnd[3]!.x).toBe(lb.x);
        expect(counter.apron[2]!.x).toBe(rf.x); expect(counter.apron[3]!.x).toBe(lf.x);
        expect(counter.groundY).toBeGreaterThan(counter.apronBottom);
        expect(counter.groundY).toBeLessThan(MALTLINE_RENDERER_FRAME.canvasHeight);
        for (const { body, foot } of counter.supports) {
          expect(body.y).toBe(counter.apronBottom);
          expect(body.y + body.height).toBeCloseTo(counter.groundY);
          expect(foot.y + foot.height).toBeCloseTo(counter.groundY);
          expect(body.x + body.width / 2).toBeCloseTo(foot.x + foot.width / 2);
        }
      }
    }
  });

  it('keeps return eligibility in engine coordinates and cues on their own row', () => {
    for (const lanes of [1, 2, 3, 4]) {
      const scenario = normalizeMaltlineScenario({ ...MALTLINE_CAMPAIGN[2]!, lanes });
      const layout = deriveMaltlineRendererLayout(scenario);
      const end = scenario.laneLength * FIXED_SCALE, threshold = end * .25;
      for (let lane = 0; lane < lanes; lane++) {
        const before = layout.projectReturningJar(threshold - 1, lane);
        const at = layout.projectReturningJar(threshold, lane);
        const after = layout.projectReturningJar(threshold + 1, lane);
        expect(before.finalApproach).toBe(true); expect(at.finalApproach).toBe(true);
        expect(after.finalApproach).toBe(false); expect(after.catchCue).toBeNull();
        expect(before.catchCue).toEqual(at.catchCue);
        const surface = layout.project(threshold, layout.vesselY(lane));
        expect(at).toMatchObject({ anchorX: surface.x, groundY: surface.y, scale: surface.scale });
        expectDeeplyFrozen(at);
        expect(layout.projectReturningJar(-FIXED_SCALE, lane).anchorX)
          .toBeLessThan(layout.projectReturningJar(0, lane).anchorX);
        expect(layout.projectReturningJar(end + FIXED_SCALE, lane).anchorX)
          .toBeGreaterThan(layout.projectReturningJar(end, lane).anchorX);
      }
    }
  });

  it('docks exactly the selected pitcher and keeps parked pitchers and animation inside the scene', () => {
    for (const lanes of [1, 2, 3, 4]) for (const count of [1, 2, 3]) {
      const scenario = normalizeMaltlineScenario({ ...MALTLINE_CAMPAIGN[2]!, lanes,
        stations: ['vanilla', 'chocolate', 'strawberry'].slice(0, count) as ('vanilla'|'chocolate'|'strawberry')[] });
      const layout = deriveMaltlineRendererLayout(scenario);
      for (let lane = 0; lane < lanes; lane++) for (let station = 0; station < count; station++) {
        const bank = layout.workstation(lane, station);
        expectDeeplyFrozen(bank);
        expect(bank.pitchers.filter(p => p.dock === 1).map(p => p.stationIndex)).toEqual([station]);
        expect(bank.motor.bounds.x + bank.motor.bounds.width).toBeLessThan(layout.project(0, layout.counterFrontY(lane)).x);
        for (const turn of [station, station + .1, station + .5, station + .9]) {
          const moving = layout.workstation(lane, turn);
          expect(moving.pitchers).toHaveLength(count);
          for (const { bounds } of moving.pitchers) {
            expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThan(MALTLINE_RENDERER_FRAME.hudHeight);
            expect(bounds.x + bounds.width).toBeLessThan(960); expect(bounds.y + bounds.height).toBeLessThan(540);
          }
        }
        expect(layout.workstation(lane, station + count)).toEqual(bank);
        expect(layout.workstation(lane, station - count)).toEqual(bank);
      }
      expect(() => layout.workstation(0, Infinity)).toThrow(/finite/i);
      expect(() => layout.workstation(0, NaN)).toThrow(/finite/i);
    }
  });

  it('bounds physical clean-rack seats independently of a large custom jar pool', () => {
    for (const jarPoolSize of [1, 2, 4, 6, 999]) {
      const layout = deriveMaltlineRendererLayout(normalizeMaltlineScenario({ ...MALTLINE_CAMPAIGN[0]!, jarPoolSize }));
      const rack = layout.cleanRack;
      expectDeeplyFrozen(rack); expect(rack.slots).toHaveLength(Math.min(6, jarPoolSize));
      expect(rack.capacity).toBe(rack.slots.length);
      for (const { bounds } of rack.slots) {
        expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThan(layout.laneBottom(1));
        expect(bounds.x + bounds.width).toBeLessThan(960); expect(bounds.y + bounds.height).toBeLessThan(540);
      }
    }
  });
});

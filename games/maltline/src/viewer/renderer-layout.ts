import { FIXED_SCALE } from '../core/engine';
import type { NormalizedMaltlineScenario } from '../core/scenario';

export interface MaltlineCanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MaltlineStationLayout {
  readonly centerX: number;
  readonly machine: MaltlineCanvasRect;
  readonly selectionFrame: MaltlineCanvasRect;
  readonly selectionTab: MaltlineCanvasRect;
  readonly processingFrame: MaltlineCanvasRect;
  readonly processingMeter: MaltlineCanvasRect;
}

export interface MaltlineReturningJarProjection {
  readonly anchorX: number;
  readonly groundY: number;
  readonly finalApproach: boolean;
  readonly catchCue: MaltlineCanvasRect | null;
}

export const MALTLINE_RENDERER_FRAME = Object.freeze({
  canvasWidth: 960,
  canvasHeight: 540,
  hudHeight: 46,
  awningHeight: 16,
  lanesTop: 60,
  lanesBottom: 350,
  maximumLaneHeight: 92,
  counterX: 104,
  doorX: 900,
  bankTop: 372,
  machineBaseline: 478,
  stationGap: 30,
  hudOrders: Object.freeze({ x: 694, y: 11, width: 126, height: 24 }),
  hudLives: Object.freeze({ x: 828, y: 11, width: 120, height: 24 }),
  actionStatus: Object.freeze({ x: 112, y: 353, width: 276, height: 30 }),
  actionBadge: Object.freeze({ x: 120, y: 358, width: 20, height: 20 }),
} as const);

export interface MaltlineRendererLayout {
  readonly scenario: NormalizedMaltlineScenario;
  readonly laneHeight: number;
  readonly stationWidth: number;
  readonly stations: readonly MaltlineStationLayout[];
  readonly jarGauge: MaltlineCanvasRect;
  readonly returnApproachMaxFixedX: number;
  laneTop(lane: number): number;
  laneBottom(lane: number): number;
  laneCenterY(lane: number): number;
  lanePx(fixedPointX: number): number;
  projectReturningJar(fixedPointX: number, lane: number): MaltlineReturningJarProjection;
}

function rect(x: number, y: number, width: number, height: number): MaltlineCanvasRect {
  return Object.freeze({ x, y, width, height });
}

/**
 * Derives every scenario-sensitive renderer coordinate from one normalized,
 * frozen scenario. The returned value is presentation-only and deeply frozen.
 */
export function deriveMaltlineRendererLayout(
  scenario: NormalizedMaltlineScenario,
): MaltlineRendererLayout {
  if (!Object.isFrozen(scenario) || !Object.isFrozen(scenario.stations)) {
    throw new Error('Maltline renderer layout requires a normalized frozen scenario.');
  }
  const frame = MALTLINE_RENDERER_FRAME;
  const laneHeight = Math.min(
    frame.maximumLaneHeight,
    (frame.lanesBottom - frame.lanesTop) / scenario.lanes,
  );
  const stationWidth = (
    frame.doorX - frame.counterX - frame.stationGap * (scenario.stations.length - 1)
  ) / scenario.stations.length;
  const stations = Object.freeze(scenario.stations.map((_flavor, index) => {
    const centerX = frame.counterX
      + index * (stationWidth + frame.stationGap)
      + stationWidth / 2;
    const machine = rect(centerX - 37, frame.machineBaseline - 96, 74, 96);
    return Object.freeze({
      centerX,
      machine,
      selectionFrame: rect(machine.x - 2, machine.y + 24, 78, 74),
      selectionTab: rect(machine.x + 78, machine.y + 34, 26, 34),
      processingFrame: rect(machine.x + 2, machine.y + 28, 70, 66),
      processingMeter: rect(machine.x - 17, machine.y + 29, 12, 62),
    });
  }));
  const checkedLane = (lane: number): number => {
    if (!Number.isSafeInteger(lane) || lane < 0 || lane >= scenario.lanes) {
      throw new Error('Maltline renderer layout lane is out of range.');
    }
    return lane;
  };
  const laneTop = (lane: number): number => frame.lanesTop + checkedLane(lane) * laneHeight;
  const laneBottom = (lane: number): number => laneTop(lane) + laneHeight;
  const lanePx = (fixedPointX: number): number => {
    if (!Number.isFinite(fixedPointX)) {
      throw new Error('Maltline renderer layout fixed-point x must be finite.');
    }
    return frame.counterX
      + (fixedPointX / (scenario.laneLength * FIXED_SCALE))
        * (frame.doorX - frame.counterX);
  };
  const returnApproachMaxFixedX = scenario.laneLength * FIXED_SCALE * 0.25;

  return Object.freeze({
    scenario,
    laneHeight,
    stationWidth,
    stations,
    jarGauge: rect(
      10,
      frame.canvasHeight - 62,
      Math.max(210, scenario.jarPoolSize * 21 + 22),
      56,
    ),
    returnApproachMaxFixedX,
    laneTop,
    laneBottom,
    laneCenterY: (lane: number): number => laneTop(lane) + laneHeight / 2,
    lanePx,
    projectReturningJar: (fixedPointX: number, lane: number): MaltlineReturningJarProjection => {
      const anchorX = lanePx(fixedPointX);
      const groundY = laneBottom(lane) - 20;
      const finalApproach = fixedPointX <= returnApproachMaxFixedX;
      return Object.freeze({
        anchorX,
        groundY,
        finalApproach,
        catchCue: finalApproach
          ? rect(frame.counterX + 3, groundY - 43, 70, 19)
          : null,
      });
    },
  });
}

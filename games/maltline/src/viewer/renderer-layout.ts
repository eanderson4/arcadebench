import { FIXED_SCALE } from '../core/engine';
import type { NormalizedMaltlineScenario } from '../core/scenario';

export interface MaltlineCanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MaltlineCounterGeometry {
  readonly top: readonly [
    MaltlineProjectedPoint,
    MaltlineProjectedPoint,
    MaltlineProjectedPoint,
    MaltlineProjectedPoint,
  ];
  readonly apron: readonly MaltlineCanvasPoint[];
  readonly leftEnd: readonly MaltlineCanvasPoint[];
  readonly supports: readonly Readonly<{
    body: MaltlineCanvasRect;
    foot: MaltlineCanvasRect;
  }>[];
  readonly groundY: number;
  readonly apronBottom: number;
  readonly scale: number;
}
export interface MaltlineCanvasPoint {
  readonly x: number;
  readonly y: number;
}
export interface MaltlineWorkstationGeometry {
  readonly motor: Readonly<{
    anchor: MaltlineProjectedPoint;
    bounds: MaltlineCanvasRect;
  }>;
  readonly slots: readonly MaltlineProjectedPoint[];
  readonly pitchers: readonly Readonly<{
    stationIndex: number;
    anchor: MaltlineProjectedPoint;
    scale: number;
    bounds: MaltlineCanvasRect;
    dock: number;
  }>[];
  readonly status: Readonly<{
    bounds: MaltlineCanvasRect;
    tether: readonly MaltlineCanvasPoint[];
  }>;
}
export interface MaltlineCleanRackGeometry {
  readonly capacity: number;
  readonly outline: readonly MaltlineProjectedPoint[];
  readonly bounds: MaltlineCanvasRect;
  readonly slots: readonly Readonly<{
    center: MaltlineProjectedPoint;
    scale: number;
    bounds: MaltlineCanvasRect;
  }>[];
  readonly overflowAnchor: MaltlineCanvasPoint;
}

export interface MaltlineReturningJarProjection {
  readonly anchorX: number;
  readonly groundY: number;
  readonly finalApproach: boolean;
  readonly catchCue: MaltlineCanvasRect | null;
  readonly scale: number;
}

export interface MaltlineProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MALTLINE_RENDERER_FRAME = Object.freeze({
  canvasWidth: 960,
  canvasHeight: 540,
  hudHeight: 46,
  lanesTop: 60,
  lanesBottom: 454,
  maximumLaneHeight: 197,
  hudOrders: Object.freeze({ x: 694, y: 11, width: 126, height: 24 }),
  hudLives: Object.freeze({ x: 828, y: 11, width: 120, height: 24 }),
} as const);

/** The authored room keeps actors, counters, and workstations legible at up to four lanes. */
export const MALTLINE_RENDERER_MAX_LANES = 4;

export interface MaltlineRendererLayout {
  readonly scenario: NormalizedMaltlineScenario;
  readonly laneHeight: number;
  readonly cleanRack: MaltlineCleanRackGeometry;
  readonly worktop: readonly [
    MaltlineProjectedPoint,
    MaltlineProjectedPoint,
    MaltlineProjectedPoint,
    MaltlineProjectedPoint,
  ];
  roomPoint(anchor: number, y: number): MaltlineProjectedPoint;
  roomScale(y: number): number;
  workPoint(fraction: number, y: number): MaltlineProjectedPoint;
  counter(lane: number): MaltlineCounterGeometry;
  workstation(
    lane: number,
    presentationTurn: number,
  ): MaltlineWorkstationGeometry;
  readonly returnApproachMaxFixedX: number;
  readonly vanishingPoint: Readonly<{ x: number; y: number }>;
  readonly actorScale: number;
  project(
    fixedPointX: number,
    nearY: number,
    transverseX?: number,
  ): MaltlineProjectedPoint;
  floorY(lane: number): number;
  counterBackY(lane: number): number;
  counterFrontY(lane: number): number;
  vesselY(lane: number): number;
  laneTop(lane: number): number;
  laneBottom(lane: number): number;
  laneCenterY(lane: number): number;
  lanePx(fixedPointX: number): number;
  projectReturningJar(
    fixedPointX: number,
    lane: number,
  ): MaltlineReturningJarProjection;
}

function freezeGeometry<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeGeometry(child);
    Object.freeze(value);
  }
  return value;
}
function finite(...values: number[]): void {
  if (!values.every(Number.isFinite))
    throw new Error('Maltline layout coordinates must be finite.');
}
function bounds(points: readonly MaltlineCanvasPoint[]): MaltlineCanvasRect {
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y);
  return rect(
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
): MaltlineCanvasRect {
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
    throw new Error(
      'Maltline renderer layout requires a normalized frozen scenario.',
    );
  }
  if (scenario.lanes > MALTLINE_RENDERER_MAX_LANES) {
    throw new Error(
      `Maltline room renderer supports 1–${MALTLINE_RENDERER_MAX_LANES} lanes.`,
    );
  }
  const frame = MALTLINE_RENDERER_FRAME;
  const laneHeight = Math.min(
    frame.maximumLaneHeight,
    (frame.lanesBottom - frame.lanesTop) / scenario.lanes,
  );
  const checkedLane = (lane: number): number => {
    if (!Number.isSafeInteger(lane) || lane < 0 || lane >= scenario.lanes) {
      throw new Error('Maltline renderer layout lane is out of range.');
    }
    return lane;
  };
  const laneTop = (lane: number): number =>
    frame.lanesTop + checkedLane(lane) * laneHeight;
  const laneBottom = (lane: number): number => laneTop(lane) + laneHeight;
  // One shared room vanishing point; horizontal game progress stays within
  // its row and does not independently change the customer's apparent depth.
  const vanishingPoint = Object.freeze({ x: 480, y: -300 });
  const actorScale = 1.2;
  const rowScale = (y: number): number => {
    finite(y);
    if (y <= -300 || y > 1_000_000)
      throw new Error('Maltline room depth is out of range.');
    return 0.72 + (0.28 * (y - 76)) / 378;
  };
  const ray = (anchor: number, y: number): number => {
    finite(anchor, y);
    if (Math.abs(anchor) > 1_000_000)
      throw new Error('Maltline room anchor is out of range.');
    return 480 + ((anchor - 480) * (y + 300)) / 754;
  };
  const roomPoint = (anchor: number, y: number): MaltlineProjectedPoint =>
    Object.freeze({ x: ray(anchor, y), y, scale: rowScale(y) });
  const workPoint = (fraction: number, y: number): MaltlineProjectedPoint => {
    finite(fraction);
    if (fraction < 0 || fraction > 1)
      throw new Error('Maltline worktop fraction is out of range.');
    return roomPoint(18 + 90 * fraction, y);
  };
  const counterFrontY = (lane: number): number => laneBottom(lane) - 27;
  const counterBackY = (lane: number): number =>
    counterFrontY(lane) - 15 * rowScale(counterFrontY(lane));
  const floorY = (lane: number): number =>
    counterFrontY(lane) + 16 * rowScale(counterFrontY(lane));
  const vesselY = (lane: number): number =>
    counterFrontY(lane) - 4 * rowScale(counterFrontY(lane));
  const project = (
    fixedPointX: number,
    nearY: number,
    transverseX = 0,
  ): MaltlineProjectedPoint => {
    if (![fixedPointX, nearY, transverseX].every(Number.isFinite))
      throw new Error('Finite room coordinates required');
    const progress = fixedPointX / (scenario.laneLength * FIXED_SCALE);
    return Object.freeze({
      x: ray(215 + 725 * progress + transverseX, nearY),
      y: nearY,
      scale: rowScale(nearY),
    });
  };
  const lanePx = (fixedPointX: number): number =>
    project(fixedPointX, counterFrontY(0)).x;
  const returnApproachMaxFixedX = scenario.laneLength * FIXED_SCALE * 0.25;

  const capacity = Math.min(6, scenario.jarPoolSize);
  const rackOutline = [
    workPoint(0.22, 462),
    workPoint(0.7, 462),
    workPoint(0.7, 531),
    workPoint(0.22, 531),
  ];
  const cleanRack: MaltlineCleanRackGeometry = freezeGeometry({
    capacity,
    outline: rackOutline,
    bounds: bounds(rackOutline),
    slots: Array.from({ length: capacity }, (_, index) => {
      const contact = workPoint(
          index % 2 === 0 ? 0.36 : 0.58,
          468 +
            Math.floor(index / 2) * Math.min(21, 58 / Math.ceil(capacity / 2)),
        ),
        scale = 0.68 * contact.scale;
      const center = { ...contact, y: contact.y - 2 * scale };
      return {
        center,
        scale,
        bounds: rect(
          center.x - 10.5 * scale,
          center.y - 16 * scale,
          21 * scale,
          31 * scale,
        ),
      };
    }),
    overflowAnchor: workPoint(0.56, 529),
  });
  const counter = (lane: number): MaltlineCounterGeometry => {
    const back = counterBackY(lane),
      front = counterFrontY(lane),
      scale = rowScale(front),
      end = scenario.laneLength * FIXED_SCALE;
    const lb = project(0, back),
      rb = project(end, back),
      lf = project(0, front),
      rf = project(end, front);
    const apronBottom = front + 9 * scale,
      groundY = front + 38 * scale;
    const lg = { x: lf.x, y: groundY },
      lbg = {
        x: lb.x,
        y: -300 + ((groundY + 300) * (lb.x - 480)) / (lf.x - 480),
      };
    return freezeGeometry({
      top: [lb, rb, rf, lf],
      apron: [lf, rf, { x: rf.x, y: apronBottom }, { x: lf.x, y: apronBottom }],
      leftEnd: [lb, lf, lg, lbg],
      apronBottom,
      groundY,
      scale,
      supports: [0.12, 0.5, 0.88].map((u) => {
        const x = lf.x + (rf.x - lf.x) * u;
        return {
          body: rect(
            x - 3 * scale,
            apronBottom,
            6 * scale,
            groundY - apronBottom,
          ),
          foot: rect(x - 4 * scale, groundY - 2 * scale, 8 * scale, 2 * scale),
        };
      }),
    });
  };
  const workstation = (
    lane: number,
    presentationTurn: number,
  ): MaltlineWorkstationGeometry => {
    checkedLane(lane);
    finite(presentationTurn);
    if (Math.abs(presentationTurn) > 1_000_000)
      throw new Error('Maltline station turn is out of range.');
    const count = scenario.stations.length,
      workY = counterFrontY(lane) - 12,
      step = 72;
    let activeSlot = Math.floor(count / 2);
    for (const candidate of Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => Math.abs(a - activeSlot) - Math.abs(b - activeSlot),
    )) {
      if (
        workY - candidate * step >= 105 &&
        workY + (count - candidate - 1) * step <= 438
      ) {
        activeSlot = candidate;
        break;
      }
    }
    const ys = Array.from(
      { length: count },
      (_, i) => workY + (i - activeSlot) * step,
    );
    const modulo = (value: number) => ((value % count) + count) % count;
    const turn = modulo(presentationTurn),
      whole = Math.floor(turn),
      progress = turn - whole;
    const previous = modulo(whole),
      next = modulo(whole + 1),
      motor = workPoint(0.84, workY);
    const pitchers = scenario.stations
      .map((_flavor, index) => {
        const oldSlot = modulo(index - previous + activeSlot),
          nextSlot = modulo(index - next + activeSlot);
        let fraction = 0.55,
          y = ys[oldSlot]!,
          dock = 0;
        if (count === 1) {
          fraction = 0.84;
          dock = 1;
        } else if (progress < 0.22) {
          if (index === previous) {
            dock = 1 - progress / 0.22;
            fraction = 0.55 + 0.29 * dock;
          }
        } else if (progress < 0.78) {
          const t = (progress - 0.22) / 0.56;
          if (oldSlot === 0 && nextSlot === count - 1) {
            if (t < 0.18) fraction = 0.55 - (0.38 * t) / 0.18;
            else if (t < 0.82) {
              fraction = 0.17;
              y =
                ys[oldSlot]! +
                ((ys[nextSlot]! - ys[oldSlot]!) * (t - 0.18)) / 0.64;
            } else {
              fraction = 0.17 + (0.38 * (t - 0.82)) / 0.18;
              y = ys[nextSlot]!;
            }
          } else y = ys[oldSlot]! + (ys[nextSlot]! - ys[oldSlot]!) * t;
        } else {
          y = ys[nextSlot]!;
          if (index === next) {
            dock = (progress - 0.78) / 0.22;
            fraction = 0.55 + 0.29 * dock;
          }
        }
        const point = workPoint(fraction, y),
          anchor = { ...point, y: point.y - 15 * dock * point.scale };
        return {
          stationIndex: index,
          anchor,
          scale: point.scale,
          dock,
          bounds: rect(
            anchor.x - 18 * point.scale,
            anchor.y - 41 * point.scale,
            48 * point.scale,
            46 * point.scale,
          ),
        };
      })
      .sort((a, b) => a.anchor.y - b.anchor.y);
    const statusY = motor.y + 7,
      right = motor.x + 22 * motor.scale,
      statusX = Math.max(statusY < 345 ? 104 : 3, right - 126);
    return freezeGeometry({
      motor: {
        anchor: motor,
        bounds: rect(
          motor.x - 22 * motor.scale,
          motor.y - 20 * motor.scale,
          44 * motor.scale,
          25 * motor.scale,
        ),
      },
      slots: ys.map((y) => workPoint(0.55, y)),
      pitchers,
      status: {
        bounds: rect(statusX, statusY, right - statusX, 24),
        tether: [
          { x: motor.x, y: motor.y + 2 },
          { x: motor.x, y: statusY + 2 },
        ],
      },
    });
  };
  return Object.freeze({
    scenario,
    laneHeight,
    returnApproachMaxFixedX,
    vanishingPoint,
    actorScale,
    project,
    roomPoint,
    roomScale: rowScale,
    workPoint,
    counter,
    workstation,
    cleanRack,
    worktop: Object.freeze([
      workPoint(0, 118),
      workPoint(1, 118),
      workPoint(1, 540),
      workPoint(0, 540),
    ] as const),
    floorY,
    counterBackY,
    counterFrontY,
    vesselY,
    laneTop,
    laneBottom,
    laneCenterY: (lane: number): number => laneTop(lane) + laneHeight / 2,
    lanePx,
    projectReturningJar: (
      fixedPointX: number,
      lane: number,
    ): MaltlineReturningJarProjection => {
      const point = project(fixedPointX, vesselY(lane));
      const anchorX = point.x;
      const groundY = point.y;
      const finalApproach = fixedPointX <= returnApproachMaxFixedX;
      return Object.freeze({
        anchorX,
        groundY,
        scale: point.scale,
        finalApproach,
        catchCue: finalApproach
          ? rect(
              ray(215, counterFrontY(lane)) + 3,
              counterBackY(lane) - 23,
              64,
              18,
            )
          : null,
      });
    },
  });
}

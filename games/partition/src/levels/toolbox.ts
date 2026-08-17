import { edgeKey } from '../core/edges';
import { mulberry32 } from '../core/rng';
import type { AnomalyKind, Edge, PartitionScenario, Point } from '../core/types';
import type {
  BoardMask,
  CampaignValidationResult,
  LevelValidationResult,
  PartitionCampaignLevel,
  PartitionDifficultyId,
  PartitionLevelMetadata,
  PartitionLevelScenario,
} from './types';

const LEVEL_ID_PATTERN = /^partition-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AnomalySpawnOptions {
  seed: number;
  count: number;
  width: number;
  height: number;
  blockedCells?: readonly number[];
  speed: readonly [minimum: number, maximum: number];
  idPrefix?: string;
  kinds?: readonly AnomalyKind[];
}

export interface DefineLevelOptions {
  number: number;
  slug: string;
  title: string;
  tier: PartitionDifficultyId;
  tagline: string;
  challenge: string;
  features: string[];
  parTicks: number;
  board: BoardMask;
  seed: number;
  anomalyCount: number;
  filamentCount?: number;
  anomalySpeed: readonly [number, number];
  targetFraction: number;
  integrity: number;
  sparkMoveEveryTicks: number;
  timeLimitTicks: number;
  sparkStart?: Point;
  initialWalls?: readonly Edge[];
  ticksPerSecond?: number;
}

/**
 * Turns a small, readable ASCII silhouette into a board mask. `#` is blocked,
 * while `.`, spaces, and any future marker character are playable. Scaling is
 * useful for keeping level source compact without producing tiny arenas.
 */
export function asciiMask(rows: readonly string[], scale = 1): BoardMask {
  if (rows.length === 0) throw new Error('An ASCII board needs at least one row.');
  if (!Number.isInteger(scale) || scale < 1) throw new Error('ASCII board scale must be a positive integer.');
  const sourceWidth = rows[0]?.length ?? 0;
  if (sourceWidth === 0) throw new Error('ASCII board rows cannot be empty.');
  if (rows.some((row) => row.length !== sourceWidth)) {
    throw new Error('Every ASCII board row must have the same width.');
  }

  const width = sourceWidth * scale;
  const height = rows.length * scale;
  const blockedCells: number[] = [];
  for (let sourceY = 0; sourceY < rows.length; sourceY++) {
    for (let sourceX = 0; sourceX < sourceWidth; sourceX++) {
      if (rows[sourceY]?.[sourceX] !== '#') continue;
      for (let offsetY = 0; offsetY < scale; offsetY++) {
        for (let offsetX = 0; offsetX < scale; offsetX++) {
          const x = sourceX * scale + offsetX;
          const y = sourceY * scale + offsetY;
          blockedCells.push(y * width + x);
        }
      }
    }
  }
  return { width, height, blockedCells };
}

/** Expands an axis-aligned segment into the unit edges used by the engine. */
export function wallLine(from: Point, to: Point): Edge[] {
  if (![from.x, from.y, to.x, to.y].every(Number.isInteger)) {
    throw new Error('Wall endpoints must use integer grid coordinates.');
  }
  if (from.x !== to.x && from.y !== to.y) throw new Error('Walls must be axis-aligned.');
  const edges: Edge[] = [];
  if (from.x === to.x) {
    const minimum = Math.min(from.y, to.y);
    const maximum = Math.max(from.y, to.y);
    for (let y = minimum; y < maximum; y++) {
      edges.push({ ax: from.x, ay: y, bx: from.x, by: y + 1 });
    }
  } else {
    const minimum = Math.min(from.x, to.x);
    const maximum = Math.max(from.x, to.x);
    for (let x = minimum; x < maximum; x++) {
      edges.push({ ax: x, ay: from.y, bx: x + 1, by: from.y });
    }
  }
  return edges;
}

export function uniqueWalls(...groups: ReadonlyArray<readonly Edge[]>): Edge[] {
  const walls = new Map<string, Edge>();
  for (const edge of groups.flat()) walls.set(edgeKey(edge), { ...edge });
  return [...walls.values()].sort((left, right) => {
    const leftKey = edgeKey(left);
    const rightKey = edgeKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/** Generates the permanent frontier that separates blocked cells from play. */
export function wallsAroundMask(mask: BoardMask): Edge[] {
  const blocked = new Set(mask.blockedCells);
  const walls: Edge[] = [];
  const isBlocked = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < mask.width && y < mask.height && blocked.has(y * mask.width + x);

  for (const index of blocked) {
    const x = index % mask.width;
    const y = Math.floor(index / mask.width);
    if (y > 0 && !isBlocked(x, y - 1)) walls.push({ ax: x, ay: y, bx: x + 1, by: y });
    if (x < mask.width - 1 && !isBlocked(x + 1, y)) {
      walls.push({ ax: x + 1, ay: y, bx: x + 1, by: y + 1 });
    }
    if (y < mask.height - 1 && !isBlocked(x, y + 1)) {
      walls.push({ ax: x, ay: y + 1, bx: x + 1, by: y + 1 });
    }
    if (x > 0 && !isBlocked(x - 1, y)) walls.push({ ax: x, ay: y, bx: x, by: y + 1 });
  }
  return uniqueWalls(walls);
}

function playableCells(width: number, height: number, blockedCells: readonly number[]): number[] {
  const blocked = new Set(blockedCells);
  return Array.from({ length: width * height }, (_, index) => index).filter((index) => !blocked.has(index));
}

/**
 * Produces stable, well-spread anomaly starts. Positions are jittered within
 * distinct playable cells and velocities avoid nearly axis-aligned trajectories.
 */
export function spawnDeterministicAnomalies(options: AnomalySpawnOptions): PartitionScenario['anomalies'] {
  const { width, height, count } = options;
  const [minimumSpeed, maximumSpeed] = options.speed;
  if (!Number.isInteger(count) || count < 1) throw new Error('Anomaly count must be a positive integer.');
  if (![minimumSpeed, maximumSpeed].every(Number.isFinite) || !(minimumSpeed > 0) || maximumSpeed < minimumSpeed) {
    throw new Error('Anomaly speed range is invalid.');
  }
  const candidates = playableCells(width, height, options.blockedCells ?? []);
  if (candidates.length < count) throw new Error('Not enough playable cells for the requested anomalies.');

  const rng = mulberry32(options.seed);
  const chosen: number[] = [];
  const available = [...candidates];
  const firstIndex = Math.floor(rng() * available.length);
  chosen.push(available.splice(firstIndex, 1)[0]!);

  // Farthest-point sampling prevents a seeded swarm from accidentally stacking.
  while (chosen.length < count) {
    let bestOffset = 0;
    let bestDistance = -1;
    const tieBreak = rng();
    for (let offset = 0; offset < available.length; offset++) {
      const index = available[offset]!;
      const x = index % width;
      const y = Math.floor(index / width);
      const nearest = Math.min(
        ...chosen.map((other) => {
          const otherX = other % width;
          const otherY = Math.floor(other / width);
          return (x - otherX) ** 2 + (y - otherY) ** 2;
        }),
      );
      const biasedDistance = nearest + ((offset + tieBreak) % available.length) * 1e-9;
      if (biasedDistance > bestDistance) {
        bestDistance = biasedDistance;
        bestOffset = offset;
      }
    }
    chosen.push(available.splice(bestOffset, 1)[0]!);
  }

  return chosen.map((index, anomalyIndex) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const position: [number, number] = [x + 0.24 + rng() * 0.52, y + 0.24 + rng() * 0.52];
    const speed = minimumSpeed + rng() * (maximumSpeed - minimumSpeed);
    // Keeping the angle away from axes makes temporal prediction more interesting.
    const quadrant = Math.floor(rng() * 4);
    const acuteAngle = Math.PI * (0.12 + rng() * 0.26);
    const angle = quadrant * (Math.PI / 2) + acuteAngle;
    const velocity: [number, number] = [Math.cos(angle) * speed, Math.sin(angle) * speed];
    const kind = options.kinds?.[anomalyIndex] ?? 'drifter';
    return {
      id: `${options.idPrefix ?? 'a'}${anomalyIndex + 1}`,
      position,
      velocity,
      kind,
      ...(kind === 'filament' ? { length: 5.5 } : {}),
    };
  });
}

function pointOnWall(point: Point, walls: readonly Edge[]): boolean {
  return walls.some((wall) =>
    (wall.ax === wall.bx && point.x === wall.ax && point.y >= Math.min(wall.ay, wall.by) && point.y <= Math.max(wall.ay, wall.by))
    || (wall.ay === wall.by && point.y === wall.ay && point.x >= Math.min(wall.ax, wall.bx) && point.x <= Math.max(wall.ax, wall.bx)),
  );
}

export function playableCellCount(scenario: Pick<PartitionLevelScenario, 'width' | 'height' | 'blockedCells'>): number {
  return scenario.width * scenario.height - new Set(scenario.blockedCells).size;
}

export function validateLevel(level: PartitionCampaignLevel): LevelValidationResult {
  const { metadata, scenario } = level;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!LEVEL_ID_PATTERN.test(scenario.id)) errors.push(`Invalid level id: ${scenario.id}`);
  if (metadata.slug.length === 0 || scenario.id !== `partition-${String(metadata.number).padStart(2, '0')}-${metadata.slug}`) {
    errors.push('Scenario id must match the level number and slug.');
  }
  if (metadata.tier !== scenario.difficultyId) errors.push('Metadata tier and scenario difficulty must match.');
  if (!Number.isInteger(scenario.width) || !Number.isInteger(scenario.height) || scenario.width < 4 || scenario.height < 4) {
    errors.push('Board dimensions must be integers of at least 4 cells.');
  }
  if (!(scenario.targetFraction > 0 && scenario.targetFraction <= 1)) errors.push('Capture target must be in (0, 1].');
  if (!Number.isInteger(scenario.integrity) || scenario.integrity < 1) errors.push('Integrity must be a positive integer.');
  if (!Number.isInteger(scenario.ticksPerSecond) || scenario.ticksPerSecond < 1) errors.push('Tick rate must be positive.');
  if (!Number.isInteger(scenario.sparkMoveEveryTicks) || scenario.sparkMoveEveryTicks < 1) {
    errors.push('Spark movement cadence must be a positive integer.');
  }
  if (!Number.isInteger(scenario.timeLimitTicks) || scenario.timeLimitTicks < 1) {
    errors.push('Time limit must be a positive integer.');
  }
  if (!Number.isInteger(metadata.parTicks) || metadata.parTicks < 1 || metadata.parTicks > scenario.timeLimitTicks) {
    errors.push('Par time must be positive and no greater than the time limit.');
  }

  const blocked = new Set<number>();
  for (const index of scenario.blockedCells) {
    if (!Number.isInteger(index) || index < 0 || index >= scenario.width * scenario.height) {
      errors.push(`Blocked cell index is outside the board: ${index}`);
    } else if (blocked.has(index)) {
      errors.push(`Blocked cell is duplicated: ${index}`);
    }
    blocked.add(index);
  }
  const playable = scenario.width * scenario.height - blocked.size;
  if (playable < 16) errors.push('A level needs at least 16 playable cells.');
  if (playable < scenario.width * scenario.height * 0.55) warnings.push('Less than 55% of the board is playable.');

  const wallKeys = new Set<string>();
  for (const wall of scenario.initialWalls) {
    const coordinates = [wall.ax, wall.ay, wall.bx, wall.by];
    const unitLength = Math.abs(wall.ax - wall.bx) + Math.abs(wall.ay - wall.by);
    if (!coordinates.every(Number.isInteger) || unitLength !== 1) errors.push('Initial walls must be integer unit edges.');
    if (coordinates.some((value) => value < 0) || wall.ax > scenario.width || wall.bx > scenario.width || wall.ay > scenario.height || wall.by > scenario.height) {
      errors.push('Initial wall is outside the board.');
    }
    const key = edgeKey(wall);
    if (wallKeys.has(key)) errors.push(`Initial wall is duplicated: ${key}`);
    wallKeys.add(key);
  }

  const spark = scenario.sparkStart;
  const sparkInBounds = Number.isInteger(spark.x) && Number.isInteger(spark.y)
    && spark.x >= 0 && spark.x <= scenario.width && spark.y >= 0 && spark.y <= scenario.height;
  if (!sparkInBounds) {
    errors.push('Spark start must be an integer grid point inside the board.');
  } else {
    const onOuterBoundary = spark.x === 0 || spark.y === 0 || spark.x === scenario.width || spark.y === scenario.height;
    if (!onOuterBoundary && !pointOnWall(spark, scenario.initialWalls)) {
      errors.push('Spark must start on the outer boundary or an initial wall.');
    }
  }

  if (scenario.anomalies.length === 0) errors.push('A level needs at least one anomaly.');
  const anomalyIds = new Set<string>();
  for (const anomaly of scenario.anomalies) {
    if (anomalyIds.has(anomaly.id)) errors.push(`Anomaly id is duplicated: ${anomaly.id}`);
    anomalyIds.add(anomaly.id);
    const [x, y] = anomaly.position;
    if (![x, y, ...anomaly.velocity].every(Number.isFinite)) errors.push(`${anomaly.id} has non-finite state.`);
    if (x < 0 || x >= scenario.width || y < 0 || y >= scenario.height) {
      errors.push(`${anomaly.id} starts outside the board.`);
    } else if (blocked.has(Math.floor(y) * scenario.width + Math.floor(x))) {
      errors.push(`${anomaly.id} starts in a blocked cell.`);
    }
    if (Math.hypot(...anomaly.velocity) <= 0) errors.push(`${anomaly.id} must move.`);
    if (anomaly.kind !== undefined && anomaly.kind !== 'drifter' && anomaly.kind !== 'filament') {
      errors.push(`${anomaly.id} has an unknown anomaly kind.`);
    }
    if (anomaly.length !== undefined && (!Number.isFinite(anomaly.length) || anomaly.length <= 0)) {
      errors.push(`${anomaly.id} has an invalid body length.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, playableCellCount: playable };
}

export function assertValidLevel(level: PartitionCampaignLevel): PartitionCampaignLevel {
  const result = validateLevel(level);
  if (!result.valid) throw new Error(`${level.scenario.id}: ${result.errors.join(' ')}`);
  return level;
}

export function validateCampaign(levels: readonly PartitionCampaignLevel[]): CampaignValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (levels.length === 0) errors.push('A campaign needs at least one level.');
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const numbers = new Set<number>();
  for (const level of levels) {
    const result = validateLevel(level);
    errors.push(...result.errors.map((error) => `${level.scenario.id}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${level.scenario.id}: ${warning}`));
    if (ids.has(level.scenario.id)) errors.push(`Duplicate scenario id: ${level.scenario.id}`);
    if (slugs.has(level.metadata.slug)) errors.push(`Duplicate level slug: ${level.metadata.slug}`);
    if (numbers.has(level.metadata.number)) errors.push(`Duplicate level number: ${level.metadata.number}`);
    ids.add(level.scenario.id);
    slugs.add(level.metadata.slug);
    numbers.add(level.metadata.number);
  }
  const orderedNumbers = [...numbers].sort((left, right) => left - right);
  if (orderedNumbers.some((number, index) => number !== index + 1)) {
    errors.push('Campaign level numbers must form a contiguous sequence beginning at 1.');
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function defineLevel(options: DefineLevelOptions): PartitionCampaignLevel {
  const { board } = options;
  const filamentCount = options.filamentCount ?? 0;
  if (!Number.isInteger(filamentCount) || filamentCount < 0 || filamentCount > options.anomalyCount) {
    throw new Error('Filament count must be an integer no greater than the anomaly count.');
  }
  const sparkStart = options.sparkStart ?? { x: Math.floor(board.width / 2), y: board.height };
  const initialWalls = uniqueWalls(wallsAroundMask(board), options.initialWalls ?? []);
  const scenario: PartitionLevelScenario = {
    id: `partition-${String(options.number).padStart(2, '0')}-${options.slug}`,
    name: options.title,
    width: board.width,
    height: board.height,
    ticksPerSecond: options.ticksPerSecond ?? 30,
    targetFraction: options.targetFraction,
    integrity: options.integrity,
    anomalies: spawnDeterministicAnomalies({
      seed: options.seed,
      count: options.anomalyCount,
      width: board.width,
      height: board.height,
      blockedCells: board.blockedCells,
      speed: options.anomalySpeed,
      kinds: Array.from({ length: options.anomalyCount }, (_, index) =>
        index < filamentCount ? 'filament' : 'drifter'),
    }),
    difficultyId: options.tier,
    sparkStart,
    sparkMoveEveryTicks: options.sparkMoveEveryTicks,
    timeLimitTicks: options.timeLimitTicks,
    blockedCells: [...board.blockedCells],
    initialWalls,
  };
  const metadata: PartitionLevelMetadata = {
    number: options.number,
    slug: options.slug,
    title: options.title,
    tier: options.tier,
    tagline: options.tagline,
    challenge: options.challenge,
    features: [...options.features],
    parTicks: options.parTicks,
  };
  return assertValidLevel({ metadata, scenario });
}

export function cloneCampaignLevel(level: PartitionCampaignLevel): PartitionCampaignLevel {
  return {
    metadata: { ...level.metadata, features: [...level.metadata.features] },
    scenario: {
      ...level.scenario,
      sparkStart: { ...level.scenario.sparkStart },
      blockedCells: [...level.scenario.blockedCells],
      initialWalls: level.scenario.initialWalls.map((wall) => ({ ...wall })),
      anomalies: level.scenario.anomalies.map((anomaly) => ({
        ...anomaly,
        position: [...anomaly.position] as [number, number],
        velocity: [...anomaly.velocity] as [number, number],
      })),
    },
  };
}

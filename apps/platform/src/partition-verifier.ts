import {
  PartitionEngine,
  applyDifficulty,
  createPartitionCampaign,
  resolvePartitionProgression,
  type ControlInput,
  type DifficultyId,
  type GameEvent,
  type PartitionReplay,
  type PartitionScenario,
  type PartitionState,
  type ReplayTick,
} from '@arcadebench/partition';
import { ApiError, requiredObject } from './http';

const DIRECTIONS = new Set(['up', 'down', 'left', 'right', 'idle']);
const DRAW_MODES = new Set(['off', 'fast', 'slow']);
const DIFFICULTIES = new Set<DifficultyId>(['easy', 'medium', 'hard', 'impossible']);
const MAX_PUBLIC_REPLAY_TICKS = 36_000;

export interface RankedChallenge {
  boardId: 'arcade' | 'level';
  difficulty: DifficultyId;
  levelId: string | null;
  seed: number;
}

export interface VerifiedReplay {
  replay: PartitionReplay;
  finalState: PartitionState;
  partitions: number;
}

export interface VerifiedScore {
  score: Record<string, unknown>;
  replays: PartitionReplay[];
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ApiError(400, `${label} is invalid.`);
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ApiError(400, `${label} is invalid.`);
  }
  return number;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  return value === undefined ? undefined : boundedInteger(value, label, minimum, maximum);
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) {
    throw new ApiError(400, `${label} contains unsupported fields.`);
  }
}

function deepEqual(first: unknown, second: unknown): boolean {
  // JSON has a single zero representation, while authored trigonometric
  // velocities can contain JavaScript's -0 before serialization.
  if (typeof first === 'number' && typeof second === 'number') return first === second;
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => deepEqual(value, second[index]));
  }
  if (!first || !second || typeof first !== 'object' || typeof second !== 'object') return false;
  const firstRecord = first as Record<string, unknown>;
  const secondRecord = second as Record<string, unknown>;
  const firstKeys = Object.keys(firstRecord).sort();
  const secondKeys = Object.keys(secondRecord).sort();
  return deepEqual(firstKeys, secondKeys)
    && firstKeys.every((key) => deepEqual(firstRecord[key], secondRecord[key]));
}

function firstDifference(first: unknown, second: unknown, path = 'scenario'): string {
  if (deepEqual(first, second)) return path;
  if (Array.isArray(first) && Array.isArray(second)) {
    if (first.length !== second.length) return `${path}.length`;
    for (let index = 0; index < first.length; index++) {
      if (!deepEqual(first[index], second[index])) return firstDifference(first[index], second[index], `${path}[${index}]`);
    }
  }
  if (first && second && typeof first === 'object' && typeof second === 'object') {
    const keys = [...new Set([
      ...Object.keys(first as Record<string, unknown>),
      ...Object.keys(second as Record<string, unknown>),
    ])].sort();
    for (const key of keys) {
      const firstValue = (first as Record<string, unknown>)[key];
      const secondValue = (second as Record<string, unknown>)[key];
      if (!deepEqual(firstValue, secondValue)) return firstDifference(firstValue, secondValue, `${path}.${key}`);
    }
  }
  return path;
}

function sanitizePoint(value: unknown, label: string, maximumX: number, maximumY: number): { x: number; y: number } {
  const point = requiredObject(value, label);
  exactKeys(point, ['x', 'y'], label);
  return {
    x: boundedInteger(point.x, `${label}.x`, 0, maximumX),
    y: boundedInteger(point.y, `${label}.y`, 0, maximumY),
  };
}

function sanitizeScenario(value: unknown): PartitionScenario {
  const scenario = requiredObject(value, 'Replay scenario');
  exactKeys(scenario, [
    'id', 'name', 'width', 'height', 'ticksPerSecond', 'targetFraction', 'integrity',
    'difficultyId', 'sparkStart', 'sparkMoveEveryTicks', 'timeLimitTicks', 'blockedCells',
    'initialWalls', 'anomalies',
  ], 'Replay scenario');
  const width = boundedInteger(scenario.width, 'Scenario width', 4, 128);
  const height = boundedInteger(scenario.height, 'Scenario height', 4, 128);
  const targetFraction = finiteNumber(scenario.targetFraction, 'Target fraction');
  if (targetFraction <= 0 || targetFraction > 1) throw new ApiError(400, 'Target fraction is invalid.');
  const difficultyId = scenario.difficultyId;
  if (difficultyId !== undefined && !DIFFICULTIES.has(difficultyId as DifficultyId)) {
    throw new ApiError(400, 'Scenario difficulty is invalid.');
  }

  const blockedInput = scenario.blockedCells ?? [];
  if (!Array.isArray(blockedInput) || blockedInput.length > width * height - 1) {
    throw new ApiError(400, 'Scenario blocked cells are invalid.');
  }
  const blockedCells = blockedInput.map((cell, index) =>
    boundedInteger(cell, `Blocked cell ${index + 1}`, 0, width * height - 1));
  if (new Set(blockedCells).size !== blockedCells.length) throw new ApiError(400, 'Blocked cells must be unique.');

  const wallsInput = scenario.initialWalls ?? [];
  if (!Array.isArray(wallsInput) || wallsInput.length > 16_384) {
    throw new ApiError(400, 'Scenario walls are invalid.');
  }
  const initialWalls = wallsInput.map((value, index) => {
    const wall = requiredObject(value, `Wall ${index + 1}`);
    exactKeys(wall, ['ax', 'ay', 'bx', 'by'], `Wall ${index + 1}`);
    const result = {
      ax: boundedInteger(wall.ax, 'Wall coordinate', 0, width),
      ay: boundedInteger(wall.ay, 'Wall coordinate', 0, height),
      bx: boundedInteger(wall.bx, 'Wall coordinate', 0, width),
      by: boundedInteger(wall.by, 'Wall coordinate', 0, height),
    };
    if (Math.abs(result.ax - result.bx) + Math.abs(result.ay - result.by) !== 1) {
      throw new ApiError(400, 'Scenario walls must be unit grid edges.');
    }
    return result;
  });

  if (!Array.isArray(scenario.anomalies) || scenario.anomalies.length > 64) {
    throw new ApiError(400, 'Scenario anomalies are invalid.');
  }
  const anomalyIds = new Set<string>();
  const anomalies = scenario.anomalies.map((value, index) => {
    const anomaly = requiredObject(value, `Anomaly ${index + 1}`);
    exactKeys(anomaly, ['id', 'position', 'velocity', 'kind', 'length'], `Anomaly ${index + 1}`);
    if (typeof anomaly.id !== 'string' || anomaly.id.length === 0 || anomaly.id.length > 64 || anomalyIds.has(anomaly.id)) {
      throw new ApiError(400, 'Anomaly identifiers are invalid.');
    }
    anomalyIds.add(anomaly.id);
    if (!Array.isArray(anomaly.position) || anomaly.position.length !== 2
      || !Array.isArray(anomaly.velocity) || anomaly.velocity.length !== 2) {
      throw new ApiError(400, 'Anomaly movement is invalid.');
    }
    const position: [number, number] = [
      finiteNumber(anomaly.position[0], 'Anomaly position'),
      finiteNumber(anomaly.position[1], 'Anomaly position'),
    ];
    const velocity: [number, number] = [
      finiteNumber(anomaly.velocity[0], 'Anomaly velocity'),
      finiteNumber(anomaly.velocity[1], 'Anomaly velocity'),
    ];
    if (position[0] < 0 || position[0] >= width || position[1] < 0 || position[1] >= height
      || Math.hypot(...velocity) <= 0 || Math.hypot(...velocity) > 4) {
      throw new ApiError(400, 'Anomaly movement is outside supported bounds.');
    }
    if (anomaly.kind !== undefined && anomaly.kind !== 'drifter' && anomaly.kind !== 'filament') {
      throw new ApiError(400, 'Anomaly kind is invalid.');
    }
    const length = anomaly.length === undefined
      ? undefined
      : finiteNumber(anomaly.length, 'Anomaly length');
    if (length !== undefined && (length <= 0 || length > 32)) throw new ApiError(400, 'Anomaly length is invalid.');
    return {
      id: anomaly.id,
      position,
      velocity,
      ...(anomaly.kind === undefined ? {} : { kind: anomaly.kind as 'drifter' | 'filament' }),
      ...(length === undefined ? {} : { length }),
    };
  });

  const result: PartitionScenario = {
    id: typeof scenario.id === 'string' && scenario.id.length > 0 && scenario.id.length <= 128
      ? scenario.id
      : (() => { throw new ApiError(400, 'Scenario identifier is invalid.'); })(),
    name: typeof scenario.name === 'string' && scenario.name.length > 0 && scenario.name.length <= 128
      ? scenario.name
      : (() => { throw new ApiError(400, 'Scenario name is invalid.'); })(),
    width,
    height,
    ticksPerSecond: boundedInteger(scenario.ticksPerSecond, 'Tick rate', 1, 120),
    targetFraction,
    integrity: boundedInteger(scenario.integrity, 'Integrity', 1, 20),
    ...(difficultyId === undefined ? {} : { difficultyId: difficultyId as DifficultyId }),
    ...(scenario.sparkStart === undefined ? {} : { sparkStart: sanitizePoint(scenario.sparkStart, 'Spark start', width, height) }),
    ...(scenario.sparkMoveEveryTicks === undefined ? {} : {
      sparkMoveEveryTicks: boundedInteger(scenario.sparkMoveEveryTicks, 'Spark cadence', 1, 120),
    }),
    ...(scenario.timeLimitTicks === undefined ? {} : {
      timeLimitTicks: boundedInteger(scenario.timeLimitTicks, 'Time limit', 1, 180_000),
    }),
    ...(scenario.blockedCells === undefined ? {} : { blockedCells }),
    ...(scenario.initialWalls === undefined ? {} : { initialWalls }),
    anomalies,
  };
  if (!deepEqual(result, scenario)) throw new ApiError(400, 'Replay scenario is not canonical.');
  return result;
}

function sanitizeInput(value: unknown): ControlInput {
  const input = requiredObject(value, 'Replay input');
  exactKeys(input, ['direction', 'draw'], 'Replay input');
  if (!DIRECTIONS.has(input.direction as string) || !DRAW_MODES.has(input.draw as string)) {
    throw new ApiError(400, 'Replay input is invalid.');
  }
  return { direction: input.direction as ControlInput['direction'], draw: input.draw as ControlInput['draw'] };
}

function sanitizeControlEvents(value: unknown, maximumTick: number): GameEvent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new ApiError(400, 'Replay control events are invalid.');
  return value.map((item) => {
    const event = requiredObject(item, 'Replay control event');
    exactKeys(event, ['tick', 'type', 'version'], 'Replay control event');
    if (event.type !== 'controller_installed') throw new ApiError(400, 'Replay control event is invalid.');
    return {
      tick: boundedInteger(event.tick, 'Control event tick', 0, maximumTick),
      type: 'controller_installed' as const,
      version: boundedInteger(event.version, 'Controller version', 1, 1_000_000),
    };
  });
}

export function verifyPartitionReplay(value: unknown, expectedScenario?: PartitionScenario): VerifiedReplay {
  const source = requiredObject(value, 'Replay');
  exactKeys(source, ['version', 'scenario', 'ticks', 'finalState'], 'Replay');
  if (source.version !== 1 || !Array.isArray(source.ticks) || source.ticks.length > MAX_PUBLIC_REPLAY_TICKS) {
    throw new ApiError(400, 'Replay generation or length is unsupported.');
  }
  const scenario = sanitizeScenario(source.scenario);
  if (expectedScenario && !deepEqual(scenario, expectedScenario)) {
    throw new ApiError(400, `Replay does not match its ranked field challenge at ${firstDifference(scenario, expectedScenario)}.`);
  }
  const engine = new PartitionEngine(scenario);
  const ticks: ReplayTick[] = [];
  let partitions = 0;
  for (let index = 0; index < source.ticks.length; index++) {
    const record = requiredObject(source.ticks[index], `Replay tick ${index + 1}`);
    exactKeys(record, ['tick', 'input', 'controllerVersion', 'controlEvents', 'events'], `Replay tick ${index + 1}`);
    const expectedTick = engine.snapshot().tick + 1;
    const tick = boundedInteger(record.tick, 'Replay tick', 1, MAX_PUBLIC_REPLAY_TICKS);
    if (tick !== expectedTick) throw new ApiError(400, `Replay tick ${tick} is not contiguous.`);
    const input = sanitizeInput(record.input);
    const controllerVersion = boundedInteger(record.controllerVersion ?? 0, 'Controller version', 0, 1_000_000);
    if (!Array.isArray(record.events)) throw new ApiError(400, 'Replay events are invalid.');
    const controlEvents = sanitizeControlEvents(record.controlEvents, tick);
    engine.setControllerVersion(controllerVersion);
    engine.setInput(input);
    const result = engine.step();
    if (result.state.tick !== tick) throw new ApiError(400, 'Replay continued after the field ended.');
    if (!deepEqual(record.events, result.events)) throw new ApiError(400, `Replay event mismatch at tick ${tick}.`);
    partitions += result.events.filter((event) => event.type === 'trace_completed').length;
    ticks.push({
      tick,
      input,
      controllerVersion,
      ...(controlEvents === undefined ? {} : { controlEvents }),
      events: structuredClone(result.events),
    });
  }
  const finalState = engine.snapshot();
  if (!deepEqual(source.finalState, finalState)) throw new ApiError(400, 'Replay final state does not match reconstruction.');
  const replay: PartitionReplay = { version: 1, scenario, ticks, finalState };
  return { replay, finalState, partitions };
}

function elapsedMilliseconds(replays: readonly PartitionReplay[]): number {
  return Math.round(replays.reduce(
    (total, replay) => total + replay.finalState.tick / replay.scenario.ticksPerSecond * 1000,
    0,
  ));
}

export function isDifficulty(value: unknown): value is DifficultyId {
  return DIFFICULTIES.has(value as DifficultyId);
}

export function verifyRankedScore(
  challenge: RankedChallenge,
  claimedScore: unknown,
  proofValue: unknown,
): VerifiedScore {
  const proof = requiredObject(proofValue, 'Score proof');
  exactKeys(proof, ['replays'], 'Score proof');
  if (!Array.isArray(proof.replays) || proof.replays.length === 0) {
    throw new ApiError(400, 'Score proof needs at least one replay.');
  }

  if (challenge.boardId === 'level') {
    if (proof.replays.length !== 1 || !challenge.levelId) throw new ApiError(400, 'Field proof is invalid.');
    const level = createPartitionCampaign(challenge.seed)
      .find((candidate) => candidate.metadata.slug === challenge.levelId);
    if (!level) throw new ApiError(400, 'Ranked field no longer exists.');
    const expectedScenario = applyDifficulty(level.scenario, challenge.difficulty);
    const verified = verifyPartitionReplay(proof.replays[0], expectedScenario);
    if (verified.finalState.status === 'running') throw new ApiError(400, 'Field attempt is not finished.');
    const score: Record<string, unknown> = {
      scope: 'level',
      difficulty: challenge.difficulty,
      levelId: level.metadata.slug,
      levelNumber: level.metadata.number,
      levelTitle: level.metadata.title,
      won: verified.finalState.status === 'won',
      capturedFraction: verified.finalState.capturedFraction,
      elapsedMs: elapsedMilliseconds([verified.replay]),
      partitions: verified.partitions,
    };
    if (!deepEqual(score, claimedScore)) throw new ApiError(400, 'Claimed field score does not match the replay.');
    return { score, replays: [verified.replay] };
  }

  const progression = resolvePartitionProgression(undefined, challenge.seed);
  if (proof.replays.length > progression.length) throw new ApiError(400, 'Arcade proof has too many stages.');
  const verified = proof.replays.map((replay, index) =>
    verifyPartitionReplay(replay, applyDifficulty(progression[index]!.scenario, challenge.difficulty)));
  for (let index = 0; index < verified.length - 1; index++) {
    if (verified[index]!.finalState.status !== 'won') {
      throw new ApiError(400, 'Arcade proof continued after a lost stage.');
    }
  }
  const last = verified.at(-1)!;
  const completed = verified.length === progression.length && last.finalState.status === 'won';
  if (!completed && last.finalState.status !== 'lost') {
    throw new ApiError(400, 'Arcade proof is not a finished run.');
  }
  const replays = verified.map((item) => item.replay);
  const score: Record<string, unknown> = {
    scope: 'arcade',
    difficulty: challenge.difficulty,
    stageReached: verified.length,
    stagesCleared: verified.filter((item) => item.finalState.status === 'won').length,
    completed,
    elapsedMs: elapsedMilliseconds(replays),
    partitions: verified.reduce((total, item) => total + item.partitions, 0),
  };
  if (!deepEqual(score, claimedScore)) throw new ApiError(400, 'Claimed arcade score does not match the replays.');
  return { score, replays };
}

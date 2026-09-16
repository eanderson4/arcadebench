import { SmilefallEngine } from './core/engine';
import type { ControlInput } from './core/types';
import { SMILEFALL_GAME_ID, SMILEFALL_GAME_VERSION } from './core/version';
import {
  smilefallArcadeRun,
  smilefallCatalog,
  stageBySlug,
} from './levels/catalog';
import { applyMood, MOOD_ORDER } from './levels/toolbox';
import type { SmilefallLevelScenario, SmilefallMoodId } from './levels/types';

const MAX_PROOF_STAGES = 10;
const MAX_STAGE_TICKS = 5_000;
const MAX_TOTAL_TICKS = 40_000;
const MAX_STRING_LENGTH = 160;

const AUTHORITY_DIFFICULTIES = Object.freeze(
  ['giggle', 'chuckle', 'guffaw', 'cackle'] as const,
);
const AUTHORITY_ARCADE_LEVEL_IDS: readonly string[] = Object.freeze(
  smilefallArcadeRun.map((stage) => stage.metadata.slug),
);
const AUTHORITY_LEVELS: readonly Readonly<{ id: string; title: string }>[] = Object.freeze(
  smilefallCatalog.map((stage) => Object.freeze({
    id: stage.metadata.slug,
    title: stage.metadata.title,
  })),
);

export const SMILEFALL_CURRENT_RANKED_AUTHORITY = Object.freeze({
  gameId: SMILEFALL_GAME_ID,
  gameVersion: SMILEFALL_GAME_VERSION,
  authorityId: 'smilefall-challenge-v1',
  difficulties: AUTHORITY_DIFFICULTIES,
  arcadeLevelIds: AUTHORITY_ARCADE_LEVEL_IDS,
  levels: AUTHORITY_LEVELS,
} as const);

export interface SmilefallRankedChallenge {
  runId: string;
  nonce: number;
  boardId: 'arcade' | 'level';
  difficulty: SmilefallMoodId;
  levelId?: string;
}

export interface SmilefallProofInputTick {
  tick: number;
  input: ControlInput;
}

export interface SmilefallProofStage {
  levelId: string;
  ticks: SmilefallProofInputTick[];
}

export interface SmilefallRankedProof {
  schemaVersion: 1;
  gameId: typeof SMILEFALL_GAME_ID;
  gameVersion: typeof SMILEFALL_GAME_VERSION;
  authorityId: typeof SMILEFALL_CURRENT_RANKED_AUTHORITY.authorityId;
  runId: string;
  nonce: number;
  boardId: 'arcade' | 'level';
  difficulty: SmilefallMoodId;
  levelId?: string;
  stages: SmilefallProofStage[];
}

export interface SmilefallArcadeRankedSummary {
  scope: 'arcade';
  difficulty: SmilefallMoodId;
  completed: boolean;
  stageReached: number;
  stagesCleared: number;
  score: number;
  totalTicks: number;
  popped: number;
}

export interface SmilefallLevelRankedSummary {
  scope: 'level';
  difficulty: SmilefallMoodId;
  levelId: string;
  won: boolean;
  score: number;
  totalTicks: number;
  popped: number;
  caught: number;
}

export type SmilefallRankedSummary = SmilefallArcadeRankedSummary | SmilefallLevelRankedSummary;

export interface VerifiedSmilefallRankedProof {
  summary: SmilefallRankedSummary;
  canonicalJson: string;
}

export class SmilefallProofError extends Error {
  readonly name = 'SmilefallProofError';

  constructor(message: string) {
    super(message);
  }
}

function fail(message: string): never {
  throw new SmilefallProofError(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    fail(`${label} contains unsupported fields.`);
  }
}

function boundedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_STRING_LENGTH) {
    fail(`${label} is invalid.`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is invalid.`);
  }
  return value;
}

function isMood(value: unknown): value is SmilefallMoodId {
  return typeof value === 'string' && (MOOD_ORDER as readonly string[]).includes(value);
}

function sanitizeInput(value: unknown): ControlInput {
  const source = record(value, 'Proof input');
  exactKeys(source, ['lean', 'hop'], 'Proof input');
  if (source.lean !== 'left' && source.lean !== 'right' && source.lean !== 'none') {
    fail('Proof lean input is invalid.');
  }
  if (typeof source.hop !== 'boolean') fail('Proof hop input is invalid.');
  return { lean: source.lean, hop: source.hop };
}

function sanitizeStage(value: unknown, total: { ticks: number }): SmilefallProofStage {
  const source = record(value, 'Proof stage');
  exactKeys(source, ['levelId', 'ticks'], 'Proof stage');
  const levelId = boundedString(source.levelId, 'Proof level identifier');
  if (!stageBySlug(levelId)) fail('Proof level identifier is not official.');
  const tickSource = source.ticks;
  if (!Array.isArray(tickSource) || tickSource.length < 1 || tickSource.length > MAX_STAGE_TICKS) {
    fail('Proof stage tick stream is invalid.');
  }
  total.ticks += tickSource.length;
  if (total.ticks > MAX_TOTAL_TICKS) fail('Proof tick budget is too large.');
  const ticks = tickSource.map((value, index) => {
    const tick = record(value, 'Proof tick');
    exactKeys(tick, ['tick', 'input'], 'Proof tick');
    const tickNumber = boundedInteger(tick.tick, 'Proof tick number', 1, tickSource.length);
    if (tickNumber !== index + 1) fail('Proof ticks must be contiguous and begin at one.');
    return { tick: tickNumber, input: sanitizeInput(tick.input) };
  });
  return { levelId, ticks };
}

function sameChallenge(proof: SmilefallRankedProof, challenge: SmilefallRankedChallenge): boolean {
  return proof.runId === challenge.runId
    && proof.nonce === challenge.nonce
    && proof.boardId === challenge.boardId
    && proof.difficulty === challenge.difficulty
    && proof.levelId === challenge.levelId;
}

function sanitizeProof(value: unknown): SmilefallRankedProof {
  const source = record(value, 'Smilefall proof');
  exactKeys(source, [
    'schemaVersion',
    'gameId',
    'gameVersion',
    'authorityId',
    'runId',
    'nonce',
    'boardId',
    'difficulty',
    'levelId',
    'stages',
  ], 'Smilefall proof');
  if (source.schemaVersion !== 1) fail('Smilefall proof version is unsupported.');
  if (source.gameId !== SMILEFALL_GAME_ID
    || source.gameVersion !== SMILEFALL_GAME_VERSION
    || source.authorityId !== SMILEFALL_CURRENT_RANKED_AUTHORITY.authorityId) {
    fail('Smilefall proof authority is invalid.');
  }
  const runId = boundedString(source.runId, 'Smilefall run identifier');
  const nonce = boundedInteger(source.nonce, 'Smilefall run nonce', 0, Number.MAX_SAFE_INTEGER);
  if (source.boardId !== 'arcade' && source.boardId !== 'level') {
    fail('Smilefall proof board is invalid.');
  }
  if (!isMood(source.difficulty)) fail('Smilefall proof difficulty is invalid.');
  const levelId = source.levelId === undefined
    ? undefined
    : boundedString(source.levelId, 'Smilefall level identifier');
  if (!Array.isArray(source.stages)
    || source.stages.length < 1
    || source.stages.length > MAX_PROOF_STAGES) {
    fail('Smilefall proof stage list is invalid.');
  }
  const total = { ticks: 0 };
  const stages = source.stages.map((stage) => sanitizeStage(stage, total));
  return {
    schemaVersion: 1,
    gameId: SMILEFALL_GAME_ID,
    gameVersion: SMILEFALL_GAME_VERSION,
    authorityId: SMILEFALL_CURRENT_RANKED_AUTHORITY.authorityId,
    runId,
    nonce,
    boardId: source.boardId,
    difficulty: source.difficulty,
    ...(levelId === undefined ? {} : { levelId }),
    stages,
  };
}

function canonicalStringify(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return JSON.stringify(normalize(value));
}

export function resolveOfficialSmilefallScenario(
  levelId: string,
  difficulty: SmilefallMoodId,
  nonce?: number,
): SmilefallLevelScenario {
  const stage = stageBySlug(levelId);
  if (!stage) fail('Smilefall level identifier is not official.');
  if (!isMood(difficulty)) fail('Smilefall difficulty is invalid.');
  const scenario = structuredClone(applyMood(stage.scenario, difficulty));
  if (nonce === undefined || !rankedMirror(nonce, levelId)) return scenario;
  const mirrorX = (x: number, width = 0): number => scenario.width - x - width;
  return {
    ...scenario,
    buckets: scenario.buckets.map((bucket) => ({
      ...bucket,
      x: mirrorX(bucket.x, bucket.width),
      ...(bucket.drift ? {
        drift: {
          speed: -bucket.drift.speed,
          minX: mirrorX(bucket.drift.maxX, bucket.width),
          maxX: mirrorX(bucket.drift.minX, bucket.width),
        },
      } : {}),
    })),
    platforms: scenario.platforms?.map((platform) => ({
      ...platform,
      x: mirrorX(platform.x, platform.width),
    })),
    spikes: scenario.spikes?.map((spike) => ({
      ...spike,
      x: mirrorX(spike.x, spike.width),
    })),
    drops: scenario.drops.map((drop) => ({
      ...drop,
      x: mirrorX(drop.x),
      ...(drop.vx === undefined ? {} : { vx: -drop.vx }),
    })),
    rocks: scenario.rocks.map((rock) => ({
      ...rock,
      from: rock.from === 'left' ? 'right' : 'left',
    })),
  };
}

/** Stable per-level mirror bit that makes ranked inputs challenge-specific. */
export function rankedMirror(nonce: number, levelId: string): boolean {
  let hash = (nonce ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < levelId.length; index++) {
    hash = Math.imul(hash ^ levelId.charCodeAt(index), 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  return (hash & 1) === 1;
}

/**
 * Trusted fixture/browser helper. It only builds the input envelope; the
 * verifier still reconstructs every official scenario and derives the score.
 */
export function buildSmilefallRankedProof(
  stages: readonly SmilefallProofStage[],
  challenge: SmilefallRankedChallenge,
): SmilefallRankedProof {
  return {
    schemaVersion: 1,
    gameId: SMILEFALL_GAME_ID,
    gameVersion: SMILEFALL_GAME_VERSION,
    authorityId: SMILEFALL_CURRENT_RANKED_AUTHORITY.authorityId,
    runId: challenge.runId,
    nonce: challenge.nonce,
    boardId: challenge.boardId,
    difficulty: challenge.difficulty,
    ...(challenge.levelId === undefined ? {} : { levelId: challenge.levelId }),
    stages: stages.map((stage) => ({
      levelId: stage.levelId,
      ticks: stage.ticks.map((tick) => ({ tick: tick.tick, input: { ...tick.input } })),
    })),
  };
}

function verifyStage(stage: SmilefallProofStage, difficulty: SmilefallMoodId, nonce: number) {
  const engine = new SmilefallEngine(resolveOfficialSmilefallScenario(stage.levelId, difficulty, nonce));
  for (const [index, record] of stage.ticks.entries()) {
    if (engine.snapshot().status !== 'running') {
      fail(`Proof stage ${stage.levelId} contains input after its terminal tick.`);
    }
    if (record.tick !== index + 1) fail('Proof ticks are not contiguous.');
    engine.setInput(record.input);
    engine.step();
  }
  const final = engine.snapshot();
  if (final.status === 'running') fail(`Proof stage ${stage.levelId} is not terminal.`);
  return final;
}

export function verifySmilefallRankedProof(
  value: unknown,
  challenge: SmilefallRankedChallenge,
  gameVersion: string,
): VerifiedSmilefallRankedProof {
  if (gameVersion !== SMILEFALL_GAME_VERSION) fail('Smilefall game version is unsupported.');
  if (!isMood(challenge.difficulty)) fail('Smilefall challenge difficulty is invalid.');
  if (challenge.boardId !== 'arcade' && challenge.boardId !== 'level') {
    fail('Smilefall challenge board is invalid.');
  }
  const proof = sanitizeProof(value);
  if (!sameChallenge(proof, challenge)) fail('Smilefall proof does not match its ranked challenge.');

  if (proof.boardId === 'level') {
    if (!proof.levelId || !stageBySlug(proof.levelId)) fail('Smilefall level challenge is invalid.');
    if (proof.stages.length !== 1 || proof.stages[0]!.levelId !== proof.levelId) {
      fail('Smilefall level proof must contain exactly its challenged level.');
    }
    const state = verifyStage(proof.stages[0]!, proof.difficulty, proof.nonce);
    return {
      summary: {
        scope: 'level',
        difficulty: proof.difficulty,
        levelId: proof.levelId,
        won: state.status === 'won',
        score: state.score,
        totalTicks: state.tick,
        popped: state.missed,
        caught: state.caught,
      },
      canonicalJson: canonicalStringify(proof),
    };
  }

  if (proof.levelId !== undefined) fail('Smilefall arcade proof cannot bind a single level.');
  const expectedIds = SMILEFALL_CURRENT_RANKED_AUTHORITY.arcadeLevelIds;
  let score = 0;
  let totalTicks = 0;
  let popped = 0;
  let stagesCleared = 0;
  for (const [index, stage] of proof.stages.entries()) {
    if (stage.levelId !== expectedIds[index]) {
      fail('Smilefall arcade stages must follow the official progression.');
    }
    const state = verifyStage(stage, proof.difficulty, proof.nonce);
    score += state.score;
    totalTicks += state.tick;
    popped += state.missed;
    if (state.status === 'won') {
      stagesCleared++;
      if (index === proof.stages.length - 1 && index < expectedIds.length - 1) {
        fail('Smilefall arcade proof stops before the next stage.');
      }
    } else if (index !== proof.stages.length - 1) {
      fail('Smilefall arcade proof continues after a failed stage.');
    }
  }
  const completed = stagesCleared === expectedIds.length;
  if (completed && proof.stages.length !== expectedIds.length) {
    fail('Smilefall completed arcade proof is incomplete.');
  }
  return {
    summary: {
      scope: 'arcade',
      difficulty: proof.difficulty,
      completed,
      stageReached: proof.stages.length,
      stagesCleared,
      score,
      totalTicks,
      popped,
    },
    canonicalJson: canonicalStringify(proof),
  };
}

import {
  assertMaltlineCabinetAuthority,
  MALTLINE_CABINET_LIMITS,
  MALTLINE_CABINET_PROOF_VERSION,
} from './cabinet-authority';
import { resolveMaltlineCabinetAuthority, type MaltlineCabinetGameVersion } from './cabinet-authorities';
import { MaltlineEngine } from './engine';
import { canonicalJson, type CanonicalValue } from './fingerprint';
import { normalizeMaltlineInput } from './input';
import type { MaltlineCabinetReplay } from './replay';
import type { MaltlineInput, MaltlineState } from './types';

export interface MaltlineCabinetChallenge {
  runId: string;
  /** Challenge binding only; fixed authored campaign seeds are not randomized. */
  nonce: number;
}
export interface MaltlineCabinetInputRun extends MaltlineInput { ticks: number }
export interface MaltlineCabinetProof {
  version: 1;
  gameId: 'maltline';
  gameVersion: MaltlineCabinetGameVersion;
  authorityId: string;
  challenge: MaltlineCabinetChallenge;
  stages: Array<{ stageId: string; inputRuns: MaltlineCabinetInputRun[] }>;
}
export interface MaltlineCabinetSummary {
  score: number;
  lives: number;
  stageReached: number;
  stagesCleared: number;
  completed: boolean;
  totalTicks: number;
  fulfilled: number;
  serviceActions: number;
  walkouts: number;
  resolved: number;
  exited: number;
}
export interface VerifiedMaltlineCabinetProof {
  proof: MaltlineCabinetProof;
  summary: MaltlineCabinetSummary;
  /** Canonical server-derived envelope: includes authoritative summary. */
  canonicalJson: string;
}
export class MaltlineCabinetProofError extends Error {
  constructor(message: string) { super(message); this.name = 'MaltlineCabinetProofError'; }
}

function fail(message: string): never { throw new MaltlineCabinetProofError(message); }

/** Reject accessors before reading values, and reject extra/hidden/symbol keys. */
function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    fail(`${label} must be a plain object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))) {
    fail(`${label} has unsupported or missing fields.`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(`${label}.${key} must be a data property.`);
    result[key] = descriptor.value;
  }
  return result;
}

function array(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    fail(`${label} count must be between 1 and ${maximum}.`);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(`${label} must be a dense plain array.`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(`${label} must contain only data items.`);
    result.push(descriptor.value);
  }
  return result;
}

function challenge(value: unknown): MaltlineCabinetChallenge {
  const data = object(value, ['runId', 'nonce'], 'Cabinet challenge');
  if (typeof data.runId !== 'string' || !/^run_[A-Za-z0-9_-]{1,60}$/u.test(data.runId)) {
    fail('Cabinet challenge runId is invalid.');
  }
  if (typeof data.nonce !== 'number' || !Number.isSafeInteger(data.nonce)
    || data.nonce < 0 || data.nonce > 0xffff_ffff) fail('Cabinet challenge nonce is invalid.');
  return { runId: data.runId, nonce: data.nonce === 0 ? 0 : data.nonce };
}

function sameInput(a: MaltlineInput, b: MaltlineInput): boolean {
  return a.stationDir === b.stationDir && a.laneDir === b.laneDir && a.blend === b.blend && a.serve === b.serve;
}

function parse(value: unknown, expectedChallenge: MaltlineCabinetChallenge, expectedVersion?: MaltlineCabinetGameVersion): MaltlineCabinetProof {
  const trusted = challenge(expectedChallenge);
  const root = object(value, ['version', 'gameId', 'gameVersion', 'authorityId', 'challenge', 'stages'], 'Cabinet proof');
  const authority = resolveMaltlineCabinetAuthority(root.gameVersion);
  if (authority === null || (expectedVersion !== undefined && root.gameVersion !== expectedVersion)) {
    fail('Unsupported Maltline cabinet proof authority or version.');
  }
  if (root.version !== MALTLINE_CABINET_PROOF_VERSION || root.gameId !== 'maltline'
    || root.gameVersion !== authority.gameVersion || root.authorityId !== authority.authorityId) {
    fail('Unsupported Maltline cabinet proof authority or version.');
  }
  const binding = challenge(root.challenge);
  if (binding.runId !== trusted.runId || binding.nonce !== trusted.nonce) fail('Cabinet proof challenge does not match.');
  let inputRunCount = 0;
  let totalTicks = 0;
  const stages = array(root.stages, MALTLINE_CABINET_LIMITS.maximumStages, 'Cabinet stages').map((value, index) => {
    const stage = object(value, ['stageId', 'inputRuns'], 'Cabinet stage');
    if (stage.stageId !== authority.campaign[index]?.id) fail('Cabinet stage order does not match the authored campaign.');
    let stageTicks = 0;
    const inputRuns: MaltlineCabinetInputRun[] = [];
    for (const value of array(stage.inputRuns, MALTLINE_CABINET_LIMITS.maximumInputRuns, 'Cabinet input runs')) {
      const run = object(value, ['ticks', 'stationDir', 'laneDir', 'blend', 'serve'], 'Cabinet input run');
      if (typeof run.ticks !== 'number' || !Number.isSafeInteger(run.ticks) || run.ticks < 1) fail('Cabinet input run ticks must be positive integers.');
      stageTicks += run.ticks;
      totalTicks += run.ticks;
      inputRunCount++;
      if (stageTicks > MALTLINE_CABINET_LIMITS.maximumStageTicks
        || totalTicks > MALTLINE_CABINET_LIMITS.maximumTotalTicks
        || inputRunCount > MALTLINE_CABINET_LIMITS.maximumInputRuns) fail('Cabinet proof exceeds its tick or input limits.');
      let input: Readonly<MaltlineInput>;
      try {
        input = normalizeMaltlineInput({ stationDir: run.stationDir, laneDir: run.laneDir, blend: run.blend, serve: run.serve });
      } catch { fail('Cabinet input is invalid.'); }
      const previous = inputRuns.at(-1);
      if (previous && sameInput(previous, input)) previous.ticks += run.ticks;
      else inputRuns.push({ ticks: run.ticks, ...input });
    }
    return { stageId: stage.stageId as string, inputRuns };
  });
  return { version: 1, gameId: 'maltline', gameVersion: authority.gameVersion, authorityId: authority.authorityId, challenge: binding, stages };
}

function execute(proof: MaltlineCabinetProof): { summary: MaltlineCabinetSummary; finals: MaltlineState[] } {
  const authority = resolveMaltlineCabinetAuthority(proof.gameVersion)!;
  let carried = { ...authority.initialRun };
  const finals: MaltlineState[] = [];
  const summary: MaltlineCabinetSummary = {
    score: carried.score, lives: carried.lives, stageReached: 0, stagesCleared: 0, completed: false,
    totalTicks: 0, fulfilled: 0, serviceActions: 0, walkouts: 0, resolved: 0, exited: 0,
  };
  for (const [index, stage] of proof.stages.entries()) {
    const engine = new MaltlineEngine(authority.campaign[index]!, carried, authority.controlMode);
    let state = engine.snapshot();
    for (const { ticks, ...input } of stage.inputRuns) {
      engine.setInput(input);
      for (let tick = 0; tick < ticks; tick++) {
        if (state.status !== 'running') fail('Cabinet proof contains input after a terminal tick.');
        state = engine.step().state;
      }
    }
    if (state.status === 'running') fail('Cabinet stage is incomplete.');
    if (state.status === 'lost' && index !== proof.stages.length - 1) fail('Cabinet proof continues after a lost stage.');
    finals.push(state);
    carried = { score: state.score, lives: state.lives };
    summary.score = state.score;
    summary.lives = state.lives;
    summary.stageReached++;
    if (state.status === 'won') summary.stagesCleared++;
    summary.totalTicks += state.tick;
    for (const key of ['fulfilled', 'serviceActions', 'walkouts', 'resolved', 'exited'] as const) summary[key] += state[key];
  }
  const final = finals.at(-1)!;
  if (final.status === 'won' && finals.length !== authority.campaign.length) fail('Cabinet proof omits remaining campaign stages.');
  summary.completed = finals.length === authority.campaign.length && final.status === 'won';
  return { summary, finals };
}

/** Inputs only: seeds, campaign order, carryover, outcomes and score are server-owned. */
export function verifyMaltlineCabinetProof(value: unknown, expectedChallenge: MaltlineCabinetChallenge, expectedVersion?: MaltlineCabinetGameVersion): VerifiedMaltlineCabinetProof {
  assertMaltlineCabinetAuthority();
  const proof = parse(value, expectedChallenge, expectedVersion);
  const { summary } = execute(proof);
  return { proof, summary, canonicalJson: canonicalJson({ proof, summary } as unknown as CanonicalValue) };
}

/** Reduce local v3 replays to a challenge-bound proof. The legacy default is stable; current callers pass their version explicitly. */
export function buildMaltlineCabinetProof(
  replays: readonly MaltlineCabinetReplay[],
  expectedChallenge: MaltlineCabinetChallenge,
  gameVersion: MaltlineCabinetGameVersion = 'cabinet-1',
): MaltlineCabinetProof {
  if (replays.length < 1 || replays.length > MALTLINE_CABINET_LIMITS.maximumStages) fail('Cabinet replay stage count is invalid.');
  const authority = resolveMaltlineCabinetAuthority(gameVersion);
  if (authority === null) fail('Unsupported Maltline cabinet proof authority or version.');
  let totalTicks = 0;
  const stages = replays.map((replay, index) => {
    if (replay.version !== 3 || replay.controlMode !== authority.controlMode) fail('Expected a cabinet v3 replay.');
    if (canonicalJson(replay.scenario as unknown as CanonicalValue)
      !== canonicalJson(authority.campaign[index]! as unknown as CanonicalValue)) fail('Cabinet replay scenario does not match authority.');
    if (replay.ticks.length < 1 || replay.ticks.length > MALTLINE_CABINET_LIMITS.maximumStageTicks) fail('Cabinet replay tick count is invalid.');
    totalTicks += replay.ticks.length;
    if (totalTicks > MALTLINE_CABINET_LIMITS.maximumTotalTicks) fail('Cabinet replay exceeds total tick limit.');
    const inputRuns: MaltlineCabinetInputRun[] = [];
    for (const [tickIndex, tick] of replay.ticks.entries()) {
      if (tick.tick !== tickIndex + 1) fail('Cabinet replay ticks must be sequential.');
      const input = normalizeMaltlineInput(tick.input);
      const previous = inputRuns.at(-1);
      if (previous && sameInput(previous, input)) previous.ticks++;
      else inputRuns.push({ ticks: 1, ...input });
    }
    return { stageId: replay.scenario.id, inputRuns };
  });
  assertMaltlineCabinetAuthority();
  const proof = parse({ version: 1, gameId: 'maltline', gameVersion: authority.gameVersion,
    authorityId: authority.authorityId, challenge: expectedChallenge, stages }, expectedChallenge);
  const { finals } = execute(proof);
  for (const [index, replay] of replays.entries()) {
    const expectedRun = index === 0 ? authority.initialRun : { score: finals[index - 1]!.score, lives: finals[index - 1]!.lives };
    if (canonicalJson({ ...replay.run }) !== canonicalJson(expectedRun)
      || canonicalJson(replay.finalState as unknown as CanonicalValue) !== canonicalJson(finals[index]! as unknown as CanonicalValue)) {
      fail('Cabinet replay state or carryover does not match authoritative execution.');
    }
  }
  return proof;
}

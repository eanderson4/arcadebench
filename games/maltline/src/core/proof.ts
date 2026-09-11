import { MaltlineEngine } from './engine';
import {
  resolveVerifiedMaltlineAuthority,
  type MaltlineAuthorityIdentity,
  type MaltlineCampaignAuthority,
} from './authority';
import { canonicalJson, sha256Canonical, type CanonicalValue } from './fingerprint';
import { normalizeMaltlineInput } from './input';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
  type NormalizedRunContext,
} from './scenario';
import type { EpisodeStatus, MaltlineInput, MaltlineScenario, RunContext } from './types';
import {
  MALTLINE_CAMPAIGN_GENERATION,
  MALTLINE_GAME_ID,
  MALTLINE_PROOF_VERSION,
  MALTLINE_RULESET_VERSION,
} from './version';
export {
  MAX_MALTLINE_PROOF_INPUT_RUNS,
  MAX_MALTLINE_PROOF_STAGES,
  MAX_MALTLINE_PROOF_STAGE_TICKS,
  MAX_MALTLINE_PROOF_TOTAL_TICKS,
  MALTLINE_RANKED_RESOURCE_LIMITS,
} from './ranked-resource-limits';
import {
  MAX_MALTLINE_PROOF_INPUT_RUNS,
  MAX_MALTLINE_PROOF_STAGES,
  MAX_MALTLINE_PROOF_STAGE_TICKS,
  MAX_MALTLINE_PROOF_TOTAL_TICKS,
  MALTLINE_RANKED_RESOURCE_LIMITS,
} from './ranked-resource-limits';

export {
  MALTLINE_CAMPAIGN_GENERATION,
  MALTLINE_GAME_ID,
  MALTLINE_PROOF_VERSION,
  MALTLINE_RULESET_VERSION,
} from './version';

/** Envelope v3 names the fixed-campaign submission binding correctly as a nonce. */
export const MALTLINE_PROOF_ENVELOPE_VERSION = 3 as const;
export interface MaltlineInputRun extends MaltlineInput {
  ticks: number;
}

export interface MaltlineProofStage {
  stageId: string;
  inputRuns: MaltlineInputRun[];
}

/** Ranked proof: inputs only. All game parameters and outcomes are server-owned. */
export interface MaltlineRunProof {
  version: 1;
  rulesetVersion: typeof MALTLINE_RULESET_VERSION;
  campaignGeneration: typeof MALTLINE_CAMPAIGN_GENERATION;
  stages: MaltlineProofStage[];
}

export interface MaltlineProofLimits {
  maximumInputRuns: number;
  maximumStageTicks: number;
  maximumTotalTicks: number;
}

export interface MaltlineVerifierContext {
  rulesetVersion: typeof MALTLINE_RULESET_VERSION;
  campaignGeneration: typeof MALTLINE_CAMPAIGN_GENERATION;
  /** Trusted, ordered campaign selected by the server challenge. */
  campaign: readonly MaltlineScenario[];
  /** Trusted initial lives and score selected by the server challenge. */
  initialRun: Readonly<RunContext>;
  /** Optional stricter server limits; values cannot exceed the hard protocol caps. */
  limits?: Partial<MaltlineProofLimits>;
}

export interface VerifiedMaltlineStage {
  stageId: string;
  status: Exclude<EpisodeStatus, 'running'>;
  ticks: number;
  score: number;
  scoreGained: number;
  lives: number;
  fulfilled: number;
  serviceActions: number;
  walkouts: number;
  resolved: number;
  exited: number;
}

export interface VerifiedMaltlineSummary {
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

export interface VerifiedMaltlineProof {
  /** Strictly parsed proof with adjacent identical inputs merged. */
  proof: MaltlineRunProof;
  /** Values derived only from authoritative engine execution. */
  summary: VerifiedMaltlineSummary;
  stages: VerifiedMaltlineStage[];
}

export interface MaltlineChallengeIdentity {
  runId: string;
  seasonId: string;
  boardId: 'arcade';
  /**
   * Server-minted submission binding. It does not affect gameplay, establish
   * proof freshness, or prove that a human played after challenge issuance.
   */
  nonce: number;
}

/** Server-minted challenge. Its authority member must resolve in the local registry. */
export interface MaltlineServerChallenge extends MaltlineChallengeIdentity {
  authority: MaltlineAuthorityIdentity;
}

export interface MaltlineProofEnvelope {
  envelopeVersion: typeof MALTLINE_PROOF_ENVELOPE_VERSION;
  authority: MaltlineAuthorityIdentity;
  challenge: MaltlineChallengeIdentity;
  proof: MaltlineRunProof;
  summary: VerifiedMaltlineSummary;
}

export interface HashedMaltlineProof {
  envelope: MaltlineProofEnvelope;
  canonicalJson: string;
  sha256: string;
}

/** @internal Shared only with the deterministic playback factory. */
export interface MaltlineVerifiedEnvelopeDetailsForPlayback {
  verification: HashedMaltlineProof;
  authority: MaltlineCampaignAuthority;
  stages: readonly VerifiedMaltlineStage[];
}

export class MaltlineProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaltlineProofError';
  }
}

const SCENARIO_KEYS = [
  'id',
  'name',
  'ticksPerSecond',
  'lanes',
  'laneLength',
  'stations',
  'jarPoolSize',
  'blendTicks',
  'washTicks',
  'drinkTicks',
  'customerCount',
  'spawnIntervalTicks',
  'spawnAccelerationTicks',
  'spawnIntervalFloorTicks',
  'marchSpeed',
  'leaveSpeed',
  'slideSpeed',
  'returnSpeed',
  'resumeExitThreshold',
  'stationRepeatTicks',
  'laneRepeatTicks',
  'lives',
  'seed',
] as const;

function requiredExactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MaltlineProofError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new MaltlineProofError(`${label} must be a plain object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    throw new MaltlineProofError(`${label} must not contain symbol keys.`);
  }
  const actual = ownKeys as string[];
  const allowed = new Set(keys);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new MaltlineProofError(`${label} must contain exactly: ${keys.join(', ')}.`);
  }
  const safe: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new MaltlineProofError(`${label}.${key} must be an enumerable data property.`);
    }
    safe[key] = descriptor.value;
  }
  return safe;
}

function positiveBoundedInteger(value: unknown, maximum: number, label: string): number {
  if (typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > maximum) {
    throw new MaltlineProofError(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function requiredBoundedArray(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new MaltlineProofError(`${label} length is invalid.`);
  }
  const expectedKeys = new Set<PropertyKey>([
    ...Array.from({ length: value.length }, (_unused, index) => String(index)),
    'length',
  ]);
  if (Reflect.ownKeys(value).some((key) => !expectedKeys.has(key))) {
    throw new MaltlineProofError(`${label} contains unsupported properties.`);
  }
  return Array.from({ length: value.length }, (_unused, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new MaltlineProofError(`${label} item ${index + 1} must be an enumerable data property.`);
    }
    return descriptor.value;
  });
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum) {
    throw new MaltlineProofError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function sanitizeInputRun(value: unknown, maximumTicks: number, label: string): MaltlineInputRun {
  const record = requiredExactObject(
    value,
    ['ticks', 'stationDir', 'laneDir', 'blend', 'serve'],
    label,
  );
  const values: Record<string, unknown> = {};
  for (const key of ['ticks', 'stationDir', 'laneDir', 'blend', 'serve'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new MaltlineProofError(`${label}.${key} must be an enumerable data property.`);
    }
    values[key] = descriptor.value;
  }

  let input: Readonly<MaltlineInput>;
  try {
    input = normalizeMaltlineInput({
      stationDir: values.stationDir,
      laneDir: values.laneDir,
      blend: values.blend,
      serve: values.serve,
    }, label);
  } catch (error) {
    const detail = error instanceof Error ? error.message : `${label} is invalid`;
    throw new MaltlineProofError(`${detail}.`);
  }
  return {
    ticks: positiveBoundedInteger(values.ticks, maximumTicks, `${label}.ticks`),
    ...input,
  };
}

function sameInput(first: MaltlineInputRun, second: MaltlineInputRun): boolean {
  return first.stationDir === second.stationDir
    && first.laneDir === second.laneDir
    && first.blend === second.blend
    && first.serve === second.serve;
}

function appendCanonicalRun(target: MaltlineInputRun[], run: MaltlineInputRun): void {
  const previous = target.at(-1);
  if (previous && sameInput(previous, run)) {
    previous.ticks += run.ticks;
  } else {
    target.push({ ...run });
  }
}

function resolveLimit(
  candidate: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string,
): number {
  if (candidate === undefined) return fallback;
  return positiveBoundedInteger(candidate, hardMaximum, label);
}

function resolveLimits(value: Partial<MaltlineProofLimits> | undefined): MaltlineProofLimits {
  if (value !== undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new MaltlineProofError('Verifier proof limits must be an object.');
    }
    const supported = new Set(['maximumInputRuns', 'maximumStageTicks', 'maximumTotalTicks']);
    if (Object.keys(value).some((key) => !supported.has(key))) {
      throw new MaltlineProofError('Verifier proof limits contain unsupported fields.');
    }
  }
  return {
    maximumInputRuns: resolveLimit(
      value?.maximumInputRuns,
      MAX_MALTLINE_PROOF_INPUT_RUNS,
      MAX_MALTLINE_PROOF_INPUT_RUNS,
      'maximumInputRuns',
    ),
    maximumStageTicks: resolveLimit(
      value?.maximumStageTicks,
      MAX_MALTLINE_PROOF_STAGE_TICKS,
      MAX_MALTLINE_PROOF_STAGE_TICKS,
      'maximumStageTicks',
    ),
    maximumTotalTicks: resolveLimit(
      value?.maximumTotalTicks,
      MAX_MALTLINE_PROOF_TOTAL_TICKS,
      MAX_MALTLINE_PROOF_TOTAL_TICKS,
      'maximumTotalTicks',
    ),
  };
}

function sharedScenarioNormalization(value: Record<string, unknown>, label: string): NormalizedMaltlineScenario {
  try {
    return normalizeMaltlineScenario(value as unknown as MaltlineScenario);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'scenario is invalid';
    throw new MaltlineProofError(`${label}: ${detail}`);
  }
}

function rankedMaximum(value: number, maximum: number, label: string): void {
  if (value > maximum) {
    throw new MaltlineProofError(`${label} exceeds the ranked maximum of ${maximum}.`);
  }
}

function enforceRankedScenarioPolicy(
  scenario: NormalizedMaltlineScenario,
  label: string,
): void {
  const limits = MALTLINE_RANKED_RESOURCE_LIMITS;
  rankedMaximum(
    scenario.ticksPerSecond,
    limits.maximumTicksPerSecond,
    `${label} scenario.ticksPerSecond`,
  );
  rankedMaximum(scenario.lanes, limits.maximumLanes, `${label} scenario.lanes`);
  rankedMaximum(scenario.laneLength, limits.maximumLaneLength, `${label} scenario.laneLength`);
  rankedMaximum(scenario.jarPoolSize, limits.maximumJarPoolSize, `${label} scenario.jarPoolSize`);
  for (const field of ['blendTicks', 'washTicks', 'drinkTicks'] as const) {
    rankedMaximum(scenario[field], limits.maximumWorkTicks, `${label} scenario.${field}`);
  }
  if (scenario.customerCount < limits.minimumCustomerCount) {
    throw new MaltlineProofError(
      `${label} scenario.customerCount is below the ranked minimum of ${limits.minimumCustomerCount}.`,
    );
  }
  rankedMaximum(
    scenario.customerCount,
    limits.maximumCustomerCount,
    `${label} scenario.customerCount`,
  );
  for (const field of [
    'spawnIntervalTicks',
    'spawnAccelerationTicks',
    'spawnIntervalFloorTicks',
  ] as const) {
    rankedMaximum(scenario[field], limits.maximumSpawnTicks, `${label} scenario.${field}`);
  }
  for (const field of ['marchSpeed', 'leaveSpeed', 'slideSpeed', 'returnSpeed'] as const) {
    rankedMaximum(scenario[field], limits.maximumMovementSpeed, `${label} scenario.${field}`);
  }
  for (const field of ['stationRepeatTicks', 'laneRepeatTicks'] as const) {
    rankedMaximum(scenario[field], limits.maximumInputRepeatTicks, `${label} scenario.${field}`);
  }
  rankedMaximum(scenario.lives, limits.maximumLives, `${label} scenario.lives`);
}

function normalizeScenario(value: unknown, index: number): NormalizedMaltlineScenario {
  const label = `Verifier campaign stage ${index + 1}`;
  const source = requiredExactObject(value, SCENARIO_KEYS, label);
  const normalized = sharedScenarioNormalization(source, label);
  enforceRankedScenarioPolicy(normalized, label);
  return normalized;
}

interface NormalizedVerifierContext {
  campaign: readonly NormalizedMaltlineScenario[];
  initialRun: NormalizedRunContext;
  limits: MaltlineProofLimits;
}

function normalizeInitialRun(
  value: unknown,
  firstScenario: NormalizedMaltlineScenario,
): NormalizedRunContext {
  const source = requiredExactObject(value, ['lives', 'score'], 'Verifier initial run');
  let normalized: NormalizedRunContext;
  try {
    normalized = normalizeMaltlineRunContext(source as unknown as RunContext, firstScenario);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'run context is invalid';
    throw new MaltlineProofError(`Verifier initial run ${detail.replace(/^run\./u, '')}`);
  }
  const limits = MALTLINE_RANKED_RESOURCE_LIMITS;
  if (normalized.lives < 1 || normalized.lives > limits.maximumLives) {
    throw new MaltlineProofError(
      `Verifier initial run lives must be from 1 to the ranked maximum of ${limits.maximumLives}.`,
    );
  }
  if (normalized.score > limits.maximumInitialScore) {
    throw new MaltlineProofError(
      `Verifier initial run score exceeds the ranked maximum of ${limits.maximumInitialScore}.`,
    );
  }
  return normalized;
}

function normalizeContext(contextValue: MaltlineVerifierContext): NormalizedVerifierContext {
  if (!contextValue || typeof contextValue !== 'object' || Array.isArray(contextValue)) {
    throw new MaltlineProofError('Verifier context must be an object.');
  }
  const context = contextValue as unknown as Record<string, unknown>;
  const requiredKeys = ['rulesetVersion', 'campaignGeneration', 'campaign', 'initialRun'];
  const supportedKeys = new Set([...requiredKeys, 'limits']);
  if (requiredKeys.some((key) => !Object.hasOwn(context, key))
    || Object.keys(context).some((key) => !supportedKeys.has(key))) {
    throw new MaltlineProofError('Verifier context contains missing or unsupported fields.');
  }
  if (context.rulesetVersion !== MALTLINE_RULESET_VERSION
    || context.campaignGeneration !== MALTLINE_CAMPAIGN_GENERATION) {
    throw new MaltlineProofError('Verifier ruleset or campaign generation is unsupported.');
  }
  if (!Array.isArray(context.campaign)
    || context.campaign.length < 1
    || context.campaign.length > MAX_MALTLINE_PROOF_STAGES) {
    throw new MaltlineProofError('Verifier campaign length is invalid.');
  }
  const stageIds = new Set<string>();
  const campaign = context.campaign.map((scenario, index) => normalizeScenario(scenario, index));
  for (const scenario of campaign) {
    if (stageIds.has(scenario.id)) {
      throw new MaltlineProofError('Verifier campaign stage identifiers are invalid.');
    }
    stageIds.add(scenario.id);
  }
  return {
    campaign: Object.freeze(campaign),
    initialRun: normalizeInitialRun(context.initialRun, campaign[0]!),
    limits: resolveLimits(context.limits as Partial<MaltlineProofLimits> | undefined),
  };
}

/**
 * Strictly verifies an untrusted, input-only proof against server-owned
 * campaign context. No submitted value can select simulation parameters or an
 * outcome; every summary field below comes from replaying the engine.
 */
export function verifyMaltlineProofWithContextForTesting(
  value: unknown,
  context: MaltlineVerifierContext,
): VerifiedMaltlineProof {
  const normalizedContext = normalizeContext(context);
  const { limits } = normalizedContext;
  const source = requiredExactObject(
    value,
    ['version', 'rulesetVersion', 'campaignGeneration', 'stages'],
    'Maltline proof',
  );
  if (source.version !== MALTLINE_PROOF_VERSION) {
    throw new MaltlineProofError('Maltline proof version is unsupported.');
  }
  if (source.rulesetVersion !== MALTLINE_RULESET_VERSION
    || source.campaignGeneration !== MALTLINE_CAMPAIGN_GENERATION) {
    throw new MaltlineProofError('Maltline proof ruleset or campaign generation is unsupported.');
  }
  const sourceStages = requiredBoundedArray(
    source.stages,
    1,
    normalizedContext.campaign.length,
    'Maltline proof stage count',
  );

  const canonicalStages: MaltlineProofStage[] = [];
  const verifiedStages: VerifiedMaltlineStage[] = [];
  let run: RunContext = { ...normalizedContext.initialRun };
  let inputRunCount = 0;
  let totalTicks = 0;
  let totalFulfilled = 0;
  let totalServiceActions = 0;
  let totalWalkouts = 0;
  let totalResolved = 0;
  let totalExited = 0;

  for (let stageIndex = 0; stageIndex < sourceStages.length; stageIndex++) {
    if (verifiedStages.at(-1)?.status === 'lost') {
      throw new MaltlineProofError('Maltline proof continues after a lost stage.');
    }
    const stageValue = requiredExactObject(
      sourceStages[stageIndex],
      ['stageId', 'inputRuns'],
      `Maltline proof stage ${stageIndex + 1}`,
    );
    const expectedScenario = normalizedContext.campaign[stageIndex]!;
    if (stageValue.stageId !== expectedScenario.id) {
      throw new MaltlineProofError(`Maltline proof stage ${stageIndex + 1} is missing or out of order.`);
    }
    const inputRuns = requiredBoundedArray(
      stageValue.inputRuns,
      1,
      MAX_MALTLINE_PROOF_INPUT_RUNS,
      `Maltline proof stage ${stageIndex + 1} input runs`,
    );
    inputRunCount += inputRuns.length;
    if (inputRunCount > limits.maximumInputRuns) {
      throw new MaltlineProofError('Maltline proof has too many input runs.');
    }

    const engine = new MaltlineEngine(expectedScenario, run);
    let state = engine.snapshot();
    const canonicalRuns: MaltlineInputRun[] = [];
    let stageTicks = 0;
    for (let inputRunIndex = 0; inputRunIndex < inputRuns.length; inputRunIndex++) {
      const inputRun = sanitizeInputRun(
        inputRuns[inputRunIndex],
        limits.maximumStageTicks,
        `Maltline proof stage ${stageIndex + 1} input run ${inputRunIndex + 1}`,
      );
      if (stageTicks + inputRun.ticks > limits.maximumStageTicks) {
        throw new MaltlineProofError(`Maltline proof stage ${stageIndex + 1} exceeds its tick limit.`);
      }
      if (totalTicks + inputRun.ticks > limits.maximumTotalTicks) {
        throw new MaltlineProofError('Maltline proof exceeds its total tick limit.');
      }
      appendCanonicalRun(canonicalRuns, inputRun);

      const input: MaltlineInput = {
        stationDir: inputRun.stationDir,
        laneDir: inputRun.laneDir,
        blend: inputRun.blend,
        serve: inputRun.serve,
      };
      for (let repetition = 0; repetition < inputRun.ticks; repetition++) {
        if (state.status !== 'running') {
          throw new MaltlineProofError(`Maltline proof has input after stage ${stageIndex + 1} ended.`);
        }
        engine.setInput(input);
        state = engine.step().state;
        stageTicks++;
        totalTicks++;
      }
    }

    const finalState = state;
    if (finalState.status === 'running') {
      throw new MaltlineProofError(`Maltline proof stage ${stageIndex + 1} is a nonterminal prefix.`);
    }
    const stage: VerifiedMaltlineStage = {
      stageId: expectedScenario.id,
      status: finalState.status,
      ticks: finalState.tick,
      score: finalState.score,
      scoreGained: finalState.score - run.score,
      lives: finalState.lives,
      fulfilled: finalState.fulfilled,
      serviceActions: finalState.serviceActions,
      walkouts: finalState.walkouts,
      resolved: finalState.resolved,
      exited: finalState.exited,
    };
    verifiedStages.push(stage);
    canonicalStages.push({ stageId: expectedScenario.id, inputRuns: canonicalRuns });
    totalFulfilled += stage.fulfilled;
    totalServiceActions += stage.serviceActions;
    totalWalkouts += stage.walkouts;
    totalResolved += stage.resolved;
    totalExited += stage.exited;
    run = { lives: finalState.lives, score: finalState.score };
  }

  const lastStage = verifiedStages.at(-1)!;
  const completed = verifiedStages.length === normalizedContext.campaign.length && lastStage.status === 'won';
  if (lastStage.status === 'won' && !completed) {
    throw new MaltlineProofError('Maltline proof is missing the next campaign stage.');
  }

  return {
    proof: {
      version: MALTLINE_PROOF_VERSION,
      rulesetVersion: MALTLINE_RULESET_VERSION,
      campaignGeneration: MALTLINE_CAMPAIGN_GENERATION,
      stages: canonicalStages,
    },
    summary: {
      score: lastStage.score,
      lives: lastStage.lives,
      stageReached: verifiedStages.length,
      stagesCleared: verifiedStages.filter((stage) => stage.status === 'won').length,
      completed,
      totalTicks,
      fulfilled: totalFulfilled,
      serviceActions: totalServiceActions,
      walkouts: totalWalkouts,
      resolved: totalResolved,
      exited: totalExited,
    },
    stages: verifiedStages,
  };
}

/** Encodes trusted local inputs into the canonical wire representation. */
export function encodeMaltlineInputRuns(inputs: readonly MaltlineInput[]): MaltlineInputRun[] {
  const runs: MaltlineInputRun[] = [];
  for (let index = 0; index < inputs.length; index++) {
    const input = normalizeMaltlineInput(inputs[index], `Maltline input ${index + 1}`);
    const run = sanitizeInputRun(
      { ticks: 1, ...input },
      MAX_MALTLINE_PROOF_STAGE_TICKS,
      `Maltline input ${index + 1}`,
    );
    appendCanonicalRun(runs, run);
  }
  return runs;
}

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new MaltlineProofError(`${label} is invalid.`);
  }
  return value;
}

function normalizeAuthorityIdentity(value: unknown): MaltlineAuthorityIdentity {
  const authority = requiredExactObject(
    value,
    ['gameId', 'rulesetVersion', 'campaignGeneration', 'configurationSha256'],
    'Maltline challenge authority',
  );
  if (authority.gameId !== MALTLINE_GAME_ID
    || authority.rulesetVersion !== MALTLINE_RULESET_VERSION
    || authority.campaignGeneration !== MALTLINE_CAMPAIGN_GENERATION
    || typeof authority.configurationSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(authority.configurationSha256)) {
    throw new MaltlineProofError('Maltline challenge authority is unsupported.');
  }
  return {
    gameId: MALTLINE_GAME_ID,
    rulesetVersion: MALTLINE_RULESET_VERSION,
    campaignGeneration: MALTLINE_CAMPAIGN_GENERATION,
    configurationSha256: authority.configurationSha256,
  };
}

function normalizeChallenge(value: unknown): MaltlineServerChallenge {
  const challenge = requiredExactObject(
    value,
    ['runId', 'seasonId', 'boardId', 'nonce', 'authority'],
    'Maltline challenge identity',
  );
  if (challenge.boardId !== 'arcade') {
    throw new MaltlineProofError('Maltline challenge board is unsupported.');
  }
  return {
    runId: boundedIdentifier(challenge.runId, 'Maltline challenge run ID'),
    seasonId: boundedIdentifier(challenge.seasonId, 'Maltline challenge season ID'),
    boardId: 'arcade',
    nonce: boundedInteger(challenge.nonce, 0, 0xffff_ffff, 'Maltline challenge nonce'),
    authority: normalizeAuthorityIdentity(challenge.authority),
  };
}

function deepFreezeEnvelope<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreezeEnvelope(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function createMaltlineProofEnvelope(
  verified: VerifiedMaltlineProof,
  challenge: MaltlineServerChallenge,
): MaltlineProofEnvelope {
  return deepFreezeEnvelope({
    envelopeVersion: MALTLINE_PROOF_ENVELOPE_VERSION,
    authority: { ...challenge.authority },
    challenge: {
      runId: challenge.runId,
      seasonId: challenge.seasonId,
      boardId: challenge.boardId,
      nonce: challenge.nonce,
    },
    proof: structuredClone(verified.proof),
    summary: { ...verified.summary },
  });
}

/** Shared implementation keeps public proof and playback verification identical. */
async function verifyAndHashMaltlineProofDetailed(
  proofValue: unknown,
  challengeValue: unknown,
): Promise<MaltlineVerifiedEnvelopeDetailsForPlayback> {
  const challenge = normalizeChallenge(challengeValue);
  const authority = await resolveVerifiedMaltlineAuthority(challenge.authority);
  if (authority === undefined) {
    throw new MaltlineProofError('Maltline challenge authority is not registered.');
  }
  const verified = verifyMaltlineProofWithContextForTesting(proofValue, {
    rulesetVersion: authority.identity.rulesetVersion,
    campaignGeneration: authority.identity.campaignGeneration,
    campaign: authority.campaign,
    initialRun: authority.initialRun,
  });
  const envelope = createMaltlineProofEnvelope(verified, challenge);
  const serialized = canonicalJson(envelope as unknown as CanonicalValue);
  const sha256 = await sha256Canonical(envelope as unknown as CanonicalValue);
  const verification = Object.freeze({ envelope, canonicalJson: serialized, sha256 });
  return Object.freeze({
    verification,
    authority,
    stages: deepFreezeEnvelope(structuredClone(verified.stages)),
  });
}

/**
 * The sole public submission verification boundary: resolve trusted authority,
 * replay untrusted inputs, construct the retained envelope, and hash the same bytes.
 */
export async function verifyAndHashMaltlineProof(
  proofValue: unknown,
  challengeValue: unknown,
): Promise<HashedMaltlineProof> {
  return (await verifyAndHashMaltlineProofDetailed(proofValue, challengeValue)).verification;
}

/** @internal Re-verifies retained data and keeps playback-only details private from the root API. */
export async function verifyAndHashMaltlineProofEnvelopeForPlaybackInternal(
  envelopeValue: unknown,
): Promise<MaltlineVerifiedEnvelopeDetailsForPlayback> {
  const source = requiredExactObject(
    envelopeValue,
    ['envelopeVersion', 'authority', 'challenge', 'proof', 'summary'],
    'Maltline retained proof envelope',
  );
  if (source.envelopeVersion !== MALTLINE_PROOF_ENVELOPE_VERSION) {
    throw new MaltlineProofError('Maltline retained proof envelope version is unsupported.');
  }
  const challenge = requiredExactObject(
    source.challenge,
    ['runId', 'seasonId', 'boardId', 'nonce'],
    'Maltline retained proof challenge',
  );
  const details = await verifyAndHashMaltlineProofDetailed(source.proof, {
    ...challenge,
    authority: source.authority,
  });
  let retainedCanonical: string;
  try {
    retainedCanonical = canonicalJson(envelopeValue as CanonicalValue);
  } catch (error) {
    throw new MaltlineProofError(
      error instanceof Error
        ? `Maltline retained proof envelope is not canonical data: ${error.message}`
        : 'Maltline retained proof envelope is not canonical data.',
    );
  }
  if (retainedCanonical !== details.verification.canonicalJson) {
    throw new MaltlineProofError('Maltline retained proof envelope does not match its verified outcome.');
  }
  return details;
}

/**
 * Re-verifies a retained public envelope from its input-only proof and embedded
 * challenge, then requires every retained byte-level value to match the newly
 * derived canonical envelope.
 */
export async function verifyAndHashMaltlineProofEnvelope(
  envelopeValue: unknown,
): Promise<HashedMaltlineProof> {
  return (await verifyAndHashMaltlineProofEnvelopeForPlaybackInternal(envelopeValue)).verification;
}

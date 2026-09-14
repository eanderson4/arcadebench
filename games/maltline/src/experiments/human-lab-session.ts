import { normalizeMaltlineInput } from '../core/input';
import type { MaltlineInput, RunContext } from '../core/types';
import type {
  P108HumanLabInteractionCounts,
  P108HumanLabLossReasons,
} from './human-lab-observation';
import {
  createP108HumanLabParticipant,
  normalizeP108HumanLabConsentEvidence,
  normalizeP108HumanLabParticipant,
  normalizeP108HumanLabStudyAssignment,
  type P108HumanLabConsentEvidence,
  type P108HumanLabParticipant,
  type P108HumanLabStudyAssignment,
} from './human-lab-study';
import {
  normalizeP108HumanLabTimingSnapshot,
  type P108HumanLabTimingSnapshot,
} from './human-lab-timing';
import type { P108CanonicalLabCandidateId } from './p1-08-candidates';

export const P108_HUMAN_LAB_ARTIFACT_KIND = 'maltline-human-lab-session' as const;
export const P108_HUMAN_LAB_TEST_DRIVER_ARTIFACT_KIND = 'maltline-human-lab-test-driver-session' as const;
export const P108_HUMAN_LAB_SCHEMA_VERSION = 3 as const;
export const P108_HUMAN_LAB_EXPERIMENT_REVISION = 12 as const;
export type {
  P108HumanLabConsentEvidence,
  P108HumanLabParticipant,
  P108HumanLabStudyAssignment,
} from './human-lab-study';
export type P108AssignmentOrder = readonly [P108CanonicalLabCandidateId, P108CanonicalLabCandidateId];
export type P108LabExecutionMode = 'human' | 'test-driver';
export type P108LabPhase = 'welcome' | 'practice' | 'round1' | 'stage-pulse' | 'intermission'
  | 'round2' | 'comparison' | 'frozen' | 'debrief';
export type P108RoundChoice = 1 | 2 | 'same';
export type P108LabPacing = 'too-idle' | 'balanced' | 'too-relentless';
export type P108LabJarExperience = 'planning' | 'waiting' | 'both' | 'neither';
export type P108LabObservationMode = 'engine-observed' | 'test-driver-synthetic';

export interface P108LabEntryEnvironment {
  viewportCssWidth: number;
  viewportCssHeight: number;
  devicePixelRatio: number;
  reducedMotion: boolean;
}
export interface P108LabSourceAuthorityProvenance {
  identity: {
    gameId: string;
    rulesetVersion: number;
    campaignGeneration: number;
    configurationSha256: string;
  };
  verifiedConfigurationSha256: string;
}
export interface P108LabScenarioProvenance {
  id: string;
  fingerprint: string;
}
export type P108LabScenarioProvenanceTuple = readonly [
  P108LabScenarioProvenance, P108LabScenarioProvenance, P108LabScenarioProvenance,
  P108LabScenarioProvenance, P108LabScenarioProvenance, P108LabScenarioProvenance,
  P108LabScenarioProvenance, P108LabScenarioProvenance,
];
export interface P108LabCandidateProvenance {
  candidateId: P108CanonicalLabCandidateId;
  seedOffset: 0;
  candidateFingerprint: string;
  effectiveCampaignFingerprint: string;
  scenarios: P108LabScenarioProvenanceTuple;
}
export interface P108HumanLabProvenance {
  assignmentTokenSha256: string;
  entryEnvironment: P108LabEntryEnvironment;
  sourceAuthority: P108LabSourceAuthorityProvenance;
  candidates: readonly [P108LabCandidateProvenance, P108LabCandidateProvenance];
}
export interface P108HumanLabCreation {
  assignmentOrder: P108AssignmentOrder;
  executionMode: P108LabExecutionMode;
  provenance: P108HumanLabProvenance;
  studyAssignment: P108HumanLabStudyAssignment;
}

export interface P108LabStageRecord {
  stage: number;
  status: 'won' | 'lost';
  observationMode: P108LabObservationMode;
  scenarioId: string;
  startingRun: Readonly<RunContext>;
  ticks: number;
  inputSamples: number;
  score: number;
  scoreDelta: number;
  lives: number;
  serviceActions: number;
  fulfilled: number;
  walkouts: number;
  resolved: number;
  exited: number;
  lossReasons: P108HumanLabLossReasons;
  interactionCounts: P108HumanLabInteractionCounts;
}
export interface P108LabRoundRecord {
  round: 1 | 2;
  candidateId: P108CanonicalLabCandidateId;
  initialRun: Readonly<RunContext>;
  candidateExposure: 'none' | 'partial' | 'full';
  stages: readonly P108LabStageRecord[];
  stagePulses: readonly P108LabStagePulse[];
}
export interface P108LabStagePulse {
  round: 1 | 2;
  stage: number;
  terminalStatus: 'won' | 'lost';
  perceivedPressure: number;
  pacing: P108LabPacing;
  hardestDecision: string | null;
  lossExplanation: string | null;
}
export interface P108LabRoundComparison {
  round: 1 | 2;
  jarExperience: P108LabJarExperience;
  recoveryPossible: number;
}
export interface P108LabComparison {
  clearerRamp: P108RoundChoice;
  fairer: P108RoundChoice;
  moreEnjoyable: P108RoundChoice;
  rounds: readonly [P108LabRoundComparison, P108LabRoundComparison];
  scoreBelief: string;
}
export interface P108HumanLabArtifact {
  kind: typeof P108_HUMAN_LAB_ARTIFACT_KIND | typeof P108_HUMAN_LAB_TEST_DRIVER_ARTIFACT_KIND;
  schemaVersion: typeof P108_HUMAN_LAB_SCHEMA_VERSION;
  experimentId: 'EXP-049';
  experimentRevision: typeof P108_HUMAN_LAB_EXPERIMENT_REVISION;
  policy: {
    rankEligibility: 'unranked'; authorityRegistration: null; seasonId: null; submission: 'forbidden';
  };
  executionMode: P108LabExecutionMode;
  assignmentOrder: P108AssignmentOrder;
  studyAssignment: P108HumanLabStudyAssignment;
  participant: P108HumanLabParticipant;
  consentEvidence: P108HumanLabConsentEvidence;
  provenance: P108HumanLabProvenance;
  timing: P108HumanLabTimingSnapshot;
  practice: { initialRun: Readonly<RunContext>; stages: readonly P108LabStageRecord[] };
  rounds: readonly [P108LabRoundRecord, P108LabRoundRecord];
  comparison: P108LabComparison;
}

interface MutableRound extends Omit<P108LabRoundRecord, 'candidateExposure'> {
  candidateExposure: 'pending' | 'none' | 'partial' | 'full';
}
export interface P108HumanLabState {
  phase: P108LabPhase;
  executionMode: P108LabExecutionMode;
  assignmentOrder: P108AssignmentOrder;
  studyAssignment: P108HumanLabStudyAssignment;
  participant: P108HumanLabParticipant | null;
  consentEvidence: P108HumanLabConsentEvidence | null;
  provenance: P108HumanLabProvenance;
  activeStage: number | null;
  activeRun: Readonly<RunContext> | null;
  activeTicks: number;
  activeInputSamples: number;
  pendingPulseRound: 1 | 2 | null;
  practiceStages: readonly P108LabStageRecord[];
  rounds: readonly MutableRound[];
  comparison: P108LabComparison | null;
  artifact: P108HumanLabArtifact | null;
}
export type P108HumanLabEvent =
  | { type: 'consent'; participantCode: string; consentEvidence: P108HumanLabConsentEvidence }
  | { type: 'tick'; stage: number; input: MaltlineInput }
  | { type: 'stage-terminal'; stage: number; status: 'won' | 'lost';
    observationMode: P108LabObservationMode; scenarioId: string; score: number; scoreDelta: number;
    lives: number; serviceActions: number; fulfilled: number; walkouts: number; resolved: number;
    exited: number; lossReasons: P108HumanLabLossReasons;
    interactionCounts: P108HumanLabInteractionCounts }
  | { type: 'stage-pulse'; round: 1 | 2; stage: number; perceivedPressure: number;
    pacing: P108LabPacing; hardestDecision: string | null; lossExplanation: string | null }
  | { type: 'begin-round2' }
  | ({ type: 'freeze'; timing: P108HumanLabTimingSnapshot } & P108LabComparison)
  | { type: 'debrief' };

const FRESH_RUN = Object.freeze({ lives: 4, score: 0 });
const FORBIDDEN_KEYS = new Set(['proof', 'envelope', 'challenge', 'nonce', 'scoreId', 'submissionId']);

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Reflect.ownKeys(value);
  const allowed = new Set(keys);
  if (actual.some((key) => typeof key !== 'string' || !allowed.has(key))
    || keys.some((key) => !actual.includes(key))) throw new Error(`${label} contains missing or unsupported fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}
function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a nonnegative safe integer`);
  return value as number;
}
function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = safeInteger(value, label);
  if (number < minimum || number > maximum) throw new Error(`${label} must be ${minimum} through ${maximum}`);
  return number;
}
function exactTuple(value: unknown, length: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length
    || Reflect.ownKeys(value).some((key) => key !== 'length'
      && (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length))) {
    throw new Error(`${label} must contain exactly ${length} entries`);
  }
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label} entries must be enumerable data properties`);
    }
  }
  return value;
}
function exactArray(value: unknown, minimum: number, maximum: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum
    || Reflect.ownKeys(value).some((key) => key !== 'length'
      && (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) {
    throw new Error(`${label} must contain ${minimum} through ${maximum} exact entries`);
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label} entries must be enumerable data properties`);
    }
  }
  return value;
}
function normalizeOptionalText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be a string or null`);
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 280 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${label} must be at most 280 characters without control characters`);
  }
  return normalized;
}
function normalizeRequiredText(value: unknown, label: string): string {
  const normalized = normalizeOptionalText(value, label);
  if (normalized === null) throw new Error(`${label} is required and must be nonblank`);
  return normalized;
}
function normalizeRun(value: unknown, label: string): Readonly<RunContext> {
  const run = exact(value, ['lives', 'score'], label);
  return Object.freeze({ lives: safeInteger(run.lives, `${label}.lives`), score: safeInteger(run.score, `${label}.score`) });
}
function normalizeOrder(value: unknown): P108AssignmentOrder {
  if (!Array.isArray(value) || value.length !== 2
    || Reflect.ownKeys(value).some((key) => key !== '0' && key !== '1' && key !== 'length')) {
    throw new Error('lab assignment order must contain exactly A and D');
  }
  const entries = [0, 1].map((index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error('lab assignment entries must be data properties');
    }
    return descriptor.value;
  });
  if (new Set(entries).size !== 2 || !entries.includes('a-registered-control') || !entries.includes('d-combined')) {
    throw new Error('lab assignment order must contain exactly A and D');
  }
  return Object.freeze(entries) as unknown as P108AssignmentOrder;
}
function normalizeExecutionMode(value: unknown): P108LabExecutionMode {
  if (value !== 'human' && value !== 'test-driver') throw new Error('lab execution mode is invalid');
  return value;
}
function normalizeSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}
function normalizeFingerprint(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new Error(`${label} must be an FNV-1a 64 fingerprint`);
  }
  return value;
}
function positiveSafeInteger(value: unknown, label: string): number {
  const number = safeInteger(value, label);
  if (number === 0) throw new Error(`${label} must be a positive safe integer`);
  return number;
}
function normalizeProvenance(
  value: unknown,
  assignmentOrder: P108AssignmentOrder,
): P108HumanLabProvenance {
  const provenance = exact(value, ['assignmentTokenSha256', 'entryEnvironment',
    'sourceAuthority', 'candidates'], 'lab provenance');
  const environment = exact(provenance.entryEnvironment, ['viewportCssWidth',
    'viewportCssHeight', 'devicePixelRatio', 'reducedMotion'], 'lab provenance.entryEnvironment');
  if (typeof environment.devicePixelRatio !== 'number'
    || !Number.isFinite(environment.devicePixelRatio)
    || environment.devicePixelRatio <= 0 || environment.devicePixelRatio > 16) {
    throw new Error('lab provenance.entryEnvironment.devicePixelRatio must be finite, greater than zero, and at most 16');
  }
  if (typeof environment.reducedMotion !== 'boolean') {
    throw new Error('lab provenance.entryEnvironment.reducedMotion must be boolean');
  }
  const sourceAuthority = exact(provenance.sourceAuthority, ['identity',
    'verifiedConfigurationSha256'], 'lab provenance.sourceAuthority');
  const identity = exact(sourceAuthority.identity, ['gameId', 'rulesetVersion',
    'campaignGeneration', 'configurationSha256'], 'lab provenance.sourceAuthority.identity');
  const gameId = normalizeScenarioId(identity.gameId, 'lab provenance.sourceAuthority.identity.gameId');
  const configurationSha256 = normalizeSha256(identity.configurationSha256,
    'lab provenance.sourceAuthority.identity.configurationSha256');
  const verifiedConfigurationSha256 = normalizeSha256(sourceAuthority.verifiedConfigurationSha256,
    'lab provenance.sourceAuthority.verifiedConfigurationSha256');
  if (configurationSha256 !== verifiedConfigurationSha256) {
    throw new Error('lab provenance source authority digests must match');
  }
  const rawCandidates = exactTuple(provenance.candidates, 2, 'lab provenance.candidates');
  const candidates = rawCandidates.map((candidateValue, candidateIndex) => {
    const label = `lab provenance.candidates[${candidateIndex}]`;
    const candidate = exact(candidateValue, ['candidateId', 'seedOffset', 'candidateFingerprint',
      'effectiveCampaignFingerprint', 'scenarios'], label);
    if (candidate.candidateId !== assignmentOrder[candidateIndex]) {
      throw new Error(`${label}.candidateId must align with assignmentOrder`);
    }
    if (candidate.seedOffset !== 0) throw new Error(`${label}.seedOffset must be zero`);
    const rawScenarios = exactTuple(candidate.scenarios, 8, `${label}.scenarios`);
    const scenarioIds = new Set<string>();
    const scenarios = rawScenarios.map((scenarioValue, scenarioIndex) => {
      const scenarioLabel = `${label}.scenarios[${scenarioIndex}]`;
      const scenario = exact(scenarioValue, ['id', 'fingerprint'], scenarioLabel);
      const id = normalizeScenarioId(scenario.id, `${scenarioLabel}.id`);
      if (scenarioIds.has(id)) throw new Error(`${label}.scenarios must have unique IDs`);
      scenarioIds.add(id);
      return Object.freeze({ id, fingerprint: normalizeFingerprint(scenario.fingerprint,
        `${scenarioLabel}.fingerprint`) });
    });
    return Object.freeze({ candidateId: assignmentOrder[candidateIndex]!, seedOffset: 0 as const,
      candidateFingerprint: normalizeFingerprint(candidate.candidateFingerprint,
        `${label}.candidateFingerprint`),
      effectiveCampaignFingerprint: normalizeFingerprint(candidate.effectiveCampaignFingerprint,
        `${label}.effectiveCampaignFingerprint`), scenarios: Object.freeze(scenarios) });
  });
  return deepFreeze({
    assignmentTokenSha256: normalizeSha256(provenance.assignmentTokenSha256,
      'lab provenance.assignmentTokenSha256'),
    entryEnvironment: {
      viewportCssWidth: positiveSafeInteger(environment.viewportCssWidth,
        'lab provenance.entryEnvironment.viewportCssWidth'),
      viewportCssHeight: positiveSafeInteger(environment.viewportCssHeight,
        'lab provenance.entryEnvironment.viewportCssHeight'),
      devicePixelRatio: environment.devicePixelRatio,
      reducedMotion: environment.reducedMotion,
    },
    sourceAuthority: {
      identity: {
        gameId,
        rulesetVersion: positiveSafeInteger(identity.rulesetVersion,
          'lab provenance.sourceAuthority.identity.rulesetVersion'),
        campaignGeneration: positiveSafeInteger(identity.campaignGeneration,
          'lab provenance.sourceAuthority.identity.campaignGeneration'),
        configurationSha256,
      },
      verifiedConfigurationSha256,
    },
    candidates: Object.freeze(candidates) as unknown as readonly [P108LabCandidateProvenance,
      P108LabCandidateProvenance],
  });
}
function normalizeLossReasons(value: unknown, label: string): P108HumanLabLossReasons {
  const reasons = exact(value, ['walkout', 'shake_smashed', 'jar_smashed'], label);
  return Object.freeze({
    walkout: safeInteger(reasons.walkout, `${label}.walkout`),
    shake_smashed: safeInteger(reasons.shake_smashed, `${label}.shake_smashed`),
    jar_smashed: safeInteger(reasons.jar_smashed, `${label}.jar_smashed`),
  });
}
function normalizeInteractionCounts(value: unknown, label: string): P108HumanLabInteractionCounts {
  const counts = exact(value, ['executedStationMoves', 'executedLaneMoves', 'blendStarts',
    'blendCancels', 'shakeLaunches', 'jarCatches'], label);
  return Object.freeze({
    executedStationMoves: safeInteger(counts.executedStationMoves, `${label}.executedStationMoves`),
    executedLaneMoves: safeInteger(counts.executedLaneMoves, `${label}.executedLaneMoves`),
    blendStarts: safeInteger(counts.blendStarts, `${label}.blendStarts`),
    blendCancels: safeInteger(counts.blendCancels, `${label}.blendCancels`),
    shakeLaunches: safeInteger(counts.shakeLaunches, `${label}.shakeLaunches`),
    jarCatches: safeInteger(counts.jarCatches, `${label}.jarCatches`),
  });
}
function normalizeScenarioId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 100 || value.trim().length === 0
    || !/^[\x20-\x7e]+$/u.test(value)) {
    throw new Error(`${label} must be a nonblank printable string of at most 100 characters`);
  }
  return value;
}
function normalizeStage(
  value: unknown,
  range: readonly [number, number],
  executionMode: P108LabExecutionMode,
  label: string,
): P108LabStageRecord {
  const stage = exact(value, ['stage', 'status', 'observationMode', 'scenarioId', 'startingRun',
    'ticks', 'inputSamples', 'score', 'scoreDelta', 'lives', 'serviceActions', 'fulfilled',
    'walkouts', 'resolved', 'exited', 'lossReasons', 'interactionCounts'], label);
  const number = safeInteger(stage.stage, `${label}.stage`);
  if (number < range[0] || number > range[1]) throw new Error(`${label}.stage is outside its segment`);
  if (stage.status !== 'won' && stage.status !== 'lost') throw new Error(`${label}.status is invalid`);
  if ((stage.observationMode !== 'engine-observed' && stage.observationMode !== 'test-driver-synthetic')
    || (executionMode === 'human' && stage.observationMode !== 'engine-observed')) {
    throw new Error(`${label}.observationMode does not match session executionMode`);
  }
  const scenarioId = normalizeScenarioId(stage.scenarioId, `${label}.scenarioId`);
  const startingRun = normalizeRun(stage.startingRun, `${label}.startingRun`);
  const score = safeInteger(stage.score, `${label}.score`);
  const scoreDelta = safeInteger(stage.scoreDelta, `${label}.scoreDelta`);
  const lives = safeInteger(stage.lives, `${label}.lives`);
  const serviceActions = safeInteger(stage.serviceActions, `${label}.serviceActions`);
  const fulfilled = safeInteger(stage.fulfilled, `${label}.fulfilled`);
  const walkouts = safeInteger(stage.walkouts, `${label}.walkouts`);
  const resolved = safeInteger(stage.resolved, `${label}.resolved`);
  const exited = safeInteger(stage.exited, `${label}.exited`);
  const lossReasons = normalizeLossReasons(stage.lossReasons, `${label}.lossReasons`);
  const interactionCounts = normalizeInteractionCounts(stage.interactionCounts,
    `${label}.interactionCounts`);
  if (score < startingRun.score || score - startingRun.score !== scoreDelta
    || lives > startingRun.lives || (stage.status === 'lost') !== (lives === 0)
    || resolved !== exited + walkouts || serviceActions < fulfilled) {
    throw new Error(`${label} terminal context does not reconcile`);
  }
  if (stage.observationMode === 'engine-observed'
    && (startingRun.lives - lives !== lossReasons.walkout + lossReasons.shake_smashed
      + lossReasons.jar_smashed || walkouts !== lossReasons.walkout)) {
    throw new Error(`${label} engine-observed losses do not reconcile`);
  }
  return Object.freeze({ stage: number, status: stage.status,
    observationMode: stage.observationMode, scenarioId, startingRun,
    ticks: safeInteger(stage.ticks, `${label}.ticks`),
    inputSamples: safeInteger(stage.inputSamples, `${label}.inputSamples`), score, scoreDelta, lives,
    serviceActions, fulfilled, walkouts, resolved, exited, lossReasons, interactionCounts }) as P108LabStageRecord;
}
function normalizeStagePulse(
  value: unknown,
  expectedRound: 1 | 2,
  stage: P108LabStageRecord,
  label: string,
): P108LabStagePulse {
  const pulse = exact(value, ['round', 'stage', 'terminalStatus', 'perceivedPressure', 'pacing',
    'hardestDecision', 'lossExplanation'], label);
  if (pulse.round !== expectedRound || pulse.stage !== stage.stage || pulse.terminalStatus !== stage.status) {
    throw new Error(`${label} round, stage, or terminal status does not match`);
  }
  if (pulse.pacing !== 'too-idle' && pulse.pacing !== 'balanced' && pulse.pacing !== 'too-relentless') {
    throw new Error(`${label}.pacing is invalid`);
  }
  const hardestDecision = normalizeOptionalText(pulse.hardestDecision, `${label}.hardestDecision`);
  let lossExplanation: string | null = null;
  if (stage.status === 'lost') {
    lossExplanation = normalizeRequiredText(pulse.lossExplanation, `${label}.lossExplanation`);
  } else if (pulse.lossExplanation !== null) {
    throw new Error(`${label}.lossExplanation is forbidden for a won stage`);
  }
  return Object.freeze({ round: expectedRound, stage: stage.stage, terminalStatus: stage.status,
    perceivedPressure: boundedInteger(pulse.perceivedPressure, `${label}.perceivedPressure`, 1, 7),
    pacing: pulse.pacing, hardestDecision, lossExplanation });
}
function normalizeRoundComparison(value: unknown, expectedRound: 1 | 2): P108LabRoundComparison {
  const result = exact(value, ['round', 'jarExperience', 'recoveryPossible'], `lab comparison round ${expectedRound}`);
  if (result.round !== expectedRound) throw new Error(`lab comparison round ${expectedRound} is out of order`);
  if (result.jarExperience !== 'planning' && result.jarExperience !== 'waiting'
    && result.jarExperience !== 'both' && result.jarExperience !== 'neither') {
    throw new Error(`lab comparison round ${expectedRound}.jarExperience is invalid`);
  }
  return Object.freeze({ round: expectedRound, jarExperience: result.jarExperience,
    recoveryPossible: boundedInteger(result.recoveryPossible,
      `lab comparison round ${expectedRound}.recoveryPossible`, 1, 7) });
}
function normalizeComparison(value: unknown): P108LabComparison {
  const result = exact(value, ['clearerRamp', 'fairer', 'moreEnjoyable', 'rounds', 'scoreBelief'], 'lab comparison');
  for (const key of ['clearerRamp', 'fairer', 'moreEnjoyable'] as const) {
    if (result[key] !== 1 && result[key] !== 2 && result[key] !== 'same') throw new Error(`lab comparison.${key} is invalid`);
  }
  const rounds = exactTuple(result.rounds, 2, 'lab comparison rounds');
  return Object.freeze({ clearerRamp: result.clearerRamp, fairer: result.fairer,
    moreEnjoyable: result.moreEnjoyable,
    rounds: Object.freeze([normalizeRoundComparison(rounds[0], 1), normalizeRoundComparison(rounds[1], 2)]),
    scoreBelief: normalizeRequiredText(result.scoreBelief, 'lab comparison.scoreBelief') }) as P108LabComparison;
}
function rejectRankedKeys(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) throw new Error('lab artifact contains a ranked-protocol key');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Array.isArray(value) && key === 'length') continue;
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error('lab artifact properties must be enumerable data properties');
    }
    rejectRankedKeys(descriptor.value, seen);
  }
}
function normalizeRound(
  value: unknown,
  expected: 1 | 2,
  candidateId: P108CanonicalLabCandidateId,
  executionMode: P108LabExecutionMode,
): P108LabRoundRecord {
  const round = exact(value, ['round', 'candidateId', 'initialRun', 'candidateExposure', 'stages', 'stagePulses'], `round ${expected}`);
  if (round.round !== expected || round.candidateId !== candidateId) throw new Error(`round ${expected} identity is invalid`);
  const initialRun = normalizeRun(round.initialRun, `round ${expected}.initialRun`);
  if (initialRun.lives !== 4 || initialRun.score !== 0) throw new Error('comparison rounds require a fresh run context');
  if (round.candidateExposure !== 'none' && round.candidateExposure !== 'partial'
    && round.candidateExposure !== 'full') throw new Error(`round ${expected} exposure is invalid`);
  const rawStages = exactArray(round.stages, 1, 4, `round ${expected} stages`);
  const stages = rawStages.map((stage, index) => normalizeStage(stage, [4, 7], executionMode,
    `round ${expected} stage ${index + 1}`));
  const pulses = exactTuple(round.stagePulses, stages.length, `round ${expected} stage pulses`)
    .map((pulse, index) => normalizeStagePulse(pulse, expected, stages[index]!, `round ${expected} pulse ${index + 1}`));
  const highestStage = stages.at(-1)!.stage;
  const expectedExposure = highestStage === 4 ? 'none' : highestStage === 7 ? 'full' : 'partial';
  if (stages.some((stage, index) => stage.stage !== index + 4)
    || stages[0]!.startingRun.lives !== initialRun.lives
    || stages[0]!.startingRun.score !== initialRun.score
    || stages.slice(0, -1).some((stage) => stage.status !== 'won')
    || stages.some((stage) => stage.inputSamples !== stage.ticks)
    || stages.slice(1).some((stage, index) => stage.startingRun.lives !== stages[index]!.lives
      || stage.startingRun.score !== stages[index]!.score)
    || round.candidateExposure !== expectedExposure
    || (stages.at(-1)!.status === 'won' && highestStage !== 7)) {
    throw new Error(`round ${expected} stage progression or exposure is invalid`);
  }
  return Object.freeze({ round: expected, candidateId, initialRun,
    candidateExposure: round.candidateExposure, stages: Object.freeze(stages),
    stagePulses: Object.freeze(pulses) }) as P108LabRoundRecord;
}

/** Strict clone/freeze boundary for the deliberately unranked lab artifact. */
export function normalizeP108HumanLabArtifact(value: unknown): P108HumanLabArtifact {
  rejectRankedKeys(value);
  const artifact = exact(value, ['kind', 'schemaVersion', 'experimentId', 'experimentRevision',
    'policy', 'executionMode', 'assignmentOrder', 'studyAssignment', 'participant',
    'consentEvidence', 'provenance', 'timing', 'practice', 'rounds', 'comparison'],
  'human-lab artifact');
  if ((artifact.kind !== P108_HUMAN_LAB_ARTIFACT_KIND
      && artifact.kind !== P108_HUMAN_LAB_TEST_DRIVER_ARTIFACT_KIND) || artifact.schemaVersion !== 3
    || artifact.experimentId !== 'EXP-049'
    || artifact.experimentRevision !== P108_HUMAN_LAB_EXPERIMENT_REVISION) {
    throw new Error('human-lab artifact identity is unsupported');
  }
  const policy = exact(artifact.policy, ['rankEligibility', 'authorityRegistration', 'seasonId', 'submission'], 'lab policy');
  if (policy.rankEligibility !== 'unranked' || policy.authorityRegistration !== null
    || policy.seasonId !== null || policy.submission !== 'forbidden') throw new Error('lab policy must be unranked');
  const executionMode = normalizeExecutionMode(artifact.executionMode);
  const expectedKind = executionMode === 'human' ? P108_HUMAN_LAB_ARTIFACT_KIND
    : P108_HUMAN_LAB_TEST_DRIVER_ARTIFACT_KIND;
  if (artifact.kind !== expectedKind) throw new Error('human-lab artifact kind and execution mode do not match');
  const assignmentOrder = normalizeOrder(artifact.assignmentOrder);
  const studyAssignment = normalizeP108HumanLabStudyAssignment(artifact.studyAssignment);
  const participant = normalizeP108HumanLabParticipant(artifact.participant, studyAssignment);
  const consentEvidence = normalizeP108HumanLabConsentEvidence(artifact.consentEvidence, executionMode);
  const provenance = normalizeProvenance(artifact.provenance, assignmentOrder);
  if (participant.assignedViewportCssWidth !== provenance.entryEnvironment.viewportCssWidth) {
    throw new Error('human-lab participant assigned viewport width must match entry provenance');
  }
  const practice = exact(artifact.practice, ['initialRun', 'stages'], 'lab practice');
  const practiceInitialRun = normalizeRun(practice.initialRun, 'lab practice.initialRun');
  if (practiceInitialRun.lives !== 4 || practiceInitialRun.score !== 0) throw new Error('practice requires a fresh run context');
  const rawPracticeStages = exactArray(practice.stages, 1, 3, 'lab practice stages');
  const practiceStages = rawPracticeStages.map((stage, index) => normalizeStage(stage, [1, 3], executionMode,
    `practice stage ${index + 1}`));
  if (practiceStages.some((stage, index) => stage.stage !== index + 1 || stage.inputSamples !== stage.ticks)
    || practiceStages[0]!.startingRun.lives !== 4 || practiceStages[0]!.startingRun.score !== 0
    || practiceStages.slice(0, -1).some((stage) => stage.status !== 'won')
    || practiceStages.slice(1).some((stage, index) => stage.startingRun.lives !== practiceStages[index]!.lives
      || stage.startingRun.score !== practiceStages[index]!.score)
    || (practiceStages.at(-1)!.status === 'won' && practiceStages.at(-1)!.stage !== 3)) {
    throw new Error('practice stages are out of order or do not carry state');
  }
  const rawRounds = exactTuple(artifact.rounds, 2, 'lab artifact rounds');
  const rounds = [normalizeRound(rawRounds[0], 1, assignmentOrder[0], executionMode),
    normalizeRound(rawRounds[1], 2, assignmentOrder[1], executionMode)] as const;
  const controlProvenance = provenance.candidates.find(({ candidateId }) =>
    candidateId === 'a-registered-control')!;
  if (practiceStages.some((stage) =>
    stage.scenarioId !== controlProvenance.scenarios[stage.stage - 1]!.id)
    || rounds.some((round, roundIndex) => round.stages.some((stage) =>
      stage.scenarioId !== provenance.candidates[roundIndex]!.scenarios[stage.stage - 1]!.id))) {
    throw new Error('human-lab stage scenario IDs do not match materializer provenance');
  }
  if ([...practiceStages, ...rounds.flatMap((round) => round.stages)]
    .some((stage) => stage.observationMode === 'engine-observed' && stage.ticks === 0)) {
    throw new Error('engine-observed lab stages require at least one real gameplay tick');
  }
  return deepFreeze({ kind: expectedKind, schemaVersion: 3, experimentId: 'EXP-049',
    experimentRevision: P108_HUMAN_LAB_EXPERIMENT_REVISION,
    policy: { rankEligibility: 'unranked', authorityRegistration: null,
      seasonId: null, submission: 'forbidden' }, executionMode, assignmentOrder,
    studyAssignment, participant, consentEvidence, provenance,
    timing: normalizeP108HumanLabTimingSnapshot(artifact.timing),
    practice: { initialRun: practiceInitialRun, stages: practiceStages }, rounds,
    comparison: normalizeComparison(artifact.comparison) });
}

export function createP108HumanLabState(value: unknown): P108HumanLabState {
  const creation = exact(value, ['assignmentOrder', 'executionMode', 'provenance',
    'studyAssignment'], 'human-lab creation');
  const assignmentOrder = normalizeOrder(creation.assignmentOrder);
  const studyAssignment = normalizeP108HumanLabStudyAssignment(creation.studyAssignment);
  const provenance = normalizeProvenance(creation.provenance, assignmentOrder);
  if (studyAssignment.assignedViewportCssWidth !== provenance.entryEnvironment.viewportCssWidth) {
    throw new Error('human-lab assigned viewport width must match entry provenance');
  }
  return deepFreeze({ phase: 'welcome', executionMode: normalizeExecutionMode(creation.executionMode),
    assignmentOrder, studyAssignment, participant: null, consentEvidence: null, provenance,
    activeStage: null,
    activeRun: null, activeTicks: 0, activeInputSamples: 0, pendingPulseRound: null,
    practiceStages: [], rounds: [], comparison: null, artifact: null });
}
function activePhase(phase: P108LabPhase): phase is 'practice' | 'round1' | 'round2' {
  return phase === 'practice' || phase === 'round1' || phase === 'round2';
}
function startStage(state: P108HumanLabState, phase: 'practice' | 'round1' | 'round2', stage: number, run: RunContext): P108HumanLabState {
  return deepFreeze({ ...state, phase, activeStage: stage, activeRun: { ...run }, activeTicks: 0,
    activeInputSamples: 0, pendingPulseRound: null });
}
function finishRound(state: P108HumanLabState, roundNumber: 1 | 2): P108HumanLabState {
  const index = roundNumber - 1;
  const highestStage = state.rounds[index]!.stages.at(-1)!.stage;
  const rounds = state.rounds.map((round, current) => current === index ? { ...round,
    candidateExposure: highestStage === 4 ? 'none' as const
      : highestStage === 7 ? 'full' as const : 'partial' as const } : round);
  return deepFreeze({ ...state, phase: roundNumber === 1 ? 'intermission' : 'comparison', rounds,
    activeStage: null, activeRun: null, activeTicks: 0, activeInputSamples: 0, pendingPulseRound: null });
}

/** Pure immutable phase reducer. Tick input exists only inside its active-play event. */
export function reduceP108HumanLab(state: P108HumanLabState, eventValue: unknown): P108HumanLabState {
  if (eventValue === null || typeof eventValue !== 'object' || Array.isArray(eventValue)) throw new Error('lab event must be an object');
  const typeDescriptor = Object.getOwnPropertyDescriptor(eventValue, 'type');
  if (typeDescriptor === undefined || !typeDescriptor.enumerable || !('value' in typeDescriptor)) throw new Error('lab event.type must be a data property');
  const type = typeDescriptor.value;
  if (type === 'consent') {
    const event = exact(eventValue, ['type', 'participantCode', 'consentEvidence'], 'consent event');
    if (state.phase !== 'welcome') throw new Error('consent is legal only from welcome');
    if (state.participant !== null || state.consentEvidence !== null) {
      throw new Error('human-lab consent was already recorded');
    }
    const participant = createP108HumanLabParticipant({
      participantCode: event.participantCode,
      assignment: state.studyAssignment,
    });
    const consentEvidence = normalizeP108HumanLabConsentEvidence(event.consentEvidence,
      state.executionMode);
    return startStage({ ...state, participant, consentEvidence }, 'practice', 1, FRESH_RUN);
  }
  if (type === 'tick') {
    const event = exact(eventValue, ['type', 'stage', 'input'], 'tick event');
    if (!activePhase(state.phase) || event.stage !== state.activeStage) throw new Error('tick/input is legal only for the active play stage');
    normalizeMaltlineInput(event.input, 'human-lab tick input');
    return deepFreeze({ ...state, activeTicks: state.activeTicks + 1, activeInputSamples: state.activeInputSamples + 1 });
  }
  if (type === 'stage-terminal') {
    const event = exact(eventValue, ['type', 'stage', 'status', 'observationMode', 'scenarioId',
      'score', 'scoreDelta', 'lives', 'serviceActions', 'fulfilled', 'walkouts', 'resolved',
      'exited', 'lossReasons', 'interactionCounts'], 'stage terminal event');
    if (!activePhase(state.phase) || state.activeRun === null || event.stage !== state.activeStage) throw new Error('stage terminal is legal only for the active play stage');
    if (event.status !== 'won' && event.status !== 'lost') throw new Error('stage terminal status is invalid');
    const score = safeInteger(event.score, 'terminal score');
    const lives = safeInteger(event.lives, 'terminal lives');
    if (score < state.activeRun.score || lives > state.activeRun.lives || (event.status === 'lost') !== (lives === 0)) throw new Error('stage terminal context does not reconcile');
    const record = normalizeStage({ stage: state.activeStage, status: event.status,
      observationMode: event.observationMode, scenarioId: event.scenarioId, startingRun: state.activeRun,
      ticks: state.activeTicks, inputSamples: state.activeInputSamples, score,
      scoreDelta: event.scoreDelta, lives, serviceActions: event.serviceActions,
      fulfilled: event.fulfilled, walkouts: event.walkouts, resolved: event.resolved,
      exited: event.exited, lossReasons: event.lossReasons, interactionCounts: event.interactionCounts },
    state.phase === 'practice' ? [1, 3] : [4, 7], state.executionMode, 'completed stage');
    if (state.phase === 'practice') {
      const practiceStages = [...state.practiceStages, record];
      if (event.status === 'won' && state.activeStage! < 3) return startStage({ ...state, practiceStages }, 'practice', state.activeStage! + 1, { lives, score });
      const round: MutableRound = { round: 1, candidateId: state.assignmentOrder[0], initialRun: FRESH_RUN,
        candidateExposure: 'pending', stages: [], stagePulses: [] };
      return startStage({ ...state, practiceStages, rounds: [round] }, 'round1', 4, FRESH_RUN);
    }
    const roundNumber = state.phase === 'round1' ? 1 : 2;
    const rounds = state.rounds.map((round, index) => index === roundNumber - 1
      ? { ...round, stages: [...round.stages, record] } : round);
    return deepFreeze({ ...state, phase: 'stage-pulse', rounds, activeStage: null, activeRun: null,
      activeTicks: 0, activeInputSamples: 0, pendingPulseRound: roundNumber });
  }
  if (type === 'stage-pulse') {
    const event = exact(eventValue, ['type', 'round', 'stage', 'perceivedPressure', 'pacing',
      'hardestDecision', 'lossExplanation'], 'stage pulse event');
    if (state.phase !== 'stage-pulse' || state.pendingPulseRound === null) {
      throw new Error('stage pulse is legal only after a comparison-stage terminal');
    }
    const roundNumber = state.pendingPulseRound;
    const round = state.rounds[roundNumber - 1]!;
    const terminal = round.stages.at(-1)!;
    if (round.stagePulses.length !== round.stages.length - 1) throw new Error('stage pulse state is misaligned');
    const pulse = normalizeStagePulse({ round: event.round, stage: event.stage,
      terminalStatus: terminal.status, perceivedPressure: event.perceivedPressure, pacing: event.pacing,
      hardestDecision: event.hardestDecision, lossExplanation: event.lossExplanation },
    roundNumber, terminal, 'stage pulse');
    const rounds = state.rounds.map((entry, index) => index === roundNumber - 1
      ? { ...entry, stagePulses: [...entry.stagePulses, pulse] } : entry);
    const withPulse = deepFreeze({ ...state, rounds });
    if (terminal.status === 'won' && terminal.stage < 7) {
      return startStage(withPulse, roundNumber === 1 ? 'round1' : 'round2', terminal.stage + 1,
        { lives: terminal.lives, score: terminal.score });
    }
    return finishRound(withPulse, roundNumber);
  }
  if (type === 'begin-round2') {
    exact(eventValue, ['type'], 'begin-round2 event');
    if (state.phase !== 'intermission') throw new Error('Round 2 begins only from intermission');
    const round: MutableRound = { round: 2, candidateId: state.assignmentOrder[1], initialRun: FRESH_RUN,
      candidateExposure: 'pending', stages: [], stagePulses: [] };
    return startStage({ ...state, rounds: [...state.rounds, round] }, 'round2', 4, FRESH_RUN);
  }
  if (type === 'freeze') {
    const event = exact(eventValue, ['type', 'clearerRamp', 'fairer', 'moreEnjoyable',
      'rounds', 'scoreBelief', 'timing'], 'freeze event');
    if (state.phase !== 'comparison' || state.rounds.length !== 2) throw new Error('freeze is legal only from comparison');
    if (state.participant === null || state.consentEvidence === null) {
      throw new Error('freeze requires participant identity and consent evidence');
    }
    const comparison = normalizeComparison({ clearerRamp: event.clearerRamp, fairer: event.fairer,
      moreEnjoyable: event.moreEnjoyable, rounds: event.rounds, scoreBelief: event.scoreBelief });
    const artifact = normalizeP108HumanLabArtifact({
      kind: state.executionMode === 'human' ? P108_HUMAN_LAB_ARTIFACT_KIND
        : P108_HUMAN_LAB_TEST_DRIVER_ARTIFACT_KIND,
      schemaVersion: 3, experimentId: 'EXP-049',
      experimentRevision: P108_HUMAN_LAB_EXPERIMENT_REVISION,
      policy: { rankEligibility: 'unranked', authorityRegistration: null, seasonId: null, submission: 'forbidden' },
      executionMode: state.executionMode, assignmentOrder: state.assignmentOrder,
      studyAssignment: state.studyAssignment, participant: state.participant,
      consentEvidence: state.consentEvidence,
      provenance: state.provenance, timing: event.timing,
      practice: { initialRun: FRESH_RUN, stages: state.practiceStages },
      rounds: state.rounds, comparison });
    return deepFreeze({ ...state, phase: 'frozen', comparison, artifact });
  }
  if (type === 'debrief') {
    exact(eventValue, ['type'], 'debrief event');
    if (state.phase !== 'frozen') throw new Error('debrief is legal only after freeze');
    return deepFreeze({ ...state, phase: 'debrief' });
  }
  throw new Error('human-lab event type is unsupported');
}

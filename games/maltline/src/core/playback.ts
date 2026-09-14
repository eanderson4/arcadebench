import { MaltlineEngine } from './engine';
import {
  verifyAndHashMaltlineProofEnvelopeForPlaybackInternal,
  type HashedMaltlineProof,
  type MaltlineInputRun,
  type VerifiedMaltlineStage,
} from './proof';
import type {
  GameEvent,
  MaltlineInput,
  MaltlineScenario,
  MaltlineState,
  RunContext,
} from './types';

export interface MaltlinePlaybackPosition {
  readonly stageIndex: number;
  readonly stageTick: number;
}

export interface MaltlinePlaybackStage {
  readonly stageIndex: number;
  readonly stageId: string;
  readonly name: string;
  readonly ticks: number;
  readonly runStartTick: number;
  readonly frameStart: number;
  readonly terminalStatus: 'won' | 'lost';
  readonly startLives: number;
  readonly startScore: number;
  readonly endLives: number;
  readonly endScore: number;
}

export interface MaltlinePlaybackFrame {
  readonly position: MaltlinePlaybackPosition;
  readonly frameOrdinal: number;
  /** Number of proof inputs consumed through this frame. Duplicates at stage boundaries. */
  readonly runTick: number;
  /** Input applied to reach this state; null for a stage's initial tick-zero frame. */
  readonly appliedInput: Readonly<MaltlineInput> | null;
  /** Events emitted by appliedInput only; jumps never expose skipped presentation events. */
  readonly events: readonly GameEvent[];
  readonly state: Readonly<MaltlineState>;
}

export interface VerifiedMaltlinePlayback {
  readonly verification: HashedMaltlineProof;
  readonly stages: readonly MaltlinePlaybackStage[];
  readonly frameCount: number;
  readonly totalInputTicks: number;
  positionAtFrame(frameOrdinal: number): MaltlinePlaybackPosition;
  frameAt(position: MaltlinePlaybackPosition): MaltlinePlaybackFrame;
  frameAtOrdinal(frameOrdinal: number): MaltlinePlaybackFrame;
  /** Advances within the current stage. A terminal frame never crosses to the next stage. */
  step(): MaltlinePlaybackFrame | null;
}

export class MaltlinePlaybackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaltlinePlaybackError';
  }
}

interface PlaybackStageSource {
  descriptor: MaltlinePlaybackStage;
  scenario: MaltlineScenario;
  run: RunContext;
  inputs: readonly Readonly<MaltlineInput>[];
  runEnds: readonly number[];
}

interface CursorState {
  stageIndex: number;
  stageTick: number;
  engine: MaltlineEngine;
  frame: MaltlinePlaybackFrame;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function safeInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new MaltlinePlaybackError(
      `${label} must be a safe integer from ${minimum} to ${maximum}.`,
    );
  }
  return value as number;
}

function exactPosition(value: unknown, stages: readonly PlaybackStageSource[]): MaltlinePlaybackPosition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MaltlinePlaybackError('Maltline playback position must be an object.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new MaltlinePlaybackError('Maltline playback position must be a plain object.');
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== 2 || !ownKeys.includes('stageIndex') || !ownKeys.includes('stageTick')) {
    throw new MaltlinePlaybackError(
      'Maltline playback position must contain exactly: stageIndex, stageTick.',
    );
  }
  const readDataProperty = (key: 'stageIndex' | 'stageTick'): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new MaltlinePlaybackError(
        `Maltline playback position ${key} must be an enumerable data property.`,
      );
    }
    return descriptor.value;
  };
  const stageIndex = safeInteger(
    readDataProperty('stageIndex'),
    0,
    stages.length - 1,
    'Maltline playback stage index',
  );
  const stageTick = safeInteger(
    readDataProperty('stageTick'),
    0,
    stages[stageIndex]!.descriptor.ticks,
    'Maltline playback stage tick',
  );
  return { stageIndex, stageTick };
}

function stageInputs(
  inputRuns: readonly MaltlineInputRun[],
  expectedTicks: number,
): { inputs: readonly Readonly<MaltlineInput>[]; runEnds: readonly number[] } {
  const inputs: Readonly<MaltlineInput>[] = [];
  const runEnds: number[] = [];
  let tick = 0;
  for (const run of inputRuns) {
    tick += run.ticks;
    inputs.push(Object.freeze({
      stationDir: run.stationDir,
      laneDir: run.laneDir,
      blend: run.blend,
      serve: run.serve,
    }));
    runEnds.push(tick);
  }
  if (tick !== expectedTicks) {
    throw new MaltlinePlaybackError('Verified Maltline stage tick metadata is inconsistent.');
  }
  return { inputs: Object.freeze(inputs), runEnds: Object.freeze(runEnds) };
}

function inputAt(source: PlaybackStageSource, stageTick: number): Readonly<MaltlineInput> {
  let low = 0;
  let high = source.runEnds.length - 1;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (source.runEnds[middle]! < stageTick) low = middle + 1;
    else high = middle;
  }
  const input = source.inputs[low];
  if (input === undefined) {
    throw new MaltlinePlaybackError('Verified Maltline input lookup is inconsistent.');
  }
  return input;
}

function createFrame(
  source: PlaybackStageSource,
  stageTick: number,
  input: Readonly<MaltlineInput> | null,
  state: MaltlineState,
  events: GameEvent[],
): MaltlinePlaybackFrame {
  return deepFreeze({
    position: { stageIndex: source.descriptor.stageIndex, stageTick },
    frameOrdinal: source.descriptor.frameStart + stageTick,
    runTick: source.descriptor.runStartTick + stageTick,
    appliedInput: input === null ? null : { ...input },
    events,
    state,
  });
}

function buildStageSources(
  verification: HashedMaltlineProof,
  verifiedStages: readonly VerifiedMaltlineStage[],
  campaign: readonly MaltlineScenario[],
  initialRun: Readonly<RunContext>,
): readonly PlaybackStageSource[] {
  const proofStages = verification.envelope.proof.stages;
  if (proofStages.length !== verifiedStages.length) {
    throw new MaltlinePlaybackError('Verified Maltline stage metadata is inconsistent.');
  }

  const sources: PlaybackStageSource[] = [];
  let run: RunContext = { lives: initialRun.lives, score: initialRun.score };
  let runStartTick = 0;
  let frameStart = 0;
  for (let stageIndex = 0; stageIndex < proofStages.length; stageIndex++) {
    const proofStage = proofStages[stageIndex]!;
    const verifiedStage = verifiedStages[stageIndex]!;
    const scenario = campaign[stageIndex];
    if (scenario === undefined
      || proofStage.stageId !== scenario.id
      || verifiedStage.stageId !== scenario.id) {
      throw new MaltlinePlaybackError('Verified Maltline campaign metadata is inconsistent.');
    }
    const descriptor = deepFreeze({
      stageIndex,
      stageId: scenario.id,
      name: scenario.name,
      ticks: verifiedStage.ticks,
      runStartTick,
      frameStart,
      terminalStatus: verifiedStage.status,
      startLives: run.lives,
      startScore: run.score,
      endLives: verifiedStage.lives,
      endScore: verifiedStage.score,
    } satisfies MaltlinePlaybackStage);
    const encoded = stageInputs(proofStage.inputRuns, verifiedStage.ticks);
    sources.push({
      descriptor,
      scenario,
      run: Object.freeze({ ...run }),
      inputs: encoded.inputs,
      runEnds: encoded.runEnds,
    });
    runStartTick += verifiedStage.ticks;
    frameStart += verifiedStage.ticks + 1;
    run = { lives: verifiedStage.lives, score: verifiedStage.score };
  }
  if (runStartTick !== verification.envelope.summary.totalTicks) {
    throw new MaltlinePlaybackError('Verified Maltline total tick metadata is inconsistent.');
  }
  return Object.freeze(sources.map((source) => Object.freeze(source)));
}

class VerifiedMaltlinePlaybackCursor implements VerifiedMaltlinePlayback {
  readonly #verification: HashedMaltlineProof;
  readonly #sources: readonly PlaybackStageSource[];
  readonly #stages: readonly MaltlinePlaybackStage[];
  readonly #frameCount: number;
  #cursor: CursorState | null = null;

  constructor(verification: HashedMaltlineProof, sources: readonly PlaybackStageSource[]) {
    this.#verification = verification;
    this.#sources = sources;
    this.#stages = Object.freeze(sources.map((source) => source.descriptor));
    this.#frameCount = verification.envelope.summary.totalTicks + sources.length;
    Object.preventExtensions(this);
  }

  get verification(): HashedMaltlineProof {
    return this.#verification;
  }

  get stages(): readonly MaltlinePlaybackStage[] {
    return this.#stages;
  }

  get frameCount(): number {
    return this.#frameCount;
  }

  get totalInputTicks(): number {
    return this.#verification.envelope.summary.totalTicks;
  }

  positionAtFrame(frameOrdinalValue: number): MaltlinePlaybackPosition {
    const frameOrdinal = safeInteger(
      frameOrdinalValue,
      0,
      this.#frameCount - 1,
      'Maltline playback frame ordinal',
    );
    let low = 0;
    let high = this.#sources.length - 1;
    while (low < high) {
      const middle = low + Math.ceil((high - low) / 2);
      if (this.#sources[middle]!.descriptor.frameStart <= frameOrdinal) low = middle;
      else high = middle - 1;
    }
    const source = this.#sources[low]!;
    return deepFreeze({
      stageIndex: low,
      stageTick: frameOrdinal - source.descriptor.frameStart,
    });
  }

  frameAt(positionValue: MaltlinePlaybackPosition): MaltlinePlaybackFrame {
    const position = exactPosition(positionValue, this.#sources);
    const source = this.#sources[position.stageIndex]!;
    const previous = this.#cursor;
    if (previous !== null
      && previous.stageIndex === position.stageIndex
      && previous.stageTick === position.stageTick) {
      return previous.frame;
    }
    let engine: MaltlineEngine;
    let fromTick: number;
    if (previous !== null
      && previous.stageIndex === position.stageIndex
      && position.stageTick > previous.stageTick) {
      engine = previous.engine;
      fromTick = previous.stageTick;
    } else {
      engine = new MaltlineEngine(source.scenario, source.run);
      fromTick = 0;
    }

    let state = engine.snapshot();
    let appliedInput: Readonly<MaltlineInput> | null = null;
    let events: GameEvent[] = [];
    for (let stageTick = fromTick + 1; stageTick <= position.stageTick; stageTick++) {
      appliedInput = inputAt(source, stageTick);
      engine.setInput(appliedInput);
      const result = engine.step();
      state = result.state;
      events = result.events;
    }
    if (state.tick !== position.stageTick) {
      throw new MaltlinePlaybackError('Verified Maltline playback ended before the requested tick.');
    }
    const frame = createFrame(
      source,
      position.stageTick,
      appliedInput,
      state,
      events,
    );
    this.#cursor = {
      stageIndex: position.stageIndex,
      stageTick: position.stageTick,
      engine,
      frame,
    };
    return frame;
  }

  frameAtOrdinal(frameOrdinal: number): MaltlinePlaybackFrame {
    return this.frameAt(this.positionAtFrame(frameOrdinal));
  }

  step(): MaltlinePlaybackFrame | null {
    if (this.#cursor === null) return this.frameAt({ stageIndex: 0, stageTick: 0 });
    const descriptor = this.#sources[this.#cursor.stageIndex]!.descriptor;
    if (this.#cursor.stageTick === descriptor.ticks) return null;
    return this.frameAt({
      stageIndex: this.#cursor.stageIndex,
      stageTick: this.#cursor.stageTick + 1,
    });
  }
}

/**
 * Creates deterministic playback only after exact retained-envelope verification.
 * No caller-supplied scenario, run context, summary, or local replay is accepted.
 */
export async function createVerifiedMaltlinePlayback(
  retainedEnvelope: unknown,
): Promise<VerifiedMaltlinePlayback> {
  const details = await verifyAndHashMaltlineProofEnvelopeForPlaybackInternal(retainedEnvelope);
  const sources = buildStageSources(
    details.verification,
    details.stages,
    details.authority.campaign,
    details.authority.initialRun,
  );
  return new VerifiedMaltlinePlaybackCursor(details.verification, sources);
}

import { MALTLINE_GENERATION_2_AUTHORITY } from '../core/authority.js';
import { normalizeMaltlineInput } from '../core/input.js';
import {
  encodeMaltlineInputRuns,
  MALTLINE_PROOF_VERSION,
  type MaltlineInputRun,
  type MaltlineRunProof,
} from '../core/proof.js';
import type { MaltlineInput, MaltlineState } from '../core/types.js';

export type MaltlineRankedProofTerminalState = Pick<
  MaltlineState,
  'scenarioId' | 'status' | 'tick'
>;

export type ImmutableMaltlineInputRun = Readonly<MaltlineInputRun>;

export interface ImmutableMaltlineProofStage {
  readonly stageId: string;
  readonly inputRuns: readonly ImmutableMaltlineInputRun[];
}

export type ImmutableMaltlineRunProof = Readonly<
  Omit<MaltlineRunProof, 'stages'> & {
    readonly stages: readonly ImmutableMaltlineProofStage[];
  }
>;

export type MaltlineRankedProofResult =
  | Readonly<{
      status: 'available';
      proof: ImmutableMaltlineRunProof;
    }>
  | Readonly<{
      status: 'unavailable';
      code: 'rank-ineligible';
      reason: string;
    }>;

interface ActiveStage {
  readonly stageId: string;
  readonly inputs: MaltlineInput[];
}

function freezeInput(input: MaltlineInput): MaltlineInput {
  return Object.freeze({
    stationDir: input.stationDir,
    laneDir: input.laneDir,
    blend: input.blend,
    serve: input.serve,
  });
}

function freezeInputRuns(inputs: readonly MaltlineInput[]): readonly ImmutableMaltlineInputRun[] {
  return Object.freeze(
    encodeMaltlineInputRuns(inputs).map((run) =>
      Object.freeze({
        stationDir: run.stationDir,
        laneDir: run.laneDir,
        blend: run.blend,
        serve: run.serve,
        ticks: run.ticks,
      }),
    ),
  );
}

function cloneAndFreezeProof(
  stages: readonly ImmutableMaltlineProofStage[],
): ImmutableMaltlineRunProof {
  const clonedStages = stages.map((stage) =>
    Object.freeze({
      stageId: stage.stageId,
      inputRuns: Object.freeze(
        stage.inputRuns.map((run) =>
          Object.freeze({
            stationDir: run.stationDir,
            laneDir: run.laneDir,
            blend: run.blend,
            serve: run.serve,
            ticks: run.ticks,
          }),
        ),
      ),
    }),
  );

  return Object.freeze({
    version: MALTLINE_PROOF_VERSION,
    rulesetVersion: MALTLINE_GENERATION_2_AUTHORITY.identity.rulesetVersion,
    campaignGeneration: MALTLINE_GENERATION_2_AUTHORITY.identity.campaignGeneration,
    stages: Object.freeze(clonedStages),
  });
}

/**
 * Captures only the per-tick inputs needed for a ranked Maltline proof.
 *
 * This recorder deliberately has no persistence or serialization surface. A new
 * instance represents exactly one in-memory campaign attempt.
 */
export class MaltlineRankedProofRecorder {
  readonly #stageIds = Object.freeze(
    MALTLINE_GENERATION_2_AUTHORITY.campaign.map((scenario) => scenario.id),
  );

  readonly #completedStages: ImmutableMaltlineProofStage[] = [];
  #activeStage: ActiveStage | null = null;
  #nextStageIndex = 0;
  #terminal = false;
  #unavailable: Extract<MaltlineRankedProofResult, { status: 'unavailable' }> | null = null;

  beginStage(stageId: string): void {
    this.#assertEligible('begin a stage');

    if (this.#terminal) {
      throw new Error('Cannot begin a stage after the campaign attempt is terminal.');
    }
    if (this.#activeStage !== null) {
      throw new Error(
        `Cannot begin stage ${stageId}: stage ${this.#activeStage.stageId} is still active.`,
      );
    }

    const expectedStageId = this.#stageIds[this.#nextStageIndex];
    if (expectedStageId === undefined) {
      throw new Error('Cannot begin another stage after completing the campaign.');
    }
    if (stageId !== expectedStageId) {
      if (this.#completedStages.some((stage) => stage.stageId === stageId)) {
        throw new Error(`Cannot begin stage ${stageId}: it has already been completed.`);
      }
      throw new Error(
        `Cannot begin stage ${stageId}: expected authority stage ${expectedStageId}; stage gaps are not allowed.`,
      );
    }

    this.#activeStage = {
      stageId,
      inputs: [],
    };
  }

  recordTickInput(input: unknown): void {
    this.#assertEligible('record input');

    if (this.#terminal) {
      throw new Error('Cannot record input after the campaign attempt is terminal.');
    }
    if (this.#activeStage === null) {
      throw new Error('Cannot record input without an active authority stage.');
    }

    const normalized = normalizeMaltlineInput(input, 'ranked proof tick input');
    this.#activeStage.inputs.push(freezeInput(normalized));
  }

  completeStage(finalState: MaltlineRankedProofTerminalState): void {
    this.#assertEligible('complete a stage');

    if (this.#terminal) {
      throw new Error('Cannot complete a stage after the campaign attempt is terminal.');
    }
    if (this.#activeStage === null) {
      if (this.#completedStages.some((stage) => stage.stageId === finalState.scenarioId)) {
        throw new Error(`Cannot complete stage ${finalState.scenarioId} twice.`);
      }
      throw new Error('Cannot complete a stage before its authority stage has begun.');
    }

    const active = this.#activeStage;
    if (finalState.scenarioId !== active.stageId) {
      throw new Error(
        `Cannot complete stage ${finalState.scenarioId}: active authority stage is ${active.stageId}.`,
      );
    }
    if (finalState.status === 'running') {
      throw new Error(`Cannot complete stage ${active.stageId} before it is terminal.`);
    }
    if (finalState.status !== 'won' && finalState.status !== 'lost') {
      throw new Error(`Cannot complete stage ${active.stageId}: invalid terminal status.`);
    }
    if (!Number.isSafeInteger(finalState.tick) || finalState.tick !== active.inputs.length) {
      throw new Error(
        `Cannot complete stage ${active.stageId}: terminal tick ${String(finalState.tick)} does not match ${active.inputs.length} recorded inputs.`,
      );
    }
    if (active.inputs.length === 0) {
      throw new Error(`Cannot complete stage ${active.stageId} without recorded input ticks.`);
    }

    this.#completedStages.push(
      Object.freeze({
        stageId: active.stageId,
        inputRuns: freezeInputRuns(active.inputs),
      }),
    );
    this.#activeStage = null;
    this.#nextStageIndex += 1;

    const completedFinalAuthorityStage = this.#nextStageIndex === this.#stageIds.length;
    this.#terminal = finalState.status === 'lost' || completedFinalAuthorityStage;
  }

  invalidateRankEligibility(reason: string): void {
    if (this.#unavailable !== null) {
      return;
    }
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new TypeError('Rank-ineligibility reason must be a non-empty string.');
    }

    this.#unavailable = Object.freeze({
      status: 'unavailable',
      code: 'rank-ineligible',
      reason,
    });

    // Once an attempt is ineligible, discard captured proof material so no
    // later caller can accidentally retrieve stale ranked data.
    this.#completedStages.length = 0;
    this.#activeStage = null;
    this.#terminal = false;
  }

  finalizeProof(): MaltlineRankedProofResult {
    if (this.#unavailable !== null) {
      return this.#unavailable;
    }
    if (!this.#terminal) {
      throw new Error('Cannot finalize a ranked proof before the campaign attempt is terminal.');
    }

    return Object.freeze({
      status: 'available',
      proof: cloneAndFreezeProof(this.#completedStages),
    });
  }

  #assertEligible(action: string): void {
    if (this.#unavailable !== null) {
      throw new Error(
        `Cannot ${action}: rank eligibility was irreversibly invalidated (${this.#unavailable.reason}).`,
      );
    }
  }
}

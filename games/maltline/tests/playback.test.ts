import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as publicApi from '../src/index';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { MaltlineEngine } from '../src/core/engine';
import {
  createVerifiedMaltlinePlayback,
  MaltlinePlaybackError,
  type VerifiedMaltlinePlayback,
} from '../src/core/playback';
import {
  MAX_MALTLINE_PROOF_TOTAL_TICKS,
  MaltlineProofError,
  verifyAndHashMaltlineProof,
  type HashedMaltlineProof,
  type MaltlineInputRun,
} from '../src/core/proof';
import type { GameEvent, MaltlineInput, MaltlineState } from '../src/core/types';
import {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
} from '../src/testing/generation-2-proofs';

const CHALLENGE = {
  runId: 'run_playback_test_01',
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  nonce: 0x1020_3040,
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
} as const;

let retainedWin: HashedMaltlineProof;
let retainedLoss: HashedMaltlineProof;
let retainedMistake: HashedMaltlineProof;

beforeAll(async () => {
  [retainedWin, retainedLoss, retainedMistake] = await Promise.all([
    verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, CHALLENGE),
    verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, CHALLENGE),
    verifyAndHashMaltlineProof(GENERATION_2_MISTAKE_PROOF, CHALLENGE),
  ]);
});

function expectDeeplyFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) expectDeeplyFrozen(descriptor.value, seen);
  }
}

function inputAt(runs: readonly MaltlineInputRun[], stageTick: number): MaltlineInput {
  let end = 0;
  for (const run of runs) {
    end += run.ticks;
    if (stageTick <= end) {
      return {
        stationDir: run.stationDir,
        laneDir: run.laneDir,
        blend: run.blend,
        serve: run.serve,
      };
    }
  }
  throw new Error('Fixture tick is outside its input runs.');
}

function referenceFrame(
  playback: VerifiedMaltlinePlayback,
  stageIndex: number,
  stageTick: number,
): { state: MaltlineState; events: GameEvent[]; input: MaltlineInput | null } {
  const descriptor = playback.stages[stageIndex]!;
  const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[stageIndex]!;
  const proofStage = playback.verification.envelope.proof.stages[stageIndex]!;
  const engine = new MaltlineEngine(scenario, {
    lives: descriptor.startLives,
    score: descriptor.startScore,
  });
  let state = engine.snapshot();
  let events: GameEvent[] = [];
  let input: MaltlineInput | null = null;
  for (let tick = 1; tick <= stageTick; tick++) {
    input = inputAt(proofStage.inputRuns, tick);
    engine.setInput(input);
    const result = engine.step();
    state = result.state;
    events = result.events;
  }
  return { state, events, input };
}

describe('verified Maltline proof playback', () => {
  it('exposes only the strict retained-envelope factory from the production root', () => {
    expect(publicApi.createVerifiedMaltlinePlayback).toBe(createVerifiedMaltlinePlayback);
    expect(publicApi).not.toHaveProperty('verifyAndHashMaltlineProofEnvelopeForPlaybackInternal');
  });

  it('builds the full-win stage index with unique boundary frames', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);

    expect(playback.verification).toEqual(retainedWin);
    expect(playback.totalInputTicks).toBe(21_662);
    expect(playback.frameCount).toBe(21_670);
    expect(playback.stages.map((stage) => stage.ticks)).toEqual([
      1_558, 1_621, 1_881, 3_120, 3_766, 3_103, 3_312, 3_301,
    ]);
    expect(playback.positionAtFrame(1_558)).toEqual({ stageIndex: 0, stageTick: 1_558 });
    expect(playback.positionAtFrame(1_559)).toEqual({ stageIndex: 1, stageTick: 0 });

    const firstTerminal = playback.frameAtOrdinal(1_558);
    const secondInitial = playback.frameAtOrdinal(1_559);
    expect(firstTerminal.runTick).toBe(1_558);
    expect(secondInitial.runTick).toBe(1_558);
    expect(firstTerminal.state.scenarioId).not.toBe(secondInitial.state.scenarioId);
    expect(secondInitial.appliedInput).toBeNull();
    expect(secondInitial.events).toEqual([]);

    expect(playback.positionAtFrame(21_669)).toEqual({ stageIndex: 7, stageTick: 3_301 });
    expect(playback.frameAtOrdinal(21_669)).toMatchObject({
      frameOrdinal: 21_669,
      runTick: 21_662,
      state: { status: 'won', score: 36_255, lives: 4 },
    });
  });

  it('round-trips every valid frame and preserves deliberate run-tick duplicates', async () => {
    for (const retained of [retainedWin, retainedLoss, retainedMistake]) {
      const playback = await createVerifiedMaltlinePlayback(retained.envelope);
      let previousRunTick = -1;
      for (let ordinal = 0; ordinal < playback.frameCount; ordinal++) {
        const position = playback.positionAtFrame(ordinal);
        const stage = playback.stages[position.stageIndex]!;
        expect(stage.frameStart + position.stageTick).toBe(ordinal);
        const runTick = stage.runStartTick + position.stageTick;
        expect(runTick).toBeGreaterThanOrEqual(previousRunTick);
        previousRunTick = runTick;
      }
      for (let index = 1; index < playback.stages.length; index++) {
        const prior = playback.stages[index - 1]!;
        const current = playback.stages[index]!;
        expect(current.runStartTick).toBe(prior.runStartTick + prior.ticks);
        expect(current.frameStart).toBe(prior.frameStart + prior.ticks + 1);
      }
    }
  });

  it('reconstructs arbitrary forward and backward seeks exactly from canonical RLE', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const firstRunEnd = retainedWin.envelope.proof.stages[0]!.inputRuns[0]!.ticks;
    const positions = [0, 1, firstRunEnd - 1, firstRunEnd, firstRunEnd + 1, 900, 120, 121, 1_558];

    for (const stageTick of positions) {
      const expected = referenceFrame(playback, 0, stageTick);
      const actual = playback.frameAt({ stageIndex: 0, stageTick });
      expect(actual.state).toEqual(expected.state);
      expect(actual.events).toEqual(expected.events);
      expect(actual.appliedInput).toEqual(expected.input);
    }

    playback.frameAt({ stageIndex: 0, stageTick: 300 });
    const adjacent = playback.step();
    expect(adjacent?.state).toEqual(referenceFrame(playback, 0, 301).state);
  });

  it('does not implicitly step across a stage boundary', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const terminal = playback.frameAt({ stageIndex: 0, stageTick: playback.stages[0]!.ticks });
    expect(terminal.state.status).toBe('won');
    expect(playback.step()).toBeNull();

    const next = playback.frameAt({ stageIndex: 1, stageTick: 0 });
    expect(next.frameOrdinal).toBe(terminal.frameOrdinal + 1);
    expect(next.state.tick).toBe(0);
  });

  it('handles terminal loss and verifier-derived stage carry without fabricating stages', async () => {
    const loss = await createVerifiedMaltlinePlayback(retainedLoss.envelope);
    expect(loss.stages).toHaveLength(1);
    expect(loss.totalInputTicks).toBe(1_854);
    expect(loss.frameCount).toBe(1_855);
    expect(loss.frameAtOrdinal(1_854).state).toMatchObject({ status: 'lost', lives: 0, score: 0 });
    expect(() => loss.frameAt({ stageIndex: 1, stageTick: 0 })).toThrow(MaltlinePlaybackError);

    const mistake = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
    const second = mistake.stages[1]!;
    const secondInitial = mistake.frameAt({ stageIndex: 1, stageTick: 0 });
    expect(second.startLives).toBe(3);
    expect(secondInitial.state).toMatchObject({
      tick: 0,
      lives: second.startLives,
      score: second.startScore,
    });
  });

  it('matches every final engine state to the verifier-derived summaries', async () => {
    for (const retained of [retainedWin, retainedLoss, retainedMistake]) {
      const playback = await createVerifiedMaltlinePlayback(retained.envelope);
      let fulfilled = 0;
      let serviceActions = 0;
      let walkouts = 0;
      let resolved = 0;
      let exited = 0;
      let last: MaltlineState | undefined;
      for (const stage of playback.stages) {
        last = playback.frameAt({ stageIndex: stage.stageIndex, stageTick: stage.ticks }).state;
        expect(last.status).toBe(stage.terminalStatus);
        expect(last.score).toBe(stage.endScore);
        expect(last.lives).toBe(stage.endLives);
        fulfilled += last.fulfilled;
        serviceActions += last.serviceActions;
        walkouts += last.walkouts;
        resolved += last.resolved;
        exited += last.exited;
      }
      const summary = retained.envelope.summary;
      expect(last).toMatchObject({ score: summary.score, lives: summary.lives });
      expect({ fulfilled, serviceActions, walkouts, resolved, exited }).toEqual({
        fulfilled: summary.fulfilled,
        serviceActions: summary.serviceActions,
        walkouts: summary.walkouts,
        resolved: summary.resolved,
        exited: summary.exited,
      });
    }
  });

  it('rejects malformed, tampered, noncanonical, and over-limit retained data', async () => {
    const extra = { ...retainedLoss.envelope, browserScore: 0 };
    const summaryTamper = structuredClone(retainedLoss.envelope);
    summaryTamper.summary.score = 1;
    const inputTamper = structuredClone(retainedLoss.envelope) as unknown as {
      proof: { stages: Array<{ inputRuns: Array<Record<string, unknown>> }> };
    };
    inputTamper.proof.stages[0]!.inputRuns[0]!.serve = 1;
    const continuation = structuredClone(retainedLoss.envelope);
    continuation.proof.stages.push(structuredClone(retainedWin.envelope.proof.stages[1]!));
    const overLimit = structuredClone(retainedLoss.envelope);
    overLimit.proof.stages[0]!.inputRuns[0]!.ticks = MAX_MALTLINE_PROOF_TOTAL_TICKS + 1;
    const split = structuredClone(retainedLoss.envelope);
    const original = split.proof.stages[0]!.inputRuns[0]!;
    split.proof.stages[0]!.inputRuns = [
      { ...original, ticks: 900 },
      { ...original, ticks: original.ticks - 900 },
    ];

    for (const value of [extra, summaryTamper, inputTamper, continuation, overLimit, split]) {
      await expect(createVerifiedMaltlinePlayback(value)).rejects.toThrow(MaltlineProofError);
    }
    await expect(createVerifiedMaltlinePlayback(retainedLoss)).rejects.toThrow(MaltlineProofError);
  });

  it('strictly validates coordinates without invoking accessors', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedLoss.envelope);
    for (const ordinal of [-1, playback.frameCount, 1.5, Number.NaN]) {
      expect(() => playback.positionAtFrame(ordinal)).toThrow(MaltlinePlaybackError);
    }
    for (const position of [
      { stageIndex: 0, stageTick: -1 },
      { stageIndex: 0, stageTick: playback.stages[0]!.ticks + 1 },
      { stageIndex: 0, stageTick: 0, extra: true },
      Object.create({ stageIndex: 0, stageTick: 0 }),
    ]) {
      expect(() => playback.frameAt(position as never)).toThrow(MaltlinePlaybackError);
    }

    const getter = vi.fn(() => 0);
    const accessor = { stageIndex: 0 } as Record<string, unknown>;
    Object.defineProperty(accessor, 'stageTick', { enumerable: true, get: getter });
    expect(() => playback.frameAt(accessor as never)).toThrow(/data property/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it('returns deeply frozen frames and descriptors whose mutation cannot drift playback', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const frame = playback.frameAt({ stageIndex: 0, stageTick: 700 });
    const expected = structuredClone(frame.state);
    expectDeeplyFrozen(playback.verification);
    expectDeeplyFrozen(playback.stages);
    expectDeeplyFrozen(frame);

    expect(Reflect.set(frame.state, 'score', -1)).toBe(false);
    expect(Reflect.set(frame.position, 'stageTick', 1)).toBe(false);
    expect(Reflect.set(playback.stages[0]!, 'ticks', 1)).toBe(false);
    expect(playback.frameAt({ stageIndex: 0, stageTick: 700 }).state).toEqual(expected);
    expect(playback.verification.sha256).toBe(retainedWin.sha256);
  });
});

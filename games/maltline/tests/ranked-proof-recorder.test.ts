import { describe, expect, it } from 'vitest';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority.js';
import { MaltlineEngine } from '../src/core/engine.js';
import { verifyAndHashMaltlineProof } from '../src/core/proof.js';
import { GENERATION_2_LOSS_PROOF } from '../src/testing/generation-2-proofs.js';
import {
  MaltlineRankedProofRecorder,
  type MaltlineRankedProofTerminalState,
} from '../src/viewer/ranked-proof-recorder.js';

const IDLE = Object.freeze({
  stationDir: 0 as const,
  laneDir: 0 as const,
  blend: false,
  serve: false,
});

const STAGE_IDS = MALTLINE_GENERATION_2_AUTHORITY.campaign.map((scenario) => scenario.id);

function terminalState(
  scenarioId: string,
  status: 'won' | 'lost',
  tick = 1,
): MaltlineRankedProofTerminalState {
  return { scenarioId, status, tick };
}

describe('MaltlineRankedProofRecorder', () => {
  it('normalizes and clones every tick before encoding public RLE proof runs', () => {
    const recorder = new MaltlineRankedProofRecorder();
    const mutableInput = {
      stationDir: 0,
      laneDir: 0,
      blend: false,
      serve: false,
    };

    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(mutableInput);
    mutableInput.stationDir = 1;
    mutableInput.serve = true;
    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'lost', 2));

    const result = recorder.finalizeProof();
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;

    expect(result.proof.stages).toEqual([
      {
        stageId: STAGE_IDS[0],
        inputRuns: [{ ...IDLE, ticks: 2 }],
      },
    ]);
    expect(Object.isFrozen(result.proof)).toBe(true);
    expect(Object.isFrozen(result.proof.stages)).toBe(true);
    expect(Object.isFrozen(result.proof.stages[0].inputRuns[0])).toBe(true);
  });

  it('rejects invalid tick input before mutating the recorded tick count', () => {
    const recorder = new MaltlineRankedProofRecorder();
    recorder.beginStage(STAGE_IDS[0]);

    expect(() =>
      recorder.recordTickInput({ ...IDLE, stationDir: 2 }),
    ).toThrow(/stationDir/);

    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'lost'));
    const result = recorder.finalizeProof();
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.proof.stages[0].inputRuns).toEqual([{ ...IDLE, ticks: 1 }]);
    }
  });

  it('permits a final proof after a loss on any authority stage', () => {
    const recorder = new MaltlineRankedProofRecorder();

    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'won'));
    recorder.beginStage(STAGE_IDS[1]);
    recorder.recordTickInput({ ...IDLE, serve: true });
    recorder.completeStage(terminalState(STAGE_IDS[1], 'lost'));

    const result = recorder.finalizeProof();
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.proof.stages.map((stage) => stage.stageId)).toEqual(STAGE_IDS.slice(0, 2));
    }
  });

  it('permits a final proof only after victory across the full authority campaign', () => {
    const recorder = new MaltlineRankedProofRecorder();

    STAGE_IDS.forEach((stageId, index) => {
      recorder.beginStage(stageId);
      recorder.recordTickInput(IDLE);
      recorder.completeStage(terminalState(stageId, 'won'));

      if (index < STAGE_IDS.length - 1) {
        expect(() => recorder.finalizeProof()).toThrow(/before .* terminal/i);
      }
    });

    const result = recorder.finalizeProof();
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.proof.stages.map((stage) => stage.stageId)).toEqual(STAGE_IDS);
    }
  });

  it('rejects authority stage gaps and duplicate stage completion', () => {
    const recorder = new MaltlineRankedProofRecorder();

    expect(() => recorder.beginStage(STAGE_IDS[1])).toThrow(/stage gaps/);
    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'won'));

    expect(() => recorder.completeStage(terminalState(STAGE_IDS[0], 'won'))).toThrow(/twice/);
    expect(() => recorder.beginStage(STAGE_IDS[2])).toThrow(/stage gaps/);
    expect(() => recorder.beginStage(STAGE_IDS[0])).toThrow(/already been completed/);
  });

  it('rejects nonterminal completion and finalization before terminal without losing inputs', () => {
    const recorder = new MaltlineRankedProofRecorder();
    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(IDLE);

    expect(() =>
      recorder.completeStage({ scenarioId: STAGE_IDS[0], status: 'running', tick: 1 }),
    ).toThrow(/before it is terminal/);
    expect(() => recorder.finalizeProof()).toThrow(/before .* terminal/i);

    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'lost', 2));
    const result = recorder.finalizeProof();
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.proof.stages[0].inputRuns).toEqual([{ ...IDLE, ticks: 2 }]);
    }
  });

  it('rejects mismatched terminal states, missing ticks, and input after terminal', () => {
    const recorder = new MaltlineRankedProofRecorder();
    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(IDLE);

    expect(() =>
      recorder.completeStage(terminalState(STAGE_IDS[1], 'lost')),
    ).toThrow(/active authority stage/);
    expect(() =>
      recorder.completeStage(terminalState(STAGE_IDS[0], 'lost', 2)),
    ).toThrow(/does not match 1 recorded/);

    recorder.completeStage(terminalState(STAGE_IDS[0], 'lost'));
    expect(() => recorder.recordTickInput(IDLE)).toThrow(/after .* terminal/);
    expect(() => recorder.completeStage(terminalState(STAGE_IDS[0], 'lost'))).toThrow(
      /after .* terminal/,
    );
    expect(() => recorder.beginStage(STAGE_IDS[1])).toThrow(/after .* terminal/);
  });

  it('irreversibly returns a typed unavailable result with the first invalidation reason', () => {
    const recorder = new MaltlineRankedProofRecorder();
    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'lost'));
    expect(recorder.finalizeProof().status).toBe('available');

    recorder.invalidateRankEligibility('window lost focus');
    recorder.invalidateRankEligibility('later reason must not replace the first');

    expect(recorder.finalizeProof()).toEqual({
      status: 'unavailable',
      code: 'rank-ineligible',
      reason: 'window lost focus',
    });
    expect(Object.isFrozen(recorder.finalizeProof())).toBe(true);
    expect(() => recorder.beginStage(STAGE_IDS[0])).toThrow(/irreversibly invalidated/);
    expect(() => recorder.recordTickInput(IDLE)).toThrow(/irreversibly invalidated/);
    expect(() => recorder.completeStage(terminalState(STAGE_IDS[0], 'lost'))).toThrow(
      /irreversibly invalidated/,
    );
  });

  it('rejects an empty invalidation reason without changing eligibility', () => {
    const recorder = new MaltlineRankedProofRecorder();
    expect(() => recorder.invalidateRankEligibility('   ')).toThrow(/non-empty string/);

    recorder.beginStage(STAGE_IDS[0]);
    recorder.recordTickInput(IDLE);
    recorder.completeStage(terminalState(STAGE_IDS[0], 'lost'));
    expect(recorder.finalizeProof().status).toBe('available');
  });

  it('emits an actual terminal proof accepted by the public authority facade', async () => {
    const recorder = new MaltlineRankedProofRecorder();
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!;
    const engine = new MaltlineEngine(scenario, MALTLINE_GENERATION_2_AUTHORITY.initialRun);
    recorder.beginStage(scenario.id);

    for (const run of GENERATION_2_LOSS_PROOF.stages[0]!.inputRuns) {
      const { ticks, ...input } = run;
      for (let tick = 0; tick < ticks; tick++) {
        recorder.recordTickInput(input);
        engine.setInput(input);
        engine.step();
      }
    }
    const terminal = engine.snapshot();
    expect(terminal.status).toBe('lost');
    recorder.completeStage(terminal);
    const result = recorder.finalizeProof();
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.proof).toEqual(GENERATION_2_LOSS_PROOF);

    await expect(verifyAndHashMaltlineProof(result.proof, {
      runId: 'run_viewer_recorder_contract',
      seasonId: 'maltline-generation-2',
      boardId: 'arcade',
      nonce: 0x5245_434f,
      authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
    })).resolves.toMatchObject({
      envelope: { summary: { completed: false, stageReached: 1, lives: 0 } },
    });
  });
});

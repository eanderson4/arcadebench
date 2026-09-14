import { describe, expect, it } from 'vitest';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MaltlineProofError,
  verifyAndHashMaltlineProof,
  type MaltlineInputRun,
  type MaltlineRunProof,
} from '@arcadebench/maltline';
import {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
  MAX_MALTLINE_PROOF_INPUT_RUNS,
  MAX_MALTLINE_PROOF_STAGE_TICKS,
  MAX_MALTLINE_PROOF_TOTAL_TICKS,
} from '@arcadebench/maltline/testing';

const CHALLENGE = Object.freeze({
  runId: 'run_workers_budget_generation_2',
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  nonce: 0x574f_524b,
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
} as const);

// These are regression ceilings, not request limits or latency promises.
const WORKERS_CI_SERIALIZED_BYTE_CEILINGS = Object.freeze({
  canonicalInput: 75_000,
  oneRecordPerTickInput: 1_600_000,
  retainedEnvelope: 75_000,
});

const encoder = new TextEncoder();

function serializedBytes(value: unknown): number {
  return encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;
}

function oneRecordPerTick(proof: MaltlineRunProof): MaltlineRunProof {
  return {
    ...proof,
    stages: proof.stages.map((stage) => ({
      stageId: stage.stageId,
      inputRuns: stage.inputRuns.flatMap(({ ticks, ...input }) => (
        Array.from({ length: ticks }, () => ({ ticks: 1, ...input }))
      )),
    })),
  };
}

function alternatingRuns(length: number): MaltlineInputRun[] {
  return Array.from({ length }, (_unused, index) => ({
    ticks: 1,
    stationDir: index % 2 === 0 ? -1 : 1,
    laneDir: 0,
    blend: false,
    serve: false,
  }));
}

describe('Maltline verifier Workers-runtime budget', () => {
  it('verifies all static generation-2 vectors and records stable byte sizes', async () => {
    const vectors = [
      ['win', GENERATION_2_WIN_PROOF],
      ['loss', GENERATION_2_LOSS_PROOF],
      ['mistake', GENERATION_2_MISTAKE_PROOF],
    ] as const;
    const measurements: Record<string, { input: number; envelope: number; sha256: string }> = {};

    for (const [name, proof] of vectors) {
      const result = await verifyAndHashMaltlineProof(proof, CHALLENGE);
      measurements[name] = {
        input: serializedBytes(proof),
        envelope: serializedBytes(result.canonicalJson),
        sha256: result.sha256,
      };
      expect(measurements[name]!.input)
        .toBeLessThanOrEqual(WORKERS_CI_SERIALIZED_BYTE_CEILINGS.canonicalInput);
      expect(measurements[name]!.envelope)
        .toBeLessThanOrEqual(WORKERS_CI_SERIALIZED_BYTE_CEILINGS.retainedEnvelope);
    }

    expect(measurements).toEqual({
      win: {
        input: 58_016,
        envelope: 58_525,
        sha256: '7b03d0b816be9c78a4e9829a1d0d481f18c4d73c8079871900549064d6260240',
      },
      loss: {
        input: 187,
        envelope: 684,
        sha256: 'c90fd9197ef6ed5451ca5fe13360615e398974e8f84febd11b605c384c3012c1',
      },
      mistake: {
        input: 60_064,
        envelope: 60_573,
        sha256: '7c940c94c6c9dc49afeff43f3b50d7d164d1428c6bd633219c9be03f01221c3a',
      },
    });
  });

  it('accepts adversarial one-record-per-tick segmentation and canonicalizes it', async () => {
    const segmented = oneRecordPerTick(GENERATION_2_WIN_PROOF);
    expect(segmented.stages.reduce((count, stage) => count + stage.inputRuns.length, 0))
      .toBe(21_662);
    expect(serializedBytes(segmented)).toBe(1_445_121);
    expect(serializedBytes(segmented))
      .toBeLessThanOrEqual(WORKERS_CI_SERIALIZED_BYTE_CEILINGS.oneRecordPerTickInput);

    const [canonical, adversarial] = await Promise.all([
      verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, CHALLENGE),
      verifyAndHashMaltlineProof(segmented, CHALLENGE),
    ]);
    expect(adversarial).toEqual(canonical);
  });

  it('pins the hard proof bounds and rejects one-over inputs', async () => {
    expect({
      inputRuns: MAX_MALTLINE_PROOF_INPUT_RUNS,
      stageTicks: MAX_MALTLINE_PROOF_STAGE_TICKS,
      totalTicks: MAX_MALTLINE_PROOF_TOTAL_TICKS,
    }).toEqual({ inputRuns: 60_000, stageTicks: 60_000, totalTicks: 60_000 });

    const exactRuns = structuredClone(GENERATION_2_LOSS_PROOF);
    exactRuns.stages[0]!.inputRuns = alternatingRuns(MAX_MALTLINE_PROOF_INPUT_RUNS);
    await expect(verifyAndHashMaltlineProof(exactRuns, CHALLENGE))
      .rejects.toThrow(/input after stage 1 ended/i);

    const oneRunOver = structuredClone(GENERATION_2_LOSS_PROOF);
    oneRunOver.stages[0]!.inputRuns = alternatingRuns(MAX_MALTLINE_PROOF_INPUT_RUNS + 1);
    await expect(verifyAndHashMaltlineProof(oneRunOver, CHALLENGE))
      .rejects.toThrow(/input runs length is invalid/i);

    const exactStageTicks = structuredClone(GENERATION_2_LOSS_PROOF);
    exactStageTicks.stages[0]!.inputRuns[0]!.ticks = MAX_MALTLINE_PROOF_STAGE_TICKS;
    await expect(verifyAndHashMaltlineProof(exactStageTicks, CHALLENGE))
      .rejects.toThrow(/input after stage 1 ended/i);

    const oneStageTickOver = structuredClone(GENERATION_2_LOSS_PROOF);
    oneStageTickOver.stages[0]!.inputRuns[0]!.ticks = MAX_MALTLINE_PROOF_STAGE_TICKS + 1;
    await expect(verifyAndHashMaltlineProof(oneStageTickOver, CHALLENGE))
      .rejects.toThrow(/integer from 1 to 60000/i);
  });

  it('admits the exact total-tick shape before semantics and rejects one over', async () => {
    const ticksBeforeLastStage = GENERATION_2_WIN_PROOF.stages.slice(0, -1)
      .flatMap((stage) => stage.inputRuns)
      .reduce((ticks, run) => ticks + run.ticks, 0);
    expect(ticksBeforeLastStage).toBe(18_361);

    const atLimit = structuredClone(GENERATION_2_WIN_PROOF);
    atLimit.stages.at(-1)!.inputRuns = [{
      ticks: MAX_MALTLINE_PROOF_TOTAL_TICKS - ticksBeforeLastStage,
      stationDir: 0,
      laneDir: 0,
      blend: false,
      serve: false,
    }];
    await expect(verifyAndHashMaltlineProof(atLimit, CHALLENGE))
      .rejects.toThrow(/input after stage 8 ended/i);

    const overLimit = structuredClone(atLimit);
    overLimit.stages.at(-1)!.inputRuns[0]!.ticks += 1;
    await expect(verifyAndHashMaltlineProof(overLimit, CHALLENGE))
      .rejects.toThrow(/exceeds its total tick limit/i);
  });

  it('keeps test vectors and internal verifier controls off the production root', async () => {
    const productionRoot = await import('@arcadebench/maltline');
    expect(productionRoot).not.toHaveProperty('GENERATION_2_WIN_PROOF');
    expect(productionRoot).not.toHaveProperty('MAX_MALTLINE_PROOF_INPUT_RUNS');
    expect(MaltlineProofError).toBeTypeOf('function');
  });
});

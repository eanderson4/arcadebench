import { describe, expect, it, vi } from 'vitest';
import {
  MALTLINE_CABINET_AUTHORITY as authority, MALTLINE_CABINET_CONFIGURATION,
  MALTLINE_CABINET_CONFIGURATION_SHA256, assertMaltlineCabinetAuthority,
} from '../src/core/cabinet-authority';
import {
  buildMaltlineCabinetProof, verifyMaltlineCabinetProof, MaltlineCabinetProofError,
} from '../src/core/cabinet-proof';
import { sha256Canonical } from '../src/core/fingerprint';
import { MaltlineEngine } from '../src/core/engine';
import { replayMaltline, replayMaltlineCabinet } from '../src/core/replay';
import { IDLE_INPUT } from '../src/core/types';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { cabinetReplays } from './support/cabinet-fixtures';

const binding = { runId: 'run_cabinet_test', nonce: 4294967295 };
const loss = cabinetReplays(false);
const lossProof = buildMaltlineCabinetProof(loss, binding);
const win = cabinetReplays(true);
const winningProof = buildMaltlineCabinetProof(win, binding);
const verify = (value: unknown) => verifyMaltlineCabinetProof(value, binding);

describe('immutable cabinet authority and challenge-bound proof', () => {
  it('pins the full configuration independently from frozen generation two', async () => {
    expect(await sha256Canonical(MALTLINE_CABINET_CONFIGURATION)).toBe(MALTLINE_CABINET_CONFIGURATION_SHA256);
    expect(authority.configurationSha256).not.toBe(MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256);
    expect(authority.gameVersion).toBe('cabinet-1');
    expect(Object.isFrozen(authority.campaign[0])).toBe(true);
    expect(Object.isFrozen(authority.rules)).toBe(true);
    expect(assertMaltlineCabinetAuthority).not.toThrow();
  });

  it('verifies the full authored campaign and carries score/lives across all eight stages', () => {
    const result = verify(winningProof);
    expect(result.summary).toEqual({ score: 36255, lives: 4, stageReached: 8, stagesCleared: 8,
      completed: true, totalTicks: 21662, fulfilled: 145, serviceActions: 145,
      walkouts: 0, resolved: 145, exited: 145 });
    expect(JSON.parse(result.canonicalJson)).toEqual({ proof: result.proof, summary: result.summary });
    expect(result.proof.stages).toHaveLength(8);
  });

  it('accepts a terminal loss and computes its score from inputs', () => {
    expect(verify(lossProof).summary).toMatchObject({ score: 0, lives: 0, stageReached: 1,
      stagesCleared: 0, completed: false, walkouts: 4, totalTicks: loss[0]!.finalState.tick });
  });

  it('executes cabinet discard semantics instead of the legacy generation-two engine mode', () => {
    const stage = authority.campaign[0]!;
    const inputs = Array.from({ length: 5000 }, (_, index) => ({ ...IDLE_INPUT,
      blend: index < stage.blendTicks + 2,
      stationDir: (index === Math.ceil((stage.blendTicks + 4) / stage.stationRepeatTicks)
        * stage.stationRepeatTicks - 1 ? 1 : 0) as 0 | 1,
    }));
    const cabinet = replayMaltlineCabinet(stage, authority.initialRun, inputs);
    const legacy = replayMaltline(stage, authority.initialRun, inputs);
    expect(cabinet.finalState.player.holding).toBeNull();
    expect(legacy.finalState.player.holding).toBe('vanilla');
    const proof = buildMaltlineCabinetProof([cabinet], binding);
    expect(verify(proof).summary.lives).toBe(0);
  });

  it('rejects nonce, run, authority, and legacy version substitutions', () => {
    for (const replacement of [
      { challenge: { ...binding, nonce: 0 } }, { challenge: { ...binding, runId: 'run_other' } },
      { gameVersion: '0.1.0' }, { version: 3 },
      { authorityId: MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256 },
    ]) expect(() => verify({ ...lossProof, ...replacement })).toThrow(MaltlineCabinetProofError);
    expect(() => verify(loss[0])).toThrow(MaltlineCabinetProofError);
  });

  it('rejects injected state, missing/extra fields and accessor inputs without reading them', () => {
    expect(() => verify({ ...lossProof, score: 999999 })).toThrow(/fields/);
    expect(() => verify({ ...lossProof, stages: [{ ...lossProof.stages[0], run: { lives: 99 } }] })).toThrow(/fields/);
    const value = structuredClone(lossProof);
    const getter = vi.fn(() => false);
    Object.defineProperty(value.stages[0]!.inputRuns[0]!, 'serve', { enumerable: true, get: getter });
    expect(() => verify(value)).toThrow(/data property/);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    { ticks: 0 }, { ticks: -1 }, { ticks: 1.5 }, { ticks: Infinity },
    { stationDir: 2 }, { laneDir: 0.5 }, { blend: 1 }, { serve: 'false' },
  ])('rejects malformed input encoding %j', replacement => {
    const value = structuredClone(lossProof);
    Object.assign(value.stages[0]!.inputRuns[0]!, replacement);
    expect(() => verify(value)).toThrow(MaltlineCabinetProofError);
  });

  it('normalizes negative zero and merges equivalent adjacent runs canonically', () => {
    const value = structuredClone(lossProof);
    const original = value.stages[0]!.inputRuns[0]!;
    value.stages[0]!.inputRuns = [{ ...original, ticks: 1, stationDir: -0, laneDir: -0 },
      { ...original, ticks: original.ticks - 1 }];
    expect(verify(value).canonicalJson).toBe(verify(lossProof).canonicalJson);
  });

  it('preflights resource limits before any engine execution', () => {
    const step = vi.spyOn(MaltlineEngine.prototype, 'step');
    const value = structuredClone(lossProof);
    value.stages[0]!.inputRuns[0]!.ticks = 60001;
    expect(() => verify(value)).toThrow(/limits/);
    expect(step).not.toHaveBeenCalled();
    const total = structuredClone(winningProof);
    total.stages[7]!.inputRuns[0]!.ticks = 59999;
    expect(() => verify(total)).toThrow(/limits/);
    expect(step).not.toHaveBeenCalled();
    step.mockRestore();
  });

  it('rejects won prefixes, missing/reordered stages, continuation after loss and trailing inputs', () => {
    expect(() => verify({ ...winningProof, stages: winningProof.stages.slice(0, 1) })).toThrow(/remaining/);
    expect(() => verify({ ...winningProof, stages: winningProof.stages.slice(1) })).toThrow(/order/);
    expect(() => verify({ ...lossProof, stages: [...lossProof.stages, winningProof.stages[1]] })).toThrow(/lost/);
    const value = structuredClone(lossProof);
    value.stages[0]!.inputRuns[0]!.ticks++;
    expect(() => verify(value)).toThrow(/terminal tick/);
    value.stages[0]!.inputRuns[0]!.ticks -= 2;
    expect(() => verify(value)).toThrow(/incomplete/);
  });

  it('builder rejects forged scenario, final score, carryover and wrong replay identity', () => {
    const altered = structuredClone(loss);
    altered[0]!.scenario.seed++;
    expect(() => buildMaltlineCabinetProof(altered, binding)).toThrow(/scenario/);
    const inflated = structuredClone(win);
    inflated[1]!.run.score++;
    expect(() => buildMaltlineCabinetProof(inflated, binding)).toThrow(/carryover/);
    const final = structuredClone(loss);
    final[0]!.finalState.score++;
    expect(() => buildMaltlineCabinetProof(final, binding)).toThrow(/carryover/);
    const identity = structuredClone(loss);
    Object.assign(identity[0]!, { version: 2 });
    expect(() => buildMaltlineCabinetProof(identity, binding)).toThrow(/v3/);
  });
});

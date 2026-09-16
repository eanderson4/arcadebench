import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import type { ControlInput } from '../src/core/types';
import {
  SMILEFALL_CURRENT_RANKED_AUTHORITY,
  SmilefallProofError,
  buildSmilefallRankedProof,
  rankedMirror,
  resolveOfficialSmilefallScenario,
  verifySmilefallRankedProof,
  type SmilefallProofStage,
  type SmilefallRankedChallenge,
} from '../src/verifier';

function terminalStage(
  levelId: string,
  difficulty: SmilefallRankedChallenge['difficulty'],
  nonce: number,
  input: ControlInput = { lean: 'none', hop: false },
): SmilefallProofStage {
  const engine = new SmilefallEngine(resolveOfficialSmilefallScenario(levelId, difficulty, nonce));
  const ticks: SmilefallProofStage['ticks'] = [];
  while (engine.snapshot().status === 'running') {
    engine.setInput(input);
    const result = engine.step();
    ticks.push({ tick: result.state.tick, input });
  }
  return { levelId, ticks };
}

describe('Smilefall ranked proof verifier', () => {
  it('publishes a frozen official authority surface', () => {
    expect(SMILEFALL_CURRENT_RANKED_AUTHORITY).toMatchObject({
      gameId: 'smilefall',
      gameVersion: '1.0.0',
      authorityId: 'smilefall-challenge-v1',
      difficulties: ['giggle', 'chuckle', 'guffaw', 'cackle'],
    });
    expect(SMILEFALL_CURRENT_RANKED_AUTHORITY.arcadeLevelIds).toHaveLength(10);
    expect(SMILEFALL_CURRENT_RANKED_AUTHORITY.levels.length).toBeGreaterThan(10);
  });

  it('reconstructs an official level and derives its score', () => {
    const challenge: SmilefallRankedChallenge = {
      runId: 'run-level',
      nonce: 42,
      boardId: 'level',
      difficulty: 'chuckle',
      levelId: 'first-giggle',
    };
    const stage = terminalStage(challenge.levelId!, challenge.difficulty, challenge.nonce);
    const proof = buildSmilefallRankedProof([stage], challenge);
    const verified = verifySmilefallRankedProof(proof, challenge, '1.0.0');
    expect(verified.summary).toEqual({
      scope: 'level',
      difficulty: 'chuckle',
      levelId: 'first-giggle',
      won: true,
      score: expect.any(Number),
      totalTicks: stage.ticks.length,
      popped: 0,
      caught: expect.any(Number),
    });
    expect(JSON.parse(verified.canonicalJson)).toEqual(proof);
  });

  it('accepts an arcade run that terminates on its first failed stage', () => {
    const challenge: SmilefallRankedChallenge = {
      runId: 'run-arcade',
      nonce: 84,
      boardId: 'arcade',
      difficulty: 'cackle',
    };
    const stage = terminalStage('first-giggle', challenge.difficulty, challenge.nonce, { lean: 'left', hop: false });
    const verified = verifySmilefallRankedProof(
      buildSmilefallRankedProof([stage], challenge),
      challenge,
      '1.0.0',
    );
    expect(verified.summary).toMatchObject({
      scope: 'arcade',
      difficulty: 'cackle',
      completed: false,
      stageReached: 1,
      stagesCleared: 0,
      totalTicks: stage.ticks.length,
      popped: 0,
    });
  });

  it('rejects challenge substitution and client-authored fields', () => {
    const challenge: SmilefallRankedChallenge = {
      runId: 'run-bound',
      nonce: 101,
      boardId: 'level',
      difficulty: 'chuckle',
      levelId: 'first-giggle',
    };
    const proof = buildSmilefallRankedProof(
      [terminalStage(challenge.levelId!, challenge.difficulty, challenge.nonce)],
      challenge,
    );
    expect(() => verifySmilefallRankedProof(
      { ...proof, nonce: 102 },
      challenge,
      '1.0.0',
    )).toThrow(SmilefallProofError);
    expect(() => verifySmilefallRankedProof(
      { ...proof, score: 999_999 },
      challenge,
      '1.0.0',
    )).toThrow(/unsupported fields/);
  });

  it('rejects non-contiguous and nonterminal input streams', () => {
    const challenge: SmilefallRankedChallenge = {
      runId: 'run-stream',
      nonce: 202,
      boardId: 'level',
      difficulty: 'chuckle',
      levelId: 'first-giggle',
    };
    const full = terminalStage(challenge.levelId!, challenge.difficulty, challenge.nonce);
    const short = buildSmilefallRankedProof([
      { ...full, ticks: full.ticks.slice(0, 10) },
    ], challenge);
    expect(() => verifySmilefallRankedProof(short, challenge, '1.0.0')).toThrow(/not terminal/);

    const skipped = buildSmilefallRankedProof([
      {
        ...full,
        ticks: full.ticks.map((tick, index) => index === 3 ? { ...tick, tick: 99 } : tick),
      },
    ], challenge);
    expect(() => verifySmilefallRankedProof(skipped, challenge, '1.0.0')).toThrow(/contiguous/);
  });

  it('uses the challenge nonce to vary the official input problem', () => {
    const levelId = 'split-decision';
    const firstNonce = 300;
    let secondNonce = firstNonce + 1;
    while (rankedMirror(firstNonce, levelId) === rankedMirror(secondNonce, levelId)) secondNonce++;
    const first: SmilefallRankedChallenge = {
      runId: 'run-first',
      nonce: firstNonce,
      boardId: 'level',
      difficulty: 'chuckle',
      levelId,
    };
    const second: SmilefallRankedChallenge = { ...first, runId: 'run-second', nonce: secondNonce };
    const stage = terminalStage(levelId, first.difficulty, first.nonce, { lean: 'left', hop: false });
    const original = verifySmilefallRankedProof(buildSmilefallRankedProof([stage], first), first, '1.0.0');
    const rebound = buildSmilefallRankedProof([stage], second);

    try {
      const copied = verifySmilefallRankedProof(rebound, second, '1.0.0');
      expect(copied.summary).not.toEqual(original.summary);
    } catch (error) {
      expect(error).toBeInstanceOf(SmilefallProofError);
    }
  });
});

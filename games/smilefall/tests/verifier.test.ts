import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import { FIXED_SCALE, SMILEY_RADIUS } from '../src/core/physics';
import type { ControlInput, SmilefallState } from '../src/core/types';
import { smilefallCatalog } from '../src/levels/catalog';
import { validateLevel } from '../src/levels/toolbox';
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
  input: ControlInput | ((state: SmilefallState) => ControlInput) = { lean: 'none', hop: false },
): SmilefallProofStage {
  const engine = new SmilefallEngine(resolveOfficialSmilefallScenario(levelId, difficulty, nonce));
  const ticks: SmilefallProofStage['ticks'] = [];
  while (engine.snapshot().status === 'running') {
    const appliedInput = typeof input === 'function' ? input(engine.snapshot()) : input;
    engine.setInput(appliedInput);
    const result = engine.step();
    ticks.push({ tick: result.state.tick, input: appliedInput });
  }
  return { levelId, ticks };
}

function catchPilot(state: SmilefallState): ControlInput {
  const smiley = [...state.smilies].sort((a, b) => b.position.y - a.position.y)[0];
  const open = state.buckets.filter((bucket) => bucket.filled < bucket.capacity);
  if (!smiley || open.length < 1) return { lean: 'none', hop: false };
  const targetX = open
    .map((bucket) => bucket.x + bucket.width / 2)
    .sort((a, b) => Math.abs(a - smiley.position.x) - Math.abs(b - smiley.position.x))[0]!;
  const delta = targetX - smiley.position.x;
  return {
    lean: Math.abs(delta) < FIXED_SCALE * 0.2 ? 'none' : delta > 0 ? 'right' : 'left',
    hop: false,
  };
}

function swapLean(stage: SmilefallProofStage): SmilefallProofStage {
  return {
    ...stage,
    ticks: stage.ticks.map((tick) => ({
      ...tick,
      input: {
        ...tick.input,
        lean: tick.input.lean === 'left' ? 'right' : tick.input.lean === 'right' ? 'left' : 'none',
      },
    })),
  };
}

describe('Smilefall ranked proof verifier', () => {
  it('publishes a frozen official authority surface', () => {
    expect(SMILEFALL_CURRENT_RANKED_AUTHORITY).toMatchObject({
      gameId: 'smilefall',
      gameVersion: '1.0.0',
      authorityId: 'smilefall-challenge-v2',
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

  it('keeps nonce-derived layouts within authored safety margins', () => {
    const smileyMargin = SMILEY_RADIUS / FIXED_SCALE;
    const signatures = new Set<string>();
    for (let nonce = 0; nonce < 128; nonce++) {
      const levelId = 'sky-ladder';
      const authored = resolveOfficialSmilefallScenario(levelId, 'chuckle');
      const ranked = resolveOfficialSmilefallScenario(levelId, 'chuckle', nonce);
      const mirror = rankedMirror(nonce, levelId);
      signatures.add(JSON.stringify({
        drops: ranked.drops.map(({ tick, x }) => [tick, x]),
        rocks: ranked.rocks.map(({ tick, y, from }) => [tick, y, from]),
      }));

      expect(ranked.timeLimitTicks).toBe(authored.timeLimitTicks + 10);
      expect(validateLevel(ranked).errors).toEqual([]);
      for (const [index, drop] of ranked.drops.entries()) {
        const original = authored.drops[index]!;
        const mirroredX = mirror ? authored.width - original.x : original.x;
        expect(drop.tick - original.tick).toBeGreaterThanOrEqual(0);
        expect(drop.tick - original.tick).toBeLessThanOrEqual(10);
        expect(Math.abs(drop.x - mirroredX)).toBeLessThanOrEqual(0.600_001);
        expect(drop.x).toBeGreaterThanOrEqual(smileyMargin);
        expect(drop.x).toBeLessThanOrEqual(authored.width - smileyMargin);
      }
      for (const [index, rock] of ranked.rocks.entries()) {
        const original = authored.rocks[index]!;
        expect(rock.tick - original.tick).toBeGreaterThanOrEqual(0);
        expect(rock.tick - original.tick).toBeLessThanOrEqual(10);
        expect(Math.abs(rock.y - original.y)).toBeLessThanOrEqual(0.400_001);
        expect(rock.hazard).toBe(original.hazard);
        expect(rock.kind).toBe(original.kind);
        expect(rock.speed).toBe(original.speed);
      }
    }
    expect(signatures.size).toBe(128);

    const formationAuthored = resolveOfficialSmilefallScenario('smiley-storm', 'chuckle');
    const formationRanked = resolveOfficialSmilefallScenario('smiley-storm', 'chuckle', 77);
    const formationMirrored = rankedMirror(77, 'smiley-storm');
    for (let index = 1; index < 4; index++) {
      expect(formationAuthored.drops[index]!.tick).toBe(formationAuthored.drops[0]!.tick);
      expect(formationRanked.drops[index]!.tick).toBe(formationRanked.drops[0]!.tick);
      const firstBaseX = formationMirrored
        ? formationAuthored.width - formationAuthored.drops[0]!.x
        : formationAuthored.drops[0]!.x;
      const currentBaseX = formationMirrored
        ? formationAuthored.width - formationAuthored.drops[index]!.x
        : formationAuthored.drops[index]!.x;
      expect(formationRanked.drops[index]!.x - currentBaseX)
        .toBeCloseTo(formationRanked.drops[0]!.x - firstBaseX, 10);
    }

    const closeRockAuthored = resolveOfficialSmilefallScenario('sky-ladder', 'chuckle');
    const closeRockRanked = resolveOfficialSmilefallScenario('sky-ladder', 'chuckle', 77);
    const plainIndex = closeRockAuthored.rocks.findIndex((rock) => rock.tick === 905);
    const spikedIndex = closeRockAuthored.rocks.findIndex((rock) => rock.tick === 900);
    expect(closeRockRanked.rocks[plainIndex]!.tick - closeRockRanked.rocks[spikedIndex]!.tick).toBe(5);

    for (const stage of smilefallCatalog) {
      for (const nonce of [0, 1, 0x1234_5678, 0xffff_ffff]) {
        expect(validateLevel(
          resolveOfficialSmilefallScenario(stage.metadata.slug, 'chuckle', nonce),
        ).errors, `${stage.metadata.slug}:${nonce}`).toEqual([]);
      }
    }
    expect(() => resolveOfficialSmilefallScenario('first-giggle', 'chuckle', 0x1_0000_0000))
      .toThrow(/nonce/);
  });

  it('rejects exact and left-right-swapped cached proofs under a fresh nonce', () => {
    const levelId = 'first-giggle';
    const source: SmilefallRankedChallenge = {
      runId: 'run-source',
      nonce: 0x1020_3040,
      boardId: 'level',
      difficulty: 'chuckle',
      levelId,
    };
    const fresh: SmilefallRankedChallenge = {
      ...source,
      runId: 'run-fresh',
      nonce: source.nonce + 1,
    };
    expect(rankedMirror(source.nonce, levelId)).not.toBe(rankedMirror(fresh.nonce, levelId));

    const cachedStage = terminalStage(levelId, source.difficulty, source.nonce, catchPilot);
    const cachedProof = buildSmilefallRankedProof([cachedStage], source);
    expect(verifySmilefallRankedProof(cachedProof, source, '1.0.0').summary)
      .toMatchObject({ scope: 'level', won: true });

    expect(() => verifySmilefallRankedProof(
      buildSmilefallRankedProof([cachedStage], fresh),
      fresh,
      '1.0.0',
    )).toThrow(/not terminal|after its terminal/);
    expect(() => verifySmilefallRankedProof(
      buildSmilefallRankedProof([swapLean(cachedStage)], fresh),
      fresh,
      '1.0.0',
    )).toThrow(/not terminal|after its terminal/);
  });
});

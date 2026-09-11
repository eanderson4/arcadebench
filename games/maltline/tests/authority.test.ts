import { describe, expect, it, vi } from 'vitest';
import * as publicApi from '../src/index';
import {
  MALTLINE_AUTHORITY_REGISTRY,
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
  createGeneration2AuthorityForTesting,
  getMaltlineAuthorityConfiguration,
  verifyMaltlineAuthorityConfiguration,
} from '../src/core/authority';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import {
  MAX_CANONICAL_JSON_DEPTH,
  canonicalJson,
  sha256Canonical,
  type CanonicalValue,
} from '../src/core/fingerprint';
import {
  MALTLINE_PROOF_ENVELOPE_VERSION,
  MaltlineProofError,
  verifyAndHashMaltlineProof,
  verifyAndHashMaltlineProofEnvelope,
} from '../src/core/proof';
import type { MaltlineScenario } from '../src/core/types';
import {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
} from '../src/testing/generation-2-proofs';

const CHALLENGE = {
  runId: 'run_golden_generation_2',
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  nonce: 0x1234_5678,
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
} as const;

function expectDeeplyFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) expectDeeplyFrozen(descriptor.value, seen);
  }
}

describe('generation 2 campaign authority', () => {
  it('pins one exact, deeply frozen authority and configuration digest', async () => {
    expect(MALTLINE_AUTHORITY_REGISTRY).toEqual([MALTLINE_GENERATION_2_AUTHORITY]);
    expect(MALTLINE_GENERATION_2_AUTHORITY.identity).toEqual({
      gameId: 'maltline',
      rulesetVersion: 2,
      campaignGeneration: 2,
      configurationSha256: 'e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469',
    });
    expect(MALTLINE_GENERATION_2_AUTHORITY).toMatchObject({
      authoritySchemaVersion: 1,
      scenarioSchemaVersion: 1,
      proofSchemaVersion: 1,
      rng: { id: 'mulberry32', version: 1 },
      initialRun: { lives: 4, score: 0 },
      rankingPolicy: {
        id: 'campaign-progress-score-v1',
        order: [
          { field: 'completed', direction: 'descending' },
          { field: 'stageReached', direction: 'descending' },
          { field: 'score', direction: 'descending' },
          { field: 'totalTicks', direction: 'ascending' },
          { field: 'fulfilled', direction: 'descending' },
        ],
      },
    });
    expect(MALTLINE_GENERATION_2_AUTHORITY.campaign.map((stage) => stage.id)).toEqual([
      'maltline-01-first-pour',
      'maltline-02-two-tap',
      'maltline-03-three-windows',
      'maltline-04-lunch-rush',
      'maltline-05-jar-shortage',
      'maltline-06-thick-shakes',
      'maltline-07-happy-hour',
      'maltline-08-closing-time',
    ]);
    expectDeeplyFrozen(MALTLINE_GENERATION_2_AUTHORITY);
    expect(MALTLINE_CAMPAIGN).toBe(MALTLINE_GENERATION_2_AUTHORITY.campaign);
    expectDeeplyFrozen(MALTLINE_CAMPAIGN);
    await expect(sha256Canonical(
      getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY),
    )).resolves.toBe(MALTLINE_GENERATION_2_CONFIGURATION_SHA256);
  });

  it('cannot mutate the public campaign alias away from the registered authority', () => {
    const originalStage = MALTLINE_CAMPAIGN[0]!;
    const originalName = originalStage.name;
    const originalStation = originalStage.stations[0];

    expect(Reflect.set(MALTLINE_CAMPAIGN, '0', { ...originalStage, name: 'Drifted' })).toBe(false);
    expect(Reflect.set(originalStage, 'name', 'Drifted')).toBe(false);
    expect(Reflect.set(originalStage.stations, '0', 'chocolate')).toBe(false);

    expect(MALTLINE_CAMPAIGN).toBe(MALTLINE_GENERATION_2_AUTHORITY.campaign);
    expect(MALTLINE_CAMPAIGN[0]!.name).toBe(originalName);
    expect(MALTLINE_CAMPAIGN[0]!.stations[0]).toBe(originalStation);
  });

  it('fails closed when a frozen authority does not match its pinned digest', async () => {
    await expect(verifyMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY))
      .resolves.toBe(MALTLINE_GENERATION_2_AUTHORITY);

    const mismatched = createGeneration2AuthorityForTesting(
      structuredClone(MALTLINE_CAMPAIGN),
      '0'.repeat(64),
    );
    await expect(verifyMaltlineAuthorityConfiguration(mismatched))
      .rejects.toThrow(/pinned digest/i);
  });

  it('copies normalized source data before registration', () => {
    const mutableSource = structuredClone(MALTLINE_CAMPAIGN) as MaltlineScenario[];
    const isolated = createGeneration2AuthorityForTesting(mutableSource, '0'.repeat(64));
    mutableSource[0]!.name = 'Mutated after construction';
    mutableSource[0]!.stations = ['chocolate'];

    expect(isolated.campaign[0]!.name).toBe('First Pour');
    expect(isolated.campaign[0]!.stations).toEqual(['vanilla']);
    expectDeeplyFrozen(isolated);
  });

  it('makes every authority dimension tamper-sensitive', async () => {
    type MutableConfiguration = {
      gameId: string;
      scenarioSchemaVersion: number;
      proofSchemaVersion: number;
      rng: { version: number };
      rules: { serveBaseScore: number };
      campaign: Array<{ seed: number }>;
      initialRun: { lives: number };
      rankingPolicy: { id: string };
    };
    const source = getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY);
    for (const mutate of [
      (value: MutableConfiguration) => { value.gameId = 'maltline-tampered'; },
      (value: MutableConfiguration) => { value.scenarioSchemaVersion += 1; },
      (value: MutableConfiguration) => { value.proofSchemaVersion += 1; },
      (value: MutableConfiguration) => { value.rng.version += 1; },
      (value: MutableConfiguration) => { value.rules.serveBaseScore += 1; },
      (value: MutableConfiguration) => { value.campaign[0]!.seed += 1; },
      (value: MutableConfiguration) => { value.campaign.reverse(); },
      (value: MutableConfiguration) => { value.initialRun.lives += 1; },
      (value: MutableConfiguration) => { value.rankingPolicy.id += '-changed'; },
    ]) {
      const changed = structuredClone(source) as unknown as MutableConfiguration;
      mutate(changed);
      await expect(sha256Canonical(changed as unknown as CanonicalValue))
        .resolves.not.toBe(MALTLINE_GENERATION_2_CONFIGURATION_SHA256);
    }
  });
});

describe('hardened canonical JSON', () => {
  it('is key-order stable and produces stable SHA-256 in repeated calls', async () => {
    const first = { z: [3, 2, 1], a: { second: true, first: null } } as const;
    const second = { a: { first: null, second: true }, z: [3, 2, 1] } as const;
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    const hashes = await Promise.all(Array.from({ length: 8 }, () => sha256Canonical(first)));
    expect(new Set(hashes)).toEqual(new Set([hashes[0]]));
    expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects cycles, non-finite values, exotic objects, symbols, and deep data', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle as CanonicalValue)).toThrow(/cycles/i);
    expect(() => canonicalJson({ value: Number.NaN } as CanonicalValue)).toThrow(/finite/i);
    expect(() => canonicalJson(new Date() as unknown as CanonicalValue)).toThrow(/plain object/i);
    expect(() => canonicalJson({ [Symbol('hidden')]: true } as CanonicalValue)).toThrow(/symbol/i);

    let deep: CanonicalValue = null;
    for (let depth = 0; depth <= MAX_CANONICAL_JSON_DEPTH; depth++) deep = { deep };
    expect(() => canonicalJson(deep)).toThrow(/maximum depth/i);
  });

  it('rejects accessors without invoking them', () => {
    const getter = vi.fn(() => 'secret');
    const value = {} as Record<string, unknown>;
    Object.defineProperty(value, 'unsafe', { enumerable: true, get: getter });
    expect(() => canonicalJson(value as CanonicalValue)).toThrow(/data property/i);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('authoritative verify-and-hash facade', () => {
  it('pins the static proof vectors independently of simulation', async () => {
    await expect(Promise.all([
      sha256Canonical(GENERATION_2_WIN_PROOF as unknown as CanonicalValue),
      sha256Canonical(GENERATION_2_LOSS_PROOF as unknown as CanonicalValue),
      sha256Canonical(GENERATION_2_MISTAKE_PROOF as unknown as CanonicalValue),
    ])).resolves.toEqual([
      'cd5fb2cbd169e05a1914440fea3baa4d4987fa7bd52d21a09f620bfd6892b643',
      '3623b1034185292fb9459dcf18522434afaacb6d4d11a7000fe0bfc48459ccd5',
      'e1ca07fb4ad3ce75ccf19b00c0e5eeedc1037cc4b9d163f8fd0b56b2064a9108',
    ]);
  });

  it('verifies the static generation 2 win golden and exact envelope v3 shape', async () => {
    const result = await verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, CHALLENGE);

    expect(MALTLINE_PROOF_ENVELOPE_VERSION).toBe(3);
    expect(Object.keys(result.envelope)).toEqual([
      'envelopeVersion', 'authority', 'challenge', 'proof', 'summary',
    ]);
    expect(result.envelope.authority).toEqual(MALTLINE_GENERATION_2_AUTHORITY.identity);
    expect(result.envelope.challenge).toEqual({
      runId: 'run_golden_generation_2',
      seasonId: 'maltline-generation-2',
      boardId: 'arcade',
      nonce: 0x1234_5678,
    });
    expect(result.envelope.summary).toEqual({
      score: 36_255,
      lives: 4,
      stageReached: 8,
      stagesCleared: 8,
      completed: true,
      totalTicks: 21_662,
      fulfilled: 145,
      serviceActions: 145,
      walkouts: 0,
      resolved: 145,
      exited: 145,
    });
    expect(result.envelope.proof.stages.map((stage) => (
      stage.inputRuns.reduce((ticks, run) => ticks + run.ticks, 0)
    ))).toEqual([1_558, 1_621, 1_881, 3_120, 3_766, 3_103, 3_312, 3_301]);
    expect(result.sha256).toBe('ab2661e514950db79b159aa4342cc61b2f6feba8b7aca4a80346112379d1660f');
    expect(result.canonicalJson).toBe(canonicalJson(result.envelope as unknown as CanonicalValue));
    expectDeeplyFrozen(result);
  });

  it('verifies the static generation 2 loss golden', async () => {
    const result = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, CHALLENGE);
    expect(result.envelope.summary).toEqual({
      score: 0,
      lives: 0,
      stageReached: 1,
      stagesCleared: 0,
      completed: false,
      totalTicks: 1_854,
      fulfilled: 0,
      serviceActions: 0,
      walkouts: 4,
      resolved: 4,
      exited: 0,
    });
    expect(result.sha256).toBe('f703bc8f898c1533fca2a71d3ca576ce400b2f27662d461d74597bf0df771d47');
  });

  it('independently replays retained envelopes and rejects server-summary drift', async () => {
    const retained = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, CHALLENGE);
    await expect(verifyAndHashMaltlineProofEnvelope(retained.envelope)).resolves.toEqual(retained);

    const tampered = structuredClone(retained.envelope);
    tampered.summary.score = 1;
    await expect(verifyAndHashMaltlineProofEnvelope(tampered)).rejects.toThrow(
      /does not match its verified outcome/u,
    );
    await expect(verifyAndHashMaltlineProofEnvelope({
      ...retained.envelope,
      browserScore: 1,
    })).rejects.toThrow(/exactly/u);
  });

  it('verifies the static mistake/life-carry golden', async () => {
    const result = await verifyAndHashMaltlineProof(GENERATION_2_MISTAKE_PROOF, CHALLENGE);
    expect(result.envelope.summary).toEqual({
      score: 34_060,
      lives: 3,
      stageReached: 8,
      stagesCleared: 8,
      completed: true,
      totalTicks: 22_400,
      fulfilled: 144,
      serviceActions: 151,
      walkouts: 1,
      resolved: 145,
      exited: 144,
    });
    expect(result.sha256).toBe('ece5b627396f87fc795974ddf492e4950a6028f0d3e37a8b98ddad6943359736');
  });

  it('canonicalizes split RLE and challenge key order, and binds all challenge fields', async () => {
    const split = structuredClone(GENERATION_2_WIN_PROOF);
    const first = split.stages[0]!.inputRuns.shift()!;
    split.stages[0]!.inputRuns.unshift(
      { ...first, ticks: 1 },
      { ...first, ticks: first.ticks - 1 },
    );
    const reorderedChallenge = {
      authority: {
        configurationSha256: CHALLENGE.authority.configurationSha256,
        campaignGeneration: CHALLENGE.authority.campaignGeneration,
        rulesetVersion: CHALLENGE.authority.rulesetVersion,
        gameId: CHALLENGE.authority.gameId,
      },
      nonce: CHALLENGE.nonce,
      boardId: CHALLENGE.boardId,
      seasonId: CHALLENGE.seasonId,
      runId: CHALLENGE.runId,
    };
    const [original, equivalent] = await Promise.all([
      verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, CHALLENGE),
      verifyAndHashMaltlineProof(split, reorderedChallenge),
    ]);
    expect(equivalent).toEqual(original);

    for (const changedChallenge of [
      { ...CHALLENGE, runId: 'another-run' },
      { ...CHALLENGE, seasonId: 'another-season' },
      { ...CHALLENGE, nonce: CHALLENGE.nonce + 1 },
    ]) {
      const changed = await verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, changedChallenge);
      expect(changed.sha256).not.toBe(original.sha256);
    }
  });

  it('treats nonce as envelope binding, not gameplay input', async () => {
    const first = await verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, CHALLENGE);
    const second = await verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, {
      ...CHALLENGE,
      nonce: CHALLENGE.nonce + 1,
    });

    expect(second.envelope.proof).toEqual(first.envelope.proof);
    expect(second.envelope.summary).toEqual(first.envelope.summary);
    expect(second.envelope.challenge.nonce).not.toBe(first.envelope.challenge.nonce);
    expect(second.sha256).not.toBe(first.sha256);
  });

  it('strictly rejects legacy seed, missing nonce, and invalid nonce values', async () => {
    const { nonce: _nonce, ...withoutNonce } = CHALLENGE;
    for (const invalidChallenge of [
      { ...withoutNonce, seed: 0x1234_5678 },
      withoutNonce,
      { ...CHALLENGE, nonce: -1 },
      { ...CHALLENGE, nonce: 0x1_0000_0000 },
      { ...CHALLENGE, nonce: 1.5 },
      { ...CHALLENGE, nonce: '305419896' },
      { ...CHALLENGE, nonce: true },
    ]) {
      await expect(verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, invalidChallenge))
        .rejects.toThrow(MaltlineProofError);
    }
  });

  it('rejects unregistered/tampered authority and client-authored summaries', async () => {
    await expect(verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, {
      ...CHALLENGE,
      authority: { ...CHALLENGE.authority, configurationSha256: '0'.repeat(64) },
    })).rejects.toThrow(/not registered/i);
    await expect(verifyAndHashMaltlineProof({
      ...GENERATION_2_WIN_PROOF,
      summary: { score: Number.MAX_SAFE_INTEGER },
    }, CHALLENGE)).rejects.toThrow(/exactly/i);
    await expect(verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, {
      ...CHALLENGE,
      clientScore: Number.MAX_SAFE_INTEGER,
    })).rejects.toThrow(/exactly/i);
  });

  it('rejects cyclic, non-finite, and exotic proof values at the facade', async () => {
    const cyclic = structuredClone(GENERATION_2_LOSS_PROOF) as unknown as {
      stages: Array<{ inputRuns: unknown[] }>;
    };
    cyclic.stages[0]!.inputRuns[0] = cyclic;
    await expect(verifyAndHashMaltlineProof(cyclic, CHALLENGE)).rejects.toThrow(MaltlineProofError);

    const nonfinite = structuredClone(GENERATION_2_LOSS_PROOF);
    nonfinite.stages[0]!.inputRuns[0]!.ticks = Number.POSITIVE_INFINITY;
    await expect(verifyAndHashMaltlineProof(nonfinite, CHALLENGE)).rejects.toThrow(/integer/i);

    const exotic = structuredClone(GENERATION_2_LOSS_PROOF) as unknown as {
      stages: Array<{ inputRuns: unknown[] }>;
    };
    exotic.stages[0]!.inputRuns[0] = new Date();
    await expect(verifyAndHashMaltlineProof(exotic, CHALLENGE)).rejects.toThrow(/plain object/i);
  });

  it('does not expose structural verification or envelope construction from the public root', () => {
    expect(publicApi).not.toHaveProperty('verifyMaltlineProofWithContextForTesting');
    expect(publicApi).not.toHaveProperty('createMaltlineProofEnvelope');
    expect(publicApi).not.toHaveProperty('hashVerifiedMaltlineProof');
    expect(publicApi).not.toHaveProperty('canonicalizeMaltlineProofEnvelope');
    expect(publicApi).toHaveProperty('verifyAndHashMaltlineProof');
  });
});

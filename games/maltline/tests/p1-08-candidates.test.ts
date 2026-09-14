import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
} from '../src/core/authority';
import {
  fingerprintMaltlineCampaign,
  fingerprintNormalizedMaltlineScenario,
} from '../src/core/campaign-fingerprint';
import {
  P108_TUNING_CANDIDATES,
  P108_UNRANKED_BOUNDARY,
  materializeCanonicalP108Campaign,
  type P108CanonicalCampaignRequest,
} from '../src/experiments/p1-08-candidates';

function request(value: unknown): P108CanonicalCampaignRequest {
  return value as P108CanonicalCampaignRequest;
}

function expectDeeplyFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) expectDeeplyFrozen(descriptor.value, seen);
  }
}

describe('EXP-049 canonical human-lab campaign materializer', () => {
  it('materializes A as an isolated exact copy of the registered generation-2 campaign', async () => {
    const materialized = await materializeCanonicalP108Campaign({
      candidateId: 'a-registered-control',
      seedOffset: 0,
    });

    expect(materialized).toMatchObject({
      candidateId: 'a-registered-control',
      seedOffset: 0,
      initialRun: { lives: 4, score: 0 },
      sourceAuthority: {
        identity: MALTLINE_GENERATION_2_AUTHORITY.identity,
        verifiedConfigurationSha256: MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
      },
      fingerprints: {
        candidate: 'fnv1a64:c44e83a1a72087b1',
        effectiveCampaign: 'fnv1a64:adc596f1154aeafa',
      },
      policy: P108_UNRANKED_BOUNDARY,
    });
    expect(materialized.campaign).toEqual(MALTLINE_GENERATION_2_AUTHORITY.campaign);
    expect(materialized.campaign).not.toBe(MALTLINE_GENERATION_2_AUTHORITY.campaign);
    for (const [index, scenario] of materialized.campaign.entries()) {
      expect(scenario).not.toBe(MALTLINE_GENERATION_2_AUTHORITY.campaign[index]);
      expect(scenario.stations).not.toBe(MALTLINE_GENERATION_2_AUTHORITY.campaign[index]!.stations);
      expect(materialized.fingerprints.scenarios[index]).toEqual({
        id: scenario.id,
        fingerprint: fingerprintNormalizedMaltlineScenario(scenario),
      });
    }
  });

  it('limits D to the five declared Stage 5/7 value changes', async () => {
    const materialized = await materializeCanonicalP108Campaign({
      candidateId: 'd-combined',
      seedOffset: 0,
    });
    const differences: string[] = [];
    for (const [stageIndex, scenario] of materialized.campaign.entries()) {
      const baseline = MALTLINE_GENERATION_2_AUTHORITY.campaign[stageIndex]!;
      for (const key of Object.keys(baseline) as Array<keyof typeof baseline>) {
        if (JSON.stringify(scenario[key]) !== JSON.stringify(baseline[key])) {
          differences.push(`${stageIndex + 1}:${key}`);
        }
      }
    }

    expect(differences).toEqual([
      '5:spawnIntervalTicks',
      '5:spawnAccelerationTicks',
      '7:customerCount',
      '7:spawnIntervalTicks',
      '7:marchSpeed',
    ]);
    expect(materialized.fingerprints).toMatchObject({
      candidate: 'fnv1a64:507515b6242c98bb',
      effectiveCampaign: 'fnv1a64:b8279edfb6bd516e',
    });
    expect(fingerprintMaltlineCampaign(materialized.campaign))
      .toBe(materialized.fingerprints.effectiveCampaign);
  });

  it('deeply freezes the package and cannot mutate the registered source', async () => {
    const authorityBefore = JSON.stringify(MALTLINE_GENERATION_2_AUTHORITY);
    const materialized = await materializeCanonicalP108Campaign({
      candidateId: 'd-combined',
      seedOffset: 0,
    });
    expectDeeplyFrozen(materialized);

    expect(() => {
      (materialized.campaign[4] as { spawnIntervalTicks: number }).spawnIntervalTicks = 999;
    }).toThrow(TypeError);
    expect(() => {
      (materialized.campaign[4]!.stations as string[]).push('vanilla');
    }).toThrow(TypeError);
    expect(JSON.stringify(MALTLINE_GENERATION_2_AUTHORITY)).toBe(authorityBefore);
  });

  it('rejects every candidate, seed, or option outside the narrow A/D canonical request', async () => {
    for (const candidateId of [
      'b-stage-5-resource-cadence',
      'c-stage-7-closing-time-bridge',
      'unknown',
    ]) {
      await expect(materializeCanonicalP108Campaign(request({ candidateId, seedOffset: 0 })))
        .rejects.toThrow(/only candidates A and D/u);
    }
    await expect(materializeCanonicalP108Campaign(request({
      candidateId: 'a-registered-control', seedOffset: 1,
    }))).rejects.toThrow(/only seed offset zero/u);
    await expect(materializeCanonicalP108Campaign(request({ candidateId: 'a-registered-control' })))
      .rejects.toThrow(/missing or unsupported options/u);
    await expect(materializeCanonicalP108Campaign(request({
      candidateId: 'a-registered-control', seedOffset: 0, extra: true,
    }))).rejects.toThrow(/missing or unsupported options/u);
    const accessor = Object.defineProperty(
      { candidateId: 'a-registered-control' },
      'seedOffset',
      { enumerable: true, get: () => 0 },
    );
    await expect(materializeCanonicalP108Campaign(request(accessor)))
      .rejects.toThrow(/must be a data property/u);
  });

  it('keeps the experiment module free of proof, competition, controller, and browser dependencies', () => {
    const source = readFileSync(
      new URL('../src/experiments/p1-08-candidates.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"][^'"]*(?:proof|competition|controller|viewer)[^'"]*['"]/u);
    expect(source).not.toMatch(/\b(?:document|window|localStorage|sessionStorage|fetch)\b/u);
    expect(P108_TUNING_CANDIDATES.map(({ id }) => id)).toEqual([
      'a-registered-control',
      'b-stage-5-resource-cadence',
      'c-stage-7-closing-time-bridge',
      'd-combined',
    ]);
  });
});

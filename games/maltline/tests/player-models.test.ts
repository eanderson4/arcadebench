import { beforeAll, describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import {
  formatMaltlineCampaignTelemetry,
  runMaltlineCampaignTelemetry,
} from '../src/telemetry/campaign-telemetry';
import {
  formatMaltlinePlayerModelComparison,
  runMaltlinePlayerModelComparison,
} from '../src/telemetry/player-model-comparison';
import {
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
} from '../src/telemetry/player-model-controllers';
import { REACTIVE_MALTLINE_CONTROLLER } from '../src/telemetry/reactive-controller';

const PROFILES = [
  REACTIVE_MALTLINE_CONTROLLER,
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
] as const;

describe('Maltline deterministic player models', () => {
  let canonicalComparison: ReturnType<typeof runMaltlinePlayerModelComparison>;

  beforeAll(() => {
    canonicalComparison = runMaltlinePlayerModelComparison();
  });

  it.each(PROFILES)('$id produces byte-identical repeated campaigns', (profile) => {
    const first = runMaltlineCampaignTelemetry({ controller: profile });
    const second = runMaltlineCampaignTelemetry({ controller: profile });

    expect(formatMaltlineCampaignTelemetry(second))
      .toBe(formatMaltlineCampaignTelemetry(first));
  });

  it('records explicit reaction and error parameters in controller identity', () => {
    expect(DELAYED_COMPETENT_MALTLINE_CONTROLLER.fingerprintData).toEqual({
      algorithm: 'delayed-reactive',
      version: 1,
      reactionDelayTicks: 2,
      hesitationEveryTicks: 120,
      hesitationTicks: 1,
    });
    expect(NOVICE_ERROR_MALTLINE_CONTROLLER.fingerprintData).toEqual({
      algorithm: 'delayed-reactive-with-misserve',
      version: 1,
      reactionDelayTicks: 7,
      hesitationEveryTicks: 90,
      hesitationTicks: 2,
      misserveEveryOpportunities: 8,
    });
  });

  it.each([
    DELAYED_COMPETENT_MALTLINE_CONTROLLER,
    NOVICE_ERROR_MALTLINE_CONTROLLER,
  ])('$id does not change decisions when only the hidden scenario seed changes', (profile) => {
    const original = MALTLINE_CAMPAIGN[0]!;
    const alternate = { ...original, seed: original.seed + 1 };
    const state = new MaltlineEngine(original).snapshot();
    const first = profile.create();
    const second = profile.create();

    for (let tick = 0; tick < 40; tick++) {
      expect(second(state, alternate)).toEqual(first(state, original));
    }
  });

  it('repeats the canonical plus shadow-seed comparison byte-for-byte', () => {
    const first = canonicalComparison;
    const second = runMaltlinePlayerModelComparison();

    expect(first.comparisonFingerprint).toBe('fnv1a64:dd75527c636fb0ab');
    expect(formatMaltlinePlayerModelComparison(second))
      .toBe(formatMaltlinePlayerModelComparison(first));
  });

  it('separates perfect, delayed-competent, and novice outcome distributions', () => {
    const comparison = canonicalComparison;
    const perfect = comparison.profiles[0]!;
    const delayed = comparison.profiles[1]!;
    const novice = comparison.profiles[2]!;

    expect(perfect).toMatchObject({ runs: 33, wins: 33, winRate: 1 });
    expect(delayed).toMatchObject({ runs: 33, wins: 31, winRate: 0.939 });
    expect(delayed.winningSeconds!.mean).toBeGreaterThan(perfect.winningSeconds!.mean);
    expect(delayed.lossReasons.walkout + delayed.lossReasons.jar_smashed).toBeGreaterThan(0);
    expect(novice).toMatchObject({ runs: 33, wins: 0, winRate: 0 });
    expect(novice.stagesCleared.mean).toBeLessThan(delayed.stagesCleared.mean);
    expect(novice.score.mean).toBeLessThan(delayed.score.mean);
    expect(novice.lossReasons.shake_smashed + novice.lossReasons.jar_smashed).toBeGreaterThan(0);
  });

  it('shows a fifth life narrows the delayed gap without rescuing the novice', () => {
    const comparison = runMaltlinePlayerModelComparison({
      profiles: [
        DELAYED_COMPETENT_MALTLINE_CONTROLLER,
        NOVICE_ERROR_MALTLINE_CONTROLLER,
      ],
      initialRun: { lives: 5, score: 0 },
    });

    expect(comparison.profiles[0]).toMatchObject({ wins: 32, winRate: 0.97 });
    expect(comparison.profiles[1]).toMatchObject({ wins: 0, winRate: 0 });
    expect(comparison.profiles[1]!.stagesCleared.mean).toBeGreaterThan(2.4);
  });
});

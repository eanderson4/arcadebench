import { describe, expect, it } from 'vitest';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { MaltlineEngine } from '../src/core/engine';
import { replayMaltline } from '../src/core/replay';
import { IDLE_INPUT, type MaltlineInput } from '../src/core/types';
import { runMaltlineCampaignTelemetry } from '../src/telemetry/campaign-telemetry';
import {
  MALTLINE_PHYSICAL_INTENT_ADAPTER_FINGERPRINT_DATA,
  PHYSICAL_INTENT_REACTIVE_MALTLINE_CONTROLLER,
  mediateMaltlinePhysicalIntent,
  runMaltlinePhysicalIntentComparison,
} from '../src/telemetry/physical-intent-controller';
import { REACTIVE_MALTLINE_CONTROLLER } from '../src/telemetry/reactive-controller';

describe('Maltline adapter-mediated physical-intent evidence', () => {
  it('binds the source controller and versioned shipped adapter policy into identity', () => {
    expect(MALTLINE_PHYSICAL_INTENT_ADAPTER_FINGERPRINT_DATA).toEqual({
      id: 'viewer-keyboard-input-v2',
      directionInitialRepeatMultiplier: 3,
      serveLatchPolicy: 'pre-step-blend-or-held-one-shot-v1',
    });
    expect(PHYSICAL_INTENT_REACTIVE_MALTLINE_CONTROLLER).toMatchObject({
      id: 'reactive-current-state-v1-physical-intent-v1',
      fingerprintData: {
        algorithm: 'physical-intent-mediator-v1',
        version: 1,
        sourceControllerId: 'reactive-current-state-v1',
        sourceControllerFingerprint: 'fnv1a64:48296b353184b2f8',
        adapter: MALTLINE_PHYSICAL_INTENT_ADAPTER_FINGERPRINT_DATA,
      },
    });

    const raw = runMaltlineCampaignTelemetry({ tickLimitPerStage: 1 });
    const mediated = runMaltlineCampaignTelemetry({
      controller: PHYSICAL_INTENT_REACTIVE_MALTLINE_CONTROLLER,
      tickLimitPerStage: 1,
    });
    expect(mediated.identity.controller.fingerprint).not.toBe(raw.identity.controller.fingerprint);
    expect(mediated.identity.configurationFingerprint).not.toBe(raw.identity.configurationFingerprint);
  });

  it('changes artifact identity when source controller metadata changes', () => {
    const source = (version: number) => ({
      id: 'identity-probe-v1',
      fingerprintData: { algorithm: 'idle-probe', version },
      create: () => () => IDLE_INPUT,
    } as const);
    const first = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!],
      controller: mediateMaltlinePhysicalIntent(source(1)),
      tickLimitPerStage: 1,
    });
    const second = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!],
      controller: mediateMaltlinePhysicalIntent(source(2)),
      tickLimitPerStage: 1,
    });

    expect(second.identity.controller.fingerprint).not.toBe(first.identity.controller.fingerprint);
    expect(second.identity.configurationFingerprint).not.toBe(first.identity.configurationFingerprint);
  });

  it('repeats the canonical mediated comparison byte-for-byte with pinned outcomes', () => {
    const first = runMaltlinePhysicalIntentComparison({ seedOffsets: [0] });
    const second = runMaltlinePhysicalIntentComparison({ seedOffsets: [0] });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.comparisonFingerprint).toBe('fnv1a64:de27f47f76e3af5a');
    expect(first.runs).toMatchObject([
      {
        profileId: 'reactive-current-state-v1-physical-intent-v1',
        status: 'lost',
        stagesCleared: 6,
        ticks: 17_627,
        score: 23_300,
        lossReasons: { walkout: 0, shake_smashed: 1, jar_smashed: 3 },
      },
      {
        profileId: 'delayed-competent-v1-physical-intent-v1',
        status: 'won',
        stagesCleared: 8,
        ticks: 22_613,
        score: 36_005,
        lives: 3,
      },
      {
        profileId: 'novice-error-injection-v1-physical-intent-v1',
        status: 'lost',
        stagesCleared: 3,
        ticks: 6_851,
        score: 7_070,
        lives: 0,
      },
    ]);
  });

  it('supports byte-stable multi-seed comparisons with distinct configuration identities', () => {
    const options = {
      sourceProfiles: [REACTIVE_MALTLINE_CONTROLLER],
      seedOffsets: [0, 101],
    } as const;
    const first = runMaltlinePhysicalIntentComparison(options);
    const second = runMaltlinePhysicalIntentComparison(options);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.runs).toHaveLength(2);
    expect(first.runs.map(({ seedOffset }) => seedOffset)).toEqual([0, 101]);
    expect(first.runs[1]!.configurationFingerprint)
      .not.toBe(first.runs[0]!.configurationFingerprint);
  });

  it('emits ordinary inputs whose direct replay reproduces the mediated engine path', () => {
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!;
    const controller = PHYSICAL_INTENT_REACTIVE_MALTLINE_CONTROLLER.create();
    const engine = new MaltlineEngine(scenario);
    const inputs: MaltlineInput[] = [];

    while (engine.snapshot().status === 'running') {
      const state = engine.snapshot();
      const input = controller(state, engine.scenario);
      inputs.push({ ...input });
      engine.setInput(input);
      engine.step();
    }
    const replay = replayMaltline(
      scenario,
      { lives: scenario.lives, score: 0 },
      inputs,
    );

    expect(engine.snapshot()).toMatchObject({ status: 'won', tick: 1_558 });
    expect(replay.finalState).toEqual(engine.snapshot());
    expect(replay.ticks.map(({ input }) => input)).toEqual(inputs);
  });
});

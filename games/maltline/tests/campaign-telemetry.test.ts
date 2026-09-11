import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  formatMaltlineCampaignTelemetry,
  runMaltlineCampaignTelemetry,
} from '../src/telemetry/campaign-telemetry';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { IDLE_INPUT } from '../src/core/types';
import { REACTIVE_MALTLINE_CONTROLLER } from '../src/telemetry/reactive-controller';

const IDLE_CONTROLLER = {
  id: 'idle-v1',
  fingerprintData: { algorithm: 'idle', version: 1 },
  create: () => () => IDLE_INPUT,
} as const;

describe('Maltline campaign telemetry', () => {
  it('produces byte-identical JSON for repeated canonical runs', () => {
    const first = runMaltlineCampaignTelemetry();
    const second = runMaltlineCampaignTelemetry();

    expect(second).toEqual(first);
    expect(formatMaltlineCampaignTelemetry(second)).toBe(formatMaltlineCampaignTelemetry(first));
    expect(createHash('sha256').update(formatMaltlineCampaignTelemetry(first)).digest('hex'))
      .toBe('418aa234364fedc119c5c49086a1415fd1e6c7e55a0cf2683b8eefab34cd9775');
  });

  it('uses the registered authority campaign as its immutable default', () => {
    expect(MALTLINE_CAMPAIGN).toBe(MALTLINE_GENERATION_2_AUTHORITY.campaign);
    const implicit = runMaltlineCampaignTelemetry({ tickLimitPerStage: 1 });
    const explicit = runMaltlineCampaignTelemetry({
      scenarios: MALTLINE_GENERATION_2_AUTHORITY.campaign,
      tickLimitPerStage: 1,
    });
    expect(implicit).toEqual(explicit);
    expect(implicit.identity.scenarioFingerprints.map(({ id }) => id)).toEqual(
      MALTLINE_GENERATION_2_AUTHORITY.campaign.map(({ id }) => id),
    );
  });

  it('completes every canonical stage with the reactive reference controller', () => {
    const telemetry = runMaltlineCampaignTelemetry();

    expect(telemetry).toMatchObject({
      schemaVersion: 3,
      identity: {
        gameId: 'maltline',
        controller: { id: 'reactive-current-state-v1' },
      },
      campaign: {
        status: 'won',
        stagesRun: 8,
        stagesCleared: 8,
        ticks: 21_662,
        seconds: 361.033,
        score: 36_255,
        scoreGained: 36_255,
        lives: 4,
        livesLost: 0,
        maxLiveCustomers: 3,
        maxMarchingCustomers: 2,
        maxOpenDemand: 1,
        maxJarsCommitted: 5,
        maxLaneLoad: 2,
        minJarsAvailable: 1,
        ticksAtOneOrFewerJars: 724,
        ticksAtZeroJars: 0,
        openDemandTicks: 7_967,
        openDemandCustomerTicks: 7_967,
        multiOrderTicks: 0,
        multiOrderLaneTicks: 0,
        multiOrderFlavorTicks: 0,
        returningJarTicks: 10_568,
        orderReturnConflictTicks: 5_022,
        crossLaneOrderReturnConflictTicks: 3_088,
        pacingWindowTicks: 19_462,
        quietPacingTicks: 4_190,
        longestQuietPacingRunTicks: 60,
        spawnFloorHitCount: 0,
        spawned: 145,
        serviceActions: 145,
        repeatServiceActions: 0,
        fulfilled: 145,
        walkouts: 0,
        neverFulfilledWalkouts: 0,
        fulfilledThenWalkout: 0,
        resolved: 145,
        exited: 145,
        lossReasons: { walkout: 0, shake_smashed: 0, jar_smashed: 0 },
        scoreLedger: { servePoints: 24_630, catchPoints: 3_625, stageBonusPoints: 8_000 },
      },
    });
    expect(telemetry.identity).toEqual({
      gameId: 'maltline',
      gameFingerprint: 'fnv1a64:46ddbdf524c12574',
      rulesFingerprint: 'fnv1a64:42b24308e03cf3fa',
      controller: {
        id: 'reactive-current-state-v1',
        fingerprint: 'fnv1a64:48296b353184b2f8',
      },
      campaignFingerprint: 'fnv1a64:adc596f1154aeafa',
      scenarioFingerprints: [
        { id: 'maltline-01-first-pour', fingerprint: 'fnv1a64:f28e825ca35e6413' },
        { id: 'maltline-02-two-tap', fingerprint: 'fnv1a64:c1abfee679a02f66' },
        { id: 'maltline-03-three-windows', fingerprint: 'fnv1a64:3ae3eee4f29f004d' },
        { id: 'maltline-04-lunch-rush', fingerprint: 'fnv1a64:16dc7a43da397edc' },
        { id: 'maltline-05-jar-shortage', fingerprint: 'fnv1a64:422c534727543c52' },
        { id: 'maltline-06-thick-shakes', fingerprint: 'fnv1a64:c8e9659462212b16' },
        { id: 'maltline-07-happy-hour', fingerprint: 'fnv1a64:f4e18be841f5bc6f' },
        { id: 'maltline-08-closing-time', fingerprint: 'fnv1a64:09c57d010347ec7f' },
      ],
      configurationFingerprint: 'fnv1a64:28ac8864373bc650',
    });
    expect(telemetry.stages.map((stage) => stage.status)).toEqual(new Array(8).fill('won'));
    expect(telemetry.stages.map((stage) => stage.ticks)).toEqual([
      1_558, 1_621, 1_881, 3_120, 3_766, 3_103, 3_312, 3_301,
    ]);
    expect(telemetry.stages.map((stage) => stage.maxLiveCustomers)).toEqual([2, 2, 2, 2, 2, 2, 3, 3]);
    expect(telemetry.stages.map((stage) => stage.maxJarsCommitted)).toEqual([3, 3, 3, 3, 3, 3, 4, 5]);
    expect(telemetry.stages.map((stage) => stage.maxOpenDemand))
      .toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(telemetry.stages.map((stage) => stage.quietPacingTicks))
      .toEqual([420, 410, 438, 814, 1_122, 599, 297, 90]);
    for (const stage of telemetry.stages) {
      expect(stage.scenarioFingerprint).toBe(
        telemetry.identity.scenarioFingerprints[stage.stage - 1]!.fingerprint,
      );
      expect(stage.resolved).toBe(stage.spawned);
      expect(stage.fulfilled).toBe(stage.spawned);
      expect(stage.serviceActions).toBe(stage.spawned);
    }
  });

  it('attributes life losses and terminal customer counters for a losing controller', () => {
    const telemetry = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      controller: IDLE_CONTROLLER,
    });

    expect(telemetry.stages[0]).toMatchObject({
      status: 'lost',
      lives: 0,
      serviceActions: 0,
      fulfilled: 0,
      walkouts: 4,
      neverFulfilledWalkouts: 4,
      fulfilledThenWalkout: 0,
      resolved: 4,
      exited: 0,
      lossReasons: { walkout: 4, shake_smashed: 0, jar_smashed: 0 },
      scoreLedger: { servePoints: 0, catchPoints: 0, stageBonusPoints: 0 },
    });
    expect(telemetry.campaign).toMatchObject({
      status: 'lost',
      stagesRun: 1,
      stagesCleared: 0,
      lives: 0,
      walkouts: 4,
      neverFulfilledWalkouts: 4,
      fulfilledThenWalkout: 0,
      resolved: 4,
      lossReasons: { walkout: 4, shake_smashed: 0, jar_smashed: 0 },
    });
  });

  it('returns an explicit tick-limit result instead of hanging a bad controller', () => {
    const telemetry = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      controller: IDLE_CONTROLLER,
      tickLimitPerStage: 10,
    });

    expect(telemetry.identity.controller.id).toBe('idle-v1');
    expect(telemetry.stages[0]).toMatchObject({ status: 'tick_limit', ticks: 10 });
    expect(telemetry.campaign).toMatchObject({ status: 'tick_limit', ticks: 10 });
  });

  it('enforces a campaign-wide tick ledger before a 60,001st controller callback', () => {
    let controllerCalls = 0;
    const slowScenario = {
      ...MALTLINE_CAMPAIGN[0]!,
      id: 'telemetry-slow-budget-probe',
      name: 'Telemetry slow budget probe',
      laneLength: 1_000,
      marchSpeed: 0.001,
      customerCount: 1,
    };
    const telemetry = runMaltlineCampaignTelemetry({
      scenarios: [slowScenario],
      initialRun: { lives: 20, score: 0 },
      controller: {
        id: 'budget-probe-v1',
        fingerprintData: { algorithm: 'budget-probe', version: 1 },
        create: () => () => {
          controllerCalls++;
          if (controllerCalls > 60_000) throw new Error('controller exceeded total budget');
          return IDLE_INPUT;
        },
      },
      tickLimitPerStage: 60_001,
      totalTickLimit: 60_000,
    });

    expect(controllerCalls).toBe(60_000);
    expect(telemetry.stages[0]).toMatchObject({ status: 'tick_limit', ticks: 60_000 });
    expect(telemetry.campaign).toMatchObject({ status: 'tick_limit', ticks: 60_000 });
  });

  it('reports an exact-boundary nonfinal win as tick_limit without creating the next controller', () => {
    let createCalls = 0;
    const telemetry = runMaltlineCampaignTelemetry({
      scenarios: MALTLINE_CAMPAIGN.slice(0, 2),
      controller: {
        ...REACTIVE_MALTLINE_CONTROLLER,
        id: 'exact-boundary-reactive-v1',
        create: () => {
          createCalls++;
          return REACTIVE_MALTLINE_CONTROLLER.create();
        },
      },
      tickLimitPerStage: 60_000,
      totalTickLimit: 1_558,
    });

    expect(createCalls).toBe(1);
    expect(telemetry.stages).toHaveLength(1);
    expect(telemetry.stages[0]).toMatchObject({ status: 'won', ticks: 1_558 });
    expect(telemetry.campaign).toMatchObject({ status: 'tick_limit', stagesRun: 1, stagesCleared: 1 });
  });

  it('validates and identity-binds an explicitly supplied total tick limit', () => {
    expect(() => runMaltlineCampaignTelemetry({ totalTickLimit: 0 }))
      .toThrow(/total tick limit/u);
    expect(() => runMaltlineCampaignTelemetry({ totalTickLimit: Number.NaN }))
      .toThrow(/total tick limit/u);
    const first = runMaltlineCampaignTelemetry({ tickLimitPerStage: 1, totalTickLimit: 8 });
    const changed = runMaltlineCampaignTelemetry({ tickLimitPerStage: 1, totalTickLimit: 9 });
    const omitted = runMaltlineCampaignTelemetry({ tickLimitPerStage: 1 });
    expect(changed.identity.configurationFingerprint)
      .not.toBe(first.identity.configurationFingerprint);
    expect(omitted.identity.configurationFingerprint)
      .not.toBe(first.identity.configurationFingerprint);
  });

  it('changes provenance when a scenario parameter or controller definition changes', () => {
    const baseline = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      tickLimitPerStage: 10,
    });
    const changedScenario = runMaltlineCampaignTelemetry({
      scenarios: [{ ...MALTLINE_CAMPAIGN[0]!, blendTicks: MALTLINE_CAMPAIGN[0]!.blendTicks + 1 }],
      tickLimitPerStage: 10,
    });
    const changedController = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      controller: IDLE_CONTROLLER,
      tickLimitPerStage: 10,
    });

    expect(changedScenario.identity.rulesFingerprint).toBe(baseline.identity.rulesFingerprint);
    expect(changedScenario.identity.gameFingerprint).toBe(baseline.identity.gameFingerprint);
    expect(changedScenario.identity.scenarioFingerprints[0]!.fingerprint)
      .not.toBe(baseline.identity.scenarioFingerprints[0]!.fingerprint);
    expect(changedScenario.identity.campaignFingerprint)
      .not.toBe(baseline.identity.campaignFingerprint);
    expect(changedScenario.identity.configurationFingerprint)
      .not.toBe(baseline.identity.configurationFingerprint);

    expect(changedController.identity.controller.id).toBe('idle-v1');
    expect(changedController.identity.controller.fingerprint)
      .not.toBe(baseline.identity.controller.fingerprint);
    expect(changedController.identity.configurationFingerprint)
      .not.toBe(baseline.identity.configurationFingerprint);
  });

  it('binds controller behavior metadata into provenance', () => {
    const first = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      controller: IDLE_CONTROLLER,
      tickLimitPerStage: 10,
    });
    const parameterChange = runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      controller: {
        ...IDLE_CONTROLLER,
        fingerprintData: { algorithm: 'idle', version: 1, hesitationTicks: 1 },
      },
      tickLimitPerStage: 10,
    });

    expect(parameterChange.identity.controller.id).toBe(first.identity.controller.id);
    expect(parameterChange.identity.controller.fingerprint)
      .not.toBe(first.identity.controller.fingerprint);
    expect(parameterChange.identity.configurationFingerprint)
      .not.toBe(first.identity.configurationFingerprint);
  });
});

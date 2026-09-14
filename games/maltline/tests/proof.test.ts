import { describe, expect, it, vi } from 'vitest';
import {
  MALTLINE_CAMPAIGN_GENERATION,
  MALTLINE_PROOF_VERSION,
  MALTLINE_RANKED_RESOURCE_LIMITS,
  MALTLINE_RULESET_VERSION,
  MaltlineProofError,
  encodeMaltlineInputRuns,
  verifyMaltlineProofWithContextForTesting,
  type MaltlineInputRun,
  type MaltlineRunProof,
  type MaltlineVerifierContext,
} from '../src/core/proof';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import { MALTLINE_REPLAY_VERSION, parseMaltlineReplay, replayMaltline } from '../src/core/replay';
import type { MaltlineInput, MaltlineScenario } from '../src/core/types';
import { reactiveMaltlineController } from '../src/telemetry/reactive-controller';

function scenario(id: string, overrides: Partial<MaltlineScenario> = {}): MaltlineScenario {
  return {
    id,
    name: id,
    ticksPerSecond: 60,
    lanes: 1,
    laneLength: 10,
    stations: ['vanilla'],
    jarPoolSize: 2,
    blendTicks: 1,
    washTicks: 1,
    drinkTicks: 1,
    customerCount: 1,
    spawnIntervalTicks: 60,
    spawnAccelerationTicks: 0,
    spawnIntervalFloorTicks: 60,
    marchSpeed: 0.01,
    leaveSpeed: 100,
    slideSpeed: 100,
    returnSpeed: 100,
    resumeExitThreshold: 0,
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    lives: 2,
    seed: 42,
    ...overrides,
  };
}

const IDLE_RUN = {
  stationDir: 0,
  laneDir: 0,
  blend: false,
  serve: false,
} as const;

function inputRun(ticks: number, overrides: Partial<MaltlineInputRun> = {}): MaltlineInputRun {
  return { ticks, ...IDLE_RUN, ...overrides };
}

function winningRuns(): MaltlineInputRun[] {
  return [
    inputRun(30),
    inputRun(2, { blend: true }),
    inputRun(1, { serve: true }),
    inputRun(2),
  ];
}

function context(campaign: readonly MaltlineScenario[], overrides: Partial<MaltlineVerifierContext> = {}): MaltlineVerifierContext {
  return {
    rulesetVersion: MALTLINE_RULESET_VERSION,
    campaignGeneration: MALTLINE_CAMPAIGN_GENERATION,
    campaign,
    initialRun: { lives: 2, score: 0 },
    ...overrides,
  };
}

function proof(stages: MaltlineRunProof['stages']): MaltlineRunProof {
  return {
    version: MALTLINE_PROOF_VERSION,
    rulesetVersion: MALTLINE_RULESET_VERSION,
    campaignGeneration: MALTLINE_CAMPAIGN_GENERATION,
    stages,
  };
}

function reactiveCampaignProof(): MaltlineRunProof {
  let run = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
  const stages: MaltlineRunProof['stages'] = [];
  for (const campaignStage of MALTLINE_CAMPAIGN) {
    const engine = new MaltlineEngine(campaignStage, run);
    let state = engine.snapshot();
    const inputs: MaltlineInput[] = [];
    while (state.status === 'running') {
      const input = reactiveMaltlineController(state, campaignStage);
      inputs.push(input);
      engine.setInput(input);
      state = engine.step().state;
    }
    stages.push({ stageId: campaignStage.id, inputRuns: encodeMaltlineInputRuns(inputs) });
    run = { lives: state.lives, score: state.score };
    if (state.status !== 'won') break;
  }
  return proof(stages);
}

describe('authoritative Maltline proof verification', () => {
  it('derives a completed run and carries score and lives through ordered stages', () => {
    const campaign = [scenario('one'), scenario('two', { seed: 43 })];
    const verified = verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'one', inputRuns: winningRuns() },
      { stageId: 'two', inputRuns: winningRuns() },
    ]), context(campaign));

    expect(verified.summary).toEqual({
      score: 1250,
      lives: 2,
      stageReached: 2,
      stagesCleared: 2,
      completed: true,
      totalTicks: 70,
      fulfilled: 2,
      serviceActions: 2,
      walkouts: 0,
      resolved: 2,
      exited: 2,
    });
    expect(verified.stages).toEqual([
      expect.objectContaining({ stageId: 'one', status: 'won', ticks: 35, score: 625, scoreGained: 625, lives: 2 }),
      expect.objectContaining({ stageId: 'two', status: 'won', ticks: 35, score: 1250, scoreGained: 625, lives: 2 }),
    ]);
  });

  it('accepts a terminal loss and derives progress without a client outcome', () => {
    const losingStage = scenario('loss', { laneLength: 1, marchSpeed: 1, lives: 1 });
    const verified = verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'loss', inputRuns: [inputRun(30)] },
    ]), context([losingStage], { initialRun: { lives: 1, score: 0 } }));

    expect(verified.summary).toMatchObject({
      score: 0,
      lives: 0,
      stageReached: 1,
      stagesCleared: 0,
      completed: false,
      totalTicks: 30,
      walkouts: 1,
      resolved: 1,
      exited: 0,
    });
    expect(verified.stages[0]).toMatchObject({ status: 'lost', ticks: 30 });
  });

  it('canonicalizes zero directions and merges adjacent identical input runs', () => {
    const value = proof([{
      stageId: 'one',
      inputRuns: [
        inputRun(10),
        inputRun(20, { stationDir: -0, laneDir: -0 }),
        ...winningRuns().slice(1),
      ],
    }]);
    const verified = verifyMaltlineProofWithContextForTesting(value, context([scenario('one')]));

    expect(verified.proof.stages[0]!.inputRuns[0]).toEqual(inputRun(30));
    expect(verified.proof.stages[0]!.inputRuns).toHaveLength(4);
  });

  it('rejects client-authored authority fields at every proof level', () => {
    const campaign = [scenario('one')];
    const valid = proof([{ stageId: 'one', inputRuns: winningRuns() }]);
    for (const [label, mutate] of [
      ['top-level scenario', (value: Record<string, unknown>) => { value.scenario = campaign[0]; }],
      ['top-level run', (value: Record<string, unknown>) => { value.run = { lives: 99, score: 999999 }; }],
      ['top-level final state', (value: Record<string, unknown>) => { value.finalState = { score: 999999 }; }],
      ['stage events', (value: Record<string, unknown>) => {
        (value.stages as Array<Record<string, unknown>>)[0]!.events = [];
      }],
      ['input extra key', (value: Record<string, unknown>) => {
        const stages = value.stages as Array<{ inputRuns: Array<Record<string, unknown>> }>;
        stages[0]!.inputRuns[0]!.score = 999999;
      }],
    ] as const) {
      const tampered = structuredClone(valid) as unknown as Record<string, unknown>;
      mutate(tampered);
      expect(
        () => verifyMaltlineProofWithContextForTesting(tampered, context(campaign)),
        label,
      ).toThrow(MaltlineProofError);
    }
  });

  it.each([
    ['direction above range', { stationDir: 2 }],
    ['fractional direction', { laneDir: 0.5 }],
    ['string direction', { stationDir: '0' }],
    ['numeric blend', { blend: 1 }],
    ['string serve', { serve: 'false' }],
    ['zero ticks', { ticks: 0 }],
    ['negative ticks', { ticks: -1 }],
    ['fractional ticks', { ticks: 1.5 }],
    ['infinite ticks', { ticks: Number.POSITIVE_INFINITY }],
  ])('rejects invalid input encoding: %s', (_label, replacement) => {
    const value = proof([{ stageId: 'one', inputRuns: winningRuns() }]) as unknown as {
      stages: Array<{ inputRuns: Array<Record<string, unknown>> }>;
    };
    Object.assign(value.stages[0]!.inputRuns[0]!, replacement);
    expect(() => verifyMaltlineProofWithContextForTesting(value, context([scenario('one')]))).toThrow(MaltlineProofError);
  });

  it('rejects proof input accessors without invoking them', () => {
    const getter = vi.fn(() => true);
    const run = inputRun(30);
    Object.defineProperty(run, 'serve', { enumerable: true, get: getter });
    const value = proof([{
      stageId: 'one',
      inputRuns: [run, ...winningRuns().slice(1)],
    }]);

    expect(() => verifyMaltlineProofWithContextForTesting(value, context([scenario('one')])))
      .toThrow(/data property/u);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects unsupported versions, unknown keys, missing keys, and invalid collection types', () => {
    const campaign = [scenario('one')];
    const valid = proof([{ stageId: 'one', inputRuns: winningRuns() }]);
    expect(() => verifyMaltlineProofWithContextForTesting({ ...valid, version: 2 }, context(campaign))).toThrow(/version/i);
    expect(() => verifyMaltlineProofWithContextForTesting({ version: 1 }, context(campaign))).toThrow(/exactly/i);
    expect(() => verifyMaltlineProofWithContextForTesting({ ...proof([]), stages: null }, context(campaign))).toThrow(/stage count/i);
    expect(() => verifyMaltlineProofWithContextForTesting({ ...valid, surprise: true }, context(campaign))).toThrow(/exactly/i);
    expect(() => verifyMaltlineProofWithContextForTesting(proof([]), context(campaign))).toThrow(/stage count/i);
    expect(() => verifyMaltlineProofWithContextForTesting({ ...proof([]), stages: [{ stageId: 'one', inputRuns: null }] }, context(campaign)))
      .toThrow(/input runs.*invalid/i);
    expect(() => verifyMaltlineProofWithContextForTesting({
      ...proof([]),
      stages: [{ stageId: 'one', inputRuns: [{ ticks: 1, ...IDLE_RUN, serve: undefined }] }],
    }, context(campaign))).toThrow(/booleans/i);
  });

  it('rejects bad, missing, and reordered campaign stages', () => {
    const campaign = [scenario('one'), scenario('two')];
    expect(() => verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'two', inputRuns: winningRuns() },
      { stageId: 'one', inputRuns: winningRuns() },
    ]), context(campaign))).toThrow(/out of order/i);

    expect(() => verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'one', inputRuns: winningRuns() },
    ]), context(campaign))).toThrow(/missing the next/i);

    expect(() => verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'not-one', inputRuns: winningRuns() },
    ]), context(campaign))).toThrow(/out of order/i);
  });

  it('rejects nonterminal prefixes and any input after a terminal tick', () => {
    const campaign = [scenario('one')];
    expect(() => verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'one', inputRuns: [inputRun(1)] },
    ]), context(campaign))).toThrow(/nonterminal prefix/i);

    const losingStage = scenario('loss', { laneLength: 1, marchSpeed: 1, lives: 1 });
    expect(() => verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'loss', inputRuns: [inputRun(31)] },
    ]), context([losingStage], { initialRun: { lives: 1, score: 0 } }))).toThrow(/input after/i);
  });

  it('rejects continuation after a lost stage', () => {
    const campaign = [
      scenario('loss', { laneLength: 1, marchSpeed: 1, lives: 1 }),
      scenario('never'),
    ];
    expect(() => verifyMaltlineProofWithContextForTesting(proof([
      { stageId: 'loss', inputRuns: [inputRun(30)] },
      { stageId: 'never', inputRuns: winningRuns() },
    ]), context(campaign, { initialRun: { lives: 1, score: 0 } }))).toThrow(/continues after/i);
  });

  it('enforces encoded-run, per-stage tick, and total expanded-tick limits', () => {
    const campaign = [scenario('one')];
    const valid = proof([{ stageId: 'one', inputRuns: winningRuns() }]);
    expect(() => verifyMaltlineProofWithContextForTesting(valid, context(campaign, {
      limits: { maximumInputRuns: 3 },
    }))).toThrow(/too many input runs/i);
    expect(() => verifyMaltlineProofWithContextForTesting(valid, context(campaign, {
      limits: { maximumStageTicks: 34 },
    }))).toThrow(/stage 1 exceeds/i);
    expect(() => verifyMaltlineProofWithContextForTesting(valid, context(campaign, {
      limits: { maximumTotalTicks: 34 },
    }))).toThrow(/total tick limit/i);
    expect(() => verifyMaltlineProofWithContextForTesting(proof([{
      stageId: 'one',
      inputRuns: [inputRun(60_001)],
    }]), context(campaign))).toThrow(/1 to 60000/i);
    expect(() => verifyMaltlineProofWithContextForTesting(valid, context(campaign, {
      limits: { maximumTotalTicks: 60_001 },
    }))).toThrow(/maximumTotalTicks/i);
  });

  it('rejects invalid trusted context before simulation', () => {
    expect(() => verifyMaltlineProofWithContextForTesting(proof([]), context([]))).toThrow(/campaign length/i);
    expect(() => verifyMaltlineProofWithContextForTesting(proof([{ stageId: 'one', inputRuns: winningRuns() }]), {
      rulesetVersion: MALTLINE_RULESET_VERSION,
      campaignGeneration: MALTLINE_CAMPAIGN_GENERATION,
      campaign: [scenario('one')],
      initialRun: { lives: 0, score: 0 },
    })).toThrow(/initial run lives/i);
    expect(() => verifyMaltlineProofWithContextForTesting(proof([{ stageId: 'one', inputRuns: winningRuns() }]), context([
      scenario('one'), scenario('one'),
    ]))).toThrow(/identifiers/i);
  });

  it('binds both proof and trusted context to the supported generations', () => {
    const campaign = [scenario('one')];
    const valid = proof([{ stageId: 'one', inputRuns: winningRuns() }]);
    expect(() => verifyMaltlineProofWithContextForTesting({
      ...valid,
      campaignGeneration: MALTLINE_CAMPAIGN_GENERATION + 1,
    }, context(campaign))).toThrow(/generation/i);
    expect(() => verifyMaltlineProofWithContextForTesting(valid, {
      ...context(campaign),
      rulesetVersion: MALTLINE_RULESET_VERSION + 1,
    } as MaltlineVerifierContext)).toThrow(/generation/i);
  });

  it('rejects malformed or resource-hostile trusted scenarios and unsafe initial state', () => {
    const valid = proof([{ stageId: 'one', inputRuns: winningRuns() }]);
    for (const changed of [
      { lanes: 0 },
      { lanes: 9 },
      { customerCount: 0 },
      { customerCount: 65 },
      { jarPoolSize: 65 },
      { marchSpeed: 0 },
      { marchSpeed: Number.NaN },
      { stations: ['vanilla', 'vanilla'] },
      { spawnIntervalFloorTicks: 0 },
    ]) {
      expect(() => verifyMaltlineProofWithContextForTesting(valid, context([
        scenario('one', changed as Partial<MaltlineScenario>),
      ]))).toThrow(MaltlineProofError);
    }
    expect(() => verifyMaltlineProofWithContextForTesting(valid, context([scenario('one')], {
      initialRun: { lives: 2, score: Number.MAX_SAFE_INTEGER },
    }))).toThrow(/initial run score/i);
    expect(() => verifyMaltlineProofWithContextForTesting(valid, {
      ...context([scenario('one')]),
      unexpected: true,
    } as MaltlineVerifierContext)).toThrow(/unsupported fields/i);
  });

  it.each([
    ['scenario.id', { id: 'Not Stable' }],
    ['scenario.name', { name: ' ' }],
    ['scenario.ticksPerSecond', { ticksPerSecond: 60.5 }],
    ['scenario.spawnIntervalFloorTicks', { spawnIntervalFloorTicks: 61 }],
    ['scenario.marchSpeed', { marchSpeed: 0.0001 }],
    ['scenario.resumeExitThreshold', { resumeExitThreshold: 1.01 }],
  ] as const)('shares fundamental %s rejection with the engine boundary', (field, changed) => {
    const malformed = scenario('one', changed as Partial<MaltlineScenario>);
    expect(() => new MaltlineEngine(malformed, { lives: 2, score: 0 })).toThrow(field);

    let verifierError: unknown;
    try {
      verifyMaltlineProofWithContextForTesting(
        proof([{ stageId: 'one', inputRuns: winningRuns() }]),
        context([malformed]),
      );
    } catch (error) {
      verifierError = error;
    }
    expect(verifierError).toBeInstanceOf(MaltlineProofError);
    expect((verifierError as Error).message).toContain('Verifier campaign stage 1');
    expect((verifierError as Error).message).toContain(field);
  });

  it.each([
    ['scenario.ticksPerSecond', { ticksPerSecond: MALTLINE_RANKED_RESOURCE_LIMITS.maximumTicksPerSecond + 1 }],
    ['scenario.lanes', { lanes: MALTLINE_RANKED_RESOURCE_LIMITS.maximumLanes + 1 }],
    ['scenario.laneLength', { laneLength: MALTLINE_RANKED_RESOURCE_LIMITS.maximumLaneLength + 1 }],
    ['scenario.jarPoolSize', { jarPoolSize: MALTLINE_RANKED_RESOURCE_LIMITS.maximumJarPoolSize + 1 }],
    ['scenario.blendTicks', { blendTicks: MALTLINE_RANKED_RESOURCE_LIMITS.maximumWorkTicks + 1 }],
    ['scenario.customerCount', { customerCount: MALTLINE_RANKED_RESOURCE_LIMITS.maximumCustomerCount + 1 }],
    ['scenario.spawnIntervalTicks', {
      spawnIntervalTicks: MALTLINE_RANKED_RESOURCE_LIMITS.maximumSpawnTicks + 1,
    }],
    ['scenario.marchSpeed', { marchSpeed: MALTLINE_RANKED_RESOURCE_LIMITS.maximumMovementSpeed + 1 }],
    ['scenario.stationRepeatTicks', {
      stationRepeatTicks: MALTLINE_RANKED_RESOURCE_LIMITS.maximumInputRepeatTicks + 1,
    }],
    ['scenario.lives', { lives: MALTLINE_RANKED_RESOURCE_LIMITS.maximumLives + 1 }],
  ] as const)('keeps a tighter ranked ceiling for %s than the engine boundary', (field, changed) => {
    const engineValid = scenario('one', changed as Partial<MaltlineScenario>);
    expect(() => new MaltlineEngine(engineValid, { lives: 2, score: 0 })).not.toThrow();
    expect(() => verifyMaltlineProofWithContextForTesting(
      proof([{ stageId: 'one', inputRuns: winningRuns() }]),
      context([engineValid]),
    )).toThrow(new RegExp(`${field}.*ranked`, 'iu'));
  });

  it('shares run-context fundamentals while retaining tighter ranked run caps', () => {
    const stage = scenario('one');
    const validProof = proof([{ stageId: 'one', inputRuns: winningRuns() }]);
    for (const [invalidRun, field] of [
      [{ lives: 1.5, score: 0 }, 'lives'],
      [{ lives: 2, score: -1 }, 'score'],
      [{ lives: 2, score: Number.MAX_SAFE_INTEGER }, 'score'],
    ] as const) {
      expect(() => new MaltlineEngine(stage, invalidRun)).toThrow(`run.${field}`);
      expect(() => verifyMaltlineProofWithContextForTesting(validProof, context([stage], {
        initialRun: invalidRun,
      }))).toThrow(MaltlineProofError);
    }

    for (const rankedRun of [
      { lives: MALTLINE_RANKED_RESOURCE_LIMITS.maximumLives + 1, score: 0 },
      { lives: 2, score: MALTLINE_RANKED_RESOURCE_LIMITS.maximumInitialScore + 1 },
    ]) {
      expect(() => new MaltlineEngine(stage, rankedRun)).not.toThrow();
      expect(() => verifyMaltlineProofWithContextForTesting(validProof, context([stage], {
        initialRun: rankedRun,
      }))).toThrow(/ranked maximum/i);
    }
  });

  it('verifies the real eight-stage reference run within a generous CPU budget', () => {
    const canonicalProof = reactiveCampaignProof();
    const startedAt = performance.now();
    const verified = verifyMaltlineProofWithContextForTesting(canonicalProof, context(MALTLINE_CAMPAIGN, {
      initialRun: { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 },
    }));
    const elapsedMs = performance.now() - startedAt;

    expect(verified.summary).toEqual({
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
    expect(verified.stages.map((stage) => stage.ticks)).toEqual([
      1_558, 1_621, 1_881, 3_120, 3_766, 3_103, 3_312, 3_301,
    ]);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});


describe('Maltline proof recording and rich replay generation', () => {
  it('run-length encodes adjacent inputs without mutating input objects', () => {
    const idle: MaltlineInput = { ...IDLE_RUN };
    const blend: MaltlineInput = { ...IDLE_RUN, blend: true };
    expect(encodeMaltlineInputRuns([idle, idle, blend, blend, idle])).toEqual([
      inputRun(2),
      inputRun(2, { blend: true }),
      inputRun(1),
    ]);
    expect(idle).toEqual(IDLE_RUN);
    expect(blend).toEqual({ ...IDLE_RUN, blend: true });
  });

  it('marks fulfillment-aware rich local replays as version 2 and rejects version 1', () => {
    const stage = scenario('one');
    const inputs = winningRuns().flatMap(({ ticks, ...input }) =>
      Array.from({ length: ticks }, () => ({ ...input })));
    const replay = replayMaltline(stage, { lives: 2, score: 0 }, inputs);

    expect(MALTLINE_REPLAY_VERSION).toBe(2);
    expect(replay.version).toBe(2);
    expect(parseMaltlineReplay(JSON.stringify(replay))).toEqual(replay);
    expect(() => parseMaltlineReplay(JSON.stringify({ ...replay, version: 1 }))).toThrow(/unsupported/i);
  });
});

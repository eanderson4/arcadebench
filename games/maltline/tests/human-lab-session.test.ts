import { describe, expect, it } from 'vitest';
import { IDLE_INPUT } from '../src/core/types';
import { P108_HUMAN_LAB_ZERO_OBSERVATION } from '../src/experiments/human-lab-observation';
import { P108_HUMAN_LAB_CONSENT_STATEMENT_ID } from '../src/experiments/human-lab-study';
import {
  createP108HumanLabState,
  normalizeP108HumanLabArtifact,
  reduceP108HumanLab,
  type P108AssignmentOrder,
  type P108HumanLabCreation,
  type P108HumanLabArtifact,
  type P108LabExecutionMode,
  type P108HumanLabState,
} from '../src/experiments/human-lab-session';

const AD = ['a-registered-control', 'd-combined'] as const;
const DA = ['d-combined', 'a-registered-control'] as const;
const AUTHORITY_SHA256 = 'b'.repeat(64);
const ASSIGNMENT_TOKEN_SHA256 = 'a'.repeat(64);
const STUDY_ASSIGNMENT = {
  experienceStratum: 'first-time',
  assignedViewportCssWidth: 1280,
} as const;

function provenance(order: P108AssignmentOrder = AD): P108HumanLabCreation['provenance'] {
  const candidates = order.map((candidateId) => ({
    candidateId,
    seedOffset: 0 as const,
    candidateFingerprint: candidateId === 'a-registered-control'
      ? 'fnv1a64:aaaaaaaaaaaaaaaa' : 'fnv1a64:dddddddddddddddd',
    effectiveCampaignFingerprint: candidateId === 'a-registered-control'
      ? 'fnv1a64:cccccccccccccccc' : 'fnv1a64:eeeeeeeeeeeeeeee',
    scenarios: Array.from({ length: 8 }, (_, index) => ({
      id: `maltline-stage-${index + 1}`,
      fingerprint: `fnv1a64:${(index + 1).toString(16).padStart(16, '0')}`,
    })),
  })) as unknown as P108HumanLabCreation['provenance']['candidates'];
  return {
    assignmentTokenSha256: ASSIGNMENT_TOKEN_SHA256,
    entryEnvironment: {
      viewportCssWidth: 1280,
      viewportCssHeight: 720,
      devicePixelRatio: 2,
      reducedMotion: false,
    },
    sourceAuthority: {
      identity: {
        gameId: 'maltline',
        rulesetVersion: 1,
        campaignGeneration: 2,
        configurationSha256: AUTHORITY_SHA256,
      },
      verifiedConfigurationSha256: AUTHORITY_SHA256,
    },
    candidates,
  };
}

function creation(
  order: P108AssignmentOrder = AD,
  executionMode: P108LabExecutionMode = 'human',
): P108HumanLabCreation {
  return { assignmentOrder: order, executionMode, provenance: provenance(order),
    studyAssignment: STUDY_ASSIGNMENT };
}

function createState(
  order: P108AssignmentOrder = AD,
  executionMode: P108LabExecutionMode = 'human',
): P108HumanLabState {
  return createP108HumanLabState(creation(order, executionMode));
}
const COMPARISON = {
  clearerRamp: 2,
  fairer: 'same',
  moreEnjoyable: 1,
  rounds: [
    { round: 1, jarExperience: 'planning', recoveryPossible: 6 },
    { round: 2, jarExperience: 'waiting', recoveryPossible: 3 },
  ],
  scoreBelief: 'Serving customers and catching returning jars increased the score.',
} as const;
const TIMING = {
  elapsedMs: 10_000,
  activePlayMs: 7_000,
  pausedMs: 1_000,
  interruptions: [{ sequence: 1, kind: 'blur', phase: 'round1', surface: 'playing',
    startedAtMs: 4_000, durationMs: 1_000 }],
} as const;

function consentEvent(executionMode: P108LabExecutionMode): Record<string, unknown> {
  return executionMode === 'human' ? {
    type: 'consent',
    participantCode: 'p-a1b2c3',
    consentEvidence: {
      kind: 'participant-affirmed',
      statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID,
      affirmed: true,
    },
  } : {
    type: 'consent',
    participantCode: 'p-test001',
    consentEvidence: { kind: 'test-driver-bypass', statementId: null, affirmed: false },
  };
}

function tick(state: P108HumanLabState): P108HumanLabState {
  return reduceP108HumanLab(state, { type: 'tick', stage: state.activeStage, input: IDLE_INPUT });
}

function terminal(
  state: P108HumanLabState,
  status: 'won' | 'lost' = 'won',
): P108HumanLabState {
  return reduceP108HumanLab(state, terminalEvent(state, status));
}

function terminalEvent(
  state: P108HumanLabState,
  status: 'won' | 'lost' = 'won',
): Record<string, unknown> {
  const score = state.activeRun!.score + 100;
  const lives = status === 'lost' ? 0 : state.activeRun!.lives;
  const engineObserved = state.executionMode === 'human';
  const lostLives = state.activeRun!.lives - lives;
  return {
    type: 'stage-terminal',
    stage: state.activeStage,
    status,
    observationMode: engineObserved ? 'engine-observed' : 'test-driver-synthetic',
    scenarioId: `maltline-stage-${state.activeStage}`,
    score,
    scoreDelta: 100,
    lives,
    serviceActions: 0,
    fulfilled: 0,
    walkouts: engineObserved ? lostLives : 0,
    resolved: engineObserved ? lostLives : 0,
    exited: 0,
    lossReasons: {
      ...P108_HUMAN_LAB_ZERO_OBSERVATION.lossReasons,
      walkout: engineObserved ? lostLives : 0,
    },
    interactionCounts: P108_HUMAN_LAB_ZERO_OBSERVATION.interactionCounts,
  };
}

function pulse(
  state: P108HumanLabState,
  overrides: Partial<{
    perceivedPressure: number;
    pacing: 'too-idle' | 'balanced' | 'too-relentless';
    hardestDecision: string | null;
    lossExplanation: string | null;
  }> = {},
): P108HumanLabState {
  const round = state.pendingPulseRound!;
  const stage = state.rounds[round - 1]!.stages.at(-1)!;
  return reduceP108HumanLab(state, {
    type: 'stage-pulse',
    round,
    stage: stage.stage,
    perceivedPressure: 4,
    pacing: 'balanced',
    hardestDecision: null,
    lossExplanation: stage.status === 'lost' ? 'I could not recover before the next customer.' : null,
    ...overrides,
  });
}

function finishPractice(state: P108HumanLabState): P108HumanLabState {
  let current = reduceP108HumanLab(state, consentEvent(state.executionMode));
  for (let stage = 1; stage <= 3; stage++) current = terminal(tick(current));
  return current;
}

function finishRound(state: P108HumanLabState): P108HumanLabState {
  let current = state;
  for (let stage = 4; stage <= 7; stage++) current = pulse(terminal(tick(current)));
  return current;
}

function complete(
  order: P108AssignmentOrder = AD,
  executionMode: P108LabExecutionMode = 'human',
): P108HumanLabState {
  let state = finishPractice(createState(order, executionMode));
  state = finishRound(state);
  state = reduceP108HumanLab(state, { type: 'begin-round2' });
  state = finishRound(state);
  return reduceP108HumanLab(state, {
    type: 'freeze', ...COMPARISON, timing: TIMING,
  });
}

describe('P1-10 DOM-free human-lab session core', () => {
  it('exhausts the legal phase path with exact stage ranges and fresh comparison contexts', () => {
    let state = createState();
    expect(state).toMatchObject({ phase: 'welcome', studyAssignment: STUDY_ASSIGNMENT,
      participant: null, consentEvidence: null });
    state = reduceP108HumanLab(state, consentEvent(state.executionMode));
    expect(state).toMatchObject({ phase: 'practice', activeStage: 1, activeRun: { lives: 4, score: 0 } });

    for (let stage = 1; stage <= 3; stage++) {
      state = tick(state);
      state = terminal(state);
      expect(state.practiceStages.at(-1)).toMatchObject({ stage, ticks: 1, inputSamples: 1 });
    }
    expect(state).toMatchObject({ phase: 'round1', activeStage: 4, activeRun: { lives: 4, score: 0 } });
    expect(state.practiceStages.at(-1)!.score).toBe(300);

    state = terminal(tick(state));
    expect(state).toMatchObject({ phase: 'stage-pulse', pendingPulseRound: 1, activeStage: null });
    state = pulse(state, { hardestDecision: '  Choosing between the order and jar.  ' });
    expect(state).toMatchObject({ phase: 'round1', activeStage: 5, pendingPulseRound: null });
    state = pulse(terminal(tick(state)));
    state = pulse(terminal(tick(state)));
    state = pulse(terminal(tick(state)));
    expect(state.phase).toBe('intermission');
    expect(state.rounds[0]).toMatchObject({
      round: 1, candidateId: AD[0], initialRun: { lives: 4, score: 0 }, candidateExposure: 'full',
    });
    expect(state.rounds[0]!.stagePulses[0]).toMatchObject({ round: 1, stage: 4,
      terminalStatus: 'won', hardestDecision: 'Choosing between the order and jar.' });
    state = reduceP108HumanLab(state, { type: 'begin-round2' });
    expect(state).toMatchObject({ phase: 'round2', activeStage: 4, activeRun: { lives: 4, score: 0 } });
    state = finishRound(state);
    expect(state.phase).toBe('comparison');
    state = reduceP108HumanLab(state, {
      type: 'freeze', ...COMPARISON, timing: TIMING,
    });
    expect(state.phase).toBe('frozen');
    expect(state.artifact).toMatchObject({
      kind: 'maltline-human-lab-session', schemaVersion: 3, experimentId: 'EXP-049',
      experimentRevision: 11,
      policy: { rankEligibility: 'unranked', authorityRegistration: null, seasonId: null, submission: 'forbidden' },
      executionMode: 'human',
      studyAssignment: STUDY_ASSIGNMENT,
      participant: { participantCode: 'p-a1b2c3', ...STUDY_ASSIGNMENT },
      consentEvidence: { kind: 'participant-affirmed',
        statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID, affirmed: true },
      timing: TIMING,
      rounds: [{ initialRun: { lives: 4, score: 0 } }, { initialRun: { lives: 4, score: 0 } }],
      comparison: COMPARISON,
    });
    state = reduceP108HumanLab(state, { type: 'debrief' });
    expect(state.phase).toBe('debrief');
    expect(state.artifact).not.toBeNull();
  });

  it('ends a round after one lost attempt and marks its candidate exposure partial', () => {
    let state = finishPractice(createState());
    const staleStage = state.activeStage! - 1;
    expect(() => reduceP108HumanLab(state, {
      ...terminalEvent(state, 'lost'), stage: staleStage,
    })).toThrow(/active play stage/u);

    state = terminal(tick(state), 'lost');
    expect(state.phase).toBe('stage-pulse');
    state = pulse(state);
    expect(state.phase).toBe('intermission');
    expect(state.rounds[0]).toMatchObject({ candidateExposure: 'none',
      stages: [{ stage: 4, status: 'lost' }],
      stagePulses: [{ round: 1, stage: 4, terminalStatus: 'lost' }] });
    expect(() => reduceP108HumanLab(state, {
      ...terminalEvent({ ...state, activeStage: 4, activeRun: { lives: 4, score: 0 } } as P108HumanLabState),
    })).toThrow(/active play stage/u);

    state = reduceP108HumanLab(state, { type: 'begin-round2' });
    state = terminal(tick(state), 'lost');
    state = pulse(state);
    expect(state.phase).toBe('comparison');
    state = reduceP108HumanLab(state, {
      type: 'freeze', ...COMPARISON, timing: TIMING,
      clearerRamp: 'same', fairer: 2, moreEnjoyable: 2,
    });
    expect(state.artifact!.rounds.map(({ candidateExposure }) => candidateExposure))
      .toEqual(['none', 'none']);
  });

  it.each([
    [4, 'lost', 'none'],
    [5, 'lost', 'partial'],
    [6, 'lost', 'partial'],
    [7, 'lost', 'full'],
    [7, 'won', 'full'],
  ] as const)('derives %s/%s exposure as %s in both rounds and candidate orders', (target, status, expected) => {
    for (const order of [AD, DA]) {
      let state = finishPractice(createState(order));
      for (let stage = 4; stage < target; stage++) state = pulse(terminal(tick(state)));
      state = terminal(tick(state), status);
      state = pulse(state);
      expect(state.rounds[0]).toMatchObject({ candidateId: order[0], candidateExposure: expected });
      state = reduceP108HumanLab(state, { type: 'begin-round2' });
      for (let stage = 4; stage < target; stage++) state = pulse(terminal(tick(state)));
      state = terminal(tick(state), status);
      state = pulse(state);
      expect(state.rounds[1]).toMatchObject({ candidateId: order[1], candidateExposure: expected });
    }
  });

  it('accepts exactly one bounded pulse per comparison terminal and enforces loss explanation semantics', () => {
    let won = finishPractice(createState());
    won = terminal(tick(won));
    const before = JSON.stringify(won);
    expect(() => tick(won)).toThrow(/active play stage/u);
    expect(() => reduceP108HumanLab(won, {
      type: 'stage-pulse', round: 2, stage: 4, perceivedPressure: 4, pacing: 'balanced',
      hardestDecision: null, lossExplanation: null,
    })).toThrow(/does not match/u);
    for (const perceivedPressure of [0, 8]) {
      expect(() => pulse(won, { perceivedPressure })).toThrow(/1 through 7/u);
    }
    expect(() => pulse(won, { pacing: 'rushed' as 'balanced' })).toThrow(/pacing/u);
    expect(() => pulse(won, { lossExplanation: 'A loss that did not happen.' }))
      .toThrow(/forbidden/u);
    expect(() => pulse(won, { hardestDecision: 'x'.repeat(281) })).toThrow(/at most 280/u);
    expect(JSON.stringify(won)).toBe(before);
    const advanced = pulse(won, { hardestDecision: '   ' });
    expect(advanced.rounds[0]!.stagePulses[0]!.hardestDecision).toBeNull();
    expect(() => reduceP108HumanLab(advanced, {
      type: 'stage-pulse', round: 1, stage: 4, perceivedPressure: 4, pacing: 'balanced',
      hardestDecision: null, lossExplanation: null,
    })).toThrow(/only after/u);

    let lost = finishPractice(createState());
    lost = terminal(tick(lost), 'lost');
    expect(() => pulse(lost, { lossExplanation: null })).toThrow(/required/u);
    expect(() => pulse(lost, { lossExplanation: '   ' })).toThrow(/required/u);
    expect(() => pulse(lost, { lossExplanation: 'x'.repeat(281) })).toThrow(/at most 280/u);
    expect(pulse(lost, { lossExplanation: '  I missed the return.  ' }).rounds[0]!.stagePulses[0])
      .toMatchObject({ terminalStatus: 'lost', lossExplanation: 'I missed the return.' });
  });

  it('accepts tick input only during active play and rejects stale, malformed, or accessor events immutably', () => {
    const welcome = createState();
    expect(() => tick(welcome)).toThrow(/active play stage/u);
    let state = finishPractice(welcome);
    state = finishRound(state);
    expect(() => tick(state)).toThrow(/active play stage/u);

    const round2 = reduceP108HumanLab(state, { type: 'begin-round2' });
    const before = JSON.stringify(round2);
    expect(() => reduceP108HumanLab(round2, {
      type: 'tick', stage: 4,
      input: { stationDir: 2, laneDir: 0, blend: false, serve: false },
    })).toThrow(/stationDir/u);
    let getterCalls = 0;
    const accessor = Object.defineProperty({ stage: 4, input: IDLE_INPUT }, 'type', {
      enumerable: true, get: () => { getterCalls++; return 'tick'; },
    });
    expect(() => reduceP108HumanLab(round2, accessor)).toThrow(/data property/u);
    expect(getterCalls).toBe(0);
    expect(JSON.stringify(round2)).toBe(before);
  });

  it('strictly reconciles and freezes stage observation fields', () => {
    const playing = tick(reduceP108HumanLab(createState(), consentEvent('human')));
    const coherent = {
      ...terminalEvent(playing),
      serviceActions: 2,
      fulfilled: 1,
      walkouts: 0,
      resolved: 1,
      exited: 1,
      interactionCounts: {
        executedStationMoves: 1, executedLaneMoves: 1, blendStarts: 1,
        blendCancels: 0, shakeLaunches: 2, jarCatches: 1,
      },
    };
    const recorded = reduceP108HumanLab(playing, coherent).practiceStages[0]!;
    expect(recorded).toMatchObject({ observationMode: 'engine-observed',
      scenarioId: 'maltline-stage-1', scoreDelta: 100, serviceActions: 2,
      fulfilled: 1, resolved: 1, exited: 1 });
    expect(Object.isFrozen(recorded)).toBe(true);
    expect(Object.isFrozen(recorded.lossReasons)).toBe(true);
    expect(Object.isFrozen(recorded.interactionCounts)).toBe(true);

    const reject = (change: (value: Record<string, unknown>) => void, pattern: RegExp) => {
      const value = structuredClone(terminalEvent(playing));
      change(value);
      expect(() => reduceP108HumanLab(playing, value)).toThrow(pattern);
    };
    reject((value) => { value.observationMode = 'test-driver-synthetic'; }, /observationMode/u);
    reject((value) => { value.scenarioId = '   '; }, /scenarioId/u);
    reject((value) => { value.scenarioId = 'x'.repeat(101); }, /scenarioId/u);
    reject((value) => { value.scoreDelta = 99; }, /reconcile/u);
    reject((value) => { value.resolved = 1; }, /reconcile/u);
    reject((value) => { value.fulfilled = 1; }, /reconcile/u);
    reject((value) => { value.serviceActions = Number.MAX_SAFE_INTEGER + 1; }, /safe integer/u);
    reject((value) => { (value.lossReasons as Record<string, unknown>).walkout = Number.NaN; }, /safe integer/u);
    reject((value) => {
      (value.interactionCounts as Record<string, unknown>).jarCatches = Number.POSITIVE_INFINITY;
    }, /safe integer/u);
    reject((value) => { (value.lossReasons as Record<string, unknown>).extra = 0; }, /unsupported/u);

    const lost = structuredClone(terminalEvent(playing, 'lost'));
    (lost.lossReasons as Record<string, unknown>).walkout = 3;
    expect(() => reduceP108HumanLab(playing, lost)).toThrow(/engine-observed losses/u);
    const walkoutMismatch = structuredClone(terminalEvent(playing, 'lost'));
    walkoutMismatch.walkouts = 3;
    walkoutMismatch.resolved = 3;
    expect(() => reduceP108HumanLab(playing, walkoutMismatch)).toThrow(/engine-observed losses/u);

    let getterCalls = 0;
    const accessorReasons = Object.defineProperty({}, 'walkout', {
      enumerable: true, get: () => { getterCalls++; return 0; },
    });
    Object.assign(accessorReasons, { shake_smashed: 0, jar_smashed: 0 });
    reject((value) => { value.lossReasons = accessorReasons; }, /data property/u);
    expect(getterCalls).toBe(0);
  });

  it('guards every non-play transition and rejects duplicate or out-of-order events', () => {
    const welcome = createState();
    expect(() => reduceP108HumanLab(welcome, { type: 'begin-round2' })).toThrow(/intermission/u);
    expect(() => reduceP108HumanLab(welcome, {
      type: 'freeze', ...COMPARISON, timing: TIMING,
      clearerRamp: 1, fairer: 1, moreEnjoyable: 1,
    })).toThrow(/comparison/u);
    expect(() => reduceP108HumanLab(welcome, { type: 'debrief' })).toThrow(/after freeze/u);
    expect(() => reduceP108HumanLab(welcome, { type: 'unknown' })).toThrow(/unsupported/u);
    const practice = reduceP108HumanLab(welcome, consentEvent('human'));
    expect(() => reduceP108HumanLab(practice, consentEvent('human'))).toThrow(/welcome/u);
    expect(() => reduceP108HumanLab(practice, {
      ...terminalEvent(practice), stage: 4,
    })).toThrow(/active play stage/u);
  });

  it('normalizes to deterministic bytes, clones deeply, and rejects extras, accessors, and ranked keys', () => {
    const source = structuredClone(complete(AD).artifact!) as P108HumanLabArtifact;
    const first = normalizeP108HumanLabArtifact(source);
    const second = normalizeP108HumanLabArtifact(structuredClone(source));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.rounds[0].stages)).toBe(true);
    (source.rounds[0].stages[0]!.startingRun as { score: number }).score = 999;
    expect(first.rounds[0].stages[0]!.startingRun.score).toBe(0);

    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(first), extra: true }))
      .toThrow(/unsupported fields/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), comparison: { ...first.comparison, proof: {} },
    })).toThrow(/ranked-protocol key/u);
    let calls = 0;
    const accessor = Object.defineProperty(structuredClone(first), 'comparison', {
      enumerable: true, get: () => { calls++; return first.comparison; },
    });
    expect(() => normalizeP108HumanLabArtifact(accessor)).toThrow(/data properties/u);
    expect(calls).toBe(0);

    const synthetic = complete(AD, 'test-driver').artifact!;
    expect(synthetic).toMatchObject({
      kind: 'maltline-human-lab-test-driver-session', executionMode: 'test-driver',
    });
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), executionMode: 'test-driver',
    })).toThrow(/kind and execution mode/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), schemaVersion: 2, experimentRevision: 3,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 4,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 5,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 6,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 7,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 8,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 9,
    })).toThrow(/identity is unsupported/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first), experimentRevision: 10,
    })).toThrow(/identity is unsupported/u);

    const zeroTickHuman = {
      ...structuredClone(first),
      practice: {
        ...structuredClone(first.practice),
        stages: first.practice.stages.map((stage, index) => index === 0
          ? { ...stage, ticks: 0, inputSamples: 0 } : structuredClone(stage)),
      },
    };
    expect(() => normalizeP108HumanLabArtifact(zeroTickHuman)).toThrow(/real gameplay tick/u);
    expect(normalizeP108HumanLabArtifact({
      ...structuredClone(synthetic),
      practice: {
        ...structuredClone(synthetic.practice),
        stages: synthetic.practice.stages.map((stage, index) => index === 0
          ? { ...stage, ticks: 0, inputSamples: 0 } : structuredClone(stage)),
      },
    })).toMatchObject({ executionMode: 'test-driver' });

    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      rounds: [
        { ...structuredClone(first.rounds[0]), stagePulses: first.rounds[0].stagePulses.slice(0, -1) },
        structuredClone(first.rounds[1]),
      ],
    })).toThrow(/exactly/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      rounds: [
        { ...structuredClone(first.rounds[0]), stagePulses: [
          { ...first.rounds[0].stagePulses[0]!, terminalStatus: 'lost' },
          ...first.rounds[0].stagePulses.slice(1),
        ] },
        structuredClone(first.rounds[1]),
      ],
    })).toThrow(/does not match/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      comparison: { ...structuredClone(first.comparison), scoreBelief: '   ' },
    })).toThrow(/required/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      comparison: { ...structuredClone(first.comparison), rounds: [
        { ...first.comparison.rounds[0], recoveryPossible: 8 },
        structuredClone(first.comparison.rounds[1]),
      ] },
    })).toThrow(/1 through 7/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      timing: { ...structuredClone(first.timing), activePlayMs: first.timing.elapsedMs },
    })).toThrow(/totals do not reconcile/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      timing: { ...structuredClone(first.timing), extra: true },
    })).toThrow(/unsupported fields/u);

    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      rounds: [{
        ...structuredClone(first.rounds[0]),
        stages: first.rounds[0].stages.map((stage) => ({
          ...structuredClone(stage), startingRun: { ...stage.startingRun, lives: 3 }, lives: 3,
        })),
      }, structuredClone(first.rounds[1])],
    })).toThrow(/stage progression or exposure/u);
    expect(() => normalizeP108HumanLabArtifact({
      ...structuredClone(first),
      rounds: [{
        ...structuredClone(first.rounds[0]),
        stages: [{ ...structuredClone(first.rounds[0].stages[0]!), scenarioId: 'maltline-stage-8' },
          ...structuredClone(first.rounds[0].stages.slice(1))],
      }, structuredClone(first.rounds[1])],
    })).toThrow(/materializer provenance/u);
    for (const target of ['practice', 'round-stages', 'rounds'] as const) {
      const withExtra = structuredClone(first);
      const array = target === 'practice' ? withExtra.practice.stages
        : target === 'round-stages' ? withExtra.rounds[0].stages : withExtra.rounds;
      Object.defineProperty(array, 'extra', { enumerable: true, value: true });
      expect(() => normalizeP108HumanLabArtifact(withExtra)).toThrow(/exact/u);
    }
  });

  it('is counterbalance-neutral apart from the injected assignment mapping', () => {
    const ad = complete(AD).artifact!;
    const da = complete(DA).artifact!;
    expect(ad.assignmentOrder).toEqual(AD);
    expect(da.assignmentOrder).toEqual(DA);
    expect(ad.rounds.map(({ candidateId }) => candidateId)).toEqual(AD);
    expect(da.rounds.map(({ candidateId }) => candidateId)).toEqual(DA);
    const neutral = (artifact: P108HumanLabArtifact) => ({
      ...artifact,
      assignmentOrder: ['candidate-1', 'candidate-2'],
      provenance: { ...artifact.provenance, candidates: artifact.provenance.candidates.map((candidate, index) => ({
        ...candidate, candidateId: `candidate-${index + 1}`, candidateFingerprint: 'candidate-fingerprint',
        effectiveCampaignFingerprint: 'campaign-fingerprint',
      })) },
      rounds: artifact.rounds.map((round) => ({ ...round, candidateId: `candidate-${round.round}` })),
    });
    expect(neutral(ad)).toEqual(neutral(da));
    expect(() => createP108HumanLabState({
      ...creation(), assignmentOrder: ['a-registered-control', 'a-registered-control'],
    }))
      .toThrow(/exactly A and D/u);
    expect(() => createP108HumanLabState({ ...creation(), executionMode: 'automation' }))
      .toThrow(/execution mode/u);
    expect(() => createP108HumanLabState({ ...creation(), extra: true }))
      .toThrow(/unsupported fields/u);
    const human = createState();
    expect(Object.isFrozen(human)).toBe(true);
    expect(() => reduceP108HumanLab(human, { ...consentEvent('human'),
      executionMode: 'test-driver' }))
      .toThrow(/unsupported fields/u);
    expect(human).toMatchObject({ phase: 'welcome', executionMode: 'human' });
  });

  it('requires exact mode-bound consent before accepting gameplay', () => {
    const welcome = createState();
    expect(() => tick(welcome)).toThrow(/active play stage/u);
    expect(() => reduceP108HumanLab(welcome, terminalEvent({
      ...welcome, activeStage: 1, activeRun: { lives: 4, score: 0 },
    } as P108HumanLabState))).toThrow(/active play stage/u);

    const reject = (event: unknown, pattern: RegExp) => {
      expect(() => reduceP108HumanLab(welcome, event)).toThrow(pattern);
      expect(welcome).toMatchObject({ phase: 'welcome', participant: null, consentEvidence: null });
    };
    reject({ ...consentEvent('human'), participantCode: 'p-A1B2C3' }, /participantCode/u);
    reject({ ...consentEvent('human'), consentEvidence: {
      kind: 'participant-affirmed', statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID,
      affirmed: false,
    } }, /affirmative participant/u);
    reject({ ...consentEvent('human'), consentEvidence: {
      kind: 'participant-affirmed', statementId: 'maltline-p108-local-consent-v3',
      affirmed: true,
    } }, /affirmative participant/u);
    reject(consentEvent('test-driver'), /affirmative participant/u);
    reject({ ...consentEvent('human'), extra: true }, /unsupported/u);

    let calls = 0;
    const accessor = Object.defineProperty({ type: 'consent', participantCode: 'p-a1b2c3' },
      'consentEvidence', { enumerable: true, get: () => { calls++; return consentEvent('human').consentEvidence; } });
    reject(accessor, /data property/u);
    expect(calls).toBe(0);

    const practice = reduceP108HumanLab(welcome, consentEvent('human'));
    expect(practice).toMatchObject({ phase: 'practice', participant: {
      participantCode: 'p-a1b2c3', ...STUDY_ASSIGNMENT,
    }, consentEvidence: { kind: 'participant-affirmed', affirmed: true } });
    expect(Object.isFrozen(practice.participant)).toBe(true);
    expect(Object.isFrozen(practice.consentEvidence)).toBe(true);
    expect(() => reduceP108HumanLab(practice, consentEvent('human'))).toThrow(/welcome/u);

    const synthetic = reduceP108HumanLab(createState(AD, 'test-driver'),
      consentEvent('test-driver'));
    expect(synthetic).toMatchObject({ participant: { participantCode: 'p-test001' },
      consentEvidence: { kind: 'test-driver-bypass', affirmed: false } });
    expect(() => reduceP108HumanLab(createState(AD, 'test-driver'), consentEvent('human')))
      .toThrow(/synthetic consent/u);
  });

  it('binds study assignment to entry provenance and artifact participant identity', () => {
    expect(() => createP108HumanLabState({ ...creation(), studyAssignment: {
      ...STUDY_ASSIGNMENT, assignedViewportCssWidth: 700,
    } })).toThrow(/viewport width.*entry provenance/u);
    const artifact = complete().artifact!;
    expect(Object.isFrozen(artifact.studyAssignment)).toBe(true);
    expect(Object.isFrozen(artifact.participant)).toBe(true);
    expect(Object.isFrozen(artifact.consentEvidence)).toBe(true);

    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(artifact), participant: {
      ...artifact.participant, experienceStratum: 'informed',
    } })).toThrow(/match.*strata/u);
    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(artifact), participant: {
      ...artifact.participant, assignedViewportCssWidth: 700,
    } })).toThrow(/match.*strata/u);
    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(artifact),
      studyAssignment: { ...artifact.studyAssignment, assignedViewportCssWidth: 700 },
      participant: { ...artifact.participant, assignedViewportCssWidth: 700 },
    })).toThrow(/viewport width.*entry provenance/u);
    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(artifact),
      consentEvidence: { kind: 'test-driver-bypass', statementId: null, affirmed: false },
    })).toThrow(/affirmative participant/u);
    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(artifact), participant: null }))
      .toThrow(/must be an object/u);
    expect(() => normalizeP108HumanLabArtifact({ ...structuredClone(artifact),
      consentEvidence: null })).toThrow(/must be an object/u);

    const comparisonWithoutIdentity = { ...complete(), phase: 'comparison' as const,
      participant: null, consentEvidence: null, artifact: null };
    expect(() => reduceP108HumanLab(comparisonWithoutIdentity, {
      type: 'freeze', ...COMPARISON, timing: TIMING,
    })).toThrow(/requires participant identity and consent/u);
  });

  it('strictly clones, freezes, and validates materializer provenance', () => {
    const source = structuredClone(creation());
    const state = createP108HumanLabState(source);
    expect(state.provenance).toEqual(source.provenance);
    expect(Object.isFrozen(state.provenance)).toBe(true);
    expect(Object.isFrozen(state.provenance.sourceAuthority.identity)).toBe(true);
    expect(Object.isFrozen(state.provenance.candidates[0].scenarios)).toBe(true);
    expect(Object.isFrozen(state.provenance.candidates[0].scenarios[0])).toBe(true);
    source.provenance.entryEnvironment.viewportCssWidth = 1;
    source.provenance.candidates[0].scenarios[0]!.id = 'mutated';
    expect(state.provenance.entryEnvironment.viewportCssWidth).toBe(1280);
    expect(state.provenance.candidates[0].scenarios[0]!.id).toBe('maltline-stage-1');
    expect(complete().artifact!.provenance).toEqual(state.provenance);

    const reject = (change: (value: Record<string, any>) => void, pattern: RegExp) => {
      const value = structuredClone(creation()) as unknown as Record<string, any>;
      change(value);
      expect(() => createP108HumanLabState(value)).toThrow(pattern);
    };
    reject((value) => { delete value.provenance.assignmentTokenSha256; }, /missing/u);
    reject((value) => { value.provenance.extra = true; }, /unsupported/u);
    reject((value) => { value.provenance.assignmentTokenSha256 = 'A'.repeat(64); }, /lowercase SHA/u);
    reject((value) => { value.provenance.entryEnvironment.viewportCssWidth = 0; }, /positive/u);
    reject((value) => { value.provenance.entryEnvironment.devicePixelRatio = Number.NaN; }, /finite/u);
    reject((value) => { value.provenance.entryEnvironment.reducedMotion = 0; }, /boolean/u);
    reject((value) => { value.provenance.sourceAuthority.identity.rulesetVersion = 0; }, /positive/u);
    reject((value) => { value.provenance.sourceAuthority.verifiedConfigurationSha256 = 'c'.repeat(64); }, /digests must match/u);
    reject((value) => { value.provenance.candidates.reverse(); }, /align/u);
    reject((value) => { value.provenance.candidates[0].seedOffset = 1; }, /must be zero/u);
    reject((value) => { value.provenance.candidates[0].candidateFingerprint = 'fnv1a64:ABCDEF0123456789'; }, /FNV/u);
    reject((value) => { value.provenance.candidates[0].scenarios.pop(); }, /exactly 8/u);
    reject((value) => { value.provenance.candidates[0].scenarios[1].id = 'maltline-stage-1'; }, /unique IDs/u);

    let calls = 0;
    const accessor = structuredClone(creation()) as unknown as Record<string, any>;
    Object.defineProperty(accessor.provenance.entryEnvironment, 'devicePixelRatio', {
      enumerable: true, get: () => { calls++; return 2; },
    });
    expect(() => createP108HumanLabState(accessor)).toThrow(/data property/u);
    expect(calls).toBe(0);
  });
});

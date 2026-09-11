import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { MaltlineEngine } from '../../src/core/engine';
import type { MaltlineInput, MaltlineScenario, RunContext } from '../../src/core/types';
import {
  advanceP108HumanLabObservation,
  P108_HUMAN_LAB_ZERO_OBSERVATION,
} from '../../src/experiments/human-lab-observation';
import {
  normalizeP108HumanLabArtifact,
  type P108HumanLabArtifact,
  type P108LabStageRecord,
} from '../../src/experiments/human-lab-session';
import {
  materializeCanonicalP108Campaign,
  type P108CanonicalLabCandidateId,
} from '../../src/experiments/p1-08-candidates';
import { REACTIVE_MALTLINE_CONTROLLER } from '../../src/telemetry/reactive-controller';
import { MaltlineViewerInputAdapter } from '../../src/viewer/viewer-input-adapter';

type AssignmentOrder = readonly [P108CanonicalLabCandidateId, P108CanonicalLabCandidateId];

interface LevelRun {
  mask: number;
  ticks: number;
}

interface StageTape {
  stage: number;
  runs: readonly LevelRun[];
  expected: P108LabStageRecord;
}

interface BrowserAudit {
  consoleErrors: string[];
  pageErrors: string[];
}

interface MatrixCase {
  label: string;
  token: string;
  width: 700 | 1280;
  order: AssignmentOrder;
}

const FRESH_RUN = Object.freeze({ lives: 4, score: 0 });
const STAGE_TICK_LIMIT = 10_000;
const TICKS_PER_FRAME = 5;
const KEY_BITS = Object.freeze([
  [1, 'ArrowLeft'],
  [2, 'ArrowRight'],
  [4, 'ArrowUp'],
  [8, 'ArrowDown'],
  [16, 'Space'],
  [32, 'KeyF'],
] as const);
const A = 'a-registered-control' as const;
const D = 'd-combined' as const;
const CASES: readonly MatrixCase[] = Object.freeze([
  { label: 'AD at 1280', token: 'exp049-lab-k7m4q2', width: 1280, order: [A, D] },
  { label: 'DA at 1280', token: 'exp049-lab-p9v2n6', width: 1280, order: [D, A] },
  { label: 'AD at 700', token: 'exp049-lab-r3c8w5', width: 700, order: [A, D] },
  { label: 'DA at 700', token: 'exp049-lab-x6h1t9', width: 700, order: [D, A] },
]);

const browserAudits = new WeakMap<Page, BrowserAudit>();
let practiceTapes: readonly StageTape[];
let candidateTapes: Readonly<Record<P108CanonicalLabCandidateId, readonly StageTape[]>>;

function inputLevelMask(input: MaltlineInput): number {
  return (input.stationDir < 0 ? 1 : input.stationDir > 0 ? 2 : 0)
    | (input.laneDir < 0 ? 4 : input.laneDir > 0 ? 8 : 0)
    | (input.blend ? 16 : 0)
    | (input.serve ? 32 : 0);
}

function applyLevel(
  adapter: MaltlineViewerInputAdapter,
  previousMask: number,
  nextMask: number,
): void {
  const changed = previousMask ^ nextMask;
  for (const [bit, code] of KEY_BITS) {
    if ((changed & bit) === 0) continue;
    if ((nextMask & bit) !== 0) adapter.keyDown(code);
    else adapter.keyUp(code);
  }
}

function appendLevelRun(runs: LevelRun[], mask: number): void {
  const previous = runs.at(-1);
  if (previous?.mask === mask) previous.ticks += 1;
  else runs.push({ mask, ticks: 1 });
}

function buildStageTape(
  scenario: Readonly<MaltlineScenario>,
  startingRun: Readonly<RunContext>,
  stage: number,
): StageTape {
  const engine = new MaltlineEngine(scenario, startingRun);
  const controller = REACTIVE_MALTLINE_CONTROLLER.create();
  const adapter = new MaltlineViewerInputAdapter(engine.scenario);
  const runs: LevelRun[] = [];
  let heldMask = 0;
  let observation = P108_HUMAN_LAB_ZERO_OBSERVATION;

  while (engine.snapshot().status === 'running') {
    const before = engine.snapshot();
    if (before.tick >= STAGE_TICK_LIMIT) {
      throw new Error(`Real-engine tape exceeded ${STAGE_TICK_LIMIT} ticks in stage ${stage}`);
    }
    const nextMask = inputLevelMask(controller(before, engine.scenario));
    applyLevel(adapter, heldMask, nextMask);
    heldMask = nextMask;
    appendLevelRun(runs, nextMask);
    engine.setInput(adapter.inputForTick(before.tick + 1, before));
    const result = engine.step();
    observation = advanceP108HumanLabObservation(observation, before, result);
  }

  const finalState = engine.snapshot();
  if (finalState.status !== 'won' && finalState.status !== 'lost') {
    throw new Error(`Real-engine tape did not terminate in stage ${stage}`);
  }
  const expected: P108LabStageRecord = Object.freeze({
    stage,
    status: finalState.status,
    observationMode: 'engine-observed',
    scenarioId: finalState.scenarioId,
    startingRun: Object.freeze({ lives: startingRun.lives, score: startingRun.score }),
    ticks: finalState.tick,
    inputSamples: finalState.tick,
    score: finalState.score,
    scoreDelta: finalState.score - startingRun.score,
    lives: finalState.lives,
    serviceActions: finalState.serviceActions,
    fulfilled: finalState.fulfilled,
    walkouts: finalState.walkouts,
    resolved: finalState.resolved,
    exited: finalState.exited,
    lossReasons: observation.lossReasons,
    interactionCounts: observation.interactionCounts,
  });
  expect(runs.reduce((total, run) => total + run.ticks, 0)).toBe(finalState.tick);
  return Object.freeze({ stage, runs: Object.freeze(runs.map((run) => Object.freeze(run))), expected });
}

function buildTapeSequence(
  campaign: readonly Readonly<MaltlineScenario>[],
  firstStageIndex: number,
  lastStageIndex: number,
): readonly StageTape[] {
  const tapes: StageTape[] = [];
  let run: Readonly<RunContext> = FRESH_RUN;
  for (let index = firstStageIndex; index <= lastStageIndex; index++) {
    const tape = buildStageTape(campaign[index]!, run, index + 1);
    tapes.push(tape);
    if (tape.expected.status === 'lost') {
      if (index !== lastStageIndex) throw new Error(`Reference controller lost before stage ${lastStageIndex + 1}`);
      break;
    }
    run = Object.freeze({ lives: tape.expected.lives, score: tape.expected.score });
  }
  if (tapes.at(-1)?.stage !== lastStageIndex + 1) {
    throw new Error(`Reference controller did not enter stage ${lastStageIndex + 1}`);
  }
  return Object.freeze(tapes);
}

function stageSummary(tapes: readonly StageTape[]): Array<{
  stage: number;
  status: 'won' | 'lost';
  ticks: number;
  score: number;
  lives: number;
}> {
  return tapes.map(({ expected }) => ({
    stage: expected.stage,
    status: expected.status,
    ticks: expected.ticks,
    score: expected.score,
    lives: expected.lives,
  }));
}

test.beforeAll(async () => {
  const [control, combined] = await Promise.all([
    materializeCanonicalP108Campaign({ candidateId: A, seedOffset: 0 }),
    materializeCanonicalP108Campaign({ candidateId: D, seedOffset: 0 }),
  ]);
  practiceTapes = buildTapeSequence(control.campaign, 0, 2);
  candidateTapes = Object.freeze({
    [A]: buildTapeSequence(control.campaign, 3, 6),
    [D]: buildTapeSequence(combined.campaign, 3, 6),
  });

  expect(stageSummary(practiceTapes)).toEqual([
    { stage: 1, status: 'won', ticks: 1_558, score: 2_280, lives: 4 },
    { stage: 2, status: 'won', ticks: 1_621, score: 4_980, lives: 4 },
    { stage: 3, status: 'won', ticks: 1_889, score: 8_130, lives: 4 },
  ]);
  expect(stageSummary(candidateTapes[A])).toEqual([
    { stage: 4, status: 'won', ticks: 3_120, score: 4_950, lives: 4 },
    { stage: 5, status: 'won', ticks: 4_143, score: 8_420, lives: 1 },
    { stage: 6, status: 'won', ticks: 3_112, score: 11_945, lives: 1 },
    { stage: 7, status: 'lost', ticks: 2_184, score: 15_170, lives: 0 },
  ]);
  expect(stageSummary(candidateTapes[D])).toEqual([
    { stage: 4, status: 'won', ticks: 3_120, score: 4_950, lives: 4 },
    { stage: 5, status: 'won', ticks: 3_121, score: 9_900, lives: 4 },
    { stage: 6, status: 'won', ticks: 3_112, score: 14_175, lives: 4 },
    { stage: 7, status: 'won', ticks: 3_351, score: 20_175, lives: 2 },
  ]);
});

test.beforeEach(async ({ page }) => {
  const audit: BrowserAudit = { consoleErrors: [], pageErrors: [] };
  browserAudits.set(page, audit);
  page.on('console', (message) => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  await page.addInitScript(() => {
    let nextFrame = 1;
    const frames = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      frames.delete(id);
    };
    (window as typeof window & { __advanceLabFrame?: (now: number) => void })
      .__advanceLabFrame = (now) => {
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(now);
      };

    const prohibited: string[] = [];
    (window as typeof window & { __labProhibitedCalls?: string[] }).__labProhibitedCalls = prohibited;
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      prohibited.push('storage.setItem');
      nativeSetItem.call(this, key, value);
    };
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string): void {
      prohibited.push('storage.removeItem');
      nativeRemoveItem.call(this, key);
    };
    const nativeClear = Storage.prototype.clear;
    Storage.prototype.clear = function (): void {
      prohibited.push('storage.clear');
      nativeClear.call(this);
    };
    const nativeFetch = window.fetch;
    window.fetch = (...args): ReturnType<typeof fetch> => {
      prohibited.push(`fetch:${String(args[0])}`);
      return nativeFetch(...args);
    };
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
      prohibited.push(`xhr:${String(args[1])}`);
      Reflect.apply(nativeOpen, this, args);
    } as typeof nativeOpen;
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (...args): boolean => {
      prohibited.push(`beacon:${String(args[0])}`);
      return nativeBeacon(...args);
    };
    const NativeWebSocket = window.WebSocket;
    class AuditedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        prohibited.push(`websocket:${String(url)}`);
        super(url, protocols);
      }
    }
    window.WebSocket = AuditedWebSocket;
  });
});

test.afterEach(async ({ page }) => {
  expect(browserAudits.get(page)).toEqual({ consoleErrors: [], pageErrors: [] });
});

async function openLab(page: Page, matrixCase: MatrixCase): Promise<void> {
  await page.setViewportSize({ width: matrixCase.width, height: 720 });
  const response = await page.goto(
    `/src/viewer/human-lab.html?token=${matrixCase.token}&labTestDriver=1`,
  );
  expect(response?.ok()).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', /^(true|fallback)$/u);
}

async function snapshot(page: Page): Promise<{
  phase: string;
  surface: string;
  activeStage: number | null;
  engineTick: number;
  mappingRevealed: boolean;
}> {
  return page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot());
}

async function driverAdvance(page: Page): Promise<void> {
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.advance());
}

async function beginStage(page: Page): Promise<void> {
  await expectMappingHidden(page);
  await driverAdvance(page);
  await expect.poll(() => snapshot(page)).toMatchObject({ surface: 'countdown', engineTick: 0 });
  await expectMappingHidden(page);
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.completeCountdown());
  await expect.poll(() => snapshot(page)).toMatchObject({ surface: 'playing', engineTick: 0 });
  await expectMappingHidden(page);
}

async function expectMappingHidden(page: Page): Promise<void> {
  const documentText = await page.evaluate(() => `${document.head.outerHTML}\n${document.body.outerHTML}`);
  expect(documentText).not.toContain(A);
  expect(documentText).not.toContain(D);
  expect(documentText).not.toMatch(/Round 1 was setup|Round 2 was setup|setup A then setup D|setup D then setup A/iu);
  expect((await snapshot(page)).mappingRevealed).toBe(false);
}

async function driveStageTape(
  page: Page,
  tape: StageTape,
  startClockTick: number,
): Promise<number> {
  const driven = await page.evaluate(({ runs, firstClockTick, stage, ticksPerFrame, keyBits }) => {
    const driver = window.__maltlineHumanLabTestDriver!;
    const advance = (window as typeof window & { __advanceLabFrame?: (now: number) => void })
      .__advanceLabFrame;
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]');
    if (advance === undefined || root === null) throw new Error('Real-engine browser harness is unavailable');

    let clockTick = firstClockTick;
    let heldMask = 0;
    advance(clockTick * 1_000 / 60);
    for (const run of runs) {
      const changed = heldMask ^ run.mask;
      for (const [bit, code] of keyBits) {
        if ((changed & bit) === 0) continue;
        root.dispatchEvent(new KeyboardEvent((run.mask & bit) !== 0 ? 'keydown' : 'keyup', {
          bubbles: true,
          cancelable: true,
          code,
        }));
      }
      heldMask = run.mask;
      let remaining = run.ticks;
      while (remaining > 0) {
        const chunk = Math.min(ticksPerFrame, remaining);
        clockTick += chunk;
        advance(clockTick * 1_000 / 60);
        remaining -= chunk;
      }
    }
    for (const [bit, code] of keyBits) {
      if ((heldMask & bit) !== 0) {
        root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, code }));
      }
    }
    return { clockTick, snapshot: driver.snapshot(), title: document.querySelector('#overlay-title')?.textContent };
  }, {
    runs: tape.runs,
    firstClockTick: startClockTick,
    stage: tape.stage,
    ticksPerFrame: TICKS_PER_FRAME,
    keyBits: KEY_BITS,
  });

  expect(driven.snapshot).toMatchObject({
    surface: 'terminal',
    activeStage: tape.stage,
    engineTick: tape.expected.ticks,
    mappingRevealed: false,
  });
  expect(driven.title).toBe(tape.expected.status === 'lost' ? 'OUT OF LIVES' : 'WINDOW CLOSED');
  expect(driven.clockTick - startClockTick).toBe(tape.expected.ticks);
  return driven.clockTick;
}

async function completeStagePulse(page: Page, tape: StageTape, round: 1 | 2): Promise<void> {
  await expect.poll(() => snapshot(page)).toMatchObject({ surface: 'stage-pulse' });
  await page.locator(`input[name="pulse-pressure"][value="${tape.stage}"]`).check();
  await page.locator('input[name="pulse-pacing"][value="balanced"]').check();
  if (tape.expected.status === 'lost') {
    await page.locator('textarea[name="pulse-loss"]')
      .fill(`Round ${round} ended after the real Stage ${tape.stage} engine terminal.`);
  } else {
    await expect(page.locator('textarea[name="pulse-loss"]')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Save stage feedback' }).click();
}

async function playPractice(
  page: Page,
  clockTick: number,
): Promise<number> {
  await driverAdvance(page);
  await expect.poll(() => snapshot(page)).toMatchObject({
    phase: 'practice', surface: 'stage-card', activeStage: 1, engineTick: 0,
  });
  for (const tape of practiceTapes) {
    await beginStage(page);
    clockTick = await driveStageTape(page, tape, clockTick);
    await driverAdvance(page);
  }
  await expect.poll(() => snapshot(page)).toMatchObject({
    phase: 'round1', surface: 'stage-card', activeStage: 4, engineTick: 0,
  });
  return clockTick;
}

async function playRound(
  page: Page,
  candidateId: P108CanonicalLabCandidateId,
  round: 1 | 2,
  clockTick: number,
): Promise<number> {
  for (const tape of candidateTapes[candidateId]) {
    await beginStage(page);
    clockTick = await driveStageTape(page, tape, clockTick);
    await expectMappingHidden(page);
    await driverAdvance(page);
    await completeStagePulse(page, tape, round);
    await expectMappingHidden(page);
  }
  return clockTick;
}

async function finishQuestions(page: Page): Promise<void> {
  await expect.poll(() => snapshot(page)).toMatchObject({ surface: 'round-experience' });
  await expectMappingHidden(page);
  await page.locator('input[name="round-1-jars"][value="planning"]').check();
  await page.locator('input[name="round-1-recovery"][value="6"]').check();
  await page.locator('input[name="round-2-jars"][value="both"]').check();
  await page.locator('input[name="round-2-recovery"][value="3"]').check();
  await page.getByRole('button', { name: 'Continue to final comparison' }).click();
  await expect.poll(() => snapshot(page)).toMatchObject({ surface: 'comparison' });
  await expectMappingHidden(page);
  await page.locator('input[name="clearerRamp"][value="same"]').check();
  await page.locator('input[name="fairer"][value="same"]').check();
  await page.locator('input[name="moreEnjoyable"][value="same"]').check();
  await page.locator('textarea[name="scoreBelief"]')
    .fill('Serving matched orders and catching returning jars generated score.');
  await page.getByRole('button', { name: 'Freeze my answers' }).click();
  await expect.poll(() => snapshot(page)).toMatchObject({
    phase: 'frozen', surface: 'frozen', mappingRevealed: false,
  });
}

async function downloadArtifact(page: Page): Promise<{ raw: string; artifact: P108HumanLabArtifact }> {
  const event = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download synthetic JSON' }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('maltline-exp049-test-driver-synthetic.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  const raw = await readFile(path!, 'utf8');
  return { raw, artifact: normalizeP108HumanLabArtifact(JSON.parse(raw)) };
}

function expectedPulses(tapes: readonly StageTape[], round: 1 | 2): P108HumanLabArtifact['rounds'][number]['stagePulses'] {
  return tapes.map(({ expected }) => ({
    round,
    stage: expected.stage,
    terminalStatus: expected.status,
    perceivedPressure: expected.stage,
    pacing: 'balanced' as const,
    hardestDecision: null,
    lossExplanation: expected.status === 'lost'
      ? `Round ${round} ended after the real Stage ${expected.stage} engine terminal.`
      : null,
  }));
}

function assertArtifact(
  artifact: P108HumanLabArtifact,
  raw: string,
  matrixCase: MatrixCase,
): void {
  expect(artifact).toMatchObject({
    kind: 'maltline-human-lab-test-driver-session',
    schemaVersion: 3,
    experimentId: 'EXP-049',
    experimentRevision: 11,
    policy: {
      rankEligibility: 'unranked',
      authorityRegistration: null,
      seasonId: null,
      submission: 'forbidden',
    },
    executionMode: 'test-driver',
    assignmentOrder: matrixCase.order,
    studyAssignment: {
      experienceStratum: 'first-time',
      assignedViewportCssWidth: matrixCase.width,
    },
    participant: {
      participantCode: 'p-test001',
      experienceStratum: 'first-time',
      assignedViewportCssWidth: matrixCase.width,
    },
    consentEvidence: { kind: 'test-driver-bypass', statementId: null, affirmed: false },
    comparison: {
      clearerRamp: 'same',
      fairer: 'same',
      moreEnjoyable: 'same',
      rounds: [
        { round: 1, jarExperience: 'planning', recoveryPossible: 6 },
        { round: 2, jarExperience: 'both', recoveryPossible: 3 },
      ],
      scoreBelief: 'Serving matched orders and catching returning jars generated score.',
    },
  });
  expect(artifact.provenance.assignmentTokenSha256)
    .toBe(createHash('sha256').update(matrixCase.token).digest('hex'));
  expect(raw).not.toContain(matrixCase.token);
  expect(artifact.provenance.entryEnvironment).toEqual({
    viewportCssWidth: matrixCase.width,
    viewportCssHeight: 720,
    devicePixelRatio: 1,
    reducedMotion: true,
  });
  expect(artifact.provenance.candidates.map(({ candidateId }) => candidateId))
    .toEqual(matrixCase.order);
  expect(artifact.timing.interruptions).toEqual([]);
  expect(artifact.practice.initialRun).toEqual(FRESH_RUN);
  expect(artifact.practice.stages).toEqual(practiceTapes.map(({ expected }) => expected));

  expect(artifact.rounds).toHaveLength(2);
  for (const [index, round] of artifact.rounds.entries()) {
    const roundNumber = (index + 1) as 1 | 2;
    const candidateId = matrixCase.order[index]!;
    const tapes = candidateTapes[candidateId];
    expect(round).toMatchObject({
      round: roundNumber,
      candidateId,
      initialRun: FRESH_RUN,
      candidateExposure: 'full',
    });
    expect(round.stages).toEqual(tapes.map(({ expected }) => expected));
    expect(round.stagePulses).toEqual(expectedPulses(tapes, roundNumber));
  }

  const stages = [artifact.practice.stages, ...artifact.rounds.map(({ stages: roundStages }) => roundStages)].flat();
  expect(stages).toHaveLength(11);
  expect(stages.every(({ observationMode, ticks, inputSamples }) => (
    observationMode === 'engine-observed' && ticks > 0 && inputSamples === ticks
  ))).toBe(true);
  expect(stages.some(({ observationMode }) => observationMode === 'test-driver-synthetic')).toBe(false);
  for (const round of artifact.rounds) {
    for (let index = 1; index < round.stages.length; index++) {
      expect(round.stages[index]!.startingRun).toEqual({
        lives: round.stages[index - 1]!.lives,
        score: round.stages[index - 1]!.score,
      });
    }
  }
}

for (const matrixCase of CASES) {
  test(`runs every real engine stage for ${matrixCase.label}`, async ({ page }) => {
    test.setTimeout(90_000);
    await openLab(page, matrixCase);
    await expectMappingHidden(page);
    let clockTick = await playPractice(page, 0);
    clockTick = await playRound(page, matrixCase.order[0], 1, clockTick);
    await expect.poll(() => snapshot(page)).toMatchObject({ surface: 'intermission' });
    await expectMappingHidden(page);
    await driverAdvance(page);
    await expect.poll(() => snapshot(page)).toMatchObject({
      phase: 'round2', surface: 'stage-card', activeStage: 4, engineTick: 0,
    });
    clockTick = await playRound(page, matrixCase.order[1], 2, clockTick);
    expect(clockTick).toBe(30_331);
    await finishQuestions(page);
    const { raw, artifact } = await downloadArtifact(page);
    assertArtifact(artifact, raw, matrixCase);

    const browserState = await page.evaluate(() => ({
      prohibited: (window as typeof window & { __labProhibitedCalls?: string[] })
        .__labProhibitedCalls?.filter((call) => !call.startsWith('websocket:ws://127.0.0.1:5184/')),
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
    }));
    expect(browserState).toEqual({ prohibited: [], local: 0, session: 0, cookie: '' });
  });
}

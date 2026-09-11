import { MALTLINE_GENERATION_2_AUTHORITY } from '../../src/core/authority';
import { createVerifiedMaltlinePlayback, type VerifiedMaltlinePlayback } from '../../src/core/playback';
import { verifyAndHashMaltlineProof } from '../../src/core/proof';
import { GENERATION_2_LOSS_PROOF } from '../../src/testing/generation-2-proofs';
import type {
  MaltlineCompetitionChallenge,
  MaltlineCompetitionScore,
  MaltlineCompetitionScorePage,
  MaltlineCompetitionRequestOptions,
  MaltlineListScoresOptions,
  MaltlineSubmissionResult,
} from '../../src/viewer/competition-client';
import { MaltlineCompetitionApiError } from '../../src/viewer/competition-client';
import {
  createMaltlineCompetitionController,
  type MaltlineCompetitionController,
  type MaltlineCompetitionService,
} from '../../src/viewer/competition-controller';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const challenges: Deferred<MaltlineCompetitionChallenge>[] = [];
const boards: Deferred<MaltlineCompetitionScorePage>[] = [];
const submissions: Deferred<MaltlineSubmissionResult>[] = [];
const replays: Deferred<VerifiedMaltlinePlayback>[] = [];
const submittedRunIds: string[] = [];

function publishCounts(): void {
  const root = document.documentElement;
  root.dataset.controllerChallengeRequests = String(challenges.length);
  root.dataset.controllerBoardRequests = String(boards.length);
  root.dataset.controllerSubmitRequests = String(submissions.length);
  root.dataset.controllerReplayRequests = String(replays.length);
  root.dataset.controllerSubmittedRunIds = submittedRunIds.join(',');
}

const service: MaltlineCompetitionService = {
  beginRun(_options: MaltlineCompetitionRequestOptions = {}) {
    const operation = deferred<MaltlineCompetitionChallenge>();
    challenges.push(operation);
    publishCounts();
    return operation.promise;
  },
  listScores(_options: MaltlineListScoresOptions = {}) {
    const operation = deferred<MaltlineCompetitionScorePage>();
    boards.push(operation);
    publishCounts();
    return operation.promise;
  },
  loadReplay() {
    const operation = deferred<VerifiedMaltlinePlayback>();
    replays.push(operation);
    publishCounts();
    return operation.promise;
  },
  submitScore(runId) {
    submittedRunIds.push(runId);
    const operation = deferred<MaltlineSubmissionResult>();
    submissions.push(operation);
    publishCounts();
    return operation.promise;
  },
};

function challenge(label: string): MaltlineCompetitionChallenge {
  return {
    id: `run_${label.repeat(16).slice(0, 16)}`,
    nonce: label.codePointAt(0) ?? 0,
    seasonId: 'maltline-generation-2',
    boardId: 'arcade',
    gameVersion: '0.1.0',
    authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
    proofSchemaVersion: 1,
    envelopeVersion: 3,
    expiresAt: '2099-09-10T20:30:00.000Z',
  };
}

function score(label: string, value = 100): MaltlineCompetitionScore {
  return {
    id: `score_${label.repeat(16).slice(0, 16)}`,
    name: label,
    score: value,
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
    createdAt: '2026-09-10T18:00:00.000Z',
    proofAvailable: true,
  };
}

const shell = document.querySelector<HTMLElement>('#controller-shell')!;
const trigger = document.querySelector<HTMLButtonElement>('#controller-trigger')!;
const controller = createMaltlineCompetitionController({
  enabled: true,
  client: service,
  shellRoot: shell,
  trigger,
});
controller.setScreen('gameover');

const harness = {
  controller,
  startAttempt(): void {
    controller.startAttempt();
  },
  terminalize(scoreValue = 100): void {
    const stageId = MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!.id;
    controller.beginStage(stageId);
    controller.recordTickInput({ stationDir: 0, laneDir: 0, blend: false, serve: false });
    controller.completeStage({
      scenarioId: stageId,
      status: 'lost',
      tick: 1,
      score: scoreValue,
    }, true);
  },
  openPanel(): void {
    controller.openPanel();
  },
  resolveChallenge(index: number, label: string): void {
    challenges[index]!.resolve(challenge(label));
  },
  rejectChallenge(index: number): void {
    challenges[index]!.reject(new Error('stale challenge failure'));
  },
  resolveBoard(index: number, label: string, value = 100): void {
    boards[index]!.resolve({ entries: [score(label, value)] });
  },
  resolveMismatchedBoard(index: number, label: string): void {
    boards[index]!.resolve({
      entries: [{ ...score(label, 0), totalTicks: 1_853 }],
    });
  },
  resolveTenRowBoard(index: number): void {
    boards[index]!.resolve({
      entries: Array.from({ length: 10 }, (_unused, entryIndex) => ({
        ...score(String.fromCharCode(65 + entryIndex), 0),
        name: `SHIFT ${entryIndex + 1}`,
      })),
    });
  },
  rejectBoard(index: number): void {
    boards[index]!.reject(new Error('stale board failure'));
  },
  async resolveReplay(index: number, label: string): Promise<void> {
    const prepared = challenge(label);
    const retained = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
      runId: prepared.id,
      seasonId: prepared.seasonId,
      boardId: prepared.boardId,
      nonce: prepared.nonce,
      authority: prepared.authority,
    });
    replays[index]!.resolve(await createVerifiedMaltlinePlayback(retained.envelope));
  },
  rejectReplay(index: number): void {
    replays[index]!.reject(new Error('retained replay failure'));
  },
  rejectReplayUnavailable(index: number): void {
    replays[index]!.reject(new MaltlineCompetitionApiError(410, 'Proof expired.'));
  },
  resolveSubmit(index: number, label: string, value = 100): void {
    submissions[index]!.resolve({
      status: 201,
      proofState: 'ready',
      entry: score(label, value),
    });
  },
  rejectSubmit(index: number): void {
    submissions[index]!.reject(new Error('stale submit failure'));
  },
};

declare global {
  interface Window {
    __maltlineCompetitionControllerHarness?: typeof harness;
  }
}

window.__maltlineCompetitionControllerHarness = harness;
publishCounts();
document.documentElement.dataset.controllerFixtureReady = 'true';

export type { MaltlineCompetitionController };

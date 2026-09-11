import type { MaltlineRunProof } from '../core/proof';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../core/authority';
import type { MaltlineInput, MaltlineState } from '../core/types';
import {
  MaltlineCompetitionApiError,
  MaltlineCompetitionClient,
  type MaltlineCompetitionChallenge,
  type MaltlineCompetitionScore,
} from './competition-client';
import {
  mountMaltlineCompetitionPanel,
  type MaltlineCompetitionEntry,
  type MaltlineCompetitionPanelState,
  type MaltlineCompetitionInspection,
  type MaltlineCompetitionStandings,
  type MaltlineCompetitionSubmission,
} from './competition-panel';
import {
  MaltlineRankedProofRecorder,
  type ImmutableMaltlineRunProof,
} from './ranked-proof-recorder';
import type { MaltlineFlowScreen } from './gameplay-flow';

const SAFE_BOARD_SCREENS = new Set<MaltlineFlowScreen>([
  'title',
  'instructions',
  'stage-card',
  'cleared',
  'interrupted',
  'gameover',
  'victory',
]);

const BOARD_LIMIT = 10;

export interface MaltlineCompetitionControllerOptions {
  enabled: boolean;
  client: MaltlineCompetitionService;
  shellRoot: HTMLElement;
  trigger: HTMLButtonElement;
  panelHost?: HTMLElement | Document;
  now?: () => number;
  onDiscardAttempt?: () => void;
  onStatusChange?: () => void;
}

export interface MaltlineCompetitionService {
  beginRun: MaltlineCompetitionClient['beginRun'];
  listScores: MaltlineCompetitionClient['listScores'];
  loadReplay: MaltlineCompetitionClient['loadReplay'];
  submitScore: MaltlineCompetitionClient['submitScore'];
}

export interface MaltlineCompetitionControllerStatus {
  enabled: boolean;
  challenge: 'idle' | 'preparing' | 'ready' | 'unavailable';
  proof: 'none' | 'recording' | 'eligible' | 'ineligible' | 'submitted';
  panelOpen: boolean;
}

export interface MaltlineCompetitionController {
  startAttempt(): void;
  beginStage(stageId: string): void;
  recordTickInput(input: MaltlineInput): void;
  completeStage(state: Pick<MaltlineState, 'scenarioId' | 'status' | 'tick' | 'score'>, attemptTerminal: boolean): void;
  invalidate(reason: string): void;
  setScreen(screen: MaltlineFlowScreen): void;
  openPanel(): void;
  protectsTerminalResult(): boolean;
  snapshot(): Readonly<MaltlineCompetitionControllerStatus>;
  destroy(): void;
}

interface LocationLike {
  hostname: string;
  search: string;
}

/** Production uses same-origin services; localhost must opt in explicitly for mocked development. */
export function maltlineCompetitionServicesEnabled(
  locationLike: LocationLike,
  development: boolean,
): boolean {
  const hostname = locationLike.hostname.toLowerCase();
  const local = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1'
    || hostname === '::1';
  if (!local) return true;
  return development
    && new URLSearchParams(locationLike.search).get('ranked') === 'preview';
}

function mutableProof(proof: ImmutableMaltlineRunProof): MaltlineRunProof {
  return {
    version: proof.version,
    rulesetVersion: proof.rulesetVersion,
    campaignGeneration: proof.campaignGeneration,
    stages: proof.stages.map((stage) => ({
      stageId: stage.stageId,
      inputRuns: stage.inputRuns.map((run) => ({ ...run })),
    })),
  };
}

function boardEntries(
  entries: readonly MaltlineCompetitionScore[],
  currentEntryId?: string,
): Extract<MaltlineCompetitionStandings, { kind: 'ranked' }>['entries'] {
  return entries.map((entry, index) => ({
    id: entry.id,
    rank: index + 1,
    callsign: entry.name,
    score: entry.score,
    lives: entry.lives,
    stageReached: entry.stageReached,
    stagesCleared: entry.stagesCleared,
    completed: entry.completed,
    totalTicks: entry.totalTicks,
    fulfilled: entry.fulfilled,
    serviceActions: entry.serviceActions,
    walkouts: entry.walkouts,
    resolved: entry.resolved,
    exited: entry.exited,
    proofAvailable: entry.proofAvailable,
    isCurrentPlayer: entry.id === currentEntryId,
  }));
}

function friendlyServiceError(action: 'board' | 'submit'): string {
  return action === 'board'
    ? 'The line judge did not answer. Try the board again.'
    : 'The line judge did not confirm the run. Your proof is still available for another try.';
}

export function classifyMaltlineSubmissionFailure(
  error: unknown,
  score: number,
  callsign: string,
): Readonly<{ proofIneligible: boolean; submission: MaltlineCompetitionSubmission }> {
  if (error instanceof MaltlineCompetitionApiError
    && error.status === 400
    && error.code === 'maltline_callsign_rejected') {
    return Object.freeze({
      proofIneligible: false,
      submission: {
        kind: 'eligible' as const,
        score,
        initialCallsign: callsign,
        errorMessage: 'That callsign was not accepted. Edit it and try again.',
      },
    });
  }
  if (error instanceof MaltlineCompetitionApiError
    && error.status >= 400
    && error.status < 500
    && error.status !== 429) {
    return Object.freeze({
      proofIneligible: true,
      submission: {
        kind: 'ineligible' as const,
        score,
        reason: 'The ranked run can no longer be accepted. Start a fresh run.',
      },
    });
  }
  return Object.freeze({
    proofIneligible: false,
    submission: {
      kind: 'error' as const,
      score,
      callsign,
      message: friendlyServiceError('submit'),
    },
  });
}

export function createMaltlineCompetitionController(
  options: MaltlineCompetitionControllerOptions,
): MaltlineCompetitionController {
  const now = options.now ?? (() => Date.now());
  let screen: MaltlineFlowScreen = 'title';
  let open = false;
  let destroyed = false;
  let attemptGeneration = 0;
  let boardGeneration = 0;
  let challengeStatus: MaltlineCompetitionControllerStatus['challenge'] = 'idle';
  let proofStatus: MaltlineCompetitionControllerStatus['proof'] = 'none';
  let challenge: MaltlineCompetitionChallenge | undefined;
  let challengeFailure: string | undefined;
  let recorder: MaltlineRankedProofRecorder | undefined;
  let terminalProof: ImmutableMaltlineRunProof | undefined;
  let terminalScore: number | undefined;
  let invalidationReason: string | undefined;
  let standings: MaltlineCompetitionStandings = { kind: 'loading' };
  let submission: MaltlineCompetitionSubmission = { kind: 'none' };
  let inspection: MaltlineCompetitionInspection = { kind: 'none' };
  let challengeAbort: AbortController | undefined;
  let boardAbort: AbortController | undefined;
  let submitAbort: AbortController | undefined;
  let inspectionAbort: AbortController | undefined;
  let inspectionGeneration = 0;
  let submissionAttempted = false;

  const panel = mountMaltlineCompetitionPanel(options.panelHost ?? document, {
    onClose: () => closePanel(),
    onRefresh: () => void loadStandings(),
    onSubmit: (callsign) => void submit(callsign),
    onCallsignChange: (callsign) => {
      if (submission.kind === 'eligible') {
        submission = { ...submission, initialCallsign: callsign };
      }
    },
    onDiscard: () => options.onDiscardAttempt?.(),
    onInspect: (entry) => void inspectProof(entry),
    onDismissInspection: () => {
      inspectionAbort?.abort();
      inspectionGeneration += 1;
      inspection = { kind: 'none' };
      render();
    },
  });

  const publishDataset = (notify = true): void => {
    const root = options.shellRoot.ownerDocument.documentElement;
    root.dataset.maltlineCompetitionEnabled = String(options.enabled);
    root.dataset.maltlineCompetitionChallenge = challengeStatus;
    root.dataset.maltlineCompetitionProof = proofStatus;
    root.dataset.maltlineCompetitionPanelOpen = String(open);
    if (notify) options.onStatusChange?.();
  };

  const render = (): void => {
    if (destroyed) return;
    const state: MaltlineCompetitionPanelState = open
      ? { view: 'open', standings, submission, inspection }
      : { view: 'closed' };
    panel.render(state);
    publishDataset();
  };

  const updateTrigger = (): void => {
    const safe = SAFE_BOARD_SCREENS.has(screen);
    const practiceOnly = challengeStatus === 'unavailable' && proofStatus === 'ineligible';
    options.trigger.hidden = !options.enabled || open || (!safe && !practiceOnly);
    options.trigger.disabled = !safe;
    options.trigger.textContent = practiceOnly ? 'PRACTICE RUN' : 'SHIFT BOARD';
    options.trigger.setAttribute('aria-expanded', String(open));
    options.trigger.setAttribute(
      'aria-label',
      practiceOnly
        ? 'Ranking unavailable; this is a practice run'
        : 'Open Shift Board leaderboard',
    );
  };

  const terminalSubmission = (): MaltlineCompetitionSubmission => {
    const score = terminalScore ?? 0;
    if (invalidationReason) {
      return { kind: 'ineligible', score, reason: invalidationReason };
    }
    if (challengeStatus === 'unavailable') {
      proofStatus = 'ineligible';
      return {
        kind: 'ineligible',
        score,
        reason: challengeFailure ?? 'A ranked run was not prepared before play began.',
      };
    }
    if (challengeStatus !== 'ready' || !challenge || !terminalProof) {
      return { kind: 'none' };
    }
    if (Date.parse(challenge.expiresAt) <= now()) {
      proofStatus = 'ineligible';
      return {
        kind: 'ineligible',
        score,
        reason: 'The ranked-run window expired before the shift ended.',
      };
    }
    proofStatus = 'eligible';
    return { kind: 'eligible', score };
  };

  const refreshTerminalSubmission = (): void => {
    if (terminalScore === undefined) return;
    submission = terminalSubmission();
    render();
  };

  const closePanel = (): void => {
    if (!open) return;
    inspectionAbort?.abort();
    inspectionGeneration += 1;
    inspection = { kind: 'none' };
    open = false;
    options.shellRoot.inert = false;
    options.shellRoot.removeAttribute('aria-hidden');
    updateTrigger();
    render();
  };

  const loadStandings = async (
    currentEntryId?: string,
    loadingAlreadyRendered = false,
  ): Promise<void> => {
    if (!options.enabled || destroyed) return;
    boardAbort?.abort();
    const controller = new AbortController();
    boardAbort = controller;
    const generation = ++boardGeneration;
    if (!loadingAlreadyRendered) {
      standings = { kind: 'loading' };
      render();
    }
    try {
      const page = await options.client.listScores({ limit: BOARD_LIMIT, signal: controller.signal });
      if (destroyed || generation !== boardGeneration) return;
      const entries = boardEntries(page.entries, currentEntryId);
      standings = entries.length === 0 ? { kind: 'empty' } : { kind: 'ranked', entries };
      if (submission.kind === 'accepted' && currentEntryId) {
        const rank = page.entries.findIndex((entry) => entry.id === currentEntryId);
        submission = {
          ...submission,
          ...(rank >= 0 ? { rank: rank + 1 } : {}),
        };
      }
    } catch (error) {
      if (controller.signal.aborted || destroyed || generation !== boardGeneration) return;
      standings = { kind: 'error', message: friendlyServiceError('board') };
    }
    render();
  };

  const openPanel = (): void => {
    if (!options.enabled || open || !SAFE_BOARD_SCREENS.has(screen)) return;
    standings = { kind: 'loading' };
    open = true;
    render();
    options.shellRoot.inert = true;
    options.shellRoot.setAttribute('aria-hidden', 'true');
    updateTrigger();
    void loadStandings(undefined, true);
  };

  async function inspectProof(entry: MaltlineCompetitionEntry): Promise<void> {
    if (!options.enabled || destroyed || !open || !entry.proofAvailable) return;
    inspectionAbort?.abort();
    const controller = new AbortController();
    inspectionAbort = controller;
    const generation = ++inspectionGeneration;
    inspection = { kind: 'loading', entry };
    render();
    try {
      const playback = await options.client.loadReplay(entry.id, { signal: controller.signal });
      if (destroyed || controller.signal.aborted || generation !== inspectionGeneration) return;
      const verified = playback.verification;
      const summary = verified.envelope.summary;
      if (summary.score !== entry.score
        || summary.lives !== entry.lives
        || summary.stageReached !== entry.stageReached
        || summary.stagesCleared !== entry.stagesCleared
        || summary.completed !== entry.completed
        || summary.totalTicks !== entry.totalTicks
        || summary.fulfilled !== entry.fulfilled
        || summary.serviceActions !== entry.serviceActions
        || summary.walkouts !== entry.walkouts
        || summary.resolved !== entry.resolved
        || summary.exited !== entry.exited) {
        throw new Error('Retained proof outcome does not match the leaderboard entry.');
      }
      inspection = {
        kind: 'verified',
        entry,
        sha256: verified.sha256,
        score: summary.score,
        lives: summary.lives,
        stagesCleared: summary.stagesCleared,
        completed: summary.completed,
        totalTicks: summary.totalTicks,
        playback,
        stages: verified.envelope.proof.stages.map((stage) => ({
          name: MALTLINE_GENERATION_2_AUTHORITY.campaign
            .find((scenario) => scenario.id === stage.stageId)?.name ?? stage.stageId,
          ticks: stage.inputRuns.reduce((total, run) => total + run.ticks, 0),
        })),
      };
    } catch (error) {
      if (destroyed || controller.signal.aborted || generation !== inspectionGeneration) return;
      const unavailable = error instanceof MaltlineCompetitionApiError
        && (error.status === 404 || error.status === 410);
      if (unavailable && standings.kind === 'ranked') {
        standings = {
          kind: 'ranked',
          entries: standings.entries.map((candidate) => candidate.id === entry.id
            ? { ...candidate, proofAvailable: false }
            : candidate),
        };
      }
      inspection = unavailable ? {
          kind: 'unavailable',
          entry: { ...entry, proofAvailable: false },
          message: 'Its five-day proof window has ended. The verified score remains on the board.',
        }
        : {
          kind: 'error',
          entry,
          message: 'The retained proof could not be replayed. Try again while it is available.',
        };
    }
    render();
  }

  const submit = async (callsign: string): Promise<void> => {
    const trimmedCallsign = callsign.trim();
    if (!challenge
      || !terminalProof
      || terminalScore === undefined
      || invalidationReason
      || proofStatus === 'ineligible'
      || proofStatus === 'submitted'
      || destroyed) return;
    if (!submissionAttempted && Date.parse(challenge.expiresAt) <= now()) {
      proofStatus = 'ineligible';
      submission = terminalSubmission();
      render();
      return;
    }
    submitAbort?.abort();
    const controller = new AbortController();
    submitAbort = controller;
    const generation = attemptGeneration;
    submissionAttempted = true;
    submission = { kind: 'submitting', score: terminalScore, callsign: trimmedCallsign };
    render();
    try {
      const result = await options.client.submitScore(
        challenge.id,
        trimmedCallsign,
        mutableProof(terminalProof),
        { signal: controller.signal },
      );
      if (destroyed || controller.signal.aborted || generation !== attemptGeneration) return;
      if (result.proofState === 'pending') {
        submission = {
          kind: 'pending',
          score: result.entry.score,
          callsign: result.entry.name,
        };
      } else {
        proofStatus = 'submitted';
        submission = {
          kind: 'accepted',
          score: result.entry.score,
          callsign: result.entry.name,
        };
        void loadStandings(result.entry.id);
      }
    } catch (error) {
      if (destroyed || controller.signal.aborted || generation !== attemptGeneration) return;
      const failure = classifyMaltlineSubmissionFailure(error, terminalScore, trimmedCallsign);
      if (failure.proofIneligible) proofStatus = 'ineligible';
      submission = failure.submission;
    }
    render();
  };

  panel.root.id = 'maltline-competition-panel';
  options.trigger.setAttribute('aria-controls', panel.root.id);
  options.trigger.setAttribute('aria-haspopup', 'dialog');
  options.trigger.addEventListener('click', openPanel);
  updateTrigger();
  publishDataset(false);

  return {
    startAttempt() {
      challengeAbort?.abort();
      boardAbort?.abort();
      submitAbort?.abort();
      inspectionAbort?.abort();
      closePanel();
      attemptGeneration += 1;
      challenge = undefined;
      challengeFailure = undefined;
      terminalProof = undefined;
      terminalScore = undefined;
      invalidationReason = undefined;
      submissionAttempted = false;
      boardGeneration += 1;
      inspectionGeneration += 1;
      submission = { kind: 'none' };
      inspection = { kind: 'none' };
      proofStatus = options.enabled ? 'recording' : 'none';
      recorder = options.enabled ? new MaltlineRankedProofRecorder() : undefined;
      if (!options.enabled) {
        challengeStatus = 'idle';
        updateTrigger();
        publishDataset();
        return;
      }
      challengeStatus = 'preparing';
      updateTrigger();
      publishDataset();
      const controller = new AbortController();
      challengeAbort = controller;
      const generation = attemptGeneration;
      void options.client.beginRun({ signal: controller.signal }).then((prepared) => {
        if (destroyed || controller.signal.aborted || generation !== attemptGeneration) return;
        challenge = prepared;
        challengeStatus = 'ready';
        updateTrigger();
        refreshTerminalSubmission();
        publishDataset();
      }).catch(() => {
        if (destroyed || controller.signal.aborted || generation !== attemptGeneration) return;
        challengeStatus = 'unavailable';
        challengeFailure = 'The ranked line could not be prepared for this run.';
        proofStatus = 'ineligible';
        invalidationReason = challengeFailure;
        recorder?.invalidateRankEligibility(challengeFailure);
        updateTrigger();
        refreshTerminalSubmission();
        publishDataset();
      });
    },
    beginStage(stageId) {
      if (!invalidationReason) recorder?.beginStage(stageId);
    },
    recordTickInput(input) {
      if (!invalidationReason) recorder?.recordTickInput(input);
    },
    completeStage(state, attemptTerminal) {
      if (recorder && !invalidationReason) recorder.completeStage(state);
      if (!attemptTerminal) return;
      terminalScore = state.score;
      if (recorder && !invalidationReason) {
        const result = recorder.finalizeProof();
        if (result.status === 'available') terminalProof = result.proof;
      }
      submission = terminalSubmission();
      render();
    },
    invalidate(reason) {
      if (!options.enabled || invalidationReason) return;
      invalidationReason = reason;
      proofStatus = 'ineligible';
      recorder?.invalidateRankEligibility(reason);
      terminalProof = undefined;
      challengeAbort?.abort();
      challengeStatus = challenge ? 'ready' : 'unavailable';
      refreshTerminalSubmission();
      publishDataset();
    },
    setScreen(nextScreen) {
      screen = nextScreen;
      if (open && !SAFE_BOARD_SCREENS.has(screen)) closePanel();
      updateTrigger();
    },
    openPanel,
    protectsTerminalResult() {
      return terminalScore !== undefined
        && proofStatus !== 'none'
        && proofStatus !== 'ineligible'
        && proofStatus !== 'submitted';
    },
    snapshot() {
      return Object.freeze({
        enabled: options.enabled,
        challenge: challengeStatus,
        proof: proofStatus,
        panelOpen: open,
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      challengeAbort?.abort();
      boardAbort?.abort();
      submitAbort?.abort();
      inspectionAbort?.abort();
      options.trigger.removeEventListener('click', openPanel);
      options.shellRoot.inert = false;
      options.shellRoot.removeAttribute('aria-hidden');
      panel.destroy();
    },
  };
}

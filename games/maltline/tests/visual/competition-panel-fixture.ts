import {
  mountMaltlineCompetitionPanel,
  type MaltlineCompetitionPanel,
  type MaltlineCompetitionPanelState,
} from '../../src/viewer/competition-panel';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../../src/core/authority';
import { createVerifiedMaltlinePlayback } from '../../src/core/playback';
import { verifyAndHashMaltlineProof } from '../../src/core/proof';
import {
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
} from '../../src/testing/generation-2-proofs';
import { prepareMaltlineFonts } from '../../src/viewer/fonts';

type FixtureState =
  | 'closed'
  | 'loading'
  | 'empty'
  | 'error'
  | 'ranked'
  | 'eligible'
  | 'submitting'
  | 'pending'
  | 'submission-error'
  | 'accepted'
  | 'ineligible'
  | 'proof-unavailable'
  | 'inspected'
  | 'inspected-other-entry'
  | 'inspected-other-proof';

declare global {
  interface Window {
    __maltlineCompetitionPanel?: MaltlineCompetitionPanel;
    __maltlineCompetitionSetState?: (state: FixtureState) => void;
  }
}

const proofFacts = {
  lives: 2,
  stageReached: 8,
  completed: false,
  totalTicks: 18_540,
  fulfilled: 92,
  serviceActions: 92,
  walkouts: 3,
  resolved: 95,
  exited: 92,
  proofAvailable: true,
} as const;

const rankedStandings = {
  kind: 'ranked' as const,
  entries: [
    { ...proofFacts, id: 'score_AAAAAAAAAAAAAAAA', rank: 1, callsign: 'CREAM TOP', score: 18_450, stagesCleared: 8 },
    { ...proofFacts, id: 'score_BBBBBBBBBBBBBBBB', rank: 2, callsign: 'NIGHT <img src=x onerror=alert(1)>', score: 17_980, stagesCleared: 8 },
    { ...proofFacts, id: 'score_CCCCCCCCCCCCCCCC', rank: 3, callsign: 'MALT-7', score: 15_200, stagesCleared: 7, isCurrentPlayer: true },
    { ...proofFacts, proofAvailable: false, id: 'score_DDDDDDDDDDDDDDDD', rank: 4, callsign: 'JAR HAND', score: 12_850, stagesCleared: 6 },
  ],
};

const retainedWin = await verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, {
  runId: 'run_visual_scrub_001',
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  nonce: 0x5152_5354,
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
});
const inspectedPlayback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
const retainedMistake = await verifyAndHashMaltlineProof(GENERATION_2_MISTAKE_PROOF, {
  runId: 'run_visual_scrub_002',
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  nonce: 0x6162_6364,
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
});
const inspectedMistakePlayback = await createVerifiedMaltlinePlayback(retainedMistake.envelope);

function fixtureState(kind: FixtureState): MaltlineCompetitionPanelState {
  switch (kind) {
    case 'closed':
      return { view: 'closed' };
    case 'loading':
      return { view: 'open', standings: { kind: 'loading' }, submission: { kind: 'none' } };
    case 'empty':
      return { view: 'open', standings: { kind: 'empty' }, submission: { kind: 'none' } };
    case 'error':
      return {
        view: 'open',
        standings: { kind: 'error', message: 'The line judge did not answer.' },
        submission: { kind: 'none' },
      };
    case 'ranked':
      return { view: 'open', standings: rankedStandings, submission: { kind: 'none' } };
    case 'eligible':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: { kind: 'eligible', score: 15_200, initialCallsign: 'MALT-7' },
      };
    case 'submitting':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: { kind: 'submitting', score: 15_200, callsign: 'MALT-7' },
      };
    case 'pending':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: { kind: 'pending', score: 15_200, callsign: 'MALT-7' },
      };
    case 'submission-error':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: {
          kind: 'error',
          score: 15_200,
          callsign: 'MALT-7',
          message: 'The line judge did not confirm the run.',
        },
      };
    case 'accepted':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: { kind: 'accepted', score: 15_200, callsign: 'MALT-7', rank: 3 },
      };
    case 'ineligible':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: {
          kind: 'ineligible',
          score: 15_200,
          reason: 'Live timing was interrupted during this run.',
        },
      };
    case 'inspected':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: { kind: 'none' },
        inspection: {
          kind: 'verified',
          entry: {
            ...rankedStandings.entries[2]!,
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
          },
          sha256: retainedWin.sha256,
          score: 36_255,
          lives: 4,
          stagesCleared: 8,
          completed: true,
          totalTicks: 21_662,
          playback: inspectedPlayback,
          stages: [
            { name: 'First Pour', ticks: 1_558 },
            { name: 'Two-Tap', ticks: 1_621 },
            { name: 'Three Windows', ticks: 1_881 },
            { name: 'Lunch Rush', ticks: 3_120 },
            { name: 'Jar Shortage', ticks: 3_766 },
            { name: 'Thick Shakes', ticks: 3_103 },
            { name: 'Happy Hour', ticks: 3_312 },
            { name: 'Closing Time', ticks: 3_301 },
          ],
        },
      };
    case 'inspected-other-entry': {
      const state = fixtureState('inspected');
      if (state.view !== 'open' || state.inspection?.kind !== 'verified') {
        throw new Error('Expected inspected fixture state');
      }
      return {
        ...state,
        inspection: {
          ...state.inspection,
          entry: {
            ...state.inspection.entry,
            id: 'score_EEEEEEEEEEEEEEEE',
            callsign: 'SECOND SHIFT',
          },
        },
      };
    }
    case 'inspected-other-proof': {
      const state = fixtureState('inspected');
      if (state.view !== 'open' || state.inspection?.kind !== 'verified') {
        throw new Error('Expected inspected fixture state');
      }
      const summary = inspectedMistakePlayback.verification.envelope.summary;
      return {
        ...state,
        inspection: {
          ...state.inspection,
          entry: {
            ...state.inspection.entry,
            score: summary.score,
            lives: summary.lives,
            stageReached: summary.stageReached,
            stagesCleared: summary.stagesCleared,
            completed: summary.completed,
            totalTicks: summary.totalTicks,
            fulfilled: summary.fulfilled,
            serviceActions: summary.serviceActions,
            walkouts: summary.walkouts,
            resolved: summary.resolved,
            exited: summary.exited,
          },
          // Deliberately retain the display-only fingerprint so the lifecycle
          // test proves identity comes from the verified playback envelope.
          sha256: retainedWin.sha256,
          score: summary.score,
          lives: summary.lives,
          stagesCleared: summary.stagesCleared,
          completed: summary.completed,
          totalTicks: summary.totalTicks,
          playback: inspectedMistakePlayback,
        },
      };
    }
    case 'proof-unavailable':
      return {
        view: 'open',
        standings: rankedStandings,
        submission: { kind: 'none' },
        inspection: {
          kind: 'unavailable',
          entry: rankedStandings.entries[2]!,
          message: 'Its five-day proof window has ended. The verified score remains on the board.',
        },
      };
  }
}

await prepareMaltlineFonts();
const opener = document.querySelector<HTMLButtonElement>('#competition-opener')!;
const host = document.querySelector<HTMLElement>('#competition-host')!;
const shell = document.querySelector<HTMLElement>('.shell')!;
let outerKeyCount = 0;
document.documentElement.dataset.competitionOuterKeyCount = '0';
shell.addEventListener('keydown', () => {
  outerKeyCount++;
  document.documentElement.dataset.competitionOuterKeyCount = String(outerKeyCount);
});
opener.focus();
let closeCount = 0;
let refreshCount = 0;
let discardCount = 0;
let panel: MaltlineCompetitionPanel;
let setState: (state: FixtureState) => void;
panel = mountMaltlineCompetitionPanel(host, {
  onClose() {
    closeCount++;
    document.documentElement.dataset.competitionCloseCount = String(closeCount);
    panel.render({ view: 'closed' });
  },
  onRefresh() {
    refreshCount++;
    document.documentElement.dataset.competitionRefreshCount = String(refreshCount);
  },
  onSubmit(callsign) {
    document.documentElement.dataset.competitionSubmittedCallsign = callsign;
  },
  onDiscard() {
    discardCount++;
    document.documentElement.dataset.competitionDiscardCount = String(discardCount);
  },
  onInspect(entry) {
    document.documentElement.dataset.competitionInspectedScore = entry.id;
  },
  onDismissInspection() {
    setState('ranked');
  },
});

setState = (state: FixtureState): void => {
  document.documentElement.dataset.competitionFixtureState = state;
  const nextState = fixtureState(state);
  const playbackDigest = nextState.view === 'open' && nextState.inspection?.kind === 'verified'
    ? nextState.inspection.playback.verification.sha256
    : undefined;
  if (playbackDigest) {
    document.documentElement.dataset.competitionPlaybackDigest = playbackDigest;
  } else {
    delete document.documentElement.dataset.competitionPlaybackDigest;
  }
  panel.render(nextState);
};
opener.addEventListener('click', () => setState('ranked'));
window.__maltlineCompetitionPanel = panel;
window.__maltlineCompetitionSetState = setState;

const requestedState = new URLSearchParams(window.location.search).get('state') as FixtureState | null;
setState(requestedState ?? 'ranked');
document.documentElement.dataset.competitionFixtureReady = 'true';

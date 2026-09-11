import { MALTLINE_GENERATION_2_AUTHORITY } from '../core/authority';
import { MaltlineEngine } from '../core/engine';
import { replayMaltline } from '../core/replay';
import type {
  LifeLossReason,
  MaltlineInput,
  MaltlineReplay,
  MaltlineState,
  RunContext,
} from '../core/types';
import { FixedStepClock } from './fixed-step-clock';
import { prepareMaltlineFonts } from './fonts';
import { MaltlineCompetitionClient } from './competition-client';
import {
  createMaltlineCompetitionController,
  maltlineCompetitionServicesEnabled,
  type MaltlineCompetitionControllerStatus,
} from './competition-controller';
import {
  countdownPresentation,
  gameOverPresentation,
  instructionPresentation,
  MALTLINE_COUNTDOWN_SERVE_MS,
  MALTLINE_COUNTDOWN_STEP_MS,
  type MaltlineFlowScreen,
  stageCardPresentation,
  stageClearPresentation,
  terminalLifeLossReason,
  titlePresentation,
  victoryPresentation,
} from './gameplay-flow';
import { MaltlineRenderer } from './renderer';
import { MaltlineEventAnnouncer, semanticPlayStatus } from './semantic-status';
import { mountMaltlineShell, type OverlayPresentation } from './shell';
import {
  isEditableOrInteractiveTarget,
  isRepeatedPresentationAction,
  MaltlineRunEligibility,
  type MaltlineRunEligibilitySnapshot,
} from './viewer-session';
import { MaltlineViewerInputAdapter } from './viewer-input-adapter';
import {
  MaltlineViewerFlowController,
  type MaltlineViewerFlowEffect,
  type MaltlineViewerFlowTransition,
} from './viewer-flow-controller';
import {
  bindMaltlineMotionPreference,
  browserMaltlineMotionPreference,
} from './viewer-motion-preference';

const MALTLINE_CAMPAIGN = MALTLINE_GENERATION_2_AUTHORITY.campaign;

const shell = mountMaltlineShell();
const fontPreparation = await prepareMaltlineFonts();
const { canvas } = shell;
const ctx = canvas.getContext('2d')!;
const motionPreference = browserMaltlineMotionPreference(window);
const renderer = new MaltlineRenderer({ reducedMotion: motionPreference.current() });
bindMaltlineMotionPreference(renderer, motionPreference, window);
const eventAnnouncer = new MaltlineEventAnnouncer(shell.liveEvents);
const runEligibility = new MaltlineRunEligibility();
const competition = createMaltlineCompetitionController({
  enabled: maltlineCompetitionServicesEnabled(window.location, import.meta.env.DEV),
  client: new MaltlineCompetitionClient(window.fetch.bind(window)),
  shellRoot: shell.root,
  trigger: shell.competitionButton,
  onDiscardAttempt: () => startFreshRun(),
  onStatusChange: () => publishViewerStatus(),
});

let engine = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!);
let stageInputs: MaltlineInput[] = [];
let stageRunStart: RunContext = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
let carriedRun: RunContext = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
const stageReplays: MaltlineReplay[] = [];
const MAXIMUM_CATCH_UP_TICKS = 6;
const simulationClock = new FixedStepClock(
  MALTLINE_CAMPAIGN[0]!.ticksPerSecond,
  MAXIMUM_CATCH_UP_TICKS,
);
const inputAdapter = new MaltlineViewerInputAdapter(MALTLINE_CAMPAIGN[0]!);
// Deterministic replays of finished stages, handy while tuning gameplay and
// the seed for the future benchmark plugin.
declare global {
  interface MaltlineViewerStatus extends MaltlineRunEligibilitySnapshot {
    screen: MaltlineFlowScreen;
    supportedDevice: boolean;
    engineTick: number;
    playerLane: number;
    playerStation: number;
    recordedInputs: number;
    competition: Readonly<MaltlineCompetitionControllerStatus>;
  }

  interface Window {
    __maltlineReplays?: MaltlineReplay[];
    __maltlineViewerStatus?: MaltlineViewerStatus;
  }
}
window.__maltlineReplays = stageReplays;
let lastSemanticStatus = '';
let windowFocused = document.hasFocus();
const flow = new MaltlineViewerFlowController({
  stageCount: MALTLINE_CAMPAIGN.length,
  countdownStepMs: MALTLINE_COUNTDOWN_STEP_MS,
  countdownServeMs: MALTLINE_COUNTDOWN_SERVE_MS,
  scheduler: {
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancel: (handle) => window.clearTimeout(handle as number),
  },
  isPlayable: () => !document.hidden && windowFocused && shell.isSupportedDevice(),
  onTransition: (transition) => applyFlowTransition(transition),
});

function publishViewerStatus(state: MaltlineState = engine.snapshot()): void {
  const { screen } = flow.snapshot();
  competition.setScreen(screen);
  const timingEligibility = runEligibility.snapshot();
  const competitionStatus = competition.snapshot();
  window.__maltlineViewerStatus = Object.freeze({
    screen,
    supportedDevice: shell.isSupportedDevice(),
    engineTick: state.tick,
    playerLane: state.player.lane,
    playerStation: state.player.station,
    recordedInputs: stageInputs.length,
    competition: competitionStatus,
    ...timingEligibility,
    rankEligible: timingEligibility.rankEligible
      && (!competitionStatus.enabled || competitionStatus.proof !== 'ineligible'),
  });
  document.documentElement.dataset.maltlineScreen = screen;
  document.documentElement.dataset.maltlineRunEligible = String(
    window.__maltlineViewerStatus.rankEligible,
  );
  document.documentElement.dataset.maltlineTimingInterruption =
    window.__maltlineViewerStatus.interruptionReason ?? 'none';
}

function updateSemanticStatus(state: MaltlineState): void {
  const { stageIndex } = flow.snapshot();
  const next = semanticPlayStatus(engine.scenario, state, {
    stageIndex,
    stageCount: MALTLINE_CAMPAIGN.length,
  });
  if (next === lastSemanticStatus) return;
  lastSemanticStatus = next;
  shell.semanticStatus.textContent = next;
}

function showOverlay(presentation: OverlayPresentation, focus = true): void {
  shell.showOverlay(presentation, focus && !document.hidden);
}

function showTerminalOverlay(presentation: OverlayPresentation): void {
  showOverlay(competition.protectsTerminalResult()
    ? {
        ...presentation,
        hint: 'Press Enter / R to review this ranked result · discard is inside Shift Board',
        announcement: `${presentation.body} Press Enter or R to review this ranked result. Discard is inside Shift Board.`,
      }
    : presentation);
}

function hideOverlay(): void {
  shell.hideOverlay(true);
}

function resetPresentationAnchor(): void {
  inputAdapter.reset();
  simulationClock.reset();
  lastFrameTime = null;
}

function beginStage(index: number, run: RunContext): void {
  const scenario = MALTLINE_CAMPAIGN[index]!;
  const startRunContext = index === 0 ? { lives: scenario.lives, score: 0 } : run;
  stageRunStart = startRunContext;
  engine = new MaltlineEngine(scenario, startRunContext);
  simulationClock.setTicksPerSecond(scenario.ticksPerSecond);
  inputAdapter.setCadence(scenario);
  renderer.resetPresentation();
  renderer.setScenario(engine.scenario);
  eventAnnouncer.reset();
  stageInputs = [];
  competition.beginStage(scenario.id);
}

function recordStageReplay(): void {
  if (stageInputs.length === 0) return;
  stageReplays.push(replayMaltline(engine.scenario, stageRunStart, stageInputs));
}

function renderStageCard(): void {
  const { stageIndex } = flow.snapshot();
  resetPresentationAnchor();
  showOverlay(stageCardPresentation(
    engine.scenario,
    stageIndex,
    MALTLINE_CAMPAIGN.length,
  ));
  publishViewerStatus();
}

function startFreshRun(): void {
  flow.dispatch({ type: 'restart' });
}

function renderPlaying(): void {
  resetPresentationAnchor();
  const state = engine.snapshot();
  updateSemanticStatus(state);
  hideOverlay();
  publishViewerStatus(state);
}

function renderCountdownStep(step: 3 | 2 | 1 | 'SERVE'): void {
  const { stageIndex } = flow.snapshot();
  showOverlay(countdownPresentation(
    step,
    engine.scenario,
    stageIndex,
    MALTLINE_CAMPAIGN.length,
  ));
  publishViewerStatus();
}

function renderVictory(): void {
  resetPresentationAnchor();
  showTerminalOverlay(victoryPresentation(engine.snapshot(), MALTLINE_CAMPAIGN.length));
  publishViewerStatus();
}

function finishStage(bonus: number): void {
  const { stageIndex } = flow.snapshot();
  resetPresentationAnchor();
  recordStageReplay();
  const state = engine.snapshot();
  competition.completeStage(state, stageIndex + 1 === MALTLINE_CAMPAIGN.length);
  carriedRun = { lives: state.lives, score: state.score };
  const finalStage = stageIndex + 1 === MALTLINE_CAMPAIGN.length;
  showOverlay(stageClearPresentation(state, bonus, {
    finalStage,
    rankedResultProtected: finalStage && competition.protectsTerminalResult(),
  }));
  publishViewerStatus(state);
}

function gameOver(fatalReason: LifeLossReason | null): void {
  const { stageIndex } = flow.snapshot();
  resetPresentationAnchor();
  recordStageReplay();
  const state = engine.snapshot();
  competition.completeStage(state, true);
  showTerminalOverlay(gameOverPresentation(
    state,
    stageIndex,
    MALTLINE_CAMPAIGN.length,
    MALTLINE_CAMPAIGN[stageIndex]!.name,
    fatalReason,
  ));
  publishViewerStatus(state);
}

function interruptionCopy(reason: MaltlineRunEligibilitySnapshot['interruptionReason']): string {
  switch (reason) {
    case 'clock_backlog_dropped':
      return 'The browser fell behind the live clock.';
    case 'document_hidden':
      return 'The page moved into the background.';
    case 'window_blur':
      return 'The game window lost focus.';
    case 'unsupported_width':
      return 'The window became too narrow for reliable play.';
    default:
      return 'Live timing was interrupted.';
  }
}

function renderInterruption(
  reason: Exclude<MaltlineRunEligibilitySnapshot['interruptionReason'], null>,
  droppedMs = 0,
): void {
  runEligibility.interrupt(reason, droppedMs);
  eventAnnouncer.reset();
  const interruption = runEligibility.snapshot();
  const primaryReason = interruption.interruptionReason ?? reason;
  const droppedCopy = interruption.droppedMs > 0
    ? ` ${Math.round(interruption.droppedMs)} milliseconds were dropped.`
    : '';
  const body = `${interruptionCopy(primaryReason)}${droppedCopy} The counter is paused and this run is no longer rank-eligible.`;
  competition.invalidate(`${interruptionCopy(primaryReason)} This run cannot be ranked.`);
  showOverlay({
    variant: 'terminal',
    kicker: 'RUN PAUSED',
    title: 'TIMING INTERRUPTED',
    body,
    hint: 'Press Enter to continue unranked · R to restart',
    announcement: `Timing interrupted. ${body} Press Enter to continue unranked, or R to restart.`,
  });
  publishViewerStatus();
}

function renderInterruptedResume(): void {
  simulationClock.reset();
  lastFrameTime = null;
  inputAdapter.reset();
  hideOverlay();
  publishViewerStatus();
}

function applyFlowEffect(effect: MaltlineViewerFlowEffect, transition: MaltlineViewerFlowTransition): void {
  switch (effect.type) {
    case 'show-instructions':
      resetPresentationAnchor();
      showOverlay(instructionPresentation());
      publishViewerStatus();
      return;
    case 'start-fresh-run':
      runEligibility.reset();
      competition.startAttempt();
      stageReplays.length = 0;
      carriedRun = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
      beginStage(0, carriedRun);
      renderStageCard();
      return;
    case 'show-stage-card':
      if (effect.constructStage) beginStage(transition.current.stageIndex, carriedRun);
      renderStageCard();
      return;
    case 'show-countdown':
      if (transition.previous.screen !== 'countdown') resetPresentationAnchor();
      renderCountdownStep(effect.step);
      return;
    case 'enter-playing':
      renderPlaying();
      return;
    case 'finish-stage':
      finishStage(effect.bonus);
      return;
    case 'show-victory':
      renderVictory();
      return;
    case 'show-game-over':
      gameOver(effect.fatalReason);
      return;
    case 'record-interruption':
      renderInterruption(effect.reason, effect.droppedMs);
      return;
    case 'resume-playing':
      renderInterruptedResume();
  }
}

function applyFlowTransition(transition: MaltlineViewerFlowTransition): void {
  if (transition.effect !== null) applyFlowEffect(transition.effect, transition);
}

function interruptRun(
  reason: Exclude<MaltlineRunEligibilitySnapshot['interruptionReason'], null>,
  droppedMs = 0,
): void {
  inputAdapter.reset();
  simulationClock.reset();
  lastFrameTime = null;
  flow.dispatch({ type: 'interrupt', reason, droppedMs });
}

shell.root.addEventListener('keydown', (event) => {
  if (isEditableOrInteractiveTarget(event.target) || !shell.isSupportedDevice()) return;
  if (isRepeatedPresentationAction(event.code, event.repeat)) {
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyR') {
    event.preventDefault();
    if (competition.protectsTerminalResult()) {
      competition.openPanel();
      return;
    }
    startFreshRun();
    return;
  }
  const advance = event.code === 'Enter' || event.code === 'Space';
  const currentScreen = flow.snapshot().screen;
  if (currentScreen === 'interrupted' && advance) {
    event.preventDefault();
    flow.dispatch({ type: 'resume' });
    return;
  }
  if (currentScreen === 'title' && advance) {
    event.preventDefault();
    flow.dispatch({ type: 'advance' });
    return;
  }
  if (currentScreen === 'instructions' && advance) {
    event.preventDefault();
    flow.dispatch({ type: 'advance' });
    return;
  }
  if (currentScreen === 'stage-card' && advance) {
    event.preventDefault();
    flow.dispatch({ type: 'advance' });
    return;
  }
  if (currentScreen === 'countdown' && advance) {
    event.preventDefault();
    flow.dispatch({ type: 'advance' });
    return;
  }
  if (currentScreen === 'cleared' && advance) {
    event.preventDefault();
    flow.dispatch({ type: 'advance' });
    return;
  }
  if ((currentScreen === 'gameover' || currentScreen === 'victory') && advance) {
    event.preventDefault();
    if (competition.protectsTerminalResult()) {
      competition.openPanel();
      return;
    }
    flow.dispatch({ type: 'advance' });
    return;
  }
  if (currentScreen !== 'playing') return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
    event.preventDefault();
  }
  inputAdapter.keyDown(event.code);
});

shell.root.addEventListener('keyup', (event) => {
  inputAdapter.keyUp(event.code);
});

shell.root.addEventListener('pointerdown', (event) => {
  if (!isEditableOrInteractiveTarget(event.target)) shell.root.focus({ preventScroll: true });
});

shell.root.addEventListener('focusout', (event) => {
  const nextTarget = event.relatedTarget;
  if (!(nextTarget instanceof Node) || !shell.root.contains(nextTarget)
    || isEditableOrInteractiveTarget(nextTarget)) inputAdapter.reset();
});

window.addEventListener('blur', () => {
  windowFocused = false;
  interruptRun('window_blur');
});

window.addEventListener('focus', () => {
  windowFocused = true;
  inputAdapter.reset();
  simulationClock.reset();
  lastFrameTime = null;
  if (!competition.snapshot().panelOpen) shell.focusCurrentSurface();
  publishViewerStatus();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    interruptRun('document_hidden');
  } else {
    inputAdapter.reset();
    simulationClock.reset();
    lastFrameTime = null;
    if (!competition.snapshot().panelOpen) shell.focusCurrentSurface();
    publishViewerStatus();
  }
});

shell.onSupportedDeviceChange((supported) => {
  inputAdapter.reset();
  simulationClock.reset();
  lastFrameTime = null;
  if (!supported) {
    interruptRun('unsupported_width');
  }
  if (!competition.snapshot().panelOpen) shell.focusCurrentSurface();
  publishViewerStatus();
});

renderer.setScenario(engine.scenario);
const fontFallbackCopy = fontPreparation.status === 'fallback'
  ? ' Display font unavailable; a system fallback is active, but the shop remains playable.'
  : '';
showOverlay(titlePresentation(fontFallbackCopy));

let lastFrameTime: number | null = null;

function frame(now: number): void {
  if (!shell.isSupportedDevice()) {
    requestAnimationFrame(frame);
    return;
  }
  if (lastFrameTime === null) lastFrameTime = now;
  const dtMs = Math.min(Math.max(0, now - lastFrameTime), 100);
  lastFrameTime = now;

  if (flow.snapshot().screen === 'playing' && !document.hidden && windowFocused) {
    const advance = simulationClock.advance(now);
    if (advance.droppedMs > 0) {
      interruptRun('clock_backlog_dropped', advance.droppedMs);
    } else {
      for (let stepped = 0; stepped < advance.ticks && flow.snapshot().screen === 'playing'; stepped++) {
        const flowBeforeStep = flow.snapshot();
        const preStepState = engine.snapshot();
        const input = inputAdapter.inputForTick(preStepState.tick + 1, preStepState);
        engine.setInput(input);
        stageInputs.push({ ...input });
        competition.recordTickInput(input);
        const result = engine.step();
        renderer.pushEvents(result.events, result.state);
        const fatalReason = terminalLifeLossReason(result.events);
        for (const event of result.events) {
          if (event.type === 'stage_cleared') {
            flow.dispatch({
              type: 'stage-cleared',
              attempt: flowBeforeStep.attempt,
              stageIndex: flowBeforeStep.stageIndex,
              bonus: event.bonus,
            });
          }
          if (event.type === 'game_lost') {
            flow.dispatch({
              type: 'game-lost',
              attempt: flowBeforeStep.attempt,
              stageIndex: flowBeforeStep.stageIndex,
              fatalReason,
            });
          }
        }
        if (flow.snapshot().screen === 'playing') eventAnnouncer.push(result.events);
      }
    }
  }

  renderer.update(dtMs);
  const state = engine.snapshot();
  renderer.draw(ctx, state, {
    stageIndex: flow.snapshot().stageIndex,
    stageCount: MALTLINE_CAMPAIGN.length,
  });
  updateSemanticStatus(state);
  publishViewerStatus(state);
  requestAnimationFrame(frame);
}

const initialState = engine.snapshot();
updateSemanticStatus(initialState);
publishViewerStatus(initialState);
document.documentElement.dataset.maltlineViewerReady = 'true';
requestAnimationFrame(frame);

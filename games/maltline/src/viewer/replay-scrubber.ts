import { resolveMaltlineAuthority } from '../core/authority';
import type {
  MaltlinePlaybackFrame,
  MaltlinePlaybackStage,
  VerifiedMaltlinePlayback,
} from '../core/playback';
import type { GameEvent, MaltlineScenario } from '../core/types';
import { FLAVOR_LABELS } from '../core/types';
import { mulberry32 } from '../core/rng';
import {
  deriveMaltlineEventPresentation,
  type MaltlineReplayRecentFact,
} from './event-presentation';
import { MaltlineRenderer, type MaltlinePresentationDependencies } from './renderer';
import { deriveMaltlineStationActionPresentation } from './station-action-presentation';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const DEFAULT_SPEED = 4;
const MAXIMUM_TICKS_PER_FRAME = 32;
const PRESENTATION_HISTORY_MS = 1_400;
const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;

export type MaltlineReplaySpeed = typeof PLAYBACK_SPEEDS[number];

export interface MaltlineReplayAnimationScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface MaltlineReplayMotionPreference {
  current(): boolean;
  subscribe(listener: (reducedMotion: boolean) => void): () => void;
}

export interface MaltlineReplayScrubberOptions {
  scheduler?: MaltlineReplayAnimationScheduler;
  announce?: (message: string) => void;
  rendererDependencies?: MaltlinePresentationDependencies;
  motionPreference?: MaltlineReplayMotionPreference;
}

export interface MaltlineReplayScrubberSnapshot {
  readonly stageIndex: number;
  readonly stageTick: number;
  readonly playing: boolean;
  readonly speed: MaltlineReplaySpeed;
  readonly destroyed: boolean;
}

export interface MaltlineReplayScrubber {
  readonly root: HTMLElement;
  play(): void;
  pause(): void;
  setSpeed(speed: MaltlineReplaySpeed): void;
  selectStage(stageIndex: number): void;
  previousStage(): void;
  nextStage(): void;
  seekToTick(stageTick: number): void;
  seekBySeconds(seconds: number): void;
  snapshot(): MaltlineReplayScrubberSnapshot;
  destroy(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = documentRef.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTime(ticks: number, ticksPerSecond: number): string {
  const seconds = Math.floor(ticks / ticksPerSecond);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function stableSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function describeMaltlineReplayRecentEvent(events: readonly GameEvent[]): string | null {
  const event = deriveMaltlineEventPresentation(events).replayRecent;
  return event === null ? null : replayEventText(event);
}

function replayEventText(event: MaltlineReplayRecentFact): string {
  switch (event.type) {
    case 'served': {
      const points = event.points > 0 ? `, +${formatNumber(event.points)} points` : ', no points';
      const rescue = event.firstFulfillment ? '' : ' rescue';
      return `${FLAVOR_LABELS[event.flavor]}${rescue} served at window ${event.lane + 1}${points}.`;
    }
    case 'customer_exited':
      return 'Customer finished and left happy.';
    case 'jar_returned':
      return `A jar is returning from window ${event.lane + 1}.`;
    case 'jar_caught':
      return event.points > 0
        ? `Return jar caught at window ${event.lane + 1}, +${formatNumber(event.points)} points.`
        : `Return jar caught at window ${event.lane + 1}.`;
    case 'shake_smashed':
      return `${FLAVOR_LABELS[event.flavor]} shake missed at window ${event.lane + 1}.`;
    case 'jar_smashed':
      return `Return jar missed at window ${event.lane + 1}.`;
    case 'walkout':
      return `Customer walked out at window ${event.lane + 1}.`;
    case 'life_lost': {
      const cause = event.reason === 'walkout'
        ? 'customer walkout'
        : event.reason === 'shake_smashed' ? 'missed shake' : 'missed return jar';
      return `Life lost: ${cause}. ${event.lives} ${event.lives === 1 ? 'life' : 'lives'} left.`;
    }
    case 'blend_completed':
      return `${FLAVOR_LABELS[event.flavor]} shake ready.`;
    case 'shake_launched':
      return `${FLAVOR_LABELS[event.flavor]} shake sent to window ${event.lane + 1}.`;
    case 'stage_cleared':
      return `Stage cleared, +${formatNumber(event.bonus)} bonus points.`;
    case 'game_lost':
      return 'Run ended.';
  }
}

export function describeMaltlineReplayImportantEvent(events: readonly GameEvent[]): string | null {
  const event = deriveMaltlineEventPresentation(events).replayAnnouncement;
  if (event === null) return null;
  switch (event.type) {
    case 'game_lost':
      return 'Game over in replay.';
    case 'stage_cleared':
      return `Stage cleared in replay. Bonus ${formatNumber(event.bonus)} points.`;
    case 'life_lost':
      return replayEventText(event) ?? 'Life lost in replay.';
  }
}

function frameOrdinal(stageTick: number, stageTicks: number): Readonly<{
  current: number;
  total: number;
  text: string;
}> {
  const current = stageTick + 1;
  const total = stageTicks + 1;
  return Object.freeze({ current, total, text: `Frame ${formatNumber(current)} of ${formatNumber(total)}` });
}

/** Player-facing replay facts derived from the same station-action policy as the live renderer. */
export function describeMaltlineReplayFrameAction(
  frame: MaltlinePlaybackFrame,
  scenario: MaltlineScenario,
): string {
  const action = deriveMaltlineStationActionPresentation(scenario, frame.state);
  const actionText = action.mode === 'holding'
    ? `${FLAVOR_LABELS[action.actionFlavor]} shake held and ready`
    : action.mode === 'blending'
      ? `${FLAVOR_LABELS[action.actionFlavor]} shake processing at ${action.quantizedPercent}%`
      : action.mode === 'blocked-no-jars'
        ? 'no clean jars available'
        : 'no shake in progress';
  return [
    `Window ${frame.state.player.lane + 1}`,
    `${FLAVOR_LABELS[action.selectedStation.flavor]} station selected`,
    actionText,
    `${frame.state.jarsAvailable} clean ${frame.state.jarsAvailable === 1 ? 'jar' : 'jars'}`,
    `${frame.state.washing.length} washing`,
    `${frame.state.slides.length} ${frame.state.slides.length === 1 ? 'shake' : 'shakes'} outbound`,
    `${frame.state.jars.length} ${frame.state.jars.length === 1 ? 'jar' : 'jars'} returning`,
  ].join('; ');
}

function browserScheduler(documentRef: Document): MaltlineReplayAnimationScheduler {
  const windowRef = documentRef.defaultView;
  if (windowRef === null) throw new Error('Maltline replay scrubber requires a window or scheduler.');
  return {
    request: (callback) => windowRef.requestAnimationFrame(callback),
    cancel: (handle) => windowRef.cancelAnimationFrame(handle),
  };
}

function browserMotionPreference(documentRef: Document): MaltlineReplayMotionPreference | null {
  const windowRef = documentRef.defaultView;
  if (windowRef === null || typeof windowRef.matchMedia !== 'function') return null;
  const query = windowRef.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    current: () => query.matches,
    subscribe(listener) {
      const onChange = (event: MediaQueryListEvent): void => listener(event.matches);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
  };
}

function scenarioSet(playback: VerifiedMaltlinePlayback): readonly MaltlineScenario[] {
  const authority = resolveMaltlineAuthority(playback.verification.envelope.authority);
  if (authority === undefined) throw new Error('Maltline replay playback authority is not registered.');
  return Object.freeze(playback.stages.map((stage, index) => {
    const scenario = authority.campaign[index];
    if (scenario === undefined || scenario.id !== stage.stageId) {
      throw new Error('Maltline replay stages do not match their registered authority.');
    }
    return scenario;
  }));
}

/**
 * Mounts an isolated, presentation-only cursor over an already verified proof.
 * It owns no audio, storage, global gameplay input, submission, or rank state.
 */
export function mountMaltlineReplayScrubber(
  target: HTMLElement,
  playback: VerifiedMaltlinePlayback,
  options: MaltlineReplayScrubberOptions = {},
): MaltlineReplayScrubber {
  if (playback.stages.length === 0) throw new Error('Maltline replay scrubber requires a recorded stage.');
  const documentRef = target.ownerDocument;
  const scheduler = options.scheduler ?? browserScheduler(documentRef);
  const announce = options.announce ?? (() => undefined);
  const scenarios = scenarioSet(playback);
  const suppliedRendererDependencies = options.rendererDependencies ?? {};
  const motionPreference = options.motionPreference
    ?? (suppliedRendererDependencies.reducedMotion === undefined
      ? browserMotionPreference(documentRef)
      : null);
  let reducedMotion = motionPreference?.current()
    ?? suppliedRendererDependencies.reducedMotion
    ?? false;
  let presentationNowMs = 0;
  const makeRenderer = (stageIndex: number, stageTick: number): MaltlineRenderer => {
    return new MaltlineRenderer({
      ...suppliedRendererDependencies,
      reducedMotion,
      random: suppliedRendererDependencies.random ?? mulberry32(stableSeed(
        `${playback.verification.sha256}:${stageIndex}:${stageTick}`,
      )),
      nowMs: suppliedRendererDependencies.nowMs ?? (() => presentationNowMs),
    });
  };

  const root = element(documentRef, 'section', 'maltline-replay-scrubber');
  root.setAttribute('aria-label', 'Verified run replay');
  const heading = element(documentRef, 'h4', 'maltline-replay-scrubber__heading', 'WATCH REPLAY');
  const stageLabel = element(documentRef, 'label', 'maltline-replay-scrubber__label', 'Stage');
  const stageSelect = element(documentRef, 'select', 'maltline-replay-scrubber__stage');
  stageSelect.setAttribute('aria-label', 'Replay stage');
  for (const stage of playback.stages) {
    const option = element(documentRef, 'option', '', `Stage ${stage.stageIndex + 1}: ${stage.name}`);
    option.value = String(stage.stageIndex);
    stageSelect.append(option);
  }
  const stageHint = element(
    documentRef,
    'span',
    'maltline-replay-scrubber__stage-hint',
    'Stages play separately.',
  );
  stageLabel.append(stageSelect, stageHint);

  const canvas = element(documentRef, 'canvas', 'maltline-replay-scrubber__canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }

  const transport = element(documentRef, 'div', 'maltline-replay-scrubber__transport');
  const previous = element(documentRef, 'button', 'maltline-replay-scrubber__button', 'Prev stage');
  previous.setAttribute('aria-label', 'Previous replay stage');
  const playPause = element(documentRef, 'button', 'maltline-replay-scrubber__button', 'Play stage');
  playPause.setAttribute('aria-label', 'Play replay stage');
  const next = element(documentRef, 'button', 'maltline-replay-scrubber__button', 'Next stage');
  next.setAttribute('aria-label', 'Next replay stage');
  for (const button of [previous, playPause, next]) button.type = 'button';
  transport.append(previous, playPause, next);

  const seekControls = element(documentRef, 'div', 'maltline-replay-scrubber__seek');
  const backFive = element(documentRef, 'button', 'maltline-replay-scrubber__button', '−5s');
  backFive.setAttribute('aria-label', 'Back 5 seconds');
  const backOne = element(documentRef, 'button', 'maltline-replay-scrubber__button', '−1 frame');
  backOne.setAttribute('aria-label', 'Previous replay frame');
  const forwardOne = element(documentRef, 'button', 'maltline-replay-scrubber__button', '+1 frame');
  forwardOne.setAttribute('aria-label', 'Next replay frame');
  const forwardFive = element(documentRef, 'button', 'maltline-replay-scrubber__button', '+5s');
  forwardFive.setAttribute('aria-label', 'Forward 5 seconds');
  for (const button of [backFive, backOne, forwardOne, forwardFive]) button.type = 'button';
  const positionLabel = element(documentRef, 'label', 'maltline-replay-scrubber__label', 'Replay frame');
  const position = element(documentRef, 'input', 'maltline-replay-scrubber__position');
  position.type = 'range';
  position.id = 'maltline-replay-position';
  position.min = '0';
  position.step = '1';
  position.setAttribute('aria-label', 'Replay frame');
  const time = element(documentRef, 'output', 'maltline-replay-scrubber__time');
  time.setAttribute('for', position.id);
  time.setAttribute('role', 'timer');
  time.setAttribute('aria-live', 'off');
  time.setAttribute('aria-label', 'Replay frame and game time');
  positionLabel.append(position);
  seekControls.append(backFive, backOne, positionLabel, forwardOne, forwardFive, time);

  const speedLabel = element(documentRef, 'label', 'maltline-replay-scrubber__label', 'Playback speed');
  const speedSelect = element(documentRef, 'select', 'maltline-replay-scrubber__speed');
  speedSelect.setAttribute('aria-label', 'Playback speed');
  for (const speed of PLAYBACK_SPEEDS) {
    const option = element(documentRef, 'option', '', `${speed}x`);
    option.value = String(speed);
    speedSelect.append(option);
  }
  speedLabel.append(speedSelect);
  const summary = element(documentRef, 'p', 'maltline-replay-scrubber__summary');
  const latest = element(documentRef, 'p', 'maltline-replay-scrubber__event');
  summary.id = 'maltline-replay-frame-summary';
  latest.id = 'maltline-replay-event-summary';
  root.setAttribute('aria-describedby', `${summary.id} ${latest.id}`);
  const canvasFailure = context === null
    ? element(
        documentRef,
        'p',
        'maltline-replay-scrubber__canvas-failure',
        'Replay picture unavailable. Verified result and replay controls remain usable.',
      )
    : null;
  root.append(heading, stageLabel, canvas, transport);
  if (canvasFailure !== null) root.append(canvasFailure);
  root.append(seekControls, speedLabel, summary, latest);
  target.append(root);

  const initialStageIndex = playback.stages.length - 1;
  let frame: MaltlinePlaybackFrame = playback.frameAt({ stageIndex: initialStageIndex, stageTick: 0 });
  let speed: MaltlineReplaySpeed = DEFAULT_SPEED;
  let playing = false;
  let destroyed = false;
  let animationHandle: number | null = null;
  let rangeSeekHandle: number | null = null;
  let pendingRangeTick: number | null = null;
  let previousTimestamp: number | null = null;
  let tickBacklog = 0;
  let latestEventText = describeMaltlineReplayRecentEvent(frame.events) ?? 'No recent major event.';
  let presentationFrames: MaltlinePlaybackFrame[] = [frame];

  const stage = (): MaltlinePlaybackStage => playback.stages[frame.position.stageIndex]!;
  const scenario = (): MaltlineScenario => scenarios[frame.position.stageIndex]!;
  const terminalGuidance = (): string => playback.stages.length > 1
    ? 'Choose another stage to continue'
    : 'Replay complete';

  const updateText = (): void => {
    const descriptor = stage();
    const activeScenario = scenario();
    const atEnd = frame.position.stageTick === descriptor.ticks;
    const ordinal = frameOrdinal(frame.position.stageTick, descriptor.ticks);
    stageSelect.value = String(descriptor.stageIndex);
    speedSelect.value = String(speed);
    position.max = String(descriptor.ticks);
    position.value = String(frame.position.stageTick);
    position.setAttribute(
      'aria-valuetext',
      `${descriptor.name}, ${ordinal.text.toLowerCase()}, game time ${formatTime(frame.position.stageTick, activeScenario.ticksPerSecond)} of ${formatTime(descriptor.ticks, activeScenario.ticksPerSecond)}`,
    );
    time.textContent = `Frame ${formatNumber(ordinal.current)} / ${formatNumber(ordinal.total)} · game time ${formatTime(frame.position.stageTick, activeScenario.ticksPerSecond)} / ${formatTime(descriptor.ticks, activeScenario.ticksPerSecond)}`;
    playPause.textContent = atEnd ? 'Replay stage' : playing ? 'Pause' : 'Play stage';
    playPause.setAttribute('aria-label', atEnd ? 'Replay stage' : playing ? 'Pause replay' : 'Play replay stage');
    previous.disabled = descriptor.stageIndex === 0;
    next.disabled = descriptor.stageIndex === playback.stages.length - 1;
    backFive.disabled = frame.position.stageTick === 0;
    backOne.disabled = frame.position.stageTick === 0;
    forwardOne.disabled = atEnd;
    forwardFive.disabled = atEnd;
    const mode = atEnd
      ? descriptor.terminalStatus === 'won'
        ? `Stage cleared. ${terminalGuidance()}`
        : `Run ended. ${terminalGuidance()}`
      : playing ? `Playing at ${speed}x` : `Paused at ${speed}x`;
    summary.textContent = [
      `Stage ${descriptor.stageIndex + 1} of ${playback.stages.length}, ${descriptor.name}.`,
      `${mode}.`,
      `${frame.state.resolved} of ${activeScenario.customerCount} orders resolved;`,
      `${frame.state.fulfilled} served; ${frame.state.walkouts} walkouts;`,
      `${describeMaltlineReplayFrameAction(frame, activeScenario)};`,
      `${frame.state.lives} ${frame.state.lives === 1 ? 'life' : 'lives'};`,
      `${formatNumber(frame.state.score)} campaign points.`,
    ].join(' ');
    latest.textContent = `Recent event: ${latestEventText}`;
  };

  const presentationHistoryTicks = (stageIndex = frame.position.stageIndex): number => Math.ceil(
    PRESENTATION_HISTORY_MS / 1_000 * scenarios[stageIndex]!.ticksPerSecond,
  );

  const moveToFrame = (stageIndex: number, stageTick: number): void => {
    const historyStartTick = Math.max(0, stageTick - presentationHistoryTicks(stageIndex));
    let historyFrame = playback.frameAt({ stageIndex, stageTick: historyStartTick });
    const history: MaltlinePlaybackFrame[] = stageTick === 0 ? [historyFrame] : [];
    for (let tick = historyStartTick + 1; tick <= stageTick; tick++) {
      const nextHistoryFrame = playback.step();
      if (nextHistoryFrame === null) {
        throw new Error('Verified Maltline presentation history ended unexpectedly.');
      }
      historyFrame = nextHistoryFrame;
      history.push(historyFrame);
    }
    frame = historyFrame;
    presentationFrames = history;
  };

  const appendPresentationFrame = (nextFrame: MaltlinePlaybackFrame): void => {
    presentationFrames.push(nextFrame);
    const earliestTick = nextFrame.position.stageTick - presentationHistoryTicks();
    while (presentationFrames.length > 1
      && presentationFrames[0]!.position.stageTick <= earliestTick) {
      presentationFrames.shift();
    }
  };

  const draw = (): void => {
    const targetFrame = frame;
    const activeScenario = scenario();
    const renderer = makeRenderer(targetFrame.position.stageIndex, targetFrame.position.stageTick);
    renderer.setScenario(activeScenario);
    latestEventText = 'No recent major event.';
    for (const historyFrame of presentationFrames) {
      presentationNowMs = historyFrame.position.stageTick / activeScenario.ticksPerSecond * 1_000;
      if (historyFrame.events.length > 0) {
        renderer.pushEvents([...historyFrame.events], historyFrame.state);
        latestEventText = describeMaltlineReplayRecentEvent(historyFrame.events) ?? latestEventText;
      }
      renderer.update(1_000 / activeScenario.ticksPerSecond);
    }
    presentationNowMs = targetFrame.position.stageTick / activeScenario.ticksPerSecond * 1_000;
    if (context !== null) {
      renderer.draw(context, targetFrame.state, {
        stageIndex: frame.position.stageIndex,
        stageCount: playback.stages.length,
      });
    }
    updateText();
  };

  const cancelAnimation = (): void => {
    if (animationHandle !== null) scheduler.cancel(animationHandle);
    animationHandle = null;
  };

  const cancelRangeSeek = (): void => {
    if (rangeSeekHandle !== null) scheduler.cancel(rangeSeekHandle);
    rangeSeekHandle = null;
    pendingRangeTick = null;
  };

  const schedule = (): void => {
    if (!destroyed && playing && animationHandle === null) {
      animationHandle = scheduler.request(onAnimationFrame);
    }
  };

  const stop = (): void => {
    playing = false;
    previousTimestamp = null;
    tickBacklog = 0;
    cancelAnimation();
  };

  const finishStage = (): void => {
    const descriptor = stage();
    const finalEvent = describeMaltlineReplayRecentEvent(frame.events);
    stop();
    presentationNowMs = frame.position.stageTick / scenario().ticksPerSecond * 1_000;
    draw();
    announce(descriptor.terminalStatus === 'won'
      ? `Replay stage ${descriptor.stageIndex + 1}, ${descriptor.name}, cleared. ${terminalGuidance()}.`
      : [
          `Replay stage ${descriptor.stageIndex + 1}, ${descriptor.name}, ended the run.`,
          finalEvent,
          `${terminalGuidance()}.`,
        ].filter(Boolean).join(' '));
  };

  function onAnimationFrame(timestamp: number): void {
    animationHandle = null;
    if (!playing || destroyed) return;
    if (!Number.isFinite(timestamp)) {
      stop();
      draw();
      return;
    }
    let elapsedMs = 0;
    if (previousTimestamp !== null && timestamp >= previousTimestamp) {
      elapsedMs = timestamp - previousTimestamp;
      tickBacklog += elapsedMs * scenario().ticksPerSecond * speed / 1_000;
    }
    previousTimestamp = timestamp;
    const ticks = Math.min(MAXIMUM_TICKS_PER_FRAME, Math.floor(tickBacklog));
    tickBacklog -= ticks;
    for (let stepped = 0; stepped < ticks; stepped++) {
      const nextFrame = playback.step();
      if (nextFrame === null) {
        finishStage();
        return;
      }
      frame = nextFrame;
      appendPresentationFrame(nextFrame);
      if (frame.events.length > 0) {
        const message = describeMaltlineReplayImportantEvent(frame.events);
        if (message !== null && frame.position.stageTick < stage().ticks) announce(message);
      }
      if (frame.position.stageTick === stage().ticks) {
        finishStage();
        return;
      }
    }
    draw();
    schedule();
  }

  const seek = (
    stageTick: number,
    shouldAnnounce: boolean,
    cancelPendingRange = true,
  ): void => {
    if (destroyed) return;
    if (!Number.isFinite(stageTick)) throw new TypeError('Maltline replay seek tick must be finite.');
    if (cancelPendingRange) cancelRangeSeek();
    const targetTick = Math.max(0, Math.min(stage().ticks, Math.round(stageTick)));
    stop();
    moveToFrame(frame.position.stageIndex, targetTick);
    draw();
    if (shouldAnnounce) {
      const ordinal = frameOrdinal(targetTick, stage().ticks);
      announce(`Replay paused at ${ordinal.text.toLowerCase()}, game time ${formatTime(targetTick, scenario().ticksPerSecond)} in ${stage().name}.`);
    }
  };

  const selectStage = (stageIndex: number): void => {
    if (destroyed) return;
    if (!Number.isSafeInteger(stageIndex) || stageIndex < 0 || stageIndex >= playback.stages.length) {
      throw new RangeError('Maltline replay stage index is out of range.');
    }
    stop();
    cancelRangeSeek();
    moveToFrame(stageIndex, 0);
    draw();
    announce(`Replay stage ${stageIndex + 1}, ${stage().name}, selected and paused at ${frameOrdinal(0, stage().ticks).text.toLowerCase()}.`);
  };

  const play = (): void => {
    if (destroyed || playing) return;
    cancelRangeSeek();
    if (frame.position.stageTick === stage().ticks) {
      moveToFrame(frame.position.stageIndex, 0);
      draw();
    }
    playing = true;
    previousTimestamp = null;
    tickBacklog = 0;
    updateText();
    announce(`Playing replay stage ${stage().stageIndex + 1}, ${stage().name}, at ${speed}x.`);
    schedule();
  };

  const pause = (message = true): void => {
    if (destroyed || !playing) return;
    stop();
    updateText();
    if (message) {
      const ordinal = frameOrdinal(frame.position.stageTick, stage().ticks);
      announce(`Replay paused at ${ordinal.text.toLowerCase()}, game time ${formatTime(frame.position.stageTick, scenario().ticksPerSecond)} in ${stage().name}.`);
    }
  };

  playPause.addEventListener('click', () => playing ? pause() : play());
  previous.addEventListener('click', () => selectStage(frame.position.stageIndex - 1));
  next.addEventListener('click', () => selectStage(frame.position.stageIndex + 1));
  stageSelect.addEventListener('change', () => selectStage(Number(stageSelect.value)));
  speedSelect.addEventListener('change', () => {
    const candidate = Number(speedSelect.value);
    if (PLAYBACK_SPEEDS.includes(candidate as MaltlineReplaySpeed)) {
      speed = candidate as MaltlineReplaySpeed;
      updateText();
      announce(`Replay speed ${speed}x.`);
    }
  });
  const flushRangeSeek = (): void => {
    if (rangeSeekHandle !== null) scheduler.cancel(rangeSeekHandle);
    rangeSeekHandle = null;
    const targetTick = pendingRangeTick;
    pendingRangeTick = null;
    if (targetTick !== null) seek(targetTick, false, false);
  };
  position.addEventListener('input', () => {
    if (destroyed) return;
    const targetTick = Number(position.value);
    if (!Number.isFinite(targetTick)) return;
    stop();
    pendingRangeTick = targetTick;
    if (rangeSeekHandle === null) {
      rangeSeekHandle = scheduler.request(() => flushRangeSeek());
    }
  });
  position.addEventListener('change', () => {
    flushRangeSeek();
    const ordinal = frameOrdinal(frame.position.stageTick, stage().ticks);
    announce(`Replay paused at ${ordinal.text.toLowerCase()}, game time ${formatTime(frame.position.stageTick, scenario().ticksPerSecond)} in ${stage().name}.`);
  });
  backFive.addEventListener('click', () => seek(frame.position.stageTick - scenario().ticksPerSecond * 5, true));
  backOne.addEventListener('click', () => seek(frame.position.stageTick - 1, true));
  forwardOne.addEventListener('click', () => seek(frame.position.stageTick + 1, true));
  forwardFive.addEventListener('click', () => seek(frame.position.stageTick + scenario().ticksPerSecond * 5, true));

  const onVisibilityChange = (): void => {
    if (documentRef.hidden) {
      const wasPlaying = playing;
      pause(false);
      if (wasPlaying) announce('Replay paused because the page is hidden.');
    }
  };
  documentRef.addEventListener('visibilitychange', onVisibilityChange);

  const onMotionPreferenceChange = (nextReducedMotion: boolean): void => {
    if (destroyed || nextReducedMotion === reducedMotion) return;
    const stageIndex = frame.position.stageIndex;
    const stageTick = frame.position.stageTick;
    stop();
    cancelRangeSeek();
    reducedMotion = nextReducedMotion;
    moveToFrame(stageIndex, stageTick);
    draw();
    const ordinal = frameOrdinal(stageTick, stage().ticks);
    announce([
      `Reduced motion ${reducedMotion ? 'enabled' : 'disabled'}; replay paused`,
      `at ${ordinal.text.toLowerCase()} in ${stage().name}.`,
    ].join(' '));
  };
  const unsubscribeMotionPreference = motionPreference?.subscribe(onMotionPreferenceChange)
    ?? (() => undefined);

  speedSelect.value = String(speed);
  draw();

  return {
    root,
    play,
    pause: () => pause(),
    setSpeed(candidate) {
      if (destroyed) return;
      if (!PLAYBACK_SPEEDS.includes(candidate)) throw new RangeError('Maltline replay speed is unsupported.');
      speed = candidate;
      updateText();
      announce(`Replay speed ${speed}x.`);
    },
    selectStage,
    previousStage() {
      if (frame.position.stageIndex > 0) selectStage(frame.position.stageIndex - 1);
    },
    nextStage() {
      if (frame.position.stageIndex < playback.stages.length - 1) {
        selectStage(frame.position.stageIndex + 1);
      }
    },
    seekToTick: (stageTick) => seek(stageTick, true),
    seekBySeconds(seconds) {
      if (!Number.isFinite(seconds)) throw new TypeError('Maltline replay seek seconds must be finite.');
      seek(frame.position.stageTick + seconds * scenario().ticksPerSecond, true);
    },
    snapshot() {
      return Object.freeze({
        stageIndex: frame.position.stageIndex,
        stageTick: frame.position.stageTick,
        playing,
        speed,
        destroyed,
      });
    },
    destroy() {
      if (destroyed) return;
      stop();
      cancelRangeSeek();
      destroyed = true;
      documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribeMotionPreference();
      root.remove();
    },
  };
}

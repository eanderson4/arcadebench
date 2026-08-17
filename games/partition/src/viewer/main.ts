import { PartitionEngine } from '../core/engine';
import { parsePartitionReplay, replayPartitionFrames, type PartitionReplayFrame } from '../core/replay';
import { createClassicScenario } from '../core/scenarios';
import type { ControlInput, Direction, GameEvent, PartitionReplay, PartitionState } from '../core/types';
import { PartitionRenderer } from './renderer';
import { createShowcaseReplay } from './showcase-replay';

type ViewMode = 'live' | 'replay';

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing viewer element: ${selector}`);
  return element;
}

const canvas = query<HTMLCanvasElement>('#game');
const renderer = new PartitionRenderer(canvas);
const captureEl = query<HTMLElement>('#capture');
const integrityEl = query<HTMLElement>('#integrity');
const tickEl = query<HTMLElement>('#tick');
const statusEl = query<HTMLElement>('#status');
const messageEl = query<HTMLElement>('#message');
const restartButton = query<HTMLButtonElement>('#restart');
const playButton = query<HTMLButtonElement>('#play-pause');
const timeline = query<HTMLInputElement>('#timeline');
const timelineCurrent = query<HTMLElement>('#timeline-current');
const timelineEnd = query<HTMLElement>('#timeline-end');
const replayName = query<HTMLElement>('#replay-name');
const replayDetail = query<HTMLElement>('#replay-detail');
const eventList = query<HTMLOListElement>('#event-list');
const inputDirection = query<HTMLElement>('#input-direction');
const inputDraw = query<HTMLElement>('#input-draw');
const controllerVersion = query<HTMLElement>('#controller-version');
const fileInput = query<HTMLInputElement>('#replay-file');
const notice = query<HTMLElement>('#notice');

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed') ?? 11);
if (!Number.isFinite(seed)) seed = 11;
let engine = new PartitionEngine(createClassicScenario(seed));
let mode: ViewMode = params.get('mode') === 'replay' ? 'replay' : 'live';
let direction: Direction = 'idle';
let drawing = false;
let touchDirection: Direction = 'idle';
let touchDrawing = false;
const keys = new Set<string>();

let loadedReplay: PartitionReplay = createShowcaseReplay();
let replayFrames: PartitionReplayFrame[] = replayPartitionFrames(loadedReplay);
let replayFrameIndex = 0;
let replayPlaying = false;
let replaySpeed = 1;
let replayAccumulator = 0;
let lastAnimationTime = performance.now();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function selectDirection(): Direction {
  if (keys.has('ArrowUp')) return 'up';
  if (keys.has('ArrowDown')) return 'down';
  if (keys.has('ArrowLeft')) return 'left';
  if (keys.has('ArrowRight')) return 'right';
  return touchDirection;
}

function currentInput(): ControlInput {
  direction = selectDirection();
  return { direction, draw: drawing || touchDrawing ? 'fast' : 'off' };
}

function showNotice(text: string, tone: 'normal' | 'error' = 'normal'): void {
  notice.textContent = text;
  notice.dataset.tone = tone;
  notice.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3000);
}

function eventLabel(event: GameEvent): string {
  switch (event.type) {
    case 'trace_started': return `Trace opened at ${event.at.x}, ${event.at.y}`;
    case 'trace_completed': return `Partition closed · ${event.capturedCells} cells stabilized`;
    case 'trace_hit': return `${event.anomalyId.toUpperCase()} severed trace · ${event.integrity} integrity`;
    case 'level_won': return `Field stabilized · ${Math.round(event.capturedFraction * 100)}%`;
    case 'game_lost': return 'Signal lost';
    case 'controller_installed': return `Controller v${event.version} installed`;
  }
}

function allReplayEvents(): GameEvent[] {
  return loadedReplay.ticks.flatMap((record) => [...(record.controlEvents ?? []), ...record.events]);
}

function renderEvents(tick: number): void {
  const events = allReplayEvents();
  eventList.replaceChildren();
  if (events.length === 0) {
    const item = document.createElement('li');
    item.className = 'empty-event';
    item.textContent = 'No events in this recording';
    eventList.append(item);
    return;
  }
  const past = events.filter((event) => event.tick <= tick);
  const upcoming = events.find((event) => event.tick > tick);
  const visible = [...past.slice(-5), ...(upcoming ? [upcoming] : [])];
  for (const event of visible) {
    const item = document.createElement('li');
    item.className = event.tick === tick ? 'current' : event.tick > tick ? 'upcoming' : '';
    const marker = document.createElement('span');
    marker.className = 'event-marker';
    const copy = document.createElement('span');
    const tickLabel = document.createElement('b');
    tickLabel.textContent = `T${event.tick}`;
    copy.append(tickLabel, document.createTextNode(eventLabel(event)));
    item.append(marker, copy);
    eventList.append(item);
  }
}

function updateStats(state: PartitionState): void {
  captureEl.textContent = `${Math.floor(state.capturedFraction * 100)}%`;
  integrityEl.textContent = String(state.spark.integrity).padStart(2, '0');
  tickEl.textContent = String(state.tick).padStart(4, '0');
  statusEl.textContent = state.status;
  statusEl.dataset.status = state.status;
  if (state.status !== 'running') {
    messageEl.innerHTML = state.status === 'won'
      ? '<span>FIELD STABILIZED</span><small>capture threshold reached</small>'
      : '<span>SIGNAL LOST</span><small>all integrity depleted</small>';
    messageEl.classList.remove('hidden');
  } else {
    messageEl.classList.add('hidden');
  }
}

function updateReplayInspector(frame: PartitionReplayFrame): void {
  const state = frame.state;
  timeline.value = String(replayFrameIndex);
  timelineCurrent.textContent = String(state.tick);
  inputDirection.textContent = state.currentInput.direction;
  inputDraw.textContent = state.currentInput.draw;
  controllerVersion.textContent = `v${state.controllerVersion}`;
  renderEvents(state.tick);
}

function seekReplay(index: number, reflectInUrl = false): void {
  replayFrameIndex = Math.max(0, Math.min(replayFrames.length - 1, Math.round(index)));
  replayAccumulator = 0;
  updateReplayInspector(replayFrames[replayFrameIndex]);
  if (reflectInUrl && mode === 'replay') {
    const queryParams = new URLSearchParams(location.search);
    queryParams.set('tick', String(replayFrames[replayFrameIndex].state.tick));
    history.replaceState(null, '', `${location.pathname}?${queryParams}`);
  }
}

function setReplayPlaying(playing: boolean): void {
  replayPlaying = playing;
  playButton.dataset.playing = String(playing);
  playButton.querySelector('span')!.textContent = playing ? 'PAUSE' : 'PLAY';
  playButton.setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
}

function installReplay(replay: PartitionReplay, name: string): void {
  const frames = replayPartitionFrames(replay);
  loadedReplay = replay;
  replayFrames = frames;
  replayFrameIndex = 0;
  timeline.min = '0';
  timeline.max = String(frames.length - 1);
  timeline.value = '0';
  timelineEnd.textContent = String(frames.at(-1)!.state.tick);
  replayName.textContent = name;
  replayDetail.textContent = `${replay.scenario.name} · ${replay.scenario.ticksPerSecond} Hz · ${replay.scenario.anomalies.length} anomalies`;
  setReplayPlaying(false);
  updateReplayInspector(frames[0]);
}

function setMode(nextMode: ViewMode): void {
  mode = nextMode;
  document.body.dataset.mode = mode;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  }
  const queryParams = new URLSearchParams(location.search);
  queryParams.set('mode', mode);
  queryParams.set('seed', String(seed));
  if (mode === 'replay') queryParams.set('tick', String(replayFrames[replayFrameIndex].state.tick));
  else queryParams.delete('tick');
  history.replaceState(null, '', `${location.pathname}?${queryParams}`);
  if (mode === 'replay') updateReplayInspector(replayFrames[replayFrameIndex]);
}

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, select, button')) return;
  if (mode === 'replay') {
    if (event.code === 'Space') {
      event.preventDefault();
      setReplayPlaying(!replayPlaying);
    }
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      setReplayPlaying(false);
      seekReplay(replayFrameIndex - 1, true);
    }
    if (event.code === 'ArrowRight') {
      event.preventDefault();
      setReplayPlaying(false);
      seekReplay(replayFrameIndex + 1, true);
    }
    return;
  }
  if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space') drawing = true;
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space') drawing = false;
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
  const selected = button.dataset.direction as Direction;
  const begin = (event: Event) => {
    event.preventDefault();
    touchDirection = selected;
  };
  const end = (event: Event) => {
    event.preventDefault();
    if (touchDirection === selected) touchDirection = 'idle';
  };
  button.addEventListener('pointerdown', begin);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('pointerleave', end);
}

const traceButton = query<HTMLButtonElement>('[data-trace]');
traceButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  touchDrawing = true;
});
for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
  traceButton.addEventListener(eventName, (event) => {
    event.preventDefault();
    touchDrawing = false;
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () => setMode(button.dataset.mode as ViewMode));
}

restartButton.addEventListener('click', () => {
  seed++;
  engine = new PartitionEngine(createClassicScenario(seed));
  direction = 'idle';
  drawing = false;
  touchDirection = 'idle';
  touchDrawing = false;
  keys.clear();
  setMode('live');
  showNotice(`New seeded field · ${seed}`);
});

playButton.addEventListener('click', () => {
  if (replayFrameIndex >= replayFrames.length - 1) seekReplay(0);
  setReplayPlaying(!replayPlaying);
});

query<HTMLButtonElement>('#step-back').addEventListener('click', () => {
  setReplayPlaying(false);
  seekReplay(replayFrameIndex - 1, true);
});

query<HTMLButtonElement>('#step-forward').addEventListener('click', () => {
  setReplayPlaying(false);
  seekReplay(replayFrameIndex + 1, true);
});

timeline.addEventListener('input', () => {
  setReplayPlaying(false);
  seekReplay(Number(timeline.value), true);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  button.addEventListener('click', () => {
    replaySpeed = Number(button.dataset.speed);
    for (const speedButton of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
      speedButton.setAttribute('aria-pressed', String(speedButton === button));
    }
  });
}

query<HTMLButtonElement>('#load-replay').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    installReplay(parsePartitionReplay(await file.text()), file.name);
    setMode('replay');
    showNotice(`Loaded ${file.name}`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Could not load replay', 'error');
  } finally {
    fileInput.value = '';
  }
});

query<HTMLButtonElement>('#demo-replay').addEventListener('click', () => {
  installReplay(createShowcaseReplay(), 'Showcase controller');
  setMode('replay');
  showNotice('Showcase replay restored');
});

query<HTMLButtonElement>('#download-replay').addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(loadedReplay, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `partition-${loadedReplay.scenario.id}-replay.json`;
  link.click();
  URL.revokeObjectURL(url);
});

query<HTMLButtonElement>('#copy-link').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('mode', mode);
  url.searchParams.set('seed', String(seed));
  try {
    await navigator.clipboard.writeText(url.toString());
    showNotice('View link copied');
  } catch {
    showNotice('Clipboard access is unavailable', 'error');
  }
});

setInterval(() => {
  if (mode === 'live' && engine.snapshot().status === 'running') {
    engine.setInput(currentInput());
    engine.step();
  }
}, 1000 / engine.scenario.ticksPerSecond);

function frame(animationTime: number): void {
  if (mode === 'replay') {
    if (replayPlaying && replayFrameIndex < replayFrames.length - 1) {
      const elapsedSeconds = Math.min(0.1, (animationTime - lastAnimationTime) / 1000);
      replayAccumulator += elapsedSeconds * loadedReplay.scenario.ticksPerSecond * replaySpeed;
      if (replayAccumulator >= 1) {
        const advance = Math.floor(replayAccumulator);
        replayAccumulator -= advance;
        seekReplay(replayFrameIndex + advance);
      }
      if (replayFrameIndex >= replayFrames.length - 1) setReplayPlaying(false);
    }
    const replayFrame = replayFrames[replayFrameIndex];
    renderer.render(replayFrame.state, { ambientTime: animationTime / 1000 });
    updateStats(replayFrame.state);
  } else {
    const state = engine.snapshot();
    renderer.render(state, { ambientTime: animationTime / 1000 });
    updateStats(state);
  }
  lastAnimationTime = animationTime;
  requestAnimationFrame(frame);
}

async function loadReplayFromUrl(): Promise<void> {
  const replayUrl = params.get('replay');
  if (!replayUrl) return;
  try {
    const response = await fetch(replayUrl);
    if (!response.ok) throw new Error(`replay request failed with ${response.status}`);
    installReplay(parsePartitionReplay(await response.text()), replayUrl.split('/').at(-1) ?? 'Remote replay');
    const remoteTick = Number(params.get('tick') ?? 0);
    if (Number.isFinite(remoteTick) && remoteTick > 0) {
      const requestedFrame = replayFrames.findIndex((candidate) => candidate.state.tick >= remoteTick);
      seekReplay(requestedFrame === -1 ? replayFrames.length - 1 : requestedFrame);
    }
    setMode('replay');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Could not fetch replay', 'error');
  }
}

installReplay(loadedReplay, 'Showcase controller');
const requestedTick = Number(params.get('tick') ?? 0);
if (Number.isFinite(requestedTick) && requestedTick > 0) {
  const requestedFrame = replayFrames.findIndex((candidate) => candidate.state.tick >= requestedTick);
  seekReplay(requestedFrame === -1 ? replayFrames.length - 1 : requestedFrame);
}
setMode(mode);
if (mode === 'replay' && params.get('autoplay') === '1') setReplayPlaying(true);
void loadReplayFromUrl();
requestAnimationFrame(frame);

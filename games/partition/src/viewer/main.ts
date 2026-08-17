import { PartitionEngine } from '../core/engine';
import { parsePartitionReplay, replayPartitionFrames, type PartitionReplayFrame } from '../core/replay';
import { createClassicScenario } from '../core/scenarios';
import type { ControlInput, Direction, GameEvent, PartitionReplay, PartitionState, ReplayTick } from '../core/types';
import { PartitionRenderer } from './renderer';
import { ReplayTransport } from './replay-transport';
import { createShowcaseReplay } from './showcase-replay';

type ViewMode = 'live' | 'replay';

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing viewer element: ${selector}`);
  return element;
}

const canvas = query<HTMLCanvasElement>('#game');
const stage = query<HTMLElement>('.stage');
const renderer = new PartitionRenderer(canvas);
const captureEl = query<HTMLElement>('#capture');
const integrityEl = query<HTMLElement>('#integrity');
const tickEl = query<HTMLElement>('#tick');
const statusEl = query<HTMLElement>('#status');
const stageCaptureEl = query<HTMLElement>('#stage-capture');
const stageIntegrityEl = query<HTMLElement>('#stage-integrity');
const stageTickEl = query<HTMLElement>('#stage-tick');
const fitScreenButton = query<HTMLButtonElement>('#fit-screen');
const messageEl = query<HTMLElement>('#message');
const playIntro = query<HTMLElement>('#play-intro');
const startPlayButton = query<HTMLButtonElement>('#start-play');
const howToPlayButton = query<HTMLButtonElement>('#how-to-play');
const watchRunButton = query<HTMLButtonElement>('#watch-run');
const restartButton = query<HTMLButtonElement>('#restart');
const playButton = query<HTMLButtonElement>('#play-pause');
const timeline = query<HTMLInputElement>('#timeline');
const timelineCurrent = query<HTMLElement>('#timeline-current');
const timelineEnd = query<HTMLElement>('#timeline-end');
const timelineTime = query<HTMLElement>('#timeline-time');
const eventTrack = query<HTMLElement>('#event-track');
const loopButton = query<HTMLButtonElement>('#loop-replay');
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
let immersive = false;
let direction: Direction = 'idle';
let drawing = false;
let touchDirection: Direction = 'idle';
let touchDrawing = false;
let liveStarted = params.get('autostart') === '1';
let liveReplayTicks: ReplayTick[] = [];
const keys = new Set<string>();

let loadedReplay: PartitionReplay = createShowcaseReplay();
let replayFrames: PartitionReplayFrame[] = replayPartitionFrames(loadedReplay);
let replayTransport = new ReplayTransport(replayFrames, loadedReplay.scenario.ticksPerSecond);
let lastAnimationTime = performance.now();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let damageTimer: ReturnType<typeof setTimeout> | undefined;
let introTimer: ReturnType<typeof setTimeout> | undefined;

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

function humanReplay(): PartitionReplay {
  return {
    version: 1,
    scenario: structuredClone(engine.scenario),
    ticks: structuredClone(liveReplayTicks),
    finalState: engine.snapshot(),
  };
}

function startHumanPlay(): void {
  liveStarted = true;
  playIntro.classList.add('leaving');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => {
    playIntro.classList.add('hidden');
    playIntro.classList.remove('leaving');
  }, 420);
  setImmersive(true);
}

function showHowToPlay(): void {
  liveStarted = false;
  engine.setInput({ direction: 'idle', draw: 'off' });
  keys.clear();
  drawing = false;
  clearTimeout(introTimer);
  playIntro.classList.remove('leaving');
  playIntro.classList.remove('hidden');
  setImmersive(false);
}

function showNotice(text: string, tone: 'normal' | 'error' = 'normal'): void {
  notice.textContent = text;
  notice.dataset.tone = tone;
  notice.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3000);
}

function showDamage(integrity: number): void {
  stage.classList.remove('damage-hit');
  void stage.offsetWidth;
  stage.classList.add('damage-hit');
  clearTimeout(damageTimer);
  damageTimer = setTimeout(() => stage.classList.remove('damage-hit'), 520);
  showNotice(`Trace severed · ${integrity} integrity remaining`, 'error');
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

function formatReplayTime(tick: number): string {
  const totalMs = Math.round((tick / loadedReplay.scenario.ticksPerSecond) * 1000);
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function replayEventTicks(): number[] {
  return [...new Set(allReplayEvents().map((event) => event.tick))].sort((a, b) => a - b);
}

function renderEventTrack(): void {
  eventTrack.replaceChildren();
  const finalTick = replayFrames.at(-1)!.state.tick;
  if (finalTick === 0) return;
  for (const tick of replayEventTicks()) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.style.left = `${(tick / finalTick) * 100}%`;
    marker.title = `Jump to event at tick ${tick}`;
    marker.setAttribute('aria-label', `Jump to replay event at tick ${tick}`);
    marker.addEventListener('click', () => {
      replayTransport.pause();
      seekReplay(replayTransport.seekTick(tick), true);
      syncReplayPlayButton();
    });
    eventTrack.append(marker);
  }
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
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.addEventListener('click', () => {
      replayTransport.pause();
      seekReplay(replayTransport.seekTick(event.tick), true);
      syncReplayPlayButton();
    });
    item.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.code === 'Enter' || keyEvent.code === 'Space') {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        item.click();
      }
    });
    eventList.append(item);
  }
}

function updateStats(state: PartitionState): void {
  const capture = `${Math.floor(state.capturedFraction * 100)}%`;
  const integrity = String(state.spark.integrity).padStart(2, '0');
  const tick = String(state.tick).padStart(4, '0');
  captureEl.textContent = capture;
  integrityEl.textContent = integrity;
  tickEl.textContent = tick;
  stageCaptureEl.textContent = capture;
  stageIntegrityEl.textContent = integrity;
  stageTickEl.textContent = tick;
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

function setImmersive(next: boolean): void {
  immersive = next;
  document.body.dataset.immersive = String(immersive);
  fitScreenButton.setAttribute('aria-pressed', String(immersive));
  fitScreenButton.setAttribute('aria-label', immersive ? 'Exit fitted game view' : 'Fit game field to screen');
  fitScreenButton.querySelector('span')!.textContent = immersive ? 'EXIT VIEW' : 'FIT SCREEN';
  if (immersive) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => canvas.focus({ preventScroll: true }));
  }
}

fitScreenButton.addEventListener('click', () => setImmersive(!immersive));

function updateReplayInspector(frame: PartitionReplayFrame): void {
  const state = frame.state;
  timeline.value = String(replayTransport.index);
  timelineCurrent.textContent = String(state.tick);
  timelineTime.textContent = formatReplayTime(state.tick);
  inputDirection.textContent = state.currentInput.direction;
  inputDraw.textContent = state.currentInput.draw;
  controllerVersion.textContent = `v${state.controllerVersion}`;
  renderEvents(state.tick);
}

function seekReplay(index: number, reflectInUrl = false): void {
  replayTransport.seekFrame(index);
  updateReplayInspector(replayTransport.current);
  if (reflectInUrl && mode === 'replay') {
    const queryParams = new URLSearchParams(location.search);
    queryParams.set('tick', String(replayTransport.current.state.tick));
    history.replaceState(null, '', `${location.pathname}?${queryParams}`);
  }
}

function syncReplayPlayButton(): void {
  const playing = replayTransport.isPlaying;
  playButton.dataset.playing = String(playing);
  playButton.querySelector('span')!.textContent = playing ? 'PAUSE' : 'PLAY';
  playButton.setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
}

function setReplayPlaying(playing: boolean): void {
  if (playing) replayTransport.play();
  else replayTransport.pause();
  updateReplayInspector(replayTransport.current);
  syncReplayPlayButton();
}

function installReplay(replay: PartitionReplay, name: string): void {
  const frames = replayPartitionFrames(replay);
  const retainedSpeed = replayTransport.speed;
  const retainedLoop = replayTransport.loop;
  loadedReplay = replay;
  replayFrames = frames;
  replayTransport = new ReplayTransport(frames, replay.scenario.ticksPerSecond);
  replayTransport.setSpeed(retainedSpeed);
  replayTransport.setLoop(retainedLoop);
  timeline.min = '0';
  timeline.max = String(frames.length - 1);
  timeline.value = '0';
  timelineEnd.textContent = String(frames.at(-1)!.state.tick);
  replayName.textContent = name;
  replayDetail.textContent = `${replay.scenario.name} · ${replay.scenario.ticksPerSecond} Hz · ${replay.scenario.anomalies.length} anomalies`;
  setReplayPlaying(false);
  loopButton.setAttribute('aria-pressed', String(replayTransport.loop));
  renderEventTrack();
  updateReplayInspector(frames[0]);
}

function jumpReplayEvent(direction: -1 | 1): void {
  const currentTick = replayTransport.current.state.tick;
  const ticks = replayEventTicks();
  const target = direction === 1
    ? ticks.find((tick) => tick > currentTick) ?? replayFrames.at(-1)!.state.tick
    : ticks.filter((tick) => tick < currentTick).at(-1) ?? 0;
  replayTransport.pause();
  seekReplay(replayTransport.seekTick(target), true);
  syncReplayPlayButton();
}

function setMode(nextMode: ViewMode): void {
  mode = nextMode;
  document.body.dataset.mode = mode;
  setImmersive(mode === 'live' && liveStarted);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  }
  const queryParams = new URLSearchParams(location.search);
  queryParams.set('mode', mode);
  queryParams.set('seed', String(seed));
  if (mode === 'replay') queryParams.set('tick', String(replayTransport.current.state.tick));
  else queryParams.delete('tick');
  history.replaceState(null, '', `${location.pathname}?${queryParams}`);
  if (mode === 'replay') updateReplayInspector(replayTransport.current);
}

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (event.code === 'Escape' && immersive) {
    event.preventDefault();
    setImmersive(false);
    return;
  }
  if (target?.matches('input, select')) return;
  if (target?.matches('button') && (event.code === 'Space' || event.code === 'Enter')) return;
  if (mode === 'replay') {
    switch (event.code) {
      case 'Space':
      case 'KeyK':
        event.preventDefault();
        setReplayPlaying(!replayTransport.isPlaying);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) jumpReplayEvent(-1);
        else {
          replayTransport.step(-1);
          seekReplay(replayTransport.index, true);
          syncReplayPlayButton();
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) jumpReplayEvent(1);
        else {
          replayTransport.step(1);
          seekReplay(replayTransport.index, true);
          syncReplayPlayButton();
        }
        break;
      case 'KeyJ':
        event.preventDefault();
        jumpReplayEvent(-1);
        break;
      case 'KeyL':
        event.preventDefault();
        jumpReplayEvent(1);
        break;
      case 'Home':
        event.preventDefault();
        setReplayPlaying(false);
        seekReplay(0, true);
        break;
      case 'End':
        event.preventDefault();
        setReplayPlaying(false);
        seekReplay(replayFrames.length - 1, true);
        break;
    }
    return;
  }
  if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  if (!liveStarted && (event.code.startsWith('Arrow') || event.code === 'Space')) startHumanPlay();
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
    if (!liveStarted) startHumanPlay();
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
  if (!liveStarted) startHumanPlay();
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

startPlayButton.addEventListener('click', startHumanPlay);
howToPlayButton.addEventListener('click', showHowToPlay);
watchRunButton.addEventListener('click', () => {
  if (liveReplayTicks.length === 0) {
    showNotice('Start playing to create a replay', 'error');
    return;
  }
  installReplay(humanReplay(), `Your run · seed ${seed}`);
  setMode('replay');
  setReplayPlaying(true);
});

restartButton.addEventListener('click', () => {
  seed++;
  engine = new PartitionEngine(createClassicScenario(seed));
  direction = 'idle';
  drawing = false;
  touchDirection = 'idle';
  touchDrawing = false;
  keys.clear();
  liveReplayTicks = [];
  watchRunButton.disabled = true;
  startHumanPlay();
  setMode('live');
  showNotice(`New seeded field · ${seed}`);
});

playButton.addEventListener('click', () => {
  setReplayPlaying(!replayTransport.isPlaying);
});

query<HTMLButtonElement>('#step-back').addEventListener('click', () => {
  replayTransport.step(-1);
  seekReplay(replayTransport.index, true);
  syncReplayPlayButton();
});

query<HTMLButtonElement>('#step-forward').addEventListener('click', () => {
  replayTransport.step(1);
  seekReplay(replayTransport.index, true);
  syncReplayPlayButton();
});

query<HTMLButtonElement>('#previous-event').addEventListener('click', () => jumpReplayEvent(-1));
query<HTMLButtonElement>('#next-event').addEventListener('click', () => jumpReplayEvent(1));

timeline.addEventListener('input', () => {
  setReplayPlaying(false);
  seekReplay(Number(timeline.value), true);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  button.addEventListener('click', () => {
    replayTransport.setSpeed(Number(button.dataset.speed));
    for (const speedButton of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
      speedButton.setAttribute('aria-pressed', String(speedButton === button));
    }
  });
}

loopButton.addEventListener('click', () => {
  replayTransport.setLoop(!replayTransport.loop);
  loopButton.setAttribute('aria-pressed', String(replayTransport.loop));
});

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
  if (mode === 'live' && liveStarted && engine.snapshot().status === 'running') {
    engine.setInput(currentInput());
    const applied = engine.snapshot();
    const result = engine.step();
    liveReplayTicks.push({
      tick: result.state.tick,
      input: { ...applied.currentInput },
      controllerVersion: applied.controllerVersion,
      controlEvents: [],
      events: structuredClone(result.events),
    });
    const traceHit = result.events.find((event) => event.type === 'trace_hit');
    if (traceHit?.type === 'trace_hit') showDamage(traceHit.integrity);
    watchRunButton.disabled = false;
  }
}, 1000 / engine.scenario.ticksPerSecond);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && replayTransport.isPlaying) setReplayPlaying(false);
});

function frame(animationTime: number): void {
  if (mode === 'replay') {
    const advance = replayTransport.advance(animationTime - lastAnimationTime);
    if (advance.changed) updateReplayInspector(replayTransport.current);
    if (advance.reachedEnd) syncReplayPlayButton();
    const replayFrame = replayTransport.current;
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
if (liveStarted) playIntro.classList.add('hidden');
if (mode === 'replay' && params.get('autoplay') === '1') setReplayPlaying(true);
void loadReplayFromUrl();
requestAnimationFrame(frame);

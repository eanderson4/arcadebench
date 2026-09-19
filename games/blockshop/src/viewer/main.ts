import {
  HEAVY_DURATION,
  SLOW_DURATION,
  TICKS_PER_SECOND,
  WIDE_DURATION,
} from '../core/constants';
import { BlockshopEngine } from '../core/engine';
import type { BlockshopInput, BlockshopState, PowerKind } from '../core/types';
import { BLOCKSHOP_STAGES } from '../levels';
import { BlockshopAudio } from './audio';
import { BlockshopRenderer, POWER_COLOR, POWER_LABEL } from './renderer';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const previewCanvas = element<HTMLCanvasElement>('preview-canvas');
const gameCanvas = element<HTMLCanvasElement>('game-canvas');
const previewRenderer = new BlockshopRenderer(previewCanvas);
const renderer = new BlockshopRenderer(gameCanvas);
const audio = new BlockshopAudio();

const startButton = element<HTMLButtonElement>('start-button');
const soundToggle = element<HTMLButtonElement>('sound-toggle');
const leaveButton = element<HTMLButtonElement>('leave-button');
const pauseButton = element<HTMLButtonElement>('pause-button');
const readyOverlay = element<HTMLElement>('ready-overlay');
const readyButton = element<HTMLButtonElement>('ready-button');
const pauseOverlay = element<HTMLElement>('pause-overlay');
const resumeButton = element<HTMLButtonElement>('resume-button');
const pauseLeaveButton = element<HTMLButtonElement>('pause-leave-button');
const resultOverlay = element<HTMLElement>('result-overlay');
const resultButton = element<HTMLButtonElement>('result-button');
const resultHomeButton = element<HTMLButtonElement>('result-home-button');

let engine: BlockshopEngine | null = null;
let stageIndex = 0;
let runScore = 0;
let runLives = 3;
let activeRun = false;
let paused = false;
let resultMode: 'stage' | 'lost' | 'complete' = 'stage';
let resultShown = false;
let leftHeld = false;
let rightHeld = false;
let actionHeld = false;
let actionQueued = false;

function setScreen(screen: 'home' | 'play'): void {
  document.body.dataset.screen = screen;
  if (screen === 'home') element<HTMLElement>('home-title').focus();
}

function formatScore(score: number): string {
  return Math.max(0, score).toString().padStart(6, '0');
}

function updateHud(state: BlockshopState): void {
  const stage = BLOCKSHOP_STAGES[stageIndex]!;
  element('stage-number').textContent = `RACK ${String(stage.number).padStart(2, '0')} / ${String(BLOCKSHOP_STAGES.length).padStart(2, '0')}`;
  element('stage-title').textContent = stage.title;
  element('score').textContent = formatScore(state.score);
  element('combo').textContent = `×${state.combo}`;
  const lives = element('lives');
  lives.textContent = '';
  lives.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'ball' : 'balls'}`);
  for (let index = 0; index < state.lives; index++) {
    const pip = document.createElement('i');
    pip.className = 'ball-pip';
    lives.append(pip);
  }
  element('blocks-left').textContent = `${state.blocksRemaining} ${state.blocksRemaining === 1 ? 'BLOCK' : 'BLOCKS'}`;
  const initial = stage.bricks.filter((brick) => brick.material !== 'steel').length;
  const progress = initial === 0 ? 100 : ((initial - state.blocksRemaining) / initial) * 100;
  element<HTMLElement>('progress-bar').style.width = `${progress}%`;
  updatePowerBoard(state);
}

function updatePowerBoard(state: BlockshopState): void {
  const board = element('active-powers');
  const powers: Array<{ kind: PowerKind; label: string; fill: number }> = [];
  if (state.wideTicks > 0) powers.push({ kind: 'wide', label: POWER_LABEL.wide, fill: state.wideTicks / WIDE_DURATION });
  if (state.slowTicks > 0) powers.push({ kind: 'slow', label: POWER_LABEL.slow, fill: state.slowTicks / SLOW_DURATION });
  if (state.heavyTicks > 0) powers.push({ kind: 'heavy', label: POWER_LABEL.heavy, fill: state.heavyTicks / HEAVY_DURATION });
  if (state.stickyCharges > 0) powers.push({ kind: 'sticky', label: `${POWER_LABEL.sticky} ×${state.stickyCharges}`, fill: state.stickyCharges / 2 });
  if (state.balls.length > 1) powers.push({ kind: 'multi', label: `${state.balls.length} BALLS LIVE`, fill: 1 });
  if (powers.length === 0) {
    board.innerHTML = '<p class="empty-tools">Catch a labeled tag<br />to put it to work.</p>';
    return;
  }
  board.replaceChildren(...powers.map((power) => {
    const meter = document.createElement('div');
    meter.className = 'power-meter';
    meter.style.setProperty('--color', POWER_COLOR[power.kind]);
    meter.style.setProperty('--fill', `${Math.max(0, Math.min(100, power.fill * 100))}%`);
    const title = document.createElement('b');
    title.textContent = power.label;
    const track = document.createElement('i');
    track.append(document.createElement('span'));
    meter.append(title, track);
    return meter;
  }));
}

function prepareStage(index: number): void {
  stageIndex = index;
  const stage = BLOCKSHOP_STAGES[stageIndex]!;
  engine = new BlockshopEngine(stage, { score: runScore, lives: runLives });
  resultShown = false;
  paused = false;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  readyOverlay.hidden = false;
  element('ready-number').textContent = `Rack ${String(stage.number).padStart(2, '0')} of ${String(BLOCKSHOP_STAGES.length).padStart(2, '0')}`;
  element('ready-title').textContent = stage.title;
  element('ready-lesson').textContent = stage.lesson;
  updateHud(engine.snapshot());
  renderer.draw(engine.snapshot(), stage);
  requestAnimationFrame(() => readyButton.focus());
}

function startRun(): void {
  audio.unlock();
  activeRun = true;
  runScore = 0;
  runLives = 3;
  setScreen('play');
  prepareStage(0);
}

function startStage(): void {
  audio.unlock();
  readyOverlay.hidden = true;
  actionHeld = false;
  actionQueued = false;
  gameCanvas.focus();
}

function showResult(state: BlockshopState): void {
  if (resultShown) return;
  resultShown = true;
  runScore = state.score;
  runLives = state.lives;
  resultOverlay.hidden = false;
  element('result-score').textContent = formatScore(state.score);
  element('result-combo').textContent = `×${state.bestCombo}`;
  element('result-lives').textContent = String(state.lives);

  if (state.status === 'won' && stageIndex < BLOCKSHOP_STAGES.length - 1) {
    resultMode = 'stage';
    element('result-kicker').textContent = `Rack ${stageIndex + 1} cleared`;
    element('result-title').textContent = 'Clean work.';
    element('result-copy').textContent = 'Score and remaining balls carry into the next rack.';
    resultButton.querySelector('span')!.textContent = 'NEXT RACK';
  } else if (state.status === 'won') {
    resultMode = 'complete';
    activeRun = false;
    saveBest(state.score);
    element('result-kicker').textContent = 'All eight racks cleared';
    element('result-title').textContent = 'Shop closed.';
    element('result-copy').textContent = `Final score ${formatScore(state.score)}. Every tool is back on the wall.`;
    resultButton.querySelector('span')!.textContent = 'PLAY AGAIN';
  } else {
    resultMode = 'lost';
    activeRun = false;
    saveBest(state.score);
    element('result-kicker').textContent = `Reached rack ${stageIndex + 1}`;
    element('result-title').textContent = 'Bearing lost.';
    element('result-copy').textContent = `The rack keeps its shape. Your best local score is ${formatScore(readBest())}.`;
    resultButton.querySelector('span')!.textContent = 'TRY AGAIN';
  }
  requestAnimationFrame(() => resultButton.focus());
}

function saveBest(score: number): void {
  try {
    localStorage.setItem('arcadebench.blockshop.best', String(Math.max(score, readBest())));
  } catch {
    // Local score history is optional.
  }
}

function readBest(): number {
  try {
    const value = Number(localStorage.getItem('arcadebench.blockshop.best') ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function returnHome(force = false): void {
  if (!force && activeRun && !confirm('Leave this run? Its current score has not been finished.')) return;
  activeRun = false;
  paused = false;
  engine = null;
  readyOverlay.hidden = true;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  setScreen('home');
}

function togglePause(force?: boolean): void {
  if (!engine || !readyOverlay.hidden || !resultOverlay.hidden) return;
  paused = force ?? !paused;
  pauseOverlay.hidden = !paused;
  if (paused) requestAnimationFrame(() => resumeButton.focus());
  else gameCanvas.focus();
}

startButton.addEventListener('click', startRun);
readyButton.addEventListener('click', startStage);
pauseButton.addEventListener('click', () => togglePause());
resumeButton.addEventListener('click', () => togglePause(false));
leaveButton.addEventListener('click', () => {
  if (activeRun && !confirm('Leave this run? Its current score has not been finished.')) return;
  location.assign('/');
});
pauseLeaveButton.addEventListener('click', () => returnHome());
resultHomeButton.addEventListener('click', () => returnHome(true));
resultButton.addEventListener('click', () => {
  if (resultMode === 'stage') prepareStage(stageIndex + 1);
  else startRun();
});

soundToggle.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  soundToggle.setAttribute('aria-pressed', String(audio.enabled));
  soundToggle.textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
  if (audio.enabled) audio.unlock();
});

function isActionKey(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.code === 'Enter';
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') leftHeld = true;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') rightHeld = true;
  if (isActionKey(event)) {
    actionHeld = true;
    if (!event.repeat) actionQueued = true;
  }
  if (event.code.startsWith('Arrow') || isActionKey(event)) event.preventDefault();

  if (event.repeat) return;
  if ((event.code === 'KeyP' || event.code === 'Escape') && document.body.dataset.screen === 'play') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (document.body.dataset.screen === 'home' && isActionKey(event)) startRun();
  else if (!readyOverlay.hidden && isActionKey(event)) startStage();
  else if (!pauseOverlay.hidden && isActionKey(event)) togglePause(false);
  else if (!resultOverlay.hidden && isActionKey(event)) resultButton.click();
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') leftHeld = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') rightHeld = false;
  if (isActionKey(event)) actionHeld = false;
});

window.addEventListener('blur', () => {
  leftHeld = false;
  rightHeld = false;
  actionHeld = false;
  actionQueued = false;
  if (activeRun && readyOverlay.hidden && resultOverlay.hidden) togglePause(true);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
  const control = button.dataset.control;
  const apply = (pressed: boolean): void => {
    if (control === 'left') leftHeld = pressed;
    if (control === 'right') rightHeld = pressed;
    if (control === 'action') {
      actionHeld = pressed;
      if (pressed) actionQueued = true;
    }
    if (pressed) audio.unlock();
  };
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); apply(true); });
  button.addEventListener('pointerup', () => apply(false));
  button.addEventListener('pointercancel', () => apply(false));
}

window.addEventListener('beforeunload', (event) => {
  if (!activeRun) return;
  event.preventDefault();
});

let previewEngine = new BlockshopEngine(BLOCKSHOP_STAGES[3]!);
previewEngine.step({ move: 0, action: true });
let previewAccumulator = 0;
let previousFrame = performance.now();
let gameAccumulator = 0;

function inputSnapshot(): BlockshopInput {
  const action = actionHeld || actionQueued;
  actionQueued = false;
  return {
    move: leftHeld === rightHeld ? 0 : leftHeld ? -1 : 1,
    action,
  };
}

function frame(now: number): void {
  const delta = Math.min(100, now - previousFrame);
  previousFrame = now;
  previewAccumulator += delta;
  gameAccumulator += delta;
  const tickMs = 1000 / TICKS_PER_SECOND;

  while (previewAccumulator >= tickMs) {
    const state = previewEngine.snapshot();
    const target = state.balls.find((ball) => ball.vy > 0) ?? state.balls[0];
    const move: -1 | 0 | 1 = !target ? 0 : target.x < state.paddleX - 12 ? -1 : target.x > state.paddleX + 12 ? 1 : 0;
    const result = previewEngine.step({ move, action: state.balls.some((ball) => ball.stuck) });
    previewRenderer.notify(result.events, result.state);
    if (result.state.status === 'won' || result.state.status === 'lost') {
      previewEngine = new BlockshopEngine(BLOCKSHOP_STAGES[3]!);
      previewEngine.step({ move: 0, action: true });
    }
    previewAccumulator -= tickMs;
  }
  previewRenderer.draw(previewEngine.snapshot(), BLOCKSHOP_STAGES[3]!, now);

  if (engine) {
    while (gameAccumulator >= tickMs) {
      if (!paused && readyOverlay.hidden && resultOverlay.hidden) {
        const result = engine.step(inputSnapshot());
        renderer.notify(result.events, result.state);
        audio.play(result.events);
        updateHud(result.state);
        if (result.state.status === 'won' || result.state.status === 'lost') showResult(result.state);
      }
      gameAccumulator -= tickMs;
    }
    renderer.draw(engine.snapshot(), BLOCKSHOP_STAGES[stageIndex]!, now);
  } else {
    gameAccumulator = 0;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

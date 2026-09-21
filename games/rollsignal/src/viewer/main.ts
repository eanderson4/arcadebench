import { TICKS_PER_SECOND, toWorldUnits } from '../core/constants';
import { RollSignalEngine } from '../core/engine';
import type { AxisInput, RollSignalCourse, RollSignalInput, RollSignalState } from '../core/types';
import { IDLE_INPUT } from '../core/types';
import { ROLLSIGNAL_COURSES } from '../levels';
import { RollSignalAudio } from './audio';
import { RollSignalRenderer } from './renderer';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const startButton = byId<HTMLButtonElement>('start-button');
const replayButton = byId<HTMLButtonElement>('replay-button');
const soundToggle = byId<HTMLButtonElement>('sound-toggle');
const leaveButton = byId<HTMLButtonElement>('leave-button');
const pauseButton = byId<HTMLButtonElement>('pause-button');
const resumeButton = byId<HTMLButtonElement>('resume-button');
const leaveDialog = byId<HTMLDialogElement>('leave-dialog');
const courseOverlay = byId<HTMLElement>('course-overlay');
const pauseOverlay = byId<HTMLElement>('pause-overlay');
const courseNumber = byId<HTMLElement>('course-number');
const courseTitle = byId<HTMLElement>('course-title');
const courseOverlayNumber = byId<HTMLElement>('course-overlay-number');
const courseOverlayTitle = byId<HTMLElement>('course-overlay-title');
const courseOverlayLesson = byId<HTMLElement>('course-overlay-lesson');
const timeLabel = byId<HTMLElement>('time');
const scoreLabel = byId<HTMLElement>('score');
const ringsLabel = byId<HTMLElement>('rings');
const statusLine = byId<HTMLElement>('status-line');
const checkpointLabel = byId<HTMLElement>('checkpoint-label');
const braceMeter = document.querySelector<HTMLElement>('.brace-meter')!;
const resultKicker = byId<HTMLElement>('result-kicker');
const resultTitle = byId<HTMLElement>('result-title');
const resultCopy = byId<HTMLElement>('result-copy');
const resultCourses = byId<HTMLElement>('result-courses');
const resultRings = byId<HTMLElement>('result-rings');
const resultScore = byId<HTMLElement>('result-score');
const announcer = byId<HTMLElement>('announcer');
const gameCanvas = byId<HTMLCanvasElement>('game-canvas');
const previewCanvas = byId<HTMLCanvasElement>('preview-canvas');
const resultCanvas = byId<HTMLCanvasElement>('result-canvas');

const renderer = new RollSignalRenderer(gameCanvas);
const previewRenderer = new RollSignalRenderer(previewCanvas);
const resultRenderer = new RollSignalRenderer(resultCanvas);
const audio = new RollSignalAudio();

type Screen = 'home' | 'play' | 'result';
type PlayMode = 'intro' | 'playing' | 'paused' | 'terminal';

const keys = new Set<string>();
const touchDirections = new Set<string>();
let touchBrace = false;
let screen: Screen = 'home';
let playMode: PlayMode = 'intro';
let engine = new RollSignalEngine(ROLLSIGNAL_COURSES[0]!);
let courseIndex = 0;
let runScore = 0;
let runRings = 0;
let coursesCleared = 0;
let terminalHandled = false;
let soundEnabled = true;
let gamepadPauseHeld = false;
let gamepadActionHeld = false;
let lastFrame = performance.now();
let accumulator = 0;

const previewCourse = ROLLSIGNAL_COURSES[Math.min(3, ROLLSIGNAL_COURSES.length - 1)]!;
let previewEngine = new RollSignalEngine(previewCourse);
let previewWaypoint = 1;
let previewAccumulator = 0;

function setScreen(next: Screen): void {
  screen = next;
  document.body.dataset.screen = next;
  if (next === 'home') byId<HTMLElement>('home-title').focus({ preventScroll: true });
  if (next === 'play') gameCanvas.focus({ preventScroll: true });
}

function formatScore(value: number): string {
  return Math.max(0, Math.round(value)).toString().padStart(6, '0');
}

function formatTime(ticks: number): string {
  const seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function announce(message: string): void {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = message; });
}

function currentCourse(): RollSignalCourse {
  return ROLLSIGNAL_COURSES[courseIndex]!;
}

function resetControls(): void {
  keys.clear();
  touchDirections.clear();
  touchBrace = false;
  braceMeter.classList.remove('is-active');
}

function newRun(): void {
  courseIndex = 0;
  runScore = 0;
  runRings = 0;
  coursesCleared = 0;
  loadCourse(0);
  setScreen('play');
}

function loadCourse(index: number): void {
  courseIndex = index;
  const course = currentCourse();
  engine = new RollSignalEngine(course);
  playMode = 'intro';
  terminalHandled = false;
  resetControls();
  courseNumber.textContent = `COURSE ${String(course.number).padStart(2, '0')} / ${String(ROLLSIGNAL_COURSES.length).padStart(2, '0')}`;
  courseTitle.textContent = course.name;
  courseOverlayNumber.textContent = `Course ${String(course.number).padStart(2, '0')} of ${String(ROLLSIGNAL_COURSES.length).padStart(2, '0')}`;
  courseOverlayTitle.textContent = course.name;
  courseOverlayLesson.textContent = course.tagline;
  courseOverlay.hidden = false;
  pauseOverlay.hidden = true;
  updateHud(engine.snapshot());
  renderer.draw(engine.snapshot(), course);
  announce(`${course.name}. ${course.tagline}. Press Action to roll.`);
}

function startCourse(): void {
  if (screen !== 'play' || playMode !== 'intro') return;
  void audio.unlock();
  audio.ui();
  courseOverlay.hidden = true;
  playMode = 'playing';
  gameCanvas.focus({ preventScroll: true });
  announce(`${currentCourse().name} started.`);
}

function togglePause(force?: boolean): void {
  if (screen !== 'play' || playMode === 'intro' || playMode === 'terminal') return;
  const shouldPause = force ?? playMode !== 'paused';
  playMode = shouldPause ? 'paused' : 'playing';
  pauseOverlay.hidden = !shouldPause;
  pauseButton.textContent = shouldPause ? 'RESUME' : 'PAUSE';
  resetControls();
  if (!shouldPause) gameCanvas.focus({ preventScroll: true });
  announce(shouldPause ? 'Paused.' : 'Course resumed.');
}

function axis(negative: boolean, positive: boolean): AxisInput {
  return negative === positive ? 0 : positive ? 1 : -1;
}

function digitalScreenInput(): { x: AxisInput; y: AxisInput; brace: boolean } {
  const left = keys.has('arrowleft') || keys.has('a') || touchDirections.has('left');
  const right = keys.has('arrowright') || keys.has('d') || touchDirections.has('right');
  const up = keys.has('arrowup') || keys.has('w') || touchDirections.has('up');
  const down = keys.has('arrowdown') || keys.has('s') || touchDirections.has('down');
  return {
    x: axis(left, right),
    y: axis(up, down),
    brace: keys.has(' ') || keys.has('enter') || touchBrace,
  };
}

function gamepadInput(): { x: AxisInput; y: AxisInput; brace: boolean } {
  const pad = Array.from(navigator.getGamepads?.() ?? []).find((candidate) => candidate?.connected);
  if (!pad) return { x: 0, y: 0, brace: false };
  const horizontal = (pad.axes[0] ?? 0) + (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
  const vertical = (pad.axes[1] ?? 0) + (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
  return {
    x: Math.abs(horizontal) < .34 ? 0 : horizontal > 0 ? 1 : -1,
    y: Math.abs(vertical) < .34 ? 0 : vertical > 0 ? 1 : -1,
    brace: Boolean(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed),
  };
}

function pollGamepadActions(): void {
  const pad = Array.from(navigator.getGamepads?.() ?? []).find((candidate) => candidate?.connected);
  const actionPressed = Boolean(pad?.buttons[0]?.pressed || pad?.buttons[1]?.pressed);
  const pausePressed = Boolean(pad?.buttons[9]?.pressed);
  if (actionPressed && !gamepadActionHeld && (screen !== 'play' || playMode === 'intro')) {
    void audio.unlock();
    activatePrimaryAction();
  }
  if (pausePressed && !gamepadPauseHeld && screen === 'play' && playMode !== 'intro') togglePause();
  gamepadActionHeld = actionPressed;
  gamepadPauseHeld = pausePressed;
}

function currentInput(): RollSignalInput {
  const digital = digitalScreenInput();
  const pad = gamepadInput();
  const screenX = digital.x || pad.x;
  const screenY = digital.y || pad.y;
  // The isometric camera never rotates. Convert familiar screen directions to
  // the course's two world axes before recording the deterministic input.
  return {
    steerX: Math.max(-1, Math.min(1, screenY + screenX)) as AxisInput,
    steerY: Math.max(-1, Math.min(1, screenY - screenX)) as AxisInput,
    brace: digital.brace || pad.brace,
  };
}

function updateHud(state: RollSignalState): void {
  timeLabel.textContent = formatTime(state.timeRemainingTicks);
  scoreLabel.textContent = formatScore(runScore + state.score);
  ringsLabel.textContent = `${state.ringsCollected.length} / ${currentCourse().rings.length}`;
  braceMeter.classList.toggle('is-active', state.currentInput.brace);
  const checkpoint = currentCourse().checkpoints.find((candidate) => candidate.id === state.checkpointId);
  checkpointLabel.innerHTML = `<b>CHECKPOINT</b> ${checkpoint ? checkpoint.id.replaceAll('-', ' ') : 'Start relay'}`;
  if (!state.onDeck) statusLine.textContent = 'SIGNAL RECOVERING';
  else if (state.currentInput.brace) statusLine.textContent = 'BRACE ENGAGED';
  else if (state.surface === 'slick') statusLine.textContent = 'LOW TRACTION';
  else statusLine.textContent = 'SIGNAL STABLE';
  timeLabel.parentElement?.classList.toggle('is-urgent', state.timeRemainingTicks <= 10 * TICKS_PER_SECOND);
}

function stepGame(): void {
  if (playMode !== 'playing') return;
  const input = currentInput();
  const result = engine.step(input);
  renderer.notify(result.events, result.state);
  audio.notify(result.events);
  updateHud(result.state);
  for (const event of result.events) {
    if (event.type === 'tone_ring') announce('Tone ring collected.');
    if (event.type === 'checkpoint_reached') announce('Checkpoint reached.');
    if (event.type === 'relay_pad') announce('Relay charged.');
    if (event.type === 'fell') announce('Signal lost. Returning to checkpoint.');
  }
  if (result.state.status !== 'running') finishCourse(result.state);
}

function finishCourse(state: RollSignalState): void {
  if (terminalHandled) return;
  terminalHandled = true;
  playMode = 'terminal';
  resetControls();
  if (state.status === 'won') {
    runScore += state.score;
    runRings += state.ringsCollected.length;
    coursesCleared += 1;
    announce(`${currentCourse().name} complete.`);
    window.setTimeout(() => {
      if (courseIndex + 1 < ROLLSIGNAL_COURSES.length) loadCourse(courseIndex + 1);
      else showResult(true, state);
    }, 850);
  } else {
    runScore += state.score;
    runRings += state.ringsCollected.length;
    announce('Time expired. Run over.');
    window.setTimeout(() => showResult(false, state), 700);
  }
}

function showResult(won: boolean, finalState: RollSignalState): void {
  const totalScore = runScore;
  resultKicker.textContent = won ? 'All receivers answered' : 'Signal interrupted';
  resultTitle.textContent = won ? 'Signal delivered.' : 'Line went quiet.';
  resultCopy.textContent = won
    ? 'Eight machines carried the light from the first chime to the crown.'
    : `${currentCourse().name} held the line. A cleaner route will carry it farther.`;
  resultCourses.textContent = `${coursesCleared} / ${ROLLSIGNAL_COURSES.length}`;
  resultRings.textContent = `${runRings} / ${ROLLSIGNAL_COURSES.reduce((sum, course) => sum + course.rings.length, 0)}`;
  resultScore.textContent = formatScore(totalScore);
  resultRenderer.draw(finalState, currentCourse());
  setScreen('result');
  replayButton.focus({ preventScroll: true });
}

function previewInput(state: RollSignalState): RollSignalInput {
  const waypoints = previewCourse.referenceWaypoints;
  if (waypoints.length < 2) return IDLE_INPUT;
  const target = waypoints[Math.min(previewWaypoint, waypoints.length - 1)]!;
  const x = toWorldUnits(state.position.x);
  const y = toWorldUnits(state.position.y);
  const dx = target.x - x;
  const dy = target.y - y;
  if (Math.hypot(dx, dy) < 1.2 && previewWaypoint < waypoints.length - 1) previewWaypoint += 1;
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  return {
    steerX: Math.abs(dx) < .28 ? 0 : dx > 0 ? 1 : -1,
    steerY: Math.abs(dy) < .28 ? 0 : dy > 0 ? 1 : -1,
    brace: speed > 130 || Math.hypot(dx, dy) < 1.8,
  };
}

function stepPreview(): void {
  const state = previewEngine.snapshot();
  const result = previewEngine.step(previewInput(state));
  previewRenderer.notify(result.events, result.state);
  if (result.state.status !== 'running' || result.state.falls > 2) {
    previewEngine = new RollSignalEngine(previewCourse);
    previewWaypoint = 1;
  }
}

function frame(now: number): void {
  const delta = Math.min(100, now - lastFrame);
  lastFrame = now;
  pollGamepadActions();
  const tickMs = 1000 / TICKS_PER_SECOND;
  if (screen === 'play' && playMode === 'playing') {
    accumulator += delta;
    for (let steps = 0; accumulator >= tickMs && steps < 6; steps += 1) {
      stepGame();
      accumulator -= tickMs;
    }
  } else {
    accumulator = 0;
  }
  if (screen === 'home') {
    previewAccumulator += delta;
    for (let steps = 0; previewAccumulator >= tickMs && steps < 6; steps += 1) {
      stepPreview();
      previewAccumulator -= tickMs;
    }
    previewRenderer.draw(previewEngine.snapshot(), previewCourse, now);
  }
  if (screen === 'play') renderer.draw(engine.snapshot(), currentCourse(), now);
  requestAnimationFrame(frame);
}

function activatePrimaryAction(): void {
  if (screen === 'home') newRun();
  else if (screen === 'play' && playMode === 'intro') startCourse();
  else if (screen === 'result') newRun();
}

function keyName(event: KeyboardEvent): string {
  return event.key === ' ' ? ' ' : event.key.toLowerCase();
}

window.addEventListener('keydown', (event) => {
  const key = keyName(event);
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'enter', 'p', 'escape', 'w', 'a', 's', 'd'].includes(key)) event.preventDefault();
  if ((key === ' ' || key === 'enter') && !event.repeat && (screen !== 'play' || playMode === 'intro')) activatePrimaryAction();
  if ((key === 'p' || key === 'escape') && !event.repeat && screen === 'play' && playMode !== 'intro') togglePause();
  keys.add(key);
});
window.addEventListener('keyup', (event) => keys.delete(keyName(event)));
window.addEventListener('blur', resetControls);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play' && playMode === 'playing') togglePause(true);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
  const direction = button.dataset.direction!;
  const press = (event: PointerEvent): void => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touchDirections.add(direction);
  };
  const release = (event: PointerEvent): void => {
    event.preventDefault();
    touchDirections.delete(direction);
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', () => touchDirections.delete(direction));
}

const touchBraceButton = byId<HTMLButtonElement>('touch-brace');
touchBraceButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  touchBraceButton.setPointerCapture(event.pointerId);
  touchBrace = true;
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  touchBraceButton.addEventListener(eventName, () => { touchBrace = false; });
}

startButton.addEventListener('click', () => { void audio.unlock(); newRun(); });
replayButton.addEventListener('click', () => { void audio.unlock(); newRun(); });
pauseButton.addEventListener('click', () => togglePause());
resumeButton.addEventListener('click', () => togglePause(false));
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  audio.setEnabled(soundEnabled);
  if (soundEnabled) void audio.unlock();
  soundToggle.textContent = soundEnabled ? 'SOUND ON' : 'SOUND OFF';
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
});
leaveButton.addEventListener('click', () => {
  if (playMode === 'terminal') window.location.assign('/');
  else {
    if (playMode === 'playing') togglePause(true);
    leaveDialog.showModal();
  }
});
leaveDialog.addEventListener('close', () => {
  if (leaveDialog.returnValue === 'leave') window.location.assign('/');
});
window.addEventListener('beforeunload', (event) => {
  if (screen === 'play' && (playMode === 'playing' || playMode === 'paused')) event.preventDefault();
});

previewRenderer.draw(previewEngine.snapshot(), previewCourse);
requestAnimationFrame(frame);

import { FIXED_SCALE, PartitionEngine } from '../core/engine';
import { createClassicScenario } from '../core/scenarios';
import type { ControlInput, Direction, PartitionState } from '../core/types';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const context = canvas.getContext('2d')!;
const captureEl = document.querySelector<HTMLElement>('#capture')!;
const integrityEl = document.querySelector<HTMLElement>('#integrity')!;
const tickEl = document.querySelector<HTMLElement>('#tick')!;
const messageEl = document.querySelector<HTMLElement>('#message')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!;

let seed = Number(new URLSearchParams(location.search).get('seed') ?? 11);
let engine = new PartitionEngine(createClassicScenario(seed));
let direction: Direction = 'idle';
let drawing = false;
let touchDirection: Direction = 'idle';
let touchDrawing = false;
const keys = new Set<string>();

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

window.addEventListener('keydown', (event) => {
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

const traceButton = document.querySelector<HTMLButtonElement>('[data-trace]')!;
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

restartButton.addEventListener('click', () => {
  seed++;
  engine = new PartitionEngine(createClassicScenario(seed));
  direction = 'idle';
  drawing = false;
  touchDirection = 'idle';
  touchDrawing = false;
  messageEl.classList.add('hidden');
});

function render(state: PartitionState): void {
  const sx = canvas.width / state.width;
  const sy = canvas.height / state.height;
  context.fillStyle = '#070b12';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(73, 150, 174, 0.08)';
  context.lineWidth = 1;
  for (let x = 1; x < state.width; x++) {
    context.beginPath();
    context.moveTo(x * sx, 0);
    context.lineTo(x * sx, canvas.height);
    context.stroke();
  }
  for (let y = 1; y < state.height; y++) {
    context.beginPath();
    context.moveTo(0, y * sy);
    context.lineTo(canvas.width, y * sy);
    context.stroke();
  }

  context.fillStyle = 'rgba(37, 205, 214, 0.13)';
  for (const cell of state.stabilizedCells) {
    const x = cell % state.width;
    const y = Math.floor(cell / state.width);
    context.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
  }

  context.lineCap = 'round';
  context.strokeStyle = '#42dce8';
  context.shadowColor = '#42dce8';
  context.shadowBlur = 8;
  context.lineWidth = 2;
  for (const edge of state.walls) {
    context.beginPath();
    context.moveTo(edge.ax * sx, edge.ay * sy);
    context.lineTo(edge.bx * sx, edge.by * sy);
    context.stroke();
  }

  context.strokeStyle = '#ffd35a';
  context.shadowColor = '#ffd35a';
  context.shadowBlur = 14;
  context.lineWidth = 3;
  for (const edge of state.trace) {
    context.beginPath();
    context.moveTo(edge.ax * sx, edge.ay * sy);
    context.lineTo(edge.bx * sx, edge.by * sy);
    context.stroke();
  }

  const pulse = 5 + Math.sin(state.tick * 0.28) * 1.5;
  for (const anomaly of state.anomalies) {
    const x = (anomaly.position.x / FIXED_SCALE) * sx;
    const y = (anomaly.position.y / FIXED_SCALE) * sy;
    context.fillStyle = '#ff4f9a';
    context.shadowColor = '#ff267f';
    context.shadowBlur = 22;
    context.beginPath();
    context.arc(x, y, pulse, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255, 168, 205, 0.7)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, pulse + 5, state.tick * 0.04, state.tick * 0.04 + Math.PI * 1.25);
    context.stroke();
  }

  const px = state.spark.position.x * sx;
  const py = state.spark.position.y * sy;
  context.fillStyle = state.spark.drawing ? '#fff0a6' : '#d9fcff';
  context.shadowColor = state.spark.drawing ? '#ffd35a' : '#77efff';
  context.shadowBlur = 22;
  context.beginPath();
  context.moveTo(px, py - 7);
  context.lineTo(px + 7, py);
  context.lineTo(px, py + 7);
  context.lineTo(px - 7, py);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;

  captureEl.textContent = `${Math.floor(state.capturedFraction * 100)}%`;
  integrityEl.textContent = String(state.spark.integrity);
  tickEl.textContent = String(state.tick);
  if (state.status !== 'running') {
    messageEl.textContent = state.status === 'won' ? 'FIELD STABILIZED' : 'SIGNAL LOST';
    messageEl.classList.remove('hidden');
  }
}

setInterval(() => {
  if (engine.snapshot().status === 'running') {
    engine.setInput(currentInput());
    engine.step();
  }
}, 1000 / engine.scenario.ticksPerSecond);

function frame(): void {
  render(engine.snapshot());
  requestAnimationFrame(frame);
}
frame();

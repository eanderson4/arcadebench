import { MALTLINE_CAMPAIGN } from '../core/campaign';
import { MaltlineEngine } from '../core/engine';
import { replayMaltline } from '../core/replay';
import type { MaltlineInput, MaltlineReplay, RunContext } from '../core/types';
import { MaltlineRenderer } from './renderer';

type Screen = 'title' | 'playing' | 'cleared' | 'gameover' | 'victory';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
const renderer = new MaltlineRenderer();
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const overlayTitle = document.querySelector<HTMLElement>('#overlay-title')!;
const overlayBody = document.querySelector<HTMLElement>('#overlay-body')!;
const overlayHint = document.querySelector<HTMLElement>('#overlay-hint')!;

let screen: Screen = 'title';
let stageIndex = 0;
let engine = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!);
let stageInputs: MaltlineInput[] = [];
let stageRunStart: RunContext = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
let carriedRun: RunContext = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
const stageReplays: MaltlineReplay[] = [];
// Deterministic replays of finished stages, handy while tuning gameplay and
// the seed for the future benchmark plugin.
declare global {
  interface Window {
    __maltlineReplays?: MaltlineReplay[];
  }
}
window.__maltlineReplays = stageReplays;
let advanceTimer: ReturnType<typeof setTimeout> | undefined;

const held = new Set<string>();

function inputFromKeys(): MaltlineInput {
  return {
    stationDir: held.has('ArrowLeft') || held.has('KeyA')
      ? held.has('ArrowRight') || held.has('KeyD') ? 0 : -1
      : held.has('ArrowRight') || held.has('KeyD') ? 1 : 0,
    laneDir: held.has('ArrowUp') || held.has('KeyW')
      ? held.has('ArrowDown') || held.has('KeyS') ? 0 : -1
      : held.has('ArrowDown') || held.has('KeyS') ? 1 : 0,
    blend: held.has('Space'),
    serve: held.has('KeyF') || held.has('Enter'),
  };
}

function showOverlay(title: string, body: string, hint: string): void {
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  overlayHint.textContent = hint;
  overlay.classList.remove('hidden');
}

function hideOverlay(): void {
  overlay.classList.add('hidden');
}

function beginStage(index: number, run: RunContext): void {
  stageIndex = index;
  const scenario = MALTLINE_CAMPAIGN[index]!;
  const startRunContext = index === 0 ? { lives: scenario.lives, score: 0 } : run;
  stageRunStart = startRunContext;
  engine = new MaltlineEngine(scenario, startRunContext);
  renderer.setScenario(scenario);
  stageInputs = [];
}

function recordStageReplay(): void {
  if (stageInputs.length === 0) return;
  stageReplays.push(replayMaltline(engine.scenario, stageRunStart, stageInputs));
}

function startRun(): void {
  if (advanceTimer !== undefined) clearTimeout(advanceTimer);
  carriedRun = { lives: MALTLINE_CAMPAIGN[0]!.lives, score: 0 };
  beginStage(0, carriedRun);
  screen = 'playing';
  hideOverlay();
}

function finishStage(bonus: number): void {
  screen = 'cleared';
  recordStageReplay();
  const state = engine.snapshot();
  carriedRun = { lives: state.lives, score: state.score };
  showOverlay(
    'STAGE CLEAR',
    `Line served. Bonus +${bonus} — score ${state.score}, ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.`,
    'Next window opening…',
  );
  advanceTimer = setTimeout(() => {
    if (stageIndex + 1 >= MALTLINE_CAMPAIGN.length) {
      screen = 'victory';
      showOverlay('LAST CALL SURVIVED', `All ${MALTLINE_CAMPAIGN.length} stages cleared. Final score ${engine.snapshot().score}.`, 'Press R to run it again');
    } else {
      beginStage(stageIndex + 1, carriedRun);
      screen = 'playing';
      hideOverlay();
    }
  }, 2000);
}

function gameOver(): void {
  screen = 'gameover';
  recordStageReplay();
  const state = engine.snapshot();
  showOverlay(
    'SHOP CLOSED',
    `Final score ${state.score} — reached stage ${stageIndex + 1} of ${MALTLINE_CAMPAIGN.length} (${MALTLINE_CAMPAIGN[stageIndex]!.name}).`,
    'Press R to reopen the shop',
  );
}

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
    event.preventDefault();
  }
  held.add(event.code);
  if (event.code === 'KeyR') {
    startRun();
    return;
  }
  if (screen === 'title' && (event.code === 'Enter' || event.code === 'Space')) {
    startRun();
  }
});

window.addEventListener('keyup', (event) => {
  held.delete(event.code);
});

window.addEventListener('blur', () => {
  held.clear();
});

document.addEventListener('visibilitychange', () => {
  held.clear();
  lastTime = null;
});

renderer.setScenario(MALTLINE_CAMPAIGN[0]!);
showOverlay(
  'MALTLINE',
  'You run the shake counter. Blend the flavor they ask for, slide it down the line, catch the empty jars before they hit the floor.',
  'Press Enter to open the shop',
);

let lastTime: number | null = null;
const MAX_CATCHUP_TICKS = 6;

function frame(now: number): void {
  if (lastTime === null) lastTime = now;
  const dtMs = Math.min(now - lastTime, 100);
  lastTime = now;

  if (screen === 'playing' && !document.hidden) {
    const tickMs = 1000 / engine.scenario.ticksPerSecond;
    let owed = dtMs;
    let stepped = 0;
    while (owed >= tickMs && stepped < MAX_CATCHUP_TICKS) {
      const input = inputFromKeys();
      engine.setInput(input);
      stageInputs.push({ ...input });
      const result = engine.step();
      renderer.pushEvents(result.events, result.state);
      for (const event of result.events) {
        if (event.type === 'stage_cleared') finishStage(event.bonus);
        if (event.type === 'game_lost') gameOver();
      }
      owed -= tickMs;
      stepped++;
    }
  }

  renderer.update(dtMs);
  renderer.draw(ctx, engine.scenario, engine.snapshot(), {
    stageIndex,
    stageCount: MALTLINE_CAMPAIGN.length,
  });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

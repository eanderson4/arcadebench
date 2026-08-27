import { SmilefallEngine } from '../core/engine';
import { smilefallCatalog, nextStage, stageBySlug } from '../levels/catalog';
import {
  MOOD_BLURBS,
  MOOD_LABELS,
  MOOD_ORDER,
  applyMood,
  requiredCatches,
} from '../levels/toolbox';
import { ContinuousSmilefallSession } from '../runtime/session';
import type { ControlInput, SmilefallState } from '../core/types';
import type { SmilefallMoodId, SmilefallStage } from '../levels/types';
import { SmilefallRenderer } from './renderer';

type Phase = 'ready' | 'running' | 'paused' | 'result';

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  return element;
}

const params = new URLSearchParams(window.location.search);

const stagePicker = query<HTMLDivElement>('#stage-picker');
const moodSegment = query<HTMLDivElement>('#mood-segment');
const moodBlurb = query<HTMLParagraphElement>('#mood-blurb');
const stageCount = query<HTMLSpanElement>('#stage-count');
const statBuckets = query<HTMLElement>('#stat-buckets');
const statDrops = query<HTMLElement>('#stat-drops');
const statFrowns = query<HTMLElement>('#stat-frowns');
const statFrownsLabel = query<HTMLElement>('#stat-frowns-label');
const statClock = query<HTMLElement>('#stat-clock');
const statBest = query<HTMLElement>('#stat-best');
const startRun = query<HTMLButtonElement>('#start-run');

const hudTitle = query<HTMLElement>('#hud-title');
const hudTier = query<HTMLElement>('#hud-tier');
const hudRules = query<HTMLElement>('#hud-rules');
const hudScore = query<HTMLElement>('#hud-score');
const hudCombo = query<HTMLElement>('#hud-combo');
const hudClock = query<HTMLElement>('#hud-clock');
const bucketMeter = query<HTMLElement>('#bucket-meter');
const bucketMeterLabel = query<HTMLElement>('#bucket-meter-label');
const steerWheel = query<HTMLElement>('#steer-wheel');
const steerCount = query<HTMLElement>('#steer-count');
const demoWheel = query<HTMLElement>('#demo-wheel');
const frownLabel = query<HTMLElement>('#frown-label');
const frownPips = query<HTMLElement>('#frown-pips');
const hopPips = query<HTMLElement>('#hop-pips');
const pauseButton = query<HTMLButtonElement>('#pause-button');
const quitButton = query<HTMLButtonElement>('#quit-button');

const readyOverlay = query<HTMLElement>('#ready-overlay');
const readyTitle = query<HTMLElement>('#ready-title');
const readyCopy = query<HTMLElement>('#ready-copy');
const readyRules = query<HTMLElement>('#ready-rules');
const readyStart = query<HTMLButtonElement>('#ready-start');
const pauseOverlay = query<HTMLElement>('#pause-overlay');
const resumeButton = query<HTMLButtonElement>('#resume-button');
const restartButton = query<HTMLButtonElement>('#restart-button');
const pauseHome = query<HTMLButtonElement>('#pause-home');
const resultOverlay = query<HTMLElement>('#result-overlay');
const resultFace = query<HTMLElement>('#result-face');
const resultTitle = query<HTMLElement>('#result-title');
const resultCopy = query<HTMLElement>('#result-copy');
const resultStats = query<HTMLElement>('#result-stats');
const resultAgain = query<HTMLButtonElement>('#result-again');
const resultNext = query<HTMLButtonElement>('#result-next');
const resultReplay = query<HTMLButtonElement>('#result-replay');
const resultHome = query<HTMLButtonElement>('#result-home');
const toast = query<HTMLElement>('#toast');

const renderer = new SmilefallRenderer(query<HTMLCanvasElement>('#field'));

let selectedStage: SmilefallStage = stageBySlug(params.get('stage') ?? '') ?? smilefallCatalog[0]!;
let selectedMood: SmilefallMoodId = MOOD_ORDER.includes(params.get('mood') as SmilefallMoodId)
  ? (params.get('mood') as SmilefallMoodId)
  : 'chuckle';
let session = createSession();
let phase: Phase = 'ready';
let accumulator = 0;
let lastFrameMs = performance.now();
let lastPipSignature = '';
/** How many smilies this stage can afford to lose before it is arithmetically over. */
let startingSpare = 0;

const held = new Set<'left' | 'right' | 'hop'>();

function scenarioFor(stage: SmilefallStage, mood: SmilefallMoodId) {
  return applyMood(stage.scenario, mood);
}

function createSession(): ContinuousSmilefallSession {
  return new ContinuousSmilefallSession(new SmilefallEngine(scenarioFor(selectedStage, selectedMood)));
}

/* ------------------------------ formatting ------------------------------ */

function formatClock(ticks: number | null, ticksPerSecond: number): string {
  if (ticks === null) return '∞';
  const seconds = Math.ceil(ticks / ticksPerSecond);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function bestKey(stage: SmilefallStage, mood: SmilefallMoodId): string {
  return `arcadebench.smilefall.best.${stage.metadata.slug}.${mood}`;
}

function readBest(stage: SmilefallStage, mood: SmilefallMoodId): number {
  const stored = Number(localStorage.getItem(bestKey(stage, mood)) ?? 0);
  return Number.isFinite(stored) ? stored : 0;
}

function writeBest(stage: SmilefallStage, mood: SmilefallMoodId, score: number): boolean {
  if (score <= readBest(stage, mood)) return false;
  localStorage.setItem(bestKey(stage, mood), String(score));
  return true;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string): void {
  toast.textContent = message;
  toast.dataset.open = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.dataset.open = 'false'; }, 2200);
}

/* -------------------------------- home ---------------------------------- */

function stat(label: string, value: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'sf-stat';
  const small = document.createElement('small');
  small.textContent = label;
  const bold = document.createElement('b');
  bold.textContent = value;
  wrapper.append(small, bold);
  return wrapper;
}

const TIER_CHIP: Record<SmilefallMoodId, string> = {
  giggle: 'sf-chip sf-chip--mint',
  chuckle: 'sf-chip sf-chip--yolk',
  guffaw: 'sf-chip sf-chip--pink',
  cackle: 'sf-chip sf-chip--grape',
};

function buildStagePicker(): void {
  stagePicker.replaceChildren();
  for (const stage of smilefallCatalog) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sf-pick';
    card.dataset.slug = stage.metadata.slug;
    card.setAttribute('aria-pressed', String(stage === selectedStage));

    const row = document.createElement('span');
    row.className = 'sf-row';
    const badge = document.createElement('span');
    badge.className = 'sf-badge';
    badge.textContent = String(stage.metadata.number).padStart(2, '0');
    const tier = document.createElement('span');
    tier.className = TIER_CHIP[stage.metadata.tier];
    tier.textContent = stage.metadata.tier.toUpperCase();
    row.append(badge, tier);

    const title = document.createElement('h3');
    title.className = 'sf-head';
    title.textContent = stage.metadata.title;
    const tagline = document.createElement('p');
    tagline.textContent = stage.metadata.tagline;

    const tags = document.createElement('span');
    tags.className = 'sf-tags';
    for (const feature of stage.metadata.features) {
      const tag = document.createElement('span');
      tag.textContent = feature;
      // The one stage where a rock still deletes you deserves a shout.
      if (feature.includes('SMASH')) tag.dataset.hot = 'true';
      tags.append(tag);
    }

    card.append(row, title, tagline, tags);
    card.addEventListener('click', () => {
      selectedStage = stage;
      syncHome();
    });
    stagePicker.append(card);
  }
  stageCount.textContent = `${smilefallCatalog.length} STAGES`;
}

function buildMoodSegment(): void {
  moodSegment.replaceChildren();
  for (const mood of MOOD_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mood = mood;
    button.textContent = MOOD_LABELS[mood];
    button.setAttribute('aria-pressed', String(mood === selectedMood));
    button.addEventListener('click', () => {
      selectedMood = mood;
      syncHome();
    });
    moodSegment.append(button);
  }
}

function syncHome(): void {
  for (const card of stagePicker.querySelectorAll<HTMLButtonElement>('.sf-pick')) {
    card.setAttribute('aria-pressed', String(card.dataset.slug === selectedStage.metadata.slug));
  }
  for (const button of moodSegment.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.mood === selectedMood));
  }
  moodBlurb.textContent = MOOD_BLURBS[selectedMood];

  const scenario = scenarioFor(selectedStage, selectedMood);
  statBuckets.textContent = `${scenario.buckets.length}`;
  statDrops.textContent = `${scenario.drops.length}`;
  // On a bouncy stage frowns are not the budget the player is spending — the
  // roster is. Show the number that actually ends the run.
  const bouncyStage = scenario.floorRule === 'bounce';
  statFrownsLabel.textContent = bouncyStage ? 'Spare' : 'Frowns';
  statFrowns.textContent = `${bouncyStage ? scenario.drops.length - requiredCatches(scenario) : scenario.frownLimit}`;
  statClock.textContent = formatClock(scenario.timeLimitTicks ?? null, scenario.ticksPerSecond);
  const best = readBest(selectedStage, selectedMood);
  statBest.textContent = best > 0
    ? `Best on ${MOOD_LABELS[selectedMood]}: ${best.toLocaleString()} · ${requiredCatches(scenario)} catches needed`
    : `No run yet. ${requiredCatches(scenario)} catches fill every bucket.`;
}

/**
 * The two rules a player has to know before the first smiley lands, spelled
 * out in words as well as in the art: spiky rocks pop balloons, round rocks
 * bruise; a splat floor spends a smiley, a bouncy one only spends time.
 */
function ruleTags(stage: SmilefallStage): Array<{ text: string; hot: boolean }> {
  const scenario = stage.scenario;
  return [
    scenario.rocks.length < 1
      ? { text: 'NO ROCKS', hot: false }
      : scenario.rockRule === 'smash'
        ? { text: 'ROCKS POP', hot: true }
        : { text: 'ROCKS BRUISE', hot: false },
    // Spikes are their own rule, and on a stage with no rocks they are the
    // only thing that can end anybody, so they must never go unannounced.
    ...(scenario.spikes?.length ? [{ text: 'SPIKES POP', hot: true }] : []),
    scenario.floorRule === 'bounce'
      ? { text: 'FLOOR BOUNCES', hot: false }
      : { text: 'FLOOR SPLATS', hot: true },
    ...(scenario.platforms?.length ? [{ text: 'LEDGES ARE FREE', hot: false }] : []),
  ];
}

function paintRules(container: HTMLElement, stage: SmilefallStage): void {
  container.replaceChildren(...ruleTags(stage).map((rule) => {
    const tag = document.createElement('span');
    tag.textContent = rule.text;
    if (rule.hot) tag.dataset.hot = 'true';
    return tag;
  }));
}

/* -------------------------------- play ---------------------------------- */

function setOverlay(overlay: HTMLElement, open: boolean): void {
  overlay.dataset.open = String(open);
}

function setPhase(next: Phase): void {
  phase = next;
  setOverlay(readyOverlay, next === 'ready');
  setOverlay(pauseOverlay, next === 'paused');
  setOverlay(resultOverlay, next === 'result');
  pauseButton.textContent = next === 'paused' ? 'RESUME' : 'PAUSE';
  pauseButton.disabled = next === 'ready' || next === 'result';
}

function openStage(stage: SmilefallStage, mood: SmilefallMoodId): void {
  selectedStage = stage;
  selectedMood = mood;
  session = createSession();
  renderer.reset();
  startingSpare = session.engine.snapshot().spareSmilies;
  accumulator = 0;
  lastPipSignature = '';
  held.clear();
  hudTitle.textContent = stage.metadata.title;
  hudTier.textContent = stage.metadata.tier.toUpperCase();
  hudTier.className = TIER_CHIP[stage.metadata.tier];
  paintRules(hudRules, stage);
  paintRules(readyRules, stage);
  readyTitle.textContent = stage.metadata.title;
  readyCopy.textContent = stage.metadata.challenge;
  // A stacked stage is framed taller than it is wide-ish; the board keeps the
  // aspect the stage was authored for so nothing scrolls off the bottom.
  const scenario = session.engine.scenario;
  const aspect = scenario.width / Math.min(scenario.viewHeight ?? scenario.height, scenario.height);
  document.documentElement.style.setProperty('--sf-field-aspect', aspect.toFixed(3));
  document.body.dataset.screen = 'play';
  setPhase('ready');
  updateHud(session.engine.snapshot());
}

function goHome(): void {
  document.body.dataset.screen = 'home';
  setPhase('ready');
  syncHome();
}

function currentInput(): ControlInput {
  const left = held.has('left');
  const right = held.has('right');
  return {
    lean: left === right ? 'none' : left ? 'left' : 'right',
    hop: held.has('hop'),
  };
}

/** Max pips before the HUD switches to a count; a long pip row wraps the header. */
const PIP_LIMIT = 8;

function pipRow(container: HTMLElement, total: number, remaining: number): void {
  container.replaceChildren();
  if (total > PIP_LIMIT) {
    const pip = document.createElement('i');
    if (remaining < 1) pip.dataset.spent = 'true';
    const label = document.createElement('b');
    label.textContent = `${remaining}/${total}`;
    container.append(pip, label);
    return;
  }
  for (let index = 0; index < total; index++) {
    const pip = document.createElement('i');
    if (index >= remaining) pip.dataset.spent = 'true';
    container.append(pip);
  }
}

function updateHud(state: SmilefallState): void {
  steerWheel.dataset.lean = state.currentInput.lean;
  steerCount.textContent = state.smilies.length === 1 ? '1 smiley' : `${state.smilies.length} smilies`;
  hudScore.textContent = state.score.toLocaleString();
  hudCombo.textContent = `×${state.combo}`;
  hudClock.textContent = formatClock(state.timeRemainingTicks, session.engine.scenario.ticksPerSecond);
  const filled = state.buckets.reduce((total, bucket) => total + bucket.filled, 0);
  const capacity = state.buckets.reduce((total, bucket) => total + bucket.capacity, 0);
  bucketMeter.style.setProperty('--sf-meter-fill', `${Math.round((filled / capacity) * 100)}%`);
  bucketMeterLabel.textContent = `BUCKETS ${state.bucketsFilled} / ${state.bucketCount} · ${filled}/${capacity} SMILIES`;

  // On a bouncy stage nothing can splat, so the frown meter would sit full all
  // run. Show the resource the player is actually spending: bruises.
  // On a bouncy stage nothing can splat, so the frown meter would sit full all
  // run. Show the resource the player is actually spending: the spare smilies
  // between the roster and the slots still to fill. When it hits zero, the
  // next one lost ends the run.
  const bouncy = state.floorRule === 'bounce';
  const signature = bouncy
    ? `spare:${state.spareSmilies}/${startingSpare}:${state.hopCharges}/${state.hopChargesMax}`
    : `${state.frownsRemaining}/${session.engine.scenario.frownLimit}:${state.hopCharges}/${state.hopChargesMax}`;
  if (signature !== lastPipSignature) {
    lastPipSignature = signature;
    frownLabel.textContent = bouncy ? 'Spare' : 'Frowns';
    if (bouncy) pipRow(frownPips, startingSpare, Math.max(0, state.spareSmilies));
    else pipRow(frownPips, session.engine.scenario.frownLimit, state.frownsRemaining);
    pipRow(hopPips, state.hopChargesMax, state.hopCharges);
  }
}

function finishRun(state: SmilefallState): void {
  setPhase('result');
  const won = state.status === 'won';
  resultFace.className = won ? 'sf-face sf-anim-bob' : 'sf-face sf-face--sad';
  resultTitle.textContent = won ? 'BUCKETS FULL!' : 'RUN OVER';
  resultCopy.textContent = won
    ? 'Every bucket stuffed. The smilies are thrilled.'
    : state.failureReason === 'too_grumpy'
      ? 'Too many smilies hit the dirt. The mood has soured.'
      : state.failureReason === 'out_of_smilies'
        ? `Only ${state.smiliesRemaining} smilies left and ${state.slotsRemaining} slots to fill. No way back from that.`
        : 'The clock beat you to it.';

  const scenario = session.engine.scenario;
  const ticksPerSecond = scenario.ticksPerSecond;
  const perTick = scenario.timeBonusPerTick;
  const timeBonus = won && perTick !== undefined && scenario.timeLimitTicks !== undefined
    ? perTick * Math.max(0, scenario.timeLimitTicks - state.tick)
    : null;
  resultStats.replaceChildren(
    stat('Score', state.score.toLocaleString()),
    stat('Time', `${(state.tick / ticksPerSecond).toFixed(1)}s`),
    ...(timeBonus === null ? [] : [stat('Time bonus', `+${timeBonus.toLocaleString()}`)]),
    stat('Caught', `${state.caught}/${state.caught + state.missed}`),
    stat('Best combo', `×${state.bestCombo}`),
    stat('Bruises', `${state.bonks}`),
    ...(startingSpare > 0 ? [stat('Spare left', `${Math.max(0, state.spareSmilies)}/${startingSpare}`)] : []),
    stat('Buckets', `${state.bucketsFilled}/${state.bucketCount}`),
  );

  const upcoming = nextStage(selectedStage.metadata.slug);
  resultNext.hidden = !won || !upcoming;
  if (writeBest(selectedStage, selectedMood, state.score)) showToast(`New best: ${state.score.toLocaleString()}!`);
}

function frame(nowMs: number): void {
  const seconds = nowMs / 1000;
  if (phase === 'running') {
    const stepMs = 1000 / session.engine.scenario.ticksPerSecond;
    accumulator += Math.min(nowMs - lastFrameMs, 250);
    while (accumulator >= stepMs) {
      accumulator -= stepMs;
      session.setInput(currentInput());
      const result = session.tick();
      renderer.pushEvents(result.events, result.state, seconds);
      if (result.state.status !== 'running') {
        accumulator = 0;
        finishRun(result.state);
        break;
      }
    }
  }
  const state = session.engine.snapshot();
  renderer.render(state, { time: seconds, paused: phase !== 'running' });
  if (document.body.dataset.screen === 'play') updateHud(state);
  lastFrameMs = nowMs;
  requestAnimationFrame(frame);
}

/* ------------------------------- controls -------------------------------- */

function keyRole(code: string): 'left' | 'right' | 'hop' | null {
  switch (code) {
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Space': case 'ArrowUp': case 'KeyW': return 'hop';
    default: return null;
  }
}

function beginRun(): void {
  lastFrameMs = performance.now();
  accumulator = 0;
  setPhase('running');
}

function togglePause(): void {
  if (phase === 'running') setPhase('paused');
  else if (phase === 'paused') beginRun();
}

window.addEventListener('keydown', (event) => {
  if (document.body.dataset.screen !== 'play') {
    if (event.code === 'Enter') {
      event.preventDefault();
      openStage(selectedStage, selectedMood);
    }
    return;
  }
  const role = keyRole(event.code);
  if (role) {
    event.preventDefault();
    if (phase === 'ready') beginRun();
    held.add(role);
    return;
  }
  if (event.code === 'Enter' && phase === 'ready') { event.preventDefault(); beginRun(); }
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); togglePause(); }
  if (event.code === 'KeyR') { event.preventDefault(); openStage(selectedStage, selectedMood); }
});

window.addEventListener('keyup', (event) => {
  const role = keyRole(event.code);
  if (role) held.delete(role);
});

window.addEventListener('blur', () => {
  held.clear();
  if (phase === 'running') setPhase('paused');
});

/* -------------------------------- wiring --------------------------------- */

startRun.addEventListener('click', () => openStage(selectedStage, selectedMood));
readyStart.addEventListener('click', beginRun);
pauseButton.addEventListener('click', togglePause);
resumeButton.addEventListener('click', beginRun);
restartButton.addEventListener('click', () => openStage(selectedStage, selectedMood));
pauseHome.addEventListener('click', goHome);
quitButton.addEventListener('click', goHome);
resultAgain.addEventListener('click', () => openStage(selectedStage, selectedMood));
resultHome.addEventListener('click', goHome);
resultNext.addEventListener('click', () => {
  const upcoming = nextStage(selectedStage.metadata.slug);
  if (upcoming) openStage(upcoming, selectedMood);
});
resultReplay.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(session.replay())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `smilefall-${selectedStage.metadata.slug}-${selectedMood}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Replay saved');
});

/**
 * Dev-only handle so the game can be driven deterministically from the console
 * or a browser automation session, where requestAnimationFrame is throttled.
 */
if (import.meta.env.DEV) {
  Object.assign(window, {
    smilefall: {
      state: () => session.engine.snapshot(),
      open: (slug: string, mood: SmilefallMoodId = selectedMood) => {
        const stage = stageBySlug(slug);
        if (stage) openStage(stage, mood);
      },
      /** Advance the live session by hand, applying one input for every tick. */
      step: (ticks: number, input: Partial<ControlInput> = {}) => {
        const applied: ControlInput = { lean: 'none', hop: false, ...input };
        const time = performance.now() / 1000;
        for (let index = 0; index < ticks; index++) {
          if (session.engine.snapshot().status !== 'running') break;
          setPhase('running');
          session.setInput(applied);
          const result = session.tick();
          renderer.pushEvents(result.events, result.state, time);
          if (result.state.status !== 'running') finishRun(result.state);
        }
        const state = session.engine.snapshot();
        renderer.render(state, { time });
        updateHud(state);
        return state;
      },
    },
  });
}

/** The home-screen wheel leans on its own, teaching the idea before the run. */
const DEMO_LEANS = ['none', 'right', 'right', 'none', 'left', 'left'] as const;
setInterval(() => {
  if (document.body.dataset.screen !== 'home') return;
  demoWheel.dataset.lean = DEMO_LEANS[Math.floor(Date.now() / 900) % DEMO_LEANS.length]!;
}, 300);

buildStagePicker();
buildMoodSegment();
syncHome();
if (params.get('play') === '1') openStage(selectedStage, selectedMood);
requestAnimationFrame(frame);

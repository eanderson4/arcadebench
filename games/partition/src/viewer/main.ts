import { PartitionEngine } from '../core/engine';
import { applyDifficulty, DIFFICULTY_PRESETS } from '../core/difficulty';
import { parsePartitionReplay, replayPartitionFrames, type PartitionReplayFrame } from '../core/replay';
import type { ControlInput, DifficultyId, Direction, GameEvent, PartitionReplay, PartitionState, ReplayTick } from '../core/types';
import { createPartitionCampaign, resolvePartitionProgression, type PartitionCampaignLevel } from '../levels';
import { PartitionRenderer } from './renderer';
import { ReplayTransport } from './replay-transport';
import { createShowcaseReplay } from './showcase-replay';
import { resolveTimePressure } from './time-pressure';

type ViewMode = 'home' | 'catalog' | 'live' | 'replay';
type PlayContext = 'arcade' | 'catalog';
type CatalogTier = DifficultyId | 'all';

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
const stageTimeEl = query<HTMLElement>('#stage-time');
const stageTickEl = query<HTMLElement>('#stage-tick');
const timePressureHud = query<HTMLElement>('#time-pressure-hud');
const timePressureLabel = query<HTMLElement>('#time-pressure-label');
const timePressureClock = query<HTMLElement>('#time-pressure-clock');
const timePressureDetail = query<HTMLElement>('#time-pressure-detail');
const timePressureFill = query<HTMLElement>('#time-pressure-fill');
const fitScreenButton = query<HTMLButtonElement>('#fit-screen');
const messageEl = query<HTMLElement>('#message');
const messageKicker = query<HTMLElement>('#message-kicker');
const messageTitle = query<HTMLElement>('#message-title');
const messageDetail = query<HTMLElement>('#message-detail');
const messageCountdown = query<HTMLElement>('#message-countdown');
const messageAction = query<HTMLButtonElement>('#message-action');
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
const levelSelect = query<HTMLSelectElement>('#level-select');
const difficultySelect = query<HTMLSelectElement>('#difficulty-select');
const fieldLauncher = query<HTMLFormElement>('#field-launcher');
const homeReplayButton = query<HTMLButtonElement>('#home-replay');
const openCatalogButton = query<HTMLButtonElement>('#open-catalog');
const catalogHomeButton = query<HTMLButtonElement>('#catalog-home');
const catalogReplayButton = query<HTMLButtonElement>('#catalog-replay');
const catalogGrid = query<HTMLElement>('#catalog-grid');
const catalogDifficultySelect = query<HTMLSelectElement>('#catalog-difficulty-select');
const returnHomeButton = query<HTMLButtonElement>('#return-home');
const homeLevelNumber = query<HTMLElement>('#home-level-number');
const homeLevelTier = query<HTMLElement>('#home-level-tier');
const homeLevelTitle = query<HTMLElement>('#home-level-title');
const homeLevelTagline = query<HTMLElement>('#home-level-tagline');
const homeLevelChallenge = query<HTMLElement>('#home-level-challenge');
const homeAnomalies = query<HTMLElement>('#home-anomalies');
const homeTarget = query<HTMLElement>('#home-target');
const homeClock = query<HTMLElement>('#home-clock');
const homeLives = query<HTMLElement>('#home-lives');
const difficultySummary = query<HTMLElement>('#difficulty-summary');
const stageFieldLabel = query<HTMLElement>('#stage-field-label');
const stageFieldName = query<HTMLElement>('#stage-field-name');
const controlTarget = query<HTMLElement>('#control-target');
const stabilityHud = query<HTMLElement>('#stability-hud');
const stabilityCurrent = query<HTMLElement>('#stability-current');
const stabilityTarget = query<HTMLElement>('#stability-target');
const stabilityFill = query<HTMLElement>('#stability-fill');
const stabilityGoalMarker = query<HTMLElement>('#stability-goal-marker');
const captureFeedback = query<HTMLElement>('#capture-feedback');
const captureGain = query<HTMLElement>('#capture-gain');
const captureTotal = query<HTMLElement>('#capture-total');

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed') ?? 11);
if (!Number.isFinite(seed)) seed = 11;
const arcadeCampaign = resolvePartitionProgression(undefined, seed);
const levelCatalog = createPartitionCampaign(seed);
let campaign = arcadeCampaign;
let playContext: PlayContext = 'arcade';
const requestedTier = params.get('tier');
let catalogTier: CatalogTier = requestedTier === 'easy'
  || requestedTier === 'medium'
  || requestedTier === 'hard'
  || requestedTier === 'impossible'
  ? requestedTier
  : 'all';
const requestedLevel = params.get('level');
const requestedCatalogLevel = requestedLevel
  ? levelCatalog.find((level) => level.metadata.slug === requestedLevel || level.scenario.id === requestedLevel)
  : undefined;
if (requestedCatalogLevel) {
  campaign = [requestedCatalogLevel];
  playContext = 'catalog';
}
let selectedLevelIndex = 0;
const requestedDifficulty = params.get('difficulty');
let selectedDifficulty: DifficultyId = requestedDifficulty && requestedDifficulty in DIFFICULTY_PRESETS
  ? requestedDifficulty as DifficultyId
  : 'medium';
let engine = new PartitionEngine(applyDifficulty(campaign[selectedLevelIndex]!.scenario, selectedDifficulty));
let mode: ViewMode = params.get('mode') === 'replay'
  ? 'replay'
  : params.get('mode') === 'catalog'
    ? 'catalog'
  : params.get('mode') === 'live' || params.get('autostart') === '1'
    ? 'live'
    : 'home';
let immersive = false;
let direction: Direction = 'idle';
let drawing = false;
let touchDirection: Direction = 'idle';
let touchDrawing = false;
let liveStarted = mode === 'live' && params.get('autostart') === '1';
let liveReplayTicks: ReplayTick[] = [];
const keys = new Set<string>();
const pressedDirections: Direction[] = [];
let bufferedDirection: Direction = 'idle';
let bufferedDraw = false;

let loadedReplay: PartitionReplay = createShowcaseReplay();
let replayFrames: PartitionReplayFrame[] = replayPartitionFrames(loadedReplay);
let replayTransport = new ReplayTransport(replayFrames, loadedReplay.scenario.ticksPerSecond);
let lastAnimationTime = performance.now();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let damageTimer: ReturnType<typeof setTimeout> | undefined;
let captureFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
let introTimer: ReturnType<typeof setTimeout> | undefined;
let autoAdvanceTimer: ReturnType<typeof setTimeout> | undefined;
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let autoAdvanceScenarioId: string | null = null;
let autoAdvanceDeadline = 0;
let lastPressureSecond: number | null = null;

const AUTO_ADVANCE_SECONDS = 5;

function selectedLevel(): PartitionCampaignLevel {
  return campaign[selectedLevelIndex]!;
}

function configureFieldSurface(state: Pick<PartitionState, 'width' | 'height'>): void {
  canvas.height = Math.round(canvas.width * (state.height / state.width));
  stage.style.setProperty('--board-aspect', `${state.width} / ${state.height}`);
}

function updateFieldIdentity(): void {
  const level = selectedLevel();
  stageFieldLabel.textContent = `STAGE ${String(level.metadata.number).padStart(2, '0')}`;
  stageFieldName.textContent = level.metadata.title.toUpperCase();
  controlTarget.textContent = `CAPTURE ${Math.round(engine.scenario.targetFraction * 100)}%`;
}

function formatFieldClock(ticks: number, ticksPerSecond: number): string {
  const totalSeconds = Math.ceil(ticks / ticksPerSecond);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function catalogStat(label: string, value: string): HTMLElement {
  const stat = document.createElement('span');
  const caption = document.createElement('small');
  const result = document.createElement('b');
  caption.textContent = label;
  result.textContent = value;
  stat.append(caption, result);
  return stat;
}

function createCatalogCard(level: PartitionCampaignLevel): HTMLElement {
  const scenario = applyDifficulty(level.scenario, selectedDifficulty);
  const filaments = scenario.anomalies.filter((anomaly) => anomaly.kind === 'filament').length;
  const drifters = scenario.anomalies.length - filaments;
  const card = document.createElement('article');
  card.className = `catalog-card tier-${level.metadata.tier}`;

  const preview = document.createElement('div');
  preview.className = 'catalog-preview';
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 480;
  previewCanvas.height = Math.round(previewCanvas.width * (scenario.height / scenario.width));
  previewCanvas.setAttribute('aria-label', `${level.metadata.title} board preview`);
  const previewLabel = document.createElement('span');
  previewLabel.textContent = `FIELD ${String(level.metadata.number).padStart(2, '0')}`;
  const hazardBadge = document.createElement('b');
  hazardBadge.className = filaments > 0 ? 'has-filament' : '';
  hazardBadge.textContent = filaments > 0 ? `${filaments} FILAMENT${filaments === 1 ? '' : 'S'}` : 'DRIFTERS';
  preview.append(previewCanvas, previewLabel, hazardBadge);

  const heading = document.createElement('div');
  heading.className = 'catalog-card-heading';
  const tier = document.createElement('small');
  tier.textContent = level.metadata.tier;
  const title = document.createElement('h2');
  title.textContent = level.metadata.title;
  heading.append(tier, title);

  const tagline = document.createElement('p');
  tagline.className = 'catalog-tagline';
  tagline.textContent = level.metadata.tagline;
  const challenge = document.createElement('p');
  challenge.className = 'catalog-challenge';
  challenge.textContent = level.metadata.challenge;

  const features = document.createElement('div');
  features.className = 'catalog-features';
  for (const feature of level.metadata.features.slice(0, 3)) {
    const chip = document.createElement('span');
    chip.textContent = feature.replaceAll('-', ' ');
    features.append(chip);
  }

  const stats = document.createElement('div');
  stats.className = 'catalog-stats';
  stats.append(
    catalogStat('DRIFTERS', String(drifters).padStart(2, '0')),
    catalogStat('FILAMENTS', String(filaments).padStart(2, '0')),
    catalogStat('TARGET', `${Math.round(scenario.targetFraction * 100)}%`),
    catalogStat('CLOCK', scenario.timeLimitTicks === undefined
      ? 'OPEN'
      : formatFieldClock(scenario.timeLimitTicks, scenario.ticksPerSecond)),
  );

  const launch = document.createElement('button');
  launch.className = 'catalog-play';
  launch.type = 'button';
  const launchLabel = document.createElement('span');
  launchLabel.textContent = 'PLAY THIS FIELD';
  const launchArrow = document.createElement('b');
  launchArrow.textContent = '→';
  launch.append(launchLabel, launchArrow);
  launch.addEventListener('click', () => launchCatalogField(level));

  card.append(preview, heading, tagline, challenge, features, stats, launch);
  const previewEngine = new PartitionEngine(scenario);
  new PartitionRenderer(previewCanvas).render(previewEngine.snapshot(), {
    ambientTime: level.metadata.number * 0.73,
    smoothSpark: false,
  });
  return card;
}

function renderCatalogCards(): void {
  const visible = levelCatalog.filter((level) => catalogTier === 'all' || level.metadata.tier === catalogTier);
  catalogGrid.replaceChildren(...visible.map(createCatalogCard));
  catalogGrid.setAttribute('aria-label', `${visible.length} fields shown`);
}

function updateHomeSelection(): void {
  const level = selectedLevel();
  const scenario = applyDifficulty(level.scenario, selectedDifficulty);
  levelSelect.value = String(level.metadata.number);
  difficultySelect.value = selectedDifficulty;
  homeLevelNumber.textContent = `STAGE ${String(level.metadata.number).padStart(2, '0')} / ${campaign.length}`;
  homeLevelTier.textContent = `${level.metadata.tier.toUpperCase()} STAGE`;
  homeLevelTitle.textContent = level.metadata.title;
  homeLevelTagline.textContent = level.metadata.tagline;
  homeLevelChallenge.textContent = level.metadata.challenge;
  homeAnomalies.textContent = String(scenario.anomalies.length).padStart(2, '0');
  homeTarget.textContent = `${Math.round(scenario.targetFraction * 100)}%`;
  homeClock.textContent = scenario.timeLimitTicks === undefined
    ? 'OPEN'
    : formatFieldClock(scenario.timeLimitTicks, scenario.ticksPerSecond);
  homeLives.textContent = String(scenario.integrity).padStart(2, '0');
  difficultySummary.textContent = DIFFICULTY_PRESETS[selectedDifficulty].description;
}

function resetLiveSession(): void {
  cancelAutoAdvance();
  clearTimeout(captureFeedbackTimer);
  clearHumanControls();
  direction = 'idle';
  liveReplayTicks = [];
  watchRunButton.disabled = true;
  messageEl.classList.add('hidden');
  captureFeedback.classList.remove('visible');
  stage.classList.remove('capture-pulse');
  updateFieldIdentity();
  configureFieldSurface(engine.snapshot());
}

function launchSelectedField(): void {
  engine = new PartitionEngine(applyDifficulty(selectedLevel().scenario, selectedDifficulty));
  resetLiveSession();
  liveStarted = true;
  playIntro.classList.add('hidden');
  playIntro.classList.remove('leaving');
  setMode('live');
}

function launchCatalogField(level: PartitionCampaignLevel): void {
  campaign = [level];
  playContext = 'catalog';
  selectedLevelIndex = 0;
  launchSelectedField();
  showNotice(`Catalog field ${String(level.metadata.number).padStart(2, '0')} · ${level.metadata.title}`);
}

function startArcadeRun(): void {
  campaign = arcadeCampaign;
  playContext = 'arcade';
  selectedLevelIndex = 0;
  levelSelect.value = '1';
  updateHomeSelection();
  launchSelectedField();
}

function cancelAutoAdvance(): void {
  clearTimeout(autoAdvanceTimer);
  clearInterval(countdownTimer);
  autoAdvanceTimer = undefined;
  countdownTimer = undefined;
  autoAdvanceScenarioId = null;
  autoAdvanceDeadline = 0;
}

function advanceProgression(): void {
  cancelAutoAdvance();
  if (playContext === 'catalog') {
    setMode('catalog');
    showNotice(`${selectedLevel().metadata.title} stabilized · choose another field`);
    return;
  }
  if (selectedLevelIndex >= campaign.length - 1) {
    setMode('home');
    showNotice('Arcade run complete · all stages stabilized');
    return;
  }
  selectedLevelIndex++;
  levelSelect.value = String(selectedLevel().metadata.number);
  updateHomeSelection();
  launchSelectedField();
  showNotice(
    `Stage ${String(selectedLevel().metadata.number).padStart(2, '0')} · ${selectedLevel().metadata.tier.toUpperCase()}`,
  );
}

function updateAutoAdvanceCountdown(): void {
  if (autoAdvanceScenarioId === null) return;
  const seconds = Math.max(0, Math.ceil((autoAdvanceDeadline - Date.now()) / 1000));
  const next = campaign[selectedLevelIndex + 1];
  messageCountdown.textContent = next
    ? `AUTO-LAUNCHING STAGE ${String(next.metadata.number).padStart(2, '0')} IN ${seconds}`
    : '';
}

function scheduleAutoAdvance(state: PartitionState): void {
  if (mode !== 'live' || playContext !== 'arcade' || selectedLevelIndex >= campaign.length - 1) return;
  if (autoAdvanceScenarioId === state.scenarioId) return;
  cancelAutoAdvance();
  autoAdvanceScenarioId = state.scenarioId;
  autoAdvanceDeadline = Date.now() + AUTO_ADVANCE_SECONDS * 1000;
  updateAutoAdvanceCountdown();
  countdownTimer = setInterval(updateAutoAdvanceCountdown, 200);
  autoAdvanceTimer = setTimeout(() => {
    if (
      mode === 'live'
      && autoAdvanceScenarioId === state.scenarioId
      && engine.snapshot().status === 'won'
    ) advanceProgression();
  }, AUTO_ADVANCE_SECONDS * 1000);
}

function selectDirection(): Direction {
  for (let index = pressedDirections.length - 1; index >= 0; index--) {
    const candidate = pressedDirections[index];
    if (keys.has(`Arrow${candidate[0].toUpperCase()}${candidate.slice(1)}`)) return candidate;
  }
  return touchDirection;
}

function directionForCode(code: string): Direction | null {
  switch (code) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    default: return null;
  }
}

function clearHumanControls(): void {
  keys.clear();
  pressedDirections.length = 0;
  bufferedDirection = 'idle';
  bufferedDraw = false;
  drawing = false;
  touchDirection = 'idle';
  touchDrawing = false;
  engine.setInput({ direction: 'idle', draw: 'off' });
}

function currentInput(): ControlInput {
  const heldDirection = selectDirection();
  const state = engine.snapshot();
  const movementDue = state.tick % state.sparkMoveEveryTicks === 0;
  direction = heldDirection;
  let draw = drawing || touchDrawing;
  if (movementDue) {
    if (direction === 'idle' && bufferedDirection !== 'idle') {
      direction = bufferedDirection;
      draw = draw || bufferedDraw;
    }
    bufferedDirection = 'idle';
    bufferedDraw = false;
  }
  return { direction, draw: draw ? 'fast' : 'off' };
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
  cancelAutoAdvance();
  liveStarted = false;
  clearHumanControls();
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
  showNotice(`Trace severed · ${integrity} ${integrity === 1 ? 'life' : 'lives'} remaining`, 'error');
}

function formatCaptureGain(capturedCells: number, playableCellCount: number): string {
  const percentage = (capturedCells / playableCellCount) * 100;
  return percentage >= 10 ? String(Math.round(percentage)) : percentage.toFixed(1).replace(/\.0$/, '');
}

function newlyStabilizedCells(before: PartitionState, after: PartitionState): number[] {
  const prior = new Set(before.stabilizedCells);
  return after.stabilizedCells.filter((cell) => !prior.has(cell));
}

function largestCapturedComponent(cells: readonly number[], width: number): number[] {
  const remaining = new Set(cells);
  let largest: number[] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value as number;
    const component: number[] = [];
    const queue = [first];
    remaining.delete(first);
    while (queue.length > 0) {
      const cell = queue.pop()!;
      component.push(cell);
      const x = cell % width;
      const neighbors = [cell - width, cell + width];
      if (x > 0) neighbors.push(cell - 1);
      if (x < width - 1) neighbors.push(cell + 1);
      for (const neighbor of neighbors) {
        if (!remaining.delete(neighbor)) continue;
        queue.push(neighbor);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  return largest;
}

function positionCaptureFeedback(cells: readonly number[], state: PartitionState): void {
  const component = largestCapturedComponent(cells, state.width);
  if (component.length === 0) {
    captureFeedback.style.left = '50%';
    captureFeedback.style.top = '28%';
    return;
  }
  const center = component.reduce((sum, cell) => ({
    x: sum.x + (cell % state.width) + 0.5,
    y: sum.y + Math.floor(cell / state.width) + 0.5,
  }), { x: 0, y: 0 });
  const x = Math.max(10, Math.min(90, (center.x / component.length / state.width) * 100));
  const y = Math.max(12, Math.min(84, (center.y / component.length / state.height) * 100));
  captureFeedback.style.left = `${x}%`;
  captureFeedback.style.top = `${y}%`;
}

function showCaptureFeedback(capturedCells: number, state: PartitionState, newCells: readonly number[]): void {
  if (capturedCells <= 0) return;
  const current = Math.floor(state.capturedFraction * 100);
  const target = Math.round(state.targetFraction * 100);
  captureGain.textContent = `+${formatCaptureGain(capturedCells, state.playableCellCount)}%`;
  captureTotal.textContent = `${current}% / ${target}% STABLE`;
  positionCaptureFeedback(newCells, state);
  captureFeedback.classList.remove('visible');
  stage.classList.remove('capture-pulse');
  void captureFeedback.offsetWidth;
  captureFeedback.classList.add('visible');
  stage.classList.add('capture-pulse');
  clearTimeout(captureFeedbackTimer);
  captureFeedbackTimer = setTimeout(() => {
    captureFeedback.classList.remove('visible');
    stage.classList.remove('capture-pulse');
  }, 1_500);
}

function showFrameCaptureFeedback(frame: PartitionReplayFrame): void {
  const completion = frame.events.find((event) => event.type === 'trace_completed');
  if (completion?.type !== 'trace_completed') return;
  const previous = replayFrames[Math.max(0, replayTransport.index - 1)]?.state ?? frame.state;
  showCaptureFeedback(
    completion.capturedCells,
    frame.state,
    newlyStabilizedCells(previous, frame.state),
  );
}

function actionOverlapsStabilityHud(state: PartitionState): boolean {
  const inLowerLeft = (x: number, y: number): boolean =>
    x <= state.width * 0.3 && y >= state.height * 0.68;
  if (inLowerLeft(state.spark.position.x, state.spark.position.y)) return true;
  return state.trace.some((edge) =>
    inLowerLeft(edge.ax, edge.ay) || inLowerLeft(edge.bx, edge.by),
  );
}

function updateTimePressure(state: PartitionState, ticksPerSecond: number): void {
  const scenario = mode === 'replay' ? loadedReplay.scenario : engine.scenario;
  const pressureState = resolveTimePressure(
    scenario.timeLimitTicks,
    state.timeRemainingTicks,
    ticksPerSecond,
    state.status,
  );
  if (pressureState.level === 'none') {
    stage.dataset.timePressure = 'none';
    timePressureHud.setAttribute('aria-hidden', 'true');
    lastPressureSecond = null;
    return;
  }

  const { level: pressure, remainingSeconds, warningAtSeconds } = pressureState;
  stage.dataset.timePressure = pressure;
  timePressureHud.setAttribute('aria-hidden', 'false');

  timePressureLabel.textContent = pressure === 'critical'
    ? 'FIELD COLLAPSE IMMINENT'
    : 'TIME WINDOW CLOSING';
  timePressureDetail.textContent = pressure === 'critical'
    ? 'CLOSE A PARTITION NOW'
    : 'STABILIZE THE FIELD';
  timePressureClock.textContent = formatFieldClock(state.timeRemainingTicks!, ticksPerSecond);
  timePressureFill.style.width = `${Math.max(0, Math.min(100, (remainingSeconds / warningAtSeconds) * 100))}%`;
  if (lastPressureSecond !== remainingSeconds) {
    timePressureHud.classList.remove('clock-tick');
    void timePressureHud.offsetWidth;
    timePressureHud.classList.add('clock-tick');
    lastPressureSecond = remainingSeconds;
  }
}

function eventLabel(event: GameEvent): string {
  switch (event.type) {
    case 'trace_started': return `Trace opened at ${event.at.x}, ${event.at.y}`;
    case 'trace_completed': return `Partition closed · ${event.capturedCells} cells stabilized`;
    case 'trace_hit': return `${event.anomalyId.toUpperCase()} severed trace · ${event.integrity} lives`;
    case 'time_expired': return 'Field clock expired';
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
  const currentPercentage = Math.floor(state.capturedFraction * 100);
  const targetPercentage = Math.round(state.targetFraction * 100);
  const capture = `${currentPercentage}%`;
  const captureGoal = `${currentPercentage}% / ${targetPercentage}%`;
  const integrity = String(state.spark.integrity).padStart(2, '0');
  const tick = String(state.tick).padStart(4, '0');
  captureEl.textContent = captureGoal;
  integrityEl.textContent = integrity;
  tickEl.textContent = tick;
  stageCaptureEl.textContent = captureGoal;
  stabilityCurrent.textContent = capture;
  stabilityTarget.textContent = `${targetPercentage}%`;
  stabilityFill.style.width = `${Math.min(100, state.capturedFraction * 100)}%`;
  stabilityGoalMarker.style.left = `${Math.min(100, state.targetFraction * 100)}%`;
  stabilityHud.setAttribute('aria-label', `${capture} stabilized, ${targetPercentage}% goal`);
  stabilityHud.classList.toggle('action-nearby', actionOverlapsStabilityHud(state));
  stageIntegrityEl.textContent = integrity;
  const ticksPerSecond = mode === 'replay'
    ? loadedReplay.scenario.ticksPerSecond
    : engine.scenario.ticksPerSecond;
  stageTimeEl.textContent = state.timeRemainingTicks === null
    ? 'OPEN'
    : formatFieldClock(state.timeRemainingTicks, ticksPerSecond);
  updateTimePressure(state, ticksPerSecond);
  stageTickEl.textContent = tick;
  statusEl.textContent = state.status;
  statusEl.dataset.status = state.status;
  const restartLabel = playContext === 'catalog'
    ? state.status === 'won'
      ? 'FIELD CATALOG <span>→</span>'
      : state.status === 'lost'
        ? 'RETRY FIELD <span>↻</span>'
        : 'RESTART FIELD <span>↻</span>'
    : state.status === 'won'
      ? 'NEXT STAGE <span>→</span>'
      : state.status === 'lost'
        ? 'START OVER <span>↻</span>'
        : 'RESTART RUN <span>↻</span>';
  if (restartButton.dataset.label !== restartLabel) {
    restartButton.dataset.label = restartLabel;
    restartButton.innerHTML = restartLabel;
  }
  if (state.status !== 'running') {
    if (mode === 'replay') {
      cancelAutoAdvance();
      messageKicker.textContent = 'REPLAY RESULT';
      messageTitle.textContent = state.status === 'won' ? 'FIELD STABILIZED' : 'SIGNAL LOST';
      messageDetail.textContent = state.status === 'won'
        ? 'capture threshold reached'
        : state.failureReason === 'timeout'
          ? 'field clock expired'
          : 'all lives depleted';
      messageCountdown.textContent = '';
      messageAction.hidden = true;
    } else if (state.status === 'won' && playContext === 'catalog') {
      cancelAutoAdvance();
      messageKicker.textContent = 'CATALOG FIELD COMPLETE';
      messageTitle.textContent = 'FIELD STABILIZED';
      messageDetail.textContent = `${selectedLevel().metadata.title} · ${Math.floor(state.capturedFraction * 100)}% stabilized`;
      messageCountdown.textContent = 'SELECT ANOTHER FIELD OR TRY AGAIN';
      messageAction.hidden = false;
      messageAction.innerHTML = 'RETURN TO CATALOG <b>→</b>';
    } else if (state.status === 'won') {
      const next = campaign[selectedLevelIndex + 1];
      messageKicker.textContent = next ? 'FIELD COMPLETE' : 'ARCADE RUN COMPLETE';
      messageTitle.textContent = 'FIELD STABILIZED';
      messageDetail.textContent = next
        ? `NEXT · STAGE ${String(next.metadata.number).padStart(2, '0')} · ${next.metadata.title} · ${next.metadata.tier}`
        : `ALL ${campaign.length} STAGES STABILIZED`;
      messageAction.hidden = false;
      messageAction.innerHTML = next ? 'GO NEXT NOW <b>→</b>' : 'RETURN HOME <b>→</b>';
      if (next) scheduleAutoAdvance(state);
      else {
        cancelAutoAdvance();
        messageCountdown.textContent = 'RUN COMPLETE';
      }
    } else if (playContext === 'catalog') {
      cancelAutoAdvance();
      messageKicker.textContent = 'CATALOG FIELD FAILED';
      messageTitle.textContent = state.failureReason === 'timeout' ? 'TIME EXPIRED' : 'SIGNAL LOST';
      messageDetail.textContent = state.failureReason === 'timeout'
        ? 'field remained unstable'
        : 'all lives depleted';
      messageCountdown.textContent = 'CATALOG PROGRESS IS NOT RESET';
      messageAction.hidden = false;
      messageAction.innerHTML = 'RETRY FIELD <b>↻</b>';
    } else {
      cancelAutoAdvance();
      messageKicker.textContent = 'RUN OVER';
      messageTitle.textContent = state.failureReason === 'timeout' ? 'TIME EXPIRED' : 'SIGNAL LOST';
      messageDetail.textContent = state.failureReason === 'timeout'
        ? 'field remained unstable'
        : 'all lives depleted';
      messageCountdown.textContent = 'ARCADE RUN RESET TO STAGE 01';
      messageAction.hidden = false;
      messageAction.innerHTML = 'START OVER <b>↻</b>';
    }
    messageEl.classList.remove('hidden');
  } else {
    messageAction.hidden = false;
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
    showFrameCaptureFeedback(replayTransport.current);
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
  configureFieldSurface(frames[0].state);
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
  if (nextMode !== 'live') cancelAutoAdvance();
  mode = nextMode;
  if (mode === 'home') {
    liveStarted = false;
    clearHumanControls();
    campaign = arcadeCampaign;
    playContext = 'arcade';
    selectedLevelIndex = 0;
    updateHomeSelection();
  } else if (mode === 'catalog') {
    liveStarted = false;
    clearHumanControls();
    renderCatalogCards();
  }
  document.body.dataset.mode = mode;
  setImmersive(mode === 'live' && liveStarted);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  }
  const queryParams = new URLSearchParams(location.search);
  queryParams.set('mode', mode);
  queryParams.set('seed', String(seed));
  if (mode === 'live' && playContext === 'catalog') queryParams.set('level', selectedLevel().metadata.slug);
  else queryParams.delete('level');
  if (mode === 'catalog' && catalogTier !== 'all') queryParams.set('tier', catalogTier);
  else queryParams.delete('tier');
  queryParams.set('difficulty', selectedDifficulty);
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
  if (mode === 'home' || mode === 'catalog') return;
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
  const pressedDirection = directionForCode(event.code);
  if (pressedDirection && !event.repeat) {
    const prior = pressedDirections.indexOf(pressedDirection);
    if (prior !== -1) pressedDirections.splice(prior, 1);
    pressedDirections.push(pressedDirection);
    bufferedDirection = pressedDirection;
    bufferedDraw = drawing || touchDrawing || keys.has('Space');
  }
  keys.add(event.code);
  if (event.code === 'Space') {
    drawing = true;
    const activeDirection = selectDirection();
    if (activeDirection !== 'idle') {
      bufferedDirection = activeDirection;
      bufferedDraw = true;
    }
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  const releasedDirection = directionForCode(event.code);
  if (releasedDirection) {
    const index = pressedDirections.indexOf(releasedDirection);
    if (index !== -1) pressedDirections.splice(index, 1);
  }
  if (event.code === 'Space') drawing = false;
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
  const selected = button.dataset.direction as Direction;
  const begin = (event: Event) => {
    event.preventDefault();
    if (!liveStarted) startHumanPlay();
    touchDirection = selected;
    bufferedDirection = selected;
    bufferedDraw = touchDrawing;
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
  if (touchDirection !== 'idle') {
    bufferedDirection = touchDirection;
    bufferedDraw = true;
  }
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
returnHomeButton.addEventListener('click', () => setMode('home'));
homeReplayButton.addEventListener('click', () => setMode('replay'));
openCatalogButton.addEventListener('click', () => setMode('catalog'));
catalogHomeButton.addEventListener('click', () => setMode('home'));
catalogReplayButton.addEventListener('click', () => setMode('replay'));
messageAction.addEventListener('click', () => {
  const state = engine.snapshot();
  if (playContext === 'catalog') {
    if (state.status === 'won') setMode('catalog');
    else if (state.status === 'lost') launchSelectedField();
  } else if (state.status === 'won') advanceProgression();
  else if (state.status === 'lost') startArcadeRun();
});
fieldLauncher.addEventListener('submit', (event) => {
  event.preventDefault();
  startArcadeRun();
});
difficultySelect.addEventListener('change', () => {
  selectedDifficulty = difficultySelect.value as DifficultyId;
  catalogDifficultySelect.value = selectedDifficulty;
  updateHomeSelection();
});
catalogDifficultySelect.addEventListener('change', () => {
  selectedDifficulty = catalogDifficultySelect.value as DifficultyId;
  difficultySelect.value = selectedDifficulty;
  updateHomeSelection();
  renderCatalogCards();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tier]')) {
  button.addEventListener('click', () => {
    catalogTier = button.dataset.tier as CatalogTier;
    for (const filter of document.querySelectorAll<HTMLButtonElement>('[data-tier]')) {
      filter.setAttribute('aria-pressed', String(filter === button));
    }
    renderCatalogCards();
    const queryParams = new URLSearchParams(location.search);
    if (catalogTier === 'all') queryParams.delete('tier');
    else queryParams.set('tier', catalogTier);
    history.replaceState(null, '', `${location.pathname}?${queryParams}`);
  });
}
watchRunButton.addEventListener('click', () => {
  if (liveReplayTicks.length === 0) {
    showNotice('Start playing to create a replay', 'error');
    return;
  }
  installReplay(humanReplay(), `Your run · ${selectedLevel().metadata.title} · ${DIFFICULTY_PRESETS[selectedDifficulty].label}`);
  setMode('replay');
  setReplayPlaying(true);
});

restartButton.addEventListener('click', () => {
  const completed = engine.snapshot().status === 'won';
  if (playContext === 'catalog') {
    if (completed) setMode('catalog');
    else {
      launchSelectedField();
      showNotice(`${selectedLevel().metadata.title} restarted`);
    }
  } else if (completed) advanceProgression();
  else {
    startArcadeRun();
    showNotice('Arcade run restarted · Stage 01');
  }
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
  if (mode === 'live' && playContext === 'catalog') url.searchParams.set('level', selectedLevel().metadata.slug);
  else url.searchParams.delete('level');
  url.searchParams.set('difficulty', selectedDifficulty);
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
    const traceCompleted = result.events.find((event) => event.type === 'trace_completed');
    if (traceCompleted?.type === 'trace_completed') {
      showCaptureFeedback(
        traceCompleted.capturedCells,
        result.state,
        newlyStabilizedCells(applied, result.state),
      );
    }
    watchRunButton.disabled = false;
  }
}, 1000 / engine.scenario.ticksPerSecond);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && replayTransport.isPlaying) setReplayPlaying(false);
  if (document.hidden) clearHumanControls();
});

window.addEventListener('blur', clearHumanControls);

function frame(animationTime: number): void {
  if (mode === 'replay') {
    const advance = replayTransport.advance(animationTime - lastAnimationTime);
    if (advance.changed) {
      updateReplayInspector(replayTransport.current);
      showFrameCaptureFeedback(replayTransport.current);
    }
    if (advance.reachedEnd) syncReplayPlayButton();
    const replayFrame = replayTransport.current;
    renderer.render(replayFrame.state, {
      ambientTime: animationTime / 1000,
      smoothSpark: replayTransport.isPlaying,
    });
    updateStats(replayFrame.state);
  } else if (mode === 'live') {
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
      showFrameCaptureFeedback(replayTransport.current);
    }
    setMode('replay');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Could not fetch replay', 'error');
  }
}

for (const tier of ['easy', 'medium', 'hard', 'impossible'] as const) {
  const group = document.createElement('optgroup');
  group.label = tier.toUpperCase();
  for (const level of arcadeCampaign.filter((candidate) => candidate.metadata.tier === tier)) {
    const option = document.createElement('option');
    option.value = String(level.metadata.number);
    option.textContent = `${String(level.metadata.number).padStart(2, '0')} · ${level.metadata.title}`;
    group.append(option);
  }
  levelSelect.append(group);
}

installReplay(loadedReplay, 'Showcase controller');
catalogDifficultySelect.value = selectedDifficulty;
for (const filter of document.querySelectorAll<HTMLButtonElement>('[data-tier]')) {
  filter.setAttribute('aria-pressed', String(filter.dataset.tier === catalogTier));
}
updateFieldIdentity();
updateHomeSelection();
if (mode !== 'replay') configureFieldSurface(engine.snapshot());
const requestedTick = Number(params.get('tick') ?? 0);
if (Number.isFinite(requestedTick) && requestedTick > 0) {
  const requestedFrame = replayFrames.findIndex((candidate) => candidate.state.tick >= requestedTick);
  seekReplay(requestedFrame === -1 ? replayFrames.length - 1 : requestedFrame);
  showFrameCaptureFeedback(replayTransport.current);
}
setMode(mode);
if (liveStarted) playIntro.classList.add('hidden');
if (mode === 'replay' && params.get('autoplay') === '1') setReplayPlaying(true);
void loadReplayFromUrl();
requestAnimationFrame(frame);

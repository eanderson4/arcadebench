import { SmilefallEngine } from '../core/engine';
import type { ControlInput, SmilefallReplay, SmilefallState } from '../core/types';
import { SMILEFALL_GAME_ID, SMILEFALL_GAME_VERSION } from '../core/version';
import {
  arcadeStageByNumber,
  smilefallArcadeRun,
  smilefallCatalog,
  stageBySlug,
} from '../levels/catalog';
import {
  MOOD_BLURBS,
  MOOD_LABELS,
  MOOD_ORDER,
  applyMood,
  hasLethalHazards,
  requiredCatches,
  startingReserve,
} from '../levels/toolbox';
import type { SmilefallMoodId, SmilefallStage } from '../levels/types';
import { ContinuousSmilefallSession } from '../runtime/session';
import { buildSmilefallRankedProof, resolveOfficialSmilefallScenario } from '../verifier';
import { SmilefallAudio } from './audio';
import { FeedbackNoteDialog } from './feedback-note';
import {
  createSmilefallGameClient,
  type FeedbackSummary,
  type SmilefallGameClient,
} from './game-client';
import {
  LocalLeaderboardStore,
  SmilefallLeaderboardService,
  type LeaderboardEntry,
  type LeaderboardQuery,
  type LeaderboardScope,
  type SmilefallLeaderboardResult,
} from './leaderboard';
import { SmilefallRenderer } from './renderer';

type ViewMode = 'home' | 'catalog' | 'leaderboard' | 'play';
type PlayContext = 'arcade' | 'catalog';
type Phase = 'ready' | 'running' | 'paused' | 'result';

interface RankedChallenge {
  runId: string;
  nonce: number;
  boardId: LeaderboardScope;
  difficulty: SmilefallMoodId;
  levelId?: string;
}

interface CompletedStage {
  stage: SmilefallStage;
  state: SmilefallState;
  replay: SmilefallReplay;
}

interface CatalogVoteWidget {
  root: HTMLElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
  note: HTMLButtonElement;
  score: HTMLElement;
  detail: HTMLElement;
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  return element;
}

const params = new URLSearchParams(location.search);
const requestedDifficulty = params.get('difficulty');
let selectedDifficulty: SmilefallMoodId = MOOD_ORDER.includes(requestedDifficulty as SmilefallMoodId)
  ? requestedDifficulty as SmilefallMoodId
  : 'chuckle';
let selectedStage = stageBySlug(params.get('level') ?? '') ?? smilefallCatalog[0]!;
let mode: ViewMode = params.get('mode') === 'catalog'
  ? 'catalog'
  : params.get('mode') === 'leaderboard'
    ? 'leaderboard'
    : 'home';
let playContext: PlayContext = 'arcade';
let phase: Phase = 'ready';
let arcadeIndex = 0;
let completedStages: CompletedStage[] = [];
let stageRecorded = false;
let rankedChallenge: RankedChallenge | null = null;
let attemptGeneration = 0;
let attemptPending = false;
let leaderboardScope: LeaderboardScope = params.get('board') === 'level' ? 'level' : 'arcade';
let leaderboardLevelId = stageBySlug(params.get('level') ?? '')?.metadata.slug ?? smilefallCatalog[0]!.metadata.slug;

const configuredApiBaseUrl = import.meta.env.VITE_ARCADEBENCH_API_URL;
const localDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const publicServicesEnabled = configuredApiBaseUrl === 'local'
  ? false
  : Boolean(configuredApiBaseUrl) || !localDevelopment;
const gameClient: SmilefallGameClient | undefined = publicServicesEnabled
  ? createSmilefallGameClient({
      gameId: SMILEFALL_GAME_ID,
      gameVersion: SMILEFALL_GAME_VERSION,
      baseUrl: configuredApiBaseUrl || '/api/v2',
    })
  : undefined;
const leaderboardService = new SmilefallLeaderboardService(
  new LocalLeaderboardStore(localStorage),
  gameClient,
);

const audio = new SmilefallAudio();
const soundToggle = query<HTMLButtonElement>('#sound-toggle');
const playSoundToggle = query<HTMLButtonElement>('#play-sound-toggle');
const rankedStatus = query<HTMLElement>('#ranked-status');
const startArcadeButton = query<HTMLButtonElement>('#start-arcade');
const arcadeDifficulty = query<HTMLSelectElement>('#arcade-difficulty');
const openCatalogButton = query<HTMLButtonElement>('#open-catalog');
const openLeaderboardButton = query<HTMLButtonElement>('#open-leaderboard');
const demoWheel = query<HTMLElement>('#demo-wheel');

const catalogGrid = query<HTMLElement>('#catalog-grid');
const catalogDifficulty = query<HTMLSelectElement>('#catalog-difficulty');
const catalogLeaderboardButton = query<HTMLButtonElement>('#catalog-leaderboard');
const catalogHomeButton = query<HTMLButtonElement>('#catalog-home');

const leaderboardMode = query<HTMLElement>('#leaderboard-mode');
const leaderboardDifficulty = query<HTMLSelectElement>('#leaderboard-difficulty');
const leaderboardLevelWrap = query<HTMLElement>('#leaderboard-level-wrap');
const leaderboardLevel = query<HTMLSelectElement>('#leaderboard-level');
const leaderboardBoardTitle = query<HTMLElement>('#leaderboard-board-title');
const leaderboardHead = query<HTMLElement>('#leaderboard-head');
const leaderboardList = query<HTMLOListElement>('#leaderboard-list');
const leaderboardEmpty = query<HTMLElement>('#leaderboard-empty');
const leaderboardCatalogButton = query<HTMLButtonElement>('#leaderboard-catalog');
const leaderboardHomeButton = query<HTMLButtonElement>('#leaderboard-home');

const hudTitle = query<HTMLElement>('#hud-title');
const hudProgress = query<HTMLElement>('#hud-progress');
const hudRules = query<HTMLElement>('#hud-rules');
const hudScore = query<HTMLElement>('#hud-score');
const hudCombo = query<HTMLElement>('#hud-combo');
const hudClock = query<HTMLElement>('#hud-clock');
const bucketMeter = query<HTMLElement>('#bucket-meter');
const bucketMeterLabel = query<HTMLElement>('#bucket-meter-label');
const steerWheel = query<HTMLElement>('#steer-wheel');
const steerCount = query<HTMLElement>('#steer-count');
const reservePips = query<HTMLElement>('#reserve-pips');
const hopPips = query<HTMLElement>('#hop-pips');
const pauseButton = query<HTMLButtonElement>('#pause-button');
const quitButton = query<HTMLButtonElement>('#quit-button');

const readyOverlay = query<HTMLElement>('#ready-overlay');
const readyProgress = query<HTMLElement>('#ready-progress');
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
const resultActions = query<HTMLElement>('#result-actions');
const resultAgain = query<HTMLButtonElement>('#result-again');
const resultNext = query<HTMLButtonElement>('#result-next');
const resultScore = query<HTMLButtonElement>('#result-score');
const resultHome = query<HTMLButtonElement>('#result-home');
const scoreForm = query<HTMLFormElement>('#score-form');
const scoreName = query<HTMLInputElement>('#score-name');
const scoreSocial = query<HTMLInputElement>('#score-social');
const scoreStatus = query<HTMLElement>('#score-status');
const scoreSubmit = query<HTMLButtonElement>('#score-submit');
const scoreCancel = query<HTMLButtonElement>('#score-cancel');
const toast = query<HTMLElement>('#toast');

const fieldCanvas = query<HTMLCanvasElement>('#field');
const playHud = query<HTMLElement>('.hud');
const touchControls = query<HTMLElement>('.touch-controls');
const stageHint = query<HTMLElement>('.stage-hint');
const renderer = new SmilefallRenderer(fieldCanvas);
let session = createSession(selectedStage);
let scoreSaved = false;
let startingStageReserve = 0;
let accumulator = 0;
let lastFrameMs = performance.now();
let lastPipSignature = '';
const held = new Set<'left' | 'right' | 'hop'>();

function scenarioFor(stage: SmilefallStage): SmilefallStage['scenario'] {
  if (rankedChallenge?.difficulty === selectedDifficulty) {
    return resolveOfficialSmilefallScenario(stage.metadata.slug, selectedDifficulty, rankedChallenge.nonce);
  }
  return applyMood(stage.scenario, selectedDifficulty);
}

function createSession(stage: SmilefallStage): ContinuousSmilefallSession {
  return new ContinuousSmilefallSession(new SmilefallEngine(scenarioFor(stage)));
}

function formatClock(ticks: number | null, ticksPerSecond: number): string {
  if (ticks === null) return '∞';
  const seconds = Math.ceil(ticks / ticksPerSecond);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatElapsed(ticks: number): string {
  const seconds = Math.max(0, ticks) / 30;
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : `${seconds.toFixed(1)}s`;
}

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

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string): void {
  toast.textContent = message;
  toast.dataset.open = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.dataset.open = 'false'; }, 2400);
}

function setOverlay(overlay: HTMLElement, open: boolean): void {
  overlay.dataset.open = String(open);
  overlay.setAttribute('aria-hidden', String(!open));
}

function updateUrl(): void {
  const next = new URL(location.href);
  next.search = '';
  if (mode === 'catalog') next.searchParams.set('mode', 'catalog');
  if (mode === 'leaderboard') {
    next.searchParams.set('mode', 'leaderboard');
    next.searchParams.set('board', leaderboardScope);
    next.searchParams.set('difficulty', selectedDifficulty);
    if (leaderboardScope === 'level') next.searchParams.set('level', leaderboardLevelId);
  }
  history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`);
}

function setMode(next: ViewMode): void {
  if (attemptPending && next !== mode) {
    attemptGeneration += 1;
    rankedChallenge = null;
  }
  mode = next;
  document.body.dataset.screen = next;
  updateUrl();
  if (next === 'home') {
    query<HTMLElement>('#home-title').focus({ preventScroll: true });
  } else if (next === 'catalog') {
    renderCatalog();
    query<HTMLElement>('#catalog-title').focus({ preventScroll: true });
  } else if (next === 'leaderboard') {
    void renderLeaderboard();
    query<HTMLElement>('#leaderboard-title').focus({ preventScroll: true });
  }
}

function setPhase(next: Phase): void {
  const previous = phase;
  phase = next;
  setOverlay(readyOverlay, next === 'ready');
  setOverlay(pauseOverlay, next === 'paused');
  setOverlay(resultOverlay, next === 'result');
  pauseButton.textContent = next === 'paused' ? 'RESUME' : 'PAUSE';
  pauseButton.disabled = next === 'ready' || next === 'result';
  const modal = next !== 'running';
  playHud.inert = modal;
  touchControls.inert = modal;
  stageHint.inert = modal;
  playHud.setAttribute('aria-hidden', String(modal));
  touchControls.setAttribute('aria-hidden', String(modal));
  stageHint.setAttribute('aria-hidden', String(modal));
  if (next === 'paused') resumeButton.focus({ preventScroll: true });
  else if (next === 'running' && previous !== 'running') fieldCanvas.focus({ preventScroll: true });
}

function activeOverlay(): HTMLElement | null {
  if (mode !== 'play') return null;
  if (phase === 'ready') return readyOverlay;
  if (phase === 'paused') return pauseOverlay;
  if (phase === 'result') return resultOverlay;
  return null;
}

function trapOverlayTab(event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') return false;
  const overlay = activeOverlay();
  if (!overlay) return false;
  const focusable = [...overlay.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (focusable.length === 0) return false;
  const current = document.activeElement;
  const index = focusable.indexOf(current as HTMLElement);
  if (index < 0
    || (!event.shiftKey && index === focusable.length - 1)
    || (event.shiftKey && index === 0)) {
    event.preventDefault();
    (event.shiftKey ? focusable.at(-1) : focusable[0])!.focus();
    return true;
  }
  return false;
}

function currentInput(): ControlInput {
  const left = held.has('left');
  const right = held.has('right');
  return { lean: left === right ? 'none' : left ? 'left' : 'right', hop: held.has('hop') };
}

function cumulativeScore(current = session.engine.snapshot()): number {
  const prior = completedStages.reduce((total, stage) => total + stage.state.score, 0);
  return prior + (stageRecorded ? 0 : current.score);
}

const TIER_CHIP: Record<SmilefallMoodId, string> = {
  giggle: 'sf-chip sf-chip--mint',
  chuckle: 'sf-chip sf-chip--yolk',
  guffaw: 'sf-chip sf-chip--pink',
  cackle: 'sf-chip sf-chip--grape',
};

function ruleTags(stage: SmilefallStage): Array<{ text: string; hot?: boolean }> {
  const hasPlainRocks = stage.scenario.rocks.some((rock) => (rock.hazard ?? 'plain') === 'plain');
  const hasSpikedRocks = stage.scenario.rocks.some((rock) => rock.hazard === 'spiked');
  return [
    { text: 'GROUND BOUNCES' },
    ...(hasPlainRocks ? [{ text: 'ROUND ROCKS FROWN' }] : []),
    ...(hasSpikedRocks ? [{ text: 'SPIKED ROCKS POP', hot: true }] : []),
    ...((stage.scenario.spikes?.length ?? 0) > 0 ? [{ text: 'SPIKES POP', hot: true }] : []),
    ...((stage.scenario.platforms?.length ?? 0) > 0 ? [{ text: 'LEDGES BOUNCE' }] : []),
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

function difficultyOptions(select: HTMLSelectElement): void {
  select.replaceChildren(...MOOD_ORDER.map((difficulty) => {
    const option = document.createElement('option');
    option.value = difficulty;
    option.textContent = MOOD_LABELS[difficulty];
    return option;
  }));
  select.value = selectedDifficulty;
}

/* ----------------------------- feedback ----------------------------- */

const catalogVoteWidgets = new Map<string, CatalogVoteWidget>();
const catalogVotes = new Map<string, FeedbackSummary>();
const pendingFeedback = new Set<string>();
let catalogRenderVersion = 0;

const feedbackNoteDialog = new FeedbackNoteDialog({
  dialog: query<HTMLDialogElement>('#feedback-note'),
  form: query<HTMLFormElement>('#feedback-note-form'),
  subject: query<HTMLElement>('#feedback-note-subject'),
  textarea: query<HTMLTextAreaElement>('#feedback-note-text'),
  status: query<HTMLElement>('#feedback-note-status'),
  save: query<HTMLButtonElement>('#feedback-note-save'),
  clear: query<HTMLButtonElement>('#feedback-note-clear'),
  cancel: query<HTMLButtonElement>('#feedback-note-cancel'),
}, {
  currentSummary: (levelId) => catalogVotes.get(levelId),
  isPending: (levelId) => pendingFeedback.has(levelId),
  set: async (request) => {
    if (!gameClient) throw new Error('Feedback is available on arcadebench.org.');
    pendingFeedback.add(request.subject.id);
    try {
      return await gameClient.feedback.set({ ...request, channel: 'overall' });
    } finally {
      pendingFeedback.delete(request.subject.id);
    }
  },
  onSaved: (levelId, summary) => {
    catalogVotes.set(levelId, summary);
    renderCatalogVote(levelId);
  },
  announce: showToast,
});

function renderCatalogVote(levelId: string): void {
  const widget = catalogVoteWidgets.get(levelId);
  const summary = catalogVotes.get(levelId);
  if (!widget) return;
  if (!summary) {
    widget.up.disabled = true;
    widget.down.disabled = true;
    widget.note.disabled = true;
    widget.detail.textContent = gameClient ? 'Feedback unavailable' : 'Feedback available online';
    return;
  }
  widget.up.disabled = pendingFeedback.has(levelId);
  widget.down.disabled = pendingFeedback.has(levelId);
  widget.note.disabled = pendingFeedback.has(levelId);
  widget.up.setAttribute('aria-pressed', String(summary.viewerVote === 1));
  widget.down.setAttribute('aria-pressed', String(summary.viewerVote === -1));
  widget.score.textContent = `${summary.score >= 0 ? '+' : ''}${summary.score}`;
  widget.detail.textContent = `${summary.up} up · ${summary.down} down`;
  widget.note.textContent = summary.note ? 'EDIT NOTE' : 'PRIVATE NOTE';
}

async function setCatalogVote(stage: SmilefallStage, vote: -1 | 0 | 1): Promise<void> {
  if (!gameClient || pendingFeedback.has(stage.metadata.slug)) return;
  const levelId = stage.metadata.slug;
  const current = catalogVotes.get(levelId);
  if (!current) return;
  const nextVote = current.viewerVote === vote ? 0 : vote;
  pendingFeedback.add(levelId);
  renderCatalogVote(levelId);
  try {
    const summary = await gameClient.feedback.set({
      subject: { kind: 'level', id: levelId },
      channel: 'overall',
      vote: nextVote,
    });
    catalogVotes.set(levelId, summary);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not save feedback');
  } finally {
    pendingFeedback.delete(levelId);
    renderCatalogVote(levelId);
  }
}

function createCatalogCard(stage: SmilefallStage): HTMLElement {
  const card = document.createElement('article');
  card.className = 'sf-panel catalog-card';
  const heading = document.createElement('div');
  heading.className = 'catalog-card-heading';
  const titleWrap = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'sf-kicker';
  kicker.textContent = `LEVEL ${String(stage.metadata.number).padStart(2, '0')}`;
  const title = document.createElement('h2');
  title.className = 'sf-head';
  title.textContent = stage.metadata.title;
  titleWrap.append(kicker, title);
  const tier = document.createElement('span');
  tier.className = TIER_CHIP[stage.metadata.tier];
  tier.textContent = stage.metadata.tier;
  heading.append(titleWrap, tier);
  const description = document.createElement('p');
  description.textContent = stage.metadata.challenge;
  const features = document.createElement('span');
  features.className = 'sf-tags catalog-features';
  for (const feature of stage.metadata.features) {
    const tag = document.createElement('span');
    tag.textContent = feature;
    features.append(tag);
  }

  const community = document.createElement('div');
  community.className = 'catalog-community';
  const up = document.createElement('button');
  up.className = 'catalog-vote';
  up.type = 'button';
  up.textContent = '👍';
  up.setAttribute('aria-label', `Thumbs up ${stage.metadata.title}`);
  up.setAttribute('aria-pressed', 'false');
  const down = document.createElement('button');
  down.className = 'catalog-vote';
  down.type = 'button';
  down.textContent = '👎';
  down.setAttribute('aria-label', `Thumbs down ${stage.metadata.title}`);
  down.setAttribute('aria-pressed', 'false');
  const score = document.createElement('b');
  score.textContent = '—';
  const detail = document.createElement('small');
  detail.textContent = 'Loading feedback…';
  const note = document.createElement('button');
  note.className = 'sf-btn sf-btn--small sf-btn--ghost catalog-note';
  note.type = 'button';
  note.textContent = 'PRIVATE NOTE';
  community.append(up, down, score, detail, note);
  catalogVoteWidgets.set(stage.metadata.slug, { root: community, up, down, note, score, detail });
  up.addEventListener('click', () => void setCatalogVote(stage, 1));
  down.addEventListener('click', () => void setCatalogVote(stage, -1));
  note.addEventListener('click', () => feedbackNoteDialog.open(
    { subject: { kind: 'level', id: stage.metadata.slug }, label: stage.metadata.title },
    note,
  ));

  const actions = document.createElement('div');
  actions.className = 'catalog-card-actions';
  const play = document.createElement('button');
  play.className = 'sf-btn sf-btn--pink';
  play.type = 'button';
  play.textContent = 'PLAY LEVEL';
  play.dataset.catalogPlay = '';
  play.addEventListener('click', () => void startCatalogAttempt(stage));
  const leaders = document.createElement('button');
  leaders.className = 'sf-btn sf-btn--paper';
  leaders.type = 'button';
  leaders.textContent = 'SCORES';
  leaders.addEventListener('click', () => {
    leaderboardScope = 'level';
    leaderboardLevelId = stage.metadata.slug;
    setMode('leaderboard');
  });
  actions.append(play, leaders);
  card.append(heading, description, features, community, actions);
  return card;
}

function renderCatalog(): void {
  catalogDifficulty.value = selectedDifficulty;
  catalogVoteWidgets.clear();
  catalogGrid.replaceChildren(...smilefallCatalog.map(createCatalogCard));
  const version = ++catalogRenderVersion;
  for (const stage of smilefallCatalog) {
    if (!gameClient) {
      renderCatalogVote(stage.metadata.slug);
      continue;
    }
    void gameClient.feedback.get({ subject: { kind: 'level', id: stage.metadata.slug }, channel: 'overall' })
      .then((summary) => {
        catalogVotes.set(stage.metadata.slug, summary);
        if (version === catalogRenderVersion) renderCatalogVote(stage.metadata.slug);
      })
      .catch(() => {
        if (version === catalogRenderVersion) renderCatalogVote(stage.metadata.slug);
      });
  }
}

/* ---------------------------- ranked attempts ---------------------------- */

async function beginChallenge(scope: LeaderboardScope, stage?: SmilefallStage): Promise<boolean> {
  const generation = ++attemptGeneration;
  rankedChallenge = null;
  scoreSocial.checked = false;
  if (!gameClient) return true;
  try {
    const response = await gameClient.runs.begin({
      boardId: scope,
      context: {
        difficulty: selectedDifficulty,
        ...(scope === 'level' && stage ? { levelId: stage.metadata.slug } : {}),
      },
    });
    if (generation !== attemptGeneration) return false;
    if (typeof response.seed !== 'number' || !Number.isSafeInteger(response.seed) || response.seed < 0) {
      throw new Error('The leaderboard returned an invalid run challenge.');
    }
    rankedChallenge = {
      runId: response.id,
      nonce: response.seed,
      boardId: scope,
      difficulty: selectedDifficulty,
      ...(scope === 'level' && stage ? { levelId: stage.metadata.slug } : {}),
    };
    return true;
  } catch (error) {
    if (generation === attemptGeneration) {
      rankedStatus.dataset.tone = 'error';
      rankedStatus.textContent = 'The public board is unavailable. This attempt can still be played unranked.';
      showToast(error instanceof Error ? error.message : 'Public leaderboard unavailable');
      return true;
    }
    return false;
  }
}

function setAttemptPending(pending: boolean): void {
  attemptPending = pending;
  startArcadeButton.disabled = pending;
  arcadeDifficulty.disabled = pending;
  catalogDifficulty.disabled = pending;
  leaderboardDifficulty.disabled = pending;
  leaderboardLevel.disabled = pending;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-catalog-play]')) {
    button.disabled = pending;
  }
}

async function startArcadeAttempt(): Promise<void> {
  if (attemptPending) return;
  const launchMode = mode;
  setAttemptPending(true);
  try {
    scoreSaved = false;
    selectedStage = smilefallArcadeRun[0]!;
    playContext = 'arcade';
    arcadeIndex = 0;
    completedStages = [];
    const accepted = await beginChallenge('arcade');
    if (accepted && mode === launchMode) openStage(selectedStage);
  } finally {
    setAttemptPending(false);
  }
}

async function startCatalogAttempt(stage: SmilefallStage): Promise<void> {
  if (attemptPending) return;
  const launchMode = mode;
  setAttemptPending(true);
  try {
    scoreSaved = false;
    selectedStage = stage;
    playContext = 'catalog';
    completedStages = [];
    const accepted = await beginChallenge('level', stage);
    if (accepted && mode === launchMode) openStage(stage);
  } finally {
    setAttemptPending(false);
  }
}

/* -------------------------------- play -------------------------------- */

function openStage(stage: SmilefallStage): void {
  selectedStage = stage;
  session = createSession(stage);
  renderer.reset();
  startingStageReserve = startingReserve(session.engine.scenario);
  stageRecorded = false;
  accumulator = 0;
  lastPipSignature = '';
  held.clear();
  hudTitle.textContent = stage.metadata.title;
  hudProgress.textContent = playContext === 'arcade'
    ? `ARCADE · ${arcadeIndex + 1} / ${smilefallArcadeRun.length}`
    : `CATALOG · LEVEL ${String(stage.metadata.number).padStart(2, '0')}`;
  readyProgress.textContent = playContext === 'arcade'
    ? `Arcade level ${arcadeIndex + 1} of ${smilefallArcadeRun.length}`
    : `${MOOD_LABELS[selectedDifficulty]} catalog attempt`;
  readyTitle.textContent = stage.metadata.title;
  readyCopy.textContent = stage.metadata.challenge;
  paintRules(hudRules, stage);
  paintRules(readyRules, stage);
  restartButton.textContent = playContext === 'arcade' ? 'RESTART ARCADE RUN' : 'RESTART LEVEL';
  const scenario = session.engine.scenario;
  const aspect = scenario.width / Math.min(scenario.viewHeight ?? scenario.height, scenario.height);
  document.documentElement.style.setProperty('--sf-field-aspect', aspect.toFixed(3));
  mode = 'play';
  document.body.dataset.screen = 'play';
  scoreForm.hidden = true;
  resultActions.hidden = false;
  setPhase('ready');
  updateHud(session.engine.snapshot());
  readyStart.focus({ preventScroll: true });
}

function beginRun(): void {
  void audio.unlock();
  lastFrameMs = performance.now();
  accumulator = 0;
  setPhase('running');
}

function togglePause(): void {
  if (phase === 'running') setPhase('paused');
  else if (phase === 'paused') beginRun();
}

function pipRow(container: HTMLElement, total: number, remaining: number): void {
  const maximumPips = 6;
  container.replaceChildren();
  if (total > maximumPips) {
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
  steerCount.textContent = state.smilies.length === 1 ? '1 smile' : `${state.smilies.length} smiles`;
  hudScore.textContent = cumulativeScore(state).toLocaleString();
  hudCombo.textContent = `×${state.combo}`;
  hudClock.textContent = formatClock(state.timeRemainingTicks, session.engine.scenario.ticksPerSecond);
  const filled = state.buckets.reduce((total, bucket) => total + bucket.filled, 0);
  const capacity = state.buckets.reduce((total, bucket) => total + bucket.capacity, 0);
  bucketMeter.style.setProperty('--sf-meter-fill', `${Math.round((filled / capacity) * 100)}%`);
  bucketMeterLabel.textContent = `BUCKETS ${state.bucketsFilled} / ${state.bucketCount} · ${filled}/${capacity} SMILES`;
  const signature = `${state.reserveSmilies}/${startingStageReserve}:${state.hopCharges}/${state.hopChargesMax}`;
  if (signature !== lastPipSignature) {
    lastPipSignature = signature;
    pipRow(reservePips, startingStageReserve, Math.max(0, state.reserveSmilies));
    pipRow(hopPips, state.hopChargesMax, state.hopCharges);
  }
}

function recordCompletedStage(state: SmilefallState): void {
  if (stageRecorded) return;
  stageRecorded = true;
  completedStages.push({ stage: selectedStage, state, replay: session.replay() });
}

function runIsTerminal(state: SmilefallState): boolean {
  return playContext === 'catalog'
    || state.status !== 'won'
    || arcadeIndex >= smilefallArcadeRun.length - 1;
}

function finishStage(state: SmilefallState): void {
  recordCompletedStage(state);
  setPhase('result');
  const won = state.status === 'won';
  const terminal = runIsTerminal(state);
  const arcadeCompleted = playContext === 'arcade' && won && arcadeIndex === smilefallArcadeRun.length - 1;
  resultFace.className = won ? 'sf-face sf-anim-bob' : 'sf-face sf-face--sad';
  resultTitle.textContent = arcadeCompleted ? 'ARCADE CLEARED!' : won ? 'BUCKETS FULL!' : 'RUN OVER';
  resultCopy.textContent = arcadeCompleted
    ? 'Ten levels, one steering wheel, and every bucket filled.'
    : won
      ? playContext === 'arcade' ? 'Level clear. The next sky is already falling.' : 'Every bucket found a smile.'
      : state.failureReason === 'out_of_smilies'
        ? 'The reserve reached zero. There are not enough smiles left to fill the buckets.'
        : 'The clock reached zero before the buckets were full.';
  resultStats.replaceChildren(
    stat('Score', cumulativeScore(state).toLocaleString()),
    stat('Level time', formatElapsed(state.tick)),
    stat('Caught', `${state.caught}/${requiredCatches(session.engine.scenario)}`),
    stat('Popped', String(state.missed)),
    stat('Frowns', String(state.bonks)),
    stat('Reserve', `${Math.max(0, state.reserveSmilies)}/${startingStageReserve}`),
  );
  resultNext.hidden = terminal;
  resultNext.textContent = 'NEXT LEVEL →';
  resultAgain.hidden = !terminal;
  resultAgain.textContent = playContext === 'arcade' ? 'NEW ARCADE RUN' : 'TRY AGAIN';
  resultScore.hidden = !terminal;
  resultScore.disabled = leaderboardService.mode === 'public' && !rankedChallenge;
  resultHome.textContent = playContext === 'catalog' ? 'LEVEL CATALOG' : 'HOME';
  scoreForm.hidden = true;
  resultActions.hidden = false;
  if (terminal && resultScore.disabled) scoreStatus.textContent = 'This attempt is unranked because no server challenge was available.';
  resultTitle.focus({ preventScroll: true });
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
      for (const event of result.events) audio.playEvent(event);
      if (result.state.status !== 'running') {
        accumulator = 0;
        finishStage(result.state);
        break;
      }
    }
  }
  const state = session.engine.snapshot();
  renderer.render(state, { time: seconds, paused: phase !== 'running' });
  if (mode === 'play') updateHud(state);
  lastFrameMs = nowMs;
  requestAnimationFrame(frame);
}

/* ------------------------------ score form ------------------------------ */

function currentLeaderboardResult(): SmilefallLeaderboardResult {
  if (playContext === 'catalog') {
    const record = completedStages.at(-1);
    if (!record) throw new Error('No completed level to score.');
    return {
      scope: 'level',
      difficulty: selectedDifficulty,
      levelId: record.stage.metadata.slug,
      won: record.state.status === 'won',
      score: record.state.score,
      totalTicks: record.state.tick,
      popped: record.state.missed,
      caught: record.state.caught,
    };
  }
  return {
    scope: 'arcade',
    difficulty: selectedDifficulty,
    completed: completedStages.length === smilefallArcadeRun.length
      && completedStages.every((record) => record.state.status === 'won'),
    stageReached: Math.min(smilefallArcadeRun.length, arcadeIndex + 1),
    stagesCleared: completedStages.filter((record) => record.state.status === 'won').length,
    score: completedStages.reduce((total, record) => total + record.state.score, 0),
    totalTicks: completedStages.reduce((total, record) => total + record.state.tick, 0),
    popped: completedStages.reduce((total, record) => total + record.state.missed, 0),
  };
}

function currentProof(result: SmilefallLeaderboardResult): unknown {
  if (!rankedChallenge) return { local: true };
  return buildSmilefallRankedProof(
    completedStages.map((record) => ({
      levelId: record.stage.metadata.slug,
      ticks: record.replay.ticks.map((tick) => ({ tick: tick.tick, input: tick.input })),
    })),
    {
      runId: rankedChallenge.runId,
      nonce: rankedChallenge.nonce,
      boardId: result.scope,
      difficulty: selectedDifficulty,
      ...(result.scope === 'level' ? { levelId: result.levelId } : {}),
    },
  );
}

function openScoreForm(): void {
  resultActions.hidden = true;
  scoreForm.hidden = false;
  scoreStatus.textContent = leaderboardService.mode === 'public'
    ? 'This score will be checked against its replay.'
    : 'Local preview: this score stays on this device.';
  scoreName.focus();
}

async function submitScore(): Promise<void> {
  const result = currentLeaderboardResult();
  scoreSubmit.disabled = true;
  scoreStatus.dataset.tone = '';
  scoreStatus.textContent = 'CHECKING REPLAY…';
  try {
    const submission = await leaderboardService.submit({
      name: scoreName.value,
      result,
      proof: currentProof(result),
      runId: rankedChallenge?.runId,
      socialMedia: scoreSocial.checked,
    });
    leaderboardScope = submission.entry.result.scope;
    if (submission.entry.result.scope === 'level') leaderboardLevelId = submission.entry.result.levelId;
    scoreStatus.textContent = leaderboardService.mode === 'public' ? 'SCORE SAVED' : 'SCORE SAVED ON THIS DEVICE';
    showToast(scoreStatus.textContent);
    scoreSaved = true;
    setMode('leaderboard');
  } catch (error) {
    scoreStatus.dataset.tone = 'error';
    scoreStatus.textContent = error instanceof Error ? error.message : 'Could not save score.';
  } finally {
    scoreSubmit.disabled = false;
  }
}

/* ----------------------------- leaderboard ----------------------------- */

function boardQuery(): LeaderboardQuery {
  return leaderboardScope === 'arcade'
    ? { scope: 'arcade', difficulty: selectedDifficulty }
    : { scope: 'level', difficulty: selectedDifficulty, levelId: leaderboardLevelId };
}

function boardCell(label: string, value: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'leaderboard-cell';
  const small = document.createElement('small');
  small.textContent = label;
  const bold = document.createElement('b');
  bold.textContent = value;
  cell.append(small, bold);
  return cell;
}

function createBoardRow(entry: LeaderboardEntry, rank: number): HTMLElement {
  const row = document.createElement('li');
  row.className = `leaderboard-row${rank <= 3 ? ` top-${rank}` : ''}`;
  const result = entry.result;
  const resultLabel = result.scope === 'arcade'
    ? result.completed ? 'CLEAR' : `STAGE ${result.stageReached}`
    : result.won ? 'FULL' : 'ATTEMPT';
  const caught = result.scope === 'level' ? String(result.caught) : String(result.stagesCleared);
  row.append(
    boardCell('RANK', String(rank).padStart(2, '0')),
    boardCell('CALLSIGN', entry.name),
    boardCell('RESULT', resultLabel),
    boardCell('SCORE', result.score.toLocaleString()),
    boardCell('TIME', formatElapsed(result.totalTicks)),
    boardCell(result.scope === 'level' ? 'CAUGHT' : 'CLEARED', caught),
  );
  return row;
}

let boardRenderVersion = 0;
async function renderLeaderboard(): Promise<void> {
  const version = ++boardRenderVersion;
  leaderboardDifficulty.value = selectedDifficulty;
  leaderboardLevel.value = leaderboardLevelId;
  leaderboardLevelWrap.hidden = leaderboardScope !== 'level';
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-board-scope]')) {
    const selected = tab.dataset.boardScope === leaderboardScope;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  const stage = stageBySlug(leaderboardLevelId) ?? smilefallCatalog[0]!;
  leaderboardBoardTitle.textContent = leaderboardScope === 'arcade' ? 'Arcade Run' : stage.metadata.title;
  leaderboardMode.textContent = leaderboardService.mode === 'public'
    ? 'PUBLIC BOARD · VERIFIED REPLAYS'
    : 'LOCAL PREVIEW · THIS DEVICE';
  leaderboardHead.replaceChildren(
    ...['RANK', 'CALLSIGN', 'RESULT', 'SCORE', 'TIME', leaderboardScope === 'level' ? 'CAUGHT' : 'CLEARED']
      .map((label) => boardCell(label, label)),
  );
  leaderboardList.replaceChildren();
  leaderboardList.setAttribute('aria-busy', 'true');
  leaderboardEmpty.hidden = false;
  leaderboardEmpty.querySelector('b')!.textContent = 'LOADING SCORES…';
  leaderboardEmpty.querySelector('p')!.textContent = 'Checking the current board.';
  try {
    const entries = await leaderboardService.list(boardQuery());
    if (version !== boardRenderVersion) return;
    leaderboardList.replaceChildren(...entries.map(createBoardRow));
    leaderboardEmpty.hidden = entries.length > 0;
    if (entries.length === 0) {
      leaderboardEmpty.querySelector('b')!.textContent = 'NO SCORES YET';
      leaderboardEmpty.querySelector('p')!.textContent = 'Finish a run and claim the first spot.';
    }
  } catch (error) {
    if (version !== boardRenderVersion) return;
    leaderboardEmpty.hidden = false;
    leaderboardEmpty.querySelector('b')!.textContent = 'BOARD OFFLINE';
    leaderboardEmpty.querySelector('p')!.textContent = error instanceof Error ? error.message : 'Could not load scores.';
  } finally {
    if (version === boardRenderVersion) leaderboardList.setAttribute('aria-busy', 'false');
    updateUrl();
  }
}

/* ------------------------------- controls ------------------------------- */

function keyRole(code: string): 'left' | 'right' | 'hop' | null {
  switch (code) {
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Space': case 'ArrowUp': case 'KeyW': return 'hop';
    default: return null;
  }
}

function activeRun(): boolean {
  if (mode !== 'play') return false;
  if (phase === 'ready' || phase === 'running' || phase === 'paused') return true;
  if (phase !== 'result') return false;
  const betweenArcadeStages = playContext === 'arcade'
    && session.engine.snapshot().status === 'won'
    && arcadeIndex < smilefallArcadeRun.length - 1;
  return betweenArcadeStages || (!scoreSaved && !resultScore.disabled);
}

function confirmAbandon(): boolean {
  return !activeRun() || window.confirm('Leave this run? Its unsaved score will be lost.');
}

function goGameHome(): void {
  if (!confirmAbandon()) return;
  held.clear();
  attemptGeneration += 1;
  rankedChallenge = null;
  completedStages = [];
  setPhase('ready');
  setMode(playContext === 'catalog' ? 'catalog' : 'home');
}

function goArcadeBench(): void {
  if (!confirmAbandon()) return;
  // Mark the run abandoned before navigation so beforeunload does not ask a
  // second time after the in-game confirmation was already accepted.
  attemptGeneration += 1;
  rankedChallenge = null;
  completedStages = [];
  mode = 'home';
  location.assign('/');
}

function bindTouch(button: HTMLButtonElement, role: 'left' | 'right' | 'hop'): void {
  let assistiveRelease: ReturnType<typeof setTimeout> | undefined;
  const showHeld = (pressed: boolean): void => {
    if (pressed) button.dataset.held = 'true';
    else delete button.dataset.held;
    button.setAttribute('aria-pressed', String(pressed));
  };
  const press = (event: PointerEvent): void => {
    event.preventDefault();
    void audio.unlock();
    if (phase === 'ready') beginRun();
    if (phase !== 'running') return;
    button.setPointerCapture(event.pointerId);
    showHeld(true);
    held.add(role);
  };
  const release = (): void => {
    showHeld(false);
    held.delete(role);
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('click', (event) => {
    // Pointer activation was already handled above. A zero-detail click comes
    // from a keyboard, switch control, screen reader, or script.
    if (event.detail !== 0) return;
    void audio.unlock();
    if (phase === 'ready') beginRun();
    if (phase !== 'running') return;
    if (role === 'hop') {
      clearTimeout(assistiveRelease);
      held.add(role);
      showHeld(true);
      assistiveRelease = setTimeout(release, 80);
      return;
    }
    const pressed = !held.has(role);
    if (pressed) held.add(role);
    else held.delete(role);
    showHeld(pressed);
  });
}

window.addEventListener('keydown', (event) => {
  if (trapOverlayTab(event)) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select, button') || query<HTMLDialogElement>('#feedback-note').open) return;
  if (mode === 'home' && event.code === 'Enter') {
    event.preventDefault();
    void startArcadeAttempt();
    return;
  }
  if (mode !== 'play') return;
  const role = keyRole(event.code);
  if (role) {
    event.preventDefault();
    if (phase === 'ready') beginRun();
    if (phase === 'running') held.add(role);
    return;
  }
  if (event.code === 'Enter' && phase === 'ready') { event.preventDefault(); beginRun(); }
  if ((event.code === 'KeyP' || event.code === 'Escape') && (phase === 'running' || phase === 'paused')) {
    event.preventDefault();
    togglePause();
  }
});

window.addEventListener('keyup', (event) => {
  const role = keyRole(event.code);
  if (role) held.delete(role);
});

window.addEventListener('blur', () => {
  held.clear();
  if (phase === 'running') setPhase('paused');
});

window.addEventListener('beforeunload', (event) => {
  if (!activeRun()) return;
  event.preventDefault();
  event.returnValue = '';
});

/* -------------------------------- wiring -------------------------------- */

startArcadeButton.addEventListener('click', () => void startArcadeAttempt());
openCatalogButton.addEventListener('click', () => setMode('catalog'));
openLeaderboardButton.addEventListener('click', () => {
  leaderboardScope = 'arcade';
  setMode('leaderboard');
});
catalogHomeButton.addEventListener('click', () => setMode('home'));
catalogLeaderboardButton.addEventListener('click', () => setMode('leaderboard'));
leaderboardHomeButton.addEventListener('click', () => setMode('home'));
leaderboardCatalogButton.addEventListener('click', () => setMode('catalog'));

catalogDifficulty.addEventListener('change', () => {
  selectedDifficulty = catalogDifficulty.value as SmilefallMoodId;
  arcadeDifficulty.value = selectedDifficulty;
  leaderboardDifficulty.value = selectedDifficulty;
  renderCatalog();
});
leaderboardDifficulty.addEventListener('change', () => {
  selectedDifficulty = leaderboardDifficulty.value as SmilefallMoodId;
  arcadeDifficulty.value = selectedDifficulty;
  catalogDifficulty.value = selectedDifficulty;
  void renderLeaderboard();
});
arcadeDifficulty.addEventListener('change', () => {
  selectedDifficulty = arcadeDifficulty.value as SmilefallMoodId;
  catalogDifficulty.value = selectedDifficulty;
  leaderboardDifficulty.value = selectedDifficulty;
});
leaderboardLevel.addEventListener('change', () => {
  leaderboardLevelId = leaderboardLevel.value;
  void renderLeaderboard();
});
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-board-scope]')) {
  tab.addEventListener('click', () => {
    leaderboardScope = tab.dataset.boardScope as LeaderboardScope;
    void renderLeaderboard();
  });
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const scope: LeaderboardScope = event.key === 'ArrowLeft' || event.key === 'Home' ? 'arcade' : 'level';
    leaderboardScope = scope;
    query<HTMLButtonElement>(`[data-board-scope="${scope}"]`).focus();
    void renderLeaderboard();
  });
}

readyStart.addEventListener('click', beginRun);
pauseButton.addEventListener('click', togglePause);
resumeButton.addEventListener('click', beginRun);
restartButton.addEventListener('click', () => {
  if (playContext === 'arcade') void startArcadeAttempt();
  else void startCatalogAttempt(selectedStage);
});
pauseHome.addEventListener('click', goGameHome);
quitButton.addEventListener('click', goArcadeBench);
resultHome.addEventListener('click', goGameHome);
resultAgain.addEventListener('click', () => {
  if (playContext === 'arcade') void startArcadeAttempt();
  else void startCatalogAttempt(selectedStage);
});
resultNext.addEventListener('click', () => {
  const next = arcadeStageByNumber(arcadeIndex + 2);
  if (!next) return;
  arcadeIndex += 1;
  openStage(next);
});
resultScore.addEventListener('click', openScoreForm);
scoreCancel.addEventListener('click', () => {
  scoreForm.hidden = true;
  resultActions.hidden = false;
  resultScore.focus();
});
scoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitScore();
});

bindTouch(query<HTMLButtonElement>('#touch-left'), 'left');
bindTouch(query<HTMLButtonElement>('#touch-hop'), 'hop');
bindTouch(query<HTMLButtonElement>('#touch-right'), 'right');

const soundStored = localStorage.getItem('arcadebench.smilefall.sound');
audio.setEnabled(soundStored !== 'off');
function syncSound(): void {
  for (const button of [soundToggle, playSoundToggle]) {
    button.setAttribute('aria-pressed', String(audio.isEnabled));
    button.textContent = audio.isEnabled ? 'SOUND ON' : 'SOUND OFF';
  }
}
function toggleSound(): void {
  audio.setEnabled(!audio.isEnabled);
  localStorage.setItem('arcadebench.smilefall.sound', audio.isEnabled ? 'on' : 'off');
  if (audio.isEnabled) void audio.unlock().then(() => audio.click());
  syncSound();
}
soundToggle.addEventListener('click', toggleSound);
playSoundToggle.addEventListener('click', toggleSound);

if (import.meta.env.DEV) {
  Object.assign(window, {
    smilefall: {
      state: () => session.engine.snapshot(),
      open: (slug: string, difficulty: SmilefallMoodId = selectedDifficulty) => {
        const stage = stageBySlug(slug);
        if (!stage) return;
        selectedDifficulty = difficulty;
        playContext = 'catalog';
        completedStages = [];
        openStage(stage);
      },
      step: (ticks: number, input: Partial<ControlInput> = {}) => {
        const applied: ControlInput = { lean: 'none', hop: false, ...input };
        const time = performance.now() / 1000;
        for (let index = 0; index < ticks; index++) {
          if (session.engine.snapshot().status !== 'running') break;
          setPhase('running');
          session.setInput(applied);
          const result = session.tick();
          renderer.pushEvents(result.events, result.state, time);
          if (result.state.status !== 'running') finishStage(result.state);
        }
        const state = session.engine.snapshot();
        renderer.render(state, { time });
        updateHud(state);
        return state;
      },
    },
  });
}

for (const select of [arcadeDifficulty, catalogDifficulty, leaderboardDifficulty]) difficultyOptions(select);
leaderboardLevel.replaceChildren(...smilefallCatalog.map((stage) => {
  const option = document.createElement('option');
  option.value = stage.metadata.slug;
  option.textContent = `${String(stage.metadata.number).padStart(2, '0')} · ${stage.metadata.title}`;
  return option;
}));
leaderboardLevel.value = leaderboardLevelId;
rankedStatus.textContent = leaderboardService.mode === 'public'
  ? 'Arcade and level runs use verified leaderboards.'
  : 'Local preview: scores stay in this browser.';
syncSound();
setMode(mode);

const DEMO_LEANS = ['none', 'right', 'right', 'none', 'left', 'left'] as const;
setInterval(() => {
  if (mode !== 'home') return;
  demoWheel.dataset.lean = DEMO_LEANS[Math.floor(Date.now() / 900) % DEMO_LEANS.length]!;
}, 300);
requestAnimationFrame(frame);

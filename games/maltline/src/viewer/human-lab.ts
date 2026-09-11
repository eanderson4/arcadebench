import { MaltlineEngine } from '../core/engine';
import { mulberry32 } from '../core/rng';
import { IDLE_INPUT, type MaltlineState } from '../core/types';
import {
  materializeCanonicalP108Campaign,
  type P108CanonicalCampaignPackage,
  type P108CanonicalLabCandidateId,
} from '../experiments/p1-08-candidates';
import {
  advanceP108HumanLabObservation,
  P108_HUMAN_LAB_ZERO_OBSERVATION,
  type P108HumanLabObservation,
} from '../experiments/human-lab-observation';
import {
  createP108HumanLabState,
  reduceP108HumanLab,
  type P108HumanLabArtifact,
  type P108HumanLabConsentEvidence,
  type P108HumanLabState,
  type P108LabJarExperience,
  type P108LabPacing,
  type P108RoundChoice,
} from '../experiments/human-lab-session';
import {
  P108_HUMAN_LAB_CONSENT_STATEMENT_ID,
  type P108HumanLabStudyAssignment,
} from '../experiments/human-lab-study';
import {
  createP108HumanLabTiming,
  reduceP108HumanLabTiming,
  snapshotP108HumanLabTiming,
  type P108HumanLabInterruptionKind,
} from '../experiments/human-lab-timing';
import { FixedStepClock } from './fixed-step-clock';
import { prepareMaltlineFonts } from './fonts';
import { MALTLINE_COUNTDOWN_SERVE_MS, MALTLINE_COUNTDOWN_STEP_MS } from './gameplay-flow';
import { MaltlineRenderer } from './renderer';
import { MaltlineEventAnnouncer, semanticPlayStatus } from './semantic-status';
import { mountMaltlineShell, type OverlayPresentation } from './shell';
import { isEditableOrInteractiveTarget, isRepeatedPresentationAction } from './viewer-session';
import { MaltlineViewerInputAdapter } from './viewer-input-adapter';

type AssignmentOrder = readonly [P108CanonicalLabCandidateId, P108CanonicalLabCandidateId];
interface AssignmentRecord {
  assignmentOrder: AssignmentOrder;
  studyAssignment: P108HumanLabStudyAssignment;
}

const ASSIGNMENT_TOKENS = new Map<string, AssignmentRecord>([
  ['exp049-lab-k7m4q2', { assignmentOrder: ['a-registered-control', 'd-combined'],
    studyAssignment: { experienceStratum: 'first-time', assignedViewportCssWidth: 1280 } }],
  ['exp049-lab-p9v2n6', { assignmentOrder: ['d-combined', 'a-registered-control'],
    studyAssignment: { experienceStratum: 'first-time', assignedViewportCssWidth: 1280 } }],
  ['exp049-lab-r3c8w5', { assignmentOrder: ['a-registered-control', 'd-combined'],
    studyAssignment: { experienceStratum: 'first-time', assignedViewportCssWidth: 700 } }],
  ['exp049-lab-x6h1t9', { assignmentOrder: ['d-combined', 'a-registered-control'],
    studyAssignment: { experienceStratum: 'first-time', assignedViewportCssWidth: 700 } }],
  ['exp049-lab-c4n7d2', { assignmentOrder: ['a-registered-control', 'd-combined'],
    studyAssignment: { experienceStratum: 'informed', assignedViewportCssWidth: 1280 } }],
  ['exp049-lab-v8j3m6', { assignmentOrder: ['d-combined', 'a-registered-control'],
    studyAssignment: { experienceStratum: 'informed', assignedViewportCssWidth: 1280 } }],
  ['exp049-lab-h2w9q5', { assignmentOrder: ['a-registered-control', 'd-combined'],
    studyAssignment: { experienceStratum: 'informed', assignedViewportCssWidth: 700 } }],
  ['exp049-lab-t6r1k8', { assignmentOrder: ['d-combined', 'a-registered-control'],
    studyAssignment: { experienceStratum: 'informed', assignedViewportCssWidth: 700 } }],
]);
const MAXIMUM_CATCH_UP_TICKS = 6;
const PARTICIPANT_CODE_PATTERN = /^p-[a-z0-9]{6,12}$/u;
const CONSENT_DISCLOSURE = [
  `Consent statement v2 · ${P108_HUMAN_LAB_CONSENT_STATEMENT_ID}.`,
  'This local playtest records your facilitator code, assigned experience and width, gameplay inputs and outcomes, interruption timing, stage feedback, and final comparison in memory on this device.',
  'Nothing is ranked or sent over the network, and no browser storage is used.',
  'This is a keyboard-only session expected to take approximately 15–20 minutes.',
  'Participation is voluntary. You may stop at any time without saving.',
] as const;

type ActiveLabPhase = 'practice' | 'round1' | 'round2';
type LabSurface = 'welcome' | 'stage-card' | 'countdown' | 'playing' | 'terminal' | 'intermission'
  | 'stage-pulse' | 'round-experience' | 'comparison' | 'frozen' | 'debrief' | 'stopped'
  | 'paused';

interface PendingTerminal {
  status: 'won' | 'lost';
  observationMode: 'engine-observed' | 'test-driver-synthetic';
  scenarioId: string;
  score: number;
  scoreDelta: number;
  lives: number;
  serviceActions: number;
  fulfilled: number;
  walkouts: number;
  resolved: number;
  exited: number;
  lossReasons: P108HumanLabObservation['lossReasons'];
  interactionCounts: P108HumanLabObservation['interactionCounts'];
}

interface StagePulseDraft {
  round: 1 | 2;
  stage: number;
  terminalStatus: 'won' | 'lost';
  perceivedPressure: number | null;
  pacing: P108LabPacing | null;
  hardestDecision: string;
  lossExplanation: string;
}

interface RoundExperienceDraft {
  round: 1 | 2;
  jarExperience: P108LabJarExperience | null;
  recoveryPossible: number | null;
}

interface FinalComparisonDraft {
  clearerRamp: P108RoundChoice | null;
  fairer: P108RoundChoice | null;
  moreEnjoyable: P108RoundChoice | null;
  rounds: [RoundExperienceDraft, RoundExperienceDraft];
  scoreBelief: string;
}

interface HumanLabTestDriver {
  snapshot(): Readonly<{
    phase: P108HumanLabState['phase'];
    surface: LabSurface;
    activeStage: number | null;
    activeLives: number | null;
    activeScore: number | null;
    engineTick: number;
    mappingRevealed: boolean;
  }>;
  advance(): void;
  completeCountdown(): void;
  finishStage(status?: 'won' | 'lost'): void;
  pause(): void;
  resume(): void;
}

declare global {
  interface Window {
    __maltlineHumanLabTestDriver?: HumanLabTestDriver;
  }
}

function rejectEntry(message: string): void {
  document.documentElement.dataset.maltlineHumanLabReady = 'rejected';
  const main = document.createElement('main');
  main.className = 'human-lab__error';
  main.setAttribute('role', 'alert');
  const kicker = document.createElement('p');
  kicker.textContent = 'LOCAL PLAYTEST · UNRANKED';
  const title = document.createElement('h1');
  title.textContent = 'Assignment required';
  const body = document.createElement('p');
  body.textContent = message;
  main.append(kicker, title, body);
  document.body.replaceChildren(main);
}

function stopEntry(): Promise<never> {
  return new Promise<never>(() => undefined);
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

document.documentElement.dataset.maltlineHumanLabReady = 'initializing';
const parameters = new URLSearchParams(window.location.search);
const token = parameters.get('token');
const testDriverEnabled = import.meta.env.DEV && parameters.get('labTestDriver') === '1';
const assignment = token === null ? undefined : ASSIGNMENT_TOKENS.get(token);
if (token === null || assignment === undefined) {
  rejectEntry('Ask the facilitator for a valid opaque assignment link. Gameplay has not started.');
  await stopEntry();
}
const resolvedAssignment = assignment as AssignmentRecord;
if (window.innerWidth !== resolvedAssignment.studyAssignment.assignedViewportCssWidth) {
  rejectEntry(`This assignment requires a window exactly ${resolvedAssignment.studyAssignment.assignedViewportCssWidth} CSS pixels wide. Ask the facilitator to restore the assigned test width.`);
  await stopEntry();
}
const { assignmentOrder, studyAssignment } = resolvedAssignment;

const [controlPackage, combinedPackage] = await Promise.all([
  materializeCanonicalP108Campaign({ candidateId: 'a-registered-control', seedOffset: 0 }),
  materializeCanonicalP108Campaign({ candidateId: 'd-combined', seedOffset: 0 }),
]);
const packages: Readonly<Record<P108CanonicalLabCandidateId, P108CanonicalCampaignPackage>> = {
  'a-registered-control': controlPackage,
  'd-combined': combinedPackage,
};
const assignmentTokenSha256 = await sha256Text(token!);
const fontPreparation = await prepareMaltlineFonts();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shell = mountMaltlineShell();
shell.root.setAttribute('aria-label', 'Maltline local unranked playtest');
shell.root.setAttribute('aria-describedby', 'human-lab-identity');
shell.competitionButton.remove();
shell.controls.querySelector('span:last-child')?.remove();

const banner = document.createElement('section');
banner.className = 'human-lab__banner';
banner.id = 'human-lab-identity';
banner.setAttribute('aria-label', 'Local playtest status');
const identity = document.createElement('strong');
identity.textContent = 'LOCAL PLAYTEST · UNRANKED · NOTHING IS SUBMITTED';
const progress = document.createElement('span');
progress.className = 'human-lab__progress';
const stopPlaytest = document.createElement('button');
stopPlaytest.type = 'button';
stopPlaytest.className = 'human-lab__stop';
stopPlaytest.textContent = 'Stop playtest';
stopPlaytest.setAttribute('aria-label', 'Stop playtest without saving');
stopPlaytest.hidden = true;
stopPlaytest.addEventListener('click', stopWithoutSaving);
banner.append(identity, progress, stopPlaytest);
shell.root.querySelector('.stage-wrap')!.before(banner);

const drawingContext = shell.canvas.getContext('2d');
if (drawingContext === null) {
  rejectEntry('Canvas drawing is unavailable in this browser. Gameplay has not started.');
  await stopEntry();
}
const context = drawingContext as CanvasRenderingContext2D;

let state = createP108HumanLabState({
  assignmentOrder,
  executionMode: testDriverEnabled ? 'test-driver' : 'human',
  studyAssignment,
  provenance: {
    assignmentTokenSha256,
    entryEnvironment: {
      viewportCssWidth: window.innerWidth,
      viewportCssHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      reducedMotion,
    },
    sourceAuthority: controlPackage.sourceAuthority,
    candidates: assignmentOrder.map((candidateId) => {
      const candidatePackage = packages[candidateId];
      return {
        candidateId,
        seedOffset: candidatePackage.seedOffset,
        candidateFingerprint: candidatePackage.fingerprints.candidate,
        effectiveCampaignFingerprint: candidatePackage.fingerprints.effectiveCampaign,
        scenarios: candidatePackage.fingerprints.scenarios,
      };
    }),
  },
});
let timing = createP108HumanLabTiming({ nowMs: performance.now(), active: false });
let engine = new MaltlineEngine(controlPackage.campaign[0]!);
let rendererNowMs = 0;
const renderer = new MaltlineRenderer({
  random: mulberry32(0x5041_3130),
  nowMs: () => rendererNowMs,
  reducedMotion,
});
renderer.setScenario(engine.scenario);
let clock = new FixedStepClock(engine.scenario.ticksPerSecond, MAXIMUM_CATCH_UP_TICKS);
let inputAdapter = new MaltlineViewerInputAdapter(engine.scenario);
let observation = P108_HUMAN_LAB_ZERO_OBSERVATION;
const announcer = new MaltlineEventAnnouncer(shell.liveEvents);
let surface: LabSurface = 'welcome';
let priorSurface: LabSurface = 'welcome';
let pendingTerminal: PendingTerminal | null = null;
let pulseDraft: StagePulseDraft | null = null;
const finalDraft: FinalComparisonDraft = {
  clearerRamp: null,
  fairer: null,
  moreEnjoyable: null,
  rounds: [
    { round: 1, jarExperience: null, recoveryPossible: null },
    { round: 2, jarExperience: null, recoveryPossible: null },
  ],
  scoreBelief: '',
};
let activeAction: (() => void) | null = null;
let lastFrameTime: number | null = null;
let countdownTimer: number | undefined;
let countdownGeneration = 0;
let windowFocused = document.hasFocus();
let mappingRevealed = false;
let downloadUrl: string | null = null;
let participantCodeDraft = '';
let consentAffirmedDraft = false;

function activePhase(): ActiveLabPhase | null {
  return state.phase === 'practice' || state.phase === 'round1' || state.phase === 'round2'
    ? state.phase : null;
}

function roundNumber(): 1 | 2 | null {
  return state.phase === 'round1' ? 1 : state.phase === 'round2' ? 2 : null;
}

function stagePackage(): P108CanonicalCampaignPackage {
  const round = roundNumber();
  return round === null ? controlPackage : packages[state.assignmentOrder[round - 1]];
}

function updateProgress(): void {
  if (surface === 'stopped') progress.textContent = 'Stopped · nothing saved';
  else if (state.phase === 'welcome') progress.textContent = 'Welcome · paired local session';
  else if (state.phase === 'practice') progress.textContent = `Practice · stage ${state.activeStage ?? 1} / 3`;
  else if (state.phase === 'round1' || state.phase === 'round2') {
    progress.textContent = `Round ${roundNumber()} / 2 · stage ${(state.activeStage ?? 4) - 3} / 4`;
  } else if (state.phase === 'intermission') progress.textContent = 'Round 1 saved locally · intermission';
  else if (state.phase === 'stage-pulse') {
    const round = state.pendingPulseRound ?? pulseDraft?.round;
    const stage = pulseDraft?.stage ?? state.rounds[(round ?? 1) - 1]?.stages.at(-1)?.stage;
    progress.textContent = `Round ${round} / 2 · Stage ${(stage ?? 4) - 3} / 4 feedback`;
  } else if (state.phase === 'comparison') {
    progress.textContent = surface === 'round-experience'
      ? 'Both rounds complete · round experience'
      : 'Both rounds complete · final comparison';
  }
  else if (state.phase === 'frozen') progress.textContent = 'Answers frozen · local download ready';
  else progress.textContent = 'Local session complete · debrief';
  stopPlaytest.hidden = surface === 'stopped'
    || !['practice', 'round1', 'round2', 'stage-pulse', 'intermission', 'comparison']
      .includes(state.phase);
}

function assignedWidthMatches(): boolean {
  return window.innerWidth === studyAssignment.assignedViewportCssWidth;
}

function assignedExperienceLabel(): string {
  return studyAssignment.experienceStratum === 'first-time'
    ? 'First-time Maltline player'
    : 'Informed Maltline player';
}

function resetMotionAnchor(): void {
  inputAdapter.reset();
  clock.reset();
  lastFrameTime = null;
}

function cancelCountdown(): void {
  countdownGeneration += 1;
  if (countdownTimer === undefined) return;
  window.clearTimeout(countdownTimer);
  countdownTimer = undefined;
}

function setTimingActive(active: boolean): void {
  timing = reduceP108HumanLabTiming(timing, { type: 'set-active', nowMs: performance.now(), active });
}

function stopTimingSafely(): void {
  const nowMs = performance.now();
  timing = timing.openInterruption === null
    ? reduceP108HumanLabTiming(timing, { type: 'set-active', nowMs, active: false })
    : reduceP108HumanLabTiming(timing, { type: 'resume', nowMs, active: false });
}

function cleanActions(): void {
  shell.overlayCard.querySelector('.human-lab__actions')?.remove();
}

function actionButton(label: string, action: () => void, quiet = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `human-lab__button${quiet ? ' human-lab__button--quiet' : ''}`;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function radioQuestion(
  name: string,
  question: string,
  options: readonly (readonly [string, string])[],
  selected: string | number | null,
  onChange: (value: string) => void,
  scale = false,
): { fieldset: HTMLFieldSetElement; firstInput: HTMLInputElement } {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'human-lab__question';
  const legend = document.createElement('legend');
  legend.textContent = question;
  const choices = document.createElement('div');
  choices.className = `human-lab__choices${scale ? ' human-lab__choices--scale' : ''}`;
  let firstInput: HTMLInputElement | null = null;
  for (const [value, label] of options) {
    const choice = document.createElement('label');
    choice.className = 'human-lab__choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.required = true;
    input.checked = String(selected) === value;
    input.addEventListener('change', () => onChange(value));
    firstInput ??= input;
    const copy = document.createElement('span');
    copy.textContent = label;
    choice.append(input, copy);
    choices.append(choice);
  }
  fieldset.append(legend, choices);
  return { fieldset, firstInput: firstInput! };
}

function textQuestion(
  name: string,
  question: string,
  value: string,
  required: boolean,
  onInput: (value: string) => void,
): { label: HTMLLabelElement; textarea: HTMLTextAreaElement } {
  const label = document.createElement('label');
  label.className = 'human-lab__text-question';
  const copy = document.createElement('span');
  copy.textContent = question;
  const textarea = document.createElement('textarea');
  textarea.name = name;
  textarea.maxLength = 280;
  textarea.rows = 2;
  textarea.required = required;
  textarea.value = value;
  textarea.addEventListener('input', () => onInput(textarea.value));
  label.append(copy, textarea);
  return { label, textarea };
}

function showLabOverlay(
  presentation: OverlayPresentation,
  buildActions?: (host: HTMLElement) => HTMLElement | null,
): void {
  cleanActions();
  shell.showOverlay(presentation, false);
  const host = document.createElement('div');
  host.className = 'human-lab__actions human-lab__actions--centered';
  const focusTarget = buildActions?.(host) ?? null;
  if (host.childElementCount > 0) shell.overlayCard.append(host);
  (focusTarget ?? shell.overlayCard).focus({ preventScroll: true });
}

function describeCurrentSurvey(form: HTMLFormElement, text: string): void {
  const description = document.createElement('p');
  description.id = 'human-lab-survey-description';
  description.className = 'visually-hidden';
  description.textContent = text;
  form.prepend(description);
  shell.overlayCard.setAttribute(
    'aria-describedby',
    'overlay-body overlay-hint human-lab-survey-description',
  );
}

function isSurveySurface(value: LabSurface): boolean {
  return value === 'stage-pulse' || value === 'round-experience' || value === 'comparison';
}

function welcome(): void {
  surface = 'welcome';
  updateProgress();
  const fallback = fontPreparation.status === 'fallback'
    ? ' The bundled display font did not load, so a system fallback is active.' : '';
  activeAction = testDriverEnabled ? startTestPractice : null;
  if (!testDriverEnabled) {
    showLabOverlay({
      variant: 'instructions',
      kicker: 'PAIRED LOCAL SESSION · CONSENT',
      title: 'CHECK YOUR ASSIGNMENT',
      body: 'Confirm the facilitator-assigned study cell, review the complete local-data disclosure, and affirm before practice can begin.',
      steps: [
        `Assigned experience · ${assignedExperienceLabel()}`,
        `Assigned test width · ${studyAssignment.assignedViewportCssWidth} CSS pixels`,
      ],
      hint: 'There is no keyboard shortcut around consent.',
      announcement: 'Maltline local unranked playtest consent. Review the assignment and disclosure before choosing whether to participate.',
    }, (host) => {
      host.classList.remove('human-lab__actions--centered');
      const form = document.createElement('form');
      form.className = 'human-lab__consent';
      form.noValidate = false;

      const disclosure = document.createElement('section');
      disclosure.id = 'human-lab-consent-disclosure';
      disclosure.className = 'human-lab__disclosure';
      for (const statement of CONSENT_DISCLOSURE) {
        const paragraph = document.createElement('p');
        paragraph.textContent = statement;
        disclosure.append(paragraph);
      }

      const codeLabel = document.createElement('label');
      codeLabel.className = 'human-lab__consent-field';
      const codeCopy = document.createElement('span');
      codeCopy.textContent = 'Facilitator participant code';
      const codeHint = document.createElement('small');
      codeHint.id = 'human-lab-participant-code-hint';
      codeHint.textContent = 'Required format: p- followed by 6–12 lowercase letters or digits.';
      const code = document.createElement('input');
      code.type = 'text';
      code.name = 'participantCode';
      code.required = true;
      code.pattern = 'p-[a-z0-9]{6,12}';
      code.autocomplete = 'off';
      code.spellcheck = false;
      code.setAttribute('aria-describedby', codeHint.id);
      code.value = participantCodeDraft;
      code.addEventListener('input', () => {
        participantCodeDraft = code.value;
        code.setCustomValidity('');
      });
      codeLabel.append(codeCopy, codeHint, code);

      const affirmation = document.createElement('label');
      affirmation.className = 'human-lab__affirmation';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'consentAffirmed';
      checkbox.required = true;
      checkbox.checked = consentAffirmedDraft;
      checkbox.addEventListener('change', () => { consentAffirmedDraft = checkbox.checked; });
      const affirmationCopy = document.createElement('span');
      affirmationCopy.textContent = 'I affirm that I reviewed this disclosure and voluntarily agree to participate in this local playtest.';
      affirmation.append(checkbox, affirmationCopy);

      const actions = document.createElement('div');
      actions.className = 'human-lab__consent-actions';
      const submit = actionButton('Affirm and start practice', () => undefined);
      submit.type = 'submit';
      const stop = actionButton('Stop without saving', stopWithoutSaving, true);
      actions.append(submit, stop);
      form.append(disclosure, codeLabel, affirmation, actions);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!PARTICIPANT_CODE_PATTERN.test(code.value)) {
          code.setCustomValidity('Use p- followed by 6–12 lowercase letters or digits.');
        }
        if (!form.reportValidity()) return;
        beginPractice(code.value, {
          kind: 'participant-affirmed',
          statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID,
          affirmed: true,
        });
      });
      host.append(form);
      shell.overlayCard.setAttribute('aria-describedby',
        'overlay-body overlay-steps overlay-hint human-lab-consent-disclosure');
      return code;
    });
    return;
  }
  showLabOverlay({
    variant: 'instructions',
    kicker: 'PAIRED LOCAL SESSION',
    title: 'TWO ROUNDS · ONE COUNTER',
    body: `First, learn the shop in a short practice. Then play two four-stage rounds and choose which felt clearer, fairer, and more enjoyable.${fallback}`,
    steps: [
      'Keyboard only · about 15–20 minutes',
      'Four lives · one attempt per round',
      'Nothing is ranked or transmitted',
      'You may stop at any time',
    ],
    hint: 'Your round assignment stays hidden until the optional debrief.',
    announcement: 'Maltline local unranked playtest. Two rounds and nothing is submitted.',
  }, (host) => {
    const button = actionButton('Start practice', startTestPractice);
    host.append(button);
    return button;
  });
}

function beginCurrentEngine(): void {
  const phase = activePhase();
  if (phase === null || state.activeStage === null || state.activeRun === null) {
    throw new Error('A lab engine can begin only for an active stage');
  }
  const scenario = stagePackage().campaign[state.activeStage - 1]!;
  engine = new MaltlineEngine(scenario, state.activeRun);
  clock = new FixedStepClock(scenario.ticksPerSecond, MAXIMUM_CATCH_UP_TICKS);
  inputAdapter = new MaltlineViewerInputAdapter(scenario);
  observation = P108_HUMAN_LAB_ZERO_OBSERVATION;
  renderer.resetPresentation();
  renderer.setScenario(engine.scenario);
  announcer.reset();
  pendingTerminal = null;
  resetMotionAnchor();
  showStageCard();
}

function beginPractice(
  participantCode: string,
  consentEvidence: P108HumanLabConsentEvidence,
): void {
  state = reduceP108HumanLab(state, { type: 'consent', participantCode, consentEvidence });
  beginCurrentEngine();
}

function startTestPractice(): void {
  beginPractice('p-test001', {
    kind: 'test-driver-bypass',
    statementId: null,
    affirmed: false,
  });
}

function stopWithoutSaving(): void {
  cancelCountdown();
  resetMotionAnchor();
  stopTimingSafely();
  surface = 'stopped';
  activeAction = null;
  pendingTerminal = null;
  pulseDraft = null;
  announcer.reset();
  mappingRevealed = false;
  updateProgress();
  showLabOverlay({
    variant: 'terminal',
    kicker: 'LOCAL SESSION ENDED',
    title: 'NOTHING WAS SAVED',
    body: 'The local playtest ended without saving. No artifact was created and nothing was submitted or stored.',
    hint: 'You may close this tab.',
    announcement: 'Local playtest stopped. Nothing was saved, submitted, or stored.',
  });
}

function showStageCard(): void {
  cancelCountdown();
  surface = 'stage-card';
  updateProgress();
  const phase = activePhase()!;
  const labStage = phase === 'practice' ? state.activeStage! : state.activeStage! - 3;
  const stageCount = phase === 'practice' ? 3 : 4;
  const label = phase === 'practice' ? 'PRACTICE' : `ROUND ${roundNumber()}`;
  activeAction = beginCountdown;
  showLabOverlay({
    variant: 'stage',
    kicker: `${label} · STAGE ${labStage} / ${stageCount}`,
    title: engine.scenario.name.toUpperCase(),
    body: phase === 'practice'
      ? 'Learn the real counter: match each order, hold Space until READY, slide with F or Enter, and face returning jars to catch them.'
      : 'Keep the line moving. This round starts fresh and its setup remains hidden until debrief.',
    steps: phase === 'practice'
      ? [`${engine.scenario.lanes} windows · ${engine.scenario.customerCount} orders · neutral control setup`]
      : ['Local comparison stage · setup details stay hidden until debrief'],
    hint: 'Press Enter or choose Begin stage',
    announcement: `${label}, stage ${labStage} of ${stageCount}, ${engine.scenario.name}.`,
  }, (host) => {
    const button = actionButton('Begin stage', beginCountdown);
    host.append(button);
    return button;
  });
}

type CountdownStep = 3 | 2 | 1 | 'SERVE';

function showCountdownStep(step: CountdownStep, generation: number, focus = false): void {
  if (generation !== countdownGeneration || surface !== 'countdown') return;
  const phase = activePhase()!;
  const labStage = phase === 'practice' ? state.activeStage! : state.activeStage! - 3;
  const stageCount = phase === 'practice' ? 3 : 4;
  const label = phase === 'practice' ? 'PRACTICE' : `ROUND ${roundNumber()}`;
  cleanActions();
  shell.showOverlay({
    variant: 'countdown',
    kicker: `${label} · STAGE ${labStage} / ${stageCount}`,
    title: String(step),
    body: engine.scenario.name,
    hint: step === 'SERVE'
      ? 'Match · blend · slide · face to catch'
      : 'Hands on controls · starts automatically',
    announcement: step === 3
      ? `Get ready. ${label}, stage ${labStage} of ${stageCount}, ${engine.scenario.name}.`
      : step === 'SERVE' ? 'Serve.' : undefined,
  });
  if (focus) shell.overlayCard.focus({ preventScroll: true });

  const next: CountdownStep | null = step === 3 ? 2 : step === 2 ? 1 : step === 1 ? 'SERVE' : null;
  const delay = step === 'SERVE' ? MALTLINE_COUNTDOWN_SERVE_MS : MALTLINE_COUNTDOWN_STEP_MS;
  countdownTimer = window.setTimeout(() => {
    countdownTimer = undefined;
    if (generation !== countdownGeneration || surface !== 'countdown') return;
    if (next === null) enterPlaying();
    else showCountdownStep(next, generation);
  }, delay);
}

function beginCountdown(): void {
  if (surface !== 'stage-card') return;
  cancelCountdown();
  resetMotionAnchor();
  setTimingActive(false);
  surface = 'countdown';
  activeAction = null;
  const generation = countdownGeneration;
  showCountdownStep(3, generation, true);
}

function enterPlaying(): void {
  if (!assignedWidthMatches() || document.hidden || !windowFocused) {
    const kind: P108HumanLabInterruptionKind = !assignedWidthMatches()
      ? window.innerWidth < 700 ? 'unsupported-width' : 'width-stratum-mismatch'
      : document.hidden ? 'hidden' : 'blur';
    pauseLab(`The playtest cannot resume until this page is visible, focused, and exactly ${studyAssignment.assignedViewportCssWidth} pixels wide.`, kind);
    return;
  }
  cancelCountdown();
  cleanActions();
  resetMotionAnchor();
  surface = 'playing';
  setTimingActive(true);
  shell.hideOverlay(true);
  updateProgress();
  updateSemantic(engine.snapshot());
}

function terminal(
  status: 'won' | 'lost',
  snapshot = engine.snapshot(),
  observationMode: PendingTerminal['observationMode'] = 'engine-observed',
): void {
  if (surface !== 'playing' || pendingTerminal !== null) return;
  setTimingActive(false);
  resetMotionAnchor();
  pendingTerminal = {
    status,
    observationMode,
    scenarioId: snapshot.scenarioId,
    score: snapshot.score,
    scoreDelta: snapshot.score - state.activeRun!.score,
    lives: status === 'lost' ? 0 : snapshot.lives,
    serviceActions: snapshot.serviceActions,
    fulfilled: snapshot.fulfilled,
    walkouts: snapshot.walkouts,
    resolved: snapshot.resolved,
    exited: snapshot.exited,
    lossReasons: observation.lossReasons,
    interactionCounts: observation.interactionCounts,
  };
  surface = 'terminal';
  const phase = activePhase()!;
  const next = phase === 'practice'
    ? status === 'lost' ? 'Begin Round 1'
      : state.activeStage === 3 ? 'Begin Round 1' : 'Continue practice'
    : 'Continue local session';
  activeAction = commitTerminal;
  showLabOverlay({
    variant: 'terminal',
    kicker: status === 'won' ? 'STAGE TERMINAL · PAUSED' : 'ROUND TERMINAL · PAUSED',
    title: status === 'won' ? 'WINDOW CLOSED' : 'OUT OF LIVES',
    body: `${status === 'won' ? 'Stage cleared' : phase === 'practice'
      ? 'Practice ended after this loss; Round 1 will start fresh with four lives and score zero'
      : 'This one-attempt round ended'}. Local score ${pendingTerminal.score}. No ticks or inputs are recorded while this screen is open.`,
    hint: 'This result is local and unranked.',
    announcement: `${status === 'won' ? 'Stage clear' : 'Out of lives'}. Play is paused.`,
  }, (host) => {
    const button = actionButton(next, commitTerminal);
    host.append(button);
    return button;
  });
}

function commitTerminal(): void {
  if (pendingTerminal === null || state.activeStage === null) return;
  const terminalPhase = activePhase();
  const terminalStage = state.activeStage;
  const terminalStatus = pendingTerminal.status;
  state = reduceP108HumanLab(state, {
    type: 'stage-terminal',
    stage: state.activeStage,
    ...pendingTerminal,
  });
  pendingTerminal = null;
  if (activePhase() !== null) beginCurrentEngine();
  else if (state.phase === 'stage-pulse') {
    pulseDraft = {
      round: terminalPhase === 'round2' ? 2 : 1,
      stage: terminalStage,
      terminalStatus,
      perceivedPressure: null,
      pacing: null,
      hardestDecision: '',
      lossExplanation: '',
    };
    showStagePulse();
  }
  else if (state.phase === 'intermission') intermission();
  else roundExperience();
}

function showStagePulse(): void {
  if (state.phase !== 'stage-pulse' || pulseDraft === null) {
    throw new Error('Stage-pulse presentation requires a pending comparison pulse');
  }
  surface = 'stage-pulse';
  activeAction = null;
  resetMotionAnchor();
  updateProgress();
  const draft = pulseDraft;
  showLabOverlay({
    variant: 'instructions',
    kicker: `ROUND ${draft.round} · STAGE ${draft.stage - 3} FEEDBACK`,
    title: draft.terminalStatus === 'lost' ? 'WHAT HAPPENED?' : 'QUICK PULSE',
    body: 'Answer from the stage you just played. The setup remains hidden and the next stage stays paused.',
    hint: draft.terminalStatus === 'lost'
      ? 'Pressure, pacing, and your loss explanation are required.'
      : 'Pressure and pacing are required. The hardest-decision note is optional.',
    announcement: `Round ${draft.round}, stage ${draft.stage - 3} feedback. Play remains paused.`,
  }, (host) => {
    host.classList.remove('human-lab__actions--centered');
    const form = document.createElement('form');
    form.className = 'human-lab__survey human-lab__pulse';
    const pressure = radioQuestion(
      'pulse-pressure',
      'How intense did the pressure feel? 1 is low; 7 is overwhelming.',
      [1, 2, 3, 4, 5, 6, 7].map((value) => [String(value), String(value)] as const),
      draft.perceivedPressure,
      (value) => { draft.perceivedPressure = Number(value); },
      true,
    );
    const pacing = radioQuestion(
      'pulse-pacing',
      'How did the pacing feel?',
      [['too-idle', 'Too idle'], ['balanced', 'Balanced'], ['too-relentless', 'Too relentless']],
      draft.pacing,
      (value) => { draft.pacing = value as P108LabPacing; },
    );
    const hardest = textQuestion(
      'pulse-hardest',
      'Optional: what was the hardest decision or most confusing moment?',
      draft.hardestDecision,
      false,
      (value) => { draft.hardestDecision = value; },
    );
    form.append(pressure.fieldset, pacing.fieldset, hardest.label);
    let lossTextarea: HTMLTextAreaElement | null = null;
    if (draft.terminalStatus === 'lost') {
      const loss = textQuestion(
        'pulse-loss',
        'Required: what do you think caused the loss?',
        draft.lossExplanation,
        true,
        (value) => { draft.lossExplanation = value; },
      );
      lossTextarea = loss.textarea;
      lossTextarea.addEventListener('input', () => lossTextarea?.setCustomValidity(''));
      form.append(loss.label);
    }
    const submit = actionButton('Save stage feedback', () => undefined);
    submit.type = 'submit';
    form.append(submit);
    describeCurrentSurvey(form, [
      'Answer from the stage you just played; the next stage remains paused.',
      'Required: rate perceived pressure from 1 low through 7 overwhelming.',
      'Required: choose whether pacing felt too idle, balanced, or too relentless.',
      'Optional: describe the hardest decision or most confusing moment.',
      draft.terminalStatus === 'lost'
        ? 'Required after this loss: explain what you think caused the loss.'
        : 'No loss explanation is requested because this stage was cleared.',
    ].join(' '));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (draft.perceivedPressure === null || draft.pacing === null) return;
      if (draft.terminalStatus === 'lost' && !draft.lossExplanation.trim()) {
        lossTextarea!.setCustomValidity('Explain what you think caused the loss.');
        lossTextarea!.reportValidity();
        lossTextarea!.focus();
        return;
      }
      state = reduceP108HumanLab(state, {
        type: 'stage-pulse',
        round: draft.round,
        stage: draft.stage,
        perceivedPressure: draft.perceivedPressure,
        pacing: draft.pacing,
        hardestDecision: draft.hardestDecision.trim() || null,
        lossExplanation: draft.terminalStatus === 'lost'
          ? draft.lossExplanation.trim() || null : null,
      });
      pulseDraft = null;
      if (activePhase() !== null) beginCurrentEngine();
      else if (state.phase === 'intermission') intermission();
      else roundExperience();
    });
    host.append(form);
    if (draft.perceivedPressure === null) return pressure.firstInput;
    if (draft.pacing === null) return pacing.firstInput;
    if (draft.terminalStatus === 'lost' && !draft.lossExplanation.trim()) return lossTextarea;
    return submit;
  });
}

function intermission(): void {
  surface = 'intermission';
  resetMotionAnchor();
  updateProgress();
  activeAction = beginRoundTwo;
  showLabOverlay({
    variant: 'standard',
    kicker: 'HALFWAY · LOCAL ONLY',
    title: 'ROUND 1 SAVED LOCALLY',
    body: 'Take an untimed break. Round 2 starts from score zero with four lives, cleared inputs, and no carried presentation effects.',
    hint: 'The two setups are still hidden.',
    announcement: 'Round 1 saved locally. Take a break, then begin Round 2.',
  }, (host) => {
    const button = actionButton('Begin Round 2', beginRoundTwo);
    host.append(button);
    return button;
  });
}

function beginRoundTwo(): void {
  state = reduceP108HumanLab(state, { type: 'begin-round2' });
  beginCurrentEngine();
}

const COMPARISON_QUESTIONS = [
  ['clearerRamp', 'Which round had the clearer pressure ramp?'],
  ['fairer', 'Which round felt fairer?'],
  ['moreEnjoyable', 'Which round was more enjoyable?'],
] as const;

const JAR_OPTIONS = [
  ['planning', 'Mostly planning'],
  ['waiting', 'Mostly waiting'],
  ['both', 'Both'],
  ['neither', 'Neither'],
] as const;

function roundExperience(): void {
  surface = 'round-experience';
  activeAction = null;
  resetMotionAnchor();
  updateProgress();
  showLabOverlay({
    variant: 'instructions',
    kicker: 'BOTH ROUNDS COMPLETE · STEP 1 OF 2',
    title: 'RATE EACH ROUND',
    body: 'Think about jar circulation and whether mistakes felt recoverable in each round. The setups remain hidden.',
    hint: 'Choose one jar experience and one recovery rating for each round.',
    announcement: 'Both rounds complete. Rate the jar experience and recovery in each round.',
  }, (host) => {
    host.classList.remove('human-lab__actions--centered');
    const form = document.createElement('form');
    form.className = 'human-lab__survey human-lab__round-experience';
    let firstInput: HTMLInputElement | null = null;
    for (const draft of finalDraft.rounds) {
      const section = document.createElement('section');
      section.className = 'human-lab__round-card';
      section.setAttribute('aria-labelledby', `round-${draft.round}-experience-title`);
      const heading = document.createElement('h2');
      heading.id = `round-${draft.round}-experience-title`;
      heading.textContent = `Round ${draft.round}`;
      const jars = radioQuestion(
        `round-${draft.round}-jars`,
        'Did jar circulation feel like planning or waiting?',
        JAR_OPTIONS,
        draft.jarExperience,
        (value) => { draft.jarExperience = value as P108LabJarExperience; },
      );
      const recovery = radioQuestion(
        `round-${draft.round}-recovery`,
        'How possible did recovery after a mistake feel? 1 is impossible; 7 is easy.',
        [1, 2, 3, 4, 5, 6, 7].map((value) => [String(value), String(value)] as const),
        draft.recoveryPossible,
        (value) => { draft.recoveryPossible = Number(value); },
        true,
      );
      firstInput ??= jars.firstInput;
      section.append(heading, jars.fieldset, recovery.fieldset);
      form.append(section);
    }
    const submit = actionButton('Continue to final comparison', () => undefined);
    submit.type = 'submit';
    form.append(submit);
    describeCurrentSurvey(
      form,
      'For Round 1 and Round 2, answer both questions. Required: choose whether jar circulation felt mostly like planning, mostly like waiting, both, or neither. Required: rate whether recovery after a mistake felt possible from 1 impossible through 7 easy.',
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (finalDraft.rounds.some((draft) => draft.jarExperience === null
        || draft.recoveryPossible === null)) return;
      comparison();
    });
    host.append(form);
    const firstUnanswered = finalDraft.rounds.flatMap((draft, index) => {
      const section = form.querySelectorAll<HTMLElement>('.human-lab__round-card')[index]!;
      return [
        draft.jarExperience === null
          ? section.querySelector<HTMLInputElement>(`input[name="round-${draft.round}-jars"]`) : null,
        draft.recoveryPossible === null
          ? section.querySelector<HTMLInputElement>(`input[name="round-${draft.round}-recovery"]`) : null,
      ];
    }).find((element): element is HTMLInputElement => element !== null);
    return firstUnanswered ?? firstInput ?? submit;
  });
}

function comparison(): void {
  surface = 'comparison';
  activeAction = null;
  resetMotionAnchor();
  updateProgress();
  showLabOverlay({
    variant: 'instructions',
    kicker: 'BOTH ROUNDS COMPLETE',
    title: 'COMPARE THE FEEL',
    body: 'Choose Round 1, Round 2, or No difference, then briefly explain what you believe generated score.',
    hint: 'All comparisons and the score explanation are required. Nothing is submitted.',
    announcement: 'Both rounds complete. Compare their pressure, fairness, and enjoyment.',
  }, (host) => {
    host.classList.remove('human-lab__actions--centered');
    const form = document.createElement('form');
    form.className = 'human-lab__survey human-lab__comparison';
    let firstInput: HTMLInputElement | null = null;
    for (const [name, question] of COMPARISON_QUESTIONS) {
      const questionDraft = finalDraft[name];
      const field = radioQuestion(
        name,
        question,
        [['1', 'Round 1'], ['2', 'Round 2'], ['same', 'No difference']],
        questionDraft,
        (value) => { finalDraft[name] = value === '1' ? 1 : value === '2' ? 2 : 'same'; },
      );
      if (questionDraft === null) firstInput ??= field.firstInput;
      form.append(field.fieldset);
    }
    const belief = textQuestion(
      'scoreBelief',
      'Required: what do you believe generated score?',
      finalDraft.scoreBelief,
      true,
      (value) => { finalDraft.scoreBelief = value; },
    );
    belief.textarea.addEventListener('input', () => belief.textarea.setCustomValidity(''));
    form.append(belief.label);
    const submit = actionButton('Freeze my answers', () => undefined);
    submit.type = 'submit';
    form.append(submit);
    describeCurrentSurvey(
      form,
      'Required: choose Round 1, Round 2, or No difference for the clearer pressure ramp, fairness, and enjoyment questions. Required: explain in 1 to 280 characters what you believe generated score. Answers freeze before the setups are revealed.',
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (finalDraft.clearerRamp === null || finalDraft.fairer === null
        || finalDraft.moreEnjoyable === null || finalDraft.rounds.some((draft) =>
        draft.jarExperience === null || draft.recoveryPossible === null)) return;
      if (!finalDraft.scoreBelief.trim()) {
        belief.textarea.setCustomValidity('Explain what you believe generated score.');
        belief.textarea.reportValidity();
        belief.textarea.focus();
        return;
      }
      state = reduceP108HumanLab(state, {
        type: 'freeze',
        clearerRamp: finalDraft.clearerRamp,
        fairer: finalDraft.fairer,
        moreEnjoyable: finalDraft.moreEnjoyable,
        rounds: finalDraft.rounds.map((draft) => ({
          round: draft.round,
          jarExperience: draft.jarExperience!,
          recoveryPossible: draft.recoveryPossible!,
        })) as [
          { round: 1; jarExperience: P108LabJarExperience; recoveryPossible: number },
          { round: 2; jarExperience: P108LabJarExperience; recoveryPossible: number },
        ],
        scoreBelief: finalDraft.scoreBelief,
        timing: snapshotP108HumanLabTiming(timing, performance.now()),
      });
      frozen();
    });
    host.append(form);
    return firstInput ?? (!finalDraft.scoreBelief.trim() ? belief.textarea : submit);
  });
}

function artifactUrl(artifact: P108HumanLabArtifact): string {
  if (downloadUrl !== null) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([`${JSON.stringify(artifact, null, 2)}\n`], {
    type: 'application/json',
  }));
  return downloadUrl;
}

function frozen(): void {
  surface = 'frozen';
  activeAction = null;
  resetMotionAnchor();
  updateProgress();
  const artifact = state.artifact!;
  const synthetic = artifact.executionMode === 'test-driver';
  showLabOverlay({
    variant: 'terminal',
    kicker: synthetic ? 'SYNTHETIC TEST-DRIVER RUN' : 'ANSWERS FROZEN',
    title: synthetic ? 'NON-HUMAN ARTIFACT' : 'LOCAL ARTIFACT READY',
    body: synthetic
      ? 'This artifact was generated with the browser test driver. It must not be counted as human playtest evidence.'
      : 'Your comparison is fixed. Download the unranked JSON for the facilitator, then optionally reveal which setup appeared in each round.',
    hint: synthetic
      ? 'Synthetic provenance is embedded in the JSON and filename.'
      : 'No network submission, leaderboard, account, or browser storage was used.',
    announcement: synthetic ? 'Synthetic test-driver artifact ready. Do not count it as human evidence.'
      : 'Answers frozen. Your local unranked artifact is ready to download.',
  }, (host) => {
    const download = document.createElement('a');
    download.className = 'human-lab__download';
    download.href = artifactUrl(artifact);
    download.download = synthetic ? 'maltline-exp049-test-driver-synthetic.json'
      : 'maltline-exp049-local-session.json';
    download.textContent = synthetic ? 'Download synthetic JSON' : 'Download local JSON';
    const reveal = actionButton('Reveal setups', debrief, true);
    host.append(download, reveal);
    return download;
  });
}

function debrief(): void {
  state = reduceP108HumanLab(state, { type: 'debrief' });
  mappingRevealed = true;
  showDebrief();
}

function showDebrief(): void {
  surface = 'debrief';
  activeAction = null;
  updateProgress();
  const firstIsControl = state.assignmentOrder[0] === 'a-registered-control';
  showLabOverlay({
    variant: 'terminal',
    kicker: 'OPTIONAL DEBRIEF',
    title: 'SETUPS REVEALED',
    body: `Round 1 was setup ${firstIsControl ? 'A' : 'D'}; Round 2 was setup ${firstIsControl ? 'D' : 'A'}. A is the unchanged generation-2 control. D adjusts only the Stage 5 resource cadence and Stage 7 bridge pressure.`,
    hint: 'The downloaded artifact remains local and unranked.',
    announcement: 'Setups revealed. The local playtest is complete.',
  });
}

function updateSemantic(snapshot: MaltlineState): void {
  const phase = activePhase();
  const meta = phase === 'practice'
    ? { stageIndex: state.activeStage! - 1, stageCount: 3 }
    : { stageIndex: state.activeStage! - 4, stageCount: 4 };
  const playStatus = semanticPlayStatus(engine.scenario, snapshot, meta);
  const candidateNeutralStatus = phase === 'practice'
    ? playStatus
    : playStatus.replace(/\d+ orders left\. /u, '');
  shell.semanticStatus.textContent = `${identity.textContent}. ${progress.textContent}. ${candidateNeutralStatus}`;
}

function pauseLab(reason: string, kind: P108HumanLabInterruptionKind): void {
  if (surface === 'stopped') return;
  const interruptedSurface = surface;
  cancelCountdown();
  resetMotionAnchor();
  if (surface === 'paused') return;
  timing = reduceP108HumanLabTiming(timing, { type: 'pause', nowMs: performance.now(), kind,
    phase: state.phase, surface: interruptedSurface });
  priorSurface = interruptedSurface === 'countdown' ? 'stage-card' : interruptedSurface;
  surface = 'paused';
  showLabOverlay({
    variant: 'terminal',
    kicker: 'LOCAL SESSION PAUSED',
    title: 'READY WHEN YOU ARE',
    body: `${reason} No gameplay ticks or inputs were recorded during the interruption.`,
    hint: 'Restore the page, then explicitly resume.',
    announcement: 'Local playtest paused. Restore the page and choose Resume.',
  }, (host) => {
    const button = actionButton('Resume local session', resumeLab);
    host.append(button);
    return button;
  });
}

function resumeLab(): void {
  if (surface !== 'paused' || !assignedWidthMatches() || document.hidden || !windowFocused) return;
  resetMotionAnchor();
  const target = priorSurface;
  timing = reduceP108HumanLabTiming(timing, { type: 'resume', nowMs: performance.now(),
    active: target === 'playing' });
  if (target === 'playing') enterPlaying();
  else if (target === 'welcome') welcome();
  else if (target === 'stage-card') showStageCard();
  else if (target === 'terminal' && pendingTerminal !== null) {
    const interruptedTerminal = pendingTerminal;
    pendingTerminal = null;
    surface = 'playing';
    terminal(interruptedTerminal.status, {
      ...engine.snapshot(),
      score: interruptedTerminal.score,
      lives: interruptedTerminal.lives,
    }, interruptedTerminal.observationMode);
  }
  else if (target === 'intermission') intermission();
  else if (target === 'stage-pulse') showStagePulse();
  else if (target === 'round-experience') roundExperience();
  else if (target === 'comparison') comparison();
  else if (target === 'frozen') frozen();
  else if (target === 'debrief') showDebrief();
}

shell.root.addEventListener('keydown', (event) => {
  if (surface === 'stopped') return;
  if (isEditableOrInteractiveTarget(event.target)) return;
  if (isRepeatedPresentationAction(event.code, event.repeat)) {
    event.preventDefault();
    return;
  }
  if (surface !== 'playing') {
    if (surface === 'countdown' && (event.code === 'Enter' || event.code === 'Space')) {
      event.preventDefault();
      return;
    }
    if ((event.code === 'Enter' || event.code === 'Space') && activeAction !== null) {
      event.preventDefault();
      activeAction();
    }
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
    event.preventDefault();
  }
  inputAdapter.keyDown(event.code);
});

shell.overlayCard.addEventListener('keydown', (event) => {
  const focusOwned = isSurveySurface(surface)
    || (surface === 'welcome' && !testDriverEnabled);
  if (event.code !== 'Tab' || !focusOwned) return;
  const focusable = [...shell.overlayCard.querySelectorAll<HTMLElement>(
    'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]',
  )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  if (!stopPlaytest.hidden) focusable.push(stopPlaytest);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (!shell.overlayCard.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  }
});
stopPlaytest.addEventListener('keydown', (event) => {
  if (event.code !== 'Tab' || event.shiftKey || !isSurveySurface(surface)) return;
  const first = shell.overlayCard.querySelector<HTMLElement>(
    'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]',
  );
  if (first === null) return;
  event.preventDefault();
  first.focus();
});
shell.root.addEventListener('keyup', (event) => {
  if (surface !== 'stopped') inputAdapter.keyUp(event.code);
});
shell.root.addEventListener('focusout', (event) => {
  if (surface === 'stopped') return;
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !shell.root.contains(next) || isEditableOrInteractiveTarget(next)) {
    inputAdapter.reset();
  }
});

window.addEventListener('blur', () => {
  if (surface === 'stopped') return;
  windowFocused = false;
  pauseLab('The browser window lost focus.', 'blur');
});
window.addEventListener('focus', () => {
  if (surface === 'stopped') return;
  windowFocused = true;
  resetMotionAnchor();
  focusResumeAction();
});
document.addEventListener('visibilitychange', () => {
  if (surface === 'stopped') return;
  if (document.hidden) pauseLab('The page moved into the background.', 'hidden');
  else {
    resetMotionAnchor();
    focusResumeAction();
  }
});
window.addEventListener('resize', () => {
  if (surface === 'stopped') return;
  if (!assignedWidthMatches()) {
    const belowMinimum = window.innerWidth < 700;
    pauseLab(belowMinimum
      ? `The window is narrower than the assigned ${studyAssignment.assignedViewportCssWidth}-pixel test width.`
      : `The window no longer matches the assigned ${studyAssignment.assignedViewportCssWidth}-pixel test width.`,
    belowMinimum ? 'unsupported-width' : 'width-stratum-mismatch');
  } else focusResumeAction();
});

function focusResumeAction(): void {
  if (surface !== 'paused' || document.hidden || !windowFocused || !assignedWidthMatches()) return;
  shell.overlayCard.querySelector<HTMLButtonElement>('.human-lab__button')
    ?.focus({ preventScroll: true });
}

function frame(now: number): void {
  if (surface === 'stopped') return;
  if (lastFrameTime === null) lastFrameTime = now;
  const dtMs = Math.min(Math.max(0, now - lastFrameTime), 100);
  lastFrameTime = now;
  if (surface === 'playing' && assignedWidthMatches() && !document.hidden && windowFocused) {
    const advance = clock.advance(now);
    if (advance.droppedMs > 0) {
      pauseLab('The browser fell behind the live clock.', 'clock-backlog');
    } else {
      for (let index = 0; index < advance.ticks && surface === 'playing'; index++) {
        const before = engine.snapshot();
        const input = inputAdapter.inputForTick(before.tick + 1, before);
        engine.setInput(input);
        state = reduceP108HumanLab(state, { type: 'tick', stage: state.activeStage, input });
        const result = engine.step();
        observation = advanceP108HumanLabObservation(observation, before, result);
        renderer.pushEvents(result.events, result.state);
        announcer.push(result.events);
        if (result.state.status !== 'running') terminal(result.state.status, result.state);
      }
    }
  }
  rendererNowMs += dtMs;
  renderer.update(dtMs);
  const snapshot = engine.snapshot();
  renderer.draw(context, snapshot, {
    stageIndex: activePhase() === 'practice' ? Math.max(0, (state.activeStage ?? 1) - 1)
      : Math.max(0, (state.activeStage ?? 4) - 4),
    stageCount: activePhase() === 'practice' ? 3 : 4,
  });
  if (surface === 'playing') updateSemantic(snapshot);
  requestAnimationFrame(frame);
}

if (testDriverEnabled) {
  window.__maltlineHumanLabTestDriver = Object.freeze({
    snapshot: () => Object.freeze({
      phase: state.phase,
      surface,
      activeStage: state.activeStage,
      activeLives: state.activeRun?.lives ?? null,
      activeScore: state.activeRun?.score ?? null,
      engineTick: engine.snapshot().tick,
      mappingRevealed,
    }),
    advance: () => activeAction?.(),
    completeCountdown: () => {
      if (surface !== 'countdown') return;
      cancelCountdown();
      enterPlaying();
    },
    finishStage: (status: 'won' | 'lost' = 'won') => terminal(status, {
      ...engine.snapshot(),
      lives: status === 'lost' ? 0 : engine.snapshot().lives,
    }, 'test-driver-synthetic'),
    pause: () => pauseLab('A local test interruption was requested.', 'test-request'),
    resume: resumeLab,
  });
}

welcome();
if (!shell.isSupportedDevice()) pauseLab('The window is narrower than the supported 700-pixel play width.', 'unsupported-width');
document.documentElement.dataset.maltlineHumanLabReady = 'true';
requestAnimationFrame(frame);

import type { VerifiedMaltlinePlayback } from '../core/playback';
import {
  mountMaltlineReplayScrubber,
  type MaltlineReplayScrubber,
} from './replay-scrubber';

export interface MaltlineCompetitionEntry {
  id: string;
  rank: number;
  callsign: string;
  score: number;
  lives: number;
  stageReached: number;
  stagesCleared: number;
  completed: boolean;
  totalTicks: number;
  fulfilled: number;
  serviceActions: number;
  walkouts: number;
  resolved: number;
  exited: number;
  proofAvailable: boolean;
  isCurrentPlayer?: boolean;
}

export type MaltlineCompetitionInspection =
  | { kind: 'none' }
  | { kind: 'loading'; entry: MaltlineCompetitionEntry }
  | { kind: 'unavailable'; entry: MaltlineCompetitionEntry; message: string }
  | { kind: 'error'; entry: MaltlineCompetitionEntry; message: string }
  | {
    kind: 'verified';
    entry: MaltlineCompetitionEntry;
    sha256: string;
    score: number;
    lives: number;
    stagesCleared: number;
    completed: boolean;
    totalTicks: number;
    playback: VerifiedMaltlinePlayback;
    stages: readonly Readonly<{ name: string; ticks: number }>[];
  };

export type MaltlineCompetitionStandings =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ranked'; entries: readonly MaltlineCompetitionEntry[] };

export type MaltlineCompetitionSubmission =
  | { kind: 'none' }
  | { kind: 'eligible'; score: number; initialCallsign?: string; errorMessage?: string }
  | { kind: 'submitting'; score: number; callsign: string }
  | { kind: 'pending'; score: number; callsign: string }
  | { kind: 'error'; score: number; callsign: string; message: string }
  | { kind: 'accepted'; score: number; callsign: string; rank?: number }
  | { kind: 'ineligible'; score: number; reason: string };

export type MaltlineCompetitionPanelState =
  | { view: 'closed' }
  | {
    view: 'open';
    standings: MaltlineCompetitionStandings;
    submission: MaltlineCompetitionSubmission;
    inspection?: MaltlineCompetitionInspection;
  };

export interface MaltlineCompetitionPanelCallbacks {
  onClose?: () => void;
  onRefresh?: () => void;
  onSubmit?: (callsign: string) => void;
  onCallsignChange?: (callsign: string) => void;
  onDiscard?: () => void;
  onInspect?: (entry: MaltlineCompetitionEntry) => void;
  onDismissInspection?: () => void;
}

export interface MaltlineCompetitionPanel {
  readonly root: HTMLElement;
  render(state: MaltlineCompetitionPanelState): void;
  focus(): void;
  destroy(): void;
}

const PANEL_TITLE_ID = 'maltline-competition-title';
const PANEL_DESCRIPTION_ID = 'maltline-competition-description';

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatScore(score: number): string {
  return new Intl.NumberFormat('en-US').format(score);
}

function safeScore(score: number): number {
  return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
}

function formatActiveTime(ticks: number): string {
  const seconds = Math.floor(safeScore(ticks) / 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function inspectionEntry(
  inspection: MaltlineCompetitionInspection | undefined,
): MaltlineCompetitionEntry | undefined {
  return inspection && inspection.kind !== 'none' ? inspection.entry : undefined;
}

type VerifiedCompetitionInspection = Extract<
  MaltlineCompetitionInspection,
  { kind: 'verified' }
>;

function verifiedInspection(
  state: MaltlineCompetitionPanelState,
): VerifiedCompetitionInspection | undefined {
  return state.view === 'open' && state.inspection?.kind === 'verified'
    ? state.inspection
    : undefined;
}

function hasSameVerifiedIdentity(
  previous: VerifiedCompetitionInspection | undefined,
  next: VerifiedCompetitionInspection | undefined,
): boolean {
  return previous !== undefined
    && next !== undefined
    && previous.entry.id === next.entry.id
    && previous.playback.verification.sha256 === next.playback.verification.sha256;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>([
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
  ].join(','))].filter((element) => !element.hidden && element.offsetParent !== null);
}

/**
 * Mounts the viewer-only competition surface under the supplied host. The
 * component owns no network or run state; integration renders a typed state
 * and handles explicit lifecycle callbacks.
 */
export function mountMaltlineCompetitionPanel(
  target: HTMLElement | Document,
  callbacks: MaltlineCompetitionPanelCallbacks = {},
): MaltlineCompetitionPanel {
  const isDocument = target.nodeType === 9;
  const documentRef: Document = isDocument
    ? target as Document
    : (target as HTMLElement).ownerDocument;
  const host = isDocument ? documentRef.body : target as HTMLElement;
  if (!host) throw new Error('Maltline competition panel requires a mounted document body');

  const root = createElement(documentRef, 'div', 'maltline-competition');
  root.dataset.maltlineCompetitionPanel = 'v1';
  root.hidden = true;
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');

  const shade = createElement(documentRef, 'div', 'maltline-competition__shade');
  shade.setAttribute('aria-hidden', 'true');

  const dialog = createElement(documentRef, 'section', 'maltline-competition__sheet');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', PANEL_TITLE_ID);
  dialog.setAttribute('aria-describedby', PANEL_DESCRIPTION_ID);
  dialog.tabIndex = -1;

  const header = createElement(documentRef, 'header', 'maltline-competition__header');
  const headingGroup = createElement(documentRef, 'div');
  const kicker = createElement(documentRef, 'p', 'maltline-competition__kicker', 'LIVE COUNTER');
  const title = createElement(documentRef, 'h2', 'maltline-competition__title', 'SHIFT BOARD');
  title.id = PANEL_TITLE_ID;
  const description = createElement(
    documentRef,
    'p',
    'maltline-competition__description',
    'Verified Maltline runs from this competition.',
  );
  description.id = PANEL_DESCRIPTION_ID;
  headingGroup.append(kicker, title, description);

  const closeButton = createElement(documentRef, 'button', 'maltline-competition__icon-button', '×');
  closeButton.type = 'button';
  closeButton.dataset.competitionFocus = 'close';
  closeButton.setAttribute('aria-label', 'Close competition panel');
  closeButton.addEventListener('click', () => close());
  header.append(headingGroup, closeButton);

  const content = createElement(documentRef, 'div', 'maltline-competition__content');
  const liveStatus = createElement(documentRef, 'div', 'visually-hidden');
  liveStatus.setAttribute('role', 'status');
  liveStatus.setAttribute('aria-live', 'polite');
  liveStatus.setAttribute('aria-atomic', 'true');
  root.append(shade, dialog);
  dialog.append(header, content, liveStatus);
  host.append(root);

  let currentState: MaltlineCompetitionPanelState = { view: 'closed' };
  let restoreFocus: HTMLElement | null = null;
  let lastAnnouncement = '';
  let activeScrubber: MaltlineReplayScrubber | null = null;

  const destroyActiveScrubber = (): void => {
    activeScrubber?.destroy();
    activeScrubber = null;
  };

  const announce = (message: string): void => {
    if (message === lastAnnouncement) return;
    liveStatus.textContent = message;
    lastAnnouncement = message;
  };

  const makeRefreshButton = (): HTMLButtonElement => {
    const button = createElement(documentRef, 'button', 'maltline-competition__button', 'Refresh board');
    button.type = 'button';
    button.dataset.competitionFocus = 'refresh';
    button.addEventListener('click', () => callbacks.onRefresh?.());
    return button;
  };

  const makeDiscardButton = (): HTMLButtonElement => {
    const discard = createElement(documentRef, 'button', 'maltline-competition__button maltline-competition__button--quiet', 'Discard run and start fresh');
    discard.type = 'button';
    discard.dataset.competitionFocus = 'discard';
    discard.addEventListener('click', () => callbacks.onDiscard?.());
    return discard;
  };

  const renderStandings = (standings: MaltlineCompetitionStandings): string => {
    const section = createElement(documentRef, 'section', 'maltline-competition__standings');
    const sectionHeader = createElement(documentRef, 'div', 'maltline-competition__section-header');
    sectionHeader.append(createElement(documentRef, 'h3', undefined, 'TOP SHIFTS'));
    section.append(sectionHeader);

    switch (standings.kind) {
      case 'loading': {
        section.setAttribute('aria-busy', 'true');
        const loading = createElement(documentRef, 'div', 'maltline-competition__notice');
        const spinner = createElement(documentRef, 'span', 'maltline-competition__spinner');
        spinner.setAttribute('aria-hidden', 'true');
        loading.append(spinner, createElement(documentRef, 'p', undefined, 'Calling in the shift board…'));
        section.append(loading);
        content.append(section);
        return 'Competition panel open. Loading ranked runs.';
      }
      case 'empty': {
        sectionHeader.append(makeRefreshButton());
        const empty = createElement(documentRef, 'div', 'maltline-competition__notice');
        empty.append(
          createElement(documentRef, 'strong', undefined, 'FIRST SHIFT IS OPEN'),
          createElement(documentRef, 'p', undefined, 'No verified runs have posted yet.'),
        );
        section.append(empty);
        content.append(section);
        return 'Competition panel open. No verified runs yet.';
      }
      case 'error': {
        sectionHeader.append(makeRefreshButton());
        const error = createElement(documentRef, 'div', 'maltline-competition__notice maltline-competition__notice--error');
        error.append(
          createElement(documentRef, 'strong', undefined, 'BOARD OFFLINE'),
          createElement(documentRef, 'p', undefined, standings.message),
        );
        section.append(error);
        content.append(section);
        return `Competition board could not load. ${standings.message}`;
      }
      case 'ranked': {
        sectionHeader.append(makeRefreshButton());
        const tableWrap = createElement(documentRef, 'div', 'maltline-competition__table-wrap');
        const table = createElement(documentRef, 'table', 'maltline-competition__table');
        const caption = createElement(documentRef, 'caption', 'visually-hidden', 'Verified Maltline competition standings');
        const head = createElement(documentRef, 'thead');
        const headRow = createElement(documentRef, 'tr');
        for (const label of ['Rank', 'Callsign', 'Score', 'Cleared', 'Proof']) {
          const cell = createElement(documentRef, 'th', undefined, label);
          cell.scope = 'col';
          headRow.append(cell);
        }
        head.append(headRow);
        const body = createElement(documentRef, 'tbody');
        for (const entry of standings.entries) {
          const row = createElement(documentRef, 'tr');
          if (entry.isCurrentPlayer) row.dataset.currentPlayer = 'true';
          const rank = createElement(documentRef, 'th', undefined, `#${Math.max(1, safeScore(entry.rank))}`);
          rank.scope = 'row';
          const callsign = createElement(documentRef, 'td', 'maltline-competition__callsign');
          // Deliberately never parse entrant-controlled callsigns as markup.
          callsign.textContent = entry.callsign;
          if (entry.isCurrentPlayer) {
            callsign.append(createElement(documentRef, 'span', 'visually-hidden', ' (your run)'));
          }
          const score = createElement(documentRef, 'td', undefined, formatScore(safeScore(entry.score)));
          const cleared = createElement(documentRef, 'td', undefined, String(safeScore(entry.stagesCleared)));
          const proof = createElement(documentRef, 'td');
          if (entry.proofAvailable) {
            const inspect = createElement(documentRef, 'button', 'maltline-competition__text-button', 'Inspect');
            inspect.type = 'button';
            inspect.dataset.competitionFocus = `inspect-${entry.id}`;
            inspect.setAttribute('aria-label', `Inspect ${entry.callsign} verified proof`);
            inspect.addEventListener('click', () => callbacks.onInspect?.(entry));
            proof.append(inspect);
          } else {
            proof.append(createElement(
              documentRef,
              'span',
              'maltline-competition__proof-ended',
              'Window ended',
            ));
          }
          row.append(rank, callsign, score, cleared, proof);
          body.append(row);
        }
        table.append(caption, head, body);
        tableWrap.append(table);
        section.append(tableWrap);
        content.append(section);
        return `Competition panel open. ${standings.entries.length} ranked ${standings.entries.length === 1 ? 'run' : 'runs'} loaded.`;
      }
    }
  };

  const renderInspection = (inspection: MaltlineCompetitionInspection | undefined): string | null => {
    if (!inspection || inspection.kind === 'none') return null;
    const section = createElement(documentRef, 'section', 'maltline-competition__inspection');
    const inspectionHeader = createElement(documentRef, 'div', 'maltline-competition__section-header');
    const heading = createElement(documentRef, 'h3', undefined, 'PROOF CHECK');
    heading.tabIndex = -1;
    heading.dataset.competitionFocus = 'inspection';
    const back = createElement(documentRef, 'button', 'maltline-competition__button', 'Back to board');
    back.type = 'button';
    back.dataset.competitionFocus = 'inspection-back';
    back.addEventListener('click', () => {
      destroyActiveScrubber();
      callbacks.onDismissInspection?.();
    });
    inspectionHeader.append(heading, back);
    section.append(inspectionHeader);
    if (inspection.kind === 'loading') {
      section.setAttribute('aria-busy', 'true');
      section.append(createElement(
        documentRef,
        'p',
        'maltline-competition__muted',
        `Replaying ${inspection.entry.callsign}'s retained inputs…`,
      ));
      content.append(section);
      return `Replaying ${inspection.entry.callsign}'s retained proof.`;
    }
    if (inspection.kind === 'unavailable') {
      section.append(
        createElement(
          documentRef,
          'p',
          'maltline-competition__eligibility maltline-competition__eligibility--ineligible',
          '— PROOF WINDOW ENDED',
        ),
        createElement(documentRef, 'p', 'maltline-competition__muted', inspection.message),
      );
      content.append(section);
      return `${inspection.entry.callsign}'s retained proof is no longer available.`;
    }
    if (inspection.kind === 'error') {
      section.append(
        createElement(documentRef, 'p', 'maltline-competition__inline-error', inspection.message),
      );
      const retry = createElement(documentRef, 'button', 'maltline-competition__button', 'Retry proof inspection');
      retry.type = 'button';
      retry.dataset.competitionFocus = `inspect-${inspection.entry.id}`;
      retry.addEventListener('click', () => callbacks.onInspect?.(inspection.entry));
      section.append(retry);
      content.append(section);
      return `${inspection.entry.callsign}'s retained proof could not be inspected.`;
    }
    const outcome = inspection.completed
      ? 'complete campaign'
      : `${inspection.stagesCleared} stages cleared`;
    section.append(
      createElement(
        documentRef,
        'p',
        'maltline-competition__eligibility maltline-competition__eligibility--eligible',
        '✓ INPUTS REPRODUCED',
      ),
      createElement(
        documentRef,
        'p',
        undefined,
        `${inspection.entry.callsign}: ${formatScore(inspection.score)} points · ${outcome} · ${inspection.lives} lives · ${formatActiveTime(inspection.totalTicks)} active`,
      ),
      createElement(
        documentRef,
        'p',
        'maltline-competition__muted',
        `Stage reached ${inspection.entry.stageReached} · ${inspection.entry.fulfilled} served · ${inspection.entry.walkouts} walkouts. This browser replayed the retained inputs and reproduced the listed result.`,
      ),
    );
    const scrubberHost = createElement(documentRef, 'div', 'maltline-competition__replay-host');
    section.append(scrubberHost);
    activeScrubber = mountMaltlineReplayScrubber(scrubberHost, inspection.playback, { announce });

    const stageDisclosure = createElement(documentRef, 'details', 'maltline-competition__proof-details');
    stageDisclosure.append(createElement(documentRef, 'summary', undefined, 'Stage breakdown'));
    const stages = createElement(documentRef, 'ol', 'maltline-competition__proof-stages');
    for (const stage of inspection.stages) {
      stages.append(createElement(documentRef, 'li', undefined, `${stage.name} · ${formatActiveTime(stage.ticks)}`));
    }
    stageDisclosure.append(stages);
    const disclosure = createElement(documentRef, 'details', 'maltline-competition__proof-details');
    disclosure.append(createElement(documentRef, 'summary', undefined, 'Proof fingerprint'));
    const digest = createElement(
      documentRef,
      'code',
      'maltline-competition__proof-digest',
      `Canonical envelope SHA-256 ${inspection.sha256}`,
    );
    disclosure.append(digest);
    section.append(stageDisclosure, disclosure);
    content.append(section);
    return `${inspection.entry.callsign}'s retained inputs reproduced the listed result in this browser.`;
  };

  const renderSubmission = (submission: MaltlineCompetitionSubmission): string | null => {
    if (submission.kind === 'none') return null;
    const section = createElement(documentRef, 'section', 'maltline-competition__submission');
    const heading = createElement(documentRef, 'h3');
    section.append(heading);
    const score = formatScore(safeScore(submission.score));
    const makeRetryButton = (callsign: string): HTMLButtonElement => {
      const retry = createElement(
        documentRef,
        'button',
        'maltline-competition__button maltline-competition__button--primary',
        'Retry verification',
      );
      retry.type = 'button';
      retry.dataset.competitionFocus = 'retry';
      retry.addEventListener('click', () => callbacks.onSubmit?.(callsign));
      return retry;
    };

    switch (submission.kind) {
      case 'eligible': {
        heading.textContent = 'POST THIS RUN';
        section.append(
          createElement(documentRef, 'p', 'maltline-competition__eligibility maltline-competition__eligibility--eligible', '✓ RANK ELIGIBLE'),
          createElement(documentRef, 'p', undefined, `Final score ${score}. Choose a callsign to submit this verified run.`),
        );
        if (submission.errorMessage) {
          section.append(createElement(
            documentRef,
            'p',
            'maltline-competition__inline-error',
            submission.errorMessage,
          ));
        }
        const form = createElement(documentRef, 'form', 'maltline-competition__form');
        const label = createElement(documentRef, 'label', undefined, 'Callsign');
        const input = createElement(documentRef, 'input');
        input.type = 'text';
        input.name = 'callsign';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.required = true;
        input.minLength = 2;
        input.maxLength = 16;
        input.value = submission.initialCallsign ?? '';
        input.dataset.competitionFocus = 'callsign';
        label.append(input);
        const submit = createElement(documentRef, 'button', 'maltline-competition__button maltline-competition__button--primary', 'Submit verified run');
        submit.type = 'submit';
        submit.dataset.competitionFocus = 'submit';
        form.append(label, submit);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const callsign = input.value.trim();
          if (!callsign) {
            input.setCustomValidity('Enter a callsign.');
            input.reportValidity();
            return;
          }
          input.setCustomValidity('');
          callbacks.onSubmit?.(callsign);
        });
        input.addEventListener('input', () => {
          input.setCustomValidity('');
          callbacks.onCallsignChange?.(input.value);
        });
        section.append(form, makeDiscardButton());
        content.append(section);
        return `This run is rank eligible with a score of ${score}. Enter a callsign to submit.`;
      }
      case 'submitting': {
        section.setAttribute('aria-busy', 'true');
        heading.textContent = 'POSTING RUN';
        const notice = createElement(documentRef, 'div', 'maltline-competition__notice');
        const spinner = createElement(documentRef, 'span', 'maltline-competition__spinner');
        spinner.setAttribute('aria-hidden', 'true');
        notice.append(spinner, createElement(documentRef, 'p', undefined, `${submission.callsign}, sending score ${score}…`));
        section.append(notice);
        content.append(section);
        return `Submitting ${submission.callsign}'s score of ${score}.`;
      }
      case 'pending': {
        heading.textContent = 'VERIFYING RUN';
        section.append(
          createElement(documentRef, 'p', 'maltline-competition__eligibility maltline-competition__eligibility--pending', '• VERIFICATION PENDING'),
          createElement(documentRef, 'p', undefined, `${submission.callsign}'s score of ${score} is queued for verification.`),
          makeRetryButton(submission.callsign),
          makeDiscardButton(),
        );
        content.append(section);
        return `${submission.callsign}'s score of ${score} is pending verification. Retry is available.`;
      }
      case 'error': {
        heading.textContent = 'RUN NOT POSTED';
        section.append(
          createElement(documentRef, 'p', 'maltline-competition__eligibility maltline-competition__eligibility--ineligible', '× SUBMISSION FAILED'),
          createElement(documentRef, 'p', undefined, submission.message),
          makeRetryButton(submission.callsign),
          makeDiscardButton(),
        );
        content.append(section);
        return `${submission.callsign}'s score of ${score} was not posted. ${submission.message}`;
      }
      case 'accepted': {
        heading.textContent = 'RUN ACCEPTED';
        const rankCopy = submission.rank === undefined
          ? 'The board will place it on the next refresh.'
          : `It placed #${Math.max(1, safeScore(submission.rank))}.`;
        section.append(
          createElement(documentRef, 'p', 'maltline-competition__eligibility maltline-competition__eligibility--eligible', '✓ VERIFIED'),
          createElement(documentRef, 'p', undefined, `${submission.callsign}'s score of ${score} is on the board. ${rankCopy}`),
        );
        content.append(section);
        return `${submission.callsign}'s score of ${score} was accepted. ${rankCopy}`;
      }
      case 'ineligible': {
        heading.textContent = 'PRACTICE RESULT';
        section.append(
          createElement(documentRef, 'p', 'maltline-competition__eligibility maltline-competition__eligibility--ineligible', '— NOT RANK ELIGIBLE'),
          createElement(documentRef, 'p', undefined, `Final score ${score}. ${submission.reason}`),
          createElement(documentRef, 'p', 'maltline-competition__muted', 'Start a fresh uninterrupted run to compete.'),
        );
        content.append(section);
        return `This score is not rank eligible. ${submission.reason}`;
      }
    }
  };

  const close = (): void => {
    destroyActiveScrubber();
    callbacks.onClose?.();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (currentState.view !== 'open') return;
    // Keep gameplay shortcuts from reaching a containing Maltline shell.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && documentRef.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && documentRef.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  root.addEventListener('keydown', handleKeyDown, true);

  const render = (state: MaltlineCompetitionPanelState): void => {
    const previousState = currentState;
    const wasOpen = currentState.view === 'open';
    const previousVerified = verifiedInspection(previousState);
    const nextVerified = verifiedInspection(state);
    const hasPreservableScrubber = activeScrubber !== null
      && activeScrubber.root.isConnected
      && root.contains(activeScrubber.root);
    if (
      hasSameVerifiedIdentity(previousVerified, nextVerified)
      && hasPreservableScrubber
    ) {
      currentState = state;
      return;
    }
    const replacesVerifiedInspection = previousVerified !== undefined
      && nextVerified !== undefined
      && !hasSameVerifiedIdentity(previousVerified, nextVerified);
    const active = documentRef.activeElement instanceof HTMLElement
      ? documentRef.activeElement
      : null;
    const focusKey = wasOpen && active && root.contains(active)
      ? active.dataset.competitionFocus
      : undefined;
    destroyActiveScrubber();
    currentState = state;

    if (state.view === 'closed') {
      root.hidden = true;
      root.inert = true;
      root.setAttribute('aria-hidden', 'true');
      lastAnnouncement = '';
      liveStatus.textContent = '';
      if (wasOpen && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
      return;
    }

    if (!wasOpen && active && !root.contains(active)) restoreFocus = active;
    root.hidden = false;
    root.inert = false;
    root.setAttribute('aria-hidden', 'false');
    content.replaceChildren();
    const selectedInspection = inspectionEntry(state.inspection);
    dialog.dataset.competitionView = state.inspection?.kind === 'verified' ? 'proof' : 'board';
    const standingsAnnouncement = selectedInspection ? null : renderStandings(state.standings);
    const inspectionAnnouncement = selectedInspection ? renderInspection(state.inspection) : null;
    const submissionAnnouncement = selectedInspection ? null : renderSubmission(state.submission);
    const replacementAnnouncement = replacesVerifiedInspection && nextVerified
      ? `Now showing ${nextVerified.entry.callsign}'s verified replay at the first frame of its selected stage.`
      : null;
    announce(
      replacementAnnouncement
      ?? [standingsAnnouncement, inspectionAnnouncement, submissionAnnouncement].filter(Boolean).join(' '),
    );

    const previousInspection = previousState.view === 'open'
      ? inspectionEntry(previousState.inspection)
      : undefined;
    if (replacesVerifiedInspection) dialog.scrollTop = 0;
    const transitionControl = replacesVerifiedInspection
      ? dialog.querySelector<HTMLElement>('[data-competition-focus="inspection"]')
      : !previousInspection && selectedInspection
      ? dialog.querySelector<HTMLElement>('[data-competition-focus="inspection"]')
      : previousInspection && !selectedInspection
        ? dialog.querySelector<HTMLElement>(`[data-competition-focus="inspect-${previousInspection.id}"]`)
        : null;
    const priorControl = focusKey
      ? dialog.querySelector<HTMLElement>(`[data-competition-focus="${focusKey}"]`)
      : null;
    (transitionControl ?? priorControl ?? dialog).focus({ preventScroll: true });
  };

  return {
    root,
    render,
    focus() {
      if (currentState.view === 'open') dialog.focus({ preventScroll: true });
    },
    destroy() {
      const shouldRestore = currentState.view === 'open';
      destroyActiveScrubber();
      root.removeEventListener('keydown', handleKeyDown, true);
      root.remove();
      if (shouldRestore && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    },
  };
}

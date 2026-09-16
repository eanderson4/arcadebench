import {
  ArcadeBenchApiError,
  createArcadeBenchGameClient,
  type ArcadeGameClient,
  type NormalizedEntry,
  type NormalizedSubmission,
} from '@arcadebench/sdk';
import { MALTLINE_CURRENT_CABINET_AUTHORITY as MALTLINE_CABINET_AUTHORITY } from '../core/cabinet-authorities';
import {
  buildMaltlineCabinetProof,
  verifyMaltlineCabinetProof,
  type MaltlineCabinetProof,
  type MaltlineCabinetSummary,
} from '../core/cabinet-proof';
import type { MaltlineCabinetReplay } from '../core/replay';
import type { MaltlineFlowScreen } from './gameplay-flow';
import './cabinet-leaderboard.css';

export const CABINET_SOCIAL_LABEL = 'Allow ArcadeBench to use this replay or clips from it on social media.';
export const CABINET_SOCIAL_HELP = 'Optional. Your score is saved either way.';
const VERSION = MALTLINE_CABINET_AUTHORITY.gameVersion;
type Entry = NormalizedEntry<MaltlineCabinetSummary>;
type Submission = NormalizedSubmission<MaltlineCabinetSummary>;
type Challenge = { runId: string; nonce: number; expiresAt: number };

/** Production uses same-origin services; development must explicitly opt in. */
export function cabinetServicesEnabled(location: Pick<Location, 'hostname' | 'search'>, development: boolean): boolean {
  const hostname = location.hostname.toLowerCase();
  const local = hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  return !local || development && new URLSearchParams(location.search).get('ranked') === 'preview';
}

/** The activity feed's board link may open the safe title-screen board directly. */
export function cabinetLeaderboardDeepLinkRequested(location: Pick<Location, 'search'>): boolean {
  const params = new URLSearchParams(location.search);
  return params.get('mode') === 'leaderboard' && params.get('board') === 'arcade';
}

export function createCabinetGameClient(fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): ArcadeGameClient {
  return createArcadeBenchGameClient({ gameId: 'maltline', gameVersion: VERSION,
    fetchImpl: async (input, init) => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 8_000);
      try { return await fetchImpl(input, { ...init, signal: abort.signal }); }
      finally { clearTimeout(timeout); }
    },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'Enter a callsign of 1–16 characters.') return error.message;
  return error instanceof ArcadeBenchApiError && error.status >= 400 && error.status < 500
    ? error.message.slice(0, 240)
    : 'The leaderboard is unavailable. Your game can continue unranked.';
}

export function isCabinetEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<Entry>;
  const result = entry.result;
  return entry.gameId === 'maltline' && entry.gameVersion === VERSION
    && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128
    && typeof entry.playerName === 'string' && entry.playerName.length > 0 && entry.playerName.length <= 64
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt))
    && entry.board?.id === 'arcade' && !!entry.board.context
    && Object.keys(entry.board.context).length === 0 && !!result
    && Number.isSafeInteger(result.score) && result.score >= 0
    && Number.isSafeInteger(result.stageReached) && result.stageReached >= 1 && result.stageReached <= 8
    && typeof result.completed === 'boolean';
}

/** Per-attempt state. A late challenge cannot upgrade a run already started unranked. */
export class MaltlineCabinetLeaderboardSession {
  challengeStatus: 'idle' | 'preparing' | 'ready' | 'unavailable' = 'idle';
  reason = '';
  submitting = false;
  submitted: Submission | null = null;
  terminal: { proof: MaltlineCabinetProof; summary: MaltlineCabinetSummary } | null = null;
  private challenge: Challenge | null = null;
  private generation = 0;
  private locked = false;
  private invalid = false;

  constructor(readonly enabled: boolean, private readonly client: ArcadeGameClient,
    private readonly now: () => number = Date.now) {}

  async startAttempt(): Promise<void> {
    const generation = ++this.generation;
    this.challenge = null;
    this.locked = false;
    this.invalid = false;
    this.terminal = null;
    this.submitted = null;
    this.submitting = false;
    this.reason = this.enabled ? '' : 'Local preview · unranked. Scores are not submitted.';
    this.challengeStatus = this.enabled ? 'preparing' : 'unavailable';
    if (!this.enabled) return;
    try {
      const response = await this.client.runs.begin({ boardId: 'arcade', context: {} });
      if (generation !== this.generation || this.locked) return;
      const expiresAt = Date.parse(response.expiresAt);
      if (response.gameVersion !== VERSION || typeof response.id !== 'string'
        || !/^run_[A-Za-z0-9_-]{1,60}$/u.test(response.id)
        || typeof response.seed !== 'number' || !Number.isSafeInteger(response.seed)
        || response.seed < 0 || response.seed > 0xffff_ffff || !Number.isFinite(expiresAt)
        || expiresAt <= this.now()) throw new Error('Invalid ranked challenge');
      this.challenge = { runId: response.id, nonce: response.seed, expiresAt };
      this.challengeStatus = 'ready';
    } catch {
      if (generation !== this.generation || this.locked) return;
      this.challengeStatus = 'unavailable';
      this.reason = 'Ranked service unavailable. Start unranked to play.';
    }
  }

  lockForPlay(): void {
    if (this.locked) return;
    this.locked = true;
    if (!this.rankEligible()) {
      this.invalid = true;
      this.challenge = null;
      this.challengeStatus = 'unavailable';
      this.reason = this.enabled ? 'Unranked run · no score will be submitted.' : this.reason;
    }
  }

  rankEligible(): boolean {
    return this.enabled && !this.invalid && this.challenge !== null && this.challenge.expiresAt > this.now();
  }

  invalidate(reason: string): void { this.invalid = true; this.reason = reason; }

  complete(replays: readonly MaltlineCabinetReplay[]): void {
    if (!this.rankEligible() || !this.challenge) return;
    try {
      const binding = { runId: this.challenge.runId, nonce: this.challenge.nonce };
      const proof = buildMaltlineCabinetProof(replays, binding, VERSION);
      const { summary } = verifyMaltlineCabinetProof(proof, binding, VERSION);
      this.terminal = { proof, summary };
    } catch {
      this.invalidate('This run could not be verified locally. It remains unranked.');
    }
  }

  async submit(playerName: string, socialMedia: boolean): Promise<Submission> {
    if (!this.rankEligible() || !this.challenge || !this.terminal || this.submitting || this.submitted) {
      throw new Error('This run is not available for ranked submission.');
    }
    const name = playerName.trim();
    if (!name || name.length > 16) throw new Error('Enter a callsign of 1–16 characters.');
    const generation = this.generation;
    this.submitting = true;
    try {
      const response = await this.client.leaderboards.submit<MaltlineCabinetSummary, MaltlineCabinetProof, MaltlineCabinetSummary>({
        boardId: 'arcade', runId: this.challenge.runId, playerName: name,
        score: this.terminal.summary, proof: this.terminal.proof,
        publication: { policyVersion: 'top50-social-v1', socialMedia: socialMedia === true },
      });
      const publication = response.publication;
      if (!isCabinetEntry(response.entry) || !publication
        || !Number.isSafeInteger(publication.rankAtSubmission) || publication.rankAtSubmission < 1
        || typeof publication.replaySaved !== 'boolean'
        || publication.replaySaved !== (publication.rankAtSubmission <= 50)
        || (publication.replaySaved ? publication.expiresAt !== null
          : typeof publication.expiresAt !== 'string' || !Number.isFinite(Date.parse(publication.expiresAt)))) {
        throw new Error('The server returned an invalid score receipt.');
      }
      if (generation === this.generation) this.submitted = response;
      return response;
    } finally { if (generation === this.generation) this.submitting = false; }
  }

  async list(): Promise<Entry[]> {
    if (!this.enabled) throw new Error('Local preview has no public leaderboard connection.');
    const page = await this.client.leaderboards.list<unknown>({ boardId: 'arcade', filters: {}, limit: 50 });
    if (!Array.isArray(page.entries) || page.entries.length > 50 || !page.entries.every(isCabinetEntry)) {
      throw new Error('The server returned an invalid leaderboard.');
    }
    return page.entries;
  }
}

export interface MaltlineCabinetBoardStatus {
  enabled: boolean;
  challenge: MaltlineCabinetLeaderboardSession['challengeStatus'];
  proof: 'none' | 'recording' | 'eligible' | 'ineligible' | 'submitted';
  panelOpen: boolean;
  rankEligible: boolean;
}

export function mountMaltlineCabinetLeaderboard(options: {
  enabled: boolean;
  client?: ArcadeGameClient;
  root: HTMLElement;
  trigger: HTMLButtonElement;
  onRestart: () => void;
  onChange: () => void;
}) {
  const document = options.root.ownerDocument;
  const session = new MaltlineCabinetLeaderboardSession(options.enabled, options.client ?? createCabinetGameClient());
  const notice = document.createElement('p');
  notice.className = 'cabinet-rank-notice';
  notice.setAttribute('role', 'status');
  options.root.append(notice);
  const syncNoticeSpace = (): void => {
    const height = notice.hidden ? 0 : Math.ceil(notice.getBoundingClientRect().height) + 7;
    const value = `${height}px`;
    if (options.root.style.getPropertyValue('--maltline-rank-notice-space') !== value) {
      options.root.style.setProperty('--maltline-rank-notice-space', value);
    }
  };
  let noticeResizePending = false;
  const noticeResizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => {
        if (noticeResizePending) return;
        noticeResizePending = true;
        document.defaultView?.setTimeout(() => {
          noticeResizePending = false;
          syncNoticeSpace();
        }, 0);
      });
  noticeResizeObserver?.observe(notice);
  const dialog = document.createElement('dialog');
  dialog.className = 'cabinet-board';
  dialog.setAttribute('aria-labelledby', 'cabinet-board-title');
  dialog.innerHTML = `<header><div><p class="cabinet-eyebrow">MALTLINE · SECOND SHIFT</p><h2 id="cabinet-board-title">Shift Board</h2></div><button type="button" data-close>Close</button></header>
    <p>Eight shifts. Two buttons. Server-verified cabinet runs.</p>
    <p data-run-status role="status"></p>
    <form hidden><label for="cabinet-callsign">Callsign</label><input id="cabinet-callsign" name="callsign" maxlength="16" required autocomplete="off" spellcheck="false">
      <label class="cabinet-consent"><input name="socialMedia" type="checkbox"><span>${CABINET_SOCIAL_LABEL}</span></label>
      <p class="cabinet-help">${CABINET_SOCIAL_HELP}</p><button type="submit">Submit score</button>
    </form><p data-submit-status role="status"></p>
    <div class="cabinet-board-actions"><button type="button" data-refresh>Refresh scores</button><button type="button" data-restart>Start a new run</button></div>
    <p data-board-status role="status"></p><ol data-scores aria-label="Cabinet leaderboard"></ol>`;
  document.body.append(dialog);
  const required = <T extends HTMLElement>(selector: string): T => dialog.querySelector<T>(selector)!;
  const form = required<HTMLFormElement>('form');
  const name = required<HTMLInputElement>('[name=callsign]');
  const social = required<HTMLInputElement>('[name=socialMedia]');
  const submit = required<HTMLButtonElement>('[type=submit]');
  const submitStatus = required<HTMLElement>('[data-submit-status]');
  const boardStatus = required<HTMLElement>('[data-board-status]');
  const list = required<HTMLOListElement>('[data-scores]');
  let screen: MaltlineFlowScreen = 'title';
  let listGeneration = 0;
  let attemptGeneration = 0;
  let lastEligibility = false;
  const safe = () => !['playing', 'countdown'].includes(screen);
  const runDescription = () => session.submitted ? 'Score submitted to Second Shift.'
    : session.rankEligible() ? session.terminal ? `Your run: ${session.terminal.summary.score.toLocaleString()} points · ${session.terminal.summary.completed ? 'All shifts cleared' : `Stage ${session.terminal.summary.stageReached}`}. Submit for verification.` : 'Ranked Second Shift run ready.'
      : session.challengeStatus === 'preparing' ? 'Preparing ranked run. Please wait…'
        : session.reason || (session.challengeStatus === 'ready' ? 'Ranked challenge expired. This run is unranked.'
          : options.enabled ? 'Start a game to prepare a ranked run.' : 'Local preview · unranked. Scores are not submitted.');
  const render = () => {
    options.trigger.hidden = !safe();
    options.trigger.textContent = 'SHIFT BOARD';
    notice.hidden = screen === 'title' || screen === 'instructions';
    notice.textContent = runDescription();
    syncNoticeSpace();
    required<HTMLElement>('[data-run-status]').textContent = runDescription();
    form.hidden = !session.terminal || !session.rankEligible();
    for (const element of [name, social, submit]) element.disabled = session.submitting || session.submitted !== null;
    required<HTMLButtonElement>('[data-restart]').disabled = session.submitting;
    options.onChange();
  };
  const refresh = async () => {
    const generation = ++listGeneration;
    boardStatus.textContent = options.enabled ? 'Loading scores…' : 'Local preview has no public leaderboard connection.';
    list.replaceChildren();
    if (!options.enabled) return;
    try {
      const entries = await session.list();
      if (generation !== listGeneration) return;
      boardStatus.textContent = entries.length ? 'Ranked by completion, stage reached, score, then time and orders filled.' : 'No ranked runs yet. Set the first high score.';
      for (const entry of entries) {
        const item = document.createElement('li');
        const callsign = document.createElement('strong');
        callsign.textContent = entry.playerName;
        const result = document.createElement('span');
        result.textContent = `${entry.result.score.toLocaleString()} points · ${entry.result.completed ? 'All shifts cleared' : `Stage ${entry.result.stageReached}`}`;
        item.append(callsign, result); list.append(item);
      }
    } catch { if (generation === listGeneration) boardStatus.textContent = 'Scores are unavailable. Try refreshing in a moment.'; }
  };
  const openPanel = () => {
    if (!safe()) return;
    render();
    if (!dialog.open) dialog.showModal();
    void refresh();
    options.onChange();
  };
  options.trigger.addEventListener('click', openPanel);
  required('[data-close]').addEventListener('click', () => dialog.close());
  required('[data-refresh]').addEventListener('click', () => void refresh());
  required('[data-restart]').addEventListener('click', () => {
    if (session.submitting) return;
    dialog.close(); options.onRestart();
  });
  dialog.addEventListener('close', () => { options.root.focus({ preventScroll: true }); options.onChange(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const generation = attemptGeneration;
    const request = session.submit(name.value, social.checked);
    submitStatus.textContent = 'Verifying and submitting…'; render();
    void request.then(() => {
      if (generation !== attemptGeneration) return;
      submitStatus.textContent = 'Score saved.';
      void refresh();
    }).catch(error => {
      if (generation === attemptGeneration) submitStatus.textContent = errorMessage(error);
    }).finally(() => { if (generation === attemptGeneration) render(); });
  });
  options.trigger.hidden = false;
  notice.hidden = true;
  return {
    startAttempt() {
      attemptGeneration++;
      form.reset(); submitStatus.textContent = '';
      const preparing = session.startAttempt();
      render(); void preparing.then(render);
    },
    lockForPlay() { session.lockForPlay(); render(); },
    startHint() { return session.challengeStatus === 'preparing'
      ? 'Preparing ranked run…'
      : session.rankEligible() ? 'Press Enter to start ranked · R to restart'
        : 'Press Enter to start unranked · R to retry ranked preparation'; },
    complete(replays: readonly MaltlineCabinetReplay[]) { session.complete(replays); render(); },
    invalidate(reason: string) { session.invalidate(reason); render(); },
    setScreen(next: MaltlineFlowScreen) {
      const eligible = session.rankEligible();
      if (screen === next && lastEligibility === eligible) return;
      lastEligibility = eligible;
      screen = next;
      if (!safe() && dialog.open) dialog.close();
      render();
    },
    openPanel,
    protectsTerminalResult() { return session.terminal !== null && session.submitted === null && session.rankEligible(); },
    snapshot(): Readonly<MaltlineCabinetBoardStatus> {
      return Object.freeze({ enabled: options.enabled, challenge: session.challengeStatus,
        proof: session.submitted ? 'submitted' : session.terminal ? 'eligible' : session.rankEligible() ? 'recording'
          : session.challengeStatus === 'preparing' ? 'none' : 'ineligible',
        panelOpen: dialog.open, rankEligible: session.rankEligible() });
    },
  };
}

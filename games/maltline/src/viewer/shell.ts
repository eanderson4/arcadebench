import { MALTLINE_SPLASH_ART } from './splash-art';

export const MALTLINE_SHELL_SOURCE = 'maltline-shell-v2';
export const MALTLINE_MINIMUM_PLAYABLE_WIDTH = 700;

export interface OverlayPresentation {
  variant?: 'title' | 'instructions' | 'stage' | 'countdown' | 'intermission' | 'terminal' | 'standard';
  kicker?: string;
  title: string;
  body: string;
  steps?: readonly string[];
  hint: string;
  /** A concise live-region update for this flow screen. Omit for silent visual-only steps. */
  announcement?: string;
}

export interface MaltlineShell {
  root: HTMLElement;
  competitionButton: HTMLButtonElement;
  soundButton: HTMLButtonElement;
  startButton: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  overlayCard: HTMLElement;
  overlayKicker: HTMLElement;
  overlayTitle: HTMLElement;
  overlayBody: HTMLElement;
  overlaySteps: HTMLUListElement;
  overlayHint: HTMLElement;
  unsupportedDevice: HTMLElement;
  controls: HTMLElement;
  flowStatus: HTMLElement;
  semanticStatus: HTMLElement;
  liveEvents: HTMLElement;
  isSupportedDevice(): boolean;
  onSupportedDeviceChange(listener: (supported: boolean) => void): () => void;
  showOverlay(presentation: OverlayPresentation, focus?: boolean): void;
  hideOverlay(focusGame?: boolean): void;
  focusCurrentSurface(): void;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Maltline shell is missing ${selector}`);
  return element;
}

/** Mounts the production and visual-fixture shell from one trusted markup source. */
export function mountMaltlineShell(documentRef: Document = document): MaltlineShell {
  const template = documentRef.createElement('template');
  template.innerHTML = `
    <main class="shell" data-maltline-shell="${MALTLINE_SHELL_SOURCE}" tabindex="0" aria-label="Maltline game">
      <header class="topline">
        <span class="brand"><a class="arcade-home" href="/" aria-label="Back to ArcadeBench homepage">← ARCADEBENCH</a> <i>/</i> MALTLINE <em>prototype</em></span>
        <span class="tagline">slide shakes · catch jars · keep the line moving</span>
        <span class="topline-actions">
          <button class="sound-toggle" type="button" aria-pressed="false" aria-label="Mute sound" hidden>SOUND ON</button>
          <button class="competition-trigger" type="button" hidden>SHIFT BOARD</button>
        </span>
      </header>
      <section class="splash" aria-labelledby="splash-title">
        <div class="splash-copy">
          <p class="splash-kicker">THE COUNTER IS YOURS</p>
          <h1 id="splash-title">Maltline<span>A little shop. A big rush.</span></h1>
          <p class="splash-description">Blend the right shake, slide it down the counter, and catch the returning jars. Keep your customers smiling through eight increasingly busy shifts.</p>
          <button class="start-game" type="button" aria-describedby="splash-device-note">Start Game <span aria-hidden="true">→</span></button>
          <p class="splash-device-note" id="splash-device-note">Keyboard required · window at least 700px wide</p>
          <div class="splash-controls" aria-label="Game controls">
            <span><b>↔ ↕</b> Move</span>
            <span><b>1 <small>SPACE</small></b> Hold to fill · release to toss</span>
            <span><b>2 <small>ENTER</small></b> Switch flavor · replace shake</span>
          </div>
        </div>
        <div class="splash-art">${MALTLINE_SPLASH_ART}<p>MADE FRESH. SERVED FAST.</p></div>
      </section>
      <div class="stage-wrap">
        <canvas id="game" width="960" height="540" aria-label="Maltline play field" aria-describedby="game-status"></canvas>
        <div id="overlay" class="overlay" aria-hidden="false">
          <div id="overlay-card" class="overlay-card" role="dialog" aria-modal="false" aria-labelledby="overlay-title" aria-describedby="overlay-body overlay-hint" tabindex="-1">
            <p id="overlay-kicker" class="overlay-kicker" hidden></p>
            <h1 id="overlay-title">MALTLINE</h1>
            <p id="overlay-body">You run the shake counter.</p>
            <ul id="overlay-steps" class="overlay-steps" hidden></ul>
            <p id="overlay-hint">Press Enter to open the shop</p>
          </div>
        </div>
        <section class="unsupported-device" role="status" aria-labelledby="unsupported-title" aria-hidden="true" tabindex="-1">
          <div class="device-mark" aria-hidden="true"><span>↻</span><kbd>← ↑ ↓ →</kbd></div>
          <p class="device-kicker">COUNTER PAUSED</p>
          <h2 id="unsupported-title">Give the shop a little more room</h2>
          <p>Maltline needs a keyboard and a window at least 700px wide.</p>
          <p class="device-hint">Rotate a tablet or continue on a laptop.</p>
        </section>
      </div>
      <footer class="controls" aria-label="Keyboard controls">
        <span><kbd>← →</kbd> run counter</span>
        <span><kbd>↑ ↓</kbd> lane</span>
        <span><kbd>SPACE</kbd> hold to fill · release to toss</span>
        <span><kbd>ENTER</kbd> switch flavor / replace shake</span>
        <span><kbd>R</kbd> restart</span>
      </footer>
      <div id="game-flow-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></div>
      <section id="game-status" class="visually-hidden" aria-label="Current game status" aria-live="off" aria-atomic="true"></section>
      <div id="game-live-events" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></div>
    </main>
  `;
  documentRef.body.replaceChildren(template.content.cloneNode(true));

  const root = requiredElement<HTMLElement>(documentRef, '[data-maltline-shell]');
  const competitionButton = requiredElement<HTMLButtonElement>(root, '.competition-trigger');
  const soundButton = requiredElement<HTMLButtonElement>(root, '.sound-toggle');
  const startButton = requiredElement<HTMLButtonElement>(root, '.start-game');
  const splash = requiredElement<HTMLElement>(root, '.splash');
  const stageWrap = requiredElement<HTMLElement>(root, '.stage-wrap');
  const canvas = requiredElement<HTMLCanvasElement>(root, '#game');
  const overlay = requiredElement<HTMLElement>(root, '#overlay');
  const overlayCard = requiredElement<HTMLElement>(root, '#overlay-card');
  const overlayKicker = requiredElement<HTMLElement>(root, '#overlay-kicker');
  const overlayTitle = requiredElement<HTMLElement>(root, '#overlay-title');
  const overlayBody = requiredElement<HTMLElement>(root, '#overlay-body');
  const overlaySteps = requiredElement<HTMLUListElement>(root, '#overlay-steps');
  const overlayHint = requiredElement<HTMLElement>(root, '#overlay-hint');
  const unsupportedDevice = requiredElement<HTMLElement>(root, '.unsupported-device');
  const controls = requiredElement<HTMLElement>(root, '.controls');
  const flowStatus = requiredElement<HTMLElement>(root, '#game-flow-status');
  const semanticStatus = requiredElement<HTMLElement>(root, '#game-status');
  const liveEvents = requiredElement<HTMLElement>(root, '#game-live-events');
  const syncControlsHeight = (): void => {
    const height = Math.ceil(controls.getBoundingClientRect().height);
    const value = `${height}px`;
    if (height > 0 && root.style.getPropertyValue('--maltline-controls-height') !== value) {
      root.style.setProperty('--maltline-controls-height', value);
    }
  };
  let controlsResizePending = false;
  const scheduleControlsHeightSync = (): void => {
    if (controlsResizePending) return;
    controlsResizePending = true;
    documentRef.defaultView?.setTimeout(() => {
      controlsResizePending = false;
      syncControlsHeight();
    }, 0);
  };
  const controlsResizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(scheduleControlsHeightSync);
  controlsResizeObserver?.observe(controls);
  const supportedDeviceListeners = new Set<(supported: boolean) => void>();
  let supportedDevice = false;
  let overlayVisible = true;
  let splashVisible = true;
  let lastFlowAnnouncement: string | null = null;

  const focusCurrentSurface = (): void => {
    const target = splashVisible ? (supportedDevice ? startButton : splash)
      : !supportedDevice ? unsupportedDevice : overlayVisible ? overlayCard : root;
    target.focus({ preventScroll: true });
  };

  const syncAccessibleSurfaces = (): void => {
    root.dataset.surface = splashVisible ? 'splash' : 'game';
    root.tabIndex = splashVisible ? -1 : 0;
    splash.hidden = !splashVisible;
    splash.inert = !splashVisible;
    splash.tabIndex = -1;
    startButton.disabled = !supportedDevice;
    stageWrap.hidden = splashVisible;
    stageWrap.inert = splashVisible;
    controls.hidden = splashVisible;
    if (!splashVisible) syncControlsHeight();
    const playSurfaceAccessible = supportedDevice && !overlayVisible;
    canvas.setAttribute('aria-hidden', String(!playSurfaceAccessible));
    controls.setAttribute('aria-hidden', String(!playSurfaceAccessible));
    controls.inert = !playSurfaceAccessible;
    const overlayAccessible = supportedDevice && overlayVisible && !splashVisible;
    flowStatus.setAttribute('aria-hidden', String(!overlayVisible));
    semanticStatus.setAttribute('aria-hidden', String(!playSurfaceAccessible));
    liveEvents.setAttribute('aria-hidden', String(!playSurfaceAccessible));
    unsupportedDevice.setAttribute('aria-hidden', String(supportedDevice || splashVisible));
    overlay.setAttribute('aria-hidden', String(!overlayAccessible));
    overlay.inert = !overlayAccessible;
  };

  const updateSupportedDevice = (): void => {
    const nextSupportedDevice = documentRef.defaultView?.innerWidth !== undefined
      && documentRef.defaultView.innerWidth >= MALTLINE_MINIMUM_PLAYABLE_WIDTH;
    const changed = nextSupportedDevice !== supportedDevice;
    supportedDevice = nextSupportedDevice;
    documentRef.documentElement.dataset.supportedDevice = String(nextSupportedDevice);
    syncAccessibleSurfaces();
    if (!changed) return;
    for (const listener of supportedDeviceListeners) listener(supportedDevice);
  };
  updateSupportedDevice();
  documentRef.defaultView?.addEventListener('resize', updateSupportedDevice);

  return {
    root,
    competitionButton,
    soundButton,
    startButton,
    canvas,
    overlay,
    overlayCard,
    overlayKicker,
    overlayTitle,
    overlayBody,
    overlaySteps,
    overlayHint,
    unsupportedDevice,
    controls,
    flowStatus,
    semanticStatus,
    liveEvents,
    isSupportedDevice: () => supportedDevice,
    onSupportedDeviceChange(listener) {
      supportedDeviceListeners.add(listener);
      return () => supportedDeviceListeners.delete(listener);
    },
    showOverlay(presentation, focus = false) {
      splashVisible = presentation.variant === 'title';
      overlayCard.dataset.overlayVariant = presentation.variant ?? 'standard';
      overlayKicker.textContent = presentation.kicker ?? '';
      overlayKicker.hidden = !presentation.kicker;
      overlayTitle.textContent = presentation.title;
      overlayBody.textContent = presentation.body;
      overlaySteps.replaceChildren(...(presentation.steps ?? []).map((step) => {
        const item = documentRef.createElement('li');
        item.textContent = step;
        return item;
      }));
      overlaySteps.hidden = !presentation.steps?.length;
      overlayCard.setAttribute(
        'aria-describedby',
        presentation.steps?.length
          ? 'overlay-body overlay-steps overlay-hint'
          : 'overlay-body overlay-hint',
      );
      overlayHint.textContent = presentation.hint;
      overlayVisible = true;
      overlay.classList.toggle('hidden', splashVisible);
      syncAccessibleSurfaces();
      if (presentation.announcement !== undefined
        && presentation.announcement !== lastFlowAnnouncement) {
        flowStatus.textContent = presentation.announcement;
        lastFlowAnnouncement = presentation.announcement;
      }
      if (focus) focusCurrentSurface();
    },
    hideOverlay(focusGame = false) {
      splashVisible = false;
      overlayVisible = false;
      lastFlowAnnouncement = null;
      overlay.classList.add('hidden');
      syncAccessibleSurfaces();
      if (focusGame) focusCurrentSurface();
    },
    focusCurrentSurface,
  };
}

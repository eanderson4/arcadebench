import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import maltlinePackage from '../../package.json' with { type: 'json' };
import { MALTLINE_CAMPAIGN } from '../../src/core/campaign';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../../src/core/authority';
import {
  MALTLINE_CURRENT_CABINET_AUTHORITY as MALTLINE_CABINET_AUTHORITY,
} from '../../src/core/cabinet-authorities';
import { buildMaltlineCabinetProof, verifyMaltlineCabinetProof } from '../../src/core/cabinet-proof';
import { MaltlineCabinetInputAdapter } from '../../src/viewer/cabinet-input-adapter';
import type { MaltlineCabinetReplay } from '../../src/core/replay';
import { MaltlineEngine } from '../../src/core/engine';
import { reactiveMaltlineController } from '../../src/telemetry/reactive-controller';
import {
  deriveMaltlineRendererLayout,
  MALTLINE_RENDERER_FRAME,
} from '../../src/viewer/renderer-layout';
import { MALTLINE_VISUAL_THEME } from '../../src/viewer/visual-theme';
import baselineManifestJson from './baseline-manifest.json' with { type: 'json' };
import { verifyMaltlineVisualBaselineFiles } from './baseline-contract';

// Fail the collection phase before Playwright launches a browser when the
// checked-in image ledger or any reviewed PNG byte is inconsistent.
const baselineManifest = verifyMaltlineVisualBaselineFiles(
  baselineManifestJson,
  new URL('./baselines/chromium-system/', import.meta.url),
  { trustedRoot: new URL('./', import.meta.url) },
);

const DESKTOP_FIXTURES = [
  'title',
  'instructions',
  'stage-card',
  'countdown',
  'game-over',
  'victory',
  'first-pour-idle',
  'blend-half',
  'ready',
  'rush-three-lane',
  'stage-4-lunch-rush-pressure',
  'stage-5-jar-shortage-pressure',
  'stage-6-thick-shakes-pressure',
  'stage-6-station-tool-split',
  'stage-7-happy-hour-pressure',
  'no-clean-jars',
  'reduced-motion',
  'stage-clear-walkout',
  'repeat-rescue',
  'serve-feedback',
  'jar-catch',
  'shake-launch',
  'shake-miss',
  'jar-miss',
  'walkout',
] as const;

const PRESSURE_FIXTURES = [
  { name: 'stage-4-lunch-rush-pressure', scenarioIndex: 3, scenarioId: 'maltline-04-lunch-rush' },
  { name: 'stage-5-jar-shortage-pressure', scenarioIndex: 4, scenarioId: 'maltline-05-jar-shortage' },
  { name: 'stage-6-thick-shakes-pressure', scenarioIndex: 5, scenarioId: 'maltline-06-thick-shakes' },
  { name: 'stage-7-happy-hour-pressure', scenarioIndex: 6, scenarioId: 'maltline-07-happy-hour' },
] as const;

const MINIMUM_WIDTH_GAMEPLAY_FIXTURES = [
  'stage-4-lunch-rush-pressure',
  'stage-4-traffic-corridor',
  'stage-4-traffic-corridor-reduced',
  'stage-5-jar-shortage-pressure',
  'stage-6-station-tool-split',
  'stage-6-station-tool-split-reduced',
  'stage-7-happy-hour-pressure',
  'no-clean-jars',
  'return-window',
] as const;

interface CabinetTape { codes: string[][]; replay: MaltlineCabinetReplay }
/** Generate a winning physical two-button tape through the actual input adapter. */
function buildViewerWinTapes(): CabinetTape[] {
  let run = { ...MALTLINE_CABINET_AUTHORITY.initialRun };
  return MALTLINE_CABINET_AUTHORITY.campaign.map((scenario) => {
    const engine = new MaltlineEngine(scenario, run, MALTLINE_CABINET_AUTHORITY.controlMode);
    const adapter = new MaltlineCabinetInputAdapter(scenario);
    const ticks: MaltlineCabinetReplay['ticks'] = [];
    const codes: string[][] = [];
    let held = new Set<string>();
    while (engine.snapshot().status === 'running') {
      const state = engine.snapshot();
      if (state.tick > 60_000) throw new Error(`Viewer tape exceeded limit in ${scenario.id}`);
      const intended = reactiveMaltlineController(state, scenario);
      const desired = new Set<string>();
      if ((state.tick + 1) % scenario.laneRepeatTicks === 0) {
        if (intended.laneDir < 0) desired.add(state.player.lane === 0 ? 'ArrowDown' : 'ArrowUp');
        if (intended.laneDir > 0) desired.add(state.player.lane === scenario.lanes - 1 ? 'ArrowUp' : 'ArrowDown');
      }
      if ((state.tick + 1) % scenario.stationRepeatTicks === 0 && intended.stationDir !== 0) desired.add('Enter');
      if ((intended.blend || state.player.holding !== null) && !intended.serve) desired.add('Space');
      for (const code of held) if (!desired.has(code)) adapter.keyUp(code);
      for (const code of desired) if (!held.has(code)) adapter.keyDown(code);
      held = desired;
      codes.push([...desired]);
      const input = adapter.inputForTick(state.tick + 1, state);
      engine.setInput(input);
      const result = engine.step();
      ticks.push({ tick: result.state.tick, input, events: result.events });
    }
    const finalState = engine.snapshot();
    if (finalState.status !== 'won') throw new Error(`Two-button viewer route lost ${scenario.id}`);
    const replay: MaltlineCabinetReplay = { version: 3, controlMode: MALTLINE_CABINET_AUTHORITY.controlMode,
      scenario: structuredClone(scenario), run, ticks, finalState };
    run = { score: finalState.score, lives: finalState.lives };
    return { codes, replay };
  });
}
const VIEWER_WIN_TAPES = buildViewerWinTapes();

interface PressureFixtureMetadata {
  provenance: 'authored-static' | 'synthetic-pressure-envelope' | 'synthetic-isolated-event';
  reachability: 'engine-reachable' | 'presentation-only';
  rankEligibility: 'unranked-visual-evidence';
  scenarioIndex: number;
  scenarioId: string;
  effectAgeMs: number;
  eventTypes: string[];
  entityIds: {
    customers: number[];
    slides: number[];
    jars: number[];
  };
  stationAction: {
    mode: 'holding' | 'blending' | 'blocked-no-jars' | 'idle';
    selectedStationIndex: number;
    selectedFlavor: string;
    processingFlavor: string | null;
    heldFlavor: string | null;
    actionFlavor: string;
    quantizedPercent: number | null;
  };
  counts: {
    customers: number;
    openOrders: number;
    slides: number;
    jars: number;
    washing: number;
    jarsAvailable: number;
    held: number;
    blending: number;
    drinking: number;
    accountedJars: number;
    occupiedOrderLanes: number;
    distinctOrderFlavors: number;
    impatientOrders: number;
    closeOpenOrderPairs: number;
    sameLaneTrafficPairs: number;
    blendPercent: number;
    spawned: number;
    serviceActions: number;
    fulfilled: number;
    resolved: number;
    exited: number;
    walkouts: number;
  };
  visibleRegions: Array<{
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    colors: string[];
  }>;
}

const EVENT_FIXTURES = [
  { name: 'ready', effectAgeMs: 90, eventTypes: ['blend_completed'], reachability: 'engine-reachable' },
  { name: 'serve-feedback', effectAgeMs: 90, eventTypes: ['served'], reachability: 'engine-reachable' },
  { name: 'jar-catch', effectAgeMs: 90, eventTypes: ['jar_caught'], reachability: 'engine-reachable' },
  { name: 'shake-launch', effectAgeMs: 90, eventTypes: ['shake_launched'], reachability: 'engine-reachable' },
  { name: 'return-window', effectAgeMs: 90, eventTypes: ['jar_returned', 'jar_returned'], reachability: 'presentation-only' },
  { name: 'game-over', effectAgeMs: 90, eventTypes: ['jar_smashed', 'life_lost', 'game_lost'], reachability: 'presentation-only' },
] as const;

interface BrowserFailures {
  console: string[];
  page: string[];
  requests: string[];
  responses: string[];
  allowedConsole: RegExp[];
  allowedRequests: RegExp[];
  allowedResponses: RegExp[];
}

const browserFailures = new WeakMap<Page, BrowserFailures>();

test('visual baseline runner and inventory match the pinned manifest', async ({ browser }, testInfo) => {
  expect(browser.version()).toBe(baselineManifest.browser.version);
  expect(testInfo.project.name).toBe(baselineManifest.project);
  expect(process.platform).toBe(baselineManifest.platform);
  expect(maltlinePackage.devDependencies['@playwright/test']).toBe(baselineManifest.playwright);
  expect(maltlinePackage.devDependencies['@fontsource/noto-sans']).toBe(baselineManifest.fontsourceNotoSans);
  const expectedScreenshots = [
    ...DESKTOP_FIXTURES.map((fixture) => `${fixture}.png`),
    'competition-accepted-700.png',
    'competition-eligible.png',
    'competition-inspected-controls-700.png',
    'competition-inspected.png',
    'competition-live-empty-390.png',
    'competition-ranked-390.png',
    'human-lab-active-700.png',
    'human-lab-countdown-1280.png',
    'human-lab-countdown-700.png',
    'human-lab-final-700.png',
    'human-lab-stage-pulse-1280.png',
    'human-lab-welcome-1280.png',
    'keyboard-focus.png',
    'ranked-title-trigger.png',
    ...MINIMUM_WIDTH_GAMEPLAY_FIXTURES.map((fixture) => `${fixture}-700.png`),
    'unsupported-portrait.png',
  ].sort();
  expect(baselineManifest.screenshots.map(({ name }) => name)).toEqual(expectedScreenshots);
});

test.beforeEach(async ({ page }) => {
  const failures: BrowserFailures = {
    console: [],
    page: [],
    requests: [],
    responses: [],
    allowedConsole: [],
    allowedRequests: [],
    allowedResponses: [],
  };
  browserFailures.set(page, failures);
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      const source = location.url
        ? ` (${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1})`
        : '';
      failures.console.push(`${message.text()}${source}`);
    }
  });
  page.on('pageerror', (error) => failures.page.push(error.message));
  page.on('requestfailed', (request) => {
    failures.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.responses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  const failures = browserFailures.get(page)!;
  expect({
    console: failures.console.filter((entry) => !failures.allowedConsole.some((pattern) => pattern.test(entry))),
    page: failures.page,
    requests: failures.requests.filter((entry) => !failures.allowedRequests.some((pattern) => pattern.test(entry))),
    responses: failures.responses.filter((entry) => !failures.allowedResponses.some((pattern) => pattern.test(entry))),
  }).toEqual({ console: [], page: [], requests: [], responses: [] });
  if (!page.isClosed() && await page.locator('[data-maltline-shell]').count() > 0) {
    await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', /^(true|fallback)$/);
  }
});

async function openProduction(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`/src/viewer/${query}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-viewer-ready', 'true');
}

async function installManualAnimationFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      callbacks.delete(id);
    };
    (window as typeof window & { __maltlineAdvanceFrame?: (now: number) => void })
      .__maltlineAdvanceFrame = (now: number): void => {
        const frameCallbacks = [...callbacks.values()];
        callbacks.clear();
        for (const callback of frameCallbacks) callback(now);
      };
  });
}

async function advanceManualFrame(page: Page, now: number): Promise<void> {
  await page.evaluate((timestamp) => {
    const advance = (window as typeof window & { __maltlineAdvanceFrame?: (time: number) => void })
      .__maltlineAdvanceFrame;
    if (!advance) throw new Error('manual animation-frame clock was not installed');
    advance(timestamp);
  }, now);
}

async function playCabinetTape(page: Page, codes: readonly string[][], holdEnter = false): Promise<void> {
  await page.evaluate(({ codes, holdEnter }) => {
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]')!;
    const advance = (window as typeof window & { __maltlineAdvanceFrame?: (time: number) => void }).__maltlineAdvanceFrame!;
    const held = new Set<string>();
    const setKeys = (desired: Set<string>) => {
      for (const code of held) if (!desired.has(code)) {
        root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code })); held.delete(code);
      }
      for (const code of desired) if (!held.has(code)) {
        root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code })); held.add(code);
      }
    };
    advance(0);
    codes.forEach((keys, index) => {
      setKeys(new Set([...keys, ...(holdEnter ? ['Enter'] : [])]));
      advance((index + 1) * 1000 / 60);
    });
    setKeys(new Set(holdEnter ? ['Enter'] : []));
  }, { codes, holdEnter });
}
async function playIdleLoss(page: Page): Promise<void> {
  await playCabinetTape(page, Array.from({ length: 1854 }, () => []));
}

async function openFixture(page: Page, name: string): Promise<void> {
  await page.goto(`/src/viewer/visual-fixtures.html?fixture=${name}`);
  await expect(page.locator('html')).toHaveAttribute('data-fixture-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-fixture', name);
}

async function pressureFixtureMetadata(page: Page): Promise<PressureFixtureMetadata> {
  return page.locator('#visual-fixture-metadata').evaluate((node) =>
    JSON.parse(node.textContent ?? '') as PressureFixtureMetadata);
}

async function advanceFirstRunToPlaying(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen)
    .toBe('instructions');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen)
    .toBe('stage-card');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen)
    .toBe('countdown');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen)
    .toBe('playing');
}

test('production entry loads and paints without browser failures', async ({ page }) => {
  await openProduction(page);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', 'true');
  await expect(page.locator('#overlay-title')).toHaveText('MALTLINE');
  await expect(page.locator('#game')).toHaveAttribute('width', '960');
  await expect(page.locator('#game')).toHaveAttribute('height', '540');
  await expect(page.locator('.splash')).toBeVisible();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  const paintedPixels = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaqueSamples = 0;
    for (let offset = 3; offset < pixels.length; offset += 16_384) {
      if (pixels[offset]! > 0) opaqueSamples++;
    }
    return opaqueSamples;
  });
  expect(paintedPixels).toBeGreaterThan(20);

  const reducedMotionStyles = await page.locator('#overlay-hint').evaluate((hint) => ({
    animationName: getComputedStyle(hint).animationName,
    transitionDuration: getComputedStyle(document.querySelector('.overlay')!).transitionDuration,
  }));
  expect(reducedMotionStyles).toEqual({ animationName: 'none', transitionDuration: '0s' });

  const productionResources = await page.evaluate(() => performance
    .getEntriesByType('resource')
    .map((entry) => entry.name));
  expect(productionResources.filter((url) => url.includes('visual-fixtures'))).toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-fixture-runtime', /.+/);
});

test('live renderer follows mid-session reduced-motion changes without touching game state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  for (let frame = 0; frame <= 24; frame++) await advanceManualFrame(page, frame * 17);

  const signature = () => page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2_166_136_261;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      hash ^= pixels[offset]!;
      hash = Math.imul(hash, 16_777_619);
      hash ^= pixels[offset + 1]!;
      hash = Math.imul(hash, 16_777_619);
      hash ^= pixels[offset + 2]!;
      hash = Math.imul(hash, 16_777_619);
      hash ^= pixels[offset + 3]!;
      hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
  });
  const invariant = () => page.evaluate(() => ({
    status: window.__maltlineViewerStatus,
    focus: document.activeElement?.getAttribute('data-maltline-shell') ?? null,
    flow: document.querySelector('#game-flow-status')?.textContent,
    events: document.querySelector('#game-live-events')?.textContent,
  }));

  const fullMotionPixels = await signature();
  const before = await invariant();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => {
    await advanceManualFrame(page, 24 * 17);
    return signature();
  }).not.toBe(fullMotionPixels);
  expect(await invariant()).toEqual(before);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => {
    await advanceManualFrame(page, 24 * 17);
    return signature();
  }).toBe(fullMotionPixels);
  expect(await invariant()).toEqual(before);
});

const challenge = { id: 'run_browser_full_cabinet', seed: 8,
  gameVersion: MALTLINE_CABINET_AUTHORITY.gameVersion,
  expiresAt: '2099-09-10T20:30:00.000Z' };
async function mockCabinetApi(page: Page, options: { rejectFirst?: boolean; unavailable?: boolean; runDelayMs?: number } = {}) {
  const submissions: Record<string, unknown>[] = [];
  let acceptedEntry: Record<string, unknown> | undefined;
  await page.route('**/api/v2/games/maltline/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/runs')) {
      if (options.runDelayMs) await new Promise(resolve => setTimeout(resolve, options.runDelayMs));
      return route.fulfill({
        status: options.unavailable ? 503 : 201, json: options.unavailable ? { error: 'Ranked line unavailable.' } : challenge,
      });
    }
    if (request.method() === 'GET') return route.fulfill({ json: { entries: acceptedEntry ? [acceptedEntry] : [] } });
    const body = request.postDataJSON() as Record<string, unknown>;
    submissions.push(body);
    const verified = verifyMaltlineCabinetProof(body.proof,
      { runId: challenge.id, nonce: challenge.seed }, MALTLINE_CABINET_AUTHORITY.gameVersion);
    expect(body.score).toEqual(verified.summary);
    expect(body).toMatchObject({ gameVersion: MALTLINE_CABINET_AUTHORITY.gameVersion, runId: challenge.id,
      publication: { policyVersion: 'top50-social-v1', socialMedia: false } });
    if (options.rejectFirst && submissions.length === 1) return route.fulfill({ status: 400, json: { error: 'Choose another callsign.' } });
    acceptedEntry = { id: 'entry_verified_cabinet', gameId: 'maltline',
      gameVersion: MALTLINE_CABINET_AUTHORITY.gameVersion,
      board: { id: 'arcade', label: 'Second Shift', context: {} }, playerName: body.playerName,
      result: verified.summary, createdAt: '2026-09-15T18:00:00.000Z' };
    return route.fulfill({ status: 201, json: { entry: acceptedEntry,
      publication: { rankAtSubmission: 1, replaySaved: true, expiresAt: null } } });
  });
  return submissions;
}
async function startRankedPlay(page: Page): Promise<void> {
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-hint')).toContainText('start ranked');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing', rankEligible: true, competition: { challenge: 'ready', proof: 'recording' },
  });
}

test('ranked public trigger has a reviewed live-shell visual', async ({ page }) => {
  await mockCabinetApi(page); await openProduction(page, '?ranked=preview');
  const trigger = page.getByRole('button', { name: 'SHIFT BOARD', exact: true });
  await expect(trigger).toBeVisible(); await expect(trigger).toBeEnabled();
  await expect(page).toHaveScreenshot('ranked-title-trigger.png');
});

test('sound control is visible, keyboard operable, and reports mute state', async ({ page }) => {
  await mockCabinetApi(page); await openProduction(page, '?ranked=preview');
  const sound = page.getByRole('button', { name: 'Mute sound' });
  await expect(sound).toHaveText('SOUND ON');
  await sound.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Unmute sound' })).toHaveText('SOUND OFF');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveText('SOUND ON');
});

test('first-stage input waits for ranked preflight instead of silently starting unranked', async ({ page }) => {
  await mockCabinetApi(page, { runDelayMs: 250 }); await openProduction(page, '?ranked=preview');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-hint')).toHaveText('Preparing ranked run…');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'stage-card');
  await expect(page.locator('#overlay-hint')).toContainText('start ranked');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    rankEligible: true, competition: { challenge: 'ready', proof: 'recording' },
  });
});

test('the ranked board remains browseable below the gameplay width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await mockCabinetApi(page); await openProduction(page, '?ranked=preview');
  await expect(page.locator('html')).toHaveAttribute('data-supported-device', 'false');
  await page.getByRole('button', { name: 'SHIFT BOARD', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Shift Board' });
  await expect(sheet).toContainText('No ranked runs yet. Set the first high score.');
  const bounds = await sheet.evaluate(element => element.getBoundingClientRect().toJSON());
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot('competition-live-empty-390.png');
});

test('terminal cabinet proof submits through the live SDK panel with server verification and callsign retry', async ({ page }) => {
  await installManualAnimationFrames(page);
  browserFailures.get(page)!.allowedConsole.push(/Failed to load resource: the server responded with a status of 400/u);
  browserFailures.get(page)!.allowedResponses.push(/400 POST .*\/api\/v2\/games\/maltline\/leaderboards\/arcade/u);
  const submissions = await mockCabinetApi(page, { rejectFirst: true });
  await openProduction(page, '?ranked=preview'); await startRankedPlay(page); await playIdleLoss(page);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'gameover', engineTick: 1854, competition: { proof: 'eligible' },
  });
  const dialog = page.getByRole('dialog', { name: 'Shift Board' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  const frozen = await page.evaluate(() => window.__maltlineViewerStatus?.engineTick);
  await page.getByLabel('Callsign', { exact: true }).fill('BAD CALLSIGN');
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(dialog).toContainText('Choose another callsign.');
  await expect(page.getByLabel('Callsign', { exact: true })).toHaveValue('BAD CALLSIGN');
  await page.getByLabel('Callsign', { exact: true }).fill('MALT TEST');
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(dialog).toContainText('Score saved.');
  await expect(dialog).toContainText('MALT TEST');
  expect(submissions).toHaveLength(2);
  expect(submissions.map(body => body.playerName)).toEqual(['BAD CALLSIGN', 'MALT TEST']);
  const replays = await page.evaluate(() => window.__maltlineReplays!);
  expect(submissions[1]!.proof).toEqual(buildMaltlineCabinetProof(
    replays,
    { runId: challenge.id, nonce: challenge.seed },
    MALTLINE_CABINET_AUTHORITY.gameVersion,
  ));
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({ engineTick: frozen, competition: { proof: 'submitted' } });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('[data-maltline-shell]')).toBeFocused();
});

test('losing window focus preserves the local replay while making the cabinet result unranked', async ({ page }) => {
  await installManualAnimationFrames(page); await mockCabinetApi(page);
  await openProduction(page, '?ranked=preview'); await startRankedPlay(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({ screen: 'playing', rankEligible: false });
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await playIdleLoss(page);
  expect(await page.evaluate(() => window.__maltlineReplays?.map(replay => ({ status: replay.finalState.status, ticks: replay.ticks.length }))))
    .toEqual([{ status: 'lost', ticks: 1854 }]);
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toContainText('continues unranked');
  await expect(page.getByRole('button', { name: 'Submit score', exact: true })).not.toBeVisible();
});

test('ranked preflight failure explicitly permits an unranked local replay', async ({ page }) => {
  await installManualAnimationFrames(page); await page.setViewportSize({ width: 700, height: 720 });
  browserFailures.get(page)!.allowedConsole.push(/Failed to load resource: the server responded with a status of 503/u);
  browserFailures.get(page)!.allowedResponses.push(/503 POST .*\/api\/v2\/games\/maltline\/runs/u);
  await mockCabinetApi(page, { unavailable: true }); await openProduction(page, '?ranked=preview');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.locator('.cabinet-rank-notice')).toContainText('Ranked service unavailable. Start unranked to play.');
  await expect(page.locator('#overlay-hint')).toContainText('start unranked');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await playIdleLoss(page);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({ screen: 'gameover', rankEligible: false });
  expect(await page.evaluate(() => window.__maltlineReplays?.[0]?.ticks.length)).toBe(1854);
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit score', exact: true })).not.toBeVisible();
});

test('the complete two-button viewer campaign emits a verifier-accepted cabinet winning proof', async ({ page }) => {
  await installManualAnimationFrames(page); const submissions = await mockCabinetApi(page);
  await openProduction(page, '?ranked=preview'); await startRankedPlay(page);
  for (const [index, tape] of VIEWER_WIN_TAPES.entries()) {
    await playCabinetTape(page, tape.codes);
    expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({ screen: 'cleared', engineTick: tape.replay.finalState.tick });
    await page.keyboard.press('Enter');
    if (index === 3) {
      await expect.poll(async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen)
        .toBe('intermission');
      await page.keyboard.press('Enter');
    }
    if (index + 1 < VIEWER_WIN_TAPES.length) { await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
  }
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({ screen: 'victory', competition: { proof: 'eligible' } });
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toBeVisible();
  await page.getByLabel('Callsign', { exact: true }).fill('CLOSER');
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toContainText('Score saved.');
  const proof = submissions[0]!.proof;
  const verified = verifyMaltlineCabinetProof(proof,
    { runId: challenge.id, nonce: challenge.seed }, MALTLINE_CABINET_AUTHORITY.gameVersion);
  const expected = verifyMaltlineCabinetProof(buildMaltlineCabinetProof(
    VIEWER_WIN_TAPES.map(tape => tape.replay),
    { runId: challenge.id, nonce: challenge.seed },
    MALTLINE_CABINET_AUTHORITY.gameVersion,
  ), { runId: challenge.id, nonce: challenge.seed }, MALTLINE_CABINET_AUTHORITY.gameVersion);
  expect(verified).toEqual(expected);
  expect(verified.summary).toMatchObject({ completed: true, stagesCleared: 8, fulfilled: 145, walkouts: 0, lives: 4, score: 36255 });
});

test('a held presentation key cannot cascade across first-run screens', async ({ page }) => {
  await openProduction(page);

  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]')!;
    const dispatch = (code: string, repeat: boolean): boolean => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code,
        repeat,
      });
      root.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const screen = (): string | undefined => window.__maltlineViewerStatus?.screen;

    const firstPrevented = dispatch('Enter', false);
    const afterFirst = screen();
    const repeats = Array.from({ length: 4 }, () => ({
      prevented: dispatch('Enter', true),
      screen: screen(),
    }));
    const restartRepeat = {
      prevented: dispatch('KeyR', true),
      screen: screen(),
    };
    root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Enter' }));
    const freshPrevented = dispatch('Enter', false);
    const afterFresh = screen();
    root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Enter' }));

    return { firstPrevented, afterFirst, repeats, restartRepeat, freshPrevented, afterFresh };
  });

  expect(result).toEqual({
    firstPrevented: true,
    afterFirst: 'instructions',
    repeats: Array.from({ length: 4 }, () => ({ prevented: true, screen: 'instructions' })),
    restartRepeat: { prevented: true, screen: 'instructions' },
    freshPrevented: true,
    afterFresh: 'stage-card',
  });
});

test('first-run overlays gate simulation and restart returns to a clean Stage 1 card', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceManualFrame(page, 0);
  await advanceManualFrame(page, 1_000);
  const frozen = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(frozen).toMatchObject({ screen: 'title', engineTick: 0, recordedInputs: 0 });

  await page.keyboard.press('Enter');
  await advanceManualFrame(page, 2_000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'instructions',
    engineTick: frozen!.engineTick,
    recordedInputs: frozen!.recordedInputs,
  });

  await page.keyboard.press('Enter');
  await advanceManualFrame(page, 3_000);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'stage-card',
    engineTick: 0,
    recordedInputs: 0,
  });

  await page.keyboard.press('Enter');
  await advanceManualFrame(page, 4_000);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'countdown',
    engineTick: 0,
    recordedInputs: 0,
  });

  await page.keyboard.press('Enter');
  await advanceManualFrame(page, 10_000);
  await advanceManualFrame(page, 10_017);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing',
    engineTick: 1,
    recordedInputs: 1,
  });

  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('KeyR');
  await page.keyboard.up('ArrowDown');
  expect(await page.evaluate(() => ({
    status: window.__maltlineViewerStatus,
    replayCount: window.__maltlineReplays?.length,
  }))).toMatchObject({
    status: {
      screen: 'stage-card',
      engineTick: 0,
      recordedInputs: 0,
      rankEligible: false,
    },
    replayCount: 0,
  });
  await expect(page.locator('#overlay-title')).toHaveText('FIRST POUR');
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await advanceManualFrame(page, 20_000);
  for (let tick = 1; tick <= 5; tick++) {
    await advanceManualFrame(page, 20_000 + tick * (1000 / 60));
  }
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing',
    engineTick: 5,
    playerLane: 0,
  });
});

test('direction taps buffer to cadence and held directions use the deterministic repeat delay', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);
  await advanceManualFrame(page, 1000 / 60);
  await advanceManualFrame(page, 2000 / 60);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    engineTick: 2,
    playerLane: 0,
  });

  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  await advanceManualFrame(page, 3000 / 60);
  await advanceManualFrame(page, 4000 / 60);
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.playerLane).toBe(0);
  await advanceManualFrame(page, 5000 / 60);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    engineTick: 5,
    playerLane: 1,
  });
  for (let tick = 6; tick <= 19; tick++) await advanceManualFrame(page, tick * (1000 / 60));
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.playerLane).toBe(1);

  await page.keyboard.down('ArrowUp');
  await advanceManualFrame(page, 20 * (1000 / 60));
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.playerLane).toBe(0);
  for (let tick = 21; tick <= 34; tick++) await advanceManualFrame(page, tick * (1000 / 60));
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.playerLane).toBe(0);
  await advanceManualFrame(page, 35 * (1000 / 60));
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.playerLane).toBe(0);
  await page.keyboard.up('ArrowUp');
});

test('countdown advances on presentation time without creating an input', async ({ page }) => {
  await openProduction(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-title')).toHaveText('3');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'countdown',
    engineTick: 0,
    recordedInputs: 0,
  });
  await expect.poll(
    async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen,
    { timeout: 3_500 },
  ).toBe('playing');
});

test('stale presentation timers cannot take ownership of a replacement countdown', async ({ page }) => {
  await installManualAnimationFrames(page);
  await page.addInitScript(() => {
    interface PresentationTimerRecord {
      id: number;
      delay: number;
      canceled: boolean;
      fired: boolean;
      callback: (...args: unknown[]) => void;
      args: unknown[];
    }
    interface PresentationTimerProbe {
      invoke(id: number): void;
      snapshot(): {
        currentId: number | null;
        records: Array<Omit<PresentationTimerRecord, 'callback' | 'args'>>;
      };
    }
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    const records = new Map<number, PresentationTimerRecord>();
    let nextId = 1_000_000_000;
    let currentId: number | null = null;

    window.setTimeout = ((handler: TimerHandler, delay = 0, ...args: unknown[]): number => {
      if ((delay === 650 || delay === 350) && typeof handler === 'function') {
        const id = nextId++;
        records.set(id, {
          id,
          delay,
          canceled: false,
          fired: false,
          callback: handler as (...callbackArgs: unknown[]) => void,
          args,
        });
        currentId = id;
        return id;
      }
      return originalSetTimeout(handler, delay, ...args);
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number): void => {
      const record = id === undefined ? undefined : records.get(id);
      if (!record) {
        originalClearTimeout(id);
        return;
      }
      record.canceled = true;
      if (currentId === id) currentId = null;
    }) as typeof window.clearTimeout;

    const probe: PresentationTimerProbe = {
      invoke(id) {
        const record = records.get(id);
        if (!record) throw new Error(`Unknown presentation timer ${id}`);
        record.fired = true;
        if (currentId === id) currentId = null;
        record.callback(...record.args);
      },
      snapshot() {
        return {
          currentId,
          records: [...records.values()].map(({ callback: _callback, args: _args, ...record }) => ({
            ...record,
          })),
        };
      },
    };
    Object.defineProperty(window, '__maltlinePresentationTimerProbe', { value: probe });
  });
  await openProduction(page);

  const timerSnapshot = () => page.evaluate(() => {
    const probe = (window as typeof window & {
      __maltlinePresentationTimerProbe?: {
        snapshot(): {
          currentId: number | null;
          records: Array<{ id: number; delay: number; canceled: boolean; fired: boolean }>;
        };
      };
    }).__maltlinePresentationTimerProbe;
    if (!probe) throw new Error('presentation timer probe was not installed');
    return probe.snapshot();
  });
  const flowSnapshot = () => page.evaluate(() => ({
    status: window.__maltlineViewerStatus,
    screenDataset: document.documentElement.dataset.maltlineScreen,
    overlayTitle: document.querySelector('#overlay-title')?.textContent,
    focusId: document.activeElement?.id,
    replayCount: window.__maltlineReplays?.length,
    announcement: document.querySelector('#game-flow-status')?.textContent,
  }));
  const invokeTimer = (id: number) => page.evaluate((timerId) => {
    const probe = (window as typeof window & {
      __maltlinePresentationTimerProbe?: { invoke(id: number): void };
    }).__maltlinePresentationTimerProbe;
    if (!probe) throw new Error('presentation timer probe was not installed');
    probe.invoke(timerId);
  }, id);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const countdownA = await timerSnapshot();
  const timerA = countdownA.currentId;
  expect(timerA).not.toBeNull();
  expect(countdownA.records).toEqual([{
    id: timerA,
    delay: 650,
    canceled: false,
    fired: false,
  }]);

  await page.keyboard.press('KeyR');
  await expect(page.locator('#overlay-title')).toHaveText('FIRST POUR');
  await page.keyboard.press('Enter');
  const countdownB = await timerSnapshot();
  const timerB = countdownB.currentId;
  expect(timerB).not.toBeNull();
  expect(timerB).not.toBe(timerA);
  expect(countdownB.records.find((record) => record.id === timerA)).toMatchObject({
    canceled: true,
    fired: false,
  });
  expect(countdownB.records.find((record) => record.id === timerB)).toMatchObject({
    delay: 650,
    canceled: false,
    fired: false,
  });

  const beforeStaleCallback = await flowSnapshot();
  expect(beforeStaleCallback).toMatchObject({
    status: {
      screen: 'countdown',
      rankEligible: false,
      engineTick: 0,
      recordedInputs: 0,
    },
    screenDataset: 'countdown',
    overlayTitle: '3',
    focusId: 'overlay-card',
    replayCount: 0,
    announcement: 'Get ready for Stage 1 of 8, First Pour.',
  });

  await invokeTimer(timerA!);
  expect(await flowSnapshot()).toEqual(beforeStaleCallback);
  const afterStaleCallback = await timerSnapshot();
  expect(afterStaleCallback.currentId).toBe(timerB);
  expect(afterStaleCallback.records.find((record) => record.id === timerB)).toMatchObject({
    canceled: false,
    fired: false,
  });

  await invokeTimer(timerB!);
  await expect(page.locator('#overlay-title')).toHaveText('2');
  const afterCurrentCallback = await timerSnapshot();
  const timerAfterTwo = afterCurrentCallback.currentId;
  expect(timerAfterTwo).not.toBeNull();
  expect(timerAfterTwo).not.toBe(timerB);
  expect(await flowSnapshot()).toMatchObject({
    status: { screen: 'countdown', engineTick: 0, recordedInputs: 0 },
    screenDataset: 'countdown',
    overlayTitle: '2',
    focusId: 'overlay-card',
    replayCount: 0,
    announcement: 'Get ready for Stage 1 of 8, First Pour.',
  });

  await page.keyboard.press('Enter');
  const afterManualSkip = await flowSnapshot();
  expect(afterManualSkip).toMatchObject({
    status: { screen: 'playing', rankEligible: false, engineTick: 0, recordedInputs: 0 },
    screenDataset: 'playing',
    focusId: '',
    replayCount: 0,
    announcement: 'Get ready for Stage 1 of 8, First Pour.',
  });
  await invokeTimer(timerAfterTwo!);
  expect(await flowSnapshot()).toEqual(afterManualSkip);
  expect((await timerSnapshot()).currentId).toBeNull();
});

test('flow announcements are meaningful, countdown is throttled, and overlays own control semantics', async ({ page }) => {
  await openProduction(page);
  const dialog = page.getByRole('dialog');
  const flowStatus = page.locator('#game-flow-status');
  const controls = page.locator('.controls');

  await expect(flowStatus).toHaveText(/Maltline\. .*Choose Start Game or press Space \/ Enter/);
  await expect(flowStatus).toHaveAttribute('aria-hidden', 'false');
  await expect(controls).toHaveAttribute('aria-hidden', 'true');
  await expect(controls).toHaveAttribute('inert', '');

  await page.keyboard.press('Enter');
  await expect(dialog).toHaveAttribute(
    'aria-describedby',
    'overlay-body overlay-steps overlay-hint',
  );
  await expect(dialog).toHaveAccessibleDescription(/BUTTON 2 \/ ENTER.*next flavor/);
  await expect(dialog).toHaveAccessibleDescription(/intercept returns/);
  await expect(dialog).toHaveAccessibleDescription(/hold to fill until READY/);
  await expect(dialog).toHaveAccessibleDescription(/release to toss/);
  await expect(flowStatus).toHaveText(/Counter instructions/);

  await page.keyboard.press('Enter');
  await expect(flowStatus).toHaveText(/Stage 1 of 8, First Pour/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-title')).toHaveText('3');
  await expect(flowStatus).toHaveText('Get ready for Stage 1 of 8, First Pour.');
  await page.evaluate(() => {
    const target = document.querySelector('#game-flow-status')!;
    let writes = 0;
    new MutationObserver(() => writes++).observe(target, { childList: true, characterData: true });
    Object.defineProperty(window, '__maltlineFlowWrites', { get: () => writes });
  });

  await expect(page.locator('#overlay-title')).toHaveText('2', { timeout: 1_500 });
  await expect(flowStatus).toHaveText('Get ready for Stage 1 of 8, First Pour.');
  expect(await page.evaluate(() =>
    (window as typeof window & { __maltlineFlowWrites?: number }).__maltlineFlowWrites)).toBe(0);
  await expect(page.locator('#overlay-title')).toHaveText('1', { timeout: 1_500 });
  await expect(flowStatus).toHaveText('Get ready for Stage 1 of 8, First Pour.');
  expect(await page.evaluate(() =>
    (window as typeof window & { __maltlineFlowWrites?: number }).__maltlineFlowWrites)).toBe(0);
  await expect(page.locator('#overlay-title')).toHaveText('SERVE', { timeout: 1_500 });
  await expect(flowStatus).toHaveText('Serve.');
  expect(await page.evaluate(() =>
    (window as typeof window & { __maltlineFlowWrites?: number }).__maltlineFlowWrites)).toBe(1);
  await expect.poll(async () => (await page.evaluate(() => window.__maltlineViewerStatus))?.screen)
    .toBe('playing');
  await expect(flowStatus).toHaveAttribute('aria-hidden', 'true');
  await expect(controls).toHaveAttribute('aria-hidden', 'false');
  await expect(controls).not.toHaveAttribute('inert', '');
});

test('stage clear stays frozen until the player advances it', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await playCabinetTape(page, VIEWER_WIN_TAPES[0]!.codes);

  const cleared = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(cleared).toMatchObject({ screen: 'cleared', engineTick: 1558, recordedInputs: 1558 });
  await expect(page.locator('#overlay-title')).toHaveText('STAGE CLEAR');
  await expect(page.locator('#game-flow-status')).toHaveText(/Stage clear/);
  await page.waitForTimeout(2_150);
  await advanceManualFrame(page, 10_000);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toEqual(cleared);
  await expect(page.locator('#overlay-title')).toHaveText('STAGE CLEAR');

  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'stage-card',
    engineTick: 0,
    recordedInputs: 0,
  });
  await expect(page.locator('#overlay-title')).toHaveText('TWO-TAP');
});

test('holding Enter during two-button play cannot advance the stage clear', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await playCabinetTape(page, VIEWER_WIN_TAPES[0]!.codes, true);

  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'cleared',
    engineTick: 1558,
    recordedInputs: 1558,
  });
  const repeats = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]')!;
    return Array.from({ length: 4 }, () => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Enter',
        repeat: true,
      });
      root.dispatchEvent(event);
      return {
        defaultPrevented: event.defaultPrevented,
        screen: window.__maltlineViewerStatus?.screen,
      };
    });
  });
  expect(repeats).toEqual(Array.from({ length: 4 }, () => ({
    defaultPrevented: true,
    screen: 'cleared',
  })));
  await expect(page.locator('#overlay-title')).toHaveText('STAGE CLEAR');

  const freshPress = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]')!;
    root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Enter' }));
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
    });
    root.dispatchEvent(event);
    root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Enter' }));
    return {
      defaultPrevented: event.defaultPrevented,
      status: window.__maltlineViewerStatus,
    };
  });
  expect(freshPress).toMatchObject({
    defaultPrevented: true,
    status: { screen: 'stage-card', engineTick: 0, recordedInputs: 0 },
  });
  await expect(page.locator('#overlay-title')).toHaveText('TWO-TAP');
});

test('ordinary jitter and long-hitch recovery preserve local replay and mark dropped time unranked', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);
  await advanceManualFrame(page, 17);
  const beforeHitch = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(beforeHitch).toMatchObject({
    screen: 'playing',
    engineTick: 1,
    recordedInputs: 1,
    rankEligible: false,
  });

  await advanceManualFrame(page, 267);
  const afterOrdinaryJitter = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(afterOrdinaryJitter).toMatchObject({
    screen: 'playing',
    engineTick: 16,
    recordedInputs: 16,
    rankEligible: false,
    interruptionReason: null,
    droppedMs: 0,
  });

  await advanceManualFrame(page, 1_267);
  const recovered = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(recovered).toMatchObject({
    screen: 'playing',
    engineTick: afterOrdinaryJitter!.engineTick + 18,
    recordedInputs: afterOrdinaryJitter!.recordedInputs + 18,
    rankEligible: false,
    interruptionReason: 'clock_backlog_dropped',
  });
  expect(recovered!.droppedMs).toBeCloseTo(700.3333333333);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await advanceManualFrame(page, 1_284);
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.engineTick)
    .toBe(recovered!.engineTick + 1);

  await playIdleLoss(page);
  expect(await page.evaluate(() => {
    const replay = window.__maltlineReplays?.at(-1);
    return {
      viewer: window.__maltlineViewerStatus,
      replayCount: window.__maltlineReplays?.length,
      replayStatus: replay?.finalState.status,
      replayTicks: replay?.ticks.length,
      replayFinalTick: replay?.finalState.tick,
    };
  })).toMatchObject({
    viewer: { screen: 'gameover', rankEligible: false, interruptionReason: 'clock_backlog_dropped' },
    replayCount: 1,
    replayStatus: 'lost',
    replayTicks: 1_854,
    replayFinalTick: 1_854,
  });
});

test('left and right arrows run the bartender along the active counter', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);

  await page.keyboard.down('ArrowRight');
  for (let tick = 1; tick <= 12; tick++) {
    await advanceManualFrame(page, tick * (1000 / 60));
  }
  await page.keyboard.up('ArrowRight');
  const downCounter = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(downCounter).toMatchObject({ screen: 'playing', playerStation: 0 });
  expect(downCounter!.playerX).toBeGreaterThan(0);

  await page.keyboard.down('ArrowLeft');
  for (let tick = 13; tick <= 30; tick++) {
    await advanceManualFrame(page, tick * (1000 / 60));
  }
  await page.keyboard.up('ArrowLeft');
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.playerX).toBe(0);
});

test('window blur clears held input and auto-resumes the same local run', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);
  await advanceManualFrame(page, 1000 / 60);
  const beforeBlur = await page.evaluate(() => window.__maltlineViewerStatus);
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing',
    rankEligible: false,
    interruptionReason: 'window_blur',
    playerLane: beforeBlur!.playerLane,
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await advanceManualFrame(page, 10_000);
  for (let tick = 1; tick <= 4; tick++) {
    await advanceManualFrame(page, 10_000 + tick * (1000 / 60));
  }
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing',
    engineTick: beforeBlur!.engineTick + 4,
    playerLane: beforeBlur!.playerLane,
  });
});

test('backgrounding silently freezes ticks and auto-resumes without clock catch-up', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);
  await advanceManualFrame(page, 17);
  const beforeBackground = await page.evaluate(() => window.__maltlineViewerStatus);
  await page.keyboard.down('ArrowDown');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advanceManualFrame(page, 5_000);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing',
    engineTick: beforeBackground!.engineTick,
    recordedInputs: beforeBackground!.recordedInputs,
    rankEligible: false,
    interruptionReason: 'document_hidden',
  });

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advanceManualFrame(page, 20_000);
  expect((await page.evaluate(() => window.__maltlineViewerStatus))!.engineTick)
    .toBe(beforeBackground!.engineTick);
  for (let tick = 1; tick <= 4; tick++) {
    await advanceManualFrame(page, 20_000 + tick * (1000 / 60));
  }
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    engineTick: beforeBackground!.engineTick + 4,
    playerLane: beforeBackground!.playerLane,
  });
  await page.keyboard.up('ArrowDown');
});

test('699/700 transitions stop hidden ticks and draws, clear input, and resume from an anchor', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await installManualAnimationFrames(page);
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.clearRect;
    let clears = 0;
    CanvasRenderingContext2D.prototype.clearRect = function (...args): void {
      clears++;
      original.apply(this, args as [number, number, number, number]);
    };
    Object.defineProperty(window, '__maltlineCanvasClears', { get: () => clears });
  });
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);
  await advanceManualFrame(page, 17);
  await page.keyboard.down('ArrowDown');

  await page.setViewportSize({ width: 699, height: 720 });
  await expect(page.locator('html')).toHaveAttribute('data-supported-device', 'false');
  const paused = await page.evaluate(() => ({
    status: window.__maltlineViewerStatus,
    clears: (window as typeof window & { __maltlineCanvasClears?: number }).__maltlineCanvasClears,
  }));
  expect(paused.status).toMatchObject({
    screen: 'interrupted',
    rankEligible: false,
    interruptionReason: 'unsupported_width',
  });
  await expect(page.locator('#game')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#overlay')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('status', { name: 'Give the shop a little more room' })).toBeVisible();

  await advanceManualFrame(page, 1_000);
  await advanceManualFrame(page, 2_000);
  expect(await page.evaluate(() => ({
    status: window.__maltlineViewerStatus,
    clears: (window as typeof window & { __maltlineCanvasClears?: number }).__maltlineCanvasClears,
  }))).toEqual(paused);

  await page.setViewportSize({ width: 700, height: 720 });
  await expect(page.locator('html')).toHaveAttribute('data-supported-device', 'true');
  await expect(page.locator('#game')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toHaveAttribute('aria-hidden', 'false');
  await advanceManualFrame(page, 10_000);
  const firstResume = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(firstResume).toMatchObject({
    screen: 'playing',
    engineTick: paused.status!.engineTick,
    recordedInputs: paused.status!.recordedInputs,
    playerLane: paused.status!.playerLane,
  });
  await page.evaluate(() => {
    const advance = (window as typeof window & { __maltlineAdvanceFrame?: (time: number) => void })
      .__maltlineAdvanceFrame!;
    for (let frame = 1; frame <= 8; frame++) advance(10_000 + frame * 17);
  });
  const resumed = await page.evaluate(() => window.__maltlineViewerStatus);
  expect(resumed!.engineTick).toBe(paused.status!.engineTick + 8);
  expect(resumed!.playerLane).toBe(paused.status!.playerLane);
  await page.keyboard.up('ArrowDown');
});

test('overlay, semantic status, focus, and keyboard ownership form one accessible contract', async ({ page }) => {
  await openProduction(page);
  const splash = page.locator('.splash');
  await expect(splash).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(splash).toHaveAccessibleName('Maltline A little shop. A big rush.');
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeFocused();
  const titleAria = await splash.ariaSnapshot();
  expect(titleAria).toContain('heading "Maltline A little shop. A big rush." [level=1]');
  expect(titleAria).toContain('Start Game');
  await expect(page.locator('#game-status')).toContainText('Stage 1 of 8, First Pour.');
  await expect(page.locator('#game')).toHaveAttribute('aria-describedby', 'game-status');

  const titleStatus = await page.evaluate(() => window.__maltlineViewerStatus);
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-title')).toHaveText('MATCH · BLEND · SLIDE · CATCH');
  await expect(page.locator('#overlay-steps li')).toHaveCount(5);
  await expect(page.getByRole('dialog')).toContainText('four lives');
  await expect(page.getByRole('dialog')).toContainText('intercept returns');
  await expect(page.getByRole('dialog')).toContainText('release to toss');
  await expect(page.getByRole('dialog')).not.toContainText('slide shake · catch jar');
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'instructions',
    engineTick: titleStatus!.engineTick,
    recordedInputs: titleStatus!.recordedInputs,
  });

  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-title')).toHaveText('FIRST POUR');
  await expect(page.locator('#overlay-kicker')).toContainText('LEARN THE LOOP');
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-title')).toHaveText('3');
  const countdownStatus = await page.evaluate(() => window.__maltlineViewerStatus);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'countdown',
    engineTick: countdownStatus!.engineTick,
    recordedInputs: countdownStatus!.recordedInputs,
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#overlay')).toHaveAttribute('inert', '');
  await expect(page.locator('[data-maltline-shell]')).toBeFocused();
  const playingAria = await page.locator('#game-status').ariaSnapshot();
  expect(playingAria).toContain('- region "Current game status"');
  expect(playingAria).toContain('Score 0. 4 lives. 8 orders left.');
  const playingRootAria = await page.locator('[data-maltline-shell]').ariaSnapshot();
  expect(playingRootAria).not.toContain('Choose Start Game or press Space / Enter');
  expect(playingRootAria).not.toContain('Give the shop a little more room');

  const keyboardResult = await page.evaluate(() => {
    const before = window.__maltlineViewerStatus;
    const input = document.createElement('input');
    const button = document.createElement('button');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.querySelector('[data-maltline-shell]')!.append(input, button, editable);
    const dispatch = (target: HTMLElement, code: string): boolean => {
      target.focus();
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const ignored = [
      dispatch(input, 'ArrowDown'),
      dispatch(button, 'Space'),
      dispatch(editable, 'KeyR'),
    ];
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]')!;
    root.focus();
    const owned = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'ArrowDown',
    });
    root.dispatchEvent(owned);
    root.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'ArrowDown' }));
    input.remove();
    button.remove();
    editable.remove();
    return {
      ignored,
      owned: owned.defaultPrevented,
      screen: window.__maltlineViewerStatus?.screen,
      beforeTick: before?.engineTick,
      afterTick: window.__maltlineViewerStatus?.engineTick,
      beforeInputs: before?.recordedInputs,
      afterInputs: window.__maltlineViewerStatus?.recordedInputs,
    };
  });
  expect(keyboardResult).toMatchObject({ ignored: [false, false, false], owned: true, screen: 'playing' });
  expect(keyboardResult.afterTick).toBe(keyboardResult.beforeTick);
  expect(keyboardResult.afterInputs).toBe(keyboardResult.beforeInputs);
});

test('meaningful engine events update the live region once instead of every frame', async ({ page }) => {
  await installManualAnimationFrames(page);
  await openProduction(page);
  await advanceFirstRunToPlaying(page);
  await advanceManualFrame(page, 0);
  await page.evaluate(() => {
    const target = document.querySelector('#game-live-events')!;
    let writes = 0;
    new MutationObserver(() => writes++).observe(target, { childList: true });
    Object.defineProperty(window, '__maltlineLiveWrites', { get: () => writes });
  });
  await page.keyboard.down('Space');
  await page.evaluate(() => {
    const advance = (window as typeof window & { __maltlineAdvanceFrame?: (time: number) => void })
      .__maltlineAdvanceFrame!;
    for (let frame = 1; frame <= 70; frame++) advance(frame * 17);
  });
  await page.keyboard.up('Space');
  await expect(page.locator('#game-live-events')).toHaveText('Vanilla shake ready.');
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
  expect(await page.evaluate(() =>
    (window as typeof window & { __maltlineLiveWrites?: number }).__maltlineLiveWrites)).toBe(1);
});

test('font request failure reaches a diagnosed and playable fallback title', async ({ page }) => {
  browserFailures.get(page)!.allowedConsole.push(/Failed to decode downloaded font|OTS parsing error/);
  await page.route('**/*.woff2', (route) => route.fulfill({ status: 204, body: '' }));
  await openProduction(page);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', 'fallback');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-font-diagnostic', /.+/);
  await expect(page.locator('[data-maltline-font-definitions]')).toHaveCount(0);
  await expect(page.locator('#overlay-body')).toContainText('Display font unavailable');
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeFocused();
  await advanceFirstRunToPlaying(page);
});

async function paritySignature(page: Page): Promise<unknown> {
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', 'true');
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-maltline-shell]')!;
    const stage = root.querySelector<HTMLElement>('.stage-wrap')!;
    const controls = root.querySelector<HTMLElement>('.controls')!;
    const rootStyle = getComputedStyle(root);
    const bodyStyle = getComputedStyle(document.body);
    return {
      shellSource: root.dataset.maltlineShell,
      fontBundle: document.documentElement.dataset.maltlineFontBundle,
      fontsLoaded: [400, 600, 700, 800].map((weight) =>
        document.fonts.check(`${weight} 16px "Maltline UI"`)),
      bodyFont: bodyStyle.fontFamily,
      structure: [...root.children].filter((element) => !element.classList.contains('cabinet-rank-notice')).map((element) => `${element.tagName}.${element.className}`),
      layout: {
        width: root.getBoundingClientRect().width,
        gap: rootStyle.gap,
        padding: rootStyle.padding,
        stageWidth: stage.getBoundingClientRect().width,
        controlsDisplay: getComputedStyle(controls).display,
      },
    };
  });
}

test('production and fixtures share fonts and shell layout primitives', async ({ page }) => {
  await page.goto('/src/viewer/');
  const production = await paritySignature(page);
  await openFixture(page, 'title');
  const fixture = await paritySignature(page);

  expect(production).toEqual(fixture);
  expect(production).toMatchObject({
    shellSource: 'maltline-shell-v2',
    fontBundle: 'noto-sans-5.3.0-latin',
    fontsLoaded: [true, true, true, true],
    bodyFont: '"Maltline UI", system-ui, sans-serif',
  });
});

test('live cabinet fills desktop while overlays stay crisp and minimum width remains contained', async ({ page }) => {
  await openFixture(page, 'game-over');
  const desktop = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.shell')!.getBoundingClientRect();
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')!.getBoundingClientRect();
    const overlay = getComputedStyle(document.querySelector<HTMLElement>('.overlay')!);
    return {
      shell: { width: shell.width, top: shell.top, bottom: shell.bottom },
      canvasWidth: canvas.width,
      backdropFilter: overlay.backdropFilter,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  expect(desktop.shell.width).toBe(1120);
  expect(desktop.canvasWidth).toBe(1114);
  expect(desktop.shell.top).toBeGreaterThanOrEqual(0);
  expect(desktop.shell.bottom).toBeLessThanOrEqual(720);
  expect(desktop.backdropFilter).toBe('none');
  expect(desktop.scrollWidth).toBe(1280);
  expect(desktop.scrollHeight).toBe(720);

  await page.setViewportSize({ width: 700, height: 720 });
  await openFixture(page, 'reduced-motion');
  const minimum = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.shell')!.getBoundingClientRect();
    const controls = document.querySelector<HTMLElement>('.controls')!.getBoundingClientRect();
    const overlay = getComputedStyle(document.querySelector<HTMLElement>('.overlay')!);
    return {
      shell: { left: shell.left, right: shell.right },
      controlsBottom: controls.bottom,
      transitionDuration: overlay.transitionDuration,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(minimum.shell.left).toBeGreaterThanOrEqual(0);
  expect(minimum.shell.right).toBeLessThanOrEqual(700);
  expect(minimum.controlsBottom).toBeLessThanOrEqual(720);
  expect(minimum.transitionDuration).toBe('0s');
  expect(minimum.scrollWidth).toBe(700);

  await page.setViewportSize({ width: 1024, height: 600 });
  await openFixture(page, 'rush-three-lane');
  const shortViewport = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.shell')!.getBoundingClientRect();
    const controls = document.querySelector<HTMLElement>('.controls')!.getBoundingClientRect();
    return {
      shellBottom: shell.bottom,
      controlsHeight: controls.height,
      controlsBottom: controls.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  expect(shortViewport.controlsHeight).toBeGreaterThan(32);
  expect(shortViewport.shellBottom).toBeLessThanOrEqual(600);
  expect(shortViewport.controlsBottom).toBeLessThanOrEqual(600);
  expect(shortViewport.scrollWidth).toBe(1024);
  expect(shortViewport.scrollHeight).toBe(600);
});

test('short desktop keeps the splash inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/src/viewer/');
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.shell')!.getBoundingClientRect();
    const splash = document.querySelector<HTMLElement>('.splash')!.getBoundingClientRect();
    return {
      shell: { top: shell.top, bottom: shell.bottom },
      splash: { top: splash.top, bottom: splash.bottom },
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  expect(geometry.shell.top).toBeGreaterThanOrEqual(0);
  expect(geometry.shell.bottom).toBeLessThanOrEqual(600);
  expect(geometry.splash.top).toBeGreaterThanOrEqual(0);
  expect(geometry.splash.bottom).toBeLessThanOrEqual(600);
  expect(geometry.scrollWidth).toBe(1024);
  expect(geometry.scrollHeight).toBe(600);
});

test('shell exposes keyboard semantics and fixture status copy stays honest', async ({ page }) => {
  await openFixture(page, 'stage-clear-walkout');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', 'Maltline play field');
  await expect(page.locator('.controls kbd')).toHaveCount(5);
  await expect(page.locator('#overlay-body')).toContainText('7 orders fulfilled');
  await expect(page.locator('#overlay-body')).toContainText('7 happy exits, 1 walkout (8 resolved)');
});

test('teaching and terminal fixtures expose complete readable semantics', async ({ page }) => {
  await openFixture(page, 'instructions');
  await expect(page.getByRole('listitem')).toHaveCount(5);
  const instructions = await page.getByRole('dialog').ariaSnapshot();
  expect(instructions).toContain('hold to fill until READY');
  expect(instructions).toContain('BUTTON 2 / ENTER');
  expect(instructions).toContain('release to toss');
  expect(instructions).toContain('intercept returns');

  await openFixture(page, 'game-over');
  await expect(page.getByRole('dialog')).toContainText('Last life: return jar was missed');
  await expect(page.getByRole('dialog')).toContainText('Missed shakes');
  await expect(page.getByRole('dialog')).toContainText('missed returns');
  await expect(page.getByRole('dialog')).toContainText('walkouts');
  await expect(page.locator('#overlay-hint')).toContainText('restart at Stage 1');

  await openFixture(page, 'victory');
  await expect(page.getByRole('dialog')).toContainText('All 8 stages survived');
  await expect(page.locator('#overlay-hint')).toContainText('run it again');
});

test('reduced-motion fixture selects the renderer motion path', async ({ page }) => {
  await openFixture(page, 'reduced-motion');
  await expect(page.locator('html')).toHaveAttribute('data-motion-mode', 'reduced');
  const metadata = await pressureFixtureMetadata(page);
  expect(metadata.visibleRegions.map((region) => region.label)).toEqual(expect.arrayContaining([
    'slide-body-74-vanilla',
    'slide-trail-74',
  ]));
});

test('truthful chain labels fit their HUD chip at desktop and minimum width', async ({ page }) => {
  for (const width of [1280, 700]) {
    await page.setViewportSize({ width, height: 720 });
    await openFixture(page, 'stage-7-happy-hour-pressure');
    const evidence = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = '700 11px "Maltline UI", system-ui, sans-serif';
      return [2, 10, 11, 31].map((chain) => ({
        label: `CHAIN ${chain}`,
        width: context.measureText(`CHAIN ${chain}`).width,
      }));
    });
    for (const { label, width: textWidth } of evidence) {
      expect(textWidth, `${label} remains inside the 92px chip at ${width}px`).toBeLessThanOrEqual(80);
      expect(label).not.toMatch(/STREAK|×/u);
    }
  }
});

test('numeric lives role stays separated and exact across critical HUD states', async ({ page }) => {
  const cases = [
    { fixture: 'game-over', width: 1280, lives: 0 },
    { fixture: 'stage-7-happy-hour-pressure', width: 1280, lives: 1 },
    { fixture: 'stage-7-happy-hour-pressure', width: 700, lives: 1 },
    { fixture: 'reduced-motion', width: 1280, lives: 2 },
    { fixture: 'stage-4-traffic-corridor', width: 700, lives: 3 },
    { fixture: 'stage-4-traffic-corridor-reduced', width: 700, lives: 3 },
    { fixture: 'first-pour-idle', width: 1280, lives: 4 },
  ] as const;

  for (const expected of cases) {
    await page.setViewportSize({ width: expected.width, height: 720 });
    await openFixture(page, expected.fixture);
    const metadata = await pressureFixtureMetadata(page);
    const lives = metadata.visibleRegions.find(({ label }) =>
      label === `lives-role-${expected.lives}`);
    const orders = metadata.visibleRegions.find(({ label }) => label.startsWith('orders-role-'));
    expect(lives).toMatchObject(MALTLINE_RENDERER_FRAME.hudLives);
    expect(orders).toMatchObject(MALTLINE_RENDERER_FRAME.hudOrders);
    expect(lives!.colors.includes(MALTLINE_VISUAL_THEME.flavors.strawberry.base))
      .toBe(expected.lives > 0);
    expect(lives!.x).toBeGreaterThan(orders!.x + orders!.width);
    expect(lives!.x + lives!.width).toBeLessThan(MALTLINE_RENDERER_FRAME.canvasWidth);

    const geometry = await page.locator('canvas').evaluate((canvas, evidence) => {
      const gameCanvas = canvas as HTMLCanvasElement;
      const bounds = gameCanvas.getBoundingClientRect();
      const scale = bounds.width / 960;
      const { region, hudOrders } = evidence;
      return {
        cssWidth: region.width * scale,
        cssHeight: region.height * scale,
        rightGap: bounds.right - (bounds.left + (region.x + region.width) * scale),
        orderGap: (region.x - (hudOrders.x + hudOrders.width)) * scale,
      };
    }, { region: lives!, hudOrders: orders! });
    // The supported 700px viewport leaves a 670px logical canvas after shell padding and border.
    expect(geometry.cssWidth).toBeGreaterThanOrEqual(expected.width === 700 ? 83.7 : 120);
    expect(geometry.cssHeight).toBeGreaterThanOrEqual(expected.width === 700 ? 16.7 : 24);
    expect(geometry.orderGap).toBeGreaterThanOrEqual(expected.width === 700 ? 5.58 : 8);
    expect(geometry.rightGap).toBeGreaterThanOrEqual(expected.width === 700 ? 8.37 : 12);
  }
});

for (const expected of PRESSURE_FIXTURES) {
  test(`${expected.name} declares coherent pressure provenance and visible entities`, async ({ page }) => {
    await openFixture(page, expected.name);
    await expect(page.locator('html')).toHaveAttribute(
      'data-fixture-provenance',
      'synthetic-pressure-envelope',
    );
    await expect(page.locator('html')).toHaveAttribute('data-fixture-scenario', expected.scenarioId);
    const metadata = await pressureFixtureMetadata(page);
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[expected.scenarioIndex]!;
    expect(metadata).toMatchObject({
      provenance: 'synthetic-pressure-envelope',
      reachability: 'engine-reachable',
      scenarioIndex: expected.scenarioIndex,
      scenarioId: expected.scenarioId,
    });
    expect(metadata.counts.customers).toBeGreaterThanOrEqual(5);
    expect(metadata.counts.openOrders).toBeGreaterThanOrEqual(5);
    expect(metadata.counts.accountedJars).toBe(scenario.jarPoolSize);
    expect(metadata.counts.occupiedOrderLanes).toBe(3);
    expect(metadata.counts.distinctOrderFlavors).toBe(3);
    expect(metadata.counts.impatientOrders).toBeGreaterThanOrEqual(1);
    expect(metadata.counts.customers).toBe(metadata.entityIds.customers.length);
    expect(metadata.counts.slides).toBe(metadata.entityIds.slides.length);
    expect(metadata.counts.jars).toBe(metadata.entityIds.jars.length);
    expect(metadata.counts.customers + metadata.counts.resolved).toBe(metadata.counts.spawned);
    expect(metadata.counts.exited + metadata.counts.walkouts).toBe(metadata.counts.resolved);
    expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.serviceActions);
    expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.spawned);
    const allEntityIds = Object.values(metadata.entityIds).flat();
    expect(new Set(allEntityIds).size).toBe(allEntityIds.length);
    for (const id of allEntityIds) {
      expect(Number.isSafeInteger(id) && id >= 0).toBe(true);
    }
    const regionLabels = metadata.visibleRegions.map((region) => region.label);
    expect(regionLabels.filter((label) => label.startsWith('order-'))).toHaveLength(
      metadata.counts.openOrders,
    );
    expect(regionLabels.filter((label) => label.startsWith('slide-body-'))).toHaveLength(
      metadata.counts.slides,
    );
    expect(regionLabels.filter((label) => label.startsWith('slide-trail-'))).toHaveLength(
      metadata.counts.slides,
    );
    for (const order of metadata.visibleRegions.filter((region) => region.label.startsWith('order-'))) {
      expect(order.y, `${order.label} must remain below the HUD`).toBeGreaterThanOrEqual(46);
    }

    if (expected.scenarioIndex === 3) {
      expect(metadata.counts).toMatchObject({ slides: 1, jars: 1, washing: 1 });
      expect(metadata.counts.closeOpenOrderPairs).toBeGreaterThanOrEqual(1);
      expect(metadata.counts.sameLaneTrafficPairs).toBeGreaterThanOrEqual(1);
    } else if (expected.scenarioIndex === 4) {
      expect(metadata.counts).toMatchObject({
        slides: 0,
        jars: 2,
        washing: 2,
        jarsAvailable: 0,
        held: 0,
        blending: 0,
      });
    } else if (expected.scenarioIndex === 5) {
      expect(metadata.counts).toMatchObject({
        blending: 1,
        jars: 1,
        washing: 1,
        blendPercent: 90,
      });
    } else {
      expect(metadata.counts).toMatchObject({
        customers: 7,
        slides: 1,
        jars: 1,
        washing: 1,
        held: 1,
        drinking: 1,
      });
      expect(metadata.counts.closeOpenOrderPairs).toBeGreaterThanOrEqual(1);
      expect(metadata.counts.sameLaneTrafficPairs).toBeGreaterThanOrEqual(1);
    }

    const regionEvidence = await page.locator('#game').evaluate(
      (canvas: HTMLCanvasElement, regions) => {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Pressure visibility check requires canvas pixels.');
        const channel = (hex: string, start: number): number => Number.parseInt(hex.slice(start, start + 2), 16);
        return regions.map((region) => {
          const left = Math.max(0, Math.floor(region.x * canvas.width / 960));
          const top = Math.max(0, Math.floor(region.y * canvas.height / 540));
          const right = Math.min(canvas.width, Math.ceil((region.x + region.width) * canvas.width / 960));
          const bottom = Math.min(canvas.height, Math.ceil((region.y + region.height) * canvas.height / 540));
          const pixels = context.getImageData(left, top, right - left, bottom - top).data;
          let tokenPixels = 0;
          for (let offset = 0; offset < pixels.length; offset += 4) {
            if (region.colors.some((hex) =>
              Math.abs(pixels[offset]! - channel(hex, 1)) <= 36
              && Math.abs(pixels[offset + 1]! - channel(hex, 3)) <= 36
              && Math.abs(pixels[offset + 2]! - channel(hex, 5)) <= 36)) {
              tokenPixels++;
            }
          }
          return {
            label: region.label,
            inside: region.x >= 0 && region.y >= 0
              && region.x + region.width <= 960
              && region.y + region.height <= 540,
            tokenPixels,
          };
        });
      },
      metadata.visibleRegions,
    );
    expect(regionEvidence.length).toBeGreaterThan(metadata.counts.customers + 4);
    for (const region of regionEvidence) {
      expect(region.inside, `${region.label} must remain inside the authored canvas`).toBe(true);
      const minimumIdentityPixels = region.label.startsWith('order-')
        || region.label.startsWith('slide-body-')
        || region.label.startsWith('slide-trail-') ? 20 : 1;
      expect(region.tokenPixels, `${region.label} must retain visible identity pixels`)
        .toBeGreaterThan(minimumIdentityPixels);
    }
  });
}

test('Stage 4 collision corridor preserves separate customer, shake, and return identities', async ({ page }) => {
  await openFixture(page, 'stage-4-traffic-corridor');
  const metadata = await pressureFixtureMetadata(page);
  const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[3]!;
  expect(metadata).toMatchObject({
    provenance: 'synthetic-pressure-envelope',
    reachability: 'engine-reachable',
    scenarioIndex: 3,
    scenarioId: 'maltline-04-lunch-rush',
    counts: {
      customers: 5,
      openOrders: 5,
      slides: 1,
      jars: 1,
      washing: 1,
      jarsAvailable: 2,
      sameLaneTrafficPairs: 1,
    },
  });
  expect(metadata.counts.accountedJars).toBe(scenario.jarPoolSize);
  expect(metadata.counts.customers + metadata.counts.resolved).toBe(metadata.counts.spawned);
  expect(metadata.counts.exited + metadata.counts.walkouts).toBe(metadata.counts.resolved);
  expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.serviceActions);
  expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.spawned);
  const allEntityIds = Object.values(metadata.entityIds).flat();
  expect(new Set(allEntityIds).size).toBe(allEntityIds.length);
  for (const id of allEntityIds) expect(Number.isSafeInteger(id) && id >= 0).toBe(true);
  expect(metadata.visibleRegions.map((region) => region.label)).toEqual(expect.arrayContaining([
    'order-201-strawberry',
    'order-202-chocolate',
    'slide-body-211-chocolate',
    'slide-trail-211',
    'jar-212',
  ]));
});

test('reduced-motion Stage 4 corridor preserves opposing traffic and coherent fixture identity', async ({ page }) => {
  await openFixture(page, 'stage-4-traffic-corridor-reduced');
  await expect(page.locator('html')).toHaveAttribute('data-motion-mode', 'reduced');
  const metadata = await pressureFixtureMetadata(page);
  const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[3]!;
  expect(metadata).toMatchObject({
    provenance: 'synthetic-pressure-envelope',
    reachability: 'engine-reachable',
    scenarioIndex: 3,
    scenarioId: 'maltline-04-lunch-rush',
    counts: {
      customers: 5,
      openOrders: 5,
      slides: 1,
      jars: 1,
      washing: 1,
      jarsAvailable: 2,
      sameLaneTrafficPairs: 1,
    },
  });
  expect(metadata.counts.accountedJars).toBe(scenario.jarPoolSize);
  expect(metadata.counts.customers + metadata.counts.resolved).toBe(metadata.counts.spawned);
  expect(metadata.counts.exited + metadata.counts.walkouts).toBe(metadata.counts.resolved);
  expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.serviceActions);
  expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.spawned);
  const allEntityIds = Object.values(metadata.entityIds).flat();
  expect(new Set(allEntityIds).size).toBe(allEntityIds.length);
  for (const id of allEntityIds) expect(Number.isSafeInteger(id) && id >= 0).toBe(true);
  expect(metadata.visibleRegions.map((region) => region.label)).toEqual(expect.arrayContaining([
    'slide-body-211-chocolate',
    'slide-trail-211',
    'jar-212',
  ]));
});

test('Stage 6 split fixtures keep selected Chocolate separate from processing Strawberry', async ({ page }) => {
  const layout = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[5]!);
  const snapshots: Array<Pick<PressureFixtureMetadata,
    'entityIds' | 'counts' | 'stationAction' | 'rankEligibility'>> = [];
  for (const [fixture, motion] of [
    ['stage-6-station-tool-split', 'full'],
    ['stage-6-station-tool-split-reduced', 'reduced'],
  ] as const) {
    await openFixture(page, fixture);
    await expect(page.locator('html')).toHaveAttribute('data-motion-mode', motion);
    await expect(page.locator('html')).toHaveAttribute(
      'data-fixture-rank-eligibility',
      'unranked-visual-evidence',
    );
    const metadata = await pressureFixtureMetadata(page);
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[5]!;
    expect(metadata).toMatchObject({
      provenance: 'synthetic-pressure-envelope',
      reachability: 'engine-reachable',
      rankEligibility: 'unranked-visual-evidence',
      scenarioIndex: 5,
      scenarioId: 'maltline-06-thick-shakes',
      stationAction: {
        mode: 'blending',
        selectedStationIndex: 1,
        selectedFlavor: 'chocolate',
        processingFlavor: 'strawberry',
        heldFlavor: null,
        actionFlavor: 'strawberry',
        quantizedPercent: 50,
      },
      counts: {
        customers: 6,
        openOrders: 6,
        jars: 1,
        washing: 1,
        jarsAvailable: 2,
        held: 0,
        blending: 1,
        blendPercent: 50,
      },
    });
    expect(metadata.counts.accountedJars).toBe(scenario.jarPoolSize);
    expect(metadata.counts.customers + metadata.counts.resolved).toBe(metadata.counts.spawned);
    expect(metadata.counts.exited + metadata.counts.walkouts).toBe(metadata.counts.resolved);
    expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.serviceActions);
    const ids = Object.values(metadata.entityIds).flat();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(Number.isSafeInteger(id) && id > 0).toBe(true);

    const regions = metadata.visibleRegions.filter(({ label }) =>
      label === 'selected-station-1'
      || label === 'processing-cup-strawberry'
      || label === 'action-status-blending');
    expect(regions.map(({ label }) => label)).toEqual([
      'selected-station-1',
      'processing-cup-strawberry',
      'action-status-blending',
    ]);
    expect(regions.find(({ label }) => label === 'selected-station-1'))
      .toMatchObject({ ...layout.workstation(1, 1).pitchers.find(pitcher => pitcher.stationIndex === 1)!.bounds });
    expect(regions.find(({ label }) => label === 'processing-cup-strawberry'))
      .toMatchObject({ ...layout.workstation(1, 1).pitchers.find(pitcher => pitcher.stationIndex === 2)!.bounds });
    expect(regions.find(({ label }) => label === 'action-status-blending'))
      .toMatchObject({ ...layout.workstation(1, 1).status.bounds });
    expect(metadata.visibleRegions.find(({ label }) => label === 'clean-cup-rack'))
      .toMatchObject({
        x: Math.max(0, layout.cleanRack.bounds.x),
        y: Math.max(0, layout.cleanRack.bounds.y),
        width: Math.min(960, layout.cleanRack.bounds.x + layout.cleanRack.bounds.width)
          - Math.max(0, layout.cleanRack.bounds.x),
        height: Math.min(540, layout.cleanRack.bounds.y + layout.cleanRack.bounds.height)
          - Math.max(0, layout.cleanRack.bounds.y),
      });

    const evidence = await page.locator('#game').evaluate(
      (canvas: HTMLCanvasElement, targetRegions) => {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Station evidence requires canvas pixels.');
        const scale = canvas.getBoundingClientRect().width / canvas.width;
        const channel = (hex: string, start: number): number => Number.parseInt(hex.slice(start, start + 2), 16);
        return targetRegions.map((region) => {
          const pixels = context.getImageData(
            Math.floor(region.x * canvas.width / 960),
            Math.floor(region.y * canvas.height / 540),
            Math.ceil(region.width * canvas.width / 960),
            Math.ceil(region.height * canvas.height / 540),
          ).data;
          let tokenPixels = 0;
          for (let offset = 0; offset < pixels.length; offset += 4) {
            if (region.colors.some((hex) =>
              Math.abs(pixels[offset]! - channel(hex, 1)) <= 36
              && Math.abs(pixels[offset + 1]! - channel(hex, 3)) <= 36
              && Math.abs(pixels[offset + 2]! - channel(hex, 5)) <= 36)) tokenPixels++;
          }
          return {
            label: region.label,
            cssWidth: region.width * scale,
            cssHeight: region.height * scale,
            tokenPixels,
          };
        });
      },
      regions,
    );
    for (const region of evidence) {
      expect(region.tokenPixels, `${region.label} retains semantic theme pixels`).toBeGreaterThan(20);
    }
    const selectedFlavor = evidence.find(({ label }) => label === 'selected-station-1')!;
    const processingCup = evidence.find(({ label }) => label === 'processing-cup-strawberry')!;
    const actionStatus = evidence.find(({ label }) => label === 'action-status-blending')!;
    expect(selectedFlavor.cssWidth).toBeGreaterThanOrEqual(18);
    expect(selectedFlavor.cssHeight).toBeGreaterThanOrEqual(23);
    expect(processingCup.cssWidth).toBeGreaterThanOrEqual(8);
    expect(processingCup.cssHeight).toBeGreaterThanOrEqual(24);
    expect(actionStatus.cssWidth).toBeGreaterThanOrEqual(65);
    expect(actionStatus.cssHeight).toBeGreaterThanOrEqual(15);
    snapshots.push({
      entityIds: metadata.entityIds,
      counts: metadata.counts,
      stationAction: metadata.stationAction,
      rankEligibility: metadata.rankEligibility,
    });
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test('keyboard focus has a stable visible game boundary', async ({ page }) => {
  await openFixture(page, 'first-pour-idle');
  const shell = page.locator('[data-maltline-shell]');
  await page.keyboard.press('Tab');
  await expect(shell).toBeFocused();
  await expect(page.locator('.stage-wrap')).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.stage-wrap')).toHaveCSS('outline-width', '3px');
  await expect(page).toHaveScreenshot('keyboard-focus.png');
});

for (const fixture of DESKTOP_FIXTURES) {
  test(`desktop ${fixture}`, async ({ page }) => {
    await openFixture(page, fixture);
    await expect(page).toHaveScreenshot(`${fixture}.png`);
  });
}

for (const fixture of EVENT_FIXTURES) {
  test(`fixture provenance pins ${fixture.name} event age`, async ({ page }) => {
    await openFixture(page, fixture.name);
    const metadata = await page.locator('#visual-fixture-metadata').evaluate((node) =>
      JSON.parse(node.textContent ?? '') as PressureFixtureMetadata);
    expect(metadata.effectAgeMs).toBe(fixture.effectAgeMs);
    expect(metadata.eventTypes).toEqual(fixture.eventTypes);
    expect(metadata.reachability).toBe(fixture.reachability);
    await expect(page.locator('html')).toHaveAttribute('data-fixture-reachability', fixture.reachability);
    if (fixture.reachability === 'presentation-only') {
      expect(metadata.provenance).toBe('synthetic-isolated-event');
      await expect(page.locator('html')).toHaveAttribute(
        'data-fixture-provenance',
        'synthetic-isolated-event',
      );
    } else {
      expect(metadata.provenance).not.toBe('synthetic-isolated-event');
      expect(metadata.counts.customers + metadata.counts.resolved).toBe(metadata.counts.spawned);
      expect(metadata.counts.exited + metadata.counts.walkouts).toBe(metadata.counts.resolved);
      expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.serviceActions);
      expect(metadata.counts.fulfilled).toBeLessThanOrEqual(metadata.counts.spawned);
    }
    if (fixture.name !== 'game-over') {
      expect(metadata.counts.accountedJars).toBe(MALTLINE_CAMPAIGN[metadata.scenarioIndex]!.jarPoolSize);
    }
    if (fixture.name === 'return-window') {
      const targets = metadata.visibleRegions.filter(({ label }) => label.startsWith('return-target-'));
      expect(targets.map(({ label }) => label)).toEqual([
        'return-target-0-catch',
        'return-target-1-move',
      ]);
      const layout = deriveMaltlineRendererLayout(MALTLINE_CAMPAIGN[metadata.scenarioIndex]!);
      expect(targets[0]).toMatchObject({ ...layout.projectReturningJar(0, 0).catchCue! });
      expect(targets[1]).toMatchObject({ ...layout.projectReturningJar(0, 1).catchCue! });
    }
  });
}

test('laptop geometry keeps the full game shell visible', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openFixture(page, 'rush-three-lane');

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const controls = document.querySelector('.controls')!.getBoundingClientRect();
    return {
      canvas: { left: canvas.left, right: canvas.right, top: canvas.top },
      controlsBottom: controls.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      supported: document.documentElement.dataset.supportedDevice,
    };
  });

  expect(geometry.scrollWidth).toBeLessThanOrEqual(1024);
  expect(geometry.canvas.left).toBeGreaterThanOrEqual(0);
  expect(geometry.canvas.right).toBeLessThanOrEqual(1024);
  expect(geometry.canvas.top).toBeGreaterThanOrEqual(0);
  expect(geometry.controlsBottom).toBeLessThanOrEqual(768);
  expect(geometry.supported).toBe('true');
});

for (const fixture of PRESSURE_FIXTURES) {
  test(`laptop geometry contains ${fixture.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openFixture(page, fixture.name);
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const controls = document.querySelector('.controls')!.getBoundingClientRect();
      const stage = document.querySelector('.stage-wrap')!.getBoundingClientRect();
      return {
        canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
        stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom },
        controlsBottom: controls.bottom,
        scrollWidth: document.documentElement.scrollWidth,
        supported: document.documentElement.dataset.supportedDevice,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(1024);
    expect(geometry.canvas.left).toBeGreaterThanOrEqual(0);
    expect(geometry.canvas.right).toBeLessThanOrEqual(1024);
    expect(geometry.canvas.top).toBeGreaterThanOrEqual(geometry.stage.top);
    expect(geometry.canvas.bottom).toBeLessThanOrEqual(geometry.stage.bottom);
    expect(geometry.controlsBottom).toBeLessThanOrEqual(768);
    expect(geometry.supported).toBe('true');
  });
}

for (const fixture of MINIMUM_WIDTH_GAMEPLAY_FIXTURES) {
  test(`minimum-width ${fixture} remains exact and contained`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 720 });
    await openFixture(page, fixture);
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const controls = document.querySelector('.controls')!.getBoundingClientRect();
      return {
        canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
        controlsBottom: controls.bottom,
        scrollWidth: document.documentElement.scrollWidth,
        supported: document.documentElement.dataset.supportedDevice,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(700);
    expect(geometry.canvas.left).toBeGreaterThanOrEqual(0);
    expect(geometry.canvas.right).toBeLessThanOrEqual(700);
    expect(geometry.canvas.top).toBeGreaterThanOrEqual(0);
    expect(geometry.canvas.bottom).toBeLessThanOrEqual(720);
    expect(geometry.controlsBottom).toBeLessThanOrEqual(720);
    expect(geometry.supported).toBe('true');
    await expect(page).toHaveScreenshot(`${fixture}-700.png`);
  });
}

test('portrait presents an accessible unsupported-device state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'first-pour-idle');

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const bounds = canvas.getBoundingClientRect();
    return {
      cssWidth: bounds.width,
      internalWidth: canvas.width,
      canvasDisplay: getComputedStyle(canvas).display,
      controlsDisplay: getComputedStyle(document.querySelector('.controls')!).display,
      scrollWidth: document.documentElement.scrollWidth,
      supported: document.documentElement.dataset.supportedDevice,
    };
  });

  expect(geometry.scrollWidth).toBeLessThanOrEqual(390);
  expect(geometry.cssWidth).toBe(0);
  expect(geometry.internalWidth).toBe(960);
  expect(geometry.canvasDisplay).toBe('none');
  expect(geometry.controlsDisplay).toBe('none');
  expect(geometry.supported).toBe('false');
  const unsupportedStatus = page.getByRole('status', { name: 'Give the shop a little more room' });
  await expect(unsupportedStatus).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Give the shop a little more room' })).toBeVisible();
  await expect(unsupportedStatus).toContainText('keyboard');
  await expect(unsupportedStatus).toContainText('700px');
  await expect(page).toHaveScreenshot('unsupported-portrait.png');
});

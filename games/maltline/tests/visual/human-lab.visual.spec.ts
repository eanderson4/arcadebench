import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const AD_TOKEN = 'exp049-lab-k7m4q2';
const DA_TOKEN = 'exp049-lab-p9v2n6';
const AD_700_TOKEN = 'exp049-lab-r3c8w5';
const DA_700_TOKEN = 'exp049-lab-x6h1t9';
const ASSIGNMENTS = [
  { token: AD_TOKEN, order: 'A then D', experience: 'First-time Maltline player', width: 1280 },
  { token: DA_TOKEN, order: 'D then A', experience: 'First-time Maltline player', width: 1280 },
  { token: AD_700_TOKEN, order: 'A then D', experience: 'First-time Maltline player', width: 700 },
  { token: DA_700_TOKEN, order: 'D then A', experience: 'First-time Maltline player', width: 700 },
  { token: 'exp049-lab-c4n7d2', order: 'A then D', experience: 'Informed Maltline player', width: 1280 },
  { token: 'exp049-lab-v8j3m6', order: 'D then A', experience: 'Informed Maltline player', width: 1280 },
  { token: 'exp049-lab-h2w9q5', order: 'A then D', experience: 'Informed Maltline player', width: 700 },
  { token: 'exp049-lab-t6r1k8', order: 'D then A', experience: 'Informed Maltline player', width: 700 },
] as const;

interface BrowserAudit {
  consoleErrors: string[];
  pageErrors: string[];
}

const browserAudits = new WeakMap<Page, BrowserAudit>();

test.beforeEach(async ({ page }) => {
  const audit: BrowserAudit = { consoleErrors: [], pageErrors: [] };
  browserAudits.set(page, audit);
  page.on('console', (message) => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  await page.addInitScript(() => {
    let nextFrame = 1;
    const frames = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      frames.delete(id);
    };
    (window as typeof window & { __advanceLabFrame?: (now: number) => void }).__advanceLabFrame = (now) => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    };

    const prohibited: string[] = [];
    (window as typeof window & { __labProhibitedCalls?: string[] }).__labProhibitedCalls = prohibited;
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      prohibited.push('storage.setItem');
      nativeSetItem.call(this, key, value);
    };
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string): void {
      prohibited.push('storage.removeItem');
      nativeRemoveItem.call(this, key);
    };
    const nativeClear = Storage.prototype.clear;
    Storage.prototype.clear = function (): void {
      prohibited.push('storage.clear');
      nativeClear.call(this);
    };
    const nativeFetch = window.fetch;
    window.fetch = (...args): ReturnType<typeof fetch> => {
      prohibited.push(`fetch:${String(args[0])}`);
      return nativeFetch(...args);
    };
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
      prohibited.push(`xhr:${String(args[1])}`);
      Reflect.apply(nativeOpen, this, args);
    } as typeof nativeOpen;
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (...args): boolean => {
      prohibited.push(`beacon:${String(args[0])}`);
      return nativeBeacon(...args);
    };
    const NativeWebSocket = window.WebSocket;
    class AuditedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        prohibited.push(`websocket:${String(url)}`);
        super(url, protocols);
      }
    }
    window.WebSocket = AuditedWebSocket;
  });
});

test.afterEach(async ({ page }) => {
  const audit = browserAudits.get(page)!;
  expect(audit).toEqual({ consoleErrors: [], pageErrors: [] });
});

async function openLab(page: Page, token?: string): Promise<void> {
  const resolvedToken = token ?? (page.viewportSize()?.width === 700 ? AD_700_TOKEN : AD_TOKEN);
  const response = await page.goto(`/src/viewer/human-lab.html?token=${resolvedToken}&labTestDriver=1`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', /^(true|fallback)$/);
}

async function driverAdvance(page: Page): Promise<void> {
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface);
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.advance());
  if (before === 'stage-card') {
    await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
      .toBe('countdown');
    await completeLabCountdown(page);
  }
}

async function beginLabCountdown(page: Page): Promise<void> {
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.advance());
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('countdown');
}

async function completeLabCountdown(page: Page): Promise<void> {
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.completeCountdown());
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('playing');
}

async function drawFrame(page: Page, now = 0): Promise<void> {
  await page.evaluate((timestamp) => {
    (window as typeof window & { __advanceLabFrame?: (time: number) => void })
      .__advanceLabFrame?.(timestamp);
  }, now);
}

async function finishCurrentStage(page: Page, status: 'won' | 'lost' = 'won'): Promise<void> {
  await page.evaluate((terminalStatus) => {
    window.__maltlineHumanLabTestDriver!.finishStage(terminalStatus);
  }, status);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('terminal');
  await driverAdvance(page);
}

async function beginFromWelcome(page: Page): Promise<void> {
  await driverAdvance(page);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ phase: 'practice', surface: 'stage-card', activeStage: 1 });
  await driverAdvance(page);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('playing');
  await drawFrame(page);
}

async function playPractice(page: Page, stages: number): Promise<void> {
  for (let index = 0; index < stages; index++) {
    await finishCurrentStage(page);
    if (index + 1 < stages) await driverAdvance(page);
  }
}

async function completeStagePulse(
  page: Page,
  options: {
    pressure?: number;
    pacing?: 'too-idle' | 'balanced' | 'too-relentless';
    hardest?: string;
    loss?: string;
  } = {},
): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('stage-pulse');
  await page.locator(`input[name="pulse-pressure"][value="${options.pressure ?? 4}"]`).check();
  await page.locator(`input[name="pulse-pacing"][value="${options.pacing ?? 'balanced'}"]`).check();
  if (options.hardest !== undefined) await page.locator('textarea[name="pulse-hardest"]').fill(options.hardest);
  if (await page.locator('textarea[name="pulse-loss"]').count()) {
    await page.locator('textarea[name="pulse-loss"]').fill(options.loss ?? 'I lost track of the return window.');
  }
  await page.getByRole('button', { name: 'Save stage feedback' }).click();
}

async function playRound(page: Page, stages: number, finalStatus: 'won' | 'lost' = 'won'): Promise<void> {
  for (let index = 0; index < stages; index++) {
    await finishCurrentStage(page, index + 1 === stages ? finalStatus : 'won');
    await completeStagePulse(page, { pressure: Math.min(7, index + 3) });
    if (index + 1 < stages) await driverAdvance(page);
  }
}

async function completeRoundExperience(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('round-experience');
  await page.locator('input[name="round-1-jars"][value="planning"]').check();
  await page.locator('input[name="round-1-recovery"][value="6"]').check();
  await page.locator('input[name="round-2-jars"][value="both"]').check();
  await page.locator('input[name="round-2-recovery"][value="3"]').check();
  await page.getByRole('button', { name: 'Continue to final comparison' }).click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('comparison');
}

async function reachRoundExperience(page: Page): Promise<void> {
  await beginFromWelcome(page);
  await playPractice(page, 3);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ phase: 'round1', surface: 'stage-card', activeStage: 4 });
  await driverAdvance(page);
  await playRound(page, 4);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('intermission');
  await driverAdvance(page);
  await driverAdvance(page);
  await playRound(page, 4);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('round-experience');
}

async function reachComparison(page: Page): Promise<void> {
  await reachRoundExperience(page);
  await completeRoundExperience(page);
}

async function expectMappingHidden(page: Page): Promise<void> {
  const ordinaryDom = await page.locator('body').evaluate((body) => body.outerHTML);
  expect(ordinaryDom).not.toContain('a-registered-control');
  expect(ordinaryDom).not.toContain('d-combined');
  expect(ordinaryDom).not.toMatch(/Round 1 was setup|Round 2 was setup|setup A then setup D|setup D then setup A/iu);
}

interface BlindingSurface {
  visibleText: string[];
  aria: string;
  head: {
    title: string;
    description: string | null;
    themeColor: string | null;
  };
  attributes: string[];
}

async function captureBlindingSurface(page: Page): Promise<BlindingSurface> {
  return {
    visibleText: await page.locator('body').evaluate((body) => [...body.querySelectorAll<HTMLElement>('*')]
      .filter((element) => element.children.length === 0
        && element.textContent?.trim()
        && element.closest('.visually-hidden,[aria-hidden="true"]') === null
        && element.getBoundingClientRect().width > 0
        && element.getBoundingClientRect().height > 0)
      .map((element) => element.textContent!.trim())),
    aria: await page.locator('body').ariaSnapshot(),
    head: await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null,
      themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null,
    })),
    attributes: await page.locator('body').evaluate((body) => [body, ...body.querySelectorAll('*')]
      .map((element) => `${element.tagName.toLowerCase()} ${[...element.attributes]
        .map(({ name, value }) => `${name}=${value}`).sort().join(' ')}`)),
  };
}

function normalizeRoundLabels(value: BlindingSurface): string {
  return JSON.stringify(value).replace(/round\s+[12]/giu, 'round #');
}

async function captureComparisonRounds(
  page: Page,
  token: string,
): Promise<Record<1 | 2, Record<string, BlindingSurface>>> {
  await openLab(page, token);
  await beginFromWelcome(page);
  await playPractice(page, 3);
  const rounds = { 1: {}, 2: {} } as Record<1 | 2, Record<string, BlindingSurface>>;
  for (const round of [1, 2] as const) {
    for (let stage = 4; stage <= 7; stage++) {
      rounds[round][`stage-${stage}-card`] = await captureBlindingSurface(page);
      await beginLabCountdown(page);
      rounds[round][`stage-${stage}-countdown`] = await captureBlindingSurface(page);
      await completeLabCountdown(page);
      await drawFrame(page, round * 1_000 + stage);
      rounds[round][`stage-${stage}-playing`] = await captureBlindingSurface(page);
      await page.evaluate(() => window.__maltlineHumanLabTestDriver!.finishStage('won'));
      rounds[round][`stage-${stage}-terminal`] = await captureBlindingSurface(page);
      await driverAdvance(page);
      rounds[round][`stage-${stage}-pulse`] = await captureBlindingSurface(page);
      await completeStagePulse(page);
    }
    if (round === 1) {
      await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
        .toBe('intermission');
      await driverAdvance(page);
    }
  }
  return rounds;
}

test('rejects missing and unknown opaque assignments before gameplay mounts', async ({ page }) => {
  for (const query of ['', '?token=not-an-assignment']) {
    await page.goto(`/src/viewer/human-lab.html${query}`);
    await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'rejected');
    await expect(page.getByRole('alert')).toContainText('Assignment required');
    await expect(page.locator('canvas')).toHaveCount(0);
  }
});

test('accepts the crossed eight-token study deck only at its assigned width', async ({ page }) => {
  const source = await readFile(new URL('../../src/viewer/human-lab.ts', import.meta.url), 'utf8');
  expect(ASSIGNMENTS.filter(({ order }) => order === 'A then D')).toHaveLength(4);
  expect(ASSIGNMENTS.filter(({ order }) => order === 'D then A')).toHaveLength(4);
  for (const assignment of ASSIGNMENTS) {
    await page.setViewportSize({ width: assignment.width, height: 720 });
    const response = await page.goto(`/src/viewer/human-lab.html?token=${assignment.token}`);
    expect(response?.ok()).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'true');
    await expect(page.getByText(`Assigned experience · ${assignment.experience}`, { exact: true }))
      .toBeVisible();
    await expect(page.getByText(`Assigned test width · ${assignment.width} CSS pixels`, { exact: true }))
      .toBeVisible();
    const candidates = assignment.order === 'A then D'
      ? "['a-registered-control', 'd-combined']"
      : "['d-combined', 'a-registered-control']";
    const stratum = assignment.experience.startsWith('First-time') ? 'first-time' : 'informed';
    const record = source.slice(source.indexOf(`'${assignment.token}'`),
      source.indexOf(`'${assignment.token}'`) + 350);
    expect(record).toContain(candidates);
    expect(record).toContain(`experienceStratum: '${stratum}'`);
    expect(record).toContain(`assignedViewportCssWidth: ${assignment.width}`);
    await expectMappingHidden(page);
  }
});

test('rejects a valid assignment at the wrong entry width before mounting gameplay', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  const response = await page.goto(`/src/viewer/human-lab.html?token=${AD_TOKEN}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'rejected');
  await expect(page.getByRole('alert')).toContainText('exactly 1280 CSS pixels wide');
  await expect(page.locator('[data-maltline-shell], canvas')).toHaveCount(0);
});

test('requires accessible participant-affirmed consent without ticks or a keyboard bypass', async ({ page }) => {
  const response = await page.goto(`/src/viewer/human-lab.html?token=${AD_TOKEN}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'true');
  const dialog = page.getByRole('dialog');
  const code = page.getByRole('textbox', { name: 'Facilitator participant code' });
  const affirmation = page.getByRole('checkbox', { name: /voluntarily agree/iu });
  const submit = page.getByRole('button', { name: 'Affirm and start practice' });
  await expect(code).toBeFocused();
  await expect(dialog).toHaveAccessibleDescription(/Consent statement v2.*records your facilitator code.*Nothing is ranked or sent over the network.*keyboard-only.*15–20 minutes.*stop at any time without saving/isu);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Stop without saving' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(code).toBeFocused();
  await dialog.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await expect(page.getByRole('heading', { name: 'CHECK YOUR ASSIGNMENT' })).toBeVisible();

  await code.fill('p-UPPER1');
  await submit.click();
  expect(await code.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await expect(code).toBeFocused();
  await code.fill('p-a1b2c3');
  await submit.click();
  expect(await affirmation.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await expect(affirmation).toBeFocused();
  await affirmation.check();
  await submit.click();
  await expect(page.getByRole('heading', { name: 'FIRST POUR' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'FIRST POUR' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver)).toBeUndefined();
});

test('stops before consent without saving, mounting an artifact action, or calling services', async ({ page }) => {
  await page.goto(`/src/viewer/human-lab.html?token=${AD_TOKEN}`);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-human-lab-ready', 'true');
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await expect(page.getByRole('heading', { name: 'NOTHING WAS SAVED' })).toBeVisible();
  await expect(page.getByText(/No artifact was created/iu)).toBeVisible();
  await expect(page.getByRole('link', { name: /Download/iu })).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('heading', { name: 'NOTHING WAS SAVED' })).toBeVisible();
  expect(await page.evaluate(() => ({
    prohibited: (window as typeof window & { __labProhibitedCalls?: string[] }).__labProhibitedCalls
      ?.filter((call) => !/^websocket:ws:\/\/127\.0\.0\.1:\d+\//u.test(call)),
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
  }))).toEqual({ prohibited: [], local: 0, session: 0, cookie: '' });
});

test('persistent stop freezes active play and ignores later input, frames, focus, and resize', async ({ page }) => {
  await openLab(page);
  await beginFromWelcome(page);
  await drawFrame(page, 100);
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  const stop = page.getByRole('button', { name: 'Stop playtest without saving' });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByRole('heading', { name: 'NOTHING WAS SAVED' })).toBeVisible();
  await expect(stop).toBeHidden();
  await expectMappingHidden(page);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ surface: 'stopped', engineTick: before, mappingRevealed: false });

  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await drawFrame(page, 50_000);
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await drawFrame(page, 100_000);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ surface: 'stopped', engineTick: before, mappingRevealed: false });
  await expect(page.getByRole('link', { name: /Download/iu })).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __labProhibitedCalls?: string[] })
    .__labProhibitedCalls?.filter((call) => !/^websocket:ws:\/\/127\.0\.0\.1:\d+\//u.test(call))))
    .toEqual([]);
});

test('persistent stop remains available across flow surfaces and ends final comparison locally', async ({ page }) => {
  const stop = page.getByRole('button', { name: 'Stop playtest without saving' });
  await openLab(page);
  await driverAdvance(page);
  await expect(stop).toBeVisible();
  await beginLabCountdown(page);
  await expect(stop).toBeVisible();
  await completeLabCountdown(page);
  await expect(stop).toBeVisible();
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.finishStage('won'));
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('terminal');
  await expect(stop).toBeVisible();
  await driverAdvance(page);
  await driverAdvance(page);
  await playPractice(page, 2);
  await driverAdvance(page);

  for (let stage = 4; stage <= 7; stage++) {
    await finishCurrentStage(page);
    await expect(stop).toBeVisible();
    await completeStagePulse(page);
    if (stage < 7) await driverAdvance(page);
  }
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('intermission');
  await expect(stop).toBeVisible();
  await driverAdvance(page);
  await driverAdvance(page);
  await playRound(page, 4);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('round-experience');
  await expect(stop).toBeVisible();
  await completeRoundExperience(page);
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByRole('heading', { name: 'NOTHING WAS SAVED' })).toBeVisible();
  await expect(stop).toBeHidden();
  await expectMappingHidden(page);
  await expect(page.getByRole('link', { name: /Download/iu })).toHaveCount(0);
});

test('persistent stop safely closes an open interruption and a pulse without producing an artifact', async ({ page }) => {
  const stop = page.getByRole('button', { name: 'Stop playtest without saving' });
  await openLab(page);
  await beginFromWelcome(page);
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('paused');
  await expect(stop).toBeVisible();
  await stop.click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await drawFrame(page, 50_000);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ surface: 'stopped', engineTick: before, mappingRevealed: false });

  await openLab(page);
  await beginFromWelcome(page);
  await playPractice(page, 3);
  await driverAdvance(page);
  await finishCurrentStage(page);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('stage-pulse');
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByRole('heading', { name: 'NOTHING WAS SAVED' })).toBeVisible();
  await expectMappingHidden(page);
  await expect(page.getByRole('link', { name: /Download/iu })).toHaveCount(0);
});

test('keeps its local identity, mapping, services, and browser state isolated', async ({ page }) => {
  await openLab(page, DA_TOKEN);
  await expect(page.getByText('LOCAL PLAYTEST · UNRANKED · NOTHING IS SUBMITTED', { exact: true }))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Start practice' })).toBeFocused();
  await expect(page.getByText('SHIFT BOARD')).toHaveCount(0);
  await expectMappingHidden(page);
  await beginFromWelcome(page);
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.finishStage('lost'));
  await driverAdvance(page);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({
      phase: 'round1', surface: 'stage-card', activeStage: 4, activeLives: 4, activeScore: 0,
    });
  expect(await page.evaluate(() => ({
    prohibited: (window as typeof window & { __labProhibitedCalls?: string[] }).__labProhibitedCalls
      ?.filter((call) => !/^websocket:ws:\/\/127\.0\.0\.1:\d+\//u.test(call)),
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
  }))).toEqual({ prohibited: [], local: 0, session: 0, cookie: '' });
});

test('keeps the test driver absent from an ordinary human assignment URL', async ({ page }) => {
  const response = await page.goto(`/src/viewer/human-lab.html?token=${AD_TOKEN}`);
  expect(response?.status()).toBe(200);
  await expect.poll(() => page.locator('html').getAttribute('data-maltline-human-lab-ready')).toBe('true');
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver)).toBeUndefined();
});

test('records a real fixed-clock Stage 4 loss without terminal injection in both orders', async ({ page }) => {
  for (const token of [AD_TOKEN, DA_TOKEN]) {
    await openLab(page, token);
    await beginFromWelcome(page);
    await playPractice(page, 3);
    await driverAdvance(page);
    await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
      .toBe('playing');

    await page.keyboard.down('Space');
    const terminal = await page.evaluate(() => {
      const testWindow = window as typeof window & { __advanceLabFrame?: (now: number) => void };
      let now = 0;
      for (let frame = 0; frame < 300; frame++) {
        testWindow.__advanceLabFrame?.(now);
        now += 100;
        if (window.__maltlineHumanLabTestDriver!.snapshot().surface === 'terminal') break;
      }
      return window.__maltlineHumanLabTestDriver!.snapshot();
    });
    await page.keyboard.up('Space');
    expect(terminal).toMatchObject({ phase: 'round1', surface: 'terminal', activeStage: 4 });

    await driverAdvance(page);
    await completeStagePulse(page, { pressure: 7, pacing: 'too-relentless',
      loss: 'I kept blending and every customer reached the counter.' });
    await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
      .toBe('intermission');
    await driverAdvance(page);
    await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
      .toMatchObject({ phase: 'round2', surface: 'stage-card', activeStage: 4,
        activeLives: 4, activeScore: 0 });
    await driverAdvance(page);
    await finishCurrentStage(page, 'lost');
    await completeStagePulse(page, { loss: 'Synthetic second-round terminal for test completion.' });
    await completeRoundExperience(page);
    await page.locator('input[name="clearerRamp"][value="same"]').check();
    await page.locator('input[name="fairer"][value="same"]').check();
    await page.locator('input[name="moreEnjoyable"][value="same"]').check();
    await page.locator('textarea[name="scoreBelief"]').fill('Serving and catching jars generated score.');
    await page.getByRole('button', { name: 'Freeze my answers' }).click();

    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download synthetic JSON' }).click();
    const path = await (await downloadEvent).path();
    const artifact = JSON.parse(await readFile(path!, 'utf8')) as {
      rounds: Array<{ initialRun: { lives: number; score: number }; stages: Array<Record<string, unknown>> }>;
    };
    expect(artifact.rounds.map(({ initialRun }) => initialRun)).toEqual([
      { lives: 4, score: 0 }, { lives: 4, score: 0 },
    ]);
    expect(artifact.rounds[0]!.stages[0]).toMatchObject({
      stage: 4,
      scenarioId: 'maltline-04-lunch-rush',
      observationMode: 'engine-observed',
      status: 'lost',
      startingRun: { lives: 4, score: 0 },
      ticks: 1458,
      inputSamples: 1458,
      score: 0,
      scoreDelta: 0,
      lives: 0,
      serviceActions: 0,
      fulfilled: 0,
      walkouts: 4,
      resolved: 4,
      exited: 0,
      lossReasons: { walkout: 4, shake_smashed: 0, jar_smashed: 0 },
      interactionCounts: { blendStarts: 1 },
    });
  }
});

test('runs both hidden orders through fresh rounds and downloads a frozen unranked artifact', async ({ page }) => {
  await openLab(page, DA_TOKEN);
  await reachComparison(page);
  await expectMappingHidden(page);
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('paused');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Resume local session' }).click();

  await page.locator('input[name="clearerRamp"][value="2"]').check();
  await page.locator('input[name="fairer"][value="same"]').check();
  await page.locator('input[name="moreEnjoyable"][value="1"]').check();
  await page.locator('textarea[name="scoreBelief"]').fill('Serving orders and catching jars generated score.');
  await page.getByRole('button', { name: 'Freeze my answers' }).click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ phase: 'frozen', surface: 'frozen', mappingRevealed: false });
  await expect(page.getByRole('button', { name: 'Stop playtest without saving' })).toBeHidden();
  await expectMappingHidden(page);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download synthetic JSON' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('maltline-exp049-test-driver-synthetic.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  const artifact = JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>;
  expect(artifact).toMatchObject({
    kind: 'maltline-human-lab-test-driver-session',
    schemaVersion: 3,
    experimentId: 'EXP-049',
    experimentRevision: 13,
    policy: {
      rankEligibility: 'unranked',
      authorityRegistration: null,
      seasonId: null,
      submission: 'forbidden',
    },
    executionMode: 'test-driver',
    studyAssignment: { experienceStratum: 'first-time', assignedViewportCssWidth: 1280 },
    participant: { participantCode: 'p-test001', experienceStratum: 'first-time',
      assignedViewportCssWidth: 1280 },
    consentEvidence: { kind: 'test-driver-bypass', statementId: null, affirmed: false },
    timing: {
      interruptions: [{ sequence: 1, kind: 'width-stratum-mismatch', phase: 'comparison',
        surface: 'comparison' }],
    },
    assignmentOrder: ['d-combined', 'a-registered-control'],
    comparison: {
      clearerRamp: 2,
      fairer: 'same',
      moreEnjoyable: 1,
      rounds: [
        { round: 1, jarExperience: 'planning', recoveryPossible: 6 },
        { round: 2, jarExperience: 'both', recoveryPossible: 3 },
      ],
      scoreBelief: 'Serving orders and catching jars generated score.',
    },
  });
  expect(JSON.stringify(artifact)).not.toContain(DA_TOKEN);
  const timing = artifact.timing as { elapsedMs: number; activePlayMs: number; pausedMs: number;
    interruptions: Array<{ startedAtMs: number; durationMs: number }> };
  expect(timing.elapsedMs).toBeGreaterThanOrEqual(timing.activePlayMs + timing.pausedMs);
  expect(timing.pausedMs).toBe(timing.interruptions[0]!.durationMs);
  expect(timing.interruptions[0]!.startedAtMs).toBeGreaterThanOrEqual(0);
  const provenance = artifact.provenance as {
    assignmentTokenSha256: string;
    entryEnvironment: { viewportCssWidth: number; viewportCssHeight: number;
      devicePixelRatio: number; reducedMotion: boolean };
    sourceAuthority: { identity: { configurationSha256: string }; verifiedConfigurationSha256: string };
    candidates: Array<{ candidateId: string; seedOffset: number; candidateFingerprint: string;
      effectiveCampaignFingerprint: string; scenarios: Array<{ id: string; fingerprint: string }> }>;
  };
  expect(provenance.assignmentTokenSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(provenance.assignmentTokenSha256).not.toContain(DA_TOKEN);
  expect(provenance.entryEnvironment).toMatchObject({
    viewportCssWidth: 1280, viewportCssHeight: 720, devicePixelRatio: 1, reducedMotion: true,
  });
  expect(provenance.sourceAuthority.identity.configurationSha256)
    .toBe(provenance.sourceAuthority.verifiedConfigurationSha256);
  expect(provenance.candidates.map(({ candidateId }) => candidateId))
    .toEqual(['d-combined', 'a-registered-control']);
  for (const candidate of provenance.candidates) {
    expect(candidate.seedOffset).toBe(0);
    expect(candidate.candidateFingerprint).toMatch(/^fnv1a64:[0-9a-f]{16}$/u);
    expect(candidate.effectiveCampaignFingerprint).toMatch(/^fnv1a64:[0-9a-f]{16}$/u);
    expect(candidate.scenarios).toHaveLength(8);
    expect(new Set(candidate.scenarios.map(({ id }) => id)).size).toBe(8);
    expect(candidate.scenarios.every(({ fingerprint }) => /^fnv1a64:[0-9a-f]{16}$/u.test(fingerprint)))
      .toBe(true);
  }
  const rounds = artifact.rounds as Array<{ stages: Array<{
    observationMode: string; scenarioId: string; scoreDelta: number;
    serviceActions: number; fulfilled: number; walkouts: number; resolved: number; exited: number;
    lossReasons: Record<string, number>; interactionCounts: Record<string, number>;
  }>; stagePulses: Array<{
    round: number; stage: number; perceivedPressure: number; pacing: string;
  }> }>;
  expect(rounds.flatMap(({ stagePulses }) => stagePulses)).toHaveLength(8);
  for (const [roundIndex, round] of rounds.entries()) {
    expect(round.stagePulses.map(({ round: pulseRound, stage, pacing }) => ({ pulseRound, stage, pacing })))
      .toEqual([4, 5, 6, 7].map((stage) => ({
        pulseRound: roundIndex + 1, stage, pacing: 'balanced',
      })));
    expect(round.stagePulses.map(({ perceivedPressure }) => perceivedPressure)).toEqual([3, 4, 5, 6]);
    for (const stage of round.stages) {
      expect(stage).toMatchObject({
        observationMode: 'test-driver-synthetic',
        scoreDelta: 0,
        serviceActions: 0,
        fulfilled: 0,
        walkouts: 0,
        resolved: 0,
        exited: 0,
        lossReasons: { walkout: 0, shake_smashed: 0, jar_smashed: 0 },
        interactionCounts: {
          executedStationMoves: 0,
          executedLaneMoves: 0,
          blendStarts: 0,
          blendCancels: 0,
          shakeLaunches: 0,
          jarCatches: 0,
        },
      });
      expect(stage.scenarioId).toMatch(/^maltline-/u);
    }
  }
  expect(JSON.stringify(artifact)).not.toMatch(/"(?:proof|envelope|challenge|nonce|scoreId|submissionId)"/u);

  await page.getByRole('button', { name: 'Reveal setups' }).click();
  await expect(page.getByRole('heading', { name: 'SETUPS REVEALED' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop playtest without saving' })).toBeHidden();
  await expect(page.getByText(/Round 1 was setup D; Round 2 was setup A/u)).toBeVisible();
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.pause());
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.resume());
  await expect(page.getByRole('heading', { name: 'SETUPS REVEALED' })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __labProhibitedCalls?: string[] })
    .__labProhibitedCalls?.filter((call) => !/^websocket:ws:\/\/127\.0\.0\.1:\d+\//u.test(call))))
    .toEqual([]);
});

test('preserves an N-tick lost practice record through download and starts Round 1 fresh', async ({ page }) => {
  await openLab(page);
  await beginFromWelcome(page);
  await drawFrame(page, 100);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick))
    .toBe(6);
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.finishStage('lost'));
  await expect(page.getByText(/Practice ended after this loss; Round 1 will start fresh/u)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin Round 1' })).toBeVisible();
  await driverAdvance(page);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({
      phase: 'round1', surface: 'stage-card', activeStage: 4, activeLives: 4, activeScore: 0,
    });

  // The lab-only driver advances presentation terminals; it is not evidence
  // that these inputs can win the real engine.
  await driverAdvance(page);
  await playRound(page, 4);
  await driverAdvance(page);
  await driverAdvance(page);
  await playRound(page, 4);
  await completeRoundExperience(page);
  await page.locator('input[name="clearerRamp"][value="same"]').check();
  await page.locator('input[name="fairer"][value="1"]').check();
  await page.locator('input[name="moreEnjoyable"][value="2"]').check();
  await page.locator('textarea[name="scoreBelief"]').fill('I think serving orders increased score.');
  await page.getByRole('button', { name: 'Freeze my answers' }).click();

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download synthetic JSON' }).click();
  const path = await (await downloadEvent).path();
  const artifact = JSON.parse(await readFile(path!, 'utf8')) as {
    practice: { stages: Array<Record<string, unknown>> };
    rounds: Array<{ initialRun: { lives: number; score: number } }>;
  };
  expect(artifact.practice.stages).toEqual([expect.objectContaining({
    stage: 1,
    status: 'lost',
    ticks: 6,
    inputSamples: 6,
    score: 0,
    lives: 0,
  })]);
  expect(artifact.rounds.map(({ initialRun }) => initialRun)).toEqual([
    { lives: 4, score: 0 },
    { lives: 4, score: 0 },
  ]);
});

test('requires loss explanation, freezes pulse ticks, and preserves its draft through interruptions', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await openLab(page);
  await beginFromWelcome(page);
  await playPractice(page, 3);
  await driverAdvance(page);
  await finishCurrentStage(page, 'lost');
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('stage-pulse');
  const pressure = page.locator('input[name="pulse-pressure"][value="7"]');
  const firstPressure = page.locator('input[name="pulse-pressure"][value="1"]');
  const pacing = page.locator('input[name="pulse-pacing"][value="too-relentless"]');
  const firstPacing = page.locator('input[name="pulse-pacing"][value="too-idle"]');
  const hardest = page.locator('textarea[name="pulse-hardest"]');
  const loss = page.locator('textarea[name="pulse-loss"]');
  const save = page.getByRole('button', { name: 'Save stage feedback' });
  await expect(page.locator('#overlay-card')).toHaveAccessibleDescription(
    /rate perceived pressure.*choose whether pacing.*hardest decision.*explain what you think caused the loss/iu,
  );
  await expect(loss).toHaveAttribute('required', '');
  await expect(firstPressure).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Stop playtest without saving' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstPressure).toBeFocused();
  await pressure.check();
  const frozenTick = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  await drawFrame(page, 50_000);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(frozenTick);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.getByRole('button', { name: 'Resume local session' }).click();
  await expect(pressure).toBeChecked();
  await expect(firstPacing).toBeFocused();
  await pacing.check();
  await hardest.fill('Choosing between a jar and the nearest order.');
  await loss.fill('   ');

  await page.setViewportSize({ width: 699, height: 720 });
  await expect(page.locator('html')).toHaveAttribute('data-supported-device', 'false');
  await page.setViewportSize({ width: 700, height: 720 });
  await expect(page.getByRole('button', { name: 'Resume local session' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume local session' }).click();
  await expect(pressure).toBeChecked();
  await expect(pacing).toBeChecked();
  await expect(hardest).toHaveValue('Choosing between a jar and the nearest order.');
  await expect(loss).toHaveValue('   ');
  await expect(loss).toBeFocused();
  await save.click();
  await expect(loss).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('stage-pulse');
  await loss.fill('I faced the wrong return window.');
  await page.getByRole('button', { name: 'Save stage feedback' }).click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('intermission');
});

test('preserves both final-survey drafts across pause rerenders', async ({ page }) => {
  await openLab(page);
  await reachRoundExperience(page);
  const roundOneJars = page.locator('input[name="round-1-jars"][value="waiting"]');
  const roundOneRecovery = page.locator('input[name="round-1-recovery"][value="2"]');
  await roundOneJars.check();
  await roundOneRecovery.check();
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.pause());
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.resume());
  await expect(roundOneJars).toBeChecked();
  await expect(roundOneRecovery).toBeChecked();
  await expect(page.locator('input[name="round-2-jars"][value="planning"]')).toBeFocused();
  await expect(page.locator('#overlay-card')).toHaveAccessibleDescription(
    /For Round 1 and Round 2.*jar circulation.*recovery after a mistake/iu,
  );
  await completeRoundExperience(page);

  const clearer = page.locator('input[name="clearerRamp"][value="2"]');
  const belief = page.locator('textarea[name="scoreBelief"]');
  await clearer.check();
  await belief.fill('Serving the requested flavor and catching jars generated score.');
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.pause());
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.resume());
  await expect(clearer).toBeChecked();
  await expect(page.locator('input[name="fairer"][value="1"]')).toBeFocused();
  await expect(belief).toHaveValue('Serving the requested flavor and catching jars generated score.');
  await page.locator('input[name="fairer"][value="same"]').check();
  await page.locator('input[name="moreEnjoyable"][value="1"]').check();
  await belief.fill('');
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.pause());
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.resume());
  await expect(belief).toBeFocused();
  await expect(page.locator('#overlay-card')).toHaveAccessibleDescription(
    /clearer pressure ramp.*fairness.*enjoyment.*what you believe generated score/iu,
  );
});

test('blinds every comparison surface across candidates and assignment order', async ({ page }) => {
  const ad = await captureComparisonRounds(page, AD_TOKEN);
  const da = await captureComparisonRounds(page, DA_TOKEN);
  for (const round of [1, 2] as const) {
    expect(Object.keys(ad[round])).toEqual(Object.keys(da[round]));
    for (const surface of Object.keys(ad[round])) {
      // Same round position, opposite candidate: candidate-specific values may
      // not change visible, semantic, metadata, or ordinary-attribute output.
      expect(normalizeRoundLabels(ad[round][surface]!)).toBe(normalizeRoundLabels(da[round][surface]!));
    }
  }
  for (const surface of Object.keys(ad[1])) {
    // Same candidate in the opposite round position: only the round label is
    // normalized. Everything else must remain byte-identical.
    expect(normalizeRoundLabels(ad[1][surface]!)).toBe(normalizeRoundLabels(da[2][surface]!));
    expect(normalizeRoundLabels(ad[2][surface]!)).toBe(normalizeRoundLabels(da[1][surface]!));
  }
});

test('pauses at 699, clears live play, and requires an explicit focused resume at 700', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await openLab(page);
  await beginFromWelcome(page);
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  await page.setViewportSize({ width: 699, height: 720 });
  await expect(page.locator('html')).toHaveAttribute('data-supported-device', 'false');
  await expect(page.getByRole('status', { name: /Give the shop/u })).toBeVisible();
  await page.evaluate(() => (window as typeof window & { __advanceLabFrame?: (now: number) => void })
    .__advanceLabFrame?.(5_000));
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);

  await page.setViewportSize({ width: 700, height: 720 });
  const resume = page.getByRole('button', { name: 'Resume local session' });
  await expect(resume).toBeVisible();
  await expect(resume).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('paused');
  await resume.click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('playing');
});

test('pauses on a supported-width stratum mismatch and resumes only at exact width without catch-up', async ({ page }) => {
  await openLab(page);
  await beginFromWelcome(page);
  await drawFrame(page, 100);
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  expect(before).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('paused');
  await expect(page.getByText(/no longer matches the assigned 1280-pixel test width/iu)).toBeVisible();
  await drawFrame(page, 50_000);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);
  await page.getByRole('button', { name: 'Resume local session' }).click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('paused');

  await page.setViewportSize({ width: 1280, height: 720 });
  const resume = page.getByRole('button', { name: 'Resume local session' });
  await expect(resume).toBeFocused();
  await resume.click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('playing');
  await drawFrame(page, 100_000);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);
});

test('countdown uses production cadence without accepting input or spamming announcements', async ({ page }) => {
  await openLab(page);
  await driverAdvance(page);
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  await beginLabCountdown(page);

  const dialog = page.getByRole('dialog');
  const title = page.locator('#overlay-title');
  const flowStatus = page.locator('#game-flow-status');
  await expect(dialog).toBeFocused();
  await expect(title).toHaveText('3');
  await expect(dialog).toHaveAccessibleDescription(/First Pour.*Hands on controls.*starts automatically/iu);
  await expect(flowStatus).toHaveText('Get ready. PRACTICE, stage 1 of 3, First Pour.');
  await expect(page.locator('.controls')).toHaveAttribute('inert', '');
  await expect(page.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: 'Begin stage' })).toHaveCount(0);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.dispatchEvent('.shell', 'keydown', { code: 'Enter', repeat: true });
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('countdown');
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);

  await page.evaluate(() => {
    const target = document.querySelector('#game-flow-status')!;
    let writes = 0;
    new MutationObserver(() => writes++).observe(target, { childList: true, characterData: true });
    Object.defineProperty(window, '__humanLabFlowWrites', { get: () => writes });
  });
  await expect(title).toHaveText('2', { timeout: 1_500 });
  await expect(title).toHaveText('1', { timeout: 1_500 });
  expect(await page.evaluate(() => (window as typeof window & { __humanLabFlowWrites?: number })
    .__humanLabFlowWrites)).toBe(0);
  await expect(title).toHaveText('SERVE', { timeout: 1_500 });
  await expect(flowStatus).toHaveText('Serve.');
  expect(await page.evaluate(() => (window as typeof window & { __humanLabFlowWrites?: number })
    .__humanLabFlowWrites)).toBe(1);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface),
    { timeout: 1_500 }).toBe('playing');
});

test('countdown interruption returns to its stage card and restarts from three', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await openLab(page);
  await driverAdvance(page);
  await beginLabCountdown(page);
  const before = await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick);
  await expect(page.locator('#overlay-title')).toHaveText('3');

  await page.setViewportSize({ width: 699, height: 720 });
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('paused');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);

  await page.setViewportSize({ width: 700, height: 720 });
  const resume = page.getByRole('button', { name: 'Resume local session' });
  await expect(resume).toBeFocused();
  await resume.click();
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('stage-card');
  await expect(page.getByRole('button', { name: 'Begin stage' })).toBeFocused();
  await page.waitForTimeout(800);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface))
    .toBe('stage-card');

  await page.getByRole('button', { name: 'Begin stage' }).click();
  await expect(page.locator('#overlay-title')).toHaveText('3');
  expect(await page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().engineTick)).toBe(before);
  await completeLabCountdown(page);
});

test('countdown retains its cadence and removes motion under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLab(page);
  await driverAdvance(page);
  await beginLabCountdown(page);
  expect(await page.locator('#overlay-hint').evaluate((element) => getComputedStyle(element).animationName))
    .toBe('none');
  await expect(page.locator('#overlay-title')).toHaveText('SERVE', { timeout: 3_000 });
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot().surface),
    { timeout: 1_500 }).toBe('playing');
});

test('welcome is exact at 1280', async ({ page }) => {
  await openLab(page);
  await expect(page).toHaveScreenshot('human-lab-welcome-1280.png');
});

test('practice countdown is exact at 1280', async ({ page }) => {
  await openLab(page);
  await driverAdvance(page);
  await beginLabCountdown(page);
  await expect(page.locator('#overlay-title')).toHaveText('3');
  await expect(page).toHaveScreenshot('human-lab-countdown-1280.png');
});

test('comparison countdown is contained and exact at 700', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await openLab(page);
  await beginFromWelcome(page);
  await playPractice(page, 3);
  await expect.poll(() => page.evaluate(() => window.__maltlineHumanLabTestDriver!.snapshot()))
    .toMatchObject({ phase: 'round1', surface: 'stage-card', activeStage: 4 });
  await drawFrame(page, 4_000);
  await beginLabCountdown(page);
  await expect(page.locator('#overlay-title')).toHaveText('3');
  const geometry = await page.evaluate(() => {
    const card = document.querySelector('.overlay-card')!.getBoundingClientRect();
    const banner = document.querySelector('.human-lab__banner')!.getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth,
      card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      banner: { left: banner.left, right: banner.right }, innerHeight };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
  expect(geometry.card.left).toBeGreaterThanOrEqual(0);
  expect(geometry.card.right).toBeLessThanOrEqual(700);
  expect(geometry.card.top).toBeGreaterThanOrEqual(0);
  expect(geometry.card.bottom).toBeLessThanOrEqual(geometry.innerHeight);
  expect(geometry.banner.left).toBeGreaterThanOrEqual(0);
  expect(geometry.banner.right).toBeLessThanOrEqual(700);
  await expect(page).toHaveScreenshot('human-lab-countdown-700.png');
});

test('comparison stage pulse is exact at 1280', async ({ page }) => {
  await openLab(page);
  await beginFromWelcome(page);
  await playPractice(page, 3);
  await driverAdvance(page);
  await page.evaluate(() => window.__maltlineHumanLabTestDriver!.finishStage('won'));
  await driverAdvance(page);
  await page.locator('input[name="pulse-pressure"][value="5"]').check();
  await page.locator('input[name="pulse-pacing"][value="balanced"]').check();
  await page.locator('textarea[name="pulse-hardest"]').fill('Tracking the next jar while reading the line.');
  await drawFrame(page);
  await expect(page.getByRole('heading', { name: 'QUICK PULSE' })).toBeVisible();
  await expect(page).toHaveScreenshot('human-lab-stage-pulse-1280.png');
});

test('active play is contained and exact at 700', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await openLab(page);
  await beginFromWelcome(page);
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const banner = document.querySelector('.human-lab__banner')!.getBoundingClientRect();
    const footer = document.querySelector('.controls')!.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
      banner: { left: banner.left, right: banner.right },
      footerBottom: footer.bottom,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
  expect(geometry.canvas.left).toBeGreaterThanOrEqual(0);
  expect(geometry.canvas.right).toBeLessThanOrEqual(700);
  expect(geometry.banner.left).toBeGreaterThanOrEqual(0);
  expect(geometry.banner.right).toBeLessThanOrEqual(700);
  expect(geometry.footerBottom).toBeLessThanOrEqual(720);
  await expect(page).toHaveScreenshot('human-lab-active-700.png');
});

test('final comparison is accessible, contained, and exact at 700', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await openLab(page);
  await reachRoundExperience(page);
  await expect(page.getByRole('button', { name: 'Continue to final comparison' })).toBeVisible();
  let metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    cardBottom: document.querySelector('.overlay-card')!.getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.cardBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  await completeRoundExperience(page);
  await expect(page.getByRole('group')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Freeze my answers' })).toBeVisible();
  metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    cardBottom: document.querySelector('.overlay-card')!.getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.cardBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  const targetHeights = await page.locator('.human-lab__choice span, .human-lab__button')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(Math.min(...targetHeights)).toBeGreaterThanOrEqual(44);
  await expect(page).toHaveScreenshot('human-lab-final-700.png');
});

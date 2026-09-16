import { expect, test, type Page } from '@playwright/test';

interface BrowserFailures {
  console: string[];
  page: string[];
  requests: string[];
  responses: string[];
}

const failuresByPage = new WeakMap<Page, BrowserFailures>();
const apiRequestsByPage = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, testInfo) => {
  const failures: BrowserFailures = { console: [], page: [], requests: [], responses: [] };
  failuresByPage.set(page, failures);
  const apiRequests: string[] = [];
  apiRequestsByPage.set(page, apiRequests);
  const activityUrl = new URL('/api/v2/activity', testInfo.project.use.baseURL).href;
  await page.route(activityUrl, async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"protocolVersion":1,"entries":[]}',
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') failures.console.push(message.text());
  });
  page.on('pageerror', (error) => failures.page.push(error.message));
  page.on('requestfailed', (request) => {
    failures.requests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(`${request.method()} ${url.pathname}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.responses.push(`${response.status()} ${response.url()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(failuresByPage.get(page)).toEqual({
    console: [],
    page: [],
    requests: [],
    responses: [],
  });
  const apiRequests = apiRequestsByPage.get(page) ?? [];
  expect(apiRequests.length).toBeGreaterThanOrEqual(1);
  expect(new Set(apiRequests)).toEqual(new Set(['GET /api/v2/activity']));
});

async function openLauncher(page: Page): Promise<void> {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { level: 1, name: 'Choose your game.' }))
    .toBeVisible();
  await expect(page.getByText('New high scores will appear here.')).toBeVisible();
  expect(apiRequestsByPage.get(page)).toEqual(['GET /api/v2/activity']);
}

async function storageLengths(page: Page): Promise<{
  localStorage: number;
  sessionStorage: number;
}> {
  return page.evaluate(() => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
  }));
}

async function activateGame(page: Page, pathname: string): Promise<void> {
  const play = page.locator(`a.game-card__play[href="${pathname}"]`);
  await expect(play).toHaveCount(1);
  await expect(play).toHaveAttribute('href', pathname);
  const response = await page.goto(pathname, { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page).toHaveURL((url) => url.pathname === pathname);
}

test('Partition launcher entry stays on a fresh, unstarted home screen', async ({ page }) => {
  await openLauncher(page);
  expect(await page.evaluate(() => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    scripts: [...document.scripts].map((script) => ({
      src: new URL(script.src).pathname,
      type: script.type,
      text: script.textContent,
    })),
  }))).toEqual({
    localStorage: 0,
    sessionStorage: 0,
    scripts: [{ src: '/carousel.js', type: 'module', text: '' }, { src: '/activity.js', type: 'module', text: '' }],
  });

  await activateGame(page, '/games/partition/');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'home');
  await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('#tick')).toHaveText('0000');
  expect(new URL(page.url()).searchParams.has('autostart')).toBe(false);
  expect(await storageLengths(page)).toEqual({ localStorage: 0, sessionStorage: 0 });

  const frames = await page.evaluate(async () => {
    const samples: Array<{
      pathname: string;
      title: string;
      mode?: string;
      homeVisible: boolean;
      tick: string | null;
    }> = [];
    await new Promise<void>((resolve) => {
      const observe = (): void => {
        const home = document.querySelector<HTMLElement>('#home-screen');
        samples.push({
          pathname: location.pathname,
          title: document.title,
          mode: document.body.dataset.mode,
          homeVisible: home !== null
            && !home.hidden
            && getComputedStyle(home).display !== 'none'
            && getComputedStyle(home).visibility !== 'hidden',
          tick: document.querySelector('#tick')?.textContent ?? null,
        });
        if (samples.length === 5) resolve();
        else requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    return samples;
  });
  expect(frames).toEqual(Array.from({ length: 5 }, () => ({
    pathname: '/games/partition/',
    title: 'Partition — ArcadeBench',
    mode: 'home',
    homeVisible: true,
    tick: '0000',
  })));
});

test('Maltline launcher entry stays on a fresh title with no recorded input', async ({ page }) => {
  await openLauncher(page);
  await activateGame(page, '/games/maltline/');
  await page.waitForFunction(() => (
    document.documentElement.dataset.maltlineViewerReady === 'true'
  ));

  const status = async (): Promise<{
    screen?: string;
    engineTick?: number;
    recordedInputs?: number;
  }> => page.evaluate(() => {
    const viewer = (window as unknown as {
      __maltlineViewerStatus?: {
        screen: string;
        engineTick: number;
        recordedInputs: number;
      };
    }).__maltlineViewerStatus;
    return {
      screen: viewer?.screen,
      engineTick: viewer?.engineTick,
      recordedInputs: viewer?.recordedInputs,
    };
  });

  await expect(page.locator('#overlay-title')).toHaveText('MALTLINE');
  expect(await status()).toEqual({ screen: 'title', engineTick: 0, recordedInputs: 0 });
  expect(await storageLengths(page)).toEqual({ localStorage: 0, sessionStorage: 0 });

  const frames = await page.evaluate(async () => {
    const samples: Array<{
      pathname: string;
      title: string;
      overlayTitle: string | null;
      screen?: string;
      engineTick?: number;
      recordedInputs?: number;
    }> = [];
    await new Promise<void>((resolve) => {
      const observe = (): void => {
        const viewer = (window as unknown as {
          __maltlineViewerStatus?: {
            screen: string;
            engineTick: number;
            recordedInputs: number;
          };
        }).__maltlineViewerStatus;
        samples.push({
          pathname: location.pathname,
          title: document.title,
          overlayTitle: document.querySelector('#overlay-title')?.textContent ?? null,
          screen: viewer?.screen,
          engineTick: viewer?.engineTick,
          recordedInputs: viewer?.recordedInputs,
        });
        if (samples.length === 5) resolve();
        else requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    return samples;
  });
  expect(frames).toEqual(Array.from({ length: 5 }, () => ({
    pathname: '/games/maltline/',
    title: 'Maltline — ArcadeBench',
    overlayTitle: 'MALTLINE',
    screen: 'title',
    engineTick: 0,
    recordedInputs: 0,
  })));
});

test('Smilefall opens as a fresh game, exposes its catalog, and starts a ten-level arcade run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await openLauncher(page);
  await activateGame(page, '/games/smilefall/');

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
  await expect(page.getByRole('heading', { level: 1, name: 'SMILEFALL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'START ARCADE RUN' })).toBeVisible();
  await expect(page.getByLabel('Arcade run difficulty')).toHaveValue('chuckle');
  expect(await storageLengths(page)).toEqual({ localStorage: 0, sessionStorage: 0 });

  await page.getByRole('button', { name: 'LEVEL CATALOG' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'catalog');
  await expect(page.locator('.catalog-card')).toHaveCount(14);
  await expect(page.getByRole('heading', { name: 'First Giggle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sky Ladder' })).toBeAttached();

  await page.getByRole('button', { name: 'HOME' }).click();
  await page.getByRole('button', { name: 'START ARCADE RUN' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await expect(page.locator('#hud-progress')).toHaveText('ARCADE · 1 / 10');
  await expect(page.getByRole('button', { name: 'GO!' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'First Giggle' })).toBeVisible();
  await expect(page.locator('.hud')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'GO!' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'GO!' })).toBeFocused();

  const containment = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.stage')!.getBoundingClientRect();
    const start = document.querySelector<HTMLElement>('#ready-start')!.getBoundingClientRect();
    return {
      horizontal: start.left >= stage.left && start.right <= stage.right,
      vertical: start.top >= stage.top && start.bottom <= stage.bottom,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(containment).toEqual({ horizontal: true, vertical: true, pageOverflow: 0 });

  await page.waitForTimeout(80);
  const reducedFrame = await page.locator('#field').screenshot();
  await page.waitForTimeout(100);
  expect(Buffer.compare(reducedFrame, await page.locator('#field').screenshot())).toBe(0);

  await page.getByRole('button', { name: 'GO!' }).click();
  await expect(page.getByRole('button', { name: 'PAUSE' })).toBeEnabled();
  await expect(page.locator('.hud')).not.toHaveAttribute('inert', '');
  const playSound = page.getByRole('button', { name: 'SOUND ON' });
  await expect(playSound).toBeVisible();
  await playSound.click();
  await expect(page.getByRole('button', { name: 'SOUND OFF' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('arcadebench.smilefall.sound'))).toBe('off');
  const touchLeft = page.getByRole('button', { name: 'Lean left' });
  await touchLeft.evaluate((button: HTMLButtonElement) => button.click());
  await expect(touchLeft).toHaveAttribute('aria-pressed', 'true');
  await touchLeft.evaluate((button: HTMLButtonElement) => button.click());
  await expect(touchLeft).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'PAUSE' }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.locator('#resume-button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'LEAVE RUN' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'RESTART ARCADE RUN' })).toBeVisible();
});

test('Smilefall confirms before abandoning an active run for ArcadeBench', async ({ page }) => {
  await openLauncher(page);
  await activateGame(page, '/games/smilefall/');
  await page.getByRole('button', { name: 'START ARCADE RUN' }).click();
  await page.getByRole('button', { name: 'GO!' }).click();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('unsaved score');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'ARCADEBENCH' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await expect(page).toHaveURL((url) => url.pathname === '/games/smilefall/');

  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'ARCADEBENCH' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  expect(dialogs).toEqual(['confirm']);
});

test('Smilefall leaderboard deep links select their level and difficulty', async ({ page }) => {
  await openLauncher(page);
  await activateGame(page, '/games/smilefall/');
  await page.goto('/games/smilefall/?mode=leaderboard&board=level&difficulty=guffaw&level=rock-alley');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'leaderboard');
  await expect(page.locator('#leaderboard-difficulty')).toHaveValue('guffaw');
  await expect(page.locator('#leaderboard-level')).toHaveValue('rock-alley');
  await expect(page.getByRole('heading', { level: 2, name: 'Rock Alley' })).toBeVisible();
  await expect(page.getByText('LOCAL PREVIEW · THIS DEVICE')).toBeVisible();
  await expect(page.getByText('Launch Board')).toBeVisible();

  const levelTab = page.getByRole('tab', { name: 'LEVEL' });
  await expect(levelTab).toHaveAttribute('tabindex', '0');
  await levelTab.focus();
  await levelTab.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'ARCADE RUN' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#leaderboard-level-wrap')).toBeHidden();
});

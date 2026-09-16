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
  expect(apiRequestsByPage.get(page)).toEqual(['GET /api/v2/activity']);
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
  const navigation = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().isNavigationRequest() && url.pathname === pathname;
  });
  const play = page.locator(`a.game-card__play[href="${pathname}"]`);
  await expect(play).toHaveCount(1);
  await play.click();
  const response = await navigation;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
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
    scripts: [{ src: '/activity.js', type: 'module', text: '' }],
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

import { expect, test, type Page } from '@playwright/test';

interface BrowserFailures {
  console: string[];
  page: string[];
  requests: string[];
  responses: string[];
}

const failuresByPage = new WeakMap<Page, BrowserFailures>();
const apiRequestsByPage = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const failures: BrowserFailures = { console: [], page: [], requests: [], responses: [] };
  failuresByPage.set(page, failures);
  const apiRequests: string[] = [];
  apiRequestsByPage.set(page, apiRequests);
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
});

async function openLauncher(page: Page): Promise<void> {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { level: 1, name: 'Choose your cabinet.' }))
    .toBeVisible();
  expect(apiRequestsByPage.get(page)).toEqual([]);
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

async function activateCabinet(page: Page, pathname: string): Promise<void> {
  const navigation = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().isNavigationRequest() && url.pathname === pathname;
  });
  const cabinet = page.locator(`a.cabinet[href="${pathname}"]`);
  await expect(cabinet).toHaveCount(1);
  await cabinet.click();
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
    scripts: document.scripts.length,
  }))).toEqual({ localStorage: 0, sessionStorage: 0, scripts: 0 });

  await activateCabinet(page, '/partition/');
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
    pathname: '/partition/',
    title: 'Partition — ArcadeBench',
    mode: 'home',
    homeVisible: true,
    tick: '0000',
  })));
});

test('Maltline launcher entry stays on a fresh title with no recorded input', async ({ page }) => {
  await openLauncher(page);
  await activateCabinet(page, '/maltline/');
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
    pathname: '/maltline/',
    title: 'Maltline — ArcadeBench',
    overlayTitle: 'MALTLINE',
    screen: 'title',
    engineTick: 0,
    recordedInputs: 0,
  })));
});

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import baselineManifest from './baseline-manifest.json' with { type: 'json' };

interface BrowserFailures {
  console: string[];
  page: string[];
  requests: string[];
  responses: string[];
  allowedConsole: RegExp[];
  allowedResponses: RegExp[];
}

const failuresByPage = new WeakMap<Page, BrowserFailures>();
const launcherViewports = [
  { name: 'launcher-1280.png', width: 1280, height: 720 },
  { name: 'launcher-700.png', width: 700, height: 600 },
  { name: 'launcher-390.png', width: 390, height: 720 },
  { name: 'launcher-320.png', width: 320, height: 568 },
] as const;

test.beforeEach(async ({ page }) => {
  const failures: BrowserFailures = {
    console: [],
    page: [],
    requests: [],
    responses: [],
    allowedConsole: [],
    allowedResponses: [],
  };
  failuresByPage.set(page, failures);
  page.on('console', (message) => {
    if (message.type() === 'error') failures.console.push(message.text());
  });
  page.on('pageerror', (error) => failures.page.push(error.message));
  page.on('requestfailed', (request) => {
    failures.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.responses.push(`${response.status()} ${response.url()}`);
  });
});

test.afterEach(async ({ page }) => {
  const failures = failuresByPage.get(page)!;
  expect({
    console: failures.console.filter((entry) => (
      !failures.allowedConsole.some((allowed) => allowed.test(entry))
    )),
    page: failures.page,
    requests: failures.requests,
    responses: failures.responses.filter((entry) => (
      !failures.allowedResponses.some((allowed) => allowed.test(entry))
    )),
  }).toEqual({ console: [], page: [], requests: [], responses: [] });
});

async function openLauncher(page: Page): Promise<void> {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose your cabinet.' })).toBeVisible();
}

function allowExpectedNotFound(page: Page): void {
  const failures = failuresByPage.get(page)!;
  failures.allowedConsole.push(
    /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/u,
  );
  failures.allowedResponses.push(/^404 .*\/missing-cabinet$/u);
}

async function openNotFound(page: Page): Promise<void> {
  allowExpectedNotFound(page);
  const response = await page.goto('/missing-cabinet', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(404);
  expect(response?.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  await expect(page.getByRole('heading', { level: 1, name: 'This route is out of play.' })).toBeVisible();
}

test('site visual inventory matches the pinned environment', async ({ browser }, testInfo) => {
  expect(baselineManifest.schemaVersion).toBe(2);
  expect(browser.version()).toBe(baselineManifest.browser.version);
  expect(testInfo.project.name).toBe(baselineManifest.project);
  expect(process.platform).toBe(baselineManifest.platform);
  const installedPlaywright = (await import('@playwright/test/package.json', {
    with: { type: 'json' },
  })).default as { version: string };
  expect(installedPlaywright.version).toBe(baselineManifest.playwright);
  const actual = (await readdir(new URL('./baselines/chromium-site/', import.meta.url)))
    .filter((name) => name.endsWith('.png')).sort();
  const expected = baselineManifest.screenshots.map(({ name }) => name).sort();
  expect(actual).toEqual(expected);
  for (const screenshot of baselineManifest.screenshots) {
    const bytes = await readFile(new URL(`./baselines/chromium-site/${screenshot.name}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex'), screenshot.name).toBe(screenshot.sha256);
  }
});

test('launcher has truthful metadata, semantic links, and no runtime script', async ({ page }) => {
  await openLauncher(page);
  await expect(page).toHaveTitle('ArcadeBench — Choose your cabinet');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://arcadebench.org/');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://arcadebench.org/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'ArcadeBench — Choose your cabinet',
  );
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Available games' })).toBeVisible();
  await expect(page.getByText('Choose a game, play a run, and inspect its deterministic result.')).toBeVisible();
  const partition = page.getByRole('link', { name: 'PARTITION', exact: true });
  const maltline = page.getByRole('link', { name: 'MALTLINE', exact: true });
  await expect(partition).toHaveAttribute('href', '/partition/');
  await expect(partition).toContainText('KEYBOARD + TOUCH');
  await expect(partition).toHaveAccessibleDescription(
    /Cut through a live field\. Isolate the anomalies\. KEYBOARD \+ TOUCH \/20 AUTHORED FIELDS/u,
  );
  await expect(maltline).toHaveAttribute('href', '/maltline/');
  await expect(maltline).toContainText('KEYBOARD · 700PX+ TO PLAY');
  await expect(maltline).toHaveAccessibleDescription(
    /Blend each order\. Slide shakes\. Catch returning jars\. KEYBOARD · 700PX\+ TO PLAY \/VERIFIED SHIFT BOARD/u,
  );
  await expect(page.getByRole('navigation', { name: 'Site information' })).toBeVisible();
  await expect(page.locator('script')).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => (
    new URL(entry.name).pathname
  )).sort())).toEqual(['/arcade.css']);
});

for (const viewport of launcherViewports) {
  test(`launcher is exact and contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLauncher(page);
    const measurements = await page.evaluate(() => ({
      innerWidth,
      innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll<HTMLElement>('.cabinet')].map((card) => {
        const bounds = card.getBoundingClientRect();
        const action = card.querySelector<HTMLElement>('.cabinet__action')!.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          actionLeft: action.left,
          actionRight: action.right,
          actionTop: action.top,
          actionBottom: action.bottom,
          actionHeight: action.height,
        };
      }),
      footerTargets: [...document.querySelectorAll<HTMLElement>('.site-footer a')]
        .map((link) => link.getBoundingClientRect().height),
    }));
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.cards).toHaveLength(2);
    for (const card of measurements.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(measurements.innerWidth);
      expect(card.actionLeft).toBeGreaterThanOrEqual(card.left);
      expect(card.actionRight).toBeLessThanOrEqual(card.right);
      expect(card.actionTop).toBeGreaterThanOrEqual(card.top);
      expect(card.actionBottom).toBeLessThanOrEqual(card.bottom);
      expect(card.actionHeight).toBeGreaterThanOrEqual(44);
    }
    for (const height of measurements.footerTargets) expect(height).toBeGreaterThanOrEqual(44);
    if (viewport.width >= 700) {
      expect(Math.abs(measurements.cards[0]!.top - measurements.cards[1]!.top)).toBeLessThan(1);
      expect(measurements.cards[0]!.right).toBeLessThan(measurements.cards[1]!.left);
      expect(measurements.cards[0]!.actionBottom).toBeLessThanOrEqual(measurements.innerHeight);
      expect(measurements.cards[1]!.actionBottom).toBeLessThanOrEqual(measurements.innerHeight);
    } else {
      expect(measurements.cards[1]!.top).toBeGreaterThan(measurements.cards[0]!.bottom);
    }
    await expect(page).toHaveScreenshot(viewport.name);
  });
}

test('launcher switches to one contained column exactly below 700px', async ({ page }) => {
  await page.setViewportSize({ width: 699, height: 600 });
  await openLauncher(page);
  const measurements = await page.evaluate(() => ({
    innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll<HTMLElement>('.cabinet')].map((card) => {
      const bounds = card.getBoundingClientRect();
      const action = card.querySelector<HTMLElement>('.cabinet__action')!.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        actionHeight: action.height,
      };
    }),
  }));
  expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.innerWidth);
  expect(measurements.cards).toHaveLength(2);
  for (const card of measurements.cards) {
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(measurements.innerWidth);
    expect(card.actionHeight).toBeGreaterThanOrEqual(44);
  }
  expect(measurements.cards[1]!.top).toBeGreaterThan(measurements.cards[0]!.bottom);
});

test('keyboard order and focus treatment are explicit at 700px', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openLauncher(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to cabinets' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to cabinets' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'ARCADEBENCH' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'PARTITION', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const maltline = page.getByRole('link', { name: 'MALTLINE', exact: true });
  await expect(maltline).toBeFocused();
  const focusStyle = await maltline.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle).toEqual({ outlineStyle: 'solid', outlineWidth: '3px' });
  await expect(page).toHaveScreenshot('launcher-focus-700.png');
});

test('reduced motion and forced colors preserve the selection boundary', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLauncher(page);
  const reducedDurationMs = await page.locator('.cabinet').first().evaluate((element) => (
    parseFloat(getComputedStyle(element).transitionDuration) * 1_000
  ));
  expect(reducedDurationMs).toBeLessThanOrEqual(0.01);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const maltline = page.getByRole('link', { name: 'MALTLINE', exact: true });
  await maltline.focus();
  await expect(maltline).toBeVisible();
  const forcedStyle = await maltline.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(forcedStyle.borderStyle).toBe('solid');
  expect(parseFloat(forcedStyle.borderWidth)).toBeGreaterThanOrEqual(2);
  expect(forcedStyle.outlineStyle).toBe('solid');
  expect(parseFloat(forcedStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
});

test('permanent game routes remain reachable with their own canonical identity', async ({ request }) => {
  for (const expected of [
    { route: '/partition/', title: 'Partition — ArcadeBench', canonical: 'https://arcadebench.org/partition/' },
    { route: '/maltline/', title: 'Maltline — ArcadeBench', canonical: 'https://arcadebench.org/maltline/' },
  ]) {
    const response = await request.get(expected.route);
    expect(response.status(), expected.route).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${expected.title}</title>`);
    expect(html).toContain(`rel="canonical" href="${expected.canonical}"`);
  }
});

test('unknown routes expose a noindex recovery page with both cabinets', async ({ page }) => {
  await openNotFound(page);
  await expect(page).toHaveTitle('Cabinet not found — ArcadeBench');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: 'RETURN TO ARCADE' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'PARTITION' })).toHaveAttribute('href', '/partition/');
  await expect(page.getByRole('link', { name: 'MALTLINE' })).toHaveAttribute('href', '/maltline/');
});

test('custom 404 cache follows the incoming pathname while direct 404.html is no-store', async ({ request }) => {
  for (const pathname of ['/missing-cabinet', '/_headers', '/_redirects']) {
    const response = await request.get(pathname);
    expect(response.status(), pathname).toBe(404);
    expect(response.headers()['cache-control'], pathname)
      .toBe('public, max-age=0, must-revalidate');
  }
  const direct = await request.get('/404.html');
  expect(direct.status()).toBe(200);
  expect(direct.headers()['cache-control']).toBe('no-store');
});

for (const viewport of [
  { name: 'not-found-1280.png', width: 1280, height: 720 },
  { name: undefined, width: 700, height: 600 },
  { name: 'not-found-390.png', width: 390, height: 720 },
  { name: undefined, width: 320, height: 568 },
] as const) {
  test(`custom 404 is contained with usable recovery targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNotFound(page);
    const measurements = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.error-panel')!.getBoundingClientRect();
      return {
        innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        panel: { left: panel.left, right: panel.right },
        actions: [...document.querySelectorAll<HTMLElement>('.error-action')].map((action) => {
          const bounds = action.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right, height: bounds.height };
        }),
        footerTargets: [...document.querySelectorAll<HTMLElement>('.site-footer a')]
          .map((link) => link.getBoundingClientRect().height),
      };
    });
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.panel.left).toBeGreaterThanOrEqual(0);
    expect(measurements.panel.right).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.actions).toHaveLength(3);
    for (const action of measurements.actions) {
      expect(action.left).toBeGreaterThanOrEqual(measurements.panel.left);
      expect(action.right).toBeLessThanOrEqual(measurements.panel.right);
      expect(action.height).toBeGreaterThanOrEqual(44);
    }
    for (const height of measurements.footerTargets) expect(height).toBeGreaterThanOrEqual(44);
    if (viewport.name !== undefined) await expect(page).toHaveScreenshot(viewport.name);
  });
}

test('custom 404 keyboard order and recovery focus are explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await openNotFound(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to message' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to message' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'ARCADEBENCH' })).toBeFocused();
  await page.keyboard.press('Tab');
  const returnLink = page.getByRole('link', { name: 'RETURN TO ARCADE' });
  await expect(returnLink).toBeFocused();
  const focusStyle = await returnLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle).toEqual({ outlineStyle: 'solid', outlineWidth: '3px' });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'PARTITION' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'MALTLINE' })).toBeFocused();
});

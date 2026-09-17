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
const activityRequestsByPage = new WeakMap<Page, number>();
const launcherViewports = [
  { name: 'launcher-1280.png', width: 1280, height: 720 },
  { name: 'launcher-700.png', width: 700, height: 600 },
  { name: 'launcher-390.png', width: 390, height: 720 },
  { name: 'launcher-320.png', width: 320, height: 568 },
] as const;

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    let i = 0;
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = [2, 1][i++ % 2]!; return array; } });
  });
  const failures: BrowserFailures = {
    console: [],
    page: [],
    requests: [],
    responses: [],
    allowedConsole: [],
    allowedResponses: [],
  };
  failuresByPage.set(page, failures);
  activityRequestsByPage.set(page, 0);
  // The static fixture server has no activity API. Pin an empty response so
  // visual baselines never depend on live players, timestamps, or availability.
  const activityUrl = new URL('/api/v2/activity', testInfo.project.use.baseURL).href;
  await page.route(activityUrl, async (route) => {
    activityRequestsByPage.set(page, activityRequestsByPage.get(page)! + 1);
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"protocolVersion":1,"entries":[]}' });
  });
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
  expect(activityRequestsByPage.get(page)).toBeLessThanOrEqual(1);
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
  await expect(page.getByRole('heading', { level: 1, name: 'Choose your game.' })).toBeVisible();
  await expect(page.getByText('New high scores will appear here.')).toBeVisible();
  expect(activityRequestsByPage.get(page)).toBe(1);
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

test('launcher has truthful metadata, semantic links, and only its site modules', async ({ page }) => {
  await openLauncher(page);
  await expect(page).toHaveTitle('ArcadeBench — Choose your game');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://arcadebench.org/');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://arcadebench.org/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'ArcadeBench — Choose your game',
  );
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Available games' })).toBeVisible();
  await expect(
    page.getByText(
      'A free browser arcade for everyone, inspired by the early arcade era. Simple controls, quick rounds, and high scores worth chasing.',
    ),
  ).toBeVisible();

  const partition = page.getByRole('link', { name: 'Play Partition' });
  const maltline = page.getByRole('link', { name: 'Play Maltline' });
  await expect(partition).toHaveAttribute('href', '/games/partition/');
  await expect(partition).toBeVisible();
  await expect(partition).toHaveAccessibleDescription(
    /Draw boundaries, claim space, and dodge the anomalies\.\s*Keyboard or touch\s*20 authored fields/u,
  );
  await expect(maltline).toHaveAttribute('href', '/games/maltline/');
  await expect(maltline).toBeVisible();
  await expect(maltline).toHaveAccessibleDescription(
    /Fill shakes, serve customers, and keep the counter moving\.\s*Keyboard\s*Eight shifts · two buttons/u,
  );

  // Each card leads with a real gameplay frame, not a logo or shared glyph.
  // Catalog images remain site-owned; activity may reuse a game cover, but
  // cannot introduce external artwork or download another game's runtime.
  const covers = page.locator('.game-card__art img');
  const imagePaths = await page.locator('img').evaluateAll((images) => images.map((image) => (
    new URL((image as HTMLImageElement).src).pathname
  )));
  expect(imagePaths.filter((path) => path === '/brand/mark.svg')).toHaveLength(1);
  expect(imagePaths.every((path) => [
    '/brand/mark.svg', '/covers/partition.png', '/covers/maltline.png', '/covers/smilefall.png',
  ].includes(path))).toBe(true);
  await expect(covers).toHaveCount(3);
  await expect(covers.nth(0)).toHaveAttribute('src', '/covers/partition.png');
  await expect(covers.nth(1)).toHaveAttribute('src', '/covers/maltline.png');
  await expect(covers.nth(2)).toHaveAttribute('src', '/covers/smilefall.png');
  expect(await covers.evaluateAll((images) => images.map((image) => ({
    src: new URL((image as HTMLImageElement).src).pathname,
    naturalWidth: (image as HTMLImageElement).naturalWidth,
    naturalHeight: (image as HTMLImageElement).naturalHeight,
  })))).toEqual([
    { src: '/covers/partition.png', naturalWidth: 960, naturalHeight: 540 },
    { src: '/covers/maltline.png', naturalWidth: 960, naturalHeight: 540 },
    { src: '/covers/smilefall.png', naturalWidth: 960, naturalHeight: 540 },
  ]);
  await expect(covers.nth(0)).toHaveAttribute('alt', /^Partition gameplay: /u);
  await expect(covers.nth(1)).toHaveAttribute('alt', /^Maltline gameplay: /u);

  await expect(page.getByRole('link', { name: 'Play Smilefall' })).toHaveAttribute('href', '/games/smilefall/');
  await expect(page.getByRole('link', { name: 'Play Smilefall' })).toHaveAccessibleDescription(/Guide one sky of falling smiles past hazards and into buckets\.\s*Shared steering · timed hops\s*Handcrafted stages/u);
  await expect(covers.nth(2)).toHaveAttribute('alt', /^Smilefall gameplay: /u);

  // The catalog makes no claim about verification.
  await expect(page.getByText(/verified/i)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Site information' })).toBeVisible();
  expect(await page.locator('script').evaluateAll(scripts => scripts.map(script => ({ src: script.getAttribute('src'), type: script.type, text: script.textContent })))).toEqual([
    { src: '/carousel.js', type: 'module', text: '' }, { src: '/activity.js', type: 'module', text: '' },
  ]);
  await expect(page.getByRole('heading', { level: 2, name: 'Recent high scores' })).toBeVisible();
  await expect(page.getByText('New high scores will appear here.')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').every((entry) => (
    new URL(entry.name).origin === location.origin
  )))).toBe(true);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => (
    new URL(entry.name).pathname
  )).sort())).toEqual([
    '/activity.js',
    '/api/v2/activity',
    '/arcade.css',
    '/brand/brand.css',
    '/brand/fonts/noto-sans-latin-400-normal.woff2',
    '/brand/fonts/noto-sans-latin-600-normal.woff2',
    '/brand/fonts/noto-sans-latin-800-normal.woff2',
    '/brand/mark.svg',
    '/carousel.js',
    '/covers/maltline.png',
    '/covers/partition.png',
    '/covers/smilefall.png',
  ]);
});

test('launcher carries the ArcadeBench brand layer and its licensed typeface', async ({ page }) => {
  await openLauncher(page);
  await expect(page.locator('link[rel="stylesheet"][href="/brand/brand.css"]')).toHaveCount(1);
  await expect(page.locator('link[rel="stylesheet"][href="/arcade.css"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/mark.svg');

  // The lettering is stacked and upper-cased for its own reasons, so the link
  // keeps the plain product name as its accessible name and the mark stays
  // decorative rather than becoming a second, differently-named link target.
  const wordmark = page.getByRole('link', { name: 'ArcadeBench' });
  await expect(wordmark).toHaveCount(1);
  await expect(wordmark).toHaveAttribute('href', '/');
  const mark = wordmark.locator('.ab-mark');
  await expect(mark).toHaveAttribute('src', '/brand/mark.svg');
  await expect(mark).toHaveAttribute('alt', '');
  expect(await mark.evaluate((image) => ({
    naturalWidth: (image as HTMLImageElement).naturalWidth,
    naturalHeight: (image as HTMLImageElement).naturalHeight,
    renderedWidth: image.getBoundingClientRect().width,
  }))).toEqual({ naturalWidth: 24, naturalHeight: 24, renderedWidth: 32 });
  await expect(page.locator('.site-footer__mark')).toHaveAttribute('aria-hidden', 'true');

  // Three real shipped weights, not one file stretched by synthesis.
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      status: document.fonts.status,
      faces: [...document.fonts].map((face) => `${face.family}|${face.weight}|${face.status}`).sort(),
      resolved: [400, 600, 800].map((weight) => document.fonts.check(`${weight} 16px "ArcadeBench Sans"`)),
    };
  });
  expect(faces.status).toBe('loaded');
  expect(faces.faces).toEqual([
    'ArcadeBench Sans|400|loaded',
    'ArcadeBench Sans|600|loaded',
    'ArcadeBench Sans|800|loaded',
  ]);
  expect(faces.resolved).toEqual([true, true, true]);
});

for (const viewport of launcherViewports) {
  test(`launcher is exact and contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLauncher(page);
    const measurements = await page.evaluate(() => ({
      innerWidth,
      innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll<HTMLElement>('.game-card')].map((card) => {
        const bounds = card.getBoundingClientRect();
        const art = card.querySelector<HTMLElement>('.game-card__art')!.getBoundingClientRect();
        const action = card.querySelector<HTMLElement>('.game-card__play')!.getBoundingClientRect();
        return {
          artTop: art.top,
          artBottom: art.bottom,
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
      activity: (() => {
        const bounds = document.querySelector<HTMLElement>('.recent')!.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
      })(),
      footerTop: document.querySelector<HTMLElement>('.site-footer')!.getBoundingClientRect().top,
    }));
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.cards).toHaveLength(3);
    for (const card of measurements.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right - card.left).toBeLessThanOrEqual(measurements.innerWidth);
      expect(card.actionLeft).toBeGreaterThanOrEqual(card.left);
      expect(card.actionRight).toBeLessThanOrEqual(card.right);
      expect(card.actionTop).toBeGreaterThanOrEqual(card.top);
      expect(card.actionBottom).toBeLessThanOrEqual(card.bottom);
      expect(card.actionHeight).toBeGreaterThanOrEqual(44);
    }
    for (const height of measurements.footerTargets) expect(height).toBeGreaterThanOrEqual(44);
    // Activity follows the entire game catalog, and the document can scroll
    // to reach it. Do not force the feed or footer into one viewport.
    expect(measurements.activity.top).toBeGreaterThanOrEqual(Math.max(...measurements.cards.map((card) => card.bottom)));
    expect(measurements.activity.left).toBeGreaterThanOrEqual(0);
    expect(measurements.activity.right).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.footerTop).toBeGreaterThanOrEqual(measurements.activity.bottom);
    if (viewport.width >= 700) {
      expect(Math.abs(measurements.cards[0]!.top - measurements.cards[1]!.top)).toBeLessThan(1);
      expect(measurements.cards[0]!.right).toBeLessThan(measurements.cards[1]!.left);
      // One large gameplay frame leads while the next card peeks in from the
      // right, making the carousel obvious without shrinking the game art.
      expect(measurements.cards[0]!.right - measurements.cards[0]!.left)
        .toBeGreaterThan(measurements.innerWidth * 0.75);
      expect(measurements.cards[0]!.right).toBeLessThan(measurements.innerWidth);
      expect(measurements.cards[1]!.left).toBeLessThan(measurements.innerWidth);
      expect(measurements.cards[1]!.right).toBeGreaterThan(measurements.innerWidth);
      expect(measurements.cards[0]!.artTop).toBeGreaterThanOrEqual(0);
      expect(measurements.cards[0]!.artBottom).toBeLessThanOrEqual(measurements.innerHeight);
      expect(measurements.cards[0]!.actionBottom).toBeLessThanOrEqual(measurements.innerHeight);
    } else {
      expect(measurements.cards[1]!.top).toBe(measurements.cards[0]!.top);
      expect(measurements.cards[1]!.left).toBeGreaterThan(measurements.cards[0]!.right);
    }
    await expect(page).toHaveScreenshot(viewport.name);
  });
}

test('launcher shows one card and a next-card hint below 700px', async ({ page }) => {
  await page.setViewportSize({ width: 699, height: 600 });
  await openLauncher(page);
  const measurements = await page.evaluate(() => ({
    innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll<HTMLElement>('.game-card')].map((card) => {
      const bounds = card.getBoundingClientRect();
      const action = card.querySelector<HTMLElement>('.game-card__play')!.getBoundingClientRect();
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
  expect(measurements.cards).toHaveLength(3);
  for (const card of measurements.cards) {
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right - card.left).toBeLessThan(measurements.innerWidth);
    expect(card.actionHeight).toBeGreaterThanOrEqual(44);
  }
  expect(measurements.cards[1]!.top).toBe(measurements.cards[0]!.top);
  expect(measurements.cards[1]!.left).toBeLessThan(measurements.innerWidth);
  expect(measurements.cards[1]!.right).toBeGreaterThan(measurements.innerWidth);
});

test('keyboard order and focus treatment are explicit at 700px', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openLauncher(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.wordmark')).toBeFocused();
  // Scoped to the Primary nav: the footer repeats both of these link names.
  const primaryNav = page.getByRole('navigation', { name: 'Primary' });
  await page.keyboard.press('Tab');
  await expect(primaryNav.getByRole('link', { name: 'Games' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(primaryNav.getByRole('link', { name: 'About' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Next game' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Play Partition' })).toBeFocused();
  await page.keyboard.press('Tab');
  const maltline = page.getByRole('link', { name: 'Play Maltline' });
  await expect(maltline).toBeFocused();
  const focusStyle = await maltline.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle).toEqual({ outlineStyle: 'solid', outlineWidth: '3px' });
  await expect(page).toHaveScreenshot('launcher-focus-700.png');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Play Smilefall' })).toBeFocused();
  const activityLinks = page.getByRole('region', { name: 'Recent high scores' }).getByRole('link');
  expect(await activityLinks.count()).toBeGreaterThan(0);
  for (const link of await activityLinks.all()) {
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('.site-footer a').first()).toBeFocused();
});

test('reduced motion and forced colors preserve the selection boundary', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLauncher(page);
  const reducedDurationMs = await page.locator('.game-card__play').first().evaluate((element) => (
    parseFloat(getComputedStyle(element).transitionDuration) * 1_000
  ));
  expect(reducedDurationMs).toBeLessThanOrEqual(0.01);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const maltline = page.getByRole('link', { name: 'Play Maltline' });
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
    { route: '/games/partition/', title: 'Partition — ArcadeBench', canonical: 'https://arcadebench.org/games/partition/' },
    { route: '/games/maltline/', title: 'Maltline — ArcadeBench', canonical: 'https://arcadebench.org/games/maltline/' },
    { route: '/games/smilefall/', title: 'Smilefall — ArcadeBench', canonical: 'https://arcadebench.org/games/smilefall/' },
  ]) {
    const response = await request.get(expected.route);
    expect(response.status(), expected.route).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${expected.title}</title>`);
    expect(html).toContain(`rel="canonical" href="${expected.canonical}"`);
  }
  for (const path of ['/games/smilefall/kit/', '/smilefall/src/viewer/kit/']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test('unknown routes expose a noindex recovery page with every game', async ({ page }) => {
  await openNotFound(page);
  await expect(page).toHaveTitle('Page not found — ArcadeBench');
  await expect(page.locator('meta[name="description"]'))
    .toHaveAttribute('content', 'That ArcadeBench page could not be found.');
  await expect(page.locator('.kicker')).toHaveText('Page not found');
  await expect(page.locator('.error-panel > p').nth(1))
    .toContainText('This page may have moved.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: 'RETURN TO ARCADE' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'PARTITION' })).toHaveAttribute('href', '/games/partition/');
  await expect(page.getByRole('link', { name: 'MALTLINE' })).toHaveAttribute('href', '/games/maltline/');
  await expect(page.getByRole('link', { name: 'SMILEFALL' })).toHaveAttribute('href', '/games/smilefall/');
  await expect(page.getByRole('link', { name: 'ABOUT' })).toHaveAttribute('href', '/about/');
});

async function openAbout(page: Page): Promise<void> {
  const response = await page.goto('/about/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  await expect(page.getByRole('heading', { level: 1, name: 'An arcade for everyone.' })).toBeVisible();
}

test('about page publishes the mission, the promise, and the Math vs Vibes credit', async ({ page }) => {
  await openAbout(page);
  await expect(page).toHaveTitle('About ArcadeBench');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://arcadebench.org/about/');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://arcadebench.org/about/');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'ArcadeBench');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'About ArcadeBench');
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    'A growing, free public collection of browser arcade games inspired by the early arcade era. No ads, no microtransactions, no loot boxes.',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'An arcade for everyone.' })).toBeVisible();
  await expect(page.getByText(
    'ArcadeBench is a growing, free public collection of browser arcade games, made in the spirit of the early arcade era.',
  )).toBeVisible();

  await expect(page.getByRole('heading', { level: 2, name: 'Quick to start, deep enough to chase' })).toBeVisible();
  await expect(page.getByText(
    'That is the whole idea. Learn by playing, chase the score, take one more try.',
  )).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The promise' })).toBeVisible();
  await expect(page.getByText(
    'No ads. No microtransactions. No paid advantages. No gacha or loot boxes. Progress comes from learning the game and improving your play. ArcadeBench is free to play and meant to stay that way.',
  )).toBeVisible();
  await expect(page.getByText('A project by')).toBeVisible();
  const credit = page.getByRole('link', { name: 'Math vs Vibes' });
  await expect(credit).toHaveAttribute('href', 'https://mathvsvibes.com');
  expect(await page.locator('.about__attribution').innerText()).toBe('A project by Math vs Vibes.');

  await expect(page.getByRole('navigation', { name: 'Games', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Community supported' })).toBeVisible();
  await expect(page.getByText('ArcadeBench is supported by donations and contributions from the community.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contributors', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eric Anderson' })).toHaveAttribute('href', 'https://github.com/eanderson4');
  const contributors = page.getByRole('region', { name: 'Contributors', exact: true });
  await expect(contributors.getByRole('list')).toHaveCount(1);
  await expect(contributors.getByRole('listitem')).toHaveCount(2);
  const whit = contributors.getByRole('listitem').filter({ hasText: 'Whit Anderson' });
  await expect(whit.locator('.about__person-name')).toHaveText('Whit Anderson');
  await expect(whit.locator('.about__person-role')).toHaveText('Game designer & playtester');
  await expect(whit.locator('.about__person-bio')).toHaveText(
    "Helped shape Smilefall's central idea, levels, and game feel through design and playtesting.",
  );
  await expect(whit.getByRole('link')).toHaveCount(0);
  for (const name of ['Eric Anderson', 'Whit Anderson']) {
    const portrait = contributors.getByRole('img', { name: `Caricature of ${name}` });
    await expect(portrait).toBeVisible();
    expect(await portrait.evaluate((image: HTMLImageElement) => ({
      complete: image.complete, width: image.naturalWidth, height: image.naturalHeight,
    }))).toEqual({ complete: true, width: 512, height: 512 });
  }
  await expect(page.getByRole('link', { name: 'ArcadeBench' })).toHaveAttribute('href', '/');

  // Header navigation is Games plus the current page; Source stays a footer
  // link instead of appearing twice in the header.
  const primary = page.getByRole('navigation', { name: 'Primary' });
  await expect(primary.getByRole('link')).toHaveCount(2);
  await expect(primary.getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/');
  await expect(primary.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Site information' })
    .getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href',
    'https://github.com/eanderson4/arcadebench',
  );

  await expect(page.locator('script')).toHaveCount(0);
  await expect(page.locator('link[rel="stylesheet"][href="/brand/brand.css"]')).toHaveCount(1);
  await expect(page.locator('link[rel="stylesheet"][href="/arcade.css"]')).toHaveCount(1);
  await expect(page.locator('link[rel="stylesheet"][href="/about.css"]')).toHaveCount(1);
  // The promise is the page's own panel here, so the shared footer keeps only
  // the site-information links.
  const footerNav = page.getByRole('navigation', { name: 'Site information' });
  await expect(footerNav.getByRole('link')).toHaveCount(3);
  await expect(footerNav.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/');
  await expect(footerNav.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms/');
});

test('about page loads only its shipped styles, brand faces, and contributor portraits', async ({ page }) => {
  await openAbout(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => (
    new URL(entry.name).pathname
  )).sort())).toEqual([
    '/about.css',
    '/arcade.css',
    '/brand/brand.css',
    '/brand/fonts/noto-sans-latin-400-normal.woff2',
    '/brand/fonts/noto-sans-latin-600-normal.woff2',
    '/brand/fonts/noto-sans-latin-800-normal.woff2',
    '/brand/mark.svg',
    '/contributors/eric-anderson.webp',
    '/contributors/whit-anderson.webp',
  ]);
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      status: document.fonts.status,
      faces: [...document.fonts].map((face) => `${face.family}|${face.weight}|${face.status}`).sort(),
      resolved: [400, 600, 800].map((weight) => document.fonts.check(`${weight} 16px "ArcadeBench Sans"`)),
      heading: getComputedStyle(document.querySelector('.about__hero h1')!).fontFamily,
    };
  });
  expect(faces.status).toBe('loaded');
  expect(faces.faces).toEqual([
    'ArcadeBench Sans|400|loaded',
    'ArcadeBench Sans|600|loaded',
    'ArcadeBench Sans|800|loaded',
  ]);
  expect(faces.resolved).toEqual([true, true, true]);
  expect(faces.heading).toContain('ArcadeBench Sans');
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 700, height: 720 },
  { width: 390, height: 720 },
  { width: 320, height: 568 },
] as const) {
  test(`about page stays contained with reachable links at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openAbout(page);
    const measurements = await page.evaluate(() => {
      const bounds = (selector: string): { left: number; right: number; height: number } | null => {
        const element = document.querySelector<HTMLElement>(selector);
        if (element === null) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height };
      };
      return {
        innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        hero: bounds('.about__hero'),
        lede: bounds('.about__lede'),
        body: bounds('.about__body'),
        promise: bounds('.about__promise'),
        attribution: bounds('.about__attribution'),
        contributors: [...document.querySelectorAll<HTMLElement>('.about__person')]
          .map((person) => {
            const rect = person.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          }),
        portraits: [...document.querySelectorAll<HTMLElement>('.about__portrait')]
          .map((portrait) => {
            const rect = portrait.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          }),
        contributorLinks: [...document.querySelectorAll<HTMLElement>('.about__person a')]
          .map((link) => {
            const rect = link.getBoundingClientRect();
            return { left: rect.left, right: rect.right, height: rect.height };
          }),
        creditTarget: bounds('.about__attribution a'),
        footerTargets: [...document.querySelectorAll<HTMLElement>('.site-footer a')]
          .map((link) => link.getBoundingClientRect().height),
      };
    });
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.innerWidth);
    for (const box of [
      measurements.hero,
      measurements.lede,
      measurements.body,
      measurements.promise,
      measurements.attribution,
      measurements.creditTarget,
    ]) {
      expect(box).not.toBeNull();
      expect(box!.left).toBeGreaterThanOrEqual(0);
      expect(box!.right).toBeLessThanOrEqual(measurements.innerWidth);
    }
    expect(measurements.contributors).toHaveLength(2);
    for (const person of measurements.contributors) {
      expect(person.left).toBeGreaterThanOrEqual(0);
      expect(person.right).toBeLessThanOrEqual(measurements.innerWidth);
    }
    const [eric, whit] = measurements.contributors;
    if (viewport.width >= 900) {
      expect(whit!.top).toBe(eric!.top);
      expect(whit!.left).toBeGreaterThan(eric!.right);
    } else {
      expect(whit!.top).toBeGreaterThan(eric!.bottom);
    }
    expect(measurements.portraits).toHaveLength(2);
    for (const portrait of measurements.portraits) {
      expect(portrait.width).toBe(portrait.height);
      expect(portrait.width).toBeGreaterThanOrEqual(96);
      expect(portrait.left).toBeGreaterThanOrEqual(0);
      expect(portrait.right).toBeLessThanOrEqual(measurements.innerWidth);
    }
    expect(measurements.contributorLinks).toHaveLength(1);
    for (const link of measurements.contributorLinks) {
      expect(link.left).toBeGreaterThanOrEqual(0);
      expect(link.right).toBeLessThanOrEqual(measurements.innerWidth);
      expect(link.height).toBeGreaterThanOrEqual(44);
    }
    // The closing credit is a real target too, not a bare inline link.
    expect(measurements.creditTarget!.height).toBeGreaterThanOrEqual(44);
    for (const height of measurements.footerTargets) expect(height).toBeGreaterThanOrEqual(44);
  });
}

test('about page keyboard order skips the unlinked contributor and reaches the credit and footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await openAbout(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'ArcadeBench' })).toBeFocused();
  const primary = page.getByRole('navigation', { name: 'Primary' });
  await page.keyboard.press('Tab');
  await expect(primary.getByRole('link', { name: 'Games' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(primary.getByRole('link', { name: 'About' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Eric Anderson' })).toBeFocused();
  const whit = page.locator('.about__person').filter({ hasText: 'Whit Anderson' });
  await expect(whit.locator('a, button, input, [tabindex]')).toHaveCount(0);
  const credit = page.getByRole('link', { name: 'Math vs Vibes' });
  await page.keyboard.press('Tab');
  await expect(credit).toBeFocused();
  const focusStyle = await credit.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle).toEqual({ outlineStyle: 'solid', outlineWidth: '3px' });
  await page.keyboard.press('Tab');
  await expect(page.locator('.site-footer a').first()).toBeFocused();
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
    expect(measurements.actions).toHaveLength(4);
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
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'SMILEFALL' })).toBeFocused();
});

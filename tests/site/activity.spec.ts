import { expect, test, type Page } from '@playwright/test';

/*
 * The launcher's recent-high-scores section reads one platform-wide feed. These
 * tests pin the contract that makes that safe and generic: two unrelated games
 * render from the same markup, a hostile record cannot introduce an element, a
 * link, or an off-site URL, a broken feed degrades to one quiet sentence, and
 * the section stays contained and reachable at every supported width — with the
 * three game cards still above it.
 */

const ACTIVITY_PATH = '/api/v2/activity';
const ACTIVITY_GLOB = '**/api/v2/activity*';

interface FeedBoard {
  id: string;
  label: string;
  context?: Record<string, string> | string;
}

interface FeedEntry {
  id: string;
  type: string;
  entryId: string;
  gameId: string;
  gameTitle: string;
  board: FeedBoard;
  playerName: string;
  rankAtSubmission: number;
  occurredAt: string;
  leaderboardPath: string;
  [key: string]: unknown;
}

interface BrowserFailures {
  console: string[];
  page: string[];
  requests: string[];
  responses: string[];
  allowedConsole: RegExp[];
  allowedResponses: RegExp[];
}

const failuresByPage = new WeakMap<Page, BrowserFailures>();
const activityRequestsByPage = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  failuresByPage.set(page, {
    console: [],
    page: [],
    requests: [],
    responses: [],
    allowedConsole: [],
    allowedResponses: [],
  });
  activityRequestsByPage.set(page, []);
  page.on('console', (message) => {
    if (message.type() === 'error') failuresByPage.get(page)!.console.push(message.text());
  });
  page.on('pageerror', (error) => failuresByPage.get(page)!.page.push(error.message));
  page.on('requestfailed', (request) => {
    failuresByPage.get(page)!.requests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === ACTIVITY_PATH) {
      activityRequestsByPage.get(page)!.push(`${request.method()} ${url.pathname}${url.search}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failuresByPage.get(page)!.responses.push(`${response.status()} ${response.url()}`);
    }
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

/** Serve one activity payload to the launcher, and mark it as the only call. */
async function serveActivity(page: Page, payload: unknown, status = 200): Promise<void> {
  await page.route(ACTIVITY_GLOB, async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  });
}

/** A deliberate failure is still a failure: the console and the page must say so. */
function allowUnavailable(page: Page): void {
  const failures = failuresByPage.get(page)!;
  failures.allowedConsole.push(/responded with a status of 503/u);
  failures.allowedResponses.push(/^503 /u);
}

function feedEntry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: 'evt-partition-1',
    type: 'leaderboard.qualified',
    entryId: 'entry-partition-1',
    gameId: 'partition',
    gameTitle: 'Partition',
    board: { id: 'arcade', label: 'Arcade run', context: { difficulty: 'Medium' } },
    playerName: 'SPARK PILOT',
    rankAtSubmission: 8,
    occurredAt: '2026-09-14T08:12:00.000Z',
    leaderboardPath: '/games/partition/?mode=leaderboard&board=arcade',
    ...overrides,
  };
}

function feed(entries: FeedEntry[]): unknown {
  return { protocolVersion: 1, entries };
}

async function openLauncher(page: Page): Promise<void> {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose your game.' })).toBeVisible();
}

function rows(page: Page) {
  return page.locator('#recent-list > .score-row');
}

test('one feed renders two unrelated games without any per-game branch', async ({ page }) => {
  await serveActivity(page, feed([
    feedEntry({ occurredAt: '2026-09-14T08:12:00.000Z' }),
    feedEntry({
      id: 'evt-orbital',
      entryId: 'entry-orbital',
      gameId: 'orbital-drift',
      gameTitle: 'Orbital Drift',
      board: { id: 'sector-3', label: 'Sector 3', context: { mode: 'Classic' } },
      playerName: 'LONG HAUL',
      rankAtSubmission: 1,
      occurredAt: '2026-09-15T06:30:00.000Z',
      leaderboardPath: '/games/orbital-drift/?mode=leaderboard&board=sector-3',
    }),
  ]));
  await openLauncher(page);

  // Newest first, whichever order the feed arrived in.
  await expect(rows(page)).toHaveCount(2);
  const newest = rows(page).nth(0);
  const older = rows(page).nth(1);
  await expect(newest.locator('.score-row__name')).toHaveText('LONG HAUL');
  await expect(newest.locator('.score-row__rank')).toHaveText('#1');
  await expect(newest.locator('.score-row__chip')).toHaveText(['Orbital Drift', 'Sector 3', 'Classic']);
  await expect(newest.locator('.score-row__link')).toHaveAttribute(
    'href',
    '/games/orbital-drift/?mode=leaderboard&board=sector-3',
  );
  await expect(newest.locator('.score-row__link'))
    .toHaveAccessibleName('Orbital Drift leaderboard: Sector 3');
  await expect(older.locator('.score-row__name')).toHaveText('SPARK PILOT');
  await expect(older.locator('.score-row__rank')).toHaveText('#8');
  await expect(older.locator('.score-row__chip')).toHaveText(['Partition', 'Arcade run', 'Medium']);
  await expect(older.locator('.score-row__link')).toHaveAttribute(
    'href',
    '/games/partition/?mode=leaderboard&board=arcade',
  );

  // Each row reads as one sentence and carries a real, machine-readable stamp.
  await expect(newest.locator('.score-row__who')).toHaveText('LONG HAUL reached #1');
  await expect(newest.locator('time')).toHaveAttribute('datetime', '2026-09-15T06:30:00.000Z');

  // The section is generic: no per-game artwork, no image of any kind.
  await expect(page.locator('.recent img')).toHaveCount(0);
  await expect(page.locator('.game-card')).toHaveCount(3);

  // Exactly one platform request, and nothing off-origin.
  expect(activityRequestsByPage.get(page)).toEqual([`GET ${ACTIVITY_PATH}`]);
  expect(await page.evaluate(() => performance.getEntriesByType('resource')
    .every((entry) => new URL(entry.name).origin === location.origin))).toBe(true);
});

test('the newest eight qualifying scores are shown and no more', async ({ page }) => {
  const entries = Array.from({ length: 12 }, (_, index) => feedEntry({
    id: `evt-${String(index).padStart(2, '0')}`,
    entryId: `entry-${index}`,
    playerName: `PILOT ${index}`,
    rankAtSubmission: index + 1,
    occurredAt: new Date(Date.UTC(2026, 8, 14, 0, index)).toISOString(),
    board: {
      id: 'arcade',
      label: 'Arcade run',
      context: { difficulty: 'Hard', mode: 'Ranked', season: 'Extra', ignored: 'Extra' },
    },
  }));
  await serveActivity(page, feed(entries));
  await openLauncher(page);

  await expect(rows(page)).toHaveCount(8);
  await expect(rows(page).nth(0).locator('.score-row__name')).toHaveText('PILOT 11');
  await expect(rows(page).nth(7).locator('.score-row__name')).toHaveText('PILOT 4');
  // Board context is bounded as well as validated.
  await expect(rows(page).nth(0).locator('.score-row__chip'))
    .toHaveText(['Partition', 'Arcade run', 'Hard', 'Ranked']);
});

test('a hostile record cannot add an element, an off-site link, or a fake row', async ({ page }) => {
  await serveActivity(page, feed([
    feedEntry({ id: 'evt-name', entryId: 'entry-name', playerName: '<img src=x onerror="boom()">' }),
    feedEntry(),
    // Off-site, schemeless, and traversal links never reach an anchor.
    feedEntry({ id: 'evt-abs', entryId: 'entry-abs', leaderboardPath: 'https://evil.test/games/partition/' }),
    feedEntry({ id: 'evt-scheme', entryId: 'entry-scheme', leaderboardPath: 'javascript:alert(1)' }),
    feedEntry({ id: 'evt-host', entryId: 'entry-host', leaderboardPath: '//evil.test/games/partition/' }),
    feedEntry({ id: 'evt-traverse', entryId: 'entry-traverse', leaderboardPath: '/games/partition/../../etc/passwd' }),
    feedEntry({ id: 'evt-backslash', entryId: 'entry-backslash', leaderboardPath: '/games/partition/\\..\\evil' }),
    // A link has to belong to the game the row claims.
    feedEntry({ id: 'evt-mismatch', entryId: 'entry-mismatch', leaderboardPath: '/games/orbital-drift/' }),
    // Placement, type, timestamp, board, and game id all have to hold.
    feedEntry({ id: 'evt-rank-high', entryId: 'entry-rank-high', rankAtSubmission: 51 }),
    feedEntry({ id: 'evt-rank-low', entryId: 'entry-rank-low', rankAtSubmission: 0 }),
    feedEntry({ id: 'evt-rank-fraction', entryId: 'entry-rank-fraction', rankAtSubmission: 1.5 }),
    feedEntry({ id: 'evt-type', entryId: 'entry-type', type: 'leaderboard.displaced' }),
    feedEntry({ id: 'evt-when', entryId: 'entry-when', occurredAt: '2026-13-45T99:99:99.000Z' }),
    feedEntry({ id: 'evt-when-loose', entryId: 'entry-when-loose', occurredAt: 'September 14, 2026' }),
    feedEntry({ id: 'evt-board', entryId: 'entry-board', board: { id: 'arcade', label: '' } }),
    feedEntry({
      id: 'evt-context',
      entryId: 'entry-context',
      board: { id: 'arcade', label: 'Arcade run', context: 'medium' },
    }),
    feedEntry({ id: 'evt-game', entryId: 'entry-game', gameId: 'Partition!' }),
    feedEntry({ id: 'evt-title', entryId: 'entry-title', gameTitle: 'x'.repeat(200) }),
    // A record repeated under the same event id is one achievement.
    feedEntry({ id: 'evt-repeat', entryId: 'entry-repeat' }),
    feedEntry({ id: 'evt-repeat', entryId: 'entry-repeat' }),
  ]));
  await openLauncher(page);

  // Two readable rows: the inert name and the ordinary entry, in id order.
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0).locator('.score-row__name'))
    .toHaveText('<img src=x onerror="boom()">');
  await expect(rows(page).nth(1).locator('.score-row__name')).toHaveText('SPARK PILOT');
  await expect(rows(page).nth(2).locator('.score-row__name')).toHaveText('SPARK PILOT');
  // The hostile name is inert text: it created nothing and ran nothing.
  await expect(page.locator('.recent img')).toHaveCount(0);
  await expect(page.locator('.recent a')).toHaveCount(3);
  const hrefs = await page.locator('.recent a').evaluateAll((links) => links.map((link) => (
    (link as HTMLAnchorElement).href
  )));
  expect(hrefs).toHaveLength(3);
  for (const href of hrefs) {
    expect(new URL(href).origin).toBe(new URL(page.url()).origin);
    expect(new URL(href).pathname.startsWith('/games/partition/')).toBe(true);
  }
});

test('an empty feed explains future activity without claiming the boards are empty', async ({ page }) => {
  await serveActivity(page, feed([]));
  await openLauncher(page);

  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#recent-list')).toBeHidden();
  await expect(page.locator('#recent-status')).toBeVisible();
  await expect(page.locator('#recent-status')).toContainText('New high scores will appear here.');
  const invitation = page.locator('#recent-status a');
  await expect(invitation).toHaveAttribute('href', '#games');
  await expect(invitation).toHaveAccessibleName('Choose a game');
  // The section names no game, so the invitation cannot either.
  await expect(page.locator('#recent-status')).not.toContainText('Partition');
});

test('an unreadable feed degrades to one quiet sentence, once, with no retry', async ({ page }) => {
  // A payload without the protocol revision is not a payload we can trust.
  await serveActivity(page, { entries: [feedEntry()] });
  await openLauncher(page);
  await expect(page.locator('#recent-status')).toHaveText('Recent scores are unavailable right now.');
  await expect(rows(page)).toHaveCount(0);

  // A feed of records we could not read is a failure, not an empty arcade.
  await page.unroute(ACTIVITY_GLOB);
  await serveActivity(page, feed([
    feedEntry({ id: 'evt-a', entryId: 'entry-a', leaderboardPath: '/somewhere-else' }),
    feedEntry({ id: 'evt-b', entryId: 'entry-b', gameId: 'unknown game' }),
  ]));
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#recent-status')).toHaveText('Recent scores are unavailable right now.');
  await expect(page.locator('#recent-status')).not.toContainText('New high scores will appear here.');
  expect(activityRequestsByPage.get(page)).toEqual([`GET ${ACTIVITY_PATH}`, `GET ${ACTIVITY_PATH}`]);
});

test('a failed request and a non-JSON body both land on the same unavailable state', async ({ page }) => {
  allowUnavailable(page);
  await serveActivity(page, { error: 'platform offline' }, 503);
  await openLauncher(page);
  await expect(page.locator('#recent-status')).toHaveText('Recent scores are unavailable right now.');
  await expect(rows(page)).toHaveCount(0);

  await page.unroute(ACTIVITY_GLOB);
  await serveActivity(page, '<html>not json</html>');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#recent-status')).toHaveText('Recent scores are unavailable right now.');

  // The games stay usable no matter what the feed does.
  await expect(page.getByRole('link', { name: 'Play Partition' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play Maltline' })).toBeVisible();
});

test('the loading state is honest, and resolves without a second request', async ({ page }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(ACTIVITY_GLOB, async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(feed([feedEntry()])),
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#recent-status')).toHaveText('Loading recent high scores…');
  await expect(rows(page)).toHaveCount(0);
  release();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('#recent-status')).toBeHidden();
  expect(activityRequestsByPage.get(page)).toEqual([`GET ${ACTIVITY_PATH}`]);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 700, height: 600 },
  { width: 390, height: 720 },
  { width: 320, height: 568 },
] as const) {
  test(`activity rows stay contained and reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serveActivity(page, feed([
      feedEntry(),
      feedEntry({
        id: 'evt-long',
        entryId: 'entry-long',
        gameId: 'orbital-drift',
        gameTitle: 'Orbital Drift',
        board: { id: 'sector-3', label: 'Sector 3 — Outer Rim Relay', context: { mode: 'Classic' } },
        playerName: 'A very long callsign indeed',
        rankAtSubmission: 1,
        leaderboardPath: '/games/orbital-drift/?mode=leaderboard&board=sector-3',
      }),
    ]));
    await openLauncher(page);

    const measurements = await page.evaluate(() => {
      const bounds = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const games = [...document.querySelectorAll<HTMLElement>('.game-card')].map(bounds);
      return {
        innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        games,
        gamesBottom: Math.max(...games.map((card) => card.bottom)),
        recent: bounds(document.querySelector<HTMLElement>('.recent')!),
        rows: [...document.querySelectorAll<HTMLElement>('.score-row')].map((row) => {
          const link = bounds(row.querySelector<HTMLElement>('.score-row__link')!);
          return { row: bounds(row), link };
        }),
      };
    });
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.games).toHaveLength(3);
    for (const card of measurements.games) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right - card.left).toBeLessThanOrEqual(measurements.innerWidth);
    }
    // The games come first; the activity feed sits underneath all of them.
    expect(measurements.recent.left).toBeGreaterThanOrEqual(0);
    expect(measurements.recent.right).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.recent.top).toBeGreaterThanOrEqual(measurements.gamesBottom);
    expect(measurements.rows).toHaveLength(2);
    for (const { row, link } of measurements.rows) {
      expect(row.left).toBeGreaterThanOrEqual(measurements.recent.left);
      expect(row.right).toBeLessThanOrEqual(measurements.recent.right);
      expect(link.left).toBeGreaterThanOrEqual(row.left);
      expect(link.right).toBeLessThanOrEqual(row.right);
      expect(link.bottom - link.top).toBeGreaterThanOrEqual(44);
    }
  });
}

test('without JavaScript the section explains itself instead of loading forever', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#recent-status[data-live]')).toBeHidden();
  const fallback = page.locator('noscript p');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('Recent high scores need JavaScript.');
  await expect(fallback.locator('a')).toHaveAttribute('href', '#games');
  await expect(page.getByRole('heading', { level: 2, name: 'Recent high scores' })).toBeVisible();
  await expect(page.locator('.game-card')).toHaveCount(3);
  await context.close();
});

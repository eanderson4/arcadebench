import { expect, test, type Page } from '@playwright/test';
const glob = '**/api/v2/activity*';
function entry(overrides: Record<string, unknown> = {}) {
  return { id: 'evt-partition-1', type: 'leaderboard.qualified', entryId: 'entry-partition-1', gameId: 'partition', gameTitle: 'Partition',
    board: { id: 'arcade', label: 'Arcade run', context: { difficulty: 'Medium' } }, playerName: 'SPARK PILOT', rankAtSubmission: 8,
    occurredAt: '2026-09-14T08:12:00.000Z', leaderboardPath: '/games/partition/?mode=leaderboard&board=arcade', ...overrides };
}
const feed = (entries: unknown[]) => ({ protocolVersion: 1, entries });
const rows = (page: Page) => page.locator('#recent-list > .score-row');
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
  await page.addInitScript(() => {
    let i = 0; Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = [2, 1][i++ % 2]!; return array; } });
  });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function serve(page: Page, payload: unknown, status = 200) {
  await page.route(glob, route => route.fulfill({ status, contentType: 'application/json', body: typeof payload === 'string' ? payload : JSON.stringify(payload) }));
}
async function open(page: Page) { await page.goto('/'); await expect(page.locator('#selected-game')).toBeVisible(); }

test('requests selected game, sorts newest first, and displays achievement rank with no interactive rows', async ({ page }) => {
  const requests: string[] = [];
  await page.route(glob, route => {
    requests.push(new URL(route.request().url()).search);
    return route.fulfill({ json: feed([entry(), entry({ id: 'evt-new', playerName: 'NEW PILOT', rankAtSubmission: 1, occurredAt: '2026-09-15T06:30:00.000Z' }), entry({ id: 'evt-other', gameId: 'maltline', gameTitle: 'Maltline', leaderboardPath: '/games/maltline/' })]) });
  });
  await open(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first().locator('.score-row__name')).toHaveText('NEW PILOT');
  await expect(rows(page).first().locator('.score-row__placement')).toHaveText('reached #1');
  await expect(rows(page).first().locator('.score-row__meta')).toHaveText('Arcade run · Medium');
  await expect(rows(page).first().locator('time')).toHaveAttribute('datetime', '2026-09-15T06:30:00.000Z');
  await expect(page.locator('.recent a, .recent button, .recent img, .recent [tabindex]')).toHaveCount(0);
  expect(requests).toEqual(['?limit=5&gameId=partition']);
});

test('only the newest five candidates are kept, with bounded board context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await serve(page, feed(Array.from({ length: 12 }, (_, i) => entry({ id: `evt-${i}`, playerName: `PILOT ${i}`, occurredAt: new Date(Date.UTC(2026, 8, 14, 0, i)).toISOString(), board: { id: 'arcade', label: 'Arcade run', context: { difficulty: 'Hard', mode: 'Ranked', season: 'Extra' } } }))));
  await open(page); await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first().locator('.score-row__name')).toHaveText('PILOT 11');
  await expect(rows(page).last().locator('.score-row__name')).toHaveText('PILOT 7');
  await expect(rows(page).first().locator('.score-row__meta')).toHaveText('Arcade run · Hard · Ranked');
  await expect(page.locator('.score-row:visible')).toHaveCount(5);
});

test('board context already present in its authored label is not repeated', async ({ page }) => {
  await serve(page, feed([entry({
    board: { id: 'arcade', label: 'Arcade · Medium', context: { difficulty: 'medium' } },
  })]));
  await open(page);
  await expect(rows(page).first().locator('.score-row__meta')).toHaveText('Arcade · Medium');
});

test('hostile data stays inert and invalid protocol records are discarded', async ({ page }) => {
  await serve(page, feed([
    entry({ id: 'evt-name', entryId: 'entry-name', playerName: '<img src=x onerror="boom()">' }),
    entry(),
    // Off-site, schemeless, and traversal links never reach an anchor.
    entry({ id: 'evt-abs', entryId: 'entry-abs', leaderboardPath: 'https://evil.test/games/partition/' }),
    entry({ id: 'evt-scheme', entryId: 'entry-scheme', leaderboardPath: 'javascript:alert(1)' }),
    entry({ id: 'evt-host', entryId: 'entry-host', leaderboardPath: '//evil.test/games/partition/' }),
    entry({ id: 'evt-traverse', entryId: 'entry-traverse', leaderboardPath: '/games/partition/../../etc/passwd' }),
    entry({ id: 'evt-backslash', entryId: 'entry-backslash', leaderboardPath: '/games/partition/\\..\\evil' }),
    // A link has to belong to the game the row claims.
    entry({ id: 'evt-mismatch', entryId: 'entry-mismatch', leaderboardPath: '/games/orbital-drift/' }),
    // Placement, type, timestamp, board, and game id all have to hold.
    entry({ id: 'evt-rank-high', entryId: 'entry-rank-high', rankAtSubmission: 51 }),
    entry({ id: 'evt-rank-low', entryId: 'entry-rank-low', rankAtSubmission: 0 }),
    entry({ id: 'evt-rank-fraction', entryId: 'entry-rank-fraction', rankAtSubmission: 1.5 }),
    entry({ id: 'evt-type', entryId: 'entry-type', type: 'leaderboard.displaced' }),
    entry({ id: 'evt-when', entryId: 'entry-when', occurredAt: '2026-13-45T99:99:99.000Z' }),
    entry({ id: 'evt-when-loose', entryId: 'entry-when-loose', occurredAt: 'September 14, 2026' }),
    entry({ id: 'evt-board', entryId: 'entry-board', board: { id: 'arcade', label: '' } }),
    entry({
      id: 'evt-context',
      entryId: 'entry-context',
      board: { id: 'arcade', label: 'Arcade run', context: 'medium' },
    }),
    entry({ id: 'evt-game', entryId: 'entry-game', gameId: 'Partition!' }),
    entry({ id: 'evt-title', entryId: 'entry-title', gameTitle: 'x'.repeat(200) }),
    // A record repeated under the same event id is one achievement.
    entry({ id: 'evt-repeat', entryId: 'entry-repeat' }),
    entry({ id: 'evt-repeat', entryId: 'entry-repeat' }),
  ]));
  await open(page); await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.score-row__name').filter({ hasText: '<img src=x onerror="boom()">' })).toHaveCount(1);
  await expect(page.locator('.recent img, .recent a, .recent script')).toHaveCount(0);
});

for (const [name, payload, status] of [
  ['empty', feed([]), 200], ['missing protocol', { entries: [entry()] }, 200], ['invalid records', feed([entry({ rankAtSubmission: 51 })]), 200],
  ['wrong game', feed([entry({ gameId: 'maltline', leaderboardPath: '/games/maltline/' })]), 200],
  ['non JSON', '<html>not json</html>', 200], ['oversized', ' '.repeat(200001), 200], ['unavailable', {}, 503],
] as const) test(`${name} has a quiet honest state and leaves Play usable`, async ({ page }) => {
  await serve(page, payload, status); await open(page);
  await expect(page.locator('#recent-status')).toHaveText(name === 'empty' ? 'New Partition high scores will appear here.' : 'Partition scores are unavailable right now.');
  await expect(rows(page)).toHaveCount(0); await expect(page.locator('#selected-game a')).toBeVisible();
});

// A controllable transport deliberately ignores abort, proving generation checks too.
async function mockTransport(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    (window as any).activityCalls = [];
    window.fetch = (input, init) => String(input).startsWith('/api/v2/activity') ? new Promise<Response>((resolve, reject) => {
      (window as any).activityCalls.push({ url: String(input), signal: init?.signal, resolve: (data: unknown) => resolve(new Response(JSON.stringify(data))), reject });
    }) : original(input, init);
  });
}
async function resolve(page: Page, index: number, payload: unknown) { await page.evaluate(({ index, payload }) => (window as any).activityCalls[index].resolve(payload), { index, payload }); }
const callCount = (page: Page) => page.evaluate(() => (window as any).activityCalls.length);

test('loading, abort and stale response protection follow the latest selection', async ({ page }) => {
  await mockTransport(page); await open(page);
  await expect(page.locator('#recent-status')).toHaveText('Loading Partition high scores…');
  await page.locator('.cartridge__select').nth(1).click();
  await expect(page.locator('#recent-status')).toHaveText('Loading Maltline high scores…');
  expect(await page.evaluate(() => (window as any).activityCalls[0].signal.aborted)).toBe(true);
  await resolve(page, 1, feed([entry({ gameId: 'maltline', gameTitle: 'Maltline', leaderboardPath: '/games/maltline/', playerName: 'CURRENT' })]));
  await expect(page.locator('.score-row__name')).toHaveText('CURRENT');
  await resolve(page, 0, feed([entry()]));
  await expect(page.locator('.score-row__name')).toHaveText('CURRENT');
  await expect(page.locator('#recent-title')).toHaveText('Maltline');
});

test('visible refresh is bounded and retains the last successful rows during loading and failure', async ({ page }) => {
  await page.clock.install(); await mockTransport(page); await open(page);
  await resolve(page, 0, feed([entry()])); await expect(rows(page)).toHaveCount(1);
  await page.clock.fastForward(29000); expect(await callCount(page)).toBe(1);
  await page.clock.fastForward(1000); expect(await callCount(page)).toBe(2);
  await expect(rows(page)).toHaveCount(1); await expect(page.locator('#recent-status')).toBeHidden();
  await page.evaluate(() => (window as any).activityCalls[1].reject(new Error('offline')));
  await expect(page.locator('#recent-status')).toHaveText('Scores may be out of date. Unable to refresh.');
  await expect(rows(page)).toHaveCount(1);
  await page.clock.fastForward(30000); expect(await callCount(page)).toBe(3);
  await resolve(page, 2, feed([entry({ playerName: 'FRESH' })]));
  await expect(page.locator('.score-row__name')).toHaveText('FRESH');
  await expect(page.locator('#recent-status')).toBeHidden();
});

test('background refresh keeps an empty state quiet while its request is pending or fails', async ({ page }) => {
  await page.clock.install(); await mockTransport(page); await open(page);
  await resolve(page, 0, feed([]));
  await expect(page.locator('#recent-status')).toHaveText('New Partition high scores will appear here.');
  await page.clock.fastForward(30000); expect(await callCount(page)).toBe(2);
  await expect(page.locator('#recent-status')).toHaveText('New Partition high scores will appear here.');
  await page.evaluate(() => (window as any).activityCalls[1].reject(new Error('offline')));
  await expect(page.locator('#recent-status')).toHaveText('New Partition high scores will appear here.');
});

test('successful empty refresh does not mutate or repeat the same live-region message', async ({ page }) => {
  await page.clock.install(); await mockTransport(page); await open(page);
  await resolve(page, 0, feed([]));
  await expect(page.locator('#recent-status')).toHaveText('New Partition high scores will appear here.');
  await page.evaluate(() => {
    (window as any).statusMutations = 0;
    new MutationObserver(records => { (window as any).statusMutations += records.length; })
      .observe(document.querySelector('#recent-status')!, { childList: true, characterData: true, subtree: true });
  });
  await page.clock.fastForward(30000); expect(await callCount(page)).toBe(2);
  await resolve(page, 1, feed([]));
  await expect(page.locator('#recent-status')).toHaveText('New Partition high scores will appear here.');
  expect(await page.evaluate(() => (window as any).statusMutations)).toBe(0);
});

test('hidden pages cancel in-flight activity and refresh only the current game on return', async ({ page }) => {
  await page.clock.install(); await mockTransport(page); await open(page);
  await resolve(page, 0, feed([entry()])); await expect(rows(page)).toHaveCount(1);
  await page.clock.fastForward(30000); expect(await callCount(page)).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => (window as any).activityCalls[1].signal.aborted)).toBe(true);
  await page.clock.fastForward(90000); expect(await callCount(page)).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await callCount(page)).toBe(3); await expect(rows(page)).toHaveCount(1);
  await resolve(page, 2, feed([entry({ playerName: 'VISIBLE' })]));
  await resolve(page, 1, feed([entry({ playerName: 'STALE' })]));
  await expect(page.locator('.score-row__name')).toHaveText('VISIBLE');
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 }, { width: 390, height: 720 }, { width: 320, height: 568 }]) {
  test(`scoreboard contains complete rows without scroll at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serve(page, feed(Array.from({ length: 5 }, (_, i) => entry({ id: `evt-${i}`, playerName: 'A very long callsign indeed', board: { id: 'arcade', label: 'Arcade run with a very long readable board label', context: { difficulty: 'Medium' } } }))));
    await open(page); await expect(rows(page)).toHaveCount(5);
    const geometry = await page.evaluate(() => {
      const body = document.querySelector('.recent__body')!.getBoundingClientRect();
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, bodyBottom: body.bottom,
        rows: [...document.querySelectorAll<HTMLElement>('.score-row:not([hidden])')].map(row => { const r = row.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; }) };
    });
    expect(geometry.width).toBe(viewport.width); expect(geometry.rows.length).toBeGreaterThan(0);
    if (viewport.width >= 1100) { expect(geometry.height).toBe(viewport.height); for (const row of geometry.rows) expect(row.bottom).toBeLessThanOrEqual(geometry.bodyBottom + 1); }
    else expect(geometry.rows.length).toBe(5);
    for (const row of geometry.rows) { expect(row.left).toBeGreaterThanOrEqual(0); expect(row.right).toBeLessThanOrEqual(viewport.width); }
  });
}

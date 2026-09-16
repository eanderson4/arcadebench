import { expect, test, type Page } from '@playwright/test';
import { MALTLINE_CURRENT_CABINET_AUTHORITY } from '../../src/core/cabinet-authorities';

const gameVersion = MALTLINE_CURRENT_CABINET_AUTHORITY.gameVersion;

async function prepare(page: Page, ranked = false) {
  await page.route('http://127.0.0.1:5184/', route => route.fulfill({ contentType: 'text/html', body: '<h1>ArcadeBench homepage</h1>' }));
  await page.route('**/api/v2/games/maltline/**', route => {
    const request = route.request();
    if (request.url().endsWith('/runs')) return route.fulfill({ json: {
      id: 'run_home_guard', seed: 9, gameVersion, expiresAt: '2099-01-01T00:00:00.000Z',
    } });
    if (request.method() === 'GET') return route.fulfill({ json: { entries: [] } });
    const body = request.postDataJSON();
    return route.fulfill({ json: { entry: { id: 'entry_home_guard', gameId: 'maltline', gameVersion,
      board: { id: 'arcade', label: 'Second Shift', context: {} }, playerName: body.playerName,
      result: body.score, createdAt: '2026-09-15T18:00:00.000Z' },
      publication: { rankAtSubmission: 1, replaySaved: true, expiresAt: null } } });
  });
  await page.addInitScript(() => {
    const frames = new Map<number, FrameRequestCallback>(); let next = 0;
    window.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
    window.cancelAnimationFrame = id => { frames.delete(id); };
    Object.assign(window, { advanceHomeTestFrame(now: number) {
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now));
    } });
  });
  await page.goto(`/src/viewer/${ranked ? '?ranked=preview' : ''}`);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-viewer-ready', 'true');
}
async function frame(page: Page, now: number) {
  await page.evaluate(time => (window as unknown as { advanceHomeTestFrame(now: number): void }).advanceHomeTestFrame(time), now);
}
async function play(page: Page, ranked = false) {
  await page.getByRole('button', { name: 'Start Game' }).click(); await page.keyboard.press('Enter');
  if (ranked) await expect(page.locator('#overlay-hint')).toContainText('start ranked');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await frame(page, 0); await frame(page, 17);
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing');
}
const home = (page: Page) => page.getByRole('link', { name: 'Back to ArcadeBench homepage' });

test('home navigation is an accessible link and needs no confirmation before a run starts', async ({ page }) => {
  await prepare(page);
  const dialogs: string[] = []; page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await expect(home(page)).toHaveAttribute('href', '/');
  await home(page).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'ArcadeBench homepage' })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('first stage preparation has no unsaved run to confirm', async ({ page }) => {
  await prepare(page); await page.getByRole('button', { name: 'Start Game' }).click(); await page.keyboard.press('Enter');
  const dialogs: string[] = []; page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await home(page).click(); await expect(page).toHaveURL('http://127.0.0.1:5184/'); expect(dialogs).toEqual([]);
});

test('canceling home keeps the ranked run and clears held input without catch-up ticks or a toss', async ({ page }) => {
  await prepare(page, true); await play(page, true);
  await page.keyboard.down('Space');
  for (let tick = 2; tick <= 80; tick++) await frame(page, tick * 1000 / 60);
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
  const before = await page.evaluate(() => window.__maltlineViewerStatus);
  const dialogs: string[] = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.type()); expect(dialog.message()).toBe('Leave this game? Your current run will be lost.');
    await dialog.dismiss();
  });
  await home(page).click();
  expect(dialogs).toEqual(['confirm']);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toEqual(before);
  await expect(page.locator('[data-maltline-shell]')).toBeFocused();
  await page.keyboard.up('Space');
  await frame(page, 100_000);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toEqual(before);
  await frame(page, 100_017);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    engineTick: before!.engineTick + 1, rankEligible: true, interruptionReason: null, droppedMs: 0,
  });
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
});

test('confirming home during play navigates once without a second beforeunload prompt', async ({ page }) => {
  await prepare(page); await play(page);
  const dialogs: string[] = []; page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept(); });
  await home(page).click(); await expect(page.getByRole('heading', { name: 'ArcadeBench homepage' })).toBeVisible();
  expect(dialogs).toEqual(['confirm']);
});

test('canceling native reload preserves ranking and clears input and elapsed dialog time', async ({ page }) => {
  await prepare(page, true); await play(page, true);
  await page.keyboard.down('Space');
  for (let tick = 2; tick <= 80; tick++) await frame(page, tick * 1000 / 60);
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
  const before = await page.evaluate(() => window.__maltlineViewerStatus);
  const dialogSeen = page.waitForEvent('dialog');
  await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
  const dialog = await dialogSeen; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss();
  await page.keyboard.up('Space');
  await frame(page, 100_000);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toEqual(before);
  await frame(page, 100_017);
  expect(await page.evaluate(() => window.__maltlineViewerStatus)).toMatchObject({
    screen: 'playing', engineTick: before!.engineTick + 1,
    rankEligible: true, interruptionReason: null, droppedMs: 0,
  });
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
});

test('restoring the page clears a previous home navigation approval', async ({ page }) => {
  await prepare(page); await play(page);
  // Keep the approved document alive using an independent native unload veto,
  // then deliver the same persisted pageshow event emitted by a BFCache restore.
  await page.evaluate(() => window.addEventListener('beforeunload', event => {
    event.preventDefault(); event.returnValue = '';
  }, { once: true }));
  const dialogs: string[] = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.type());
    if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.dismiss();
  });
  await home(page).click();
  await expect.poll(() => dialogs).toEqual(['confirm', 'beforeunload']);
  const guards = await page.evaluate(() => {
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    return { before: before.defaultPrevented, after: after.defaultPrevented };
  });
  expect(guards).toEqual({ before: false, after: true });
});

test('submitted terminal scores can go home without another warning', async ({ page }) => {
  await prepare(page, true); await play(page, true);
  await page.evaluate(() => {
    const advance = (window as unknown as { advanceHomeTestFrame(now: number): void }).advanceHomeTestFrame;
    for (let tick = 2; tick <= 1854; tick++) advance(tick * 1000 / 60);
  });
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'gameover');
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toBeVisible();
  await page.getByLabel('Callsign', { exact: true }).fill('SODA');
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toContainText('Score saved.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const dialogs: string[] = []; page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await home(page).click(); await expect(page).toHaveURL('http://127.0.0.1:5184/'); expect(dialogs).toEqual([]);
});

for (const width of [1280, 700, 390]) {
  test(`home link stays visible and contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 }); await prepare(page);
    await expect(home(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `/tmp/maltline-home-header-${width}.png` });
    if (width >= 700) {
      await play(page); await expect(home(page)).toBeVisible();
      await page.screenshot({ path: `/tmp/maltline-home-playing-${width}.png` });
    }
  });
}

import { expect, test, type Page } from '@playwright/test';
import { MALTLINE_CURRENT_CABINET_AUTHORITY } from '../../src/core/cabinet-authorities';

const gameVersion = MALTLINE_CURRENT_CABINET_AUTHORITY.gameVersion;

const api = '**/api/v2/games/maltline/**';
async function prepare(page: Page, options: { moderation?: boolean; unavailable?: boolean } = {}) {
  const submissions: Record<string, unknown>[] = [];
  let rejectName = options.moderation;
  await page.route(api, async route => {
    const request = route.request();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    if (request.url().endsWith('/runs')) {
      return route.fulfill({ status: options.unavailable ? 503 : 200, json: options.unavailable ? { error: 'Unavailable' } : {
        id: 'run_browser_cabinet', seed: 17, gameVersion, expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      } });
    }
    if (request.method() === 'POST') {
      submissions.push(body!);
      if (rejectName) { rejectName = false; return route.fulfill({ status: 400, json: { error: 'Please choose another callsign.' } }); }
      return route.fulfill({ json: { entry: { id: 'entry_one', gameId: 'maltline', gameVersion,
        board: { id: 'arcade', label: 'Cabinet', context: {} }, playerName: body!.playerName, result: body!.score,
        createdAt: new Date().toISOString() }, publication: { rankAtSubmission: 3, replaySaved: true, expiresAt: null } } });
    }
    return route.fulfill({ json: { entries: [{ id: 'entry_other', gameId: 'maltline', gameVersion,
      board: { id: 'arcade', label: 'Cabinet', context: {} }, playerName: '<img src=x onerror=alert(1)>',
      result: { score: 2000, stageReached: 3, completed: false }, createdAt: new Date().toISOString() }] } });
  });
  return submissions;
}
async function terminal(page: Page) {
  await page.goto('/tests/visual/cabinet-board-fixture.html');
  await expect(page.locator('.cabinet-rank-notice')).toContainText('Ranked Second Shift run ready.');
  await page.evaluate(() => window.cabinetBoardFixtureFinish!());
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('cabinet score form stays brief and submits an unchecked native choice', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const submissions = await prepare(page); await terminal(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Allow ArcadeBench to use this replay or clips from it on social media.');
  await expect(dialog).toContainText('Optional. Your score is saved either way.');
  await expect(dialog).not.toContainText('Top 50');
  const checkbox = page.getByRole('checkbox'); await expect(checkbox).not.toBeChecked();
  await expect(dialog.locator('img')).toHaveCount(0);
  await expect(dialog).toContainText('<img src=x onerror=alert(1)>');
  await page.getByLabel('Callsign', { exact: true }).fill('SODA');
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(dialog).toContainText('Score saved.');
  expect(submissions[0]).toMatchObject({ gameVersion, publication: { policyVersion: 'top50-social-v1', socialMedia: false } });
  await expect(checkbox).toBeDisabled(); await expect(page.getByRole('button', { name: 'Submit score', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('social permission is keyboard operable, survives a rejected name, and resets on the next run', async ({ page }) => {
  const submissions = await prepare(page, { moderation: true }); await terminal(page);
  const checkbox = page.getByRole('checkbox'); await checkbox.focus(); await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await page.getByLabel('Callsign', { exact: true }).fill('MILK');
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Please choose another callsign.');
  await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
  await page.getByRole('button', { name: 'Submit score', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Score saved.');
  expect(submissions.map(body => body.publication)).toEqual([
    { policyVersion: 'top50-social-v1', socialMedia: true }, { policyVersion: 'top50-social-v1', socialMedia: true },
  ]);
  await page.getByRole('button', { name: 'Start a new run' }).click();
  await expect(page.locator('.cabinet-rank-notice')).toContainText('Ranked Second Shift run ready.');
  await page.evaluate(() => window.cabinetBoardFixtureFinish!());
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByLabel('Callsign', { exact: true })).toHaveValue('');
});

for (const [width, height] of [[700, 400], [390, 600]]) {
  test(`score form scrolls and closes by keyboard at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await prepare(page); await terminal(page);
    const dialog = page.getByRole('dialog');
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width); expect(bounds!.height).toBeLessThanOrEqual(height);
    await page.getByRole('checkbox').check(); await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('unavailable API permits explicit unranked play', async ({ page }) => {
  await prepare(page, { unavailable: true });
  await page.goto('/src/viewer/?ranked=preview');
  await page.getByRole('button', { name: 'Start Game' }).click(); await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-hint')).toContainText('start unranked');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing', { timeout: 7000 });
  await expect(page.locator('.cabinet-rank-notice')).toContainText('Unranked run');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-run-eligible', 'false');
});

test('activity deep link opens Shift Board on the untouched title screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page);
  await page.goto('/src/viewer/?ranked=preview&mode=leaderboard&board=arcade');

  await expect(page.getByRole('dialog', { name: 'Shift Board' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'title');
  await expect(page.locator('.splash')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__maltlineReplays?.length)).toBe(0);
  expect(errors).toEqual([]);
});


test('main labels a valid challenge ranked and loses eligibility on focus interruption', async ({ page }) => {
  await prepare(page);
  await page.goto('/src/viewer/?ranked=preview');
  await page.getByRole('button', { name: 'Start Game' }).click(); await page.keyboard.press('Enter');
  await expect(page.locator('#overlay-hint')).toContainText('start ranked');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-run-eligible', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing', { timeout: 7000 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('html')).toHaveAttribute('data-maltline-run-eligible', 'false');
  await expect(page.locator('.cabinet-rank-notice')).toContainText('continues unranked');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing');
});

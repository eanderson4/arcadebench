import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/api/v2/games/maltline/**', route => route.fulfill({ status: 503, json: { error: 'Offline test' } }));
  await page.addInitScript(() => {
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    window.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
    window.cancelAnimationFrame = id => { frames.delete(id); };
    Object.assign(window, { advanceEnterTestFrame(now: number) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(now));
    } });
  });
  await page.goto('/src/viewer/');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-viewer-ready', 'true');
}

async function frame(page: Page, tick: number) {
  await page.evaluate(now => (window as unknown as { advanceEnterTestFrame(now: number): void })
    .advanceEnterTestFrame(now), tick * 1000 / 60);
}

test('Enter advances menus, then replaces a held shake without advancing play or repeating', async ({ page }) => {
  await prepare(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'instructions');
  await expect(page.locator('#overlay')).toContainText('BUTTON 2 / ENTER');
  await expect(page.locator('.controls')).not.toContainText('B · X');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'stage-card');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'countdown');
  // The Enter edge that leaves countdown belongs only to presentation.
  await page.keyboard.down('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing');
  await frame(page, 0);
  await page.keyboard.down('Space');
  for (let tick = 1; tick <= 80; tick++) await frame(page, tick);
  await page.keyboard.down('Enter'); // Native repeat across the screen boundary.
  await frame(page, 81);
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
  await expect(page.locator('#game-status')).toContainText('0 washing.');
  await page.keyboard.up('Enter');
  await page.keyboard.down('Enter');
  for (let tick = 82; tick <= 100; tick++) await frame(page, tick);
  await expect(page.locator('#game-status')).toContainText('1 washing.');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing');
  await page.keyboard.down('Enter');
  for (let tick = 101; tick <= 170; tick++) await frame(page, tick);
  await expect(page.locator('#game-status')).toContainText('Vanilla shake ready.');
  await expect(page.locator('#game-status')).toContainText('Score 0. 4 lives.');
  await expect(page.locator('#game-status')).toContainText('button 2 (Enter)');
  await page.keyboard.up('Enter');
  await page.keyboard.up('Space');
});

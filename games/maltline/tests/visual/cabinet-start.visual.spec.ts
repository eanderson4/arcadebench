import { expect, test } from '@playwright/test';

for (const width of [1280, 700, 390]) {
  test(`splash fits ${width}px and exposes the correct start surface`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/src/viewer/');

    const start = page.getByRole('button', { name: 'Start Game' });
    await expect(start).toBeVisible();
    await expect(page.locator('.splash')).toBeVisible();
    await expect(page.locator('.stage-wrap')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    if (width >= 700) {
      await expect(start).toBeEnabled();
      await expect(start).toBeFocused();
    } else {
      await expect(start).toBeDisabled();
      await expect(page.locator('#splash-device-note')).toContainText('700px');
      await page.keyboard.press('Enter');
      await expect(page.locator('.splash')).toBeVisible();
      await page.setViewportSize({ width: 700, height: 720 });
      await expect(start).toBeEnabled();
      await start.click();
      await expect(page.locator('.overlay-card')).toHaveAttribute('data-overlay-variant', 'instructions');
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.unsupported-device')).toBeVisible();
      await expect(page.locator('#game')).toBeHidden();
    }
    expect(runtimeErrors).toEqual([]);
  });
}

for (const activation of ['click', 'Enter', 'Space'] as const) {
  test(`Start Game supports ${activation} and returns focus to gameplay`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/src/viewer/');
    const start = page.getByRole('button', { name: 'Start Game' });
    await expect(start).toBeFocused();
    if (activation === 'click') await start.click();
    else await page.keyboard.press(activation);

    const card = page.locator('.overlay-card');
    await expect(page.locator('.splash')).toBeHidden();
    await expect(start).toBeHidden();
    await expect(card).toHaveAttribute('data-overlay-variant', 'instructions');
    await expect(card).toBeFocused();
    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('data-overlay-variant', 'stage');
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('data-overlay-variant', 'countdown');
    await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6_000 });
    await expect(page.locator('[data-maltline-shell]')).toBeFocused();
    expect(runtimeErrors).toEqual([]);
  });
}

test('short active cabinet includes its ranking notice without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/src/viewer/');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-screen', 'playing');
  await expect(page.locator('.cabinet-rank-notice')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.shell')!.getBoundingClientRect();
    const notice = document.querySelector<HTMLElement>('.cabinet-rank-notice')!.getBoundingClientRect();
    return {
      shellBottom: shell.bottom,
      noticeBottom: notice.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  expect(geometry.shellBottom).toBeLessThanOrEqual(600);
  expect(geometry.noticeBottom).toBeLessThanOrEqual(600);
  expect(geometry.scrollWidth).toBe(1024);
  expect(geometry.scrollHeight).toBe(600);
});

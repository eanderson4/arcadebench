import { expect, test, type Page } from '@playwright/test';

async function openPartition(page: Page): Promise<void> {
  await page.route('**/api/v2/activity*', route => route.fulfill({
    contentType: 'application/json', body: '{"protocolVersion":1,"entries":[]}',
  }));
  await page.goto('/games/partition/');
}

async function startPartition(page: Page): Promise<void> {
  await openPartition(page);
  await page.locator('#launch-field').click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'live');
  await expect.poll(async () => Number(await page.locator('#tick').textContent())).toBeGreaterThan(0);
}

test('Partition links back to ArcadeBench from its unstarted home without a warning', async ({ page }) => {
  await openPartition(page);
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await page.locator('#home-screen').getByRole('link', { name: 'Back to ArcadeBench' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Choose your game.' })).toBeVisible();
  expect(dialogs).toEqual([]);
});

for (const width of [1280, 390]) {
  test(`Partition can cancel leaving and continue its current run at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await startPartition(page);
    const before = Number(await page.locator('#tick').textContent());
    const dialogs: string[] = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.type());
      expect(dialog.message()).toContain('current run');
      await dialog.dismiss();
    });
    const home = page.locator('#stage-home');
    await expect(home).toBeVisible();
    await home.click();
    await expect(page).toHaveURL(/\/games\/partition\//);
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'live');
    await expect.poll(async () => Number(await page.locator('#tick').textContent())).toBeGreaterThan(before);
    expect(dialogs).toEqual(['confirm']);
  });
}

test('Partition confirms leaving once and opens the arcade catalog', async ({ page }) => {
  await startPartition(page);
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept(); });
  await page.locator('#stage-home').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Choose your game.' })).toBeVisible();
  expect(dialogs).toEqual(['confirm']);
});

test('browser reload warns about an unfinished Partition run and can be canceled', async ({ page }) => {
  await startPartition(page);
  const before = Number(await page.locator('#tick').textContent());
  const dialogPromise = page.waitForEvent('dialog');
  // A canceled reload has no navigation completion event. Bound that wait.
  const reload = page.reload({ timeout: 1500 }).catch(() => null);
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'live');
  await expect.poll(async () => Number(await page.locator('#tick').textContent())).toBeGreaterThan(before);
});

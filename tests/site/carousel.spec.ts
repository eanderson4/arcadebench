import { expect, test, type Page } from '@playwright/test';

const authored = ['Partition', 'Maltline', 'Smilefall'];
async function open(page: Page, draws = [2, 1]) {
  await page.addInitScript(values => {
    let count = 0;
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => {
      array[0] = values[count % values.length]!; count++;
      document.documentElement.dataset.carouselRandomCalls = String(count);
      return array;
    } });
  }, draws);
  await page.route('**/api/v2/activity', route => route.fulfill({ json: { protocolVersion: 1, entries: [] } }));
  await page.goto('/');
  await expect(page.locator('.game-carousel__controls')).toBeVisible();
}
const names = (page: Page) => page.locator('#games h2').allTextContents();

for (const last of [0, 1, 2]) for (const first of [0, 1]) {
  test(`crypto shuffle maps the equally likely draws ${last},${first} to their DOM permutation once`, async ({ page }) => {
    const expected = [...authored];
    [expected[2], expected[last]] = [expected[last]!, expected[2]!];
    [expected[1], expected[first]] = [expected[first]!, expected[1]!];
    await open(page, [last, first]);
    expect(await names(page)).toEqual(expected);
    await expect(page.locator('html')).toHaveAttribute('data-carousel-random-calls', '2');
    await page.setViewportSize({ width: 390, height: 720 });
    await page.getByRole('button', { name: 'Next game' }).click();
    expect(await names(page)).toEqual(expected);
    await expect(page.locator('html')).toHaveAttribute('data-carousel-random-calls', '2');
  });
}

test('shuffle rejects the biased uint32 tail before choosing a card', async ({ page }) => {
  await open(page, [0xffffffff, 2, 1]);
  expect(await names(page)).toEqual(authored);
  await expect(page.locator('html')).toHaveAttribute('data-carousel-random-calls', '3');
});

test('buttons, arrows, Home/End, and Tab expose every game in shuffled DOM order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await open(page, [0, 0]);
  const order = await names(page);
  const links = page.locator('#games .game-card__play');
  await expect(page.locator('[data-carousel-title]')).toHaveText(order[0]!);
  await expect(page.locator('[data-carousel-count]')).toHaveText('01 / 03');
  await expect(page.locator('[data-carousel-next-label]')).toHaveText(`Next up: ${order[1]}`);
  await expect(page.locator('#games > li[data-active="true"] h2')).toHaveText(order[0]!);
  await expect(page.locator('[data-carousel-progress] > [data-active="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Previous game' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next game' }).click();
  await expect.poll(() => page.locator('#games').evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  await expect(page.locator('[data-carousel-title]')).toHaveText(order[1]!);
  await expect(page.locator('[data-carousel-count]')).toHaveText('02 / 03');
  await expect(page.locator('[data-carousel-live]')).toHaveText(`Game 2 of 3, ${order[1]}`);
  await expect(page.locator('#games > li[data-active="true"] h2')).toHaveText(order[1]!);
  await links.first().focus();
  for (let i = 0; i < 3; i++) {
    await expect(links.nth(i)).toBeFocused();
    await expect(links.nth(i)).toBeInViewport({ ratio: 1 });
    await expect(links.nth(i)).toHaveAccessibleName(`Play ${order[i]}`);
    if (i < 2) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Home'); await expect(links.first()).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(links.first()).toBeFocused();
  await page.keyboard.press('End'); await expect(links.last()).toBeFocused();
  await expect(page.getByRole('button', { name: 'Next game' })).toBeDisabled();
  await expect(page.locator('[data-carousel-next-label]')).toHaveText('End of the shelf');
  const box = await links.last().boundingBox();
  expect(box!.width).toBeGreaterThan(44); expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('reduced motion jumps immediately and keeps the artwork unfiltered', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByRole('button', { name: 'Next game' }).click();
  expect(await page.locator('#games').evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  expect(await page.locator('.game-card__art img').evaluateAll(images => images.map(image => ({
    filter: getComputedStyle(image).filter, opacity: getComputedStyle(image).opacity,
  })))).toEqual(authored.map(() => ({ filter: 'none', opacity: '1' })));
});

test('normal-motion navigation announces its settled slide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page, [2, 1]);
  await page.getByRole('button', { name: /^Next game/u }).click();
  await expect(page.locator('[data-carousel-live]')).toHaveText('Game 2 of 3, Maltline');
});

test('endpoint navigation keeps keyboard focus inside the carousel controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await open(page, [2, 1]);
  const previous = page.getByRole('button', { name: /^Previous game/u });
  const next = page.getByRole('button', { name: /^Next game/u });
  await next.click();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(previous).toBeFocused();
  await previous.click();
  await previous.click();
  await expect(previous).toBeDisabled();
  await expect(next).toBeFocused();
});

test('touch swipe moves the native scroll-snap track without moving the page sideways', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await open(page);
  const track = page.locator('#games'); const bounds = await track.boundingBox();
  const client = await context.newCDPSession(page);
  const y = Math.min(bounds!.y + 100, 500);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y }] });
  for (const x of [280, 220, 160, 100, 50]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => track.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('all three authored game links work without JavaScript or carousel controls', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 720 } });
  const page = await context.newPage();await page.goto('/');
  await expect(page.locator('.game-carousel__controls')).toBeHidden();
  expect(await names(page)).toEqual(authored);
  for (const title of authored) {
    const link = page.getByRole('link', { name: `Play ${title}` });
    await link.focus();await expect(link).toBeInViewport({ ratio: 1 });
    await expect(link).toHaveAttribute('href', `/games/${title.toLowerCase()}/`);
  }
  await context.close();
});

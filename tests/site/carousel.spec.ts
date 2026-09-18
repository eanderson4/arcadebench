import { expect, test, type Page } from '@playwright/test';
const authored = ['Partition', 'Maltline', 'Smilefall'];
async function open(page: Page, draws = [2, 1]) {
  await page.addInitScript(values => {
    let count = 0;
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => {
      array[0] = values[count++ % values.length]!;
      document.documentElement.dataset.carouselRandomCalls = String(count); return array;
    } });
  }, draws);
  await page.route('**/api/v2/activity*', route => route.fulfill({ json: { protocolVersion: 1, entries: [] } }));
  await page.goto('/');
  await expect(page.locator('#selected-game')).toBeVisible();
}
const names = (page: Page) => page.locator('.cartridge__title').allTextContents();
for (const last of [0, 1, 2]) for (const first of [0, 1]) {
  test(`unbiased shuffle ${last},${first} determines catalog and initial game once`, async ({ page }) => {
    const expected = [...authored];
    [expected[2], expected[last]] = [expected[last]!, expected[2]!];
    [expected[1], expected[first]] = [expected[first]!, expected[1]!];
    await open(page, [last, first]); expect(await names(page)).toEqual(expected);
    await expect(page.locator('#selected-title')).toHaveText(expected[0]!);
    await page.setViewportSize({ width: 390, height: 720 });
    await page.getByRole('button', { name: 'Next game' }).click();
    expect(await names(page)).toEqual(expected);
    await expect(page.locator('html')).toHaveAttribute('data-carousel-random-calls', '2');
  });
}
test('shuffle rejects the biased uint32 tail', async ({ page }) => {
  await open(page, [0xffffffff, 2, 1]); expect(await names(page)).toEqual(authored);
  await expect(page.locator('html')).toHaveAttribute('data-carousel-random-calls', '3');
});
test('unavailable RNG preserves the complete authored order', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, 'getRandomValues', { value: () => { throw new Error('unavailable'); } }));
  await page.route('**/api/v2/activity*', r => r.fulfill({ json: { protocolVersion: 1, entries: [] } }));
  await page.goto('/'); expect(await names(page)).toEqual(authored);
});
test('selection updates identity/art/action, endpoints retain focus, and Tab follows catalog order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 }); await open(page);
  const buttons = page.locator('.cartridge__select'); const next = page.getByRole('button', { name: 'Next game' });
  await expect(page.locator('[data-carousel-prev]')).toHaveAttribute('aria-disabled', 'true');
  await next.click(); await next.click();
  await expect(next).toBeFocused(); await expect(next).toHaveAttribute('aria-disabled', 'true');
  await next.evaluate((el: HTMLButtonElement) => el.click());
  await expect(page.locator('#selected-title')).toHaveText('Smilefall');
  await expect(page.locator('#selected-game img')).toHaveAttribute('src', '/covers/smilefall.png');
  await expect(page.locator('#selected-game .game-card__play')).toHaveAttribute('href', '/games/smilefall/');
  await expect(page.locator('[data-carousel-live]')).toHaveText('Game 3 of 3, Smilefall');
  await buttons.first().focus();
  for (let i = 0; i < 3; i++) {
    await expect(buttons.nth(i)).toBeFocused();
    await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
    await expect(buttons.nth(i)).toBeInViewport({ ratio: 1 });
    if (i < 2) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Home'); await expect(buttons.first()).toBeFocused();
  await page.keyboard.press('End'); await expect(buttons.last()).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#selected-game .game-card__play')).toBeFocused();
  await expect(page.locator('.recent a,.recent button,.recent [tabindex]')).toHaveCount(0);
});
for (const viewport of [{ width: 1280, height: 720 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 }]) {
  test(`desktop launcher fits one viewport at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await open(page);
    await expect(page.locator('body')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to games' })).toBeFocused();
    await page.locator('body').focus();
    const measured = await page.evaluate(() => {
      const track = document.querySelector('#games')!.getBoundingClientRect();
      return { doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        visible: [...document.querySelectorAll('.cartridge__select,#selected-game,.recent,#launcher-help,.site-footer,#selected-game .game-card__play')].every(el => {
          const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5;
        }), shoulders: [...document.querySelectorAll('.cartridge__select')].every(el => el.getBoundingClientRect().top - 6 >= track.top),
        fit: getComputedStyle(document.querySelector('#selected-game img')!).objectFit };
    });
    expect(measured).toEqual({ doc: [viewport.width, viewport.height], visible: true, shoulders: true, fit: 'contain' });
    await page.keyboard.press('ArrowRight'); await expect(page.locator('#selected-title')).toHaveText('Maltline');
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
    await expect(page.locator('#selected-title')).toHaveText('Smilefall');
  });
}
test('global Enter/Space launch selected real routes while ordinary links keep native behavior', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).launches = [];
    document.addEventListener('click', event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('#selected-game a');
      if (link) { event.preventDefault(); (window as any).launches.push(link.pathname); }
    }, true);
  });
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as any).launches)).toEqual(['/games/maltline/', '/games/smilefall/']);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'About' }).focus();
  await page.keyboard.press('Enter'); await expect(page).toHaveURL('/about/');
});
test('standard gamepad requires neutral, respects held stick/D-pad and launches once per A press', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).pad = { connected: true, mapping: 'standard', index: 0, id: 'Test pad', axes: [.8], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [(window as any).pad] });
  });
  await open(page); await page.waitForTimeout(200); await expect(page.locator('#selected-title')).toHaveText('Partition');
  await page.evaluate(() => { (window as any).pad.axes[0] = 0; }); await page.waitForTimeout(100);
  await page.evaluate(() => { (window as any).pad.axes[0] = .8; }); await page.waitForTimeout(600);
  await expect(page.locator('#selected-title')).toHaveText('Maltline');
  await page.evaluate(() => { (window as any).pad.axes[0] = .4; }); await page.waitForTimeout(100);
  await page.evaluate(() => { (window as any).pad.axes[0] = .8; }); await page.waitForTimeout(100);
  await expect(page.locator('#selected-title')).toHaveText('Maltline');
  await page.evaluate(() => { (window as any).pad.axes[0] = 0; }); await page.waitForTimeout(100);
  await page.evaluate(() => { (window as any).pad.buttons[15].pressed = true; }); await page.waitForTimeout(600);
  await expect(page.locator('#selected-title')).toHaveText('Smilefall');
  await page.evaluate(() => {
    (window as any).launches = 0;
    document.addEventListener('click', e => { if ((e.target as Element).closest('#selected-game a')) { e.preventDefault(); (window as any).launches++; } });
    (window as any).pad.buttons[0].pressed = true;
  });
  await page.waitForTimeout(650); expect(await page.evaluate(() => (window as any).launches)).toBe(1);
});
test('idle pages probe slowly when no gamepad is connected', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).gamepadPolls = 0;
    Object.defineProperty(navigator, 'getGamepads', { value: () => { (window as any).gamepadPolls++; return []; } });
  });
  await open(page);
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => (window as any).gamepadPolls)).toBeLessThanOrEqual(4);
});
test('native touch swipe browses the shelf; reduced motion preserves complete unfiltered art', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 720 }); await open(page);
  const track = page.locator('#games'); const box = await track.boundingBox(); const y = box!.y + 90;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y }] });
  for (const x of [280, 220, 160, 100, 50]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => track.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  await expect(page.locator('#selected-game')).toHaveAttribute('data-game-id', 'maltline');
  await expect(page.locator('.recent')).toHaveAttribute('data-game-id', 'maltline');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.locator('#selected-game img').evaluate(el => ({ filter: getComputedStyle(el).filter, opacity: getComputedStyle(el).opacity }))).toEqual({ filter: 'none', opacity: '1' });
  expect(await page.locator('.cartridge').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
});
test('without JavaScript every authored game remains visible and playable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 720 } });
  const page = await context.newPage(); await page.goto('/');
  await expect(page.locator('.game-carousel__controls')).toBeHidden(); await expect(page.locator('.recent')).toBeHidden();
  for (const name of authored) {
    const link = page.getByRole('link', { name: `Play ${name}` }); await expect(link).toBeVisible();
    await link.focus(); await expect(link).toBeInViewport({ ratio: 1 });
    await expect(link).toHaveAttribute('href', `/games/${name.toLowerCase()}/`);
  }
  await context.close();
});

test('twelve-game shelf reveals every selection while desktop document stays fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('http://127.0.0.1:5185/', async route => {
    const response = await route.fetch(); let html = await response.text();
    const card = html.match(/<li>\s*<article class="game-card"[\s\S]*?<\/article>\s*<\/li>/)![0];
    const extras = Array.from({ length: 9 }, (_, i) => card.replaceAll('partition', `partition-${i}`).replaceAll('Partition', `Partition ${i + 4}`).replace(`/covers/partition-${i}.png`, '/covers/partition.png'));
    html = html.replace(/<\/ul>(\s*<article id="selected-game")/, `${extras.join('')}</ul>$1`);
    await route.fulfill({ response, body: html });
  });
  await open(page);
  await expect(page.locator('.cartridge__select')).toHaveCount(12);
  await page.keyboard.press('End');
  await expect(page.locator('.cartridge__select').last()).toHaveAttribute('aria-pressed', 'true');
  const geometry = await page.evaluate(() => {
    const r = document.querySelector('.cartridge:last-child')!.getBoundingClientRect(); const track = document.querySelector('#games')!.getBoundingClientRect();
    return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, within: r.left >= track.left && r.right <= track.right, scrolled: document.querySelector('#games')!.scrollLeft > 0 };
  });
  expect(geometry).toEqual({ width: 1280, height: 720, within: true, scrolled: true });
  await page.keyboard.press('Home'); await expect(page.locator('.cartridge__select').first()).toHaveAttribute('aria-pressed', 'true');
});

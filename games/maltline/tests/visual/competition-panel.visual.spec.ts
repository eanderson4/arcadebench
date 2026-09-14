import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openPanelFixture(page: Page, state = 'ranked'): Promise<void> {
  await page.goto(`/tests/visual/competition-panel-fixture.html?state=${state}`);
  await expect(page.locator('html')).toHaveAttribute('data-competition-fixture-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-maltline-fonts-ready', 'true');
}

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => failures.push(`request: ${request.url()}`));
  Object.defineProperty(page, '__competitionFailures', { value: failures });
});

test.afterEach(async ({ page }) => {
  const failures = (page as Page & { __competitionFailures?: string[] }).__competitionFailures ?? [];
  expect(failures).toEqual([]);
});

test('competition panel renders every board and terminal submission state accessibly', async ({ page }) => {
  await openPanelFixture(page, 'loading');
  const panel = page.locator('[data-maltline-competition-panel]');
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  const status = panel.getByRole('status');

  await expect(dialog).toBeVisible();
  await expect(panel.locator('.maltline-competition__standings')).toHaveAttribute('aria-busy', 'true');
  await expect(dialog).not.toHaveAttribute('aria-busy', 'true');
  await expect(status).toHaveText(/Loading ranked runs/);

  const cases = [
    ['empty', 'FIRST SHIFT IS OPEN', /No verified runs yet/],
    ['error', 'BOARD OFFLINE', /could not load/],
    ['ranked', 'CREAM TOP', /4 ranked runs loaded/],
    ['eligible', 'POST THIS RUN', /rank eligible/],
    ['submitting', 'POSTING RUN', /Submitting MALT-7/],
    ['pending', 'VERIFYING RUN', /pending verification/],
    ['submission-error', 'RUN NOT POSTED', /was not posted/],
    ['accepted', 'RUN ACCEPTED', /was accepted/],
    ['ineligible', 'PRACTICE RESULT', /not rank eligible/],
    ['proof-unavailable', 'PROOF WINDOW ENDED', /no longer available/],
    ['inspected', 'INPUTS REPRODUCED', /reproduced the listed result/],
  ] as const;
  for (const [state, visibleCopy, announcement] of cases) {
    await page.evaluate((nextState) => window.__maltlineCompetitionSetState?.(nextState), state);
    await expect(dialog).toContainText(visibleCopy);
    await expect(status).toHaveText(announcement);
  }

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('eligible'));
  const callsign = page.getByRole('textbox', { name: 'Callsign' });
  await callsign.fill('  NEW SHIFT  ');
  await page.getByRole('button', { name: 'Submit verified run' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-competition-submitted-callsign', 'NEW SHIFT');

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('closed'));
  await expect(panel).toBeHidden();
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
});

test('pending and failed submissions offer an explicit same-proof retry', async ({ page }) => {
  await openPanelFixture(page, 'pending');
  await page.getByRole('button', { name: 'Retry verification' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-competition-submitted-callsign', 'MALT-7');
  await page.getByRole('button', { name: 'Discard run and start fresh' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-competition-discard-count', '1');

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('submission-error'));
  await page.getByRole('button', { name: 'Retry verification' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-competition-submitted-callsign', 'MALT-7');
});

test('callsigns stay text, focus is trapped, callbacks fire, and Escape restores focus', async ({ page }) => {
  await openPanelFixture(page);
  const panel = page.locator('[data-maltline-competition-panel]');
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  await expect(dialog).toBeFocused();
  await expect(panel.locator('img')).toHaveCount(0);
  await expect(panel.locator('.maltline-competition__callsign').nth(1))
    .toHaveText('NIGHT <img src=x onerror=alert(1)>');
  await expect(panel.locator('tr[data-current-player="true"]')).toContainText('(your run)');

  await page.getByRole('button', { name: 'Inspect CREAM TOP verified proof' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-competition-inspected-score',
    'score_AAAAAAAAAAAAAAAA',
  );

  const refresh = page.getByRole('button', { name: 'Refresh board' });
  await refresh.click();
  await expect(page.locator('html')).toHaveAttribute('data-competition-refresh-count', '1');
  await expect(dialog).toContainText('Window ended');
  await page.getByRole('button', { name: 'Inspect MALT-7 verified proof' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close competition panel' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#competition-opener')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-competition-close-count', '1');
  await expect(page.locator('html')).toHaveAttribute('data-competition-outer-key-count', '0');
});

test('competition sheet fits the minimum supported width and disables motion', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPanelFixture(page, 'eligible');

  const geometry = await page.locator('.maltline-competition__sheet').evaluate((sheet) => {
    const bounds = sheet.getBoundingClientRect();
    const styles = getComputedStyle(sheet);
    const spinner = document.querySelector<HTMLElement>('.maltline-competition__spinner');
    return {
      left: bounds.left,
      right: bounds.right,
      bottom: bounds.bottom,
      animation: styles.animationName,
      spinnerAnimation: spinner ? getComputedStyle(spinner).animationName : 'none',
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(700);
  expect(geometry.bottom).toBeLessThanOrEqual(600);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(700);
  expect(geometry.animation).toBe('none');
  expect(geometry.spinnerAnimation).toBe('none');
});

test('eligible and accepted competition surfaces have exact visual baselines', async ({ page }) => {
  await openPanelFixture(page, 'eligible');
  await expect(page).toHaveScreenshot('competition-eligible.png');

  await page.setViewportSize({ width: 700, height: 600 });
  await page.evaluate(() => window.__maltlineCompetitionSetState?.('accepted'));
  await expect(page).toHaveScreenshot('competition-accepted-700.png');
});

test('locally replayed retained proof has an exact visual baseline', async ({ page }) => {
  await openPanelFixture(page, 'inspected');
  const scrubber = page.locator('.maltline-replay-scrubber');
  await expect(scrubber.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  await expect(scrubber.getByRole('combobox', { name: 'Replay stage' })).toHaveValue('7');
  await expect(scrubber.getByRole('combobox', { name: 'Playback speed' })).toHaveValue('4');
  await expect(scrubber.getByRole('slider', { name: 'Replay frame' })).toHaveValue('0');
  await expect(scrubber.getByRole('timer', { name: 'Replay frame and game time' }))
    .toContainText('Frame 1 / 3,302 · game time 0:00 / 0:55');
  await expect(scrubber).toContainText('Stages play separately.');
  const primaryTransport = await scrubber.locator('.maltline-replay-scrubber__transport')
    .evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(primaryTransport.bottom).toBeLessThanOrEqual(720);
  await expect.poll(() => scrubber.evaluate((element) => ({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animations: element.getAnimations({ subtree: true }).length,
  }))).toEqual({ reducedMotion: true, animations: 0 });
  await expect(page).toHaveScreenshot('competition-inspected.png');
});

test('replay controls step exact frames, announce discrete actions, and tear down on exit', async ({ page }) => {
  await openPanelFixture(page, 'inspected');
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  const scrubber = page.locator('.maltline-replay-scrubber');
  const status = page.getByRole('status');
  const position = scrubber.getByRole('slider', { name: 'Replay frame' });
  await expect(page.getByRole('heading', { name: 'PROOF CHECK' })).toBeFocused();

  await scrubber.getByRole('button', { name: 'Next replay frame' }).click();
  await expect(position).toHaveValue('1');
  await expect(scrubber).toContainText(/Window \d+; .* station selected;/u);
  await expect(scrubber.getByRole('timer', { name: 'Replay frame and game time' }))
    .toContainText('Frame 2 / 3,302 · game time 0:00 / 0:55');
  await expect(position).toHaveAttribute(
    'aria-valuetext',
    'Closing Time, frame 2 of 3,302, game time 0:00 of 0:55',
  );
  await expect(status)
    .toHaveText('Replay paused at frame 2 of 3,302, game time 0:00 in Closing Time.');
  await scrubber.getByRole('button', { name: 'Forward 5 seconds' }).click();
  await expect(position).toHaveValue('301');
  await scrubber.getByRole('button', { name: 'Previous replay frame' }).click();
  await expect(position).toHaveValue('300');

  await scrubber.getByRole('button', { name: 'Play replay stage' }).click();
  await expect(scrubber.getByRole('button', { name: 'Pause replay' })).toBeVisible();
  await expect(status).toHaveText('Playing replay stage 8, Closing Time, at 4x.');
  await scrubber.getByRole('button', { name: 'Pause replay' }).click();
  const pausedTick = Number(await position.inputValue());
  const pausedSeconds = Math.floor(pausedTick / 60);
  const pausedTime = `${Math.floor(pausedSeconds / 60)}:${String(pausedSeconds % 60).padStart(2, '0')}`;
  await expect(status).toHaveText(
    `Replay paused at frame ${new Intl.NumberFormat('en-US').format(pausedTick + 1)} of 3,302, game time ${pausedTime} in Closing Time.`,
  );

  await scrubber.getByRole('combobox', { name: 'Replay stage' }).selectOption('0');
  await expect(position).toHaveValue('0');
  await expect(status)
    .toHaveText('Replay stage 1, First Pour, selected and paused at frame 1 of 1,559.');
  await page.getByRole('button', { name: 'Back to board' }).click();
  await expect(scrubber).toHaveCount(0);
  await expect(dialog).toContainText('TOP SHIFTS');
  await expect(page.getByRole('button', { name: 'Inspect MALT-7 verified proof' })).toBeFocused();

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));
  await expect(page.locator('.maltline-replay-scrubber')).toHaveCount(1);
  await expect(page.getByRole('slider', { name: 'Replay frame' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Play replay stage' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.maltline-competition')).toBeHidden();
  await expect(page.locator('.maltline-replay-scrubber')).toHaveCount(0);
  await expect(page.locator('#competition-opener')).toBeFocused();
});

test('same verified detail preserves a paused replay DOM, controls, focus, disclosures, scroll, and status', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openPanelFixture(page, 'inspected');
  const sheet = page.locator('.maltline-competition__sheet');
  const scrubber = page.locator('.maltline-replay-scrubber');
  const canvas = scrubber.locator('canvas');
  const position = scrubber.getByRole('slider', { name: 'Replay frame' });
  const stage = scrubber.getByRole('combobox', { name: 'Replay stage' });
  const speed = scrubber.getByRole('combobox', { name: 'Playback speed' });
  const nextFrame = scrubber.getByRole('button', { name: 'Next replay frame' });
  const status = page.getByRole('status');

  await stage.selectOption('5');
  await nextFrame.click();
  await scrubber.getByRole('button', { name: 'Forward 5 seconds' }).click();
  await speed.selectOption('8');
  await page.getByText('Stage breakdown', { exact: true }).click();
  await page.getByText('Proof fingerprint', { exact: true }).click();
  await nextFrame.focus();
  const savedScroll = await sheet.evaluate((element) => {
    element.scrollTop = Math.min(360, element.scrollHeight - element.clientHeight);
    return element.scrollTop;
  });
  expect(savedScroll).toBeGreaterThan(0);
  const savedStatus = await status.textContent();
  await scrubber.evaluate((element) => { element.dataset.preservationProbe = 'paused'; });
  await canvas.evaluate((element) => { element.dataset.preservationProbe = 'paused-canvas'; });
  await page.evaluate(() => {
    const live = document.querySelector<HTMLElement>('.maltline-competition [role="status"]')!;
    document.documentElement.dataset.competitionStatusMutations = '0';
    new MutationObserver(() => {
      const count = Number(document.documentElement.dataset.competitionStatusMutations ?? '0');
      document.documentElement.dataset.competitionStatusMutations = String(count + 1);
    }).observe(live, { childList: true, characterData: true, subtree: true });
  });

  // The fixture materializes a fresh state object on every call.
  await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));

  await expect(page.locator('[data-preservation-probe="paused"]')).toHaveCount(1);
  await expect(page.locator('[data-preservation-probe="paused-canvas"]')).toHaveCount(1);
  await expect(stage).toHaveValue('5');
  await expect(position).toHaveValue('301');
  await expect(speed).toHaveValue('8');
  await expect(scrubber.getByRole('button', { name: 'Play replay stage' })).toBeVisible();
  await expect(nextFrame).toBeFocused();
  await expect(page.getByText('Stage breakdown', { exact: true }).locator('..')).toHaveAttribute('open', '');
  await expect(page.getByText('Proof fingerprint', { exact: true }).locator('..')).toHaveAttribute('open', '');
  await expect(status).toHaveText(savedStatus ?? '');
  await expect(page.locator('html')).toHaveAttribute('data-competition-status-mutations', '0');
  expect(await sheet.evaluate((element) => element.scrollTop)).toBe(savedScroll);
});

test('same verified detail preserves active playback without another live announcement', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openPanelFixture(page, 'inspected');
  const scrubber = page.locator('.maltline-replay-scrubber');
  const canvas = scrubber.locator('canvas');
  const position = scrubber.getByRole('slider', { name: 'Replay frame' });
  await scrubber.getByRole('combobox', { name: 'Playback speed' }).selectOption('8');
  await scrubber.getByRole('button', { name: 'Play replay stage' }).click();
  const pause = scrubber.getByRole('button', { name: 'Pause replay' });
  await expect(pause).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0);
  const beforeRender = Number(await position.inputValue());
  await scrubber.evaluate((element) => { element.dataset.preservationProbe = 'playing'; });
  await canvas.evaluate((element) => { element.dataset.preservationProbe = 'playing-canvas'; });
  await page.evaluate(() => {
    const live = document.querySelector<HTMLElement>('.maltline-competition [role="status"]')!;
    document.documentElement.dataset.competitionStatusMutations = '0';
    new MutationObserver(() => {
      const count = Number(document.documentElement.dataset.competitionStatusMutations ?? '0');
      document.documentElement.dataset.competitionStatusMutations = String(count + 1);
    }).observe(live, { childList: true, characterData: true, subtree: true });
  });

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));

  await expect(page.locator('[data-preservation-probe="playing"]')).toHaveCount(1);
  await expect(page.locator('[data-preservation-probe="playing-canvas"]')).toHaveCount(1);
  await expect(pause).toBeFocused();
  await expect(scrubber.getByRole('combobox', { name: 'Playback speed' })).toHaveValue('8');
  await expect(page.locator('html')).toHaveAttribute('data-competition-status-mutations', '0');
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(beforeRender);
  await pause.click();
});

test('verified identity changes rebuild from frame one, scroll to and focus Proof Check, and announce once', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openPanelFixture(page, 'inspected');
  const sheet = page.locator('.maltline-competition__sheet');

  for (const fixture of [
    { state: 'inspected-other-entry' as const, callsign: 'SECOND SHIFT', playbackChanges: false },
    { state: 'inspected-other-proof' as const, callsign: 'MALT-7', playbackChanges: true },
  ]) {
    await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));
    const scrubber = page.locator('.maltline-replay-scrubber');
    const position = scrubber.getByRole('slider', { name: 'Replay frame' });
    await scrubber.getByRole('button', { name: 'Forward 5 seconds' }).click();
    await scrubber.getByRole('combobox', { name: 'Playback speed' }).selectOption('8');
    await page.getByText('Stage breakdown', { exact: true }).click();
    await page.getByText('Proof fingerprint', { exact: true }).click();
    await scrubber.getByRole('button', { name: 'Next replay frame' }).focus();
    await sheet.evaluate((element) => { element.scrollTop = 360; });
    expect(await sheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await scrubber.evaluate((element) => { element.dataset.replacedProbe = 'old'; });
    const displayDigest = await page.locator('.maltline-competition__proof-digest').textContent();
    const playbackDigest = await page.locator('html').getAttribute('data-competition-playback-digest');
    await page.evaluate(() => {
      type FixtureWindow = Window & { __competitionReplacementObserver?: MutationObserver };
      const fixtureWindow = window as FixtureWindow;
      fixtureWindow.__competitionReplacementObserver?.disconnect();
      const live = document.querySelector<HTMLElement>('.maltline-competition [role="status"]')!;
      document.documentElement.dataset.competitionReplacementAnnouncements = '0';
      const observer = new MutationObserver((records) => {
        const count = Number(
          document.documentElement.dataset.competitionReplacementAnnouncements ?? '0',
        );
        document.documentElement.dataset.competitionReplacementAnnouncements = String(
          count + records.length,
        );
      });
      observer.observe(live, { childList: true, characterData: true, subtree: true });
      fixtureWindow.__competitionReplacementObserver = observer;
    });

    await page.evaluate((nextState) => window.__maltlineCompetitionSetState?.(nextState), fixture.state);

    await expect(page.locator('[data-replaced-probe="old"]')).toHaveCount(0);
    await expect(page.locator('.maltline-replay-scrubber').getByRole('slider', { name: 'Replay frame' }))
      .toHaveValue('0');
    await expect(page.locator('.maltline-replay-scrubber').getByRole('combobox', { name: 'Playback speed' }))
      .toHaveValue('4');
    await expect(page.getByRole('heading', { name: 'PROOF CHECK' })).toBeFocused();
    expect(await sheet.evaluate((element) => element.scrollTop)).toBe(0);
    const headingIsVisible = await page.getByRole('heading', { name: 'PROOF CHECK' }).evaluate((heading) => {
      const headingBounds = heading.getBoundingClientRect();
      const sheetBounds = heading.closest<HTMLElement>('.maltline-competition__sheet')!
        .getBoundingClientRect();
      return headingBounds.top >= sheetBounds.top && headingBounds.bottom <= sheetBounds.bottom;
    });
    expect(headingIsVisible).toBe(true);
    await expect(page.getByRole('status')).toHaveText(
      `Now showing ${fixture.callsign}'s verified replay at the first frame of its selected stage.`,
    );
    await expect(page.locator('html'))
      .toHaveAttribute('data-competition-replacement-announcements', '1');
    expect(await page.locator('.maltline-competition__proof-digest').textContent()).toBe(displayDigest);
    const nextPlaybackDigest = await page.locator('html').getAttribute('data-competition-playback-digest');
    expect(nextPlaybackDigest === playbackDigest).toBe(!fixture.playbackChanges);
  }
});

test('different inspection kind, Back, close, and destroy tear down the active replay', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openPanelFixture(page, 'inspected');

  const markReplay = async (probe: string): Promise<void> => {
    await page.locator('.maltline-replay-scrubber').evaluate((element, value) => {
      element.dataset.teardownProbe = value;
    }, probe);
  };

  await markReplay('kind');
  await page.evaluate(() => window.__maltlineCompetitionSetState?.('proof-unavailable'));
  await expect(page.locator('[data-teardown-probe="kind"]')).toHaveCount(0);

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));
  await markReplay('back');
  await page.getByRole('button', { name: 'Back to board' }).click();
  await expect(page.locator('[data-teardown-probe="back"]')).toHaveCount(0);

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));
  await markReplay('close');
  await page.getByRole('button', { name: 'Close competition panel' }).click();
  await expect(page.locator('[data-teardown-probe="close"]')).toHaveCount(0);
  await expect(page.locator('.maltline-competition')).toBeHidden();

  await page.evaluate(() => window.__maltlineCompetitionSetState?.('inspected'));
  await markReplay('destroy');
  await page.evaluate(() => window.__maltlineCompetitionPanel?.destroy());
  await expect(page.locator('[data-teardown-probe="destroy"]')).toHaveCount(0);
  await expect(page.locator('[data-maltline-competition-panel]')).toHaveCount(0);
});

test('live reduced-motion changes pause and rebuild the same committed replay frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openPanelFixture(page, 'inspected');
  const scrubber = page.locator('.maltline-replay-scrubber');
  const position = scrubber.getByRole('slider', { name: 'Replay frame' });
  const status = page.getByRole('status');
  await position.evaluate((element: HTMLInputElement) => {
    element.value = '300';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await position.focus();

  await page.emulateMedia({ reducedMotion: 'reduce' });

  await expect(position).toHaveValue('300');
  await expect(position).toBeFocused();
  await expect(status).toHaveText(
    'Reduced motion enabled; replay paused at frame 301 of 3,302 in Closing Time.',
  );

  await scrubber.getByRole('button', { name: 'Play replay stage' }).click();
  const pause = scrubber.getByRole('button', { name: 'Pause replay' });
  await expect(pause).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(300);
  await pause.focus();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const play = scrubber.getByRole('button', { name: 'Play replay stage' });
  await expect(play).toBeFocused();
  await expect(status).toHaveText(/Reduced motion disabled; replay paused at frame \d+ of 3,302 in Closing Time\./u);
  const stoppedAt = await position.inputValue();
  await page.waitForTimeout(100);
  await expect(position).toHaveValue(stoppedAt);
});

test('proof disclosures remain in the modal keyboard order', async ({ page }) => {
  await openPanelFixture(page, 'inspected');
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  const speed = dialog.getByRole('combobox', { name: 'Playback speed' });
  const stages = dialog.getByText('Stage breakdown', { exact: true });
  const fingerprint = dialog.getByText('Proof fingerprint', { exact: true });
  await speed.focus();
  await page.keyboard.press('Tab');
  await expect(stages).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stages.locator('..')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(fingerprint).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(fingerprint.locator('..')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close competition panel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(fingerprint).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.maltline-competition')).toBeHidden();
  await expect(page.locator('#competition-opener')).toBeFocused();
});

test('replaying a terminal stage clears future event copy at tick zero', async ({ page }) => {
  await openPanelFixture(page, 'inspected');
  const scrubber = page.locator('.maltline-replay-scrubber');
  const position = scrubber.getByRole('slider', { name: 'Replay frame' });
  await position.evaluate((element: HTMLInputElement) => {
    element.value = element.max;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const replay = scrubber.getByRole('button', { name: 'Replay stage', exact: true });
  await expect(replay).toBeVisible();
  await expect(scrubber.locator('.maltline-replay-scrubber__event')).toContainText('Stage cleared');
  const restart = await replay.evaluate((button: HTMLButtonElement) => {
    const root = button.closest('.maltline-replay-scrubber');
    const position = root?.querySelector<HTMLInputElement>('[aria-label="Replay frame"]');
    const event = root?.querySelector<HTMLElement>('.maltline-replay-scrubber__event');
    if (root === null || position === null || position === undefined || event === null || event === undefined) {
      throw new Error('Replay controls are incomplete.');
    }

    // Restart resets synchronously, then deliberately begins autoplay. Capture
    // that boundary and pause again before the browser can deliver the RAF.
    button.click();
    const observed = {
      position: position.value,
      event: event.textContent,
      control: button.getAttribute('aria-label'),
    };
    button.click();
    return observed;
  });
  expect(restart).toEqual({
    position: '0',
    event: 'Recent event: No recent major event.',
    control: 'Pause replay',
  });
  await expect(position).toHaveValue('0');
  await expect(scrubber.locator('.maltline-replay-scrubber__event'))
    .toHaveText('Recent event: No recent major event.');
});

test('replay remains semantic and usable when its canvas context is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await openPanelFixture(page, 'inspected');
  const scrubber = page.locator('.maltline-replay-scrubber');
  await expect(scrubber).toContainText('Replay picture unavailable.');
  await expect(scrubber).toContainText('Stage 8 of 8, Closing Time.');
  await expect(scrubber).toContainText(/Window \d+; .* station selected;/u);
  await scrubber.getByRole('button', { name: 'Next replay frame' }).click();
  await expect(scrubber.getByRole('slider', { name: 'Replay frame' })).toHaveValue('1');
});

test('the maximum proof detail stays fully contained at responsive widths', async ({ page }) => {
  for (const viewport of [
    { width: 700, height: 600 },
    { width: 390, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await openPanelFixture(page, 'inspected');
    const sheet = page.locator('.maltline-competition__sheet');
    const inspection = page.locator('.maltline-competition__inspection');
    const canvas = inspection.locator('.maltline-replay-scrubber__canvas');
    const transport = inspection.locator('.maltline-replay-scrubber__transport');
    await expect(inspection.locator('.maltline-competition__proof-stages > li')).toHaveCount(8);
    await expect(inspection).toContainText('Closing Time');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas.locator('xpath=following-sibling::*[1]'))
      .toHaveClass('maltline-replay-scrubber__transport');
    await expect(transport.getByRole('button', { name: 'Play replay stage' })).toBeVisible();
    await expect(inspection.getByRole('button', { name: 'Previous replay frame' })).toBeVisible();
    await expect(inspection.getByRole('button', { name: 'Forward 5 seconds' })).toBeVisible();
    await expect(inspection.getByRole('slider', { name: 'Replay frame' })).toBeVisible();
    await expect(inspection.getByText('Proof fingerprint')).toBeVisible();
    await expect(inspection.getByRole('button', { name: 'Back to board' })).toBeVisible();
    const geometry = await page.evaluate(() => {
      const sheetElement = document.querySelector<HTMLElement>('.maltline-competition__sheet')!;
      const detailElement = document.querySelector<HTMLElement>('.maltline-competition__inspection')!;
      const canvasElement = document.querySelector<HTMLElement>('.maltline-replay-scrubber__canvas')!;
      const transportElement = document.querySelector<HTMLElement>('.maltline-replay-scrubber__transport')!;
      const sheetBounds = sheetElement.getBoundingClientRect();
      const detailBounds = detailElement.getBoundingClientRect();
      const canvasBounds = canvasElement.getBoundingClientRect();
      const transportBounds = transportElement.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        sheetLeft: sheetBounds.left,
        sheetRight: sheetBounds.right,
        sheetBottom: sheetBounds.bottom,
        detailLeft: detailBounds.left,
        detailRight: detailBounds.right,
        detailContentBottom: detailElement.offsetTop + detailElement.offsetHeight,
        sheetScrollHeight: sheetElement.scrollHeight,
        canvasLeft: canvasBounds.left,
        canvasRight: canvasBounds.right,
        canvasBottom: canvasBounds.bottom,
        transportLeft: transportBounds.left,
        transportRight: transportBounds.right,
        transportTop: transportBounds.top,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(geometry.sheetLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.sheetRight).toBeLessThanOrEqual(viewport.width);
    expect(geometry.sheetBottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.detailLeft).toBeGreaterThanOrEqual(geometry.sheetLeft);
    expect(geometry.detailRight).toBeLessThanOrEqual(geometry.sheetRight);
    expect(geometry.detailContentBottom).toBeLessThanOrEqual(geometry.sheetScrollHeight);
    expect(geometry.canvasLeft).toBeGreaterThanOrEqual(geometry.detailLeft);
    expect(geometry.canvasRight).toBeLessThanOrEqual(geometry.detailRight);
    expect(geometry.transportLeft).toBeGreaterThanOrEqual(geometry.detailLeft);
    expect(geometry.transportRight).toBeLessThanOrEqual(geometry.detailRight);
    expect(geometry.transportTop).toBeGreaterThanOrEqual(geometry.canvasBottom);
  }
});

test('player-readable replay controls have an exact focused 700px surface', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await openPanelFixture(page, 'inspected');
  const scrubber = page.locator('.maltline-replay-scrubber');
  const nextFrame = scrubber.getByRole('button', { name: 'Next replay frame' });
  const position = scrubber.getByRole('slider', { name: 'Replay frame' });

  await nextFrame.click();
  await nextFrame.scrollIntoViewIfNeeded();
  await expect(nextFrame).toBeFocused();
  await expect(position).toHaveValue('1');
  await expect(position).toHaveAttribute(
    'aria-valuetext',
    'Closing Time, frame 2 of 3,302, game time 0:00 of 0:55',
  );
  await expect(scrubber.getByRole('timer', { name: 'Replay frame and game time' }))
    .toHaveText('Frame 2 / 3,302 · game time 0:00 / 0:55');
  await expect(scrubber.getByRole('combobox', { name: 'Playback speed' })).toBeVisible();
  await expect(scrubber.locator('.maltline-replay-scrubber__summary')).toBeVisible();
  await expect(scrubber.locator('.maltline-replay-scrubber__event'))
    .toHaveText('Recent event: No recent major event.');
  await expect(page.getByText('Stage breakdown', { exact: true })).toBeVisible();
  await expect(page.getByText('Proof fingerprint', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(700);
  await expect(page).toHaveScreenshot('competition-inspected-controls-700.png');
});

test('the board remains a usable browse-only surface below playable width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await openPanelFixture(page, 'ranked');
  const sheet = page.locator('.maltline-competition__sheet');
  await expect(sheet).toBeVisible();
  const bounds = await sheet.evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const tableBounds = await page.locator('.maltline-competition__table-wrap').evaluate((element) => (
    element.getBoundingClientRect().toJSON()
  ));
  const inspectBounds = await page.getByRole('button', { name: 'Inspect CREAM TOP verified proof' })
    .evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(inspectBounds.right).toBeLessThanOrEqual(tableBounds.right);
  await expect(page).toHaveScreenshot('competition-ranked-390.png');
});

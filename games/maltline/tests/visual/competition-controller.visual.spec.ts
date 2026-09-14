import { expect, test } from '@playwright/test';

async function openFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/tests/visual/competition-controller-fixture.html');
  await expect(page.locator('html')).toHaveAttribute('data-controller-fixture-ready', 'true');
}

test.beforeEach(async ({ page }) => {
  await openFixture(page);
});

test('a board entry replays its retained proof locally before showing inspection data', async ({ page }) => {
  await page.evaluate(() => {
    const harness = window.__maltlineCompetitionControllerHarness!;
    harness.startAttempt();
    harness.resolveChallenge(0, 'A');
    harness.openPanel();
    harness.resolveBoard(0, 'ARCHIVE', 0);
  });
  await page.getByRole('button', { name: 'Inspect ARCHIVE verified proof' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-controller-replay-requests', '1');
  await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('Replaying ARCHIVE');
  await page.evaluate(async () => {
    await window.__maltlineCompetitionControllerHarness!.resolveReplay(0, 'A');
  });
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  await expect(dialog).toContainText('INPUTS REPRODUCED');
  await expect(dialog).toContainText('0:30 active');
  const replayPosition = dialog.getByRole('slider', { name: 'Replay frame' });
  await expect(replayPosition).toHaveValue('0');
  await dialog.getByRole('button', { name: 'Next replay frame' }).click();
  await expect(replayPosition).toHaveValue('1');
  await page.getByText('Proof fingerprint').click();
  await expect(dialog).toContainText('4d40128df3c9eb5d01b95b5df717e9803fd1ccf44d2ae1f2fbd3d49099c9da18');
});

test('proof detail replaces a ten-row board and restores the initiating control', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.evaluate(() => {
    const harness = window.__maltlineCompetitionControllerHarness!;
    harness.startAttempt();
    harness.resolveChallenge(0, 'A');
    harness.openPanel();
    harness.resolveTenRowBoard(0);
  });
  const inspectFirst = page.getByRole('button', { name: 'Inspect SHIFT 1 verified proof' });
  await inspectFirst.click();
  const heading = page.getByRole('heading', { name: 'PROOF CHECK' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await page.evaluate(async () => {
    await window.__maltlineCompetitionControllerHarness!.resolveReplay(0, 'A');
  });
  await expect(page.getByText('✓ INPUTS REPRODUCED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to board' }).click();
  await expect(inspectFirst).toBeFocused();

  await page.getByRole('button', { name: 'Inspect SHIFT 10 verified proof' }).click();
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});

for (const outcome of ['success', 'failure'] as const) {
  test(`a closed proof inspection ignores stale ${outcome} after reopen`, async ({ page }) => {
    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.startAttempt();
      harness.resolveChallenge(0, 'A');
      harness.openPanel();
      harness.resolveBoard(0, 'ARCHIVE', 0);
    });
    const inspect = page.getByRole('button', { name: 'Inspect ARCHIVE verified proof' });
    await inspect.click();
    await page.getByRole('button', { name: 'Close competition panel' }).click();
    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.openPanel();
      harness.resolveBoard(1, 'CURRENT', 0);
    });
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('CURRENT');
    await page.evaluate(async (result) => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      if (result === 'success') await harness.resolveReplay(0, 'A');
      else harness.rejectReplay(0);
    }, outcome);
    const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
    await expect(dialog).toContainText('CURRENT');
    await expect(dialog).not.toContainText('PROOF CHECK');
  });
}

test('expired retained proof becomes a non-retryable ended window', async ({ page }) => {
  await page.evaluate(() => {
    const harness = window.__maltlineCompetitionControllerHarness!;
    harness.startAttempt();
    harness.resolveChallenge(0, 'A');
    harness.openPanel();
    harness.resolveBoard(0, 'ARCHIVE', 0);
  });
  await page.getByRole('button', { name: 'Inspect ARCHIVE verified proof' }).click();
  await page.evaluate(() => window.__maltlineCompetitionControllerHarness!.rejectReplayUnavailable(0));
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  await expect(dialog).toContainText('PROOF WINDOW ENDED');
  await expect(page.getByRole('button', { name: 'Retry proof inspection' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to board' }).click();
  await expect(dialog).toContainText('Window ended');
  await expect(page.getByRole('button', { name: 'Inspect ARCHIVE verified proof' })).toHaveCount(0);
});

test('a temporary retained-proof failure remains retryable', async ({ page }) => {
  await page.evaluate(() => {
    const harness = window.__maltlineCompetitionControllerHarness!;
    harness.startAttempt();
    harness.resolveChallenge(0, 'A');
    harness.openPanel();
    harness.resolveBoard(0, 'ARCHIVE', 0);
  });
  await page.getByRole('button', { name: 'Inspect ARCHIVE verified proof' }).click();
  await page.evaluate(() => window.__maltlineCompetitionControllerHarness!.rejectReplay(0));
  const retry = page.getByRole('button', { name: 'Retry proof inspection' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('html')).toHaveAttribute('data-controller-replay-requests', '2');
  await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('Replaying ARCHIVE');
});

test('a valid same-score proof cannot pass against different listed outcome details', async ({ page }) => {
  await page.evaluate(() => {
    const harness = window.__maltlineCompetitionControllerHarness!;
    harness.startAttempt();
    harness.resolveChallenge(0, 'A');
    harness.openPanel();
    harness.resolveMismatchedBoard(0, 'MISMATCH');
  });
  await page.getByRole('button', { name: 'Inspect MISMATCH verified proof' }).click();
  await page.evaluate(async () => {
    await window.__maltlineCompetitionControllerHarness!.resolveReplay(0, 'A');
  });
  const dialog = page.getByRole('dialog', { name: 'SHIFT BOARD' });
  await expect(dialog).toContainText('could not be replayed');
  await expect(dialog).not.toContainText('INPUTS REPRODUCED');
  await expect(page.getByRole('button', { name: 'Retry proof inspection' })).toBeVisible();
});

for (const outcome of ['success', 'failure'] as const) {
  test(`a restarted attempt ignores stale challenge ${outcome}`, async ({ page }) => {
    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.startAttempt();
      harness.startAttempt();
      harness.resolveChallenge(1, 'B');
    });
    await expect(page.locator('html')).toHaveAttribute('data-maltline-competition-challenge', 'ready');
    await page.evaluate((result) => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      if (result === 'success') harness.resolveChallenge(0, 'A');
      else harness.rejectChallenge(0);
    }, outcome);
    await expect(page.locator('html')).toHaveAttribute('data-maltline-competition-challenge', 'ready');

    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.terminalize();
      harness.openPanel();
      harness.resolveBoard(0, 'BOARD');
    });
    await page.getByRole('textbox', { name: 'Callsign' }).fill('TESTER');
    await page.getByRole('button', { name: 'Submit verified run' }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-controller-submitted-run-ids',
      'run_BBBBBBBBBBBBBBBB',
    );
  });
}

for (const outcome of ['success', 'failure'] as const) {
  test(`a replacement board request ignores stale ${outcome}`, async ({ page }) => {
    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.startAttempt();
      harness.resolveChallenge(0, 'A');
      harness.terminalize();
      harness.openPanel();
      harness.resolveBoard(0, 'BASE');
    });
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('BASE');
    await page.getByRole('button', { name: 'Refresh board' }).click();
    await page.getByRole('button', { name: 'Close competition panel' }).click();
    await page.evaluate(() => window.__maltlineCompetitionControllerHarness!.openPanel());
    await expect(page.locator('html')).toHaveAttribute('data-controller-board-requests', '3');
    await page.evaluate(() => window.__maltlineCompetitionControllerHarness!.resolveBoard(2, 'NEW'));
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('NEW');
    await page.evaluate((result) => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      if (result === 'success') harness.resolveBoard(1, 'OLD');
      else harness.rejectBoard(1);
    }, outcome);
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('NEW');
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).not.toContainText('OLD');
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).not.toContainText('BOARD OFFLINE');
  });
}

for (const outcome of ['success', 'failure'] as const) {
  test(`a restarted attempt ignores stale submit ${outcome}`, async ({ page }) => {
    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.startAttempt();
      harness.resolveChallenge(0, 'A');
      harness.terminalize(100);
      harness.openPanel();
      harness.resolveBoard(0, 'BASE');
    });
    await page.getByRole('textbox', { name: 'Callsign' }).fill('FIRST');
    await page.getByRole('button', { name: 'Submit verified run' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-controller-submit-requests', '1');

    await page.evaluate(() => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      harness.startAttempt();
      harness.resolveChallenge(1, 'B');
      harness.terminalize(200);
      harness.openPanel();
      harness.resolveBoard(1, 'BASE');
    });
    await page.getByRole('textbox', { name: 'Callsign' }).fill('SECOND');
    await page.getByRole('button', { name: 'Submit verified run' }).click();
    await page.evaluate(() => window.__maltlineCompetitionControllerHarness!.resolveSubmit(1, 'NEW', 250));
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('NEW');
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('250');

    await page.evaluate((result) => {
      const harness = window.__maltlineCompetitionControllerHarness!;
      if (result === 'success') harness.resolveSubmit(0, 'OLD', 50);
      else harness.rejectSubmit(0);
    }, outcome);
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).toContainText('NEW');
    await expect(page.getByRole('dialog', { name: 'SHIFT BOARD' })).not.toContainText('OLD');
    await expect(page.locator('html')).toHaveAttribute('data-maltline-competition-proof', 'submitted');
  });
}

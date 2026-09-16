import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { PartitionReplay } from '../../games/partition/src/core/types';
import { replayPartitionFrames } from '../../games/partition/src/core/replay';

test.use({ hasTouch: true });

async function openGame(page: Page) {
  await page.clock.install({ time: new Date('2026-09-17T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-17T12:00:00Z'));
  await page.goto('/games/partition/?mode=live&autostart=1&seed=11');
  await page.locator('#game').focus();
}
async function ticks(page: Page, count: number) {
  await page.clock.runFor(33 * count);
}
async function recordedReplay(page: Page): Promise<PartitionReplay> {
  await page.locator('#watch-run').evaluate((button: HTMLButtonElement) => button.click());
  const result = page.waitForEvent('download');
  await page.locator('#download-replay').click();
  const download = await result;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as PartitionReplay;
}

test('Space tap arms visibly, release does not cancel it, and recorded replay matches live trace input', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Space');
  await ticks(page, 12);
  await expect(page.locator('[data-trace]')).toHaveText('ARMED');
  await expect(page.locator('[data-trace]')).toHaveAttribute('aria-label', 'Trace armed. Steer into the field.');
  await page.keyboard.down('ArrowUp'); await ticks(page, 4); await page.keyboard.up('ArrowUp');
  await expect(page.locator('[data-trace]')).toHaveText('TRACE');
  const replay = await recordedReplay(page);
  expect(replay.finalState.spark.drawing).toBe(true);
  expect(replay.ticks.filter(tick => tick.events.some(event => event.type === 'trace_started'))).toHaveLength(1);
  expect(replayPartitionFrames(replay).at(-1)!.state).toEqual(replay.finalState);
});

test('four-second auto-launch preserves held Space and direction and arms the next stage once', async ({ page }) => {
  await openGame(page);
  // Two deterministic cuts stabilize 75% of seed 11's real opening campaign field.
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp');
  await ticks(page, 60);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('Space');
  await page.keyboard.down('ArrowRight'); await ticks(page, 24); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown'); await ticks(page, 60);
  await expect(page.locator('#message-countdown')).toContainText('IN 4');
  await expect(page.locator('#stage-field-label')).toContainText('01');
  // Hold a safe direction and Space throughout the completion screen.
  await page.keyboard.up('ArrowDown'); await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(3800);
  await expect(page.locator('#stage-field-label')).toContainText('01');
  await expect(page.locator('#message-countdown')).toContainText('IN 1');
  await page.clock.runFor(200);
  await expect(page.locator('#stage-field-label')).toContainText('02');
  await ticks(page, 6);
  await expect(page.locator('[data-trace]')).toHaveText('ARMED');
  await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowUp');
  await ticks(page, 4);
  const replay = await recordedReplay(page);
  expect(replay.scenario.id).toContain('02');
  expect(replay.ticks[0]!.input).toEqual({ direction: 'left', draw: 'fast' });
  expect(replay.finalState.spark.drawing).toBe(true);
  expect(replay.ticks.filter(tick => tick.events.some(event => event.type === 'trace_started'))).toHaveLength(1);
  expect(replayPartitionFrames(replay).at(-1)!.state).toEqual(replay.finalState);
});

test('compact touch TRACE tap stays armed after pointer release and accepts a separate direction tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await openGame(page);
  await page.locator('[data-trace]').tap();
  await ticks(page, 6);
  await expect(page.locator('[data-trace]')).toHaveText('ARMED');
  await page.locator('[data-direction=up]').tap();
  await ticks(page, 4);
  await expect(page.locator('[data-trace]')).toHaveText('TRACE');
  const replay = await recordedReplay(page);
  expect(replay.finalState.spark.drawing).toBe(true);
});

test('holding Enter on focused TRACE cannot re-arm after reconnection until a fresh activation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await openGame(page);
  const trace = page.locator('[data-trace]');
  const holdDirection = async (direction: string, count: number) => {
    await page.locator(`[data-direction=${direction}]`).hover();
    await page.mouse.down(); await ticks(page, count); await page.mouse.up();
  };
  await trace.focus();
  await page.keyboard.down('Enter');
  await ticks(page, 1);
  await expect(trace).toHaveText('ARMED');
  await holdDirection('up', 60);
  await expect(page.locator('#stage-capture')).toHaveText('50% / 75%');
  await expect(trace).toBeFocused();
  await expect(trace).toHaveText('TRACE');
  // Playwright marks a second keydown without keyup as a native repeat.
  await page.keyboard.down('Enter'); await ticks(page, 1);
  await expect(trace).toHaveText('TRACE');
  await holdDirection('right', 24);
  await page.keyboard.down('Enter');
  await holdDirection('down', 6);
  await expect(trace).toHaveText('TRACE');
  // A fresh native activation still works normally.
  await page.keyboard.up('Enter'); await page.keyboard.press('Enter');
  await ticks(page, 1); await expect(trace).toHaveText('ARMED');
  await holdDirection('down', 6);
  const replay = await recordedReplay(page);
  const starts = replay.ticks.filter(tick => tick.events.some(event => event.type === 'trace_started'));
  expect(starts).toHaveLength(2);
  expect(starts[1]!.tick).toBeGreaterThan(90);
  expect(replay.finalState.spark.drawing).toBe(true);
  expect(replayPartitionFrames(replay).at(-1)!.state).toEqual(replay.finalState);
});

test('TRACE retains assistive clicks and Space keyup activation while suppressing repeats', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await openGame(page);
  const trace = page.locator('[data-trace]');
  await trace.focus();
  await page.keyboard.down('Space'); await page.keyboard.down('Space');
  await ticks(page, 1); await expect(trace).toHaveText('TRACE');
  await page.keyboard.up('Space');
  await ticks(page, 1); await expect(trace).toHaveText('ARMED');
  // Mode changes intentionally clear input; a standalone AT activation then
  // needs no fake keyboard event to operate the same native control.
  await page.locator('#how-to-play').evaluate((button: HTMLButtonElement) => button.click());
  await ticks(page, 1); await expect(trace).toHaveText('TRACE');
  await trace.dispatchEvent('click', { detail: 0 });
  await ticks(page, 1); await expect(trace).toHaveText('ARMED');
});

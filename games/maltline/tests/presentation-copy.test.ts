import { describe, expect, it } from 'vitest';
import { activeChainText, stageClearBody } from '../src/viewer/presentation-copy';

describe('active-chain presentation copy', () => {
  it('uses a truthful count without multiplier language', () => {
    expect([0, 1, 2, 10, 11, 31].map(activeChainText)).toEqual([
      null, null, 'CHAIN 2', 'CHAIN 10', 'CHAIN 11', 'CHAIN 31',
    ]);
    expect([2, 10, 11, 31].map(activeChainText).join(' ')).not.toMatch(/STREAK|×/u);
  });
});

describe('stage-clear presentation copy', () => {
  it('reports walkouts without claiming the whole line was served', () => {
    const copy = stageClearBody({
      fulfilled: 7, exited: 7, walkouts: 1, resolved: 8, score: 1_275, lives: 2,
    }, 500);
    expect(copy).toBe('Window closed: 7 orders fulfilled. Final outcomes: 7 happy exits, 1 walkout (8 resolved). Bonus +500 — score 1275, 2 lives left.');
    expect(copy).not.toContain('served');
  });

  it('reports a clean stage and singular life accurately', () => {
    expect(stageClearBody({
      fulfilled: 8, exited: 8, walkouts: 0, resolved: 8, score: 1_500, lives: 1,
    }, 250)).toBe('Window closed: 8 orders fulfilled. Final outcomes: 8 happy exits, no walkouts (8 resolved). Bonus +250 — score 1500, 1 life left.');
  });

  it('keeps fulfillment separate when a served customer later walks out', () => {
    expect(stageClearBody({
      fulfilled: 8, exited: 7, walkouts: 1, resolved: 8, score: 1_500, lives: 1,
    }, 250)).toContain('8 orders fulfilled. Final outcomes: 7 happy exits, 1 walkout');
  });
});

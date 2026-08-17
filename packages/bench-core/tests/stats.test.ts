import { describe, expect, it } from 'vitest';
import { aggregate } from '../src';

describe('aggregate', () => {
  it('reports sample statistics without best-of selection', () => {
    const stats = aggregate([1, 2, 3]);
    expect(stats.mean).toBe(2);
    expect(stats.count).toBe(3);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(3);
    expect(stats.confidence95[0]).toBeLessThan(stats.mean);
  });
});


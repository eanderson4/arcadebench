import { describe, expect, it } from 'vitest';
import { deterministicCallsignReview } from '../src/moderation';

describe('server callsign prefilter', () => {
  it('normalizes ordinary public callsigns', () => {
    expect(deterministicCallsignReview('  Spark   Pilot  ')).toEqual({
      allowed: true,
      normalizedName: 'Spark Pilot',
    });
  });

  it('rejects links, invisibles, profanity, and common leetspeak evasions', () => {
    for (const candidate of ['www.example.org', `safe\u200bname`, 'shit', 'sh1t', '4uck', 'f_u_c_k']) {
      expect(deterministicCallsignReview(candidate).allowed, candidate).toBe(false);
    }
  });
});

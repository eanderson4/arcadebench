import { describe, expect, it } from 'vitest';
import { deterministicCallsignReview, parseModelDecision } from '../src/moderation';

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

describe('model callsign decision', () => {
  it('derives the allow decision from the single model category', () => {
    expect(parseModelDecision({ category: 'clean' })).toEqual({
      allowed: true,
      category: 'clean',
    });
    expect(parseModelDecision({ category: 'personal_information' })).toEqual({
      allowed: false,
      category: 'personal_information',
    });
  });

  it('rejects malformed or unknown model output', () => {
    expect(parseModelDecision({ category: 'invented' })).toBeUndefined();
    expect(parseModelDecision('not JSON')).toBeUndefined();
  });
});

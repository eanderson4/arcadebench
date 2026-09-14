import { describe, expect, it } from 'vitest';
import type { ArcadeBenchEnv } from '../src/env';
import { ApiError } from '../src/http';
import {
  admitMaltlineExpensiveRequest,
  maltlineAdmissionKey,
} from '../src/maltline-admission';

function request(headers?: HeadersInit): Request {
  return new Request('https://arcadebench.org/api/v1/games/maltline/runs', { headers });
}

function admissionEnv(
  limit: RateLimit['limit'],
): Pick<ArcadeBenchEnv, 'COOKIE_SIGNING_SECRET' | 'MALTLINE_ADMISSION_RATE_LIMITER'> {
  return {
    MALTLINE_ADMISSION_RATE_LIMITER: { limit },
    COOKIE_SIGNING_SECRET: 'test-only-cookie-secret-with-at-least-32-characters',
  };
}

describe('Maltline edge admission', () => {
  it('keys on the edge network address and route class, never the session cookie', async () => {
    const first = request({
      'cf-connecting-ip': '2001:DB8::10',
      cookie: 'ab_session=first',
    });
    const rotated = request({
      'cf-connecting-ip': '2001:db8::10',
      cookie: 'ab_session=rotated',
    });

    const secret = 'test-only-cookie-secret-with-at-least-32-characters';
    await expect(maltlineAdmissionKey(first, 'ranked-write', secret))
      .resolves.toBe(await maltlineAdmissionKey(rotated, 'ranked-write', secret));
    await expect(maltlineAdmissionKey(first, 'proof-read', secret))
      .resolves.not.toBe(await maltlineAdmissionKey(first, 'ranked-write', secret));
    await expect(maltlineAdmissionKey(
      request({ 'cf-connecting-ip': '203.0.113.8' }),
      'ranked-write',
      secret,
    )).resolves.not.toBe(await maltlineAdmissionKey(first, 'ranked-write', secret));
  });

  it.each([undefined, 'not-an-address'])(
    'fails closed on an unavailable edge network address %s',
    async (address) => {
      const headers = address === undefined ? undefined : { 'cf-connecting-ip': address };
      await expect(maltlineAdmissionKey(
        request(headers),
        'proof-read',
        'test-only-cookie-secret-with-at-least-32-characters',
      )).rejects.toMatchObject({ status: 503 });
    },
  );

  it('returns a retryable 429 with a one-minute retry boundary', async () => {
    const keys: string[] = [];
    try {
      await admitMaltlineExpensiveRequest(
        request({ 'cf-connecting-ip': '203.0.113.8' }),
        admissionEnv(async ({ key }) => {
          keys.push(key);
          return { success: false };
        }),
        'ranked-write',
      );
      throw new Error('Expected Maltline admission to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 429 });
      expect(new Headers((error as ApiError).headers).get('retry-after')).toBe('60');
    }
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('203.0.113.8');
  });

  it.each(['missing', 'fault'] as const)('fails closed when the limiter is %s', async (mode) => {
    const env = mode === 'missing'
      ? {
          COOKIE_SIGNING_SECRET: 'test-only-cookie-secret-with-at-least-32-characters',
        } as Pick<ArcadeBenchEnv, 'COOKIE_SIGNING_SECRET' | 'MALTLINE_ADMISSION_RATE_LIMITER'>
      : admissionEnv(async () => { throw new Error('injected limiter fault'); });
    await expect(admitMaltlineExpensiveRequest(request(), env, 'proof-read'))
      .rejects.toMatchObject({ status: 503 });
  });

  it('does not call the limiter when trusted network identity is missing', async () => {
    let calls = 0;
    await expect(admitMaltlineExpensiveRequest(
      request(),
      admissionEnv(async () => {
        calls++;
        return { success: true };
      }),
      'ranked-write',
    )).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { canonicalStringify, hmac, sha256Hex, verifyHmac } from '../src/crypto';

describe('platform cryptographic helpers', () => {
  it('canonicalizes object key order for immutable replay identity', () => {
    expect(canonicalStringify({ z: 2, a: { y: 1, x: 0 } }))
      .toBe('{"a":{"x":0,"y":1},"z":2}');
  });

  it('hashes and authenticates without exposing the signing secret', async () => {
    const secret = 'test-only-cookie-secret-with-at-least-32-characters';
    const signature = await hmac('anon_test', secret);
    expect(await verifyHmac('anon_test', signature, secret)).toBe(true);
    expect(await verifyHmac('anon_other', signature, secret)).toBe(false);
    expect(await sha256Hex('arcade')).toMatch(/^[a-f0-9]{64}$/u);
  });
});

import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleV2Api } from '../src/v2-api';
import { maltlinePlatformAdapter } from '../src/maltline-platform-adapter';
import { registerGameAdapter } from '../src/shared/registry';
import type { ArcadeBenchEnv } from '../src/env';

const ORIGIN = 'https://arcadebench.org';
function request(path: string) {
  return new Request(`${ORIGIN}/api/v2/games/maltline/${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.60', origin: ORIGIN },
    body: JSON.stringify({ gameVersion: 'cabinet-2', boardId: 'arcade', context: {} }) });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  registerGameAdapter(maltlinePlatformAdapter);
  await env.DB.batch([
    env.DB.prepare("UPDATE seasons SET state = 'archived' WHERE game_id = 'maltline'"),
    env.DB.prepare("UPDATE seasons SET state = 'active' WHERE id = 'maltline-cabinet-2'"),
  ]);
});

describe('registered v2 cabinet admission before storage', () => {
  it.each(['runs', 'leaderboards/arcade'])('denies %s before session, storage or body parsing', async path => {
    const prepare = vi.fn(() => { throw new Error('Admission must happen before D1'); });
    const put = vi.fn(() => { throw new Error('Admission must happen before R2'); });
    const input = request(path);
    const limited = { ...env, DB: { prepare }, REPLAYS: { put },
      MALTLINE_ADMISSION_RATE_LIMITER: { limit: async () => ({ success: false }) } } as unknown as ArcadeBenchEnv;
    await expect(handleV2Api(input, limited)).rejects.toMatchObject({ status: 429 });
    expect(prepare).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(input.bodyUsed).toBe(false);
  });

  it.each(['missing', 'failure', 'no-address'])('fails closed when admission has %s', async mode => {
    const prepare = vi.fn(() => { throw new Error('No session may be allocated'); });
    const input = request('runs');
    if (mode === 'no-address') input.headers.delete('cf-connecting-ip');
    const limited = { ...env, DB: { prepare }, MALTLINE_ADMISSION_RATE_LIMITER: mode === 'missing'
      ? undefined : { limit: async () => { throw new Error('Binding fault'); } } } as unknown as ArcadeBenchEnv;
    await expect(handleV2Api(input, limited)).rejects.toMatchObject({ status: 503 });
    expect(prepare).not.toHaveBeenCalled();
    expect(input.bodyUsed).toBe(false);
  });

  it('accepts a network-admitted current cabinet challenge', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const response = await handleV2Api(request('runs'), { ...env, MALTLINE_ADMISSION_RATE_LIMITER: { limit } });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ gameVersion: 'cabinet-2', id: expect.stringMatching(/^run_/) });
    expect(limit).toHaveBeenCalledOnce();
    expect(limit.mock.calls[0]).not.toContain('203.0.113.60');
  });

  it('keeps leaderboard reads session-free and independent of ranked-write admission', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const response = await handleV2Api(new Request(`${ORIGIN}/api/v2/games/maltline/leaderboards/arcade`),
      { ...env, MALTLINE_ADMISSION_RATE_LIMITER: { limit } });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(limit).not.toHaveBeenCalled();
  });
});

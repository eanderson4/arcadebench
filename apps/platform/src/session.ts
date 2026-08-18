import type { ArcadeBenchEnv } from './env';
import { ApiError } from './http';
import { hmac, randomId, verifyHmac } from './crypto';

const COOKIE_NAME = 'ab_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export interface AnonymousSession {
  id: string;
  setCookie?: string;
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function sessionCookie(value: string): string {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

async function createSession(env: ArcadeBenchEnv, now: string): Promise<AnonymousSession> {
  if (!env.COOKIE_SIGNING_SECRET || env.COOKIE_SIGNING_SECRET.length < 32) {
    throw new ApiError(503, 'Arcade services are temporarily unavailable.');
  }
  const id = randomId('anon');
  const signature = await hmac(id, env.COOKIE_SIGNING_SECRET);
  await env.DB.prepare(
    'INSERT INTO anonymous_sessions (id, created_at, last_seen_at) VALUES (?, ?, ?)',
  ).bind(id, now, now).run();
  return { id, setCookie: sessionCookie(`${id}.${signature}`) };
}

export async function anonymousSession(request: Request, env: ArcadeBenchEnv): Promise<AnonymousSession> {
  const now = new Date().toISOString();
  const value = cookieValue(request, COOKIE_NAME);
  if (value) {
    const separator = value.lastIndexOf('.');
    const id = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    if (/^anon_[A-Za-z0-9_-]{16}$/u.test(id)
      && await verifyHmac(id, signature, env.COOKIE_SIGNING_SECRET)) {
      const existing = await env.DB.prepare('SELECT id FROM anonymous_sessions WHERE id = ?').bind(id).first();
      if (existing) return { id };
    }
  }
  return createSession(env, now);
}

export function attachSessionCookie(response: Response, session: AnonymousSession): Response {
  if (!session.setCookie) return response;
  const copy = new Response(response.body, response);
  copy.headers.append('set-cookie', session.setCookie);
  return copy;
}

export async function enforceRateLimit(
  env: ArcadeBenchEnv,
  sessionId: string,
  action: string,
  limit: number,
  expensive = false,
): Promise<void> {
  const edgeLimiter = expensive ? env.EXPENSIVE_RATE_LIMITER : env.API_RATE_LIMITER;
  if (edgeLimiter && !(await edgeLimiter.limit({ key: sessionId })).success) {
    throw new ApiError(429, 'Slow down for a moment, then try again.');
  }
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const row = await env.DB.prepare(`
    INSERT INTO rate_windows (session_id, action, window_start, request_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (session_id, action, window_start)
    DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(sessionId, action, windowStart).first<{ request_count: number }>();
  if (!row || row.request_count > limit) throw new ApiError(429, 'Slow down for a moment, then try again.');
}

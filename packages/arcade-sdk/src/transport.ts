export const ARCADEBENCH_SDK_VERSION = '0.1.0';

export class ArcadeBenchApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ArcadeBenchApiError';
  }
}

export function requiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function segment(value: string, label: string): string {
  return encodeURIComponent(requiredIdentifier(value, label));
}

/**
 * Shared request plumbing for the v1 and v2 clients: same-origin cookies, the
 * SDK version header, and never an authorization header. The browser client
 * holds no platform credential.
 */
export async function requestJson<ResponseBody>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<ResponseBody> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('x-arcadebench-client', ARCADEBENCH_SDK_VERSION);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (response.ok) throw new ArcadeBenchApiError(response.status, 'ArcadeBench returned invalid JSON.');
    }
  }
  if (!response.ok) {
    const reason = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `ArcadeBench request failed (${response.status}).`;
    throw new ArcadeBenchApiError(response.status, reason);
  }
  return body as ResponseBody;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  responseHeaders.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export async function readJson(request: Request, maximumBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('JSON byte limit must be a positive safe integer.');
  }
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLocaleLowerCase() !== 'identity') {
    throw new ApiError(415, 'Compressed request bodies are not supported.');
  }
  const declaredHeader = request.headers.get('content-length');
  if (declaredHeader !== null && !/^\d+$/u.test(declaredHeader)) {
    throw new ApiError(400, 'Content-Length is invalid.');
  }
  const declaredLength = declaredHeader === null ? null : Number(declaredHeader);
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength > maximumBytes)) {
    throw new ApiError(413, 'This submission is too large.');
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel('request body exceeds byte limit');
        throw new ApiError(413, 'This submission is too large.');
      }
      chunks.push(result.value);
    }
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError(400, 'Request body must be valid UTF-8 JSON.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
}

export function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, label: string, maximumLength = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new ApiError(400, `${label} is invalid.`);
  }
  return value;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, 'Cross-origin writes are not allowed.');
  }
}

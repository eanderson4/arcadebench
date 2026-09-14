import { describe, expect, it } from 'vitest';
import { ApiError, readJson } from '../src/http';

function streamRequest(chunks: readonly Uint8Array[], headers?: HeadersInit): Request {
  let index = 0;
  return new Request('https://arcadebench.org/api/test', {
    method: 'POST',
    headers,
    body: new ReadableStream({
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    }),
  });
}

async function expectApiError(promise: Promise<unknown>, status: number): Promise<void> {
  try {
    await promise;
    throw new Error('Expected readJson to reject.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
  }
}

describe('bounded JSON transport', () => {
  it('accepts an exact-limit body split across arbitrary stream chunks', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"ok":true}');
    const request = streamRequest([
      bytes.slice(0, 1),
      bytes.slice(1, 7),
      bytes.slice(7),
    ]);

    await expect(readJson(request, bytes.byteLength)).resolves.toEqual({ ok: true });
  });

  it('rejects a streamed body on the first byte over the decoded limit', async () => {
    const bytes = new TextEncoder().encode('{"ok":true}');
    await expectApiError(readJson(streamRequest([bytes]), bytes.byteLength - 1), 413);
  });

  it('rejects an oversized declared body before consuming its stream', async () => {
    const request = new Request('https://arcadebench.org/api/test', {
      method: 'POST',
      headers: { 'content-length': '101' },
      body: new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('{}'));
          controller.close();
        },
      }),
    });

    await expectApiError(readJson(request, 100), 413);
    expect(request.bodyUsed).toBe(false);
  });

  it.each(['gzip', 'br', 'deflate'])('rejects unsupported %s encoding', async (encoding) => {
    const request = streamRequest([new TextEncoder().encode('{}')], {
      'content-encoding': encoding,
    });
    await expectApiError(readJson(request, 100), 415);
  });

  it('accepts an explicit identity encoding', async () => {
    await expect(readJson(streamRequest([new TextEncoder().encode('{}')], {
      'content-encoding': 'identity',
    }), 2)).resolves.toEqual({});
  });

  it.each(['-1', '1.5', 'NaN'])('rejects invalid Content-Length %s', async (length) => {
    const request = streamRequest([new TextEncoder().encode('{}')], {
      'content-length': length,
    });
    await expectApiError(readJson(request, 100), 400);
  });

  it('rejects malformed UTF-8 before JSON parsing', async () => {
    await expectApiError(readJson(streamRequest([
      new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]),
    ]), 100), 400);
  });

  it('rejects malformed and empty JSON', async () => {
    await expectApiError(readJson(streamRequest([new TextEncoder().encode('{')]), 100), 400);
    await expectApiError(readJson(streamRequest([]), 100), 400);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid byte budget %s as a server configuration error',
    async (limit) => {
      await expect(readJson(streamRequest([new TextEncoder().encode('{}')]), limit))
        .rejects.toThrow(/positive safe integer/u);
    },
  );
});

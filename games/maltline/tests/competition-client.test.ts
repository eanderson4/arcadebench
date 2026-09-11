import { afterEach, describe, expect, it, vi } from 'vitest';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { verifyAndHashMaltlineProof } from '../src/core/proof';
import { GENERATION_2_LOSS_PROOF } from '../src/testing/generation-2-proofs';
import {
  MAX_MALTLINE_COMPETITION_RESPONSE_BYTES,
  MaltlineCompetitionApiError,
  MaltlineCompetitionClient,
  MaltlineCompetitionProtocolError,
  MaltlineCompetitionTimeoutError,
  type MaltlineCompetitionFetch,
} from '../src/viewer/competition-client';

const challenge = {
  id: 'run_ABCDEFGHIJKLMNOP',
  nonce: 0x1234_5678,
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  gameVersion: '0.1.0',
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
  proofSchemaVersion: 1,
  envelopeVersion: 3,
  expiresAt: '2026-09-10T20:30:00.000Z',
} as const;

const score = {
  id: 'score_ABCDEFGHIJKLMNOP',
  name: 'MALT TEST',
  score: 0,
  lives: 0,
  stageReached: 1,
  stagesCleared: 0,
  completed: false,
  totalTicks: 1_854,
  fulfilled: 0,
  serviceActions: 0,
  walkouts: 4,
  resolved: 4,
  exited: 4,
  createdAt: '2026-09-10T18:00:00.000Z',
  proofAvailable: true,
} as const;

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function rawJsonResponse(value: BodyInit, status = 200, headers?: HeadersInit): Response {
  return new Response(value, {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function oneResponse(response: Response): {
  client: MaltlineCompetitionClient;
  fetcher: ReturnType<typeof vi.fn<MaltlineCompetitionFetch>>;
} {
  const fetcher = vi.fn<MaltlineCompetitionFetch>().mockResolvedValue(response);
  return { client: new MaltlineCompetitionClient(fetcher), fetcher };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Maltline competition client requests', () => {
  it('begins a run through an exact same-origin JSON request and parses its authority', async () => {
    const { client, fetcher } = oneResponse(jsonResponse(challenge, 201));

    await expect(client.beginRun()).resolves.toEqual(challenge);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/v1/games/maltline/runs');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(new Headers(init?.headers)).toMatchObject(expect.any(Headers));
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ gameVersion: '0.1.0', boardId: 'arcade' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('lists a bounded page with an encoded relative query and no request body', async () => {
    const { client, fetcher } = oneResponse(jsonResponse({
      entries: [score],
      nextCursor: 'b2Zmc2V0OjI1',
    }));

    await expect(client.listScores({ limit: 25, cursor: 'b2Zmc2V0OjA' })).resolves.toEqual({
      entries: [score],
      nextCursor: 'b2Zmc2V0OjI1',
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      '/api/v1/games/maltline/leaderboards/arcade?limit=25&cursor=b2Zmc2V0OjA',
    );
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('content-type')).toBeNull();
  });

  it('loads and independently verifies a retained proof envelope', async () => {
    const retained = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
      runId: challenge.id,
      seasonId: challenge.seasonId,
      boardId: challenge.boardId,
      nonce: challenge.nonce,
      authority: challenge.authority,
    });
    const { client, fetcher } = oneResponse(rawJsonResponse(retained.canonicalJson));
    const playback = await client.loadReplay(score.id);
    expect(playback.verification).toEqual(retained);
    expect(playback.stages).toHaveLength(1);
    expect(playback.frameAtOrdinal(playback.frameCount - 1).state).toMatchObject({
      status: 'lost',
      score: retained.envelope.summary.score,
      lives: retained.envelope.summary.lives,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`/api/v1/games/maltline/replays/${score.id}`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
  });

  it('rejects malformed retained IDs and verifier-inconsistent envelopes', async () => {
    const fetcher = vi.fn<MaltlineCompetitionFetch>();
    await expect(new MaltlineCompetitionClient(fetcher).loadReplay('score_bad'))
      .rejects.toThrow(/score ID/u);
    expect(fetcher).not.toHaveBeenCalled();

    const retained = await verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, {
      runId: challenge.id,
      seasonId: challenge.seasonId,
      boardId: challenge.boardId,
      nonce: challenge.nonce,
      authority: challenge.authority,
    });
    const tampered = structuredClone(retained.envelope);
    tampered.summary.score = 1;
    await expect(oneResponse(jsonResponse(tampered)).client.loadReplay(score.id))
      .rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });

  it.each([
    [200, 'ready'],
    [201, 'ready'],
    [202, 'pending'],
  ] as const)('models submission status %s as %s', async (status, proofState) => {
    const { client, fetcher } = oneResponse(jsonResponse({ entry: score, proofState }, status));

    await expect(client.submitScore(
      challenge.id,
      score.name,
      GENERATION_2_LOSS_PROOF,
    )).resolves.toEqual({ status, proofState, entry: score });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/v1/games/maltline/leaderboards/arcade');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      gameVersion: '0.1.0',
      runId: challenge.id,
      playerName: score.name,
      proof: GENERATION_2_LOSS_PROOF,
    });
  });

  it('validates list and submit arguments before calling fetch', async () => {
    const fetcher = vi.fn<MaltlineCompetitionFetch>();
    const client = new MaltlineCompetitionClient(fetcher);

    await expect(client.listScores({ limit: 0 })).rejects.toThrow(/limit/u);
    await expect(client.listScores({ limit: 1.5 })).rejects.toThrow(/limit/u);
    await expect(client.listScores({ cursor: 'bad=' })).rejects.toThrow(/cursor/u);
    await expect(client.submitScore('not-a-run', score.name, GENERATION_2_LOSS_PROOF))
      .rejects.toThrow(/run ID/u);
    await expect(client.submitScore(challenge.id, '', GENERATION_2_LOSS_PROOF))
      .rejects.toThrow(/player name/u);
    const unsafeProof = clone(GENERATION_2_LOSS_PROOF);
    unsafeProof.stages[0]!.inputRuns[0]!.ticks = Number.POSITIVE_INFINITY;
    await expect(client.submitScore(challenge.id, score.name, unsafeProof))
      .rejects.toThrow(/finite safe integers/u);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('strict response contracts', () => {
  it.each([
    ['extra challenge field', { ...challenge, score: 100 }],
    ['missing challenge field', (({ expiresAt: _unused, ...rest }) => rest)(challenge)],
    ['fractional nonce', { ...challenge, nonce: 1.5 }],
    ['unsafe nonce', { ...challenge, nonce: 0x1_0000_0000 }],
    ['old proof schema', { ...challenge, proofSchemaVersion: 2 }],
    ['old envelope', { ...challenge, envelopeVersion: 2 }],
    ['wrong season', { ...challenge, seasonId: 'maltline-generation-3' }],
    ['wrong board', { ...challenge, boardId: 'daily' }],
    ['wrong rules', {
      ...challenge,
      authority: { ...challenge.authority, rulesetVersion: 99 },
    }],
    ['wrong digest', {
      ...challenge,
      authority: { ...challenge.authority, configurationSha256: '0'.repeat(64) },
    }],
    ['noncanonical expiry', { ...challenge, expiresAt: '2026-09-10T20:30:00Z' }],
  ])('rejects %s', async (_label, malformed) => {
    const { client } = oneResponse(jsonResponse(malformed, 201));
    await expect(client.beginRun()).rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });

  it.each([
    ['extra entry field', { ...score, rank: 1 }],
    ['missing entry field', (({ exited: _unused, ...rest }) => rest)(score)],
    ['unsafe score', { ...score, score: Number.MAX_SAFE_INTEGER + 1 }],
    ['fractional ticks', { ...score, totalTicks: 1.5 }],
    ['string boolean', { ...score, completed: 'false' }],
    ['inconsistent progress', { ...score, stagesCleared: 1 }],
    ['overlong scalar name', { ...score, name: '😀'.repeat(17) }],
    ['invalid timestamp', { ...score, createdAt: 'yesterday' }],
    ['string proof availability', { ...score, proofAvailable: 'true' }],
  ])('rejects leaderboard responses with an %s', async (_label, malformed) => {
    const { client } = oneResponse(jsonResponse({ entries: [malformed] }));
    await expect(client.listScores()).rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });

  it('rejects nonfinite JSON numbers, oversized pages, bad cursors, and page extras', async () => {
    const nonfinite = JSON.stringify({ entries: [score] }).replace('"score":0', '"score":1e309');
    await expect(oneResponse(rawJsonResponse(nonfinite)).client.listScores())
      .rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);

    await expect(oneResponse(jsonResponse({ entries: Array(51).fill(score) })).client.listScores())
      .rejects.toThrow(/entries/u);
    await expect(oneResponse(jsonResponse({ entries: [], nextCursor: 'bad=' })).client.listScores())
      .rejects.toThrow(/cursor/u);
    await expect(oneResponse(jsonResponse({ entries: [], total: 0 })).client.listScores())
      .rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });

  it.each([
    [202, 'ready'],
    [200, 'pending'],
    [201, 'pending'],
  ] as const)('rejects cross-contract submission status %s with state %s', async (status, proofState) => {
    const { client } = oneResponse(jsonResponse({ entry: score, proofState }, status));
    await expect(client.submitScore(challenge.id, score.name, GENERATION_2_LOSS_PROOF))
      .rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });

  it('rejects success bodies under the wrong endpoint status', async () => {
    await expect(oneResponse(jsonResponse(challenge, 200)).client.beginRun())
      .rejects.toThrow(/unexpected status 200/u);
    await expect(oneResponse(jsonResponse({ entries: [] }, 201)).client.listScores())
      .rejects.toThrow(/unexpected status 201/u);
  });

  it('turns an exact structured error into a typed API error with bounded retry timing', async () => {
    const { client } = oneResponse(jsonResponse(
      { error: 'Slow down for a moment.' },
      429,
      { 'retry-after': '60' },
    ));
    try {
      await client.beginRun();
      expect.fail('Expected a structured API error.');
    } catch (error) {
      expect(error).toBeInstanceOf(MaltlineCompetitionApiError);
      expect(error).toMatchObject({
        name: 'MaltlineCompetitionApiError',
        status: 429,
        apiMessage: 'Slow down for a moment.',
        message: 'Slow down for a moment.',
        retryAfterSeconds: 60,
      });
    }
  });

  it.each([undefined, '0', '-1', '1.5', '3601', 'tomorrow'])(
    'treats a missing or invalid Retry-After %s as optional metadata',
    async (retryAfter) => {
      const headers = retryAfter === undefined ? undefined : { 'retry-after': retryAfter };
      const { client } = oneResponse(jsonResponse({ error: 'Busy.' }, 429, headers));
      await expect(client.beginRun()).rejects.toMatchObject({
        status: 429,
        retryAfterSeconds: undefined,
      });
    },
  );

  it('preserves a recognized machine-readable API error code', async () => {
    const { client } = oneResponse(jsonResponse({
      error: 'Choose another callsign.',
      code: 'maltline_callsign_rejected',
    }, 400));
    await expect(client.beginRun()).rejects.toMatchObject({
      name: 'MaltlineCompetitionApiError',
      status: 400,
      apiMessage: 'Choose another callsign.',
      code: 'maltline_callsign_rejected',
    });
  });

  it.each([
    { error: '' },
    { error: 'no', retryAfter: 10 },
    { message: 'no' },
    { error: 42 },
    { error: 'no', code: 'unknown_error' },
    { error: 'no', code: 'maltline_proof_invalid', detail: 'extra' },
  ])('rejects malformed structured errors %#', async (body) => {
    const { client } = oneResponse(jsonResponse(body, 400));
    await expect(client.beginRun()).rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });

  it('rejects a recognized error code under an invalid status', async () => {
    const { client } = oneResponse(jsonResponse({
      error: 'Wrong status.',
      code: 'maltline_proof_invalid',
    }, 503));
    await expect(client.beginRun()).rejects.toBeInstanceOf(MaltlineCompetitionProtocolError);
  });
});

describe('bounded response transport', () => {
  it('requires a JSON media type and valid JSON UTF-8', async () => {
    await expect(oneResponse(new Response(JSON.stringify(challenge), {
      status: 201,
      headers: { 'content-type': 'text/plain' },
    })).client.beginRun()).rejects.toThrow(/application\/json/u);

    await expect(oneResponse(rawJsonResponse('{')).client.beginRun())
      .rejects.toThrow(/valid JSON/u);
    await expect(oneResponse(rawJsonResponse(new Uint8Array([0x7b, 0xff, 0x7d]))).client.beginRun())
      .rejects.toThrow(/valid UTF-8/u);
  });

  it('rejects oversized declared and streamed bodies', async () => {
    const declared = rawJsonResponse('{}', 201, {
      'content-length': String(MAX_MALTLINE_COMPETITION_RESPONSE_BYTES + 1),
    });
    await expect(oneResponse(declared).client.beginRun()).rejects.toThrow(/byte limit/u);

    const bytes = new Uint8Array(MAX_MALTLINE_COMPETITION_RESPONSE_BYTES + 1);
    const streamed = rawJsonResponse(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }), 201);
    await expect(oneResponse(streamed).client.beginRun()).rejects.toThrow(/byte limit/u);
  });

  it.each(['-1', '1.5', 'NaN'])('rejects invalid response Content-Length %s', async (length) => {
    const { client } = oneResponse(rawJsonResponse('{}', 201, { 'content-length': length }));
    await expect(client.beginRun()).rejects.toThrow(/Content-Length/u);
  });
});

describe('abort and timeout lifecycle', () => {
  it('clears its timeout after a successful response', async () => {
    vi.useFakeTimers();
    const { client } = oneResponse(jsonResponse(challenge, 201));
    await expect(client.beginRun({ timeoutMs: 25 })).resolves.toEqual(challenge);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a timed-out fetch, reports a typed timeout, and clears its timer', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetcher: MaltlineCompetitionFetch = (_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => reject(capturedSignal?.reason), { once: true });
      });
    };
    const client = new MaltlineCompetitionClient(fetcher);
    const request = client.beginRun({ timeoutMs: 25 });
    const rejection = expect(request).rejects.toMatchObject({
      name: 'MaltlineCompetitionTimeoutError',
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(capturedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await expect(request).rejects.toBeInstanceOf(MaltlineCompetitionTimeoutError);
  });

  it('relays an external abort and removes the outstanding timeout', async () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const reason = new DOMException('navigation', 'AbortError');
    const fetcher: MaltlineCompetitionFetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    const client = new MaltlineCompetitionClient(fetcher);
    const request = client.beginRun({ signal: external.signal, timeoutMs: 1_000 });
    const rejection = expect(request).rejects.toBe(reason);

    external.abort(reason);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 1.5, 120_001])('rejects invalid timeout %s before fetch', async (timeoutMs) => {
    const fetcher = vi.fn<MaltlineCompetitionFetch>();
    const client = new MaltlineCompetitionClient(fetcher);
    await expect(client.beginRun({ timeoutMs })).rejects.toThrow(/timeout/u);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

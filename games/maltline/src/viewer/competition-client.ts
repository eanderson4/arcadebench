import {
  MALTLINE_GENERATION_2_AUTHORITY,
  type MaltlineAuthorityIdentity,
} from '../core/authority';
import {
  MALTLINE_PROOF_ENVELOPE_VERSION,
  MaltlineProofError,
  type MaltlineRunProof,
} from '../core/proof';
import {
  createVerifiedMaltlinePlayback,
  type VerifiedMaltlinePlayback,
} from '../core/playback';

export const MALTLINE_COMPETITION_API_PREFIX = '/api/v1/games/maltline' as const;
export const MALTLINE_COMPETITION_GAME_VERSION = '0.1.0' as const;
export const MAX_MALTLINE_COMPETITION_RESPONSE_BYTES = 128 * 1_024;
export const MAX_MALTLINE_COMPETITION_REQUEST_BYTES = 1_600_000;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 120_000;
const GENERATION_2_SEASON_ID = 'maltline-generation-2';
const ENTRY_KEYS = [
  'id',
  'name',
  'score',
  'lives',
  'stageReached',
  'stagesCleared',
  'completed',
  'totalTicks',
  'fulfilled',
  'serviceActions',
  'walkouts',
  'resolved',
  'exited',
  'createdAt',
  'proofAvailable',
] as const;

export type MaltlineCompetitionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface MaltlineCompetitionRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface MaltlineCompetitionClientOptions {
  timeoutMs?: number;
}

export interface MaltlineCompetitionChallenge {
  id: string;
  nonce: number;
  seasonId: typeof GENERATION_2_SEASON_ID;
  boardId: 'arcade';
  gameVersion: typeof MALTLINE_COMPETITION_GAME_VERSION;
  authority: MaltlineAuthorityIdentity;
  proofSchemaVersion: typeof MALTLINE_GENERATION_2_AUTHORITY.proofSchemaVersion;
  envelopeVersion: typeof MALTLINE_PROOF_ENVELOPE_VERSION;
  expiresAt: string;
}

export interface MaltlineCompetitionScore {
  id: string;
  name: string;
  score: number;
  lives: number;
  stageReached: number;
  stagesCleared: number;
  completed: boolean;
  totalTicks: number;
  fulfilled: number;
  serviceActions: number;
  walkouts: number;
  resolved: number;
  exited: number;
  createdAt: string;
  proofAvailable: boolean;
}

export interface MaltlineCompetitionScorePage {
  entries: MaltlineCompetitionScore[];
  nextCursor?: string;
}

export interface MaltlineListScoresOptions extends MaltlineCompetitionRequestOptions {
  limit?: number;
  cursor?: string;
}

export interface MaltlineReadySubmission {
  status: 200 | 201;
  proofState: 'ready';
  entry: MaltlineCompetitionScore;
}

export interface MaltlinePendingSubmission {
  status: 202;
  proofState: 'pending';
  entry: MaltlineCompetitionScore;
}

export type MaltlineSubmissionResult = MaltlineReadySubmission | MaltlinePendingSubmission;

export type MaltlineCompetitionErrorCode =
  | 'maltline_callsign_rejected'
  | 'maltline_proof_invalid';

export class MaltlineCompetitionApiError extends Error {
  constructor(
    readonly status: number,
    readonly apiMessage: string,
    readonly code?: MaltlineCompetitionErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(apiMessage);
    this.name = 'MaltlineCompetitionApiError';
  }
}

export class MaltlineCompetitionProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaltlineCompetitionProtocolError';
  }
}

export class MaltlineCompetitionTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Maltline competition request timed out after ${timeoutMs} ms.`);
    this.name = 'MaltlineCompetitionTimeoutError';
  }
}

function protocolError(message: string): never {
  throw new MaltlineCompetitionProtocolError(message);
}

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return protocolError(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  const expected = new Set(keys);
  if (actualKeys.length !== keys.length || actualKeys.some((key) => !expected.has(key))) {
    return protocolError(`${label} contains unsupported or missing fields.`);
  }
  return record;
}

function boundedString(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    return protocolError(`${label} is invalid.`);
  }
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum) {
    return protocolError(`${label} is invalid.`);
  }
  return value;
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) return protocolError(`${label} is unsupported.`);
  return expected;
}

function canonicalTimestamp(value: unknown, label: string): string {
  const timestamp = boundedString(value, 32, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp)) {
    return protocolError(`${label} is invalid.`);
  }
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== timestamp) {
    return protocolError(`${label} is invalid.`);
  }
  return timestamp;
}

function parseAuthority(value: unknown): MaltlineAuthorityIdentity {
  const authority = exactObject(
    value,
    ['gameId', 'rulesetVersion', 'campaignGeneration', 'configurationSha256'],
    'Maltline challenge authority',
  );
  const expected = MALTLINE_GENERATION_2_AUTHORITY.identity;
  return Object.freeze({
    gameId: literal(authority.gameId, expected.gameId, 'Maltline authority game'),
    rulesetVersion: literal(
      authority.rulesetVersion,
      expected.rulesetVersion,
      'Maltline authority ruleset',
    ),
    campaignGeneration: literal(
      authority.campaignGeneration,
      expected.campaignGeneration,
      'Maltline authority campaign',
    ),
    configurationSha256: literal(
      authority.configurationSha256,
      expected.configurationSha256,
      'Maltline authority configuration',
    ),
  });
}

function parseChallenge(value: unknown): MaltlineCompetitionChallenge {
  const challenge = exactObject(value, [
    'id',
    'nonce',
    'seasonId',
    'boardId',
    'gameVersion',
    'authority',
    'proofSchemaVersion',
    'envelopeVersion',
    'expiresAt',
  ], 'Maltline challenge');
  const id = boundedString(challenge.id, 64, 'Maltline challenge ID');
  if (!/^run_[A-Za-z0-9_-]{16}$/u.test(id)) protocolError('Maltline challenge ID is invalid.');
  return Object.freeze({
    id,
    nonce: boundedInteger(challenge.nonce, 0, 0xffff_ffff, 'Maltline challenge nonce'),
    seasonId: literal(challenge.seasonId, GENERATION_2_SEASON_ID, 'Maltline season'),
    boardId: literal(challenge.boardId, 'arcade', 'Maltline leaderboard'),
    gameVersion: literal(
      challenge.gameVersion,
      MALTLINE_COMPETITION_GAME_VERSION,
      'Maltline game version',
    ),
    authority: parseAuthority(challenge.authority),
    proofSchemaVersion: literal(
      challenge.proofSchemaVersion,
      MALTLINE_GENERATION_2_AUTHORITY.proofSchemaVersion,
      'Maltline proof schema',
    ),
    envelopeVersion: literal(
      challenge.envelopeVersion,
      MALTLINE_PROOF_ENVELOPE_VERSION,
      'Maltline proof envelope',
    ),
    expiresAt: canonicalTimestamp(challenge.expiresAt, 'Maltline challenge expiry'),
  });
}

function parseScore(value: unknown, label: string): MaltlineCompetitionScore {
  const entry = exactObject(value, ENTRY_KEYS, label);
  const id = boundedString(entry.id, 64, `${label} ID`);
  if (!/^score_[A-Za-z0-9_-]{16}$/u.test(id)) protocolError(`${label} ID is invalid.`);
  const name = boundedString(entry.name, 64, `${label} name`);
  if ([...name].length > 16) protocolError(`${label} name is invalid.`);
  const completed = literalBoolean(entry.completed, `${label} completed`);
  const stageReached = boundedInteger(entry.stageReached, 1, 8, `${label} stageReached`);
  const stagesCleared = boundedInteger(entry.stagesCleared, 0, 8, `${label} stagesCleared`);
  if ((completed && (stageReached !== 8 || stagesCleared !== 8))
    || (!completed && stageReached !== stagesCleared + 1)) {
    protocolError(`${label} campaign progress is inconsistent.`);
  }
  return Object.freeze({
    id,
    name,
    score: boundedInteger(entry.score, 0, Number.MAX_SAFE_INTEGER, `${label} score`),
    lives: boundedInteger(entry.lives, 0, 20, `${label} lives`),
    stageReached,
    stagesCleared,
    completed,
    totalTicks: boundedInteger(entry.totalTicks, 1, 60_000, `${label} totalTicks`),
    fulfilled: boundedInteger(entry.fulfilled, 0, 60_000, `${label} fulfilled`),
    serviceActions: boundedInteger(
      entry.serviceActions,
      0,
      60_000,
      `${label} serviceActions`,
    ),
    walkouts: boundedInteger(entry.walkouts, 0, 60_000, `${label} walkouts`),
    resolved: boundedInteger(entry.resolved, 0, 60_000, `${label} resolved`),
    exited: boundedInteger(entry.exited, 0, 60_000, `${label} exited`),
    createdAt: canonicalTimestamp(entry.createdAt, `${label} createdAt`),
    proofAvailable: literalBoolean(entry.proofAvailable, `${label} proofAvailable`),
  });
}

function literalBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return protocolError(`${label} is invalid.`);
  return value;
}

function parseScorePage(value: unknown): MaltlineCompetitionScorePage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return protocolError('Maltline leaderboard response must be an object.');
  }
  const keys = Object.keys(value);
  const hasCursor = keys.includes('nextCursor');
  const page = exactObject(
    value,
    hasCursor ? ['entries', 'nextCursor'] : ['entries'],
    'Maltline leaderboard response',
  );
  if (!Array.isArray(page.entries) || page.entries.length > 50) {
    return protocolError('Maltline leaderboard entries are invalid.');
  }
  const entries = page.entries.map((entry, index) => parseScore(entry, `Maltline score ${index + 1}`));
  if (!hasCursor) return Object.freeze({ entries: Object.freeze(entries) }) as MaltlineCompetitionScorePage;
  const nextCursor = boundedString(page.nextCursor, 128, 'Maltline leaderboard cursor');
  if (!/^[A-Za-z0-9_-]+$/u.test(nextCursor)) protocolError('Maltline leaderboard cursor is invalid.');
  return Object.freeze({ entries: Object.freeze(entries), nextCursor }) as MaltlineCompetitionScorePage;
}

function parseSubmission(value: unknown, status: 200 | 201 | 202): MaltlineSubmissionResult {
  const submission = exactObject(value, ['entry', 'proofState'], 'Maltline submission response');
  const entry = parseScore(submission.entry, 'Maltline submitted score');
  if (status === 202) {
    literal(submission.proofState, 'pending', 'Maltline submission proof state');
    return Object.freeze({ status, proofState: 'pending', entry });
  }
  literal(submission.proofState, 'ready', 'Maltline submission proof state');
  return Object.freeze({ status, proofState: 'ready', entry });
}

function retryAfterSeconds(response: Response): number | undefined {
  if (response.status !== 429) return undefined;
  const value = response.headers.get('retry-after');
  if (value === null || !/^\d+$/u.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 3_600
    ? seconds
    : undefined;
}

function parseApiError(value: unknown, response: Response): MaltlineCompetitionApiError {
  const status = response.status;
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const hasCode = candidate !== undefined
    && Object.prototype.hasOwnProperty.call(candidate, 'code');
  const body = exactObject(value, hasCode ? ['error', 'code'] : ['error'], 'Maltline API error');
  let code: MaltlineCompetitionErrorCode | undefined;
  if (hasCode) {
    const candidateCode = boundedString(body.code, 64, 'Maltline API error code');
    if (candidateCode !== 'maltline_callsign_rejected' && candidateCode !== 'maltline_proof_invalid') {
      protocolError('Maltline API error code is unsupported.');
    }
    if (status !== 400) protocolError('Maltline API error code has an invalid HTTP status.');
    code = candidateCode;
  }
  return new MaltlineCompetitionApiError(
    status,
    boundedString(body.error, 512, 'Maltline API error message'),
    code,
    retryAfterSeconds(response),
  );
}

function assertTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(`Maltline request timeout must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
  }
  return value;
}

function assertJsonValue(value: unknown, seen: Set<object>, depth: number): void {
  if (depth > 32) throw new TypeError('Maltline request JSON is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new TypeError('Maltline request JSON numbers must be finite safe integers.');
    }
    return;
  }
  if (typeof value !== 'object') throw new TypeError('Maltline request contains a non-JSON value.');
  if (seen.has(value)) throw new TypeError('Maltline request JSON must not contain cycles.');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, seen, depth + 1);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Maltline request JSON must contain only plain objects.');
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('Maltline request contains a non-JSON key.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new TypeError('Maltline request JSON must contain only enumerable data properties.');
      }
      assertJsonValue(descriptor.value, seen, depth + 1);
    }
  }
  seen.delete(value);
}

function requestBody(value: unknown): string {
  assertJsonValue(value, new Set(), 0);
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > MAX_MALTLINE_COMPETITION_REQUEST_BYTES) {
    throw new TypeError('Maltline request exceeds the submission byte limit.');
  }
  return body;
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return protocolError('Maltline API response must use application/json.');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/u.test(declared)) protocolError('Maltline API response Content-Length is invalid.');
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > MAX_MALTLINE_COMPETITION_RESPONSE_BYTES) {
      protocolError('Maltline API response exceeds the byte limit.');
    }
  }

  const reader = response.body?.getReader();
  if (!reader) protocolError('Maltline API response body is missing.');
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = (): void => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (signal.aborted) throw signal.reason;
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > MAX_MALTLINE_COMPETITION_RESPONSE_BYTES) {
        try {
          await reader.cancel('Maltline API response exceeds the byte limit.');
        } catch {
          // The protocol error remains authoritative even if cancellation fails.
        }
        protocolError('Maltline API response exceeds the byte limit.');
      }
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
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
    return protocolError('Maltline API response must be valid UTF-8.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return protocolError('Maltline API response must be valid JSON.');
  }
}

export class MaltlineCompetitionClient {
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly fetcher: MaltlineCompetitionFetch,
    options: MaltlineCompetitionClientOptions = {},
  ) {
    if (typeof fetcher !== 'function') throw new TypeError('Maltline competition fetch is required.');
    this.defaultTimeoutMs = assertTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async beginRun(options: MaltlineCompetitionRequestOptions = {}): Promise<MaltlineCompetitionChallenge> {
    const { status, value } = await this.requestJson(
      `${MALTLINE_COMPETITION_API_PREFIX}/runs`,
      {
        method: 'POST',
        body: requestBody({ gameVersion: MALTLINE_COMPETITION_GAME_VERSION, boardId: 'arcade' }),
      },
      options,
    );
    if (status !== 201) return protocolError(`Maltline begin-run returned unexpected status ${status}.`);
    return parseChallenge(value);
  }

  async listScores(options: MaltlineListScoresOptions = {}): Promise<MaltlineCompetitionScorePage> {
    const parameters = new URLSearchParams();
    if (options.limit !== undefined) {
      if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 50) {
        throw new TypeError('Maltline leaderboard limit must be an integer from 1 to 50.');
      }
      parameters.set('limit', String(options.limit));
    }
    if (options.cursor !== undefined) {
      if (options.cursor.length < 1
        || options.cursor.length > 128
        || !/^[A-Za-z0-9_-]+$/u.test(options.cursor)) {
        throw new TypeError('Maltline leaderboard cursor is invalid.');
      }
      parameters.set('cursor', options.cursor);
    }
    const query = parameters.size === 0 ? '' : `?${parameters.toString()}`;
    const { status, value } = await this.requestJson(
      `${MALTLINE_COMPETITION_API_PREFIX}/leaderboards/arcade${query}`,
      { method: 'GET' },
      options,
    );
    if (status !== 200) return protocolError(`Maltline leaderboard returned unexpected status ${status}.`);
    return parseScorePage(value);
  }

  async loadReplay(
    scoreId: string,
    options: MaltlineCompetitionRequestOptions = {},
  ): Promise<VerifiedMaltlinePlayback> {
    if (!/^score_[A-Za-z0-9_-]{16}$/u.test(scoreId)) {
      throw new TypeError('Maltline score ID is invalid.');
    }
    const { status, value } = await this.requestJson(
      `${MALTLINE_COMPETITION_API_PREFIX}/replays/${scoreId}`,
      { method: 'GET' },
      options,
    );
    if (status !== 200) return protocolError(`Maltline retained proof returned unexpected status ${status}.`);
    try {
      return await createVerifiedMaltlinePlayback(value);
    } catch (error) {
      if (error instanceof MaltlineProofError) {
        return protocolError(`Maltline retained proof failed verification: ${error.message}`);
      }
      throw error;
    }
  }

  async submitScore(
    runId: string,
    playerName: string,
    proof: MaltlineRunProof,
    options: MaltlineCompetitionRequestOptions = {},
  ): Promise<MaltlineSubmissionResult> {
    if (!/^run_[A-Za-z0-9_-]{16}$/u.test(runId)) throw new TypeError('Maltline run ID is invalid.');
    if (playerName.length < 1 || [...playerName].length > 16) {
      throw new TypeError('Maltline player name is invalid.');
    }
    const { status, value } = await this.requestJson(
      `${MALTLINE_COMPETITION_API_PREFIX}/leaderboards/arcade`,
      {
        method: 'POST',
        body: requestBody({
          gameVersion: MALTLINE_COMPETITION_GAME_VERSION,
          runId,
          playerName,
          proof,
        }),
      },
      options,
    );
    if (status !== 200 && status !== 201 && status !== 202) {
      return protocolError(`Maltline submission returned unexpected status ${status}.`);
    }
    return parseSubmission(value, status);
  }

  private async requestJson(
    path: string,
    init: Pick<RequestInit, 'method' | 'body'>,
    options: MaltlineCompetitionRequestOptions,
  ): Promise<{ status: number; value: unknown }> {
    if (!path.startsWith(`${MALTLINE_COMPETITION_API_PREFIX}/`) || path.startsWith('//')) {
      throw new TypeError('Maltline competition URL must be same-origin and relative.');
    }
    const timeoutMs = assertTimeout(options.timeoutMs ?? this.defaultTimeoutMs);
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const relayAbort = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) relayAbort();
    else options.signal?.addEventListener('abort', relayAbort, { once: true });
    if (!controller.signal.aborted) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Maltline competition request timed out.', 'TimeoutError'));
      }, timeoutMs);
    }

    try {
      const response = await this.fetcher(path, {
        ...init,
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        signal: controller.signal,
      });
      const value = await readBoundedJson(response, controller.signal);
      if (!response.ok) throw parseApiError(value, response);
      return { status: response.status, value };
    } catch (error) {
      if (timedOut) throw new MaltlineCompetitionTimeoutError(timeoutMs);
      if (controller.signal.aborted) {
        if (controller.signal.reason instanceof Error) throw controller.signal.reason;
        throw new DOMException('Maltline competition request was aborted.', 'AbortError');
      }
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener('abort', relayAbort);
    }
  }
}

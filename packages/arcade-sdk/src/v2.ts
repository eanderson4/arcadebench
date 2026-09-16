import { requestJson, requiredIdentifier, segment } from './transport';

/** Default protocol prefix for every new-protocol route. */
export const ARCADEBENCH_V2_BASE_URL = '/api/v2';
export const ARCADEBENCH_V2_PROTOCOL_VERSION = 1;
export const ARCADEBENCH_PUBLICATION_POLICY_VERSION = 'top50-social-v1';

export interface ArcadeBenchGameClientOptions {
  gameId: string;
  gameVersion: string;
  /** Defaults to the same-origin v2 API. Never put a credential here. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ArcadeBenchPlatformClientOptions {
  /** Defaults to the same-origin v2 API. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface GameRunRequest {
  boardId: string;
  context?: Readonly<Record<string, string>>;
}

export interface GameLeaderboardListRequest {
  boardId: string;
  filters?: Readonly<Record<string, string>>;
  limit?: number;
  cursor?: string;
}

export interface GameLeaderboardSubmitRequest<Score, Proof> {
  boardId: string;
  /** The one-time ranked run challenge this score belongs to. */
  runId: string;
  playerName: string;
  score: Score;
  proof: Proof;
  /**
   * Retention disclosure for this run. The checkbox controls only social-media
   * use; it never changes rank, archival qualification, or the activity feed.
   */
  publication: PublicationRequest;
}

export interface PublicationRequest {
  policyVersion: string;
  socialMedia: boolean;
}

export interface NormalizedBoard {
  id: string;
  label: string;
  context: Readonly<Record<string, string>>;
}

export interface NormalizedEntry<Result = unknown> {
  id: string;
  gameId: string;
  gameVersion: string;
  board: NormalizedBoard;
  playerName: string;
  result: Result;
  createdAt: string;
}

export interface NormalizedPublication {
  rankAtSubmission: number;
  replaySaved: boolean;
  expiresAt: string | null;
}

export interface NormalizedSubmission<Result = unknown> {
  entry: NormalizedEntry<Result>;
  publication: NormalizedPublication;
}

export interface FeedbackSubjectRef {
  kind: string;
  id: string;
}

export interface FeedbackGetRequest {
  subject: FeedbackSubjectRef;
  /** Registered channel name; the service default is "overall". */
  channel?: string;
}

export interface FeedbackSetRequest extends FeedbackGetRequest {
  vote: -1 | 0 | 1;
  /** Omit to preserve an existing private note; empty text clears it. */
  note?: string;
}

export interface FeedbackSummary {
  up: number;
  down: number;
  score: number;
  viewerVote: -1 | 0 | 1;
  note?: string;
  noteExpiresAt?: string;
}

export interface ActivityListRequest {
  limit?: number;
  cursor?: string;
  gameId?: string;
}

export interface ActivityEntry {
  id: string;
  type: 'leaderboard.qualified';
  entryId: string;
  gameId: string;
  gameTitle: string;
  board: NormalizedBoard;
  playerName: string;
  rankAtSubmission: number;
  occurredAt: string;
  leaderboardPath: string;
}

export interface ActivityPage {
  protocolVersion: number;
  entries: ActivityEntry[];
  nextCursor?: string;
}

export interface ArcadeGameClient {
  runs: { begin(request: GameRunRequest): Promise<{ id: string; seed: number | string; gameVersion: string; expiresAt: string }> };
  leaderboards: {
    list<Entry>(request: GameLeaderboardListRequest): Promise<{ entries: Entry[]; nextCursor?: string }>;
    submit<Score, Proof, Result = unknown>(
      request: GameLeaderboardSubmitRequest<Score, Proof>,
    ): Promise<NormalizedSubmission<Result>>;
  };
  feedback: {
    get(request: FeedbackGetRequest): Promise<FeedbackSummary>;
    set(request: FeedbackSetRequest): Promise<FeedbackSummary>;
  };
  replays: {
    publish<Replay>(request: { replay: Replay; expiresInDays?: number }): Promise<{
      id: string;
      url: string;
      replayUrl?: string;
      expiresAt: string;
    }>;
  };
}

export interface ArcadePlatformClient {
  activity: { list(request?: ActivityListRequest): Promise<ActivityPage> };
}

function feedbackPath(gameId: string, request: FeedbackGetRequest): string {
  const search = new URLSearchParams();
  if (request.channel) search.set('channel', request.channel);
  const query = search.size > 0 ? `?${search}` : '';
  return `/games/${segment(gameId, 'gameId')}/feedback/${segment(request.subject.kind, 'subject kind')}/${segment(request.subject.id, 'subject id')}${query}`;
}

/**
 * The new-protocol game client. It sends the same opaque game-owned score and
 * proof as v1, plus the explicit publication decision the v2 route requires, so
 * an older server rejects the request instead of ignoring the policy.
 */
export class ArcadeBenchGameClient implements ArcadeGameClient {
  readonly runs: ArcadeGameClient['runs'];
  readonly leaderboards: ArcadeGameClient['leaderboards'];
  readonly feedback: ArcadeGameClient['feedback'];
  readonly replays: ArcadeGameClient['replays'];

  private readonly gameId: string;
  private readonly gameVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ArcadeBenchGameClientOptions) {
    this.gameId = requiredIdentifier(options.gameId, 'gameId');
    this.gameVersion = requiredIdentifier(options.gameVersion, 'gameVersion');
    this.baseUrl = (options.baseUrl ?? ARCADEBENCH_V2_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

    this.runs = {
      begin: async (request) =>
        this.request(`/games/${segment(this.gameId, 'gameId')}/runs`, {
          method: 'POST',
          body: JSON.stringify({
            gameVersion: this.gameVersion,
            boardId: requiredIdentifier(request.boardId, 'boardId'),
            context: request.context ?? {},
          }),
        }),
    };

    this.leaderboards = {
      list: async <Entry>(request: GameLeaderboardListRequest) => {
        const search = new URLSearchParams();
        if (request.limit !== undefined) search.set('limit', String(request.limit));
        if (request.cursor) search.set('cursor', request.cursor);
        for (const [key, value] of Object.entries(request.filters ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
          search.set(`filter.${key}`, String(value));
        }
        const query = search.size > 0 ? `?${search}` : '';
        return this.request<{ entries: Entry[]; nextCursor?: string }>(
          `/games/${segment(this.gameId, 'gameId')}/leaderboards/${segment(request.boardId, 'boardId')}${query}`,
        );
      },
      submit: async <Score, Proof, Result>(request: GameLeaderboardSubmitRequest<Score, Proof>) =>
        this.request<NormalizedSubmission<Result>>(
          `/games/${segment(this.gameId, 'gameId')}/leaderboards/${segment(request.boardId, 'boardId')}`,
          {
            method: 'POST',
            body: JSON.stringify({
              gameVersion: this.gameVersion,
              runId: requiredIdentifier(request.runId, 'runId'),
              playerName: request.playerName,
              score: request.score,
              proof: request.proof,
              publication: request.publication,
            }),
          },
        ),
    };

    this.feedback = {
      get: async (request) => this.request<FeedbackSummary>(feedbackPath(this.gameId, request)),
      set: async (request) => this.request<FeedbackSummary>(feedbackPath(this.gameId, request), {
        method: 'PUT',
        body: JSON.stringify({
          gameVersion: this.gameVersion,
          vote: request.vote,
          ...(request.note === undefined ? {} : { note: request.note }),
        }),
      }),
    };

    this.replays = {
      publish: async <Replay>(request: { replay: Replay; expiresInDays?: number }) =>
        this.request(`/games/${segment(this.gameId, 'gameId')}/replays`, {
          method: 'POST',
          body: JSON.stringify({
            gameVersion: this.gameVersion,
            replay: request.replay,
            expiresInDays: request.expiresInDays ?? 5,
          }),
        }),
    };
  }

  private request<ResponseBody>(path: string, init: RequestInit = {}): Promise<ResponseBody> {
    return requestJson<ResponseBody>(this.fetchImpl, this.baseUrl, path, init);
  }
}

/**
 * The platform client needs no game: it reads the one global activity stream
 * rather than merging per-game leaderboards in the browser.
 */
export class ArcadeBenchPlatformClient implements ArcadePlatformClient {
  readonly activity: ArcadePlatformClient['activity'];

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ArcadeBenchPlatformClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? ARCADEBENCH_V2_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.activity = {
      list: async (request: ActivityListRequest = {}) => {
        const search = new URLSearchParams();
        if (request.limit !== undefined) search.set('limit', String(request.limit));
        if (request.cursor) search.set('cursor', request.cursor);
        if (request.gameId) search.set('gameId', request.gameId);
        const query = search.size > 0 ? `?${search}` : '';
        return this.request<ActivityPage>(`/activity${query}`);
      },
    };
  }

  private request<ResponseBody>(path: string, init: RequestInit = {}): Promise<ResponseBody> {
    return requestJson<ResponseBody>(this.fetchImpl, this.baseUrl, path, init);
  }
}

export function createArcadeBenchGameClient(
  options: ArcadeBenchGameClientOptions,
): ArcadeBenchGameClient {
  return new ArcadeBenchGameClient(options);
}

export function createArcadeBenchPlatformClient(
  options: ArcadeBenchPlatformClientOptions = {},
): ArcadeBenchPlatformClient {
  return new ArcadeBenchPlatformClient(options);
}

export const ARCADEBENCH_SDK_VERSION = '0.1.0';

export type LeaderboardFilterValue = string | number | boolean;

export interface ArcadeBenchClientOptions {
  gameId: string;
  gameVersion: string;
  /** Defaults to the same-origin ArcadeBench API. Never put a credential here. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ListLeaderboardRequest {
  boardId: string;
  filters?: Readonly<Record<string, LeaderboardFilterValue>>;
  limit?: number;
  cursor?: string;
}

export interface BeginRunRequest {
  boardId: string;
  context?: Readonly<Record<string, LeaderboardFilterValue>>;
}

export interface RankedRunChallenge {
  id: string;
  seed: number | string;
  gameVersion: string;
  expiresAt: string;
}

export interface LeaderboardPage<Entry> {
  entries: Entry[];
  nextCursor?: string;
}

export interface SubmitLeaderboardRequest<Score, Proof> {
  boardId: string;
  /** A one-time server challenge is required for verified public boards. */
  runId?: string;
  playerName: string;
  score: Score;
  proof: Proof;
}

export interface SubmitLeaderboardResponse<Entry> {
  entry: Entry;
}

export interface PublishReplayRequest<Replay> {
  replay: Replay;
  expiresInDays?: number;
}

export interface PublishedReplay {
  id: string;
  url: string;
  expiresAt: string;
}

export interface SocialSubject {
  kind: 'game' | 'level';
  id: string;
}

export type VoteValue = -1 | 0 | 1;

export interface VoteSummary {
  up: number;
  down: number;
  score: number;
  viewerVote: VoteValue;
}

export interface ArcadeLeaderboardApi {
  list<Entry>(request: ListLeaderboardRequest): Promise<LeaderboardPage<Entry>>;
  submit<Score, Proof, Entry>(
    request: SubmitLeaderboardRequest<Score, Proof>,
  ): Promise<SubmitLeaderboardResponse<Entry>>;
}

export interface ArcadeRunApi {
  begin(request: BeginRunRequest): Promise<RankedRunChallenge>;
}

export interface ArcadeReplayApi {
  publish<Replay>(request: PublishReplayRequest<Replay>): Promise<PublishedReplay>;
}

export interface ArcadeSocialApi {
  get(subject: SocialSubject): Promise<VoteSummary>;
  vote(subject: SocialSubject, value: VoteValue): Promise<VoteSummary>;
}

export class ArcadeBenchApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ArcadeBenchApiError';
  }
}

function requiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function segment(value: string, label: string): string {
  return encodeURIComponent(requiredIdentifier(value, label));
}

export class ArcadeBenchClient {
  readonly runs: ArcadeRunApi;
  readonly leaderboards: ArcadeLeaderboardApi;
  readonly replays: ArcadeReplayApi;
  readonly social: ArcadeSocialApi;

  private readonly gameId: string;
  private readonly gameVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ArcadeBenchClientOptions) {
    this.gameId = requiredIdentifier(options.gameId, 'gameId');
    this.gameVersion = requiredIdentifier(options.gameVersion, 'gameVersion');
    this.baseUrl = (options.baseUrl ?? '/api/v1').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;

    this.runs = {
      begin: async (request: BeginRunRequest) =>
        this.request<RankedRunChallenge>(`/games/${segment(this.gameId, 'gameId')}/runs`, {
          method: 'POST',
          body: JSON.stringify({
            gameVersion: this.gameVersion,
            boardId: requiredIdentifier(request.boardId, 'boardId'),
            context: request.context ?? {},
          }),
        }),
    };

    this.leaderboards = {
      list: async <Entry>(request: ListLeaderboardRequest) => {
        const search = new URLSearchParams();
        if (request.limit !== undefined) search.set('limit', String(request.limit));
        if (request.cursor) search.set('cursor', request.cursor);
        for (const [key, value] of Object.entries(request.filters ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
          search.set(`filter.${key}`, String(value));
        }
        const query = search.size > 0 ? `?${search}` : '';
        return this.request<LeaderboardPage<Entry>>(
          `/games/${segment(this.gameId, 'gameId')}/leaderboards/${segment(request.boardId, 'boardId')}${query}`,
        );
      },
      submit: async <Score, Proof, Entry>(request: SubmitLeaderboardRequest<Score, Proof>) =>
        this.request<SubmitLeaderboardResponse<Entry>>(
          `/games/${segment(this.gameId, 'gameId')}/leaderboards/${segment(request.boardId, 'boardId')}`,
          {
            method: 'POST',
            body: JSON.stringify({
              gameVersion: this.gameVersion,
              ...(request.runId ? { runId: request.runId } : {}),
              playerName: request.playerName,
              score: request.score,
              proof: request.proof,
            }),
          },
        ),
    };

    this.replays = {
      publish: async <Replay>(request: PublishReplayRequest<Replay>) =>
        this.request<PublishedReplay>(`/games/${segment(this.gameId, 'gameId')}/replays`, {
          method: 'POST',
          body: JSON.stringify({
            gameVersion: this.gameVersion,
            replay: request.replay,
            expiresInDays: request.expiresInDays ?? 5,
          }),
        }),
    };

    this.social = {
      get: async (subject: SocialSubject) =>
        this.request<VoteSummary>(this.socialPath(subject)),
      vote: async (subject: SocialSubject, value: VoteValue) =>
        this.request<VoteSummary>(this.socialPath(subject), {
          method: 'PUT',
          body: JSON.stringify({ gameVersion: this.gameVersion, value }),
        }),
    };
  }

  private socialPath(subject: SocialSubject): string {
    return `/games/${segment(this.gameId, 'gameId')}/votes/${segment(subject.kind, 'subject kind')}/${segment(subject.id, 'subject id')}`;
  }

  private async request<ResponseBody>(path: string, init: RequestInit = {}): Promise<ResponseBody> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('x-arcadebench-client', ARCADEBENCH_SDK_VERSION);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
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
}

export function createArcadeBenchClient(options: ArcadeBenchClientOptions): ArcadeBenchClient {
  return new ArcadeBenchClient(options);
}

import type { ArcadeBenchEnv } from '../env';

/**
 * Shared protocol constants for every registered ArcadeBench game. Nothing in
 * this module is game specific: games register an adapter and inherit the same
 * leaderboard, publication, activity and feedback behaviour.
 */
export const SHARED_PLATFORM_PROTOCOL_VERSION = 1;
export const V2_API_PREFIX = '/api/v2';

/** The only publication policy this release accepts on the v2 route. */
export const PUBLICATION_POLICY_VERSION = 'top50-social-v1';

/** Immutable placement at or above this rank keeps its private replay. */
export const TOP_RANK_QUALIFICATION = 50;

/** A rank vector is a bounded ascending tuple padded with zero. */
export const RANK_COMPONENT_COUNT = 8;

/** Private replay objects live outside the legacy five-day R2 prefixes. */
export const ARCHIVE_PREFIX = 'archives';

export const REPLAY_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
export const FEEDBACK_NOTE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const FEEDBACK_NOTE_MAX_LENGTH = 1000;
export const FEEDBACK_DEFAULT_CHANNEL = 'overall';
export const FEEDBACK_VOTE_VALUES = [-1, 0, 1] as const;
export const ACTIVITY_DEFAULT_LIMIT = 8;
export const ACTIVITY_MAX_LIMIT = 50;
export const LEADERBOARD_MAX_LIMIT = 50;
export const CONTEXT_VALUE_MAX_LENGTH = 64;

export type FlatContext = Readonly<Record<string, string>>;

export interface BoardDefinition {
  boardId: string;
  /** Registered context field names. Unregistered filters are rejected. */
  contextFields: readonly string[];
  /** Human-readable label used in "Difficulty filter is required." errors. */
  contextFieldLabels: Readonly<Record<string, string>>;
  rankingPolicyVersion: string;
}

/** A resolved board instance: game + policy version + season + board + context. */
export interface BoardInstance {
  gameId: string;
  gameVersion: string;
  authorityId: string;
  rankingPolicyVersion: string;
  seasonId: string;
  boardId: string;
  context: FlatContext;
  label: string;
  path: string;
  boardKey: string;
}

export interface BoardResolution {
  boardId: string;
  context: FlatContext;
  label: string;
  path: string;
  rankingPolicyVersion: string;
}

export interface ChallengeRecord {
  id: string;
  boardId: string;
  /** Immutable identity captured at run start, never resolved afresh at submit. */
  boardKey: string;
  gameVersion: string;
  seasonId: string;
  seed: number;
  expiresAt: string;
  /** Game-owned challenge columns replayed into verification. */
  payload: Record<string, unknown>;
}

export interface VerifiedSubmission {
  /** Game-owned verified result: the game-specific fields of a real run. */
  result: Record<string, unknown>;
  /** Ascending rank vector, at most eight finite components. */
  rankComponents: readonly number[];
  /** Canonical private proof bytes stored in the archive object. */
  proofBytes: string;
}

export interface BeginRunRequest {
  env: ArcadeBenchEnv;
  sessionId: string;
  board: BoardInstance;
}

export interface LoadChallengeRequest {
  env: ArcadeBenchEnv;
  sessionId: string;
  runId: string;
  boardId: string;
  gameVersion: string;
}

export interface ConsumeChallengeRequest {
  env: ArcadeBenchEnv;
  runId: string;
  sessionId: string;
  entryId: string;
  board: BoardInstance;
  at: string;
}

export interface SharedEntryDraft {
  id: string;
  boardKey: string;
  boardId: string;
  gameId: string;
  gameVersion: string;
  seasonId: string;
  playerName: string;
  normalizedName: string;
  resultJson: string;
  rankComponents: readonly number[];
  moderationKey: string;
  runId: string;
  sessionId: string;
  createdAt: string;
  /** Registered private replay object, absent on the legacy five-day route. */
  replayObjectId: string | null;
  replayObjectKey: string;
  replaySha256: string;
  /**
   * Legacy detail retention deadline. Shared submissions leave this null so the
   * private replay object owns retention and the legacy cleanup can never
   * delete a retained archive.
   */
  replayExpiresAt?: string | null;
}

export interface InsertEntryRequest extends SharedEntryDraft {
  env: ArcadeBenchEnv;
}

export interface VerifySubmissionRequest {
  challenge: ChallengeRecord;
  board: BoardInstance;
  score: unknown;
  proof: unknown;
}

export interface PublishReplayRequest {
  env: ArcadeBenchEnv;
  sessionId: string;
  body: Record<string, unknown>;
  origin: string;
}

export interface FeedbackKindDefinition {
  /** Accepted subject identifiers for this kind. */
  ids: readonly string[];
  label: string;
}

export interface FeedbackRegistration {
  kinds: Readonly<Record<string, FeedbackKindDefinition>>;
  channels: readonly string[];
}

export interface NormalizedBoard {
  id: string;
  label: string;
  context: FlatContext;
}

export interface NormalizedEntry {
  id: string;
  gameId: string;
  gameVersion: string;
  board: NormalizedBoard;
  playerName: string;
  result: unknown;
  createdAt: string;
}

export interface NormalizedPublication {
  rankAtSubmission: number;
  replaySaved: boolean;
  expiresAt: string | null;
}

export interface NormalizedSubmission {
  entry: NormalizedEntry;
  publication: NormalizedPublication;
}

/**
 * A registered game. The platform never trusts client-supplied rank
 * components, placement, titles, links, or activity: everything public comes
 * from this adapter and from the shared ordering.
 */
export interface GameAdapter {
  readonly gameId: string;
  readonly gameTitle: string;
  /** Same-origin deep path for the game, e.g. /games/partition/. */
  readonly gamePath: string;
  /** Immutable authority identity for verified results of this game. */
  readonly authorityId: string;
  readonly currentGameVersion: string;
  readonly boards: readonly BoardDefinition[];
  readonly feedback: FeedbackRegistration;
  /**
   * True when the game predates shared feedback and its default channel still
   * writes the legacy `votes` table, which the migration projects into the
   * shared aggregate. Every other game writes the shared table directly.
   */
  readonly legacyVotes?: boolean;

  /** Optional network admission before sessions, body parsing, or ranked storage. */
  admitRankedWrite?(request: Request, env: ArcadeBenchEnv): Promise<void>;

  activeSeason(env: ArcadeBenchEnv): Promise<{ id: string; gameVersion: string }>;
  /** Validate registered context/filters and describe the board. */
  resolveBoard(boardId: string, context: Record<string, unknown>): BoardResolution;
  /** Describe a board read back from storage for lists and activity. */
  describeBoard(boardId: string, context: FlatContext): { label: string; path: string };
  beginRun(request: BeginRunRequest): Promise<{ id: string; seed: number; expiresAt: string }>;
  loadChallenge(request: LoadChallengeRequest): Promise<ChallengeRecord>;
  /**
   * Guarded one-time challenge consumption. This must be a single statement
   * that changes exactly one row when the run is legitimately consumed. The
   * shared submission transaction reports a conflict from this statement's
   * change count alone, because D1 counts rows written by triggers too.
   */
  consumeChallengeStatement(request: ConsumeChallengeRequest): D1PreparedStatement;
  /** Inserts the game's scored row; the shared entry may come from a trigger. */
  insertEntryStatement(request: InsertEntryRequest): D1PreparedStatement;
  verifySubmission(request: VerifySubmissionRequest): VerifiedSubmission;
  /** Optional compatibility hook for the game's explicit replay shares. */
  publishReplay?(request: PublishReplayRequest): Promise<Response>;
}

export function contextFieldLabel(board: BoardDefinition, field: string): string {
  return board.contextFieldLabels[field] ?? field;
}

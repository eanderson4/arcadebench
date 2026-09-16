import type { DifficultyId, PartitionReplay } from '../core/types';
import type {
  NormalizedScoreEntry,
  NormalizedSubmission,
  PartitionGameClient,
  ScorePublication,
  SubmissionPublicationPolicy,
} from './game-client';

export const PLAYER_NAME_MAX_LENGTH = 16;
export const LOCAL_LEADERBOARD_KEY = 'arcadebench.partition.leaderboard.v1';

/**
 * The retention policy a public score form enrolls a run in: a qualifying
 * replay is archived privately, everything else expires, and the social choice
 * is the player's alone. Unknown versions are the server's to reject.
 */
export const TOP50_SOCIAL_POLICY_VERSION = 'top50-social-v1';

export interface LeaderboardStageResult {
  levelId: string;
  levelNumber: number;
  levelTitle: string;
  won: boolean;
  elapsedTicks: number;
  ticksPerSecond: number;
  partitions: number;
  capturedFraction: number;
}

interface LeaderboardEntryBase {
  id: string;
  name: string;
  difficulty: DifficultyId;
  elapsedMs: number;
  partitions: number;
  createdAt: string;
}

export interface ArcadeLeaderboardEntry extends LeaderboardEntryBase {
  scope: 'arcade';
  stageReached: number;
  stagesCleared: number;
  completed: boolean;
}

export interface LevelLeaderboardEntry extends LeaderboardEntryBase {
  scope: 'level';
  levelId: string;
  levelNumber: number;
  levelTitle: string;
  won: boolean;
  capturedFraction: number;
}

export type LeaderboardEntry = ArcadeLeaderboardEntry | LevelLeaderboardEntry;
export type LeaderboardDraft =
  | Omit<ArcadeLeaderboardEntry, 'id' | 'name' | 'createdAt'>
  | Omit<LevelLeaderboardEntry, 'id' | 'name' | 'createdAt'>;

export type LeaderboardQuery =
  | { scope: 'arcade'; difficulty: DifficultyId }
  | { scope: 'level'; difficulty: DifficultyId; levelId: string };

export interface PlayerNameReview {
  allowed: boolean;
  normalizedName?: string;
  reason?: string;
}

export interface LeaderboardSubmitProof {
  replays: PartitionReplay[];
}

/**
 * The one thing a public submission has to state: which retention policy it is
 * being made under, and whether the player allowed social sharing. The object
 * is always sent, even when sharing is declined, so a server can never be asked
 * to infer consent from an absent field.
 */
export function publicationFor(socialMedia: boolean): SubmissionPublicationPolicy {
  return { policyVersion: TOP50_SOCIAL_POLICY_VERSION, socialMedia: socialMedia === true };
}

/**
 * The social-media permission for one run. It starts unchecked, belongs to the
 * run it was given for, and is cleared between runs — it is never stored,
 * carried forward, or read back from a previous attempt.
 */
export class RunConsent {
  private socialMedia = false;

  reset(): void {
    this.socialMedia = false;
  }

  set(allowed: boolean): void {
    this.socialMedia = allowed === true;
  }

  get allowed(): boolean {
    return this.socialMedia;
  }

  publication(): SubmissionPublicationPolicy {
    return publicationFor(this.socialMedia);
  }
}

/** What the platform reported about the submission as it was accepted. */
export interface SubmissionResult {
  entry: LeaderboardEntry;
  /** Null in local preview, or when the response carried no usable envelope. */
  publication: ScorePublication | null;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const REJECTED_NAME_WORDS = new Set([
  'bitch',
  'cunt',
  'fuck',
  'hitler',
  'nazi',
  'nigger',
  'shit',
]);

const LEET_ALTERNATIVES: Readonly<Record<string, readonly string[]>> = {
  '0': ['o'],
  '1': ['i', 'l'],
  '3': ['e'],
  '4': ['a', 'f'],
  '5': ['s'],
  '7': ['t'],
  '8': ['b'],
  '@': ['a'],
  '$': ['s'],
  '!': ['i'],
};

function expandedLeetTokens(token: string): Set<string> {
  let candidates = new Set(['']);
  for (const character of token) {
    const alternatives = LEET_ALTERNATIVES[character] ?? [character];
    const next = new Set<string>();
    for (const prefix of candidates) {
      for (const alternative of alternatives) {
        next.add(prefix + alternative);
        if (next.size >= 64) break;
      }
      if (next.size >= 64) break;
    }
    candidates = next;
  }
  return candidates;
}

function containsRejectedNameWord(value: string): boolean {
  const tokens = value.toLocaleLowerCase().split(/[^\p{L}\p{N}@$!]+/u).filter(Boolean);
  const candidates = [...tokens];
  if (tokens.length > 1 && tokens.every((token) => [...token].length === 1)) candidates.push(tokens.join(''));
  return candidates.some((token) =>
    [...expandedLeetTokens(token)].some((expanded) => REJECTED_NAME_WORDS.has(expanded)),
  );
}

function scalarLength(value: string): number {
  return [...value].length;
}

export function reviewPlayerName(candidate: string): PlayerNameReview {
  const normalizedName = candidate.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalizedName.length === 0) return { allowed: false, reason: 'Enter a callsign.' };
  if (scalarLength(normalizedName) > PLAYER_NAME_MAX_LENGTH) {
    return { allowed: false, reason: `Use ${PLAYER_NAME_MAX_LENGTH} characters or fewer.` };
  }
  if (!/^[\p{L}\p{N} ._'’-]+$/u.test(normalizedName)) {
    return { allowed: false, reason: 'Use letters, numbers, spaces, dots, dashes, or underscores.' };
  }
  if (/https?:|www\.|\.com\b|\.net\b|\.org\b/i.test(normalizedName)) {
    return { allowed: false, reason: 'Links are not allowed in callsigns.' };
  }
  if (/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(normalizedName)) {
    return { allowed: false, reason: 'Invisible or directional characters are not allowed.' };
  }
  if (containsRejectedNameWord(normalizedName)) {
    return { allowed: false, reason: 'Choose a public-friendly callsign.' };
  }
  return { allowed: true, normalizedName };
}

function isDifficulty(value: unknown): value is DifficultyId {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'impossible';
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  if (
    typeof entry.id !== 'string'
    || typeof entry.name !== 'string'
    || !isDifficulty(entry.difficulty)
    || !isFiniteNonNegative(entry.elapsedMs)
    || !isFiniteNonNegative(entry.partitions)
    || typeof entry.createdAt !== 'string'
  ) return false;
  if (entry.scope === 'arcade') {
    return isFiniteNonNegative(entry.stageReached)
      && isFiniteNonNegative(entry.stagesCleared)
      && typeof entry.completed === 'boolean';
  }
  return entry.scope === 'level'
    && typeof entry.levelId === 'string'
    && typeof entry.levelNumber === 'number'
    && typeof entry.levelTitle === 'string'
    && typeof entry.won === 'boolean'
    && isFiniteNonNegative(entry.capturedFraction);
}

function isScorePublication(value: unknown): value is ScorePublication {
  if (!value || typeof value !== 'object') return false;
  const publication = value as Partial<ScorePublication>;
  if (
    !Number.isInteger(publication.rankAtSubmission)
    || (publication.rankAtSubmission ?? 0) < 1
    || typeof publication.replaySaved !== 'boolean'
  ) return false;
  const expiresAt = publication.expiresAt;
  if (expiresAt === null || expiresAt === undefined) return true;
  return typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt));
}

/**
 * Adapt one normalized platform entry into this game's view model. The verified
 * result fields are the game's own, but they arrive from the server, so they are
 * re-validated here rather than trusted: a malformed record is dropped instead
 * of rendered.
 */
export function adaptLeaderboardEntry<Result>(
  entry: NormalizedScoreEntry<Result> | null | undefined,
): LeaderboardEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return null;
  // The envelope owns identity: a record without an id, a callsign, or a
  // timestamp has nothing to show and is dropped rather than rendered.
  if (typeof entry.playerName !== 'string' || entry.playerName.length === 0) return null;
  if (typeof entry.createdAt !== 'string' || entry.createdAt.length === 0) return null;
  if (!entry.result || typeof entry.result !== 'object' || Array.isArray(entry.result)) return null;
  const candidate: unknown = {
    ...entry.result,
    id: entry.id,
    name: entry.playerName,
    createdAt: entry.createdAt,
  };
  return isLeaderboardEntry(candidate) ? candidate : null;
}

/** Read the publication envelope defensively; a missing one claims nothing. */
export function adaptPublication(value: unknown): ScorePublication | null {
  return isScorePublication(value) ? value : null;
}

/** Retention is quoted from the response's own deadline, never assumed. */
export function replayRetentionLabel(expiresAt: string | null, now = Date.now()): string {
  if (!expiresAt) return 'REPLAY NOT ARCHIVED';
  const days = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 86_400_000));
  if (days === 0) return 'REPLAY EXPIRES TODAY';
  return `REPLAY EXPIRES IN ${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
}

/**
 * Say exactly what the platform reported and nothing it did not: the placement
 * the submission itself carried, an archive only when the response said the
 * replay was saved, and otherwise the retention deadline that came back.
 */
export function submissionOutcomeMessage(
  result: SubmissionResult,
  mode: 'public' | 'local',
  now = Date.now(),
): string {
  if (mode !== 'public') return 'SCORE SAVED ON THIS DEVICE';
  const publication = result.publication;
  if (!publication) return 'SCORE VERIFIED · CALLSIGN ACCEPTED';
  const placement = `SCORE VERIFIED · RANK #${publication.rankAtSubmission}`;
  return publication.replaySaved
    ? `${placement} · REPLAY SAVED PRIVATELY`
    : `${placement} · ${replayRetentionLabel(publication.expiresAt, now)}`;
}

function entryTieBreak(first: LeaderboardEntry, second: LeaderboardEntry): number {
  return first.elapsedMs - second.elapsedMs
    || first.partitions - second.partitions
    || first.createdAt.localeCompare(second.createdAt)
    || first.id.localeCompare(second.id);
}

export function rankLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  query: LeaderboardQuery,
): LeaderboardEntry[] {
  const matching = entries.filter((entry) => entry.scope === query.scope && entry.difficulty === query.difficulty);
  if (query.scope === 'arcade') {
    return matching
      .filter((entry): entry is ArcadeLeaderboardEntry => entry.scope === 'arcade')
      .sort((first, second) =>
        second.stageReached - first.stageReached
        || Number(second.completed) - Number(first.completed)
        || entryTieBreak(first, second),
      );
  }
  return matching
    .filter((entry): entry is LevelLeaderboardEntry => entry.scope === 'level' && entry.levelId === query.levelId)
    .sort((first, second) =>
      Number(second.won) - Number(first.won)
      || (first.won ? 0 : second.capturedFraction - first.capturedFraction)
      || entryTieBreak(first, second),
    );
}

export function elapsedMilliseconds(results: readonly LeaderboardStageResult[]): number {
  return Math.round(results.reduce(
    (total, result) => total + (result.elapsedTicks / result.ticksPerSecond) * 1000,
    0,
  ));
}

function createEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class LocalLeaderboardStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly storageKey = LOCAL_LEADERBOARD_KEY,
  ) {}

  all(): LeaderboardEntry[] {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(this.storageKey) ?? '[]');
      return Array.isArray(value) ? value.filter(isLeaderboardEntry) : [];
    } catch {
      return [];
    }
  }

  list(query: LeaderboardQuery, limit = 25): LeaderboardEntry[] {
    return rankLeaderboardEntries(this.all(), query).slice(0, limit);
  }

  submit(name: string, draft: LeaderboardDraft): LeaderboardEntry {
    const review = reviewPlayerName(name);
    if (!review.allowed || !review.normalizedName) throw new Error(review.reason ?? 'Callsign was rejected.');
    const entry = {
      ...draft,
      id: createEntryId(),
      name: review.normalizedName,
      createdAt: new Date().toISOString(),
    } as LeaderboardEntry;
    const entries = [entry, ...this.all()].slice(0, 250);
    this.storage.setItem(this.storageKey, JSON.stringify(entries));
    return entry;
  }
}

export interface LeaderboardSubmitOptions {
  /** A one-time server challenge; absent means the run cannot rank publicly. */
  runId?: string;
  /** The run's social-media permission. Ignored by the local store. */
  consent?: RunConsent;
}

export class LeaderboardService {
  readonly mode: 'public' | 'local';

  constructor(
    private readonly localStore: LocalLeaderboardStore,
    private readonly client?: PartitionGameClient,
  ) {
    this.mode = this.client ? 'public' : 'local';
  }

  async list(query: LeaderboardQuery, limit = 25): Promise<LeaderboardEntry[]> {
    if (!this.client) return this.localStore.list(query, limit);
    const page = await this.client.leaderboards.list<NormalizedScoreEntry<unknown>>({
      boardId: query.scope,
      filters: {
        difficulty: query.difficulty,
        ...(query.scope === 'level' ? { levelId: query.levelId } : {}),
      },
      limit,
    });
    const entries = (page?.entries ?? [])
      .map((entry) => adaptLeaderboardEntry(entry))
      .filter((entry): entry is LeaderboardEntry => entry !== null);
    // The shared platform owns public ordering, including binary ID ties.
    // Re-sorting here with localeCompare can disagree with its placement.
    return entries.filter((entry) => entry.scope === query.scope && entry.difficulty === query.difficulty
      && (query.scope !== 'level' || entry.scope === 'level' && entry.levelId === query.levelId))
      .slice(0, limit);
  }

  async submit(
    name: string,
    draft: LeaderboardDraft,
    proof: LeaderboardSubmitProof,
    options: LeaderboardSubmitOptions = {},
  ): Promise<SubmissionResult> {
    const review = reviewPlayerName(name);
    if (!review.allowed || !review.normalizedName) throw new Error(review.reason ?? 'Callsign was rejected.');
    // Local preview keeps the same shape as the platform, with no publication
    // to report: it never claims a replay was archived or a policy applied.
    if (!this.client) {
      return { entry: this.localStore.submit(review.normalizedName, draft), publication: null };
    }
    if (!options.runId) throw new Error('This was an unranked run. Start a new ranked attempt.');
    const submission: NormalizedSubmission<unknown> = await this.client.leaderboards.submit({
      boardId: draft.scope,
      runId: options.runId,
      playerName: review.normalizedName,
      score: draft,
      proof,
      publication: options.consent?.publication() ?? publicationFor(false),
    });
    const entry = adaptLeaderboardEntry(submission?.entry);
    if (!entry) throw new Error('Leaderboard returned an invalid score.');
    return { entry, publication: adaptPublication(submission?.publication) };
  }
}

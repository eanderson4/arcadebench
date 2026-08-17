import type { DifficultyId, PartitionReplay } from '../core/types';

export const PLAYER_NAME_MAX_LENGTH = 16;
export const LOCAL_LEADERBOARD_KEY = 'arcadebench.partition.leaderboard.v1';

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

function scalarLength(value: string): number {
  return [...value].length;
}

export function reviewPlayerName(candidate: string): PlayerNameReview {
  const normalizedName = candidate.trim().replace(/\s+/g, ' ');
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
  const words = normalizedName.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.some((word) => REJECTED_NAME_WORDS.has(word))) {
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

export class LeaderboardService {
  readonly mode: 'public' | 'local';

  constructor(
    private readonly localStore: LocalLeaderboardStore,
    private readonly apiBaseUrl = '',
  ) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.mode = this.apiBaseUrl ? 'public' : 'local';
  }

  async list(query: LeaderboardQuery, limit = 25): Promise<LeaderboardEntry[]> {
    if (!this.apiBaseUrl) return this.localStore.list(query, limit);
    const url = new URL(`${this.apiBaseUrl}/entries`, location.origin);
    url.searchParams.set('scope', query.scope);
    url.searchParams.set('difficulty', query.difficulty);
    url.searchParams.set('limit', String(limit));
    if (query.scope === 'level') url.searchParams.set('levelId', query.levelId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Leaderboard unavailable (${response.status}).`);
    const body: unknown = await response.json();
    const entries = Array.isArray(body)
      ? body
      : body && typeof body === 'object' && Array.isArray((body as { entries?: unknown }).entries)
        ? (body as { entries: unknown[] }).entries
        : [];
    return rankLeaderboardEntries(entries.filter(isLeaderboardEntry), query).slice(0, limit);
  }

  async submit(name: string, draft: LeaderboardDraft, proof: LeaderboardSubmitProof): Promise<LeaderboardEntry> {
    const review = reviewPlayerName(name);
    if (!review.allowed || !review.normalizedName) throw new Error(review.reason ?? 'Callsign was rejected.');
    if (!this.apiBaseUrl) return this.localStore.submit(review.normalizedName, draft);
    const response = await fetch(`${this.apiBaseUrl}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: review.normalizedName, score: draft, proof }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Score submission failed (${response.status}).`;
      throw new Error(reason);
    }
    const entry = body && typeof body === 'object' && 'entry' in body
      ? (body as { entry: unknown }).entry
      : body;
    if (!isLeaderboardEntry(entry)) throw new Error('Leaderboard returned an invalid score.');
    return entry;
  }
}

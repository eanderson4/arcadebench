import type { SmilefallGameClient, NormalizedScoreEntry, ScorePublication } from './game-client';

export type SmilefallDifficultyId = 'giggle' | 'chuckle' | 'guffaw' | 'cackle';
export type LeaderboardScope = 'arcade' | 'level';

interface SummaryBase {
  difficulty: SmilefallDifficultyId;
  score: number;
  totalTicks: number;
  popped: number;
}

export interface ArcadeLeaderboardResult extends SummaryBase {
  scope: 'arcade';
  stageReached: number;
  stagesCleared: number;
  completed: boolean;
}

export interface LevelLeaderboardResult extends SummaryBase {
  scope: 'level';
  levelId: string;
  won: boolean;
  caught: number;
}

export type SmilefallLeaderboardResult = ArcadeLeaderboardResult | LevelLeaderboardResult;
export type LeaderboardQuery =
  | { scope: 'arcade'; difficulty: SmilefallDifficultyId }
  | { scope: 'level'; difficulty: SmilefallDifficultyId; levelId: string };

export interface LeaderboardEntry {
  id: string;
  name: string;
  createdAt: string;
  result: SmilefallLeaderboardResult;
}

export interface SubmissionResult {
  entry: LeaderboardEntry;
  publication: ScorePublication | null;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LOCAL_KEY = 'arcadebench.smilefall.leaderboard.v1';
const NAME_MAX = 16;
const PUBLICATION_POLICY = 'top50-social-v1';
const REJECTED_NAME_WORDS = new Set(['bitch', 'cunt', 'fuck', 'hitler', 'nazi', 'nigger', 'shit']);

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function difficulty(value: unknown): value is SmilefallDifficultyId {
  return value === 'giggle' || value === 'chuckle' || value === 'guffaw' || value === 'cackle';
}

export function reviewPlayerName(candidate: string): { allowed: boolean; normalizedName?: string; reason?: string } {
  const normalizedName = candidate.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalizedName.length === 0) return { allowed: false, reason: 'Enter a callsign.' };
  if ([...normalizedName].length > NAME_MAX) return { allowed: false, reason: `Use ${NAME_MAX} characters or fewer.` };
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

export function isSmilefallResult(value: unknown): value is SmilefallLeaderboardResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Partial<SmilefallLeaderboardResult>;
  if (!difficulty(result.difficulty)
    || !finiteNonNegative(result.score)
    || !finiteNonNegative(result.totalTicks)
    || !finiteNonNegative(result.popped)) return false;
  if (result.scope === 'arcade') {
    return finiteNonNegative(result.stageReached)
      && finiteNonNegative(result.stagesCleared)
      && typeof result.completed === 'boolean';
  }
  return result.scope === 'level'
    && typeof result.levelId === 'string'
    && typeof result.won === 'boolean'
    && finiteNonNegative(result.caught);
}

export function adaptLeaderboardEntry(value: NormalizedScoreEntry<unknown>): LeaderboardEntry | null {
  if (!value || typeof value.id !== 'string' || value.id.length === 0
    || typeof value.playerName !== 'string' || value.playerName.length === 0
    || typeof value.createdAt !== 'string' || !isSmilefallResult(value.result)) return null;
  return { id: value.id, name: value.playerName, createdAt: value.createdAt, result: value.result };
}

function compareResults(first: SmilefallLeaderboardResult, second: SmilefallLeaderboardResult): number {
  if (first.scope === 'arcade' && second.scope === 'arcade') {
    return Number(second.completed) - Number(first.completed)
      || second.stagesCleared - first.stagesCleared
      || second.score - first.score
      || first.totalTicks - second.totalTicks
      || first.popped - second.popped;
  }
  if (first.scope === 'level' && second.scope === 'level') {
    return Number(second.won) - Number(first.won)
      || second.score - first.score
      || first.totalTicks - second.totalTicks
      || first.popped - second.popped
      || second.caught - first.caught;
  }
  return first.scope.localeCompare(second.scope);
}

function matches(entry: LeaderboardEntry, query: LeaderboardQuery): boolean {
  const result = entry.result;
  return result.scope === query.scope
    && result.difficulty === query.difficulty
    && (query.scope !== 'level' || result.scope === 'level' && result.levelId === query.levelId);
}

function localId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class LocalLeaderboardStore {
  constructor(private readonly storage: StorageLike, private readonly key = LOCAL_KEY) {}

  all(): LeaderboardEntry[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(this.key) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is LeaderboardEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<LeaderboardEntry>;
        return typeof candidate.id === 'string' && typeof candidate.name === 'string'
          && typeof candidate.createdAt === 'string' && isSmilefallResult(candidate.result);
      });
    } catch {
      return [];
    }
  }

  list(query: LeaderboardQuery, limit = 50): LeaderboardEntry[] {
    return this.all().filter((entry) => matches(entry, query)).sort((a, b) =>
      compareResults(a.result, b.result) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    ).slice(0, limit);
  }

  submit(name: string, result: SmilefallLeaderboardResult): LeaderboardEntry {
    const review = reviewPlayerName(name);
    if (!review.allowed || !review.normalizedName) throw new Error(review.reason ?? 'Callsign was rejected.');
    const entry: LeaderboardEntry = {
      id: localId(),
      name: review.normalizedName,
      createdAt: new Date().toISOString(),
      result,
    };
    this.storage.setItem(this.key, JSON.stringify([entry, ...this.all()].slice(0, 250)));
    return entry;
  }
}

export class SmilefallLeaderboardService {
  readonly mode: 'public' | 'local';
  private recentSubmission?: { entry: LeaderboardEntry; rank: number };

  constructor(private readonly local: LocalLeaderboardStore, private readonly client?: SmilefallGameClient) {
    this.mode = client ? 'public' : 'local';
  }

  async list(query: LeaderboardQuery, limit = 50): Promise<LeaderboardEntry[]> {
    if (!this.client) return this.local.list(query, limit);
    const page = await this.client.leaderboards.list<NormalizedScoreEntry<unknown>>({
      boardId: query.scope,
      filters: {
        difficulty: query.difficulty,
        ...(query.scope === 'level' ? { levelId: query.levelId } : {}),
      },
      limit,
    });
    const entries = page.entries.map(adaptLeaderboardEntry).filter((entry): entry is LeaderboardEntry => entry !== null);
    const recent = this.recentSubmission;
    if (!recent || !matches(recent.entry, query) || recent.rank > limit) return entries;
    if (entries.some((entry) => entry.id === recent.entry.id)) {
      this.recentSubmission = undefined;
      return entries;
    }
    // Board GETs are briefly cacheable. Keep the accepted row visible during
    // that window so the post-score screen always includes the score just saved.
    return [...entries, recent.entry].sort((a, b) =>
      compareResults(a.result, b.result) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    ).slice(0, limit);
  }

  async submit(options: {
    name: string;
    result: SmilefallLeaderboardResult;
    proof: unknown;
    runId?: string;
    socialMedia: boolean;
  }): Promise<SubmissionResult> {
    const review = reviewPlayerName(options.name);
    if (!review.allowed || !review.normalizedName) throw new Error(review.reason ?? 'Callsign was rejected.');
    if (!this.client) return { entry: this.local.submit(review.normalizedName, options.result), publication: null };
    if (!options.runId) throw new Error('This was an unranked run. Start a new ranked attempt.');
    const submission = await this.client.leaderboards.submit({
      boardId: options.result.scope,
      runId: options.runId,
      playerName: review.normalizedName,
      score: options.result,
      proof: options.proof,
      publication: { policyVersion: PUBLICATION_POLICY, socialMedia: options.socialMedia === true },
    });
    const entry = adaptLeaderboardEntry(submission.entry);
    if (!entry) throw new Error('Leaderboard returned an invalid score.');
    const publication = submission.publication && Number.isInteger(submission.publication.rankAtSubmission)
      ? submission.publication
      : null;
    if (publication) this.recentSubmission = { entry, rank: publication.rankAtSubmission };
    return { entry, publication };
  }
}

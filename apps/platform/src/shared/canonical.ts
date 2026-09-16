import { canonicalStringify } from '../crypto';
import { ApiError } from '../http';
import {
  CONTEXT_VALUE_MAX_LENGTH,
  RANK_COMPONENT_COUNT,
  type BoardDefinition,
  type FlatContext,
} from './types';

/**
 * A board instance is identified by game, immutable authority and
 * ranking-policy version, season, board ID, and canonical flat context. SQL
 * (migrations/0004_shared_platform.sql) and TypeScript must produce identical
 * bytes for the same instance, so both sides build the same JSON tuple with
 * sorted context keys and no whitespace.
 */
export interface BoardKeyParts {
  gameId: string;
  gameVersion: string;
  authorityId: string;
  rankingPolicyVersion: string;
  seasonId: string;
  boardId: string;
  context: FlatContext;
}

export function canonicalBoardKey(parts: BoardKeyParts): string {
  return canonicalStringify([
    parts.gameId,
    parts.gameVersion,
    parts.authorityId,
    parts.rankingPolicyVersion,
    parts.seasonId,
    parts.boardId,
    sortFlatContext(parts.context),
  ]);
}

export function sortFlatContext(context: FlatContext): FlatContext {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(context).sort()) sorted[key] = context[key]!;
  return sorted;
}

export function canonicalContextJson(context: FlatContext): string {
  return canonicalStringify(sortFlatContext(context));
}

/**
 * Validates a registered board's context. Unregistered filters are rejected so
 * one field, difficulty, or mode can never silently compete on another board.
 */
export function resolveFlatContext(
  board: BoardDefinition,
  raw: Record<string, unknown>,
): FlatContext {
  const registered = new Set(board.contextFields);
  const context: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!registered.has(key)) {
      throw new ApiError(400, `${boardLabel(board, key)} filter is not registered for this board.`);
    }
    if (typeof value !== 'string' || value.length === 0 || value.length > CONTEXT_VALUE_MAX_LENGTH) {
      throw new ApiError(400, `${boardLabel(board, key)} filter is invalid.`);
    }
    context[key] = value;
  }
  for (const field of board.contextFields) {
    if (context[field] === undefined) {
      throw new ApiError(400, `${boardLabel(board, field)} filter is required.`);
    }
  }
  return context;
}

function boardLabel(board: BoardDefinition, field: string): string {
  return board.contextFieldLabels[field] ?? field;
}

/** Filters only the registered `filter.*` query keys, rejecting anything else. */
export function filtersFromQuery(board: BoardDefinition, url: URL): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith('filter.')) continue;
    const field = key.slice('filter.'.length);
    if (field === '') throw new ApiError(400, 'Leaderboard filters are invalid.');
    if (raw[field] !== undefined) throw new ApiError(400, 'Leaderboard filters are invalid.');
    raw[field] = value;
  }
  return resolveFlatContext(board, raw) as Record<string, string>;
}

/** Bounded ascending rank vector: at most eight finite values, zero padded. */
export function normalizeRankComponents(values: readonly number[]): number[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > RANK_COMPONENT_COUNT) {
    throw new Error(`A rank vector needs one to ${RANK_COMPONENT_COUNT} components.`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Rank components must be finite numbers.');
    }
    return value;
  });
  while (normalized.length < RANK_COMPONENT_COUNT) normalized.push(0);
  return normalized;
}

export function rankComponentColumns(): readonly string[] {
  return Array.from({ length: RANK_COMPONENT_COUNT }, (_, index) => `rank_${index + 1}`);
}

/** The one shared ordering: rank vector, then stable created-at and ID ties. */
export function orderByClause(prefix = ''): string {
  return [
    ...rankComponentColumns().map((column) => `${prefix}${column} ASC`),
    `${prefix}created_at ASC`,
    `${prefix}id ASC`,
  ].join(', ');
}

/** Row-value comparison placing a candidate against the stored ordering. */
export function placementPredicate(alias = 'e'): string {
  const columns = [...rankComponentColumns().map((column) => `${alias}.${column}`), `${alias}.created_at`, `${alias}.id`];
  return `(${columns.join(', ')}) < (${columns.map(() => '?').join(', ')})`;
}

export function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError(400, 'URL is invalid.');
  }
}

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
}

/**
 * Leaderboard pages keep the legacy offset cursor encoding so existing v1
 * clients keep working, and stay bounded so a page cannot be arbitrarily deep.
 */
export function encodeOffsetCursor(offset: number): string {
  return base64Url(`offset:${offset}`);
}

export function decodeOffsetCursor(value: string | null): number {
  if (!value) return 0;
  try {
    const decoded = fromBase64Url(value);
    if (!/^offset:\d+$/u.test(decoded)) throw new Error('bad cursor');
    const offset = Number(decoded.slice('offset:'.length));
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) throw new Error('bad cursor');
    return offset;
  } catch {
    throw new ApiError(400, 'Leaderboard cursor is invalid.');
  }
}

export interface ActivityCursor {
  occurredAt: string;
  id: string;
}

/** Activity pages use a stable timestamp/ID keyset cursor over the shared feed. */
export function encodeActivityCursor(cursor: ActivityCursor): string {
  return base64Url(`activity:${cursor.occurredAt}:${cursor.id}`);
}

export function decodeActivityCursor(value: string | null): ActivityCursor | null {
  if (!value) return null;
  try {
    const decoded = fromBase64Url(value);
    if (!decoded.startsWith('activity:')) throw new Error('bad cursor');
    // The timestamp contains colons, so the ID separator is the last one.
    const separator = decoded.lastIndexOf(':');
    if (separator < 0) throw new Error('bad cursor');
    const occurredAt = decoded.slice('activity:'.length, separator);
    const id = decoded.slice(separator + 1);
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(occurredAt)) throw new Error('bad cursor');
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id)) throw new Error('bad cursor');
    return { occurredAt, id };
  } catch {
    throw new ApiError(400, 'Activity cursor is invalid.');
  }
}

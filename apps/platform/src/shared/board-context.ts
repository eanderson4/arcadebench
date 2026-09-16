import type { GameAdapter } from './types';

export function parseContextJson(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored board context is not an object.');
  }
  const context: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof entry !== 'string') throw new Error('Stored board context values must be strings.');
    Object.defineProperty(context, key, { value: entry, enumerable: true, configurable: true, writable: true });
  }
  return context;
}

/**
 * Boards and entries describe themselves through the registered adapter. A
 * context that no longer resolves (for example a retired field) falls back to
 * the stored board metadata instead of inventing a title or a link.
 */
export function describeStoredBoard(
  adapter: GameAdapter,
  boardId: string,
  context: Record<string, string>,
  fallbackLabel: string,
): { label: string; path: string } {
  try {
    return adapter.describeBoard(boardId, context);
  } catch {
    return { label: fallbackLabel, path: adapter.gamePath };
  }
}

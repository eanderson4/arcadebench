import { ApiError } from '../http';
import { partitionAdapter } from '../partition-adapter';
import { maltlinePlatformAdapter } from '../maltline-platform-adapter';
import { smilefallPlatformAdapter } from '../smilefall-platform-adapter';
import type { GameAdapter } from './types';

/**
 * Games join ArcadeBench by registering an adapter. Nothing in the shared
 * routes, queries, or feed switches on a game ID, so adding a game never edits
 * the homepage or the common activity query.
 */
export class GameRegistry {
  private readonly adapters = new Map<string, GameAdapter>();

  constructor(adapters: readonly GameAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: GameAdapter): void {
    const existing = this.adapters.get(adapter.gameId);
    if (existing && existing !== adapter) {
      throw new Error(`A different adapter is already registered for ${adapter.gameId}.`);
    }
    this.adapters.set(adapter.gameId, adapter);
  }

  get(gameId: string): GameAdapter | undefined {
    return this.adapters.get(gameId);
  }

  require(gameId: string): GameAdapter {
    const adapter = this.adapters.get(gameId);
    if (!adapter) throw new ApiError(404, 'That game is not registered with ArcadeBench.');
    return adapter;
  }

  list(): GameAdapter[] {
    return [...this.adapters.values()];
  }
}

/** The independently verified game adapters compiled into this release. */
export const defaultRegistry = new GameRegistry([
  partitionAdapter,
  maltlinePlatformAdapter,
  smilefallPlatformAdapter,
]);

export function registerGameAdapter(adapter: GameAdapter): void {
  defaultRegistry.register(adapter);
}

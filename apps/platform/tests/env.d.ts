import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    // Mirrors the Worker bindings declared in src/env.ts so tests can call the
    // platform services with the same environment shape the Worker uses.
    interface Env {
      DB: D1Database;
      REPLAYS: R2Bucket;
      ASSETS: Fetcher;
      AI: Ai;
      MALTLINE_ADMISSION_RATE_LIMITER: RateLimit;
      TEST_MIGRATIONS: D1Migration[];
      COOKIE_SIGNING_SECRET: string;
    }

    interface GlobalProps {
      mainModule: typeof import('../src/worker');
    }
  }
}

export {};

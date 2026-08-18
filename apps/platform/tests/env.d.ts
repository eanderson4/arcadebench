import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      REPLAYS: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
      COOKIE_SIGNING_SECRET: string;
    }

    interface GlobalProps {
      mainModule: typeof import('../src/worker');
    }
  }
}

export {};

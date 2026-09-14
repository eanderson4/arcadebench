import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const migrationsPath = fileURLToPath(new URL('./migrations', import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: './src/worker.ts',
      miniflare: {
        bindings: {
          COOKIE_SIGNING_SECRET: 'test-only-cookie-secret-with-at-least-32-characters',
          TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
        },
        d1Databases: ['DB'],
        r2Buckets: ['REPLAYS'],
        ratelimits: {
          MALTLINE_ADMISSION_RATE_LIMITER: {
            namespace_id: '8172603',
            // Route tests inject exact outcomes; keep the shared workerd binding
            // high enough that unrelated integration cases cannot exhaust it.
            simple: { limit: 10_000, period: 60 },
          },
        },
        serviceBindings: {
          ASSETS: () => new Response('test asset', { status: 200 }),
        },
      },
    })),
  ],
});

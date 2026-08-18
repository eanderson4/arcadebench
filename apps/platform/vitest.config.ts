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
        serviceBindings: {
          ASSETS: () => new Response('test asset', { status: 200 }),
        },
      },
    })),
  ],
});

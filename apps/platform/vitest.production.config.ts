import { readFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import { PRODUCTION_MIGRATIONS } from '../../scripts/prepare-production-migrations.mjs';

const expected = PRODUCTION_MIGRATIONS;
const migrations = new URL('./production-migrations/', import.meta.url);

export default defineConfig({
  test: { include: ['tests/production-entry.test.ts'] },
  plugins: [cloudflareTest(async () => {
    const names = (await readdir(migrations)).sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error('Production migration allowlist drifted.');
    for (const name of names) {
      const link = new URL(name, migrations);
      if (!(await lstat(link)).isFile()
        || !(await readFile(link)).equals(await readFile(new URL(`./migrations/${name}`, import.meta.url)))) {
        throw new Error(`Production migration ${name} must be a byte-identical regular copy of its source.`);
      }
    }
    return {
      main: './src/production.ts',
      miniflare: {
        bindings: {
          COOKIE_SIGNING_SECRET: 'test-only-cookie-secret-with-at-least-32-characters',
          TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(migrations)),
        },
        d1Databases: ['DB'], r2Buckets: ['REPLAYS'],
        ratelimits: { MALTLINE_ADMISSION_RATE_LIMITER: {
          namespace_id: '8172603', simple: { limit: 10_000, period: 60 },
        } },
        serviceBindings: { ASSETS: () => new Response('production test asset') },
      },
    };
  })],
});

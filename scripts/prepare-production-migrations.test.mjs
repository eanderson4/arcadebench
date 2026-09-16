import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { prepareProductionMigrations, PRODUCTION_MIGRATIONS } from './prepare-production-migrations.mjs';
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'production-migrations-')); roots.push(root);
  await mkdir(resolve(root, 'apps/platform/migrations'), { recursive: true });
  for (const name of [...PRODUCTION_MIGRATIONS, '0003_maltline_generation_2.sql']) {
    await writeFile(resolve(root, 'apps/platform/migrations', name), `-- ${name}\nSELECT 1;\n`);
  }
  return root;
}
test('prepares only regular byte-identical approved migrations, excluding 0003', async () => {
  const root = await fixture();
  assert.deepEqual(await prepareProductionMigrations(root), PRODUCTION_MIGRATIONS);
  assert.deepEqual(await prepareProductionMigrations(root, { check: true }), PRODUCTION_MIGRATIONS);
  const copy = resolve(root, 'apps/platform/production-migrations', PRODUCTION_MIGRATIONS[2]);
  assert.equal(await readFile(copy, 'utf8'), `-- ${PRODUCTION_MIGRATIONS[2]}\nSELECT 1;\n`);
  await assert.rejects(readFile(resolve(root, 'apps/platform/production-migrations/0003_maltline_generation_2.sql')), { code: 'ENOENT' });
});
test('check rejects drift and preparation refreshes it from the authoritative source', async () => {
  const root = await fixture(); await prepareProductionMigrations(root);
  await writeFile(resolve(root, 'apps/platform/migrations', PRODUCTION_MIGRATIONS[2]), '-- newer reviewed shared migration\n');
  await assert.rejects(prepareProductionMigrations(root, { check: true }), /differs from its source/);
  await prepareProductionMigrations(root);
  await prepareProductionMigrations(root, { check: true });
});
test('fails closed on extra SQL, symlink copies, or missing approved sources', async () => {
  const root = await fixture(); await prepareProductionMigrations(root);
  const extra = resolve(root, 'apps/platform/production-migrations/0003_maltline_generation_2.sql');
  await writeFile(extra, 'SELECT 1;');
  await assert.rejects(prepareProductionMigrations(root), /Unreviewed production migrations/);
  await rm(extra);
  const target = resolve(root, 'apps/platform/production-migrations', PRODUCTION_MIGRATIONS[0]);
  await rm(target); await symlink(`../migrations/${PRODUCTION_MIGRATIONS[0]}`, target);
  await assert.rejects(prepareProductionMigrations(root), /Wrangler skips symlinks/);
  await rm(target); await rm(resolve(root, 'apps/platform/migrations', PRODUCTION_MIGRATIONS[0]));
  await assert.rejects(prepareProductionMigrations(root), { code: 'ENOENT' });
});

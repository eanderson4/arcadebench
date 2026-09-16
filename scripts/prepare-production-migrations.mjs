import { mkdir, readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_MIGRATIONS = Object.freeze([
  '0001_public_platform.sql',
  '0002_replay_retention.sql',
  '0004_shared_platform.sql',
  '0005_maltline_cabinet.sql',
  '0006_maltline_cabinet_progression.sql',
]);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Wrangler skips symlink files. Materialize only the reviewed SQL subset. */
export async function prepareProductionMigrations(root = repositoryRoot, { check = false } = {}) {
  const destination = resolve(root, 'apps/platform/production-migrations');
  const source = resolve(root, 'apps/platform/migrations');
  if (!check) await mkdir(destination, { recursive: true });
  const names = await readdir(destination);
  const extras = names.filter(name => !PRODUCTION_MIGRATIONS.includes(name));
  if (extras.length) throw new Error(`Unreviewed production migrations: ${extras.join(', ')}`);
  for (const name of PRODUCTION_MIGRATIONS) {
    const sourcePath = resolve(source, name);
    if (!(await lstat(sourcePath)).isFile()) throw new Error(`${name} source must be a regular SQL file.`);
    const bytes = await readFile(sourcePath);
    if (!bytes.length) throw new Error(`${name} source is empty.`);
    const target = resolve(destination, name);
    const metadata = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (metadata && !metadata.isFile()) throw new Error(`${name} production copy must be a regular file; Wrangler skips symlinks.`);
    const existing = metadata ? await readFile(target) : null;
    if (!existing?.equals(bytes)) {
      if (check) throw new Error(`${name} production copy differs from its source; run the preparation script.`);
      await writeFile(target, bytes);
    }
  }
  return [...PRODUCTION_MIGRATIONS];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = await prepareProductionMigrations(repositoryRoot, { check: process.argv.includes('--check') });
  console.log(`Production migrations ${process.argv.includes('--check') ? 'verified' : 'prepared'}: ${names.join(', ')}`);
}

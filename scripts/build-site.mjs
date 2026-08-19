import { cp, copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const partitionDist = resolve(repositoryRoot, 'games/partition/dist');
const partitionEntry = resolve(partitionDist, 'src/viewer/index.html');
const siteDist = resolve(repositoryRoot, 'dist/site');
const deployAssets = resolve(repositoryRoot, 'deploy');

try {
  await stat(partitionEntry);
} catch {
  throw new Error('Partition has not been built. Run npm run build --workspace=@arcadebench/partition first.');
}

await rm(siteDist, { recursive: true, force: true });
await mkdir(siteDist, { recursive: true });
await cp(partitionDist, siteDist, { recursive: true });

// Cabinet 01 is also the arcade entrance until the cross-game launcher ships.
// Keep the permanent game route live now so that introducing the launcher later
// does not invalidate shared Partition URLs.
await mkdir(resolve(siteDist, 'partition'), { recursive: true });
await copyFile(partitionEntry, resolve(siteDist, 'index.html'));
await copyFile(partitionEntry, resolve(siteDist, 'partition/index.html'));

await mkdir(resolve(siteDist, 'privacy'), { recursive: true });
await copyFile(resolve(deployAssets, 'privacy.html'), resolve(siteDist, 'privacy/index.html'));
await mkdir(resolve(siteDist, 'terms'), { recursive: true });
await copyFile(resolve(deployAssets, 'terms.html'), resolve(siteDist, 'terms/index.html'));
await copyFile(resolve(deployAssets, 'llms.txt'), resolve(siteDist, 'llms.txt'));

await copyFile(resolve(deployAssets, '_headers'), resolve(siteDist, '_headers'));
await copyFile(resolve(deployAssets, '_redirects'), resolve(siteDist, '_redirects'));

console.log(`ArcadeBench site assembled at ${siteDist}`);

import { readFile, lstat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutputDirectory = resolve(repositoryRoot, '.wrangler/dry-run');

// This is a regression ceiling, not the provider limit. The reviewed minified
// three-game platform bundle is 199,372 bytes, leaving about 128 KiB below this
// ceiling while source checks continue to prohibit broad barrels and browser code.
export const MAX_WORKER_JAVASCRIPT_BYTES = 320 * 1024;
const MAX_SOURCE_MAP_BYTES = 2 * 1024 * 1024;
const PROHIBITED_MALTLINE_SOURCE = /(?:^|\/)games\/maltline\/src\/(?:telemetry|experiments|viewer|testing)(?:\/|$)/u;
const MALTLINE_ROOT_BARREL = /(?:^|\/)games\/maltline\/src\/index\.ts$/u;
const PROHIBITED_PARTITION_SOURCE = /(?:^|\/)games\/partition\/src\/(?:benchmark|viewer|testing|runtime)(?:\/|$)/u;
const PARTITION_ROOT_BARREL = /(?:^|\/)games\/partition\/src\/index\.ts$/u;
const PROHIBITED_SMILEFALL_SOURCE = /(?:^|\/)games\/smilefall\/src\/(?:viewer|runtime)(?:\/|$)/u;
const SMILEFALL_ROOT_BARREL = /(?:^|\/)games\/smilefall\/src\/index\.ts$/u;
const PROHIBITED_NODE_BUILTIN = /["']node:(?:fs|path)(?:\/[^"']*)?["']/u;
const REQUIRED_SOURCES = Object.freeze([
  'apps/platform/src/worker.ts',
  'apps/platform/src/production.ts',
  'apps/platform/src/v2-api.ts',
  'games/maltline/src/core/cabinet-authority.ts',
  'games/maltline/src/core/cabinet-proof.ts',
  'apps/platform/src/partition-verifier.ts',
  'games/partition/src/core/engine.ts',
  'games/partition/src/core/version.ts',
  'games/partition/src/levels/campaign.ts',
  'games/maltline/src/core/authority.ts',
  'games/maltline/src/core/proof.ts',
  'apps/platform/src/smilefall-platform-adapter.ts',
  'games/smilefall/src/verifier.ts',
  'games/smilefall/src/core/engine.ts',
  'games/smilefall/src/core/version.ts',
  'games/smilefall/src/levels/catalog.ts',
]);

function fail(message) {
  throw new Error(`Worker bundle audit failed: ${message}`);
}

async function checkedFile(path, maximumBytes, label) {
  const metadata = await lstat(path).catch(() => null);
  if (metadata === null) fail(`${label} is missing at ${path}`);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  if (metadata.size === 0) fail(`${label} is empty`);
  if (metadata.size > maximumBytes) fail(`${label} is ${metadata.size} bytes, over ${maximumBytes}`);
  return { bytes: await readFile(path), size: metadata.size };
}

function sourceEndsWith(source, suffix) {
  return source === suffix || source.endsWith(`/${suffix}`);
}

export async function auditWorkerBundle(outputDirectory = defaultOutputDirectory) {
  const workerPath = resolve(outputDirectory, 'worker.js');
  const mapPath = resolve(outputDirectory, 'worker.js.map');
  const worker = await checkedFile(workerPath, MAX_WORKER_JAVASCRIPT_BYTES, 'worker.js');
  const mapFile = await checkedFile(mapPath, MAX_SOURCE_MAP_BYTES, 'worker.js.map');
  const workerText = worker.bytes.toString('utf8');
  if (!workerText.endsWith('//# sourceMappingURL=worker.js.map\n')) {
    fail('worker.js does not identify its external worker.js.map');
  }
  if (PROHIBITED_NODE_BUILTIN.test(workerText)) {
    fail('worker.js contains a prohibited node:fs or node:path dependency');
  }

  let sourceMap;
  try {
    sourceMap = JSON.parse(mapFile.bytes.toString('utf8'));
  } catch {
    fail('worker.js.map is not valid JSON');
  }
  if (sourceMap === null || Array.isArray(sourceMap) || typeof sourceMap !== 'object') {
    fail('worker.js.map must be an object');
  }
  if (sourceMap.version !== 3 || !Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0) {
    fail('worker.js.map must be a non-empty version-3 source map');
  }
  if (!Array.isArray(sourceMap.sourcesContent)
    || sourceMap.sourcesContent.length !== sourceMap.sources.length
    || sourceMap.sourcesContent.some((value) => value !== null && typeof value !== 'string')) {
    fail('worker.js.map must retain one string/null sourcesContent entry per source');
  }
  if (typeof sourceMap.mappings !== 'string' || sourceMap.mappings.length === 0) {
    fail('worker.js.map has no mappings');
  }

  const sources = sourceMap.sources.map((source, index) => {
    if (typeof source !== 'string' || source.length === 0 || source.length > 512) {
      fail(`worker.js.map source ${index} is not a bounded string`);
    }
    return source.replaceAll('\\', '/');
  });
  if (new Set(sources).size !== sources.length) fail('worker.js.map contains duplicate sources');
  const prohibited = sources.filter((source) => (
    PROHIBITED_MALTLINE_SOURCE.test(source)
    || MALTLINE_ROOT_BARREL.test(source)
    || PROHIBITED_PARTITION_SOURCE.test(source)
    || PARTITION_ROOT_BARREL.test(source)
    || PROHIBITED_SMILEFALL_SOURCE.test(source)
    || SMILEFALL_ROOT_BARREL.test(source)
  ));
  if (prohibited.length > 0) fail(`production graph contains prohibited game sources: ${prohibited.join(', ')}`);
  if (sourceMap.sourcesContent.some((content) => (
    typeof content === 'string' && PROHIBITED_NODE_BUILTIN.test(content)
  ))) {
    fail('worker.js.map source content contains a prohibited node:fs or node:path dependency');
  }
  for (const required of REQUIRED_SOURCES) {
    if (!sources.some((source) => sourceEndsWith(source, required))) {
      fail(`worker.js.map omits required source ${required}`);
    }
  }

  return Object.freeze({
    javascriptBytes: worker.size,
    javascriptGzipBytes: gzipSync(worker.bytes).length,
    sourceMapBytes: mapFile.size,
    sourceCount: sources.length,
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await auditWorkerBundle();
  console.log(
    `Worker dry-run bundle passed: ${result.javascriptBytes} bytes (${result.javascriptGzipBytes} gzip), ${result.sourceCount} reviewed sources, ${result.sourceMapBytes}-byte source map.`,
  );
}

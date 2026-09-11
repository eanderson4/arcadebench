import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONTRACT } from './site-contract.mjs';
import {
  renderHeaders,
  renderRedirects,
  renderRobots,
  renderSitemap,
} from './site-contract-render.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryReal = await realpath(repositoryRoot);
const siteDist = resolve(repositoryRoot, SITE_CONTRACT.wranglerAssets.directory);
const copiedOutputs = new Set();
let copiedBytes = 0;

function containedBy(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function checkedSource(logicalPath) {
  const source = resolve(repositoryRoot, logicalPath);
  if (!containedBy(repositoryRoot, source)) throw new Error(`Source path escapes repository: ${logicalPath}`);
  let metadata;
  try {
    metadata = await lstat(source);
  } catch {
    throw new Error(`Required site source is missing: ${logicalPath}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Site source must be a regular non-symlink file: ${logicalPath}`);
  }
  const resolvedSource = await realpath(source);
  if (!containedBy(repositoryReal, resolvedSource)) {
    throw new Error(`Site source resolves outside repository: ${logicalPath}`);
  }
  const maximum = SITE_CONTRACT.limits.maximumBytesByExtension[extname(logicalPath)];
  if (maximum === undefined) throw new Error(`Site source type is not allowed: ${logicalPath}`);
  if (metadata.size > maximum) {
    throw new Error(`Site source exceeds its ${maximum}-byte ceiling: ${logicalPath}`);
  }
  return { path: resolvedSource, size: metadata.size };
}

async function copyChecked(sourceLogical, outputLogical) {
  const source = await checkedSource(sourceLogical);
  const output = resolve(siteDist, outputLogical);
  if (!containedBy(siteDist, output)) throw new Error(`Output path escapes site root: ${outputLogical}`);
  if (copiedOutputs.has(outputLogical)) throw new Error(`Duplicate site output in contract: ${outputLogical}`);
  if (!Number.isSafeInteger(copiedBytes + source.size)) throw new Error('Site aggregate byte count overflowed');
  copiedBytes += source.size;
  copiedOutputs.add(outputLogical);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(source.path, output);
}

async function assertRenderedSource(logicalPath, expected) {
  const actual = await readFile((await checkedSource(logicalPath)).path, 'utf8');
  if (actual !== expected) {
    throw new Error(`${logicalPath} is not the exact rendering of scripts/site-contract.mjs`);
  }
}

await assertRenderedSource('deploy/_headers', renderHeaders());
await assertRenderedSource('deploy/_redirects', renderRedirects());
await assertRenderedSource('deploy/sitemap.xml', renderSitemap());
await assertRenderedSource('deploy/robots.txt', renderRobots());

await rm(siteDist, { recursive: true, force: true });
await mkdir(siteDist, { recursive: true });

for (const route of SITE_CONTRACT.routes) await copyChecked(route.source, route.output);
await copyChecked(SITE_CONTRACT.notFound.source, SITE_CONTRACT.notFound.output);
for (const file of SITE_CONTRACT.staticFiles) await copyChecked(file.source, file.output);

for (const group of SITE_CONTRACT.assetGroups) {
  const sourceDirectory = resolve(repositoryRoot, group.source);
  const directoryMetadata = await lstat(sourceDirectory).catch(() => null);
  if (directoryMetadata === null || !directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new Error(`Asset source must be a regular directory: ${group.source}`);
  }
  const directoryReal = await realpath(sourceDirectory);
  if (!containedBy(repositoryReal, directoryReal)) {
    throw new Error(`Asset source resolves outside repository: ${group.source}`);
  }
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Asset group ${group.id} contains a non-file entry: ${entry.name}`);
    }
  }
  const permitted = new Set();
  for (const rule of group.files) {
    const expression = new RegExp(rule.expression, 'u');
    const matches = names.filter((name) => expression.test(name));
    if (matches.length !== rule.count) {
      throw new Error(`Asset group ${group.id} expected ${rule.count} match(es) for ${rule.expression}, found ${matches.length}`);
    }
    for (const name of matches) {
      if (permitted.has(name)) throw new Error(`Asset ${group.id}/${name} matches multiple contract rules`);
      permitted.add(name);
    }
  }
  if (permitted.size !== names.length) {
    throw new Error(`Asset group ${group.id} contains unapproved files: ${names.filter((name) => !permitted.has(name)).join(', ')}`);
  }
  for (const name of names) await copyChecked(`${group.source}/${name}`, `${group.output}/${name}`);
}

if (copiedOutputs.size > SITE_CONTRACT.limits.maximumFiles) {
  throw new Error(`Site has ${copiedOutputs.size} files, over its ${SITE_CONTRACT.limits.maximumFiles}-file ceiling`);
}
if (copiedBytes > SITE_CONTRACT.limits.maximumTotalBytes) {
  throw new Error(`Site is ${copiedBytes} bytes, over its ${SITE_CONTRACT.limits.maximumTotalBytes}-byte ceiling`);
}

console.log(`ArcadeBench site assembled at ${siteDist} (${copiedOutputs.size} files, ${copiedBytes} bytes)`);

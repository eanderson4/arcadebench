import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { SITE_CONTRACT } from './site-contract.mjs';
import {
  cacheControlFor,
  renderHeaders,
  renderRedirects,
  renderRobots,
  renderSitemap,
} from './site-contract-render.mjs';
import { createBuiltSiteServer, builtSiteRoot } from './serve-built-site.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const forbiddenArtifactPath = /(?:^|\/)(?:src|tests?|testing|experiments)(?:\/|$)|(?:human-lab|visual-fixtures|p1-08-candidates)|\.(?:map|ts)$/iu;
const forbiddenArtifactText = /(?:maltline-human-lab-session|maltline-human-lab-ready|__maltlineHumanLabTestDriver|visual-fixtures\.html|p1-08-candidates|\/@vite\/client)/iu;

function check(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function filesUnder(root, failures) {
  const rootReal = await realpath(root);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const logical = relative(root, path).replaceAll(sep, '/');
      if (entry.isSymbolicLink()) {
        failures.push(`assembled site contains a symbolic link: ${logical}`);
        continue;
      }
      const resolved = await realpath(path);
      if (resolved !== rootReal && !resolved.startsWith(`${rootReal}${sep}`)) {
        failures.push(`assembled site entry escapes its root: ${logical}`);
        continue;
      }
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push({ absolute: path, logical });
      else failures.push(`assembled site contains an unsupported entry: ${logical}`);
    }
  }
  await visit(root);
  return files.sort((left, right) => left.logical.localeCompare(right.logical));
}

function htmlValue(contents, pattern) {
  return pattern.exec(contents)?.[1] ?? null;
}

function inspectHtml(contents, route, titles, failures) {
  const title = htmlValue(contents, /<title>([^<]+)<\/title>/u);
  const description = htmlValue(contents, /<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/u);
  const actualCanonical = htmlValue(contents, /<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/u);
  check(title !== null && title.trim().length > 0, `${route.pathname} lacks a title`, failures);
  check(description !== null && description.trim().length > 0, `${route.pathname} lacks a description`, failures);
  check(actualCanonical === route.canonical, `${route.pathname} canonical was ${actualCanonical ?? 'missing'}`, failures);
  check((contents.match(/<link\s+rel="canonical"/gu) ?? []).length === 1,
    `${route.pathname} must contain exactly one canonical`, failures);
  if (title !== null) {
    check(!titles.has(title), `${route.pathname} reuses title ${title}`, failures);
    titles.add(title);
  }
  if (route.social) {
    check(htmlValue(contents, /<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?>/u) === route.canonical,
      `${route.pathname} lacks its exact Open Graph URL`, failures);
    for (const property of ['og:title', 'og:description', 'og:type', 'og:site_name']) {
      check(new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]+"\\s*\\/?>`, 'u').test(contents),
        `${route.pathname} lacks ${property}`, failures);
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function referenceSourceFiles(group, actualFiles) {
  const sources = new Set();
  for (const pattern of group.referenceSources) {
    if (!pattern.includes('*')) {
      sources.add(pattern);
      continue;
    }
    const expression = new RegExp(`^${escapeRegExp(pattern).replace('\\*', '[^/]+')}$`, 'u');
    for (const file of actualFiles) if (expression.test(file)) sources.add(file);
  }
  return [...sources].sort();
}

async function validateReferences(root, group, actualFiles, failures) {
  const names = actualFiles
    .filter((file) => file.startsWith(`${group.output}/`))
    .map((file) => file.slice(group.output.length + 1));
  const expected = new Set(names.map((name) => `${group.referencePrefix}${name}`));
  const referenced = new Set();
  const matcher = new RegExp(`${escapeRegExp(group.referencePrefix)}[A-Za-z0-9._-]+`, 'gu');
  for (const source of referenceSourceFiles(group, actualFiles)) {
    const contents = await readFile(resolve(root, source), 'utf8');
    for (const match of contents.match(matcher) ?? []) referenced.add(match);
  }
  check(referenced.size > 0, `${group.id} has no production asset references`, failures);
  for (const asset of expected) check(referenced.has(asset), `${group.id} ships unreferenced asset ${asset}`, failures);
  for (const asset of referenced) check(expected.has(asset), `${group.id} references unshipped asset ${asset}`, failures);
}

const failures = [];
const root = builtSiteRoot;
const wranglerConfig = JSON.parse(await readFile(resolve(repositoryRoot, 'wrangler.jsonc'), 'utf8'));
const wranglerSchema = JSON.parse(await readFile(resolve(repositoryRoot, 'node_modules/wrangler/config-schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateWrangler = ajv.compile(wranglerSchema);
check(validateWrangler(wranglerConfig),
  `wrangler.jsonc failed its installed schema: ${ajv.errorsText(validateWrangler.errors)}`, failures);
check(wranglerConfig.$schema === './node_modules/wrangler/config-schema.json',
  'Wrangler config does not identify the installed schema', failures);
check(JSON.stringify(wranglerConfig.assets) === JSON.stringify(SITE_CONTRACT.wranglerAssets),
  'Wrangler static-asset routing differs from the site contract', failures);
check(JSON.stringify(wranglerConfig.routes) === JSON.stringify(SITE_CONTRACT.wranglerRoutes),
  'Wrangler canonical-host routes differ from the site contract', failures);

const files = await filesUnder(root, failures);
const actualFiles = files.map(({ logical }) => logical);
const expectedFiles = new Set([
  ...SITE_CONTRACT.routes.map(({ output }) => output),
  SITE_CONTRACT.notFound.output,
  ...SITE_CONTRACT.staticFiles.map(({ output }) => output),
]);
for (const group of SITE_CONTRACT.assetGroups) {
  const groupFiles = actualFiles.filter((file) => file.startsWith(`${group.output}/`));
  const names = groupFiles.map((file) => file.slice(group.output.length + 1));
  const permitted = new Set();
  for (const rule of group.files) {
    const expression = new RegExp(rule.expression, 'u');
    const matches = names.filter((name) => expression.test(name));
    check(matches.length === rule.count,
      `${group.id} expected ${rule.count} match(es) for ${rule.expression}, found ${matches.length}`, failures);
    for (const name of matches) {
      check(!permitted.has(name), `${group.id}/${name} matches multiple inventory rules`, failures);
      permitted.add(name);
      expectedFiles.add(`${group.output}/${name}`);
    }
  }
  check(permitted.size === names.length,
    `${group.id} contains unapproved files: ${names.filter((name) => !permitted.has(name)).join(', ')}`, failures);
}
check(actualFiles.length === expectedFiles.size
  && actualFiles.every((file) => expectedFiles.has(file)),
`assembled recursive inventory differs; unexpected=${actualFiles.filter((file) => !expectedFiles.has(file)).join(', ') || 'none'} missing=${[...expectedFiles].filter((file) => !actualFiles.includes(file)).join(', ') || 'none'}`,
failures);
check(files.length <= SITE_CONTRACT.limits.maximumFiles,
  `assembled site has ${files.length} files, over ${SITE_CONTRACT.limits.maximumFiles}`, failures);

let totalBytes = 0;
for (const file of files) {
  const metadata = await stat(file.absolute);
  const extension = extname(file.logical);
  const maximum = SITE_CONTRACT.limits.maximumBytesByExtension[extension];
  check(maximum !== undefined, `assembled file type is not allowed: ${file.logical}`, failures);
  if (maximum !== undefined) check(metadata.size <= maximum,
    `${file.logical} is ${metadata.size} bytes, over ${maximum}`, failures);
  check(Number.isSafeInteger(totalBytes + metadata.size), 'assembled byte total overflowed', failures);
  totalBytes += metadata.size;
  if (forbiddenArtifactPath.test(file.logical)) failures.push(`development artifact path leaked: ${file.logical}`);
  if (!textExtensions.has(extension)) continue;
  const contents = await readFile(file.absolute, 'utf8');
  if (forbiddenArtifactText.test(contents)) failures.push(`development artifact text leaked: ${file.logical}`);
}
check(totalBytes <= SITE_CONTRACT.limits.maximumTotalBytes,
  `assembled site is ${totalBytes} bytes, over ${SITE_CONTRACT.limits.maximumTotalBytes}`, failures);
for (const group of SITE_CONTRACT.assetGroups) await validateReferences(root, group, actualFiles, failures);

const titles = new Set();
const htmlByRoute = new Map();
for (const route of SITE_CONTRACT.routes) {
  const contents = await readFile(resolve(root, route.output), 'utf8');
  htmlByRoute.set(route.pathname, contents);
  inspectHtml(contents, route, titles, failures);
}
const launcher = htmlByRoute.get('/');
const partition = htmlByRoute.get('/partition/');
check(launcher !== partition, 'launcher is an accidental copy of Partition', failures);
check(launcher.includes('href="/partition/"') && launcher.includes('href="/maltline/"'),
  'launcher lacks direct permanent game links', failures);
check(!/<script\b/iu.test(launcher), 'launcher must not execute JavaScript', failures);
check(!/(?:\/api\/|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)/u.test(launcher),
  'launcher contains a network, API, or persistent-storage surface', failures);
check(!/(?:\/assets\/|\/maltline\/assets\/)[A-Za-z0-9._-]+/u.test(launcher),
  'launcher imports a game JavaScript or stylesheet asset', failures);
check(launcher.includes('href="/arcade.css"'), 'launcher lacks its site-owned stylesheet', failures);

const expectedSitemap = renderSitemap();
const expectedRobots = renderRobots();
const expectedHeaders = renderHeaders();
const expectedRedirects = renderRedirects();
check(await readFile(resolve(root, 'sitemap.xml'), 'utf8') === expectedSitemap,
  'assembled sitemap is not the exact contract rendering', failures);
check(await readFile(resolve(root, 'robots.txt'), 'utf8') === expectedRobots,
  'assembled robots.txt is not the exact contract rendering', failures);
check(await readFile(resolve(root, '_headers'), 'utf8') === expectedHeaders,
  'assembled _headers is not the exact contract rendering', failures);
check(await readFile(resolve(root, '_redirects'), 'utf8') === expectedRedirects,
  'assembled _redirects is not the exact contract rendering', failures);
const llms = await readFile(resolve(root, 'llms.txt'), 'utf8');
for (const { canonical } of SITE_CONTRACT.routes.filter(({ indexable }) => indexable)) {
  check(llms.includes(canonical), `llms.txt omits ${canonical}`, failures);
}

const server = createBuiltSiteServer(root);
await new Promise((resolveListening, rejectListening) => {
  server.once('error', rejectListening);
  server.listen(0, '127.0.0.1', resolveListening);
});
try {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('site smoke server did not bind');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of SITE_CONTRACT.routes) {
    const response = await fetch(`${origin}${route.pathname}`);
    check(response.status === 200, `${route.pathname} returned ${response.status}`, failures);
    const head = await fetch(`${origin}${route.pathname}`, { method: 'HEAD' });
    check(head.status === 200 && (await head.arrayBuffer()).byteLength === 0,
      `${route.pathname} HEAD did not return an empty 200`, failures);
  }
  for (const route of SITE_CONTRACT.routes.filter(({ pathname }) => pathname !== '/')) {
    const withoutSlash = route.pathname.slice(0, -1);
    const response = await fetch(`${origin}${withoutSlash}?probe=1`, { redirect: 'manual' });
    check(response.status === 307 && response.headers.get('location') === `${route.pathname}?probe=1`,
      `${withoutSlash} did not preserve its query in the slash redirect`, failures);
  }
  for (const redirect of SITE_CONTRACT.redirects) {
    const response = await fetch(`${origin}${redirect.from}?probe=1`, { redirect: 'manual' });
    check(response.status === redirect.status && response.headers.get('location') === `${redirect.to}?probe=1`,
      `${redirect.from} did not match its contract redirect`, failures);
  }
  for (const route of [
    '/missing-route', '/src/viewer/main.ts', '/maltline/human-lab.html',
    '/maltline/src/viewer/human-lab.html', '/@vite/client', '/_headers', '/_redirects',
    '/api/v1/health',
  ]) {
    const response = await fetch(`${origin}${route}`);
    check(response.status === 404, `${route} escaped the static 404 boundary with ${response.status}`, failures);
    check(response.headers.get('cache-control') === cacheControlFor(route),
      `${route} custom 404 differs from authored pathname cache matching`, failures);
  }
  const missingHead = await fetch(`${origin}/missing-route`, { method: 'HEAD' });
  check(missingHead.status === 404 && (await missingHead.arrayBuffer()).byteLength === 0,
    'unknown HEAD did not return an empty 404', failures);

  for (const group of SITE_CONTRACT.assetGroups) {
    const asset = actualFiles.find((file) => file.startsWith(`${group.output}/`));
    if (asset === undefined) continue;
    const path = `/${asset}`;
    const response = await fetch(`${origin}${path}`);
    check(response.status === 200, `${path} returned ${response.status}`, failures);
    check(response.headers.get('cache-control') === cacheControlFor(path),
      `${path} differs from the cache contract`, failures);
  }
  for (const rule of SITE_CONTRACT.cacheRules.filter(({ path }) => !path.includes('*'))) {
    const response = await fetch(`${origin}${rule.path}`);
    check(response.headers.get('cache-control') === rule.value,
      `${rule.path} differs from the cache contract`, failures);
  }
  const rootResponse = await fetch(`${origin}/`);
  for (const [name, value] of SITE_CONTRACT.securityHeaders) {
    check(rootResponse.headers.get(name) === value, `launcher differs from ${name} contract`, failures);
  }
  const missing = await fetch(`${origin}/missing-route`);
  check(missing.headers.get('cache-control') === 'public, max-age=0, must-revalidate',
    'custom 404 does not follow the incoming pathname cache policy', failures);
  check((await missing.text()).includes('<html'), '404 response lacks the reviewed HTML page', failures);
  const directNotFound = await fetch(`${origin}/404.html`);
  check(directNotFound.status === 200, 'direct /404.html did not remain a static asset', failures);
  check(directNotFound.headers.get('cache-control') === 'no-store',
    'direct /404.html differs from its authored no-store policy', failures);
} finally {
  await new Promise((resolveClosed) => server.close(resolveClosed));
}

if (failures.length > 0) throw new Error(`Built ArcadeBench site failed:\n${failures.join('\n')}`);
console.log(`Built ArcadeBench site passed exact ${files.length}-file/${totalBytes}-byte inventory, schema, references, routing, security, cache, and isolation smoke.`);

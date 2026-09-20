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
const forbiddenArtifactPath = /(?:^|\/)(?:src|tests?|testing|experiments|kit)(?:\/|$)|(?:human-lab|visual-fixtures|p1-08-candidates)|\.(?:map|ts)$/iu;
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

function primaryNav(contents) {
  return /<nav class="site-nav__links" aria-label="Primary">([\s\S]*?)<\/nav>/u.exec(contents)?.[1] ?? '';
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
const partition = htmlByRoute.get('/games/partition/');
const maltline = htmlByRoute.get('/games/maltline/');
const about = htmlByRoute.get('/about/');
const smilefall = htmlByRoute.get('/games/smilefall/');
const blockshop = htmlByRoute.get('/games/blockshop/');
check(smilefall && !/STICKER KIT|href=["'](?:\.\/)?kit\//iu.test(smilefall), 'Smilefall exposes a development kit', failures);
check(launcher !== partition, 'launcher is an accidental copy of Partition', failures);
check(['partition', 'maltline', 'smilefall'].every(game => launcher.includes(`href="/games/${game}/"`)),
  'launcher lacks direct permanent game links', failures);
check(launcher.includes('href="#games"') && launcher.includes('href="/about/"'),
  'launcher primary navigation is not Games plus About', failures);
check(!launcher.includes('href="/partition/"') && !launcher.includes('href="/maltline/"'),
  'launcher still links a retired game route', failures);
check(partition.includes('href="/assets/') && maltline.includes('href="/maltline/assets/')
  && blockshop.includes('href="/blockshop/assets/'),
  'game routes lost their shipped asset prefixes', failures);

// The About page is the published mission statement: one self-contained HTML
// page, the shared brand layer, its own stylesheet, and the closing credit.
check(/<h1>An arcade for everyone\.<\/h1>/u.test(about),
  'about page lacks its opening statement', failures);
check(about.includes('No ads. No microtransactions. No paid advantages. No gacha or loot boxes.'),
  'about page lacks its no-monetization promise', failures);
check(about.includes('A project by <a href="https://mathvsvibes.com">Math vs Vibes</a>.'),
  'about page lacks its Math vs Vibes credit', failures);
check(primaryNav(about).includes('<a href="/">Games</a>')
  && primaryNav(about).includes('<a href="/about/" aria-current="page">About</a>'),
'about page primary navigation is not Games plus a current About', failures);
for (const [label, contents] of [['launcher', launcher], ['about', about]]) {
  const anchors = [...primaryNav(contents).matchAll(/<a\b[^>]*>/gu)].map((match) => match[0]);
  check(anchors.length === 2 && !anchors.some((anchor) => anchor.includes('github.com')),
    `${label} primary navigation must be exactly Games and About`, failures);
  check(contents.includes('github.com/eanderson4/arcadebench'),
    `${label} must keep the Source link in its footer`, failures);
}
check(about.includes('href="/about.css"'), 'about page lacks its site-owned stylesheet', failures);
check(about.includes('src="/brand/mark.svg"'), 'about page does not show the ArcadeBench mark', failures);
check(!/<script\b/iu.test(about), 'about page must not execute JavaScript', failures);
check((about.match(/class="about__person"/gu) ?? []).length === 2,
  'about page must credit both contributors', failures);
check(about.includes('src="/contributors/whit-anderson.webp" alt="Caricature of Whit Anderson" width="512" height="512"')
  && about.includes('<p class="about__person-name">Whit Anderson</p>')
  && about.includes('Game designer &amp; playtester')
  && about.includes("Helped shape Smilefall's central idea, levels, and game feel through design and playtesting."),
  'about page lacks Whit’s portrait and unlinked design/playtesting credit', failures);
check(['partition', 'maltline', 'smilefall'].every(gameId => launcher.includes(`data-game-id="${gameId}"`)
  && launcher.includes(`href="/games/${gameId}/"`)), 'launcher must retain authored game identities and all three no-JavaScript Play routes', failures);
check(launcher.includes('id="selected-game"') && launcher.includes('Leaderboard · Recent runs'),
  'launcher must provide selected-game preview and leaderboard panel', failures);
const scoreboard = launcher.match(/<aside class="recent"[\s\S]*?<\/aside>/u)?.[0] ?? '';
check(scoreboard.length > 0 && !/<(?:a|button|input)\b|\btabindex=/u.test(scoreboard),
  'launcher scoreboard must remain passive and link-free', failures);
const launcherScripts = launcher.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu) ?? [];
check(launcherScripts.length === 2 && ['/carousel.js', '/activity.js'].every((path, index) =>
  launcherScripts[index] === `<script type="module" src="${path}"></script>`),
  'launcher must execute only its external carousel and activity modules, without inline code', failures);
const carouselSource = await readFile(resolve(root, 'carousel.js'), 'utf8');
check(!/[←→↑↓]/u.test(`${launcher}\n${carouselSource}`),
  'launcher arrows must use bundled-font glyphs or CSS instead of host-font fallbacks', failures);
check(!/(?:\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie|\bimport\s*(?:\(|[{'"*]))/u.test(carouselSource),
  'carousel contains an unapproved transport, storage surface, or runtime import', failures);
check(!/\son[a-z]+\s*=|javascript\s*:/iu.test(launcher),
  'launcher contains an inline event handler or JavaScript URL', failures);
check(!/(?:\/api\/|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)/u.test(launcher),
  'launcher contains a network, API, or persistent-storage surface', failures);
check(!/(?:\/assets\/|\/maltline\/assets\/|\/smilefall\/assets\/|\/blockshop\/assets\/)[A-Za-z0-9._-]+/u.test(launcher),
  'launcher imports a game JavaScript or stylesheet asset', failures);
check(launcher.includes('href="/arcade.css"'), 'launcher lacks its site-owned stylesheet', failures);
check(SITE_CONTRACT.staticFiles.some(({ output, source }) => (
  output === 'activity.js' && source === 'deploy/activity.js'
)), 'site contract does not ship its owned activity module', failures);
if (actualFiles.includes('activity.js')) {
  const activitySource = await readFile(resolve(root, 'activity.js'), 'utf8');
  const activityApiPaths = [...new Set(activitySource.match(/\/api\/[A-Za-z0-9/_-]+/gu) ?? [])];
  check(JSON.stringify(activityApiPaths) === JSON.stringify(['/api/v2/activity']),
    'activity module must address only /api/v2/activity', failures);
  check(!/(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie|\bimport\s*(?:\(|[{'"*]))/u.test(activitySource),
    'activity module contains an unapproved transport, storage surface, or runtime import', failures);
  check(!/(?:\/assets\/|\/maltline\/assets\/|\/smilefall\/assets\/)[A-Za-z0-9._-]+/u.test(activitySource),
    'activity module imports a game JavaScript or stylesheet asset', failures);
}

// The brand layer is only real if the launcher can reach every byte of it: the
// token stylesheet ahead of the catalog stylesheet, the mark, and the three
// licensed weights that brand.css addresses relative to itself.
const brandSheet = launcher.indexOf('href="/brand/brand.css"');
check(brandSheet !== -1 && brandSheet < launcher.indexOf('href="/arcade.css"'),
  'launcher must link /brand/brand.css before /arcade.css', failures);
check(launcher.includes('src="/brand/mark.svg"'), 'launcher does not show the ArcadeBench mark', failures);
const brandSheetSource = await readFile(resolve(root, 'brand/brand.css'), 'utf8');
check(!/local\(/u.test(brandSheetSource),
  'brand.css must not resolve a host-installed face through local()', failures);
for (const weight of [400, 600, 800]) {
  const font = `fonts/noto-sans-latin-${weight}-normal.woff2`;
  check(brandSheetSource.includes(`url('${font}')`),
    `brand.css does not address its ${weight} weight at ${font}`, failures);
  check(SITE_CONTRACT.staticFiles.some(({ output }) => output === `brand/${font}`),
    `site contract does not ship brand/${font}`, failures);
}

const coverOutputs = SITE_CONTRACT.staticFiles
  .map(({ output }) => output)
  .filter((output) => output.startsWith('covers/'));
check(coverOutputs.length > 0, 'site contract ships no catalog cover art', failures);
for (const output of coverOutputs) {
  check(launcher.includes(`src="/${output}"`),
    `launcher does not show its cover art ${output}`, failures);
}

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
    '/maltline/src/viewer/human-lab.html', '/games/partition/src/viewer/main.ts',
    '/games/maltline/human-lab.html', '/@vite/client', '/_headers', '/_redirects',
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

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const siteRoot = resolve(repositoryRoot, 'dist/site');
const maltlineRoot = resolve(siteRoot, 'maltline');
const maltlinePackageDist = resolve(repositoryRoot, 'games/maltline/dist');
const releaseAssets = JSON.parse(await readFile(
  resolve(repositoryRoot, 'games/maltline/release-assets.json'),
  'utf8',
));
const labArtifactName = /(?:^|\/)(?:human-lab|p1-08-candidates)(?:[./-]|$)/iu;
const labTextSentinels = [
  'maltline-human-lab-session',
  'd-combined',
];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt']);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

await access(resolve(maltlineRoot, 'index.html'));

async function filesUnder(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unsupported shipped filesystem entry: ${path}`);
  }
  return files;
}

async function labLeaks(root, label) {
  const failures = [];
  for (const file of await filesUnder(root)) {
    const relative = file.slice(root.length).replaceAll(sep, '/');
    if (labArtifactName.test(relative)) failures.push(`${label} filename leaked: ${relative}`);
    if (!textExtensions.has(extname(file))) continue;
    const contents = await readFile(file, 'utf8');
    for (const sentinel of labTextSentinels) {
      if (contents.includes(sentinel)) failures.push(`${label} text leaked ${sentinel}: ${relative}`);
    }
  }
  return failures;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const embeddedMediaPattern = /data:[A-Za-z][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9!#$&^_.+-]+(?:;[A-Za-z0-9=.+-]+)*(?:;base64)?,/giu;

function auditEmbeddedMedia(contents, extension, path, label) {
  const embeddedMedia = contents.match(embeddedMediaPattern) ?? [];
  if (extension === '.html') {
    const iconHref = /<link rel="icon" href="([^"]+)"/u.exec(contents)?.[1];
    if (embeddedMedia.length === 1
      && iconHref === releaseAssets.inlineAssets[0]?.href) return [];
    return [`${label} HTML must contain only the reviewed inline SVG favicon: ${path}`];
  }
  return embeddedMedia.length === 0
    ? []
    : [`${label} embeds unapproved data media: ${path}`];
}

async function auditMaltlineReleaseTree(root, entryPath, label) {
  const failures = [];
  const expectedNotice = releaseAssets.fontBundle.notice;
  const noticeRelativePath = expectedNotice.publicPath.replace(/^\/maltline\//u, '');
  const expectedStatic = new Set([entryPath, noticeRelativePath]);
  const fontByWeight = new Map(releaseAssets.fontBundle.files.map((file) => [String(file.weight), file]));
  const foundWeights = new Set();
  let scriptCount = 0;
  let stylesheetCount = 0;

  for (const file of await filesUnder(root)) {
    const path = relative(root, file).replaceAll(sep, '/');
    const extension = extname(path);
    if (extension === '.html' || extension === '.js' || extension === '.css') {
      failures.push(...auditEmbeddedMedia(await readFile(file, 'utf8'), extension, path, label));
    }
    if (expectedStatic.has(path)) continue;
    if (/^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)) {
      scriptCount += 1;
      continue;
    }
    if (/^assets\/index-[A-Za-z0-9_-]+\.css$/u.test(path)) {
      stylesheetCount += 1;
      continue;
    }
    const fontMatch = /^assets\/noto-sans-latin-(400|600|700|800)-normal-[A-Za-z0-9_-]+\.woff2$/u.exec(path);
    if (fontMatch) {
      const descriptor = fontByWeight.get(fontMatch[1]);
      const bytes = await readFile(file);
      if (!descriptor) failures.push(`${label} undeclared font weight: ${path}`);
      else {
        foundWeights.add(fontMatch[1]);
        if (bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) {
          failures.push(`${label} font bytes differ from manifest: ${path}`);
        }
      }
      continue;
    }
    failures.push(`${label} unlisted shipped file: ${path}`);
  }
  if (scriptCount !== 1) failures.push(`${label} expected one JavaScript entry, found ${scriptCount}`);
  if (stylesheetCount !== 1) failures.push(`${label} expected one stylesheet, found ${stylesheetCount}`);
  if (foundWeights.size !== fontByWeight.size) {
    failures.push(`${label} expected font weights ${[...fontByWeight.keys()].join(', ')}, found ${[...foundWeights].join(', ')}`);
  }

  const notice = await readFile(resolve(root, noticeRelativePath));
  if (notice.byteLength !== expectedNotice.byteLength || sha256(notice) !== expectedNotice.sha256) {
    failures.push(`${label} license notice differs from manifest`);
  }
  const entry = await readFile(resolve(root, entryPath), 'utf8');
  if (!entry.includes(`rel="license" type="text/plain" href="${expectedNotice.publicPath}"`)) {
    failures.push(`${label} entry lacks the route-correct license relation`);
  }
  return failures;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/maltline') {
      response.writeHead(308, { location: '/maltline/' });
      response.end();
      return;
    }
    const decodedPath = decodeURIComponent(url.pathname);
    const routeEntry = new Map([
      ['/maltline/', 'maltline/index.html'],
      ['/privacy/', 'privacy/index.html'],
    ]).get(decodedPath);
    const relativePath = routeEntry ?? decodedPath.replace(/^\//u, '');
    const file = resolve(siteRoot, relativePath);
    if (file !== siteRoot && !file.startsWith(`${siteRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const metadata = await stat(file);
    if (!metadata.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-length': metadata.size,
      'content-type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListening, rejectListening) => {
  server.once('error', rejectListening);
  server.listen(0, '127.0.0.1', resolveListening);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Built-site smoke server did not bind TCP.');
const origin = `http://127.0.0.1:${address.port}`;
const failures = [
  ...await labLeaks(maltlinePackageDist, 'Maltline package dist'),
  ...await labLeaks(maltlineRoot, 'assembled Maltline site'),
  ...await auditMaltlineReleaseTree(
    maltlinePackageDist,
    'src/viewer/index.html',
    'Maltline package dist',
  ),
  ...await auditMaltlineReleaseTree(maltlineRoot, 'index.html', 'assembled Maltline site'),
];
let browser;
try {
  const redirect = await fetch(`${origin}/maltline`, { redirect: 'manual' });
  if (redirect.status !== 308 || redirect.headers.get('location') !== '/maltline/') {
    failures.push(`route redirect was ${redirect.status} ${redirect.headers.get('location') ?? ''}`);
  }
  for (const path of ['/maltline/human-lab.html', '/maltline/src/viewer/human-lab.html']) {
    const response = await fetch(`${origin}${path}`);
    if (response.status !== 404) failures.push(`dev-only lab route ${path} returned ${response.status}`);
  }
  const noticePath = releaseAssets.fontBundle.notice.publicPath;
  const noticeResponse = await fetch(`${origin}${noticePath}`);
  const noticeBytes = Buffer.from(await noticeResponse.arrayBuffer());
  if (noticeResponse.status !== 200) failures.push(`license notice returned ${noticeResponse.status}`);
  if (noticeResponse.headers.get('content-type') !== 'text/plain; charset=utf-8') {
    failures.push(`license notice content type was ${noticeResponse.headers.get('content-type') ?? 'missing'}`);
  }
  if (noticeBytes.byteLength !== releaseAssets.fontBundle.notice.byteLength
    || sha256(noticeBytes) !== releaseAssets.fontBundle.notice.sha256) {
    failures.push('served license notice differs from the release manifest');
  }

  browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--font-render-hinting=none', '--force-color-profile=srgb', '--no-sandbox'],
  });
  const page = await browser.newPage({
    colorScheme: 'dark',
    locale: 'en-US',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 720 },
  });
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    failures.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  const entry = await page.goto(`${origin}/maltline/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.maltlineViewerReady === 'true');
  const result = await page.evaluate(() => ({
    title: document.title,
    screen: document.documentElement.dataset.maltlineScreen,
    fonts: document.fonts.status,
    shell: document.querySelector('[data-maltline-shell]')?.getAttribute('data-maltline-shell'),
    fixtureMarker: document.documentElement.dataset.maltlineFixtureRuntime ?? null,
    licenseHref: document.querySelector('link[rel="license"]')?.getAttribute('href') ?? null,
    licenseType: document.querySelector('link[rel="license"]')?.getAttribute('type') ?? null,
    resources: performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname),
  }));
  if (entry?.status() !== 200) failures.push(`entry status was ${entry?.status() ?? 'missing'}`);
  if (result.title !== 'Maltline — ArcadeBench') failures.push(`unexpected title: ${result.title}`);
  if (result.screen !== 'title') failures.push(`unexpected screen: ${result.screen ?? 'missing'}`);
  if (result.fonts !== 'loaded') failures.push(`font status: ${result.fonts}`);
  if (result.shell !== 'maltline-shell-v2') failures.push(`shell marker: ${result.shell ?? 'missing'}`);
  if (result.fixtureMarker !== null) failures.push('fixture runtime marker leaked into production');
  if (result.licenseHref !== releaseAssets.fontBundle.notice.publicPath) {
    failures.push(`license relation was ${result.licenseHref ?? 'missing'}`);
  }
  if (result.licenseType !== 'text/plain') failures.push(`license relation type was ${result.licenseType ?? 'missing'}`);
  const externalRoute = result.resources.find((resource) => !resource.startsWith('/maltline/assets/'));
  if (externalRoute) failures.push(`resource escaped Maltline route: ${externalRoute}`);

  const privacyEntry = await page.goto(`${origin}/privacy/`, { waitUntil: 'networkidle' });
  const privacy = await page.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    text: document.body.innerText.replace(/\s+/gu, ' '),
  }));
  if (privacyEntry?.status() !== 200) failures.push(`privacy route status was ${privacyEntry?.status() ?? 'missing'}`);
  if (privacy.title !== 'Privacy Promise — ArcadeBench') failures.push(`unexpected privacy title: ${privacy.title}`);
  if (privacy.canonical !== 'https://arcadebench.org/privacy/') failures.push('privacy canonical URL changed');
  for (const statement of [
    'Ordinary gameplay and replay inspection run in your browser.',
    'A complete replay reaches ArcadeBench only when you submit a ranked score',
    'The full replay is scheduled for deletion five days after upload.',
    'A signed anonymous cookie lasts up to 30 days',
    'ArcadeBench does not write IP addresses into its application database.',
    'only the proposed callsign—not gameplay, replay data, prompts, or controller code—is sent to Cloudflare Workers AI',
  ]) {
    if (!privacy.text.includes(statement)) failures.push(`privacy promise is missing: ${statement}`);
  }

  const headers = await readFile(resolve(siteRoot, '_headers'), 'utf8');
  if (!headers.includes('/maltline/assets/*')) failures.push('immutable Maltline asset header is absent');
} finally {
  await browser?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}

if (failures.length > 0) throw new Error(`Built Maltline route failed:\n${failures.join('\n')}`);
console.log('Built Maltline route passed browser/resource/font/license/privacy/fixture smoke.');

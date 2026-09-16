import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONTRACT } from './site-contract.mjs';
import { cacheControlFor } from './site-contract-render.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const builtSiteRoot = resolve(repositoryRoot, 'dist/site');
export const BUILT_SITE_HOST = '127.0.0.1';
export const BUILT_SITE_PORT = 5185;
export const BUILT_SITE_CONTENT_SECURITY_POLICY = new Map(SITE_CONTRACT.securityHeaders)
  .get('Content-Security-Policy');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const legacyRedirects = new Map(SITE_CONTRACT.redirects.map(({ from, to, status }) => (
  [from, { to, status }]
)));
const routeFiles = new Map(SITE_CONTRACT.routes.map(({ pathname, output }) => [pathname, output]));
const hiddenControlFiles = new Set(SITE_CONTRACT.staticFiles
  .map(({ output }) => output)
  .filter((output) => output.startsWith('_'))
  .map((output) => `/${output}`));

function responseHeaders(pathname) {
  const headers = Object.fromEntries(SITE_CONTRACT.securityHeaders.map(([name, value]) => (
    [name.toLowerCase(), value]
  )));
  headers['cache-control'] = cacheControlFor(pathname);
  return headers;
}

function safeDecodedPath(requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
  const encoded = url.pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  return { pathname: decoded, search: url.search };
}

async function regularContainedFile(root, relativePath) {
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  try {
    const metadata = await lstat(candidate);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    const resolved = await realpath(candidate);
    const resolvedRoot = await realpath(root);
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${sep}`)) return null;
    return { path: resolved, size: metadata.size };
  } catch {
    return null;
  }
}

function endRedirect(response, location, status = 307) {
  response.writeHead(status, { location, ...responseHeaders(location) });
  response.end();
}

export function createBuiltSiteServer(root = builtSiteRoot) {
  return createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD', ...responseHeaders('/') });
      response.end();
      return;
    }

    const decodedUrl = safeDecodedPath(request.url);
    if (decodedUrl === null) {
      response.writeHead(400, responseHeaders('/'));
      response.end();
      return;
    }
    const { pathname, search } = decodedUrl;
    const legacyTarget = legacyRedirects.get(pathname);
    if (legacyTarget !== undefined) {
      endRedirect(response, `${legacyTarget.to}${search}`, legacyTarget.status);
      return;
    }
    if (hiddenControlFiles.has(pathname)) {
      await serveNotFound(root, method, response, pathname);
      return;
    }
    if (pathname.endsWith('/index.html')) {
      endRedirect(response, `${pathname.slice(0, -'index.html'.length)}${search}`);
      return;
    }
    const slashRoute = `${pathname}/`;
    if (!pathname.endsWith('/') && routeFiles.has(slashRoute)) {
      endRedirect(response, `${slashRoute}${search}`);
      return;
    }

    const relativePath = routeFiles.get(pathname) ?? pathname.slice(1);
    const file = await regularContainedFile(root, relativePath);
    if (file === null) {
      await serveNotFound(root, method, response, pathname);
      return;
    }
    response.writeHead(200, {
      ...responseHeaders(pathname),
      'content-length': file.size,
      'content-type': contentTypes.get(extname(file.path)) ?? 'application/octet-stream',
    });
    if (method === 'HEAD') response.end();
    else createReadStream(file.path).pipe(response);
  });
}

async function serveNotFound(root, method, response, pathname) {
  const file = await regularContainedFile(root, '404.html');
  const headers = responseHeaders(pathname);
  if (file === null) {
    response.writeHead(404, headers);
    response.end();
    return;
  }
  response.writeHead(404, {
    ...headers,
    'content-length': file.size,
    'content-type': 'text/html; charset=utf-8',
  });
  if (method === 'HEAD') response.end();
  else createReadStream(file.path).pipe(response);
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createBuiltSiteServer();
  server.listen(BUILT_SITE_PORT, BUILT_SITE_HOST, () => {
    console.log(`Built ArcadeBench site available at http://${BUILT_SITE_HOST}:${BUILT_SITE_PORT}`);
  });
}

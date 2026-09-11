import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_CONTRACT } from './site-contract.mjs';

const EXPECTED_WRANGLER_VERSION = '4.124.0';
const HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const MAX_CAPTURED_LOG_BYTES = 256 * 1024;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  throw new Error(`Wrangler local composite smoke failed: ${message}`);
}

function containedBy(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function checkedWrangler() {
  const packagePath = resolve(repositoryRoot, 'node_modules/wrangler/package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  if (packageJson.version !== EXPECTED_WRANGLER_VERSION) {
    fail(`expected installed Wrangler ${EXPECTED_WRANGLER_VERSION}, found ${String(packageJson.version)}`);
  }
  if (packageJson.bin === null || typeof packageJson.bin !== 'object'
    || typeof packageJson.bin.wrangler !== 'string') {
    fail('installed Wrangler package does not declare its executable');
  }
  const packageRoot = await realpath(dirname(packagePath));
  const executable = await realpath(resolve(packageRoot, packageJson.bin.wrangler));
  if (!containedBy(packageRoot, executable)) fail('Wrangler executable resolves outside its package');
  const metadata = await lstat(executable);
  if (!metadata.isFile()) fail('Wrangler executable is not a regular file');
  return { executable, version: packageJson.version };
}

async function requireBuiltSite() {
  const siteRoot = resolve(repositoryRoot, SITE_CONTRACT.wranglerAssets.directory);
  const launcher = resolve(siteRoot, 'index.html');
  const metadata = await lstat(launcher).catch(() => null);
  if (metadata === null || !metadata.isFile() || metadata.isSymbolicLink()) {
    fail('dist/site is not assembled; run npm run build:site first');
  }
}

function appendBounded(current, chunk) {
  const next = current + chunk.toString('utf8');
  return next.length <= MAX_CAPTURED_LOG_BYTES
    ? next
    : next.slice(next.length - MAX_CAPTURED_LOG_BYTES);
}

function waitForReady(child, captured) {
  return new Promise((resolveReady, rejectReady) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settle(new Error(`Wrangler did not become ready in ${STARTUP_TIMEOUT_MS}ms`));
    }, STARTUP_TIMEOUT_MS);

    function settle(error, port) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error !== undefined) rejectReady(error);
      else resolveReady(port);
    }

    function inspect() {
      const match = captured.text.match(/Ready on http:\/\/127\.0\.0\.1:(\d+)/u);
      if (match === null) return;
      const port = Number(match[1]);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        settle(new Error(`Wrangler reported invalid ready port ${String(match[1])}`));
        return;
      }
      settle(undefined, port);
    }

    function onData(chunk) {
      captured.text = appendBounded(captured.text, chunk);
      inspect();
    }

    function onError(error) {
      settle(new Error(`Wrangler process failed to start: ${error.message}`));
    }

    function onExit(code, signal) {
      settle(new Error(`Wrangler exited before readiness (code=${String(code)}, signal=${String(signal)})`));
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    let settled = false;
    const timeout = setTimeout(() => settle(false), timeoutMs);
    function settle(exited) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off('exit', onExit);
      resolveExit(exited);
    }
    function onExit() {
      settle(true);
    }
    child.once('exit', onExit);
  });
}

function signalChildTree(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error === null || typeof error !== 'object' || error.code !== 'ESRCH') throw error;
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalChildTree(child, 'SIGTERM');
  if (await waitForExit(child, SHUTDOWN_TIMEOUT_MS)) return;
  signalChildTree(child, 'SIGKILL');
  if (!(await waitForExit(child, SHUTDOWN_TIMEOUT_MS))) {
    fail('Wrangler process tree did not terminate after SIGKILL');
  }
}

function headerRecord(headers) {
  return Object.fromEntries([...headers.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

async function probe(origin, name, pathname, init = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    name,
    method: init.method ?? 'GET',
    pathname,
    status: response.status,
    headers: headerRecord(response.headers),
    body,
  };
}

function assertStatus(probeResult, expected) {
  assert.equal(probeResult.status, expected, `${probeResult.name} status`);
}

function assertHeader(probeResult, name, expected) {
  assert.equal(probeResult.headers[name.toLowerCase()], expected, `${probeResult.name} ${name}`);
}

function assertNoHeader(probeResult, name) {
  assert.equal(probeResult.headers[name.toLowerCase()], undefined, `${probeResult.name} unexpectedly has ${name}`);
}

function assertEmptyBody(probeResult) {
  assert.equal(probeResult.body.byteLength, 0, `${probeResult.name} response body`);
}

function assertSecurityHeaders(probeResult) {
  for (const [name, value] of SITE_CONTRACT.securityHeaders) assertHeader(probeResult, name, value);
}

function reportProbe(probeResult) {
  return Object.freeze({
    method: probeResult.method,
    pathname: probeResult.pathname,
    status: probeResult.status,
    headers: Object.freeze(probeResult.headers),
    bodyBytes: probeResult.body.byteLength,
    bodySha256: createHash('sha256').update(probeResult.body).digest('hex'),
  });
}

async function exercise(origin) {
  const health = await probe(origin, 'Worker health', '/api/v1/health');
  assertStatus(health, 200);
  assertHeader(health, 'cache-control', 'no-store');
  assertHeader(health, 'content-type', 'application/json; charset=utf-8');
  assertHeader(health, 'x-content-type-options', 'nosniff');
  assertNoHeader(health, 'content-security-policy');
  const healthBody = JSON.parse(health.body.toString('utf8'));
  assert.equal(healthBody.status, 'ok', 'Worker health payload');
  assert.equal(typeof healthBody.gameVersion, 'string', 'Worker health gameVersion');

  const launcher = await probe(origin, 'Launcher asset', '/');
  assertStatus(launcher, 200);
  assertHeader(launcher, 'cache-control', 'public, max-age=0, must-revalidate');
  assertHeader(launcher, 'content-type', 'text/html; charset=utf-8');
  assertSecurityHeaders(launcher);
  assert.match(launcher.body.toString('utf8'), /<h1>Choose your cabinet\.<\/h1>/u);

  const slashRedirect = await probe(origin, 'Slash redirect', '/maltline?probe=1&tick=7');
  assertStatus(slashRedirect, 307);
  assertHeader(slashRedirect, 'location', '/maltline/?probe=1&tick=7');
  assertSecurityHeaders(slashRedirect);
  assertNoHeader(slashRedirect, 'cache-control');
  assertEmptyBody(slashRedirect);

  const legacyRedirect = await probe(origin, 'Legacy redirect', '/src/viewer?probe=1&tick=7');
  assertStatus(legacyRedirect, 301);
  assertHeader(legacyRedirect, 'location', '/partition/?probe=1&tick=7');
  assertSecurityHeaders(legacyRedirect);
  assertNoHeader(legacyRedirect, 'cache-control');
  assertEmptyBody(legacyRedirect);

  const hiddenHeaders = await probe(origin, 'Hidden _headers', '/_headers');
  const hiddenRedirects = await probe(origin, 'Hidden _redirects', '/_redirects');
  const notFound = await probe(origin, 'Arbitrary 404', '/missing-cabinet?probe=1');
  for (const result of [hiddenHeaders, hiddenRedirects, notFound]) {
    assertStatus(result, 404);
    assertHeader(result, 'cache-control', 'public, max-age=0, must-revalidate');
    assertHeader(result, 'content-type', 'text/html; charset=utf-8');
    assertSecurityHeaders(result);
    assert.match(result.body.toString('utf8'), /<h1>This route is out of play\.<\/h1>/u);
  }
  assert.deepEqual(hiddenHeaders.body, notFound.body, '_headers must resolve to the custom 404');
  assert.deepEqual(hiddenRedirects.body, notFound.body, '_redirects must resolve to the custom 404');

  const headHealth = await probe(origin, 'HEAD Worker health', '/api/v1/health', { method: 'HEAD' });
  const headLauncher = await probe(origin, 'HEAD launcher', '/', { method: 'HEAD' });
  const headNotFound = await probe(origin, 'HEAD arbitrary 404', '/missing-cabinet?probe=1', { method: 'HEAD' });
  assertStatus(headHealth, 200);
  assertStatus(headLauncher, 200);
  assertStatus(headNotFound, 404);
  assertHeader(headHealth, 'cache-control', 'no-store');
  assertHeader(headLauncher, 'cache-control', 'public, max-age=0, must-revalidate');
  assertHeader(headNotFound, 'cache-control', 'public, max-age=0, must-revalidate');
  assertEmptyBody(headHealth);
  assertEmptyBody(headLauncher);
  assertEmptyBody(headNotFound);

  const www = await probe(origin, 'WWW Host redirect capability', '/partition/?mode=replay&tick=7', {
    headers: { host: `www.${SITE_CONTRACT.canonicalHost}` },
  });
  let wwwHostRedirect;
  if (www.status === 308) {
    assertHeader(
      www,
      'location',
      `https://${SITE_CONTRACT.canonicalHost}/partition/?mode=replay&tick=7`,
    );
    assertEmptyBody(www);
    wwwHostRedirect = Object.freeze({ supported: true, observed: reportProbe(www) });
  } else {
    assertStatus(www, 200);
    assert.match(www.body.toString('utf8'), /<title>Partition — ArcadeBench<\/title>/u);
    wwwHostRedirect = Object.freeze({
      supported: false,
      limitation: 'The Host override did not reach Worker URL routing in this Wrangler-local probe.',
      observed: reportProbe(www),
    });
  }

  return Object.freeze({
    health: reportProbe(health),
    launcher: reportProbe(launcher),
    slashRedirect: reportProbe(slashRedirect),
    legacyRedirect: reportProbe(legacyRedirect),
    hiddenHeaders: reportProbe(hiddenHeaders),
    hiddenRedirects: reportProbe(hiddenRedirects),
    notFound: reportProbe(notFound),
    headHealth: reportProbe(headHealth),
    headLauncher: reportProbe(headLauncher),
    headNotFound: reportProbe(headNotFound),
    wwwHostRedirect,
  });
}

export async function runWranglerLocalSmoke() {
  await requireBuiltSite();
  const wrangler = await checkedWrangler();
  const persistenceDirectory = await mkdtemp(resolve(tmpdir(), 'arcadebench-wrangler-local-'));
  const captured = { text: '' };
  let child;
  try {
    child = spawn(process.execPath, [
      wrangler.executable,
      'dev',
      '--local',
      '--ip', HOST,
      '--port', '0',
      '--inspector-port', '0',
      '--persist-to', persistenceDirectory,
      '--log-level', 'log',
      '--show-interactive-dev-session', 'false',
    ], {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        WRANGLER_LOG_PATH: resolve(persistenceDirectory, 'logs'),
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await waitForReady(child, captured);
    const expectedRedirects = SITE_CONTRACT.redirects.length;
    const expectedHeaderRules = SITE_CONTRACT.cacheRules.length + 1;
    assert.match(
      captured.text,
      new RegExp(`Parsed ${expectedRedirects} valid redirect rules\\.`, 'u'),
      'Wrangler did not parse the exact redirect-rule count',
    );
    assert.match(
      captured.text,
      new RegExp(`Parsed ${expectedHeaderRules} valid header rules\\.`, 'u'),
      'Wrangler did not parse the exact header-rule count',
    );
    const origin = `http://${HOST}:${port}`;
    const probes = await exercise(origin);
    return Object.freeze({
      schemaVersion: 1,
      runtime: Object.freeze({
        product: 'wrangler dev --local',
        version: wrangler.version,
        origin,
        parsedRedirectRules: expectedRedirects,
        parsedHeaderRules: expectedHeaderRules,
      }),
      probes,
      limitation: 'Local Miniflare evidence does not establish behavior on Cloudflare\'s deployed edge.',
    });
  } catch (error) {
    const logTail = captured.text.slice(-8_000);
    if (error instanceof Error) error.message += `\nWrangler log tail:\n${logTail}`;
    throw error;
  } finally {
    try {
      if (child !== undefined) await stopChild(child);
    } finally {
      await rm(persistenceDirectory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runWranglerLocalSmoke();
  console.log(JSON.stringify(report, null, 2));
}

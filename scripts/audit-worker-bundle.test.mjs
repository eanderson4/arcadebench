import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { auditWorkerBundle, MAX_WORKER_JAVASCRIPT_BYTES } from './audit-worker-bundle.mjs';

const temporaryDirectories = [];
const requiredSources = [
  '../../apps/platform/src/worker.ts',
  '../../apps/platform/src/partition-verifier.ts',
  '../../games/partition/src/core/engine.ts',
  '../../games/partition/src/core/version.ts',
  '../../games/partition/src/levels/campaign.ts',
  '../../games/maltline/src/core/authority.ts',
  '../../games/maltline/src/core/proof.ts',
];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function fixture(sources = requiredSources, worker = 'export default {};\n//# sourceMappingURL=worker.js.map\n') {
  const directory = await mkdtemp(resolve(tmpdir(), 'arcadebench-worker-audit-'));
  temporaryDirectories.push(directory);
  await writeFile(resolve(directory, 'worker.js'), worker);
  await writeFile(resolve(directory, 'worker.js.map'), JSON.stringify({
    version: 3,
    sources,
    sourcesContent: sources.map(() => ''),
    names: [],
    mappings: 'AAAA',
  }));
  return directory;
}

test('accepts a bounded Worker graph containing only the verifier core', async () => {
  const result = await auditWorkerBundle(await fixture());
  assert.equal(result.sourceCount, requiredSources.length);
  assert.ok(result.javascriptBytes > 0);
});

test('rejects every prohibited game production boundary and both root barrels', async () => {
  for (const source of [
    '../../games/maltline/src/telemetry/campaign-telemetry.ts',
    '../../games/maltline/src/experiments/p1-08-candidates.ts',
    '../../games/maltline/src/viewer/viewer-input-adapter.ts',
    '../../games/maltline/src/testing/resolution-harness.ts',
    '../../games/maltline/src/index.ts',
    '../../games/partition/src/benchmark/session.ts',
    '../../games/partition/src/viewer/main.ts',
    '../../games/partition/src/testing/harness.ts',
    '../../games/partition/src/runtime/session.ts',
    '../../games/partition/src/index.ts',
  ]) {
    const directory = await fixture([...requiredSources, source]);
    await assert.rejects(() => auditWorkerBundle(directory), /prohibited game sources/u);
  }
});

test('rejects node filesystem/path imports in output and retained source content', async () => {
  const emitted = await fixture(
    requiredSources,
    'import { readFile } from "node:fs";\n//# sourceMappingURL=worker.js.map\n',
  );
  await assert.rejects(() => auditWorkerBundle(emitted), /prohibited node:fs or node:path/u);

  const retained = await fixture();
  const mapPath = resolve(retained, 'worker.js.map');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  map.sourcesContent[0] = 'import path from "node:path";';
  await writeFile(mapPath, JSON.stringify(map));
  await assert.rejects(() => auditWorkerBundle(retained), /source content contains/u);
});

test('rejects malformed maps and oversized Worker code before parsing sources', async () => {
  const malformed = await fixture();
  await writeFile(resolve(malformed, 'worker.js.map'), '{');
  await assert.rejects(() => auditWorkerBundle(malformed), /not valid JSON/u);

  const oversized = await fixture(requiredSources, 'x'.repeat(MAX_WORKER_JAVASCRIPT_BYTES + 1));
  await assert.rejects(() => auditWorkerBundle(oversized), /over 262144/u);
});

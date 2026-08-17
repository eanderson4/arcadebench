import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RunStore, zeroUsage } from '../src';
import type { RunManifest } from '../src';

const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function manifest(runId: string): RunManifest {
  return {
    schemaVersion: 1,
    runId,
    status: 'created',
    protocol: { gameId: 'partition', generation: 'dev-0' },
    model: { provider: 'test', model: 'scripted', label: 'scripted' },
    source: { platform: {}, game: {} },
    execution: { sessionKind: 'continuous', startedAt: new Date().toISOString() },
    usage: zeroUsage(),
    attempts: [],
    artifacts: [],
  };
}

describe('RunStore', () => {
  it('persists an append-only event sequence and resumable manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'arcadebench-run-'));
    temporary.push(root);
    const store = RunStore.create(root, manifest('run-1'));
    store.start();
    store.appendEvent({ type: 'warning', code: 'test', message: 'hello' });
    store.addUsage({ input: 10, output: 4, cachedInput: 2 });
    const reopened = RunStore.open(root, 'run-1');
    reopened.finish('complete', { primary: 1, unit: 'point', metrics: {} });

    const lines = readFileSync(store.eventsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines.map((line) => line.sequence)).toEqual([1, 2, 3]);
    expect(reopened.manifest.usage.input).toBe(10);
    expect(reopened.manifest.status).toBe('complete');
  });

  it('hashes artifacts inside the run directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'arcadebench-artifact-'));
    temporary.push(root);
    const store = RunStore.create(root, manifest('run-2'));
    const artifactPath = join(store.runDir, 'artifacts', 'result.json');
    writeFileSync(artifactPath, '{}');
    const artifact = store.addArtifact('result', artifactPath, 'application/json');
    expect(artifact.bytes).toBe(2);
    expect(artifact.sha256).toHaveLength(64);
  });
});


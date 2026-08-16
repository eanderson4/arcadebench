import { describe, expect, it } from 'vitest';
import type { ProtocolDefinition, RunManifest } from '../src';

describe('shared benchmark contracts', () => {
  it('represent both turn-based and continuous protocols', () => {
    const protocols: ProtocolDefinition[] = [
      {
        gameId: 'tower',
        generation: 'main-1',
        title: 'TowerBench main-1',
        description: 'Published tower protocol',
        sessionKind: 'turn-based',
        config: {},
      },
      {
        gameId: 'partition',
        generation: 'dev-0',
        title: 'Partition development protocol',
        description: 'Continuous controller development',
        sessionKind: 'continuous',
        config: {},
      },
    ];

    expect(protocols.map((protocol) => protocol.sessionKind)).toEqual(['turn-based', 'continuous']);
  });

  it('keeps raw artifacts separate from the score summary', () => {
    const manifest: RunManifest = {
      schemaVersion: 1,
      runId: 'run-1',
      status: 'complete',
      protocol: { gameId: 'partition', generation: 'dev-0' },
      model: { provider: 'test', model: 'scripted', label: 'scripted' },
      source: { platform: {}, game: {} },
      execution: { sessionKind: 'continuous', startedAt: '2026-08-16T00:00:00.000Z' },
      usage: { input: 0, output: 0, cachedInput: 0 },
      score: { primary: 42, unit: 'progress', metrics: { captured: 0.42 } },
      attempts: [],
      artifacts: [{ kind: 'replay', path: 'artifacts/replay.json' }],
    };

    expect(manifest.score?.primary).toBe(42);
    expect(manifest.artifacts[0]?.kind).toBe('replay');
  });
});


import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ArtifactRef,
  BenchmarkSession,
  RunManifest,
  SessionSnapshot,
  ToolCall,
  ToolResult,
} from '@arcadebench/bench-core';
import { RunStore, zeroUsage } from '@arcadebench/bench-core';
import { runHarness, ScriptedDriver } from '../src';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

class FakeSession implements BenchmarkSession {
  readonly id = 'fake-session';
  readonly kind = 'turn-based' as const;
  private complete = false;

  async snapshot(): Promise<SessionSnapshot> {
    return {
      status: this.complete ? 'complete' : 'running',
      score: { primary: this.complete ? 1 : 0, unit: 'point', metrics: {} },
    };
  }

  async handleTool(call: ToolCall): Promise<ToolResult> {
    if (call.name === 'finish') this.complete = true;
    return { callId: call.id, name: call.name, value: { ok: true } };
  }

  async artifacts(): Promise<ArtifactRef[]> {
    return [];
  }

  async close(): Promise<void> {}
}

function manifest(runId: string): RunManifest {
  return {
    schemaVersion: 1,
    runId,
    status: 'created',
    protocol: { gameId: 'fake', generation: 'v1' },
    model: { provider: 'scripted', model: 'scripted', label: 'scripted' },
    source: { platform: {}, game: {} },
    execution: { sessionKind: 'turn-based', startedAt: new Date().toISOString() },
    usage: zeroUsage(),
    attempts: [],
    artifacts: [],
  };
}

describe('runHarness', () => {
  it('routes tool calls and finalizes a tracked run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arcadebench-harness-'));
    temporary.push(root);
    const store = RunStore.create(root, manifest('run-1'));
    const driver = new ScriptedDriver(
      [{ name: 'finish', description: 'finish', parameters: { type: 'object' } }],
      [
        {
          text: '',
          toolCalls: [{ id: 'call-1', name: 'finish', arguments: {} }],
          usage: { input: 10, output: 3, cachedInput: 2 },
        },
      ],
    );
    const result = await runHarness({ driver, session: new FakeSession(), store, maxTurns: 3 });
    expect(result.status).toBe('complete');
    expect(result.score?.primary).toBe(1);
    expect(store.manifest.usage).toEqual({ input: 10, output: 3, cachedInput: 2 });
  });
});


import { join } from 'node:path';
import type { BenchmarkSession, ScoreCard, ToolResult } from '@arcadebench/bench-core';
import { RunStore } from '@arcadebench/bench-core';
import type { ModelDriver } from './model';

export interface HarnessRunOptions {
  driver: ModelDriver;
  session: BenchmarkSession;
  store: RunStore;
  maxTurns: number;
  maxIdleTurns?: number;
  idleNudge?: string;
}

export interface HarnessRunResult {
  turns: number;
  score?: ScoreCard;
  status: 'complete' | 'failed' | 'aborted';
  error?: string;
}

function elapsedMs(start: number): number {
  return Math.max(0, performance.now() - start);
}

export async function runHarness(options: HarnessRunOptions): Promise<HarnessRunResult> {
  const { driver, session, store } = options;
  const maxIdleTurns = options.maxIdleTurns ?? 3;
  let pending: ToolResult[] | undefined;
  let idleTurns = 0;
  let turns = 0;
  let finalScore: ScoreCard | undefined;

  store.start({ sessionId: session.id, sessionKind: session.kind });
  try {
    for (let turn = 1; turn <= options.maxTurns; turn++) {
      turns = turn;
      const before = await session.snapshot();
      if (before.status === 'complete') {
        finalScore = before.score;
        break;
      }
      if (before.status === 'failed') throw new Error('game session failed');

      const modelStarted = performance.now();
      const response = await driver.step(pending);
      const modelLatency = elapsedMs(modelStarted);
      pending = undefined;
      store.addUsage(response.usage);
      store.appendEvent({ type: 'model_turn', turn, usage: response.usage, latencyMs: modelLatency });
      store.appendTranscript({
        turn,
        role: 'assistant',
        content: { text: response.text, toolCalls: response.toolCalls, usage: response.usage },
      });

      if (response.toolCalls.length === 0) {
        idleTurns++;
        if (idleTurns >= maxIdleTurns) throw new Error(`model produced no tool calls for ${idleTurns} consecutive turns`);
        driver.pushUser?.(options.idleNudge ?? 'Continue the benchmark by calling one of the available tools.');
        continue;
      }
      idleTurns = 0;

      const results: ToolResult[] = [];
      for (const call of response.toolCalls) {
        store.appendEvent({ type: 'tool_call', callId: call.id, name: call.name, arguments: call.arguments });
        const toolStarted = performance.now();
        const result = await session.handleTool(call);
        const toolLatency = elapsedMs(toolStarted);
        store.appendEvent({
          type: 'tool_result',
          callId: result.callId,
          name: result.name,
          value: result.value,
          latencyMs: toolLatency,
        });
        store.appendTranscript({ turn, role: 'tool', content: result });
        results.push(result);

        const afterTool = await session.snapshot();
        if (afterTool.status === 'complete') {
          finalScore = afterTool.score;
          break;
        }
        if (afterTool.status === 'failed') throw new Error('game session failed');
      }
      pending = results;
      if (finalScore) break;
    }

    const final = await session.snapshot();
    finalScore ??= final.score;
    const complete = final.status === 'complete';
    await session.close();
    for (const artifact of await session.artifacts()) {
      store.addArtifact(artifact.kind, join(store.runDir, artifact.path), artifact.mediaType);
    }
    if (!complete) {
      const error = `turn budget exhausted after ${turns} turns while session remained ${final.status}`;
      store.finish('aborted', finalScore, error);
      return { turns, score: finalScore, status: 'aborted', error };
    }
    store.finish('complete', finalScore);
    return { turns, score: finalScore, status: 'complete' };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await session.close();
    for (const artifact of await session.artifacts()) {
      store.addArtifact(artifact.kind, join(store.runDir, artifact.path), artifact.mediaType);
    }
    store.finish('failed', finalScore, error);
    return { turns, score: finalScore, status: 'failed', error };
  } finally {
    await driver.close?.();
  }
}


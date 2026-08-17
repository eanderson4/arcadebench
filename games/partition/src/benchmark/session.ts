import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ArtifactRef,
  BenchmarkSession,
  JsonValue,
  ScoreCard,
  SessionCreateOptions,
  SessionSnapshot,
  ToolCall,
  ToolResult,
} from '@arcadebench/bench-core';
import { PartitionEngine } from '../core/engine';
import { createClassicScenario } from '../core/scenarios';
import type { ControlInput, PartitionState } from '../core/types';
import { sequenceController } from '../runtime/program-controller';
import { ContinuousPartitionSession } from '../runtime/session';

function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function parseInput(value: unknown): ControlInput {
  if (value === null || typeof value !== 'object') throw new Error('input must be an object');
  const input = value as Partial<ControlInput>;
  if (!['up', 'down', 'left', 'right', 'idle'].includes(input.direction ?? '')) throw new Error('invalid direction');
  if (!['off', 'fast', 'slow'].includes(input.draw ?? '')) throw new Error('invalid draw mode');
  return input as ControlInput;
}

function scoreFor(state: PartitionState): ScoreCard {
  return {
    primary: state.capturedFraction * 100,
    unit: 'percent stabilized',
    metrics: {
      capturedFraction: state.capturedFraction,
      ticks: state.tick,
      integrity: state.spark.integrity,
      won: state.status === 'won' ? 1 : 0,
    },
  };
}

export class PartitionBenchmarkSession implements BenchmarkSession {
  readonly kind = 'continuous' as const;
  private readonly live: ContinuousPartitionSession;
  private closed = false;
  private replayPath: string | null = null;

  constructor(readonly id: string, private readonly options: SessionCreateOptions) {
    this.live = new ContinuousPartitionSession(new PartitionEngine(createClassicScenario(options.seed)));
    this.live.startRealtime();
  }

  async snapshot(): Promise<SessionSnapshot> {
    const state = this.live.engine.snapshot();
    return {
      status: state.status === 'running' ? 'running' : 'complete',
      score: scoreFor(state),
      metadata: { tick: state.tick, gameStatus: state.status },
    };
  }

  async handleTool(call: ToolCall): Promise<ToolResult> {
    try {
      const args = call.arguments as Record<string, unknown>;
      let value: unknown;
      switch (call.name) {
        case 'get_status':
          value = this.live.engine.snapshot();
          break;
        case 'set_input': {
          const input = parseInput(args);
          this.live.setInput(input);
          value = { ok: true, requested: input, receivedAtTick: this.live.engine.snapshot().tick };
          break;
        }
        case 'update_controller': {
          const version = this.live.installController(sequenceController(args.program));
          value = { ok: true, controllerVersion: version, installedAtTick: this.live.engine.snapshot().tick };
          break;
        }
        case 'watch_gameplay': {
          const ticks = Number(args.ticks);
          const sampleEveryTicks = args.sampleEveryTicks === undefined ? undefined : Number(args.sampleEveryTicks);
          value = await this.live.watchGameplay({ ticks, ...(sampleEveryTicks ? { sampleEveryTicks } : {}) });
          break;
        }
        default:
          value = { ok: false, error: `unknown Partition tool: ${call.name}` };
      }
      return { callId: call.id, name: call.name, value: asJson(value) };
    } catch (error) {
      return {
        callId: call.id,
        name: call.name,
        value: { ok: false, error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async artifacts(): Promise<ArtifactRef[]> {
    if (!this.replayPath) return [];
    return [{ kind: 'partition-replay', path: this.replayPath, mediaType: 'application/json' }];
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.live.stop();
    mkdirSync(this.options.artifactDir, { recursive: true });
    const absolutePath = join(this.options.artifactDir, 'partition-replay.json');
    writeFileSync(absolutePath, `${JSON.stringify(this.live.replay(), null, 2)}\n`);
    this.replayPath = 'artifacts/partition-replay.json';
  }
}


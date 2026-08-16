import type { ArtifactRef, JsonObject, JsonValue, ScoreCard, TokenUsage } from './types';

interface EventBase {
  sequence: number;
  at: string;
}

export type RunEvent =
  | (EventBase & { type: 'run_started'; detail?: JsonObject })
  | (EventBase & { type: 'model_turn'; turn: number; usage: TokenUsage; latencyMs: number })
  | (EventBase & { type: 'tool_call'; callId: string; name: string; arguments: JsonValue })
  | (EventBase & { type: 'tool_result'; callId: string; name: string; value: JsonValue; latencyMs: number })
  | (EventBase & { type: 'attempt_started'; attempt: number; scenarioId: string; seed: number })
  | (EventBase & { type: 'attempt_finished'; attempt: number; score: ScoreCard })
  | (EventBase & {
      type: 'controller_installed';
      version: number;
      sourceSha256: string;
      requestedAtTick?: number;
      appliedAtTick?: number;
    })
  | (EventBase & { type: 'controller_failure'; version: number; tick: number; reason: string })
  | (EventBase & { type: 'artifact_created'; artifact: ArtifactRef })
  | (EventBase & { type: 'warning'; code: string; message: string; detail?: JsonObject })
  | (EventBase & { type: 'run_finished'; status: 'complete' | 'failed' | 'aborted'; score?: ScoreCard; error?: string });


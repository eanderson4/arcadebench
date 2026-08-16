export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type SessionKind = 'turn-based' | 'continuous';
export type RunStatus = 'created' | 'running' | 'complete' | 'failed' | 'aborted';

export interface ProtocolRef {
  gameId: string;
  generation: string;
}

export interface ProtocolDefinition<Config extends JsonObject = JsonObject> extends ProtocolRef {
  title: string;
  description: string;
  sessionKind: SessionKind;
  config: Config;
}

export interface ModelRef {
  provider: string;
  model: string;
  label: string;
  parameters?: JsonObject;
}

export interface SourceRef {
  revision?: string;
  dirty?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput: number;
  reasoning?: number;
}

export interface ScoreCard {
  primary: number;
  unit: string;
  metrics: Record<string, number>;
}

export interface ArtifactRef {
  kind: string;
  path: string;
  mediaType?: string;
  sha256?: string;
  bytes?: number;
}

export interface AttemptRecord {
  attempt: number;
  scenarioId: string;
  seed: number;
  status: 'complete' | 'failed' | 'aborted';
  startedAt: string;
  endedAt?: string;
  score?: ScoreCard;
  artifacts: ArtifactRef[];
  metadata?: JsonObject;
}

export interface RunManifest {
  schemaVersion: 1;
  runId: string;
  status: RunStatus;
  protocol: ProtocolRef;
  model: ModelRef;
  source: {
    platform: SourceRef;
    game: SourceRef;
  };
  execution: {
    sessionKind: SessionKind;
    startedAt: string;
    endedAt?: string;
    host?: JsonObject;
  };
  usage: TokenUsage;
  score?: ScoreCard;
  attempts: AttemptRecord[];
  artifacts: ArtifactRef[];
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonObject;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: JsonValue;
}

export interface ToolResult {
  callId: string;
  name: string;
  value: JsonValue;
}

export interface SessionSnapshot {
  status: 'ready' | 'running' | 'complete' | 'failed';
  score?: ScoreCard;
  metadata?: JsonObject;
}

export interface BenchmarkSession {
  readonly id: string;
  readonly kind: SessionKind;
  snapshot(): Promise<SessionSnapshot>;
  handleTool(call: ToolCall): Promise<ToolResult>;
  artifacts(): Promise<ArtifactRef[]>;
  close(): Promise<void>;
}

export interface SessionCreateOptions {
  runId: string;
  scenarioId: string;
  seed: number;
  artifactDir: string;
  config?: JsonObject;
}

export interface BenchmarkPlugin {
  readonly gameId: string;
  readonly title: string;
  protocols(): readonly ProtocolDefinition[];
  tools(protocol: ProtocolRef): readonly ToolDefinition[];
  systemPrompt(protocol: ProtocolRef): string;
  createSession(protocol: ProtocolRef, options: SessionCreateOptions): Promise<BenchmarkSession>;
}


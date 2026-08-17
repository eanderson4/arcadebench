import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import type { RunEvent } from './events';
import type { ArtifactRef, JsonObject, RunManifest, RunStatus, ScoreCard, TokenUsage } from './types';

export type NewRunEvent = RunEvent extends infer Event
  ? Event extends RunEvent
    ? Omit<Event, 'sequence' | 'at'>
    : never
  : never;

export interface TranscriptRecord {
  turn: number;
  role: string;
  content: unknown;
  at?: string;
}

export function zeroUsage(): TokenUsage {
  return { input: 0, output: 0, cachedInput: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cachedInput: a.cachedInput + b.cachedInput,
    ...((a.reasoning ?? 0) + (b.reasoning ?? 0) > 0 ? { reasoning: (a.reasoning ?? 0) + (b.reasoning ?? 0) } : {}),
  };
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, path);
}

export class RunStore {
  readonly runDir: string;
  readonly manifestPath: string;
  readonly eventsPath: string;
  readonly transcriptPath: string;
  private sequence = 0;

  private constructor(readonly rootDir: string, private manifestValue: RunManifest) {
    this.runDir = join(rootDir, manifestValue.runId);
    this.manifestPath = join(this.runDir, 'manifest.json');
    this.eventsPath = join(this.runDir, 'events.jsonl');
    this.transcriptPath = join(this.runDir, 'transcript.jsonl');
  }

  static create(rootDir: string, manifest: RunManifest): RunStore {
    const store = new RunStore(rootDir, structuredClone(manifest));
    if (existsSync(store.runDir)) throw new Error(`run directory already exists: ${store.runDir}`);
    mkdirSync(join(store.runDir, 'attempts'), { recursive: true });
    mkdirSync(join(store.runDir, 'artifacts'), { recursive: true });
    store.saveManifest();
    return store;
  }

  static open(rootDir: string, runId: string): RunStore {
    const path = join(rootDir, runId, 'manifest.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as RunManifest;
    const store = new RunStore(rootDir, manifest);
    if (existsSync(store.eventsPath)) {
      const lines = readFileSync(store.eventsPath, 'utf8').trim().split('\n').filter(Boolean);
      const last = lines.at(-1);
      store.sequence = last ? (JSON.parse(last) as RunEvent).sequence : 0;
    }
    return store;
  }

  get manifest(): RunManifest {
    return structuredClone(this.manifestValue);
  }

  start(detail?: JsonObject): void {
    if (this.manifestValue.status !== 'created') throw new Error(`cannot start run in ${this.manifestValue.status} state`);
    this.manifestValue.status = 'running';
    this.appendEvent({ type: 'run_started', ...(detail ? { detail } : {}) });
    this.saveManifest();
  }

  appendEvent(event: NewRunEvent): RunEvent {
    const record = { ...event, sequence: ++this.sequence, at: new Date().toISOString() } as RunEvent;
    appendFileSync(this.eventsPath, `${JSON.stringify(record)}\n`);
    return record;
  }

  appendTranscript(record: TranscriptRecord): void {
    appendFileSync(this.transcriptPath, `${JSON.stringify({ ...record, at: record.at ?? new Date().toISOString() })}\n`);
  }

  addUsage(usage: TokenUsage): void {
    this.manifestValue.usage = addUsage(this.manifestValue.usage, usage);
    this.saveManifest();
  }

  addArtifact(kind: string, absolutePath: string, mediaType?: string): ArtifactRef {
    const path = resolve(absolutePath);
    const relativePath = relative(this.runDir, path);
    if (relativePath.startsWith('..')) throw new Error(`artifact is outside run directory: ${path}`);
    const bytes = statSync(path).size;
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    const artifact: ArtifactRef = { kind, path: relativePath, bytes, sha256, ...(mediaType ? { mediaType } : {}) };
    this.manifestValue.artifacts.push(artifact);
    this.appendEvent({ type: 'artifact_created', artifact });
    this.saveManifest();
    return artifact;
  }

  finish(status: Extract<RunStatus, 'complete' | 'failed' | 'aborted'>, score?: ScoreCard, error?: string): void {
    this.manifestValue.status = status;
    this.manifestValue.execution.endedAt = new Date().toISOString();
    if (score) this.manifestValue.score = score;
    if (error) this.manifestValue.error = error;
    this.appendEvent({ type: 'run_finished', status, ...(score ? { score } : {}), ...(error ? { error } : {}) });
    this.saveManifest();
  }

  private saveManifest(): void {
    atomicJson(this.manifestPath, this.manifestValue);
  }
}


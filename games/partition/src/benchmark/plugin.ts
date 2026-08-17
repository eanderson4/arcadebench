import type { BenchmarkPlugin, ProtocolRef, SessionCreateOptions } from '@arcadebench/bench-core';
import { PARTITION_DEV_PROTOCOL } from './protocol';
import { PartitionBenchmarkSession } from './session';
import { PARTITION_TOOLS } from './tools';

function assertProtocol(ref: ProtocolRef): void {
  if (ref.gameId !== PARTITION_DEV_PROTOCOL.gameId || ref.generation !== PARTITION_DEV_PROTOCOL.generation) {
    throw new Error(`unsupported Partition protocol: ${ref.gameId}@${ref.generation}`);
  }
}

export const partitionPlugin: BenchmarkPlugin = {
  gameId: 'partition',
  title: 'Partition',
  protocols: () => [PARTITION_DEV_PROTOCOL],
  tools: (protocol) => {
    assertProtocol(protocol);
    return PARTITION_TOOLS;
  },
  systemPrompt: (protocol) => {
    assertProtocol(protocol);
    return `# Partition controller development

Partition is already running and never pauses for model inference. You control
a Spark on permanent boundaries. Hold draw while leaving a wall to create a
vulnerable Trace; reconnect to a permanent wall to partition the active field.
Regions without Anomalies stabilize. Reach 75% stabilized area.

Use update_controller to install timed input sequences that remain active while
you think. Use watch_gameplay to inspect sampled state over a live interval.
All observations are tick-stamped and may be stale by the time you respond.`;
  },
  createSession: async (protocol: ProtocolRef, options: SessionCreateOptions) => {
    assertProtocol(protocol);
    return new PartitionBenchmarkSession(`${options.runId}:${options.scenarioId}:${options.seed}`, options);
  },
};


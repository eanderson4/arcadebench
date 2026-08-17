import type { ProtocolDefinition } from '@arcadebench/bench-core';

export const PARTITION_DEV_PROTOCOL: ProtocolDefinition = {
  gameId: 'partition',
  generation: 'dev-0',
  title: 'Partition development protocol',
  description: 'Unfrozen continuous-control protocol used while the game and SDK are under construction.',
  sessionKind: 'continuous',
  config: {
    ticksPerSecond: 30,
    targetFraction: 0.75,
    controllerKind: 'timed-sequence',
  },
};


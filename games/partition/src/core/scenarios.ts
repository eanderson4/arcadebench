import { mulberry32 } from './rng';
import type { PartitionScenario } from './types';

export function createClassicScenario(seed: number): PartitionScenario {
  const rng = mulberry32(seed);
  const width = 48;
  const height = 32;
  const anomalyCount = 2;
  const anomalies = Array.from({ length: anomalyCount }, (_, index) => {
    const speed = 0.11 + rng() * 0.06;
    const angle = rng() * Math.PI * 2;
    return {
      id: `a${index + 1}`,
      position: [8 + rng() * (width - 16), 7 + rng() * (height - 14)] as [number, number],
      velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed] as [number, number],
    };
  });
  return {
    id: `classic-${seed}`,
    name: 'Classic Field',
    width,
    height,
    ticksPerSecond: 30,
    targetFraction: 0.75,
    integrity: 3,
    anomalies,
  };
}


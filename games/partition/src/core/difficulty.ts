import { mulberry32 } from './rng';
import type { DifficultyId, PartitionScenario } from './types';

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  description: string;
  sparkMoveEveryTicks: number;
  anomalySpeedMultiplier: number;
  anomalyCountBonus: number;
  lives: number;
  targetFractionDelta: number;
  timeLimitMultiplier: number;
  fallbackTimeLimitSeconds?: number;
}

export const DIFFICULTY_PRESETS: Readonly<Record<DifficultyId, DifficultyPreset>> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    description: 'Four lives, slower anomalies, and a generous field clock.',
    sparkMoveEveryTicks: 3,
    anomalySpeedMultiplier: 0.8,
    anomalyCountBonus: 0,
    lives: 4,
    targetFractionDelta: 0,
    timeLimitMultiplier: 1.3,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'Three lives and the intended field timing.',
    sparkMoveEveryTicks: 3,
    anomalySpeedMultiplier: 1,
    anomalyCountBonus: 0,
    lives: 3,
    targetFractionDelta: 0,
    timeLimitMultiplier: 1,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    description: 'Faster anomalies, two lives, and a tighter field clock.',
    sparkMoveEveryTicks: 3,
    anomalySpeedMultiplier: 1.24,
    anomalyCountBonus: 0,
    lives: 2,
    targetFractionDelta: 0,
    timeLimitMultiplier: 0.82,
  },
  impossible: {
    id: 'impossible',
    label: 'Impossible',
    description: 'One life, maximum anomaly speed, and the strictest field clock.',
    sparkMoveEveryTicks: 3,
    anomalySpeedMultiplier: 1.52,
    anomalyCountBonus: 0,
    lives: 1,
    targetFractionDelta: 0,
    timeLimitMultiplier: 0.68,
  },
};

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function activeCells(scenario: PartitionScenario): number[] {
  const blocked = new Set(scenario.blockedCells ?? []);
  return Array.from({ length: scenario.width * scenario.height }, (_, index) => index)
    .filter((index) => !blocked.has(index));
}

export function applyDifficulty(base: PartitionScenario, difficultyId: DifficultyId): PartitionScenario {
  const preset = DIFFICULTY_PRESETS[difficultyId];
  const rng = mulberry32(hashString(`${base.id}:${difficultyId}`));
  const anomalies = base.anomalies.map((anomaly) => ({
    ...anomaly,
    position: [...anomaly.position] as [number, number],
    velocity: [
      anomaly.velocity[0] * preset.anomalySpeedMultiplier,
      anomaly.velocity[1] * preset.anomalySpeedMultiplier,
    ] as [number, number],
  }));
  const cells = activeCells(base);
  const averageSpeed = Math.max(
    0.08,
    anomalies.reduce((sum, anomaly) => sum + Math.hypot(...anomaly.velocity), 0) / Math.max(1, anomalies.length),
  );

  for (let bonus = 0; bonus < preset.anomalyCountBonus; bonus++) {
    const cell = cells[Math.floor(rng() * cells.length)];
    const x = cell % base.width;
    const y = Math.floor(cell / base.width);
    const angle = rng() * Math.PI * 2;
    const speed = averageSpeed * (0.9 + rng() * 0.2);
    anomalies.push({
      id: `difficulty-${difficultyId}-${bonus + 1}`,
      position: [x + 0.5, y + 0.5],
      velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed],
    });
  }

  const authoredLimit = base.timeLimitTicks;
  const fallbackLimit = preset.fallbackTimeLimitSeconds === undefined
    ? undefined
    : preset.fallbackTimeLimitSeconds * base.ticksPerSecond;
  const sourceLimit = authoredLimit ?? fallbackLimit;

  return {
    ...structuredClone(base),
    id: `${base.id}-${difficultyId}`,
    difficultyId,
    sparkMoveEveryTicks: preset.sparkMoveEveryTicks,
    targetFraction: Math.max(0.5, Math.min(0.92, base.targetFraction + preset.targetFractionDelta)),
    integrity: preset.lives,
    timeLimitTicks: sourceLimit === undefined ? undefined : Math.max(1, Math.round(sourceLimit * preset.timeLimitMultiplier)),
    anomalies,
  };
}

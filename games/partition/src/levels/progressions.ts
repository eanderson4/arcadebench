import type { PartitionCampaignLevel } from './types';
import { cloneCampaignLevel } from './toolbox';
import { createPartitionCampaign, PARTITION_CAMPAIGN_SEED } from './campaign';

export interface PartitionStageOverrides {
  title?: string;
  anomalySpeedMultiplier?: number;
  anomalyCount?: number;
  targetFraction?: number;
  lives?: number;
  timeLimitTicks?: number;
}

export interface PartitionProgressionStage {
  stageId: string;
  overrides?: PartitionStageOverrides;
}

export interface PartitionProgression {
  id: string;
  name: string;
  description: string;
  stages: ReadonlyArray<string | PartitionProgressionStage>;
}

export const ARCADE_PARTITION_PROGRESSION: PartitionProgression = {
  id: 'partition-arcade-v1',
  name: 'Arcade Run',
  description: 'A ten-stage arcade run escalating from one slow anomaly to a nine-anomaly swarm.',
  stages: [
    'first-light',
    'twin-drift',
    'garden-gate',
    'crosswind',
    'broken-compass',
    'razor-frame',
    'archipelago',
    'bow-tie',
    'shattered-circuit',
    'last-partition',
  ],
};

export const STANDARD_PARTITION_PROGRESSION = ARCADE_PARTITION_PROGRESSION;

function validateOverrides(stageId: string, overrides: PartitionStageOverrides): void {
  if (overrides.anomalySpeedMultiplier !== undefined && !(overrides.anomalySpeedMultiplier > 0)) {
    throw new Error(`${stageId}: anomalySpeedMultiplier must be greater than zero`);
  }
  if (overrides.anomalyCount !== undefined && (!Number.isInteger(overrides.anomalyCount) || overrides.anomalyCount < 1)) {
    throw new Error(`${stageId}: anomalyCount must be a positive integer`);
  }
  if (overrides.targetFraction !== undefined && !(overrides.targetFraction > 0 && overrides.targetFraction <= 1)) {
    throw new Error(`${stageId}: targetFraction must be in (0, 1]`);
  }
  if (overrides.lives !== undefined && (!Number.isInteger(overrides.lives) || overrides.lives < 1)) {
    throw new Error(`${stageId}: lives must be a positive integer`);
  }
  if (overrides.timeLimitTicks !== undefined && (!Number.isInteger(overrides.timeLimitTicks) || overrides.timeLimitTicks < 1)) {
    throw new Error(`${stageId}: timeLimitTicks must be a positive integer`);
  }
}

function applyStageOverrides(
  level: PartitionCampaignLevel,
  overrides: PartitionStageOverrides | undefined,
): PartitionCampaignLevel {
  const resolved = cloneCampaignLevel(level);
  if (!overrides) return resolved;
  validateOverrides(level.metadata.slug, overrides);
  if (overrides.title !== undefined) {
    resolved.metadata.title = overrides.title;
    resolved.scenario.name = overrides.title;
  }
  if (overrides.anomalySpeedMultiplier !== undefined) {
    for (const anomaly of resolved.scenario.anomalies) {
      anomaly.velocity[0] *= overrides.anomalySpeedMultiplier;
      anomaly.velocity[1] *= overrides.anomalySpeedMultiplier;
    }
  }
  if (overrides.anomalyCount !== undefined) {
    if (overrides.anomalyCount > resolved.scenario.anomalies.length) {
      throw new Error(
        `${level.metadata.slug}: anomalyCount cannot exceed the stage's ${resolved.scenario.anomalies.length} authored spawns`,
      );
    }
    resolved.scenario.anomalies = resolved.scenario.anomalies.slice(0, overrides.anomalyCount);
  }
  if (overrides.targetFraction !== undefined) resolved.scenario.targetFraction = overrides.targetFraction;
  if (overrides.lives !== undefined) resolved.scenario.integrity = overrides.lives;
  if (overrides.timeLimitTicks !== undefined) resolved.scenario.timeLimitTicks = overrides.timeLimitTicks;
  resolved.metadata.features.push('progression-override');
  return resolved;
}

/** Resolves an editable stage list into immutable session-ready stage copies. */
export function resolvePartitionProgression(
  progression: PartitionProgression = STANDARD_PARTITION_PROGRESSION,
  seed = PARTITION_CAMPAIGN_SEED,
): PartitionCampaignLevel[] {
  if (progression.stages.length === 0) throw new Error(`${progression.id}: progression needs at least one stage`);
  const catalog = createPartitionCampaign(seed);
  const byId = new Map(catalog.flatMap((level) => [
    [level.metadata.slug, level],
    [level.scenario.id, level],
  ]));
  return progression.stages.map((entry, index) => {
    const reference = typeof entry === 'string' ? { stageId: entry } : entry;
    const level = byId.get(reference.stageId);
    if (!level) throw new Error(`${progression.id}: unknown stage ${reference.stageId}`);
    const resolved = applyStageOverrides(level, reference.overrides);
    resolved.metadata.number = index + 1;
    resolved.scenario.id = `${level.scenario.id}--${progression.id}-${String(index + 1).padStart(2, '0')}`;
    return resolved;
  });
}

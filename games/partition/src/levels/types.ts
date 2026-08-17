import type { DifficultyId, Edge, PartitionScenario, Point } from '../core/types';

export type PartitionDifficultyId = DifficultyId;

/** A fully-authored scenario. These fields are required for campaign levels. */
export interface PartitionLevelScenario extends PartitionScenario {
  difficultyId: PartitionDifficultyId;
  sparkStart: Point;
  sparkMoveEveryTicks: number;
  timeLimitTicks: number;
  blockedCells: number[];
  initialWalls: Edge[];
}

export interface PartitionLevelMetadata {
  number: number;
  slug: string;
  title: string;
  tier: PartitionDifficultyId;
  tagline: string;
  challenge: string;
  features: string[];
  parTicks: number;
}

export interface PartitionCampaignLevel {
  metadata: PartitionLevelMetadata;
  scenario: PartitionLevelScenario;
}

export interface BoardMask {
  width: number;
  height: number;
  blockedCells: number[];
}

export interface LevelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  playableCellCount: number;
}

export interface CampaignValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

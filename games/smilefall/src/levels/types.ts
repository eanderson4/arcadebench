import type { FloorRule, MoodId, RockRule, SmilefallScenario } from '../core/types';

export type SmilefallMoodId = MoodId;

/** A fully-authored stage. Catalog levels always fill in the optional fields. */
export interface SmilefallLevelScenario extends SmilefallScenario {
  moodId: SmilefallMoodId;
  /** Authored stages always say out loud how their rocks and ground behave. */
  rockRule: RockRule;
  floorRule: FloorRule;
  timeLimitTicks: number;
}

export interface SmilefallLevelMetadata {
  number: number;
  slug: string;
  title: string;
  tier: SmilefallMoodId;
  tagline: string;
  challenge: string;
  features: string[];
  parTicks: number;
}

export interface SmilefallStage {
  metadata: SmilefallLevelMetadata;
  scenario: SmilefallLevelScenario;
}

export interface LevelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiredCatches: number;
  dropCount: number;
}

export interface CatalogValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

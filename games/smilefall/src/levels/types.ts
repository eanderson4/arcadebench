import type { MoodId, SmilefallScenario } from '../core/types';

export type SmilefallMoodId = MoodId;

/** A fully-authored stage. */
export interface SmilefallLevelScenario extends SmilefallScenario {
  moodId: SmilefallMoodId;
  timeLimitTicks: number;
}

export type SmilefallMechanic =
  | 'shared-lean'
  | 'flock-hop'
  | 'plain-rocks'
  | 'moving-buckets'
  | 'paired-drops'
  | 'fixed-spikes'
  | 'reserve-budget'
  | 'spiked-rocks'
  | 'rock-walls'
  | 'split-targets'
  | 'center-streams'
  | 'volley-drops'
  | 'narrow-buckets'
  | 'platforms'
  | 'vertical-camera'
  | 'low-ceilings'
  | 'downward-spikes'
  | 'stacked-buckets';

export interface SmilefallLevelMetadata {
  /** Stable catalog order; arcade order is defined separately. */
  number: number;
  slug: string;
  title: string;
  tier: SmilefallMoodId;
  tagline: string;
  challenge: string;
  features: string[];
  parTicks: number;
  /** Mechanics present in this stage, used to audit the teaching curve. */
  mechanics: readonly SmilefallMechanic[];
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

export interface ProgressionValidationResult extends CatalogValidationResult {
  introductions: Readonly<Record<string, readonly SmilefallMechanic[]>>;
}

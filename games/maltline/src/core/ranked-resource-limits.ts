export const MAX_MALTLINE_PROOF_STAGES = 32;
export const MAX_MALTLINE_PROOF_INPUT_RUNS = 60_000;
export const MAX_MALTLINE_PROOF_STAGE_TICKS = 60_000;
export const MAX_MALTLINE_PROOF_TOTAL_TICKS = 60_000;

/**
 * Ranked-server allocation and CPU ceilings. Fundamental scenario validity is
 * owned by normalizeMaltlineScenario; these deliberately tighter limits are
 * policy for accepting a campaign into the public verifier.
 */
export const MALTLINE_RANKED_RESOURCE_LIMITS = Object.freeze({
  maximumTicksPerSecond: 120,
  maximumLanes: 8,
  maximumLaneLength: 1_000,
  maximumJarPoolSize: 64,
  maximumWorkTicks: 10_000,
  minimumCustomerCount: 1,
  maximumCustomerCount: 64,
  maximumSpawnTicks: 60_000,
  maximumMovementSpeed: 100,
  maximumInputRepeatTicks: 120,
  maximumLives: 20,
  maximumInitialScore: 10_000_000,
} as const);

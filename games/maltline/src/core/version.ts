import { MALTLINE_GAME_ID, MALTLINE_RULES } from './rules';

export { MALTLINE_GAME_ID } from './rules';

/**
 * Ranked simulation/scoring generation. Increment for any behavior change that
 * can alter state, events, terminal status, or score for the same inputs.
 */
export const MALTLINE_RULESET_VERSION = MALTLINE_RULES.version;

/** Increment whenever ordered stage membership or any scenario value changes. */
export const MALTLINE_CAMPAIGN_GENERATION = 2 as const;

/** Input-only ranked proof wire schema. Independent of simulation generation. */
export const MALTLINE_PROOF_VERSION = 1 as const;

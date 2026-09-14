import { MALTLINE_GENERATION_2_AUTHORITY } from './authority';

/**
 * Compatibility name for the registered generation-2 runtime campaign.
 * The authority owns this deeply frozen snapshot; callers cannot drift it.
 */
export const MALTLINE_CAMPAIGN = MALTLINE_GENERATION_2_AUTHORITY.campaign;

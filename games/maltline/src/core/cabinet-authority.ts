import { MALTLINE_GENERATION_2_AUTHORITY } from './authority';
import { fingerprintCanonical, type CanonicalValue } from './fingerprint';

/** Cabinet controls are a separate rules authority, never a generation-2 proof. */
export const MALTLINE_CABINET_GAME_VERSION = 'cabinet-1' as const;
export const MALTLINE_CABINET_SEASON_ID = 'maltline-cabinet-1' as const;
export const MALTLINE_CABINET_PROOF_VERSION = 1 as const;
export const MALTLINE_CABINET_LIMITS = Object.freeze({
  maximumStages: 8,
  maximumInputRuns: 60_000,
  maximumStageTicks: 60_000,
  maximumTotalTicks: 60_000,
});

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export const MALTLINE_CABINET_CONFIGURATION = freezeTree({
  gameId: 'maltline',
  gameVersion: MALTLINE_CABINET_GAME_VERSION,
  proofVersion: MALTLINE_CABINET_PROOF_VERSION,
  controlMode: 'two-button-v1' as const,
  stationSelection: 'cyclic-discard-held-to-wash-cancel-partial-v1',
  baseConfigurationSha256: MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256,
  rng: structuredClone(MALTLINE_GENERATION_2_AUTHORITY.rng),
  rules: structuredClone(MALTLINE_GENERATION_2_AUTHORITY.rules),
  campaign: structuredClone(MALTLINE_GENERATION_2_AUTHORITY.campaign),
  initialRun: structuredClone(MALTLINE_GENERATION_2_AUTHORITY.initialRun),
  rankingPolicy: structuredClone(MALTLINE_GENERATION_2_AUTHORITY.rankingPolicy),
  limits: MALTLINE_CABINET_LIMITS,
});

// Pinned SHA-256 of the complete cabinet configuration; a golden test recomputes
// it with WebCrypto. The synchronous fingerprint guard fails closed on drift.
export const MALTLINE_CABINET_CONFIGURATION_SHA256 = '7e4de0727df377e6142e860381c8c93c7ffc4e1e17c8828e5b078cfddff2ca61';
const EXPECTED_CONFIGURATION_FINGERPRINT = 'fnv1a64:a9b77183ce5c6b5c';
export const MALTLINE_CABINET_AUTHORITY = Object.freeze({
  ...MALTLINE_CABINET_CONFIGURATION,
  authorityId: `maltline-cabinet-1:${MALTLINE_CABINET_CONFIGURATION_SHA256}`,
  configurationSha256: MALTLINE_CABINET_CONFIGURATION_SHA256,
  seasonId: MALTLINE_CABINET_SEASON_ID,
});

let verified = false;
export function assertMaltlineCabinetAuthority(): void {
  if (verified) return;
  if (fingerprintCanonical(MALTLINE_CABINET_CONFIGURATION as CanonicalValue)
    !== EXPECTED_CONFIGURATION_FINGERPRINT) {
    throw new Error('Maltline cabinet authority configuration has changed.');
  }
  verified = true;
}

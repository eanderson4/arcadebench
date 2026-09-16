import {
  assertMaltlineCabinetAuthority,
  MALTLINE_CABINET_AUTHORITY,
  MALTLINE_CABINET_CONFIGURATION,
} from './cabinet-authority';
import { fingerprintCanonical, type CanonicalValue } from './fingerprint';

export type MaltlineCabinetGameVersion = 'cabinet-1' | 'cabinet-2';

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

/** A new progression authority; cabinet-1 and generation two stay immutable. */
export const MALTLINE_CABINET_2_CONFIGURATION = freezeTree({
  ...structuredClone(MALTLINE_CABINET_CONFIGURATION),
  gameVersion: 'cabinet-2' as const,
  campaign: MALTLINE_CABINET_AUTHORITY.campaign.map((stage, index) => ({
    ...structuredClone(stage),
    stations: index === 2 ? ['vanilla', 'chocolate'] as const : [...stage.stations],
  })),
});
export const MALTLINE_CABINET_2_CONFIGURATION_SHA256 = 'afd3ea4c98dae25de536bf64bbb0cdb5466a745b71572015ddb247ecc5f40ff3';
const EXPECTED_CONFIGURATION_FINGERPRINT = 'fnv1a64:a26e9e0729415cfc';
export const MALTLINE_CABINET_2_AUTHORITY = freezeTree({
  ...MALTLINE_CABINET_2_CONFIGURATION,
  authorityId: `maltline-cabinet-2:${MALTLINE_CABINET_2_CONFIGURATION_SHA256}`,
  configurationSha256: MALTLINE_CABINET_2_CONFIGURATION_SHA256,
  seasonId: 'maltline-cabinet-2',
});

export const MALTLINE_CURRENT_CABINET_AUTHORITY = MALTLINE_CABINET_2_AUTHORITY;
export type MaltlineRegisteredCabinetAuthority = typeof MALTLINE_CABINET_AUTHORITY | typeof MALTLINE_CABINET_2_AUTHORITY;

let verified = false;
export function resolveMaltlineCabinetAuthority(version: unknown): MaltlineRegisteredCabinetAuthority | null {
  if (version === 'cabinet-1') {
    assertMaltlineCabinetAuthority();
    return MALTLINE_CABINET_AUTHORITY;
  }
  if (version !== 'cabinet-2') return null;
  if (!verified) {
    if (fingerprintCanonical(MALTLINE_CABINET_2_CONFIGURATION as CanonicalValue) !== EXPECTED_CONFIGURATION_FINGERPRINT) {
      throw new Error('Maltline cabinet-2 authority configuration has changed.');
    }
    verified = true;
  }
  return MALTLINE_CABINET_2_AUTHORITY;
}

import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
  getMaltlineAuthorityConfiguration,
  verifyMaltlineAuthorityConfiguration,
  type MaltlineAuthorityIdentity,
} from '../core/authority';
import {
  fingerprintMaltlineCampaign,
  fingerprintNormalizedMaltlineScenario,
} from '../core/campaign-fingerprint';
import { fingerprintCanonical, sha256Canonical, type CanonicalValue } from '../core/fingerprint';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
  type NormalizedRunContext,
} from '../core/scenario';
import type { MaltlineScenario } from '../core/types';

export const P108_UNRANKED_BOUNDARY = Object.freeze({
  eligibility: 'unranked' as const,
  authorityRegistration: null,
  seasonId: null,
  rankedProofEmission: 'forbidden' as const,
  reason: 'Experimental scenarios are not registered Maltline authorities.' as const,
});

export type P108TunableIntegerField =
  | 'customerCount'
  | 'spawnIntervalTicks'
  | 'spawnAccelerationTicks';
export type P108TunableNumberField = P108TunableIntegerField | 'marchSpeed';

export interface P108ScenarioChange {
  readonly stageId: string;
  readonly field: P108TunableNumberField;
  readonly from: number;
  readonly to: number;
}

export interface P108TuningCandidate {
  readonly id: string;
  readonly description: string;
  readonly changes: readonly P108ScenarioChange[];
}

function frozenChange(
  stageId: string,
  field: P108TunableNumberField,
  from: number,
  to: number,
): P108ScenarioChange {
  return Object.freeze({ stageId, field, from, to });
}

const STAGE_5 = 'maltline-05-jar-shortage';
const STAGE_7 = 'maltline-07-happy-hour';
const RESOURCE_CHANGES = Object.freeze([
  frozenChange(STAGE_5, 'spawnIntervalTicks', 204, 180),
  frozenChange(STAGE_5, 'spawnAccelerationTicks', 2, 3),
]);
const BRIDGE_CHANGES = Object.freeze([
  frozenChange(STAGE_7, 'customerCount', 27, 29),
  frozenChange(STAGE_7, 'spawnIntervalTicks', 144, 138),
  frozenChange(STAGE_7, 'marchSpeed', 0.12, 0.125),
]);

export const P108_TUNING_CANDIDATES: readonly P108TuningCandidate[] = Object.freeze([
  Object.freeze({
    id: 'a-registered-control',
    description: 'Frozen registered generation-2 campaign control.',
    changes: Object.freeze([]),
  }),
  Object.freeze({
    id: 'b-stage-5-resource-cadence',
    description: 'Stage 5 reaches the four-jar resource loop with count and floor unchanged.',
    changes: RESOURCE_CHANGES,
  }),
  Object.freeze({
    id: 'c-stage-7-closing-time-bridge',
    description: 'Stage 7 becomes a measured midpoint before the registered Stage 8 wall.',
    changes: BRIDGE_CHANGES,
  }),
  Object.freeze({
    id: 'd-combined',
    description: 'Stage 5 resource cadence plus the Stage 7 midpoint.',
    changes: Object.freeze([...RESOURCE_CHANGES, ...BRIDGE_CHANGES]),
  }),
]);

export const P108_TUNABLE_FIELDS: readonly P108TunableNumberField[] = Object.freeze([
  'customerCount',
  'spawnIntervalTicks',
  'spawnAccelerationTicks',
  'marchSpeed',
]);

export function p108CandidateFingerprintData(candidate: P108TuningCandidate): CanonicalValue {
  return {
    id: candidate.id,
    description: candidate.description,
    changes: candidate.changes.map((change) => ({ ...change })),
  };
}

export function fingerprintP108Candidate(candidate: P108TuningCandidate): string {
  return fingerprintCanonical(p108CandidateFingerprintData(candidate));
}

/** Pure candidate transform. It always copies, normalizes, and freezes the campaign. */
export function applyP108TuningCandidate(
  baseline: readonly NormalizedMaltlineScenario[],
  candidate: P108TuningCandidate,
  seedOffset: number,
): readonly NormalizedMaltlineScenario[] {
  const changes = new Map(candidate.changes.map((change) => [`${change.stageId}:${change.field}`, change]));
  for (const change of candidate.changes) {
    const stageIndex = baseline.findIndex(({ id }) => id === change.stageId);
    if (stageIndex < 3 || stageIndex > 6) {
      throw new Error(`EXP-049 candidate ${candidate.id} may change only stages 4 through 7`);
    }
    if (baseline[stageIndex]![change.field] !== change.from) {
      throw new Error(`EXP-049 candidate ${candidate.id} change has a stale from value`);
    }
    if (change.from === change.to) throw new Error(`EXP-049 candidate ${candidate.id} change is a no-op`);
  }
  const campaign = baseline.map((scenario) => {
    const copy: MaltlineScenario = {
      ...scenario,
      stations: [...scenario.stations],
      seed: (scenario.seed + seedOffset) >>> 0,
    };
    for (const field of P108_TUNABLE_FIELDS) {
      const change = changes.get(`${scenario.id}:${field}`);
      if (change !== undefined) (copy[field] as number) = change.to;
    }
    return normalizeMaltlineScenario(copy);
  });
  if (campaign.length !== baseline.length
    || campaign.some((scenario, index) => scenario.id !== baseline[index]!.id)) {
    throw new Error('EXP-049 candidate changed campaign stage order or membership');
  }
  return Object.freeze(campaign);
}

export type P108CanonicalLabCandidateId = 'a-registered-control' | 'd-combined';

export interface P108CanonicalCampaignRequest {
  candidateId: P108CanonicalLabCandidateId;
  seedOffset: 0;
}

export interface P108CanonicalCampaignPackage {
  candidateId: P108CanonicalLabCandidateId;
  seedOffset: 0;
  campaign: readonly NormalizedMaltlineScenario[];
  initialRun: NormalizedRunContext;
  sourceAuthority: {
    identity: Readonly<MaltlineAuthorityIdentity>;
    verifiedConfigurationSha256: string;
  };
  fingerprints: {
    candidate: string;
    effectiveCampaign: string;
    scenarios: readonly { id: string; fingerprint: string }[];
  };
  policy: typeof P108_UNRANKED_BOUNDARY;
}

function exactRequest(value: unknown): P108CanonicalCampaignRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('EXP-049 canonical materializer request must be an object');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes('candidateId') || !keys.includes('seedOffset')) {
    throw new Error('EXP-049 canonical materializer request contains missing or unsupported options');
  }
  for (const key of ['candidateId', 'seedOffset'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`EXP-049 canonical materializer request.${key} must be a data property`);
    }
  }
  const request = value as Record<string, unknown>;
  if (request.candidateId !== 'a-registered-control' && request.candidateId !== 'd-combined') {
    throw new Error('EXP-049 canonical materializer supports only candidates A and D');
  }
  if (request.seedOffset !== 0) {
    throw new Error('EXP-049 canonical materializer supports only seed offset zero');
  }
  return Object.freeze({ candidateId: request.candidateId, seedOffset: 0 });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

/**
 * Verify the registered source, then materialize canonical A or D without
 * synthetic controllers, proof creation, browser state, or network services.
 */
export async function materializeCanonicalP108Campaign(
  requestValue: P108CanonicalCampaignRequest,
): Promise<P108CanonicalCampaignPackage> {
  const request = exactRequest(requestValue);
  const authority = await verifyMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY);
  const verifiedConfigurationSha256 = await sha256Canonical(getMaltlineAuthorityConfiguration(authority));
  if (verifiedConfigurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256
    || authority.identity.configurationSha256 !== MALTLINE_GENERATION_2_CONFIGURATION_SHA256) {
    throw new Error('EXP-049 canonical materializer requires the exact generation-2 authority');
  }
  const candidate = P108_TUNING_CANDIDATES.find(({ id }) => id === request.candidateId)!;
  const campaign = applyP108TuningCandidate(authority.campaign, candidate, request.seedOffset);
  const initialRun = normalizeMaltlineRunContext(authority.initialRun, campaign[0]!);
  return deepFreeze({
    candidateId: request.candidateId,
    seedOffset: request.seedOffset,
    campaign,
    initialRun,
    sourceAuthority: {
      identity: { ...authority.identity },
      verifiedConfigurationSha256,
    },
    fingerprints: {
      candidate: fingerprintP108Candidate(candidate),
      effectiveCampaign: fingerprintMaltlineCampaign(campaign),
      scenarios: campaign.map((scenario) => ({
        id: scenario.id,
        fingerprint: fingerprintNormalizedMaltlineScenario(scenario),
      })),
    },
    policy: P108_UNRANKED_BOUNDARY,
  });
}

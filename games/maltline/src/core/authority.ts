import { createAuthoredGeneration2Campaign } from './campaign-source';
import { MALTLINE_RNG_ID, MALTLINE_RNG_VERSION } from './rng';
import { MALTLINE_RULES, MALTLINE_SCENARIO_SCHEMA_VERSION } from './rules';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
  type NormalizedRunContext,
} from './scenario';
import { sha256Canonical, type CanonicalValue } from './fingerprint';
import type { MaltlineScenario } from './types';
import {
  MALTLINE_CAMPAIGN_GENERATION,
  MALTLINE_GAME_ID,
  MALTLINE_PROOF_VERSION,
  MALTLINE_RULESET_VERSION,
} from './version';

export const MALTLINE_AUTHORITY_SCHEMA_VERSION = 1 as const;

export const MALTLINE_RANKING_POLICY = Object.freeze({
  id: 'campaign-progress-score-v1',
  order: Object.freeze([
    Object.freeze({ field: 'completed', direction: 'descending' }),
    Object.freeze({ field: 'stageReached', direction: 'descending' }),
    Object.freeze({ field: 'score', direction: 'descending' }),
    Object.freeze({ field: 'totalTicks', direction: 'ascending' }),
    Object.freeze({ field: 'fulfilled', direction: 'descending' }),
  ]),
} as const);

export interface MaltlineAuthorityIdentity {
  gameId: typeof MALTLINE_GAME_ID;
  rulesetVersion: typeof MALTLINE_RULESET_VERSION;
  campaignGeneration: typeof MALTLINE_CAMPAIGN_GENERATION;
  configurationSha256: string;
}

export interface MaltlineCampaignAuthority {
  authoritySchemaVersion: typeof MALTLINE_AUTHORITY_SCHEMA_VERSION;
  identity: Readonly<MaltlineAuthorityIdentity>;
  scenarioSchemaVersion: typeof MALTLINE_SCENARIO_SCHEMA_VERSION;
  proofSchemaVersion: typeof MALTLINE_PROOF_VERSION;
  rng: Readonly<{
    id: typeof MALTLINE_RNG_ID;
    version: typeof MALTLINE_RNG_VERSION;
  }>;
  rules: typeof MALTLINE_RULES;
  campaign: readonly NormalizedMaltlineScenario[];
  initialRun: NormalizedRunContext;
  rankingPolicy: typeof MALTLINE_RANKING_POLICY;
}

function authorityConfiguration(authority: MaltlineCampaignAuthority): CanonicalValue {
  return Object.freeze({
    authoritySchemaVersion: authority.authoritySchemaVersion,
    gameId: authority.identity.gameId,
    rulesetVersion: authority.identity.rulesetVersion,
    campaignGeneration: authority.identity.campaignGeneration,
    scenarioSchemaVersion: authority.scenarioSchemaVersion,
    proofSchemaVersion: authority.proofSchemaVersion,
    rng: authority.rng,
    rules: authority.rules,
    campaign: authority.campaign,
    initialRun: authority.initialRun,
    rankingPolicy: authority.rankingPolicy,
  }) as unknown as CanonicalValue;
}

/**
 * Test-only constructor for proving snapshot isolation. Production verification
 * resolves the single registered authority below.
 */
export function createGeneration2AuthorityForTesting(
  sourceCampaign: readonly MaltlineScenario[],
  configurationSha256: string,
): MaltlineCampaignAuthority {
  const campaign = Object.freeze(sourceCampaign.map((scenario) => normalizeMaltlineScenario(scenario)));
  if (campaign.length !== 8) throw new Error('Generation 2 authority must contain exactly 8 stages.');
  const initialRun = normalizeMaltlineRunContext(undefined, campaign[0]!);
  return Object.freeze({
    authoritySchemaVersion: MALTLINE_AUTHORITY_SCHEMA_VERSION,
    identity: Object.freeze({
      gameId: MALTLINE_GAME_ID,
      rulesetVersion: MALTLINE_RULESET_VERSION,
      campaignGeneration: MALTLINE_CAMPAIGN_GENERATION,
      configurationSha256,
    }),
    scenarioSchemaVersion: MALTLINE_SCENARIO_SCHEMA_VERSION,
    proofSchemaVersion: MALTLINE_PROOF_VERSION,
    rng: Object.freeze({ id: MALTLINE_RNG_ID, version: MALTLINE_RNG_VERSION }),
    rules: MALTLINE_RULES,
    campaign,
    initialRun,
    rankingPolicy: MALTLINE_RANKING_POLICY,
  });
}

// SHA-256 of getMaltlineAuthorityConfiguration(MALTLINE_GENERATION_2_AUTHORITY).
// The golden test recomputes this with WebCrypto to prevent a stale pin.
export const MALTLINE_GENERATION_2_CONFIGURATION_SHA256 =
  'e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469';

export const MALTLINE_GENERATION_2_AUTHORITY = createGeneration2AuthorityForTesting(
  createAuthoredGeneration2Campaign(),
  MALTLINE_GENERATION_2_CONFIGURATION_SHA256,
);

export const MALTLINE_AUTHORITY_REGISTRY = Object.freeze([
  MALTLINE_GENERATION_2_AUTHORITY,
] as const);

export function getMaltlineAuthorityConfiguration(
  authority: MaltlineCampaignAuthority,
): CanonicalValue {
  return authorityConfiguration(authority);
}

export function resolveMaltlineAuthority(
  identity: Readonly<MaltlineAuthorityIdentity>,
): MaltlineCampaignAuthority | undefined {
  return MALTLINE_AUTHORITY_REGISTRY.find((candidate) => (
    candidate.identity.gameId === identity.gameId
    && candidate.identity.rulesetVersion === identity.rulesetVersion
    && candidate.identity.campaignGeneration === identity.campaignGeneration
    && candidate.identity.configurationSha256 === identity.configurationSha256
  ));
}

export class MaltlineAuthorityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaltlineAuthorityConfigurationError';
  }
}

const verifiedConfigurationDigests = new WeakMap<
  MaltlineCampaignAuthority,
  Promise<MaltlineCampaignAuthority>
>();

/**
 * Fail closed if a registered authority's pinned identity ever drifts from
 * its complete frozen configuration. The successful check is cached by the
 * immutable authority object, so request verification does not repeatedly
 * hash an unchanged campaign.
 */
export function verifyMaltlineAuthorityConfiguration(
  authority: MaltlineCampaignAuthority,
): Promise<MaltlineCampaignAuthority> {
  const existing = verifiedConfigurationDigests.get(authority);
  if (existing !== undefined) return existing;

  const pending = sha256Canonical(getMaltlineAuthorityConfiguration(authority)).then((actual) => {
    if (actual !== authority.identity.configurationSha256) {
      throw new MaltlineAuthorityConfigurationError(
        'Registered Maltline authority configuration does not match its pinned digest.',
      );
    }
    return authority;
  });
  verifiedConfigurationDigests.set(authority, pending);
  return pending;
}

export async function resolveVerifiedMaltlineAuthority(
  identity: Readonly<MaltlineAuthorityIdentity>,
): Promise<MaltlineCampaignAuthority | undefined> {
  const authority = resolveMaltlineAuthority(identity);
  return authority === undefined ? undefined : verifyMaltlineAuthorityConfiguration(authority);
}

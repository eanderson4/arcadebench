import {
  MALTLINE_GENERATION_2_AUTHORITY,
  MALTLINE_PROOF_ENVELOPE_VERSION,
} from '@arcadebench/maltline/verifier';

export const MALTLINE_GENERATION_2_SEASON_ID = 'maltline-generation-2' as const;
export const MALTLINE_PLATFORM_GAME_VERSION = '0.1.0' as const;

export const MALTLINE_GENERATION_2_STORAGE_CONTEXT = Object.freeze({
  seasonId: MALTLINE_GENERATION_2_SEASON_ID,
  gameId: MALTLINE_GENERATION_2_AUTHORITY.identity.gameId,
  gameVersion: MALTLINE_PLATFORM_GAME_VERSION,
  boardId: 'arcade' as const,
  authoritySchemaVersion: MALTLINE_GENERATION_2_AUTHORITY.authoritySchemaVersion,
  rulesetVersion: MALTLINE_GENERATION_2_AUTHORITY.identity.rulesetVersion,
  campaignGeneration: MALTLINE_GENERATION_2_AUTHORITY.identity.campaignGeneration,
  configurationSha256: MALTLINE_GENERATION_2_AUTHORITY.identity.configurationSha256,
  proofSchemaVersion: MALTLINE_GENERATION_2_AUTHORITY.proofSchemaVersion,
  envelopeVersion: MALTLINE_PROOF_ENVELOPE_VERSION,
});

export type MaltlineProofState = 'pending' | 'ready' | 'failed';

/**
 * The public row shape after a proof is authoritative and ready to rank.
 * Ranking values are verifier output; createdAt/id are stable storage ties.
 */
export interface MaltlineLeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  lives: number;
  stageReached: number;
  stagesCleared: number;
  completed: boolean;
  totalTicks: number;
  fulfilled: number;
  serviceActions: number;
  walkouts: number;
  resolved: number;
  exited: number;
  createdAt: string;
}

export interface MaltlineLeaderboardRow {
  id: string;
  player_name: string;
  score: number;
  lives: number;
  stage_reached: number;
  stages_cleared: number;
  completed: number;
  total_ticks: number;
  fulfilled: number;
  service_actions: number;
  walkouts: number;
  resolved: number;
  exited: number;
  created_at: string;
}

type AuthorityRankField = 'completed' | 'stageReached' | 'score' | 'totalTicks' | 'fulfilled';
type MaltlineRankField = AuthorityRankField | 'createdAt' | 'id';
type RankDirection = 'ascending' | 'descending';

export interface MaltlineRankClause {
  field: MaltlineRankField;
  direction: RankDirection;
}

const AUTHORITY_RANK_FIELDS: Readonly<Record<AuthorityRankField, true>> = Object.freeze({
  completed: true,
  stageReached: true,
  score: true,
  totalTicks: true,
  fulfilled: true,
});

function authorityRankClauses(): readonly MaltlineRankClause[] {
  return MALTLINE_GENERATION_2_AUTHORITY.rankingPolicy.order.map((clause) => {
    if (!(clause.field in AUTHORITY_RANK_FIELDS)) {
      throw new Error(`Unsupported Maltline authority ranking field: ${clause.field}`);
    }
    return Object.freeze({ field: clause.field, direction: clause.direction });
  });
}

export const MALTLINE_LEADERBOARD_ORDER = Object.freeze([
  ...authorityRankClauses(),
  Object.freeze({ field: 'createdAt', direction: 'ascending' } as const),
  Object.freeze({ field: 'id', direction: 'ascending' } as const),
]);

const SQL_COLUMN_BY_FIELD: Readonly<Record<MaltlineRankField, string>> = Object.freeze({
  completed: 'completed',
  stageReached: 'stage_reached',
  score: 'score',
  totalTicks: 'total_ticks',
  fulfilled: 'fulfilled',
  createdAt: 'created_at',
  id: 'id',
});

/** SQL fragment for trusted platform code, derived from the frozen authority. */
export const MALTLINE_LEADERBOARD_ORDER_BY = MALTLINE_LEADERBOARD_ORDER
  .map(({ field, direction }) => (
    `${SQL_COLUMN_BY_FIELD[field]} ${direction === 'ascending' ? 'ASC' : 'DESC'}`
  ))
  .join(', ');

function compareRankValue(left: number | string | boolean, right: number | string | boolean): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Comparator equivalent to MALTLINE_LEADERBOARD_ORDER_BY for in-memory consumers. */
export function compareMaltlineLeaderboardEntries(
  left: MaltlineLeaderboardEntry,
  right: MaltlineLeaderboardEntry,
): number {
  for (const { field, direction } of MALTLINE_LEADERBOARD_ORDER) {
    const comparison = compareRankValue(left[field], right[field]);
    if (comparison !== 0) return direction === 'ascending' ? comparison : -comparison;
  }
  return 0;
}

export function maltlineLeaderboardEntryFromRow(
  row: MaltlineLeaderboardRow,
): MaltlineLeaderboardEntry {
  return {
    id: row.id,
    playerName: row.player_name,
    score: row.score,
    lives: row.lives,
    stageReached: row.stage_reached,
    stagesCleared: row.stages_cleared,
    completed: row.completed === 1,
    totalTicks: row.total_ticks,
    fulfilled: row.fulfilled,
    serviceActions: row.service_actions,
    walkouts: row.walkouts,
    resolved: row.resolved,
    exited: row.exited,
    createdAt: row.created_at,
  };
}

/**
 * Stable object identity for the retained canonical envelope. The eventual
 * submit route must use this server-derived key, not a client-provided path.
 */
export function maltlineGeneration2ProofObjectKey(runId: string): string {
  if (!/^run_[A-Za-z0-9_-]{1,96}$/.test(runId)) {
    throw new Error('Invalid Maltline run id for proof storage.');
  }
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  return `proofs/maltline/ruleset-${context.rulesetVersion}`
    + `/campaign-${context.campaignGeneration}`
    + `/${context.configurationSha256}`
    + `/runs/${runId}`
    + `/envelope-v${context.envelopeVersion}.json`;
}

/**
 * Intended D1/R2 saga (transport deliberately not implemented here):
 *
 * 1. In one D1 transaction, consume the challenge and insert a pending score
 *    with the verifier hash and maltlineGeneration2ProofObjectKey(runId).
 * 2. Put the exact canonical envelope at that key without overwriting a
 *    different object; then transition pending -> ready in D1.
 * 3. Reconcile stranded pending rows by reading the deterministic key and
 *    comparing object bytes/hash. Promote an exact object to ready; mark a
 *    conclusive mismatch/unrecoverable absence failed. Never rank pending or
 *    failed rows, and never move a terminal state backward.
 * 4. Retention may delete a ready object and set proof_deleted_at while keeping
 *    its immutable verifier-derived score. Reconciliation must be idempotent.
 */

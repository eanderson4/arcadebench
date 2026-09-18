import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MALTLINE_GENERATION_2_AUTHORITY } from '@arcadebench/maltline';
import {
  MALTLINE_GENERATION_2_STORAGE_CONTEXT,
  MALTLINE_LEADERBOARD_ORDER,
  MALTLINE_LEADERBOARD_ORDER_BY,
  compareMaltlineLeaderboardEntries,
  maltlineGeneration2ProofObjectKey,
  maltlineLeaderboardEntryFromRow,
  type MaltlineLeaderboardRow,
  type MaltlineProofState,
} from '../src/maltline-leaderboard';

const SESSION_ID = 'session_maltline_data_model';
const MODERATION_KEY = 'moderation_maltline_data_model';
const CREATED_AT = '2026-09-10T12:00:00.000Z';
const PROOF_SHA256 = '1'.repeat(64);

interface ScoreFixture {
  id: string;
  completed?: boolean;
  stageReached?: number;
  score?: number;
  totalTicks?: number;
  fulfilled?: number;
  createdAt?: string;
  proofState?: MaltlineProofState;
}

async function insertChallenge(runId: string, nonce: number, rulesetVersion = 2): Promise<void> {
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  await env.DB.prepare(`
    INSERT INTO maltline_run_challenges (
      id, session_id, season_id, game_id, game_version, board_id,
      authority_schema_version, ruleset_version, campaign_generation,
      configuration_sha256, proof_schema_version, envelope_version, nonce,
      created_at, expires_at, consumed_at, consumed_score_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    SESSION_ID,
    context.seasonId,
    context.gameId,
    context.gameVersion,
    context.boardId,
    context.authoritySchemaVersion,
    rulesetVersion,
    context.campaignGeneration,
    context.configurationSha256,
    context.proofSchemaVersion,
    context.envelopeVersion,
    nonce,
    CREATED_AT,
    '2026-09-10T12:05:00.000Z',
    CREATED_AT,
    runId.replace(/^run_/, 'score_'),
  ).run();
}

async function insertScore(fixture: ScoreFixture, nonce: number): Promise<void> {
  const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
  const runId = fixture.id.replace(/^score_/, 'run_');
  const completed = fixture.completed ?? false;
  const stageReached = fixture.stageReached ?? 1;
  const proofState = fixture.proofState ?? 'ready';
  const proofReadyAt = proofState === 'ready' ? CREATED_AT : null;
  const proofFailedAt = proofState === 'failed' ? CREATED_AT : null;
  const proofFailureCode = proofState === 'failed' ? 'object_write_failed' : null;

  await insertChallenge(runId, nonce);
  await env.DB.prepare(`
    INSERT INTO maltline_scores (
      id, run_id, season_id, game_id, game_version, board_id,
      authority_schema_version, ruleset_version, campaign_generation,
      configuration_sha256, proof_schema_version, envelope_version, nonce,
      player_name, normalized_name,
      score, lives, stage_reached, stages_cleared, completed, total_ticks,
      fulfilled, service_actions, walkouts, resolved, exited,
      proof_object_key, proof_sha256, proof_state, proof_state_updated_at,
      proof_ready_at, proof_failed_at, proof_failure_code,
      proof_expires_at, proof_deleted_at, moderation_key, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).bind(
    fixture.id,
    runId,
    context.seasonId,
    context.gameId,
    context.gameVersion,
    context.boardId,
    context.authoritySchemaVersion,
    context.rulesetVersion,
    context.campaignGeneration,
    context.configurationSha256,
    context.proofSchemaVersion,
    context.envelopeVersion,
    nonce,
    fixture.id,
    fixture.id.toLowerCase(),
    fixture.score ?? 0,
    completed ? 4 : 0,
    stageReached,
    completed ? 8 : Math.max(0, stageReached - 1),
    completed ? 1 : 0,
    fixture.totalTicks ?? 1_000,
    fixture.fulfilled ?? 0,
    fixture.fulfilled ?? 0,
    0,
    fixture.fulfilled ?? 0,
    fixture.fulfilled ?? 0,
    maltlineGeneration2ProofObjectKey(runId),
    PROOF_SHA256,
    proofState,
    CREATED_AT,
    proofReadyAt,
    proofFailedAt,
    proofFailureCode,
    '2026-09-15T12:00:00.000Z',
    null,
    MODERATION_KEY,
    fixture.createdAt ?? CREATED_AT,
  ).run();
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO anonymous_sessions (id, created_at, last_seen_at)
      VALUES (?, ?, ?)
    `).bind(SESSION_ID, CREATED_AT, CREATED_AT),
    env.DB.prepare(`
      INSERT INTO callsign_moderation_cache (
        moderation_key, policy_version, allowed, category, model, created_at
      ) VALUES (?, 'maltline-test-v1', 1, 'clean', 'offline-test', ?)
    `).bind(MODERATION_KEY, CREATED_AT),
  ]);
});

describe('Maltline generation-2 D1 model', () => {
  it('preserves other active game seasons while archiving the additional cabinet authority', async () => {
    const result = await env.DB.prepare(`
      SELECT id, game_id AS gameId, game_version AS gameVersion, state
      FROM seasons
      ORDER BY game_id ASC, id ASC
    `).all<{ id: string; gameId: string; gameVersion: string; state: string }>();

    expect(result.results).toEqual([
      {
        id: 'maltline-cabinet-1',
        gameId: 'maltline',
        gameVersion: 'cabinet-1',
        state: 'archived',
      },
      {
        id: 'maltline-cabinet-2',
        gameId: 'maltline',
        gameVersion: 'cabinet-2',
        state: 'archived',
      },
      {
        id: 'maltline-generation-2',
        gameId: 'maltline',
        gameVersion: '0.1.0',
        state: 'active',
      },
      {
        id: 'partition-0-1-0-launch',
        gameId: 'partition',
        gameVersion: '0.1.0',
        state: 'active',
      },
      {
        id: 'smilefall-launch-1',
        gameId: 'smilefall',
        gameVersion: '1.0.0',
        state: 'active',
      },
    ]);
  });

  it('derives storage identity and ranking order from the frozen authority', async () => {
    expect(MALTLINE_GENERATION_2_STORAGE_CONTEXT).toEqual({
      seasonId: 'maltline-generation-2',
      gameId: 'maltline',
      gameVersion: '0.1.0',
      boardId: 'arcade',
      authoritySchemaVersion: 1,
      rulesetVersion: 2,
      campaignGeneration: 2,
      configurationSha256:
        'e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469',
      proofSchemaVersion: 1,
      envelopeVersion: 3,
    });
    expect(MALTLINE_LEADERBOARD_ORDER.slice(0, -2))
      .toEqual(MALTLINE_GENERATION_2_AUTHORITY.rankingPolicy.order);
    expect(MALTLINE_LEADERBOARD_ORDER.slice(-2)).toEqual([
      { field: 'createdAt', direction: 'ascending' },
      { field: 'id', direction: 'ascending' },
    ]);
    expect(MALTLINE_LEADERBOARD_ORDER_BY).toBe(
      'completed DESC, stage_reached DESC, score DESC, total_ticks ASC, '
      + 'fulfilled DESC, created_at ASC, id ASC',
    );
    expect(maltlineGeneration2ProofObjectKey('run_contract')).toBe(
      'proofs/maltline/ruleset-2/campaign-2/'
      + 'e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469/'
      + 'runs/run_contract/envelope-v3.json',
    );
    expect(() => maltlineGeneration2ProofObjectKey('../run_escape')).toThrow(/run id/i);

    const index = await env.DB.prepare(
      "PRAGMA index_xinfo('maltline_arcade_score_rank')",
    ).all<{ name: string | null; desc: number; key: number }>();
    expect(index.results.filter((column) => column.key === 1).map(({ name, desc }) => ({
      name,
      direction: desc === 1 ? 'descending' : 'ascending',
    }))).toEqual([
      { name: 'season_id', direction: 'ascending' },
      { name: 'completed', direction: 'descending' },
      { name: 'stage_reached', direction: 'descending' },
      { name: 'score', direction: 'descending' },
      { name: 'total_ticks', direction: 'ascending' },
      { name: 'fulfilled', direction: 'descending' },
      { name: 'created_at', direction: 'ascending' },
      { name: 'id', direction: 'ascending' },
    ]);
  });

  it('makes exact SQL ordering equal the TypeScript authority adapter', async () => {
    const fixtures: ScoreFixture[] = [
      { id: 'score_rank_complete', completed: true, stageReached: 8, score: 1, totalTicks: 9_000 },
      { id: 'score_rank_stage8_score600', stageReached: 8, score: 600, totalTicks: 9_000 },
      {
        id: 'score_rank_tie_a', stageReached: 8, score: 500, totalTicks: 100,
        fulfilled: 5, createdAt: '2026-09-10T12:00:01.000Z',
      },
      {
        id: 'score_rank_tie_b', stageReached: 8, score: 500, totalTicks: 100,
        fulfilled: 5, createdAt: '2026-09-10T12:00:01.000Z',
      },
      {
        id: 'score_rank_later', stageReached: 8, score: 500, totalTicks: 100,
        fulfilled: 5, createdAt: '2026-09-10T12:00:02.000Z',
      },
      { id: 'score_rank_fewer', stageReached: 8, score: 500, totalTicks: 100, fulfilled: 4 },
      { id: 'score_rank_slower', stageReached: 8, score: 500, totalTicks: 101, fulfilled: 999 },
      { id: 'score_rank_stage7_huge', stageReached: 7, score: 9_000_000, totalTicks: 1 },
      {
        id: 'score_rank_pending', completed: true, stageReached: 8, score: 9_000_001,
        totalTicks: 1, proofState: 'pending',
      },
      {
        id: 'score_rank_failed', completed: true, stageReached: 8, score: 9_000_002,
        totalTicks: 1, proofState: 'failed',
      },
    ];
    for (const [index, fixture] of fixtures.entries()) await insertScore(fixture, index + 1);

    const sqlResult = await env.DB.prepare(`
      SELECT
        id, player_name, score, lives, stage_reached, stages_cleared,
        completed, total_ticks, fulfilled, service_actions, walkouts,
        resolved, exited, created_at
      FROM maltline_scores
      WHERE season_id = ? AND board_id = 'arcade'
        AND proof_state = 'ready' AND id LIKE 'score_rank_%'
      ORDER BY ${MALTLINE_LEADERBOARD_ORDER_BY}
    `).bind(MALTLINE_GENERATION_2_STORAGE_CONTEXT.seasonId).all<MaltlineLeaderboardRow>();

    const sqlEntries = sqlResult.results.map(maltlineLeaderboardEntryFromRow);
    const typescriptEntries = [...sqlEntries].reverse().sort(compareMaltlineLeaderboardEntries);
    const expected = [
      'score_rank_complete',
      'score_rank_stage8_score600',
      'score_rank_tie_a',
      'score_rank_tie_b',
      'score_rank_later',
      'score_rank_fewer',
      'score_rank_slower',
      'score_rank_stage7_huge',
    ];
    expect(sqlEntries.map(({ id }) => id)).toEqual(expected);
    expect(typescriptEntries.map(({ id }) => id)).toEqual(expected);
  });

  it('retains protocol identity, nonce, derived summary, and deterministic proof state', async () => {
    await insertScore({
      id: 'score_retained_contract',
      completed: true,
      stageReached: 8,
      score: 30_125,
      totalTicks: 21_662,
      fulfilled: 145,
      proofState: 'pending',
    }, 0xffff_fffe);

    const row = await env.DB.prepare(`
      SELECT authority_schema_version AS authoritySchemaVersion,
        ruleset_version AS rulesetVersion,
        campaign_generation AS campaignGeneration,
        configuration_sha256 AS configurationSha256,
        proof_schema_version AS proofSchemaVersion,
        envelope_version AS envelopeVersion,
        nonce, score, lives, stage_reached AS stageReached,
        stages_cleared AS stagesCleared, completed,
        total_ticks AS totalTicks, fulfilled, service_actions AS serviceActions,
        walkouts, resolved, exited, proof_object_key AS proofObjectKey,
        proof_state AS proofState
      FROM maltline_scores WHERE id = 'score_retained_contract'
    `).first();

    expect(row).toMatchObject({
      authoritySchemaVersion: 1,
      rulesetVersion: 2,
      campaignGeneration: 2,
      configurationSha256:
        'e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469',
      proofSchemaVersion: 1,
      envelopeVersion: 3,
      nonce: 0xffff_fffe,
      score: 30_125,
      lives: 4,
      stageReached: 8,
      stagesCleared: 8,
      completed: 1,
      totalTicks: 21_662,
      fulfilled: 145,
      serviceActions: 145,
      walkouts: 0,
      resolved: 145,
      exited: 145,
      proofObjectKey: maltlineGeneration2ProofObjectKey('run_retained_contract'),
      proofState: 'pending',
    });
  });

  it('enforces forward-only lifecycle and rejects malformed retained context', async () => {
    await insertScore({ id: 'score_lifecycle', proofState: 'pending' }, 900);
    await env.DB.prepare(`
      UPDATE maltline_scores
      SET proof_state = 'ready', proof_ready_at = ?, proof_state_updated_at = ?
      WHERE id = 'score_lifecycle'
    `).bind(CREATED_AT, CREATED_AT).run();
    await expect(env.DB.prepare(`
      UPDATE maltline_scores
      SET proof_state = 'failed', proof_ready_at = NULL,
        proof_failed_at = ?, proof_failure_code = 'late_failure'
      WHERE id = 'score_lifecycle'
    `).bind(CREATED_AT).run()).rejects.toThrow(/cannot move backward/i);
    await expect(env.DB.prepare(`
      UPDATE maltline_scores SET score = score + 1 WHERE id = 'score_lifecycle'
    `).run()).rejects.toThrow(/verified score is immutable/i);

    await expect(insertChallenge('run_bad_nonce', 4_294_967_296)).rejects.toThrow(/constraint/i);

    await insertChallenge('run_bad_context', 901);
    const context = MALTLINE_GENERATION_2_STORAGE_CONTEXT;
    await expect(env.DB.prepare(`
      INSERT INTO maltline_scores (
        id, run_id, season_id, game_id, game_version, board_id,
        authority_schema_version, ruleset_version, campaign_generation,
        configuration_sha256, proof_schema_version, envelope_version, nonce,
        player_name, normalized_name, score, lives, stage_reached, stages_cleared,
        completed, total_ticks, fulfilled, service_actions, walkouts, resolved, exited,
        proof_object_key, proof_sha256, proof_state, proof_state_updated_at,
        proof_ready_at, proof_failed_at, proof_failure_code, proof_expires_at,
        proof_deleted_at, moderation_key, created_at
      ) VALUES (
        'score_bad_context', 'run_bad_context', ?, 'maltline', '0.1.0', 'arcade',
        1, 99, 2, ?, 1, 3, 901,
        'BAD', 'bad', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0,
        ?, ?, 'pending', ?, NULL, NULL, NULL, ?, NULL, ?, ?
      )
    `).bind(
      context.seasonId,
      context.configurationSha256,
      maltlineGeneration2ProofObjectKey('run_bad_context'),
      PROOF_SHA256,
      CREATED_AT,
      '2026-09-15T12:00:00.000Z',
      MODERATION_KEY,
      CREATED_AT,
    ).run()).rejects.toThrow(/context does not match challenge/i);
  });
});

import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ArcadeBenchEnv } from '../src/env';
import { partitionAdapter } from '../src/partition-adapter';
import { canonicalContextJson } from '../src/shared/canonical';
import { resolveBoardInstance, submitSharedScore } from '../src/shared/leaderboards';
import { insertEventStatement, insertPublicationStatement } from '../src/shared/publication';
import { cleanupSharedReplayObjects } from '../src/shared/replays';
import { REPLAY_RETENTION_MS, type BoardInstance } from '../src/shared/types';
import {
  GAME_VERSION,
  V1_API,
  V2_API,
  allowCallsign,
  arcadeProof,
  beginRun,
  levelProof,
  listEntries,
  submitArcadeScore,
  submitBoardScore,
  submitLevelScore,
  workerFetch,
} from './support/partition-fixtures';

interface EntryRow {
  id: string;
  board_key: string;
  replay_object_id: string | null;
  rank_1: number;
  rank_2: number;
  rank_3: number;
  rank_4: number;
  state: string;
  created_at: string;
}

interface ReplayObjectRow {
  id: string;
  object_key: string;
  state: string;
  qualifies: number;
  expires_at: string | null;
  entry_id: string | null;
}

async function replayObjectFor(entryId: string): Promise<ReplayObjectRow> {
  const entry = await env.DB.prepare('SELECT replay_object_id FROM leaderboard_entries WHERE id = ?')
    .bind(entryId).first<{ replay_object_id: string | null }>();
  const row = await env.DB.prepare('SELECT * FROM replay_objects WHERE id = ?')
    .bind(entry!.replay_object_id).first<ReplayObjectRow>();
  expect(row, `replay object for ${entryId}`).toBeTruthy();
  return row!;
}

async function publication(entryId: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare('SELECT * FROM entry_publication WHERE entry_id = ?')
    .bind(entryId).first<Record<string, unknown>>();
}

async function eventCount(entryId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM activity_events WHERE entry_id = ?')
    .bind(entryId).first<{ count: number }>();
  return row?.count ?? 0;
}

async function seedBoard(board: BoardInstance, label: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO leaderboard_boards
      (board_key, game_id, game_version, authority_id, ranking_policy_version, season_id,
       board_id, context_json, label, state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'visible', ?)
    ON CONFLICT (board_key) DO NOTHING
  `).bind(
    board.boardKey,
    board.gameId,
    board.gameVersion,
    board.authorityId,
    board.rankingPolicyVersion,
    board.seasonId,
    board.boardId,
    canonicalContextJson(board.context),
    label,
    new Date().toISOString(),
  ).run();
}

async function seedEntries(board: BoardInstance, count: number): Promise<string[]> {
  const ids: string[] = [];
  const statements: D1PreparedStatement[] = [];
  const resultJson = JSON.stringify({
    capturedFraction: 1,
    difficulty: 'medium',
    elapsedMs: 100,
    levelId: 'soft-corners',
    levelNumber: 3,
    levelTitle: 'Soft Corners',
    partitions: 1,
    scope: 'level',
    won: true,
  });
  for (let index = 0; index < count; index++) {
    const id = `score_seeded_${String(index).padStart(3, '0')}`;
    ids.push(id);
    statements.push(env.DB.prepare(`
      INSERT INTO leaderboard_entries
        (id, board_key, game_id, game_version, season_id, board_id, player_name,
         normalized_name, result_json, rank_1, rank_2, rank_3, rank_4, rank_5,
         rank_6, rank_7, rank_8, state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'SEEDED', 'seeded', ?, -1, 0, 100, 1, 0, 0, 0, 0, 'eligible', ?)
    `).bind(
      id,
      board.boardKey,
      board.gameId,
      board.gameVersion,
      board.seasonId,
      board.boardId,
      resultJson,
      new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    ));
  }
  await env.DB.batch(statements);
  return ids;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('shared verified-score submission', () => {
  it('publishes a top-50 Partition score with the new retention policy', async () => {
    const playerName = 'PUBLISH ONE';
    await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'medium', levelId: 'first-light' });
    const proof = levelProof(run.seed, 'medium', 'first-light');
    const submitted = await submitLevelScore({
      cookie: run.cookie,
      runId: run.runId,
      playerName,
      proof,
      socialMedia: false,
    });

    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    const entry = submitted.body.entry as Record<string, unknown>;
    expect(entry).toMatchObject({
      gameId: 'partition',
      gameVersion: GAME_VERSION,
      playerName,
      board: {
        id: 'level',
        label: 'First Light · Medium',
        context: { difficulty: 'medium', levelId: 'first-light' },
      },
      result: proof.score,
    });
    expect(submitted.body.publication).toEqual({
      rankAtSubmission: 1,
      replaySaved: true,
      expiresAt: null,
    });

    const stored = await env.DB.prepare('SELECT * FROM leaderboard_entries WHERE id = ?')
      .bind(entry.id).first<EntryRow>();
    expect(stored?.state).toBe('eligible');
    const board = await resolveBoardInstance(env, partitionAdapter, 'level', {
      difficulty: 'medium',
      levelId: 'first-light',
    });
    expect(stored?.board_key).toBe(board.boardKey);
    // The rank vector the trigger derived from the legacy detail row is the
    // one the adapter derived from the verified replay.
    const fraction = Number(proof.score.capturedFraction);
    expect([
      stored?.rank_1, stored?.rank_2, stored?.rank_3, stored?.rank_4,
    ]).toEqual([
      proof.score.won === true ? -1 : 0,
      proof.score.won === true || fraction === 0 ? 0 : -fraction,
      proof.score.elapsedMs,
      proof.score.partitions,
    ]);

    const published = await publication(String(entry.id));
    expect(published).toMatchObject({
      policy_version: 'top50-social-v1',
      social_media: 0,
      rank_at_submission: 1,
      qualified: 1,
      replay_saved: 1,
      expires_at: null,
    });
    expect(published?.replay_object_id).toBe(stored?.replay_object_id);

    const object = await replayObjectFor(String(entry.id));
    expect(object).toMatchObject({ state: 'ready', qualifies: 1, entry_id: entry.id });
    expect(object.expires_at).toBeNull();
    expect(object.object_key).toBe(`archives/partition/${GAME_VERSION}/${object.id}.json`);
    expect(await env.REPLAYS.get(object.object_key)).not.toBeNull();

    // The legacy detail row defers retention to the private replay object, so
    // the five-day legacy cleanup can never delete a retained archive.
    const detail = await env.DB.prepare(`
      SELECT proof_object_key AS objectKey, proof_expires_at AS expiresAt FROM scores WHERE id = ?
    `).bind(entry.id).first<{ objectKey: string; expiresAt: string | null }>();
    expect(detail?.objectKey).toBe(object.object_key);
    expect(detail?.expiresAt).toBeNull();

    expect(await eventCount(String(entry.id))).toBe(1);

    const listed = await listEntries('level', { difficulty: 'medium', levelId: 'first-light' });
    expect(listed.entries[0]?.id).toBe(entry.id);
    expect(listed.entries[0]?.board).toEqual({
      id: 'level',
      label: 'First Light · Medium',
      context: { difficulty: 'medium', levelId: 'first-light' },
    });

    // The legacy v1 listing reads the same shared row and keeps its exact shape.
    const legacy = await workerFetch(
      `${V1_API}/leaderboards/level?filter.difficulty=medium&filter.levelId=first-light`,
    );
    const legacyBody = await legacy.json() as { entries: Array<Record<string, unknown>> };
    expect(legacyBody.entries[0]).toEqual({
      id: entry.id,
      name: playerName,
      difficulty: 'medium',
      elapsedMs: proof.score.elapsedMs,
      partitions: proof.score.partitions,
      createdAt: (entry as { createdAt: string }).createdAt,
      scope: 'level',
      levelId: 'first-light',
      levelNumber: 1,
      levelTitle: 'First Light',
      won: proof.score.won,
      capturedFraction: proof.score.capturedFraction,
    });

    // A retained archive is never claimed by cleanup, even long after five days.
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await expect(cleanupSharedReplayObjects(env, later)).resolves.toMatchObject({ claimed: 0 });
    expect(await env.REPLAYS.get(object.object_key)).not.toBeNull();
  });

  it('treats the social-media permission as irrelevant to ranking and activity', async () => {
    const names = ['SOCIAL YES', 'SOCIAL NO'];
    for (const name of names) await allowCallsign(name);
    const boards = await Promise.all([
      beginRun('level', { difficulty: 'hard', levelId: 'twin-drift' }),
      beginRun('level', { difficulty: 'hard', levelId: 'twin-drift' }),
    ]);
    const submitted = await Promise.all([
      submitLevelScore({
        cookie: boards[0]!.cookie,
        runId: boards[0]!.runId,
        playerName: names[0]!,
        proof: levelProof(boards[0]!.seed, 'hard', 'twin-drift'),
        socialMedia: true,
      }),
      submitLevelScore({
        cookie: boards[1]!.cookie,
        runId: boards[1]!.runId,
        playerName: names[1]!,
        proof: levelProof(boards[1]!.seed, 'hard', 'twin-drift'),
        socialMedia: false,
      }),
    ]);
    expect(submitted.map((result) => result.status)).toEqual([201, 201]);

    const entries = submitted.map((result) => result.body.entry as Record<string, unknown>);
    const publications = await Promise.all(entries.map((entry) => publication(String(entry.id))));
    expect(publications.map((row) => row?.social_media).sort()).toEqual([0, 1]);
    // The permission is stored per run and decides nothing else.
    expect(publications.map((row) => row?.policy_version)).toEqual([
      'top50-social-v1',
      'top50-social-v1',
    ]);
    for (const entry of entries) expect(await eventCount(String(entry.id))).toBe(1);

    const feed = await workerFetch(`${V2_API}/activity?limit=50`);
    const page = await feed.json() as { entries: Array<Record<string, unknown>> };
    const rows = page.entries.filter((row) => entries.some((entry) => entry.id === row.entryId));
    expect(rows).toHaveLength(2);
    // Both runs appear identically: no consent, session, or note is on the feed.
    expect(rows[0]!.type).toBe('leaderboard.qualified');
    expect(JSON.stringify(rows)).not.toMatch(/social|consent|session|note/u);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'board', 'entryId', 'gameId', 'gameTitle', 'id', 'leaderboardPath',
      'occurredAt', 'playerName', 'rankAtSubmission', 'type',
    ]);
  });

  it('rejects unknown, malformed, and version-mismatched publication policies', async () => {
    const playerName = 'POLICY CHECK';
    await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'easy', levelId: 'soft-corners' });
    const proof = levelProof(run.seed, 'easy', 'soft-corners');
    const cases: Array<{ label: string; publication?: unknown; error: RegExp }> = [
      { label: 'missing', error: /Publication policy must be an object/u },
      {
        label: 'training field',
        publication: { policyVersion: 'top50-social-v1', socialMedia: false, training: true },
        error: /unsupported fields/u,
      },
      {
        label: 'non-boolean consent',
        publication: { policyVersion: 'top50-social-v1', socialMedia: 'true' },
        error: /must be true or false/u,
      },
      {
        label: 'wrong version',
        publication: { policyVersion: 'top50-social-v2', socialMedia: false },
        error: /version is not supported/u,
      },
    ];
    for (const testCase of cases) {
      const rejected = await submitBoardScore({
        cookie: run.cookie,
        runId: run.runId,
        boardId: 'level',
        playerName,
        score: proof.score,
        proof: { replays: [proof.replay] },
        ...(testCase.publication === undefined ? {} : { publication: testCase.publication }),
      });
      expect(rejected.status, testCase.label).toBe(400);
      expect(String(rejected.body.error), testCase.label).toMatch(testCase.error);
    }
    const entries = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM leaderboard_entries WHERE run_id = ?",
    ).bind(run.runId).first<{ count: number }>();
    expect(entries?.count).toBe(0);

    // None of the rejected attempts consumed the one-time challenge.
    const accepted = await submitLevelScore({
      cookie: run.cookie,
      runId: run.runId,
      playerName,
      proof,
      socialMedia: false,
    });
    expect(accepted.status).toBe(201);
  });

  it('refuses duplicate and expired challenges without duplicating a score or event', async () => {
    const playerName = 'DOUBLE TAP';
    await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'easy', levelId: 'garden-gate' });
    const proof = levelProof(run.seed, 'easy', 'garden-gate');
    const first = await submitLevelScore({
      cookie: run.cookie,
      runId: run.runId,
      playerName,
      proof,
      socialMedia: false,
    });
    expect(first.status).toBe(201);
    const entryId = String((first.body.entry as { id: string }).id);

    const duplicate = await submitLevelScore({
      cookie: run.cookie,
      runId: run.runId,
      playerName,
      proof,
      socialMedia: false,
    });
    expect(duplicate.status).toBe(409);
    expect(await eventCount(entryId)).toBe(1);
    const rows = await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE run_id = ?')
      .bind(run.runId).all<{ id: string }>();
    expect(rows.results).toHaveLength(1);

    const expired = await beginRun('level', { difficulty: 'easy', levelId: 'garden-gate' });
    await env.DB.prepare('UPDATE run_challenges SET expires_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), expired.runId).run();
    const late = await submitLevelScore({
      cookie: expired.cookie,
      runId: expired.runId,
      playerName,
      proof: levelProof(expired.seed, 'easy', 'garden-gate'),
      socialMedia: false,
    });
    expect(late.status).toBe(410);
  });

  it('rolls the whole submission back inside SQL when the replay object cannot be finalized', async () => {
    const playerName = 'RACE LOSS';
    const moderationKey = await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'medium', levelId: 'garden-gate' });
    const proof = levelProof(run.seed, 'medium', 'garden-gate');
    const board = await resolveBoardInstance(env, partitionAdapter, 'level', {
      difficulty: 'medium',
      levelId: 'garden-gate',
    });
    const entryId = 'score_rollback_probe';
    const at = new Date().toISOString();

    for (const state of ['deleting', 'ready'] as const) {
      await env.DB.prepare(`
        INSERT INTO replay_objects
          (id, game_id, game_version, entry_id, object_key, sha256, state, qualifies,
           expires_at, created_at, updated_at)
        VALUES (?, 'partition', ?, NULL, ?, ?, ?, 0, ?, ?, ?)
      `).bind(
        `replay_probe_${state}`,
        GAME_VERSION,
        `archives/partition/${GAME_VERSION}/replay_probe_${state}.json`,
        'c'.repeat(64),
        state,
        new Date(Date.now() + REPLAY_RETENTION_MS).toISOString(),
        at,
        at,
      ).run();

      await expect(env.DB.batch([
        partitionAdapter.consumeChallengeStatement({
          env,
          runId: run.runId,
          sessionId: run.sessionId,
          entryId,
          board,
          at,
        }),
        partitionAdapter.insertEntryStatement({
          env,
          id: entryId,
          boardKey: board.boardKey,
          boardId: 'level',
          gameId: 'partition',
          gameVersion: GAME_VERSION,
          seasonId: board.seasonId,
          playerName,
          normalizedName: playerName.toLocaleLowerCase(),
          resultJson: JSON.stringify(proof.score),
          rankComponents: [],
          moderationKey,
          runId: run.runId,
          sessionId: run.sessionId,
          createdAt: at,
          replayObjectId: `replay_probe_${state}`,
          replayObjectKey: `archives/partition/${GAME_VERSION}/replay_probe_${state}.json`,
          replaySha256: 'c'.repeat(64),
        }),
        insertPublicationStatement(env, {
          entryId,
          boardKey: board.boardKey,
          decision: { policyVersion: 'top50-social-v1', socialMedia: false },
          replayObjectId: `replay_probe_${state}`,
          retentionDeadline: new Date(Date.now() + REPLAY_RETENTION_MS).toISOString(),
          createdAt: at,
          rankComponents: [0, 0, 1, 0],
        }),
        insertEventStatement(env, { id: `event_probe_${state}`, entryId }),
      ]), state).rejects.toThrow(/finalizable|expired/u);

      // Nothing from the aborted batch survived: the challenge is unconsumed and
      // no entry, publication, or event was written.
    }

    const challenge = await env.DB.prepare(
      'SELECT consumed_score_id FROM run_challenges WHERE id = ?',
    ).bind(run.runId).first<{ consumed_score_id: string | null }>();
    expect(challenge?.consumed_score_id).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM leaderboard_entries WHERE id = ?')
      .bind(entryId).first()).toBeNull();
    expect(await publication(entryId)).toBeNull();
    expect(await eventCount(entryId)).toBe(0);
    await env.DB.prepare("DELETE FROM replay_objects WHERE id LIKE 'replay_probe_%'").run();

    // The same run still submits successfully once the object is healthy.
    const accepted = await submitLevelScore({
      cookie: run.cookie,
      runId: run.runId,
      playerName,
      proof,
      socialMedia: false,
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
  });

  it('rolls back when a pending replay object is already past its cleanup deadline', async () => {
    // Finalization must use the database clock, not a caller's earlier timestamp.
    const at = new Date(Date.now() - REPLAY_RETENTION_MS * 2).toISOString();
    await env.DB.prepare(`
      INSERT INTO replay_objects
        (id, game_id, game_version, entry_id, object_key, sha256, state, qualifies,
         expires_at, created_at, updated_at)
      VALUES ('replay_probe_expired', 'partition', ?, NULL, ?, ?, 'pending', 0, ?, ?, ?)
    `).bind(
      GAME_VERSION,
      `archives/partition/${GAME_VERSION}/replay_probe_expired.json`,
      'd'.repeat(64),
      new Date(Date.now() - 1000).toISOString(),
      at,
      at,
    ).run();
    await expect(env.DB.prepare(`
      INSERT INTO entry_publication
        (entry_id, policy_version, social_media, rank_at_submission, qualified,
         replay_saved, replay_object_id, expires_at, created_at)
      VALUES ('score_expired_probe', 'top50-social-v1', 0, 1, 1, 1, 'replay_probe_expired', NULL, ?)
    `).bind(at).run()).rejects.toThrow(/expired before finalization/u);
    await env.DB.prepare("DELETE FROM replay_objects WHERE id = 'replay_probe_expired'").run();
  });

  it('leaves only a cleanup-eligible pending object when the replay upload fails', async () => {
    const playerName = 'UPLOAD FAIL';
    await allowCallsign(playerName);
    const run = await beginRun('level', { difficulty: 'medium', levelId: 'twin-drift' });
    const proof = levelProof(run.seed, 'medium', 'twin-drift');
    const failing = Object.create(env) as ArcadeBenchEnv;
    Object.defineProperty(failing, 'REPLAYS', {
      value: { put: async () => { throw new Error('r2 unavailable'); } },
    });

    await expect(submitSharedScore({
      env: failing,
      adapter: partitionAdapter,
      session: { id: run.sessionId },
      boardId: 'level',
      body: {
        gameVersion: GAME_VERSION,
        runId: run.runId,
        playerName,
        score: proof.score,
        proof: { replays: [proof.replay] },
        publication: { policyVersion: 'top50-social-v1', socialMedia: false },
      },
    })).rejects.toMatchObject({ status: 503 });

    const pending = await env.DB.prepare(
      "SELECT * FROM replay_objects WHERE state = 'pending' ORDER BY created_at DESC LIMIT 1",
    ).first<ReplayObjectRow>();
    expect(pending?.entry_id).toBeNull();
    const deadline = Date.parse(String(pending?.expires_at));
    expect(deadline - Date.now()).toBeGreaterThan(REPLAY_RETENTION_MS - 60_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(REPLAY_RETENTION_MS);
    const challenge = await env.DB.prepare(
      'SELECT consumed_score_id FROM run_challenges WHERE id = ?',
    ).bind(run.runId).first<{ consumed_score_id: string | null }>();
    expect(challenge?.consumed_score_id).toBeNull();

    // An orphan upload cannot silently become an indefinite archive.
    const orphanCleanup = await cleanupSharedReplayObjects(
      env,
      new Date(Date.now() + REPLAY_RETENTION_MS + 60_000),
    );
    expect(orphanCleanup.claimed).toBe(1);
    expect(orphanCleanup.deleted).toBe(1);
    const cleaned = await env.DB.prepare('SELECT state, deleted_at FROM replay_objects WHERE id = ?')
      .bind(pending!.id).first<{ state: string; deleted_at: string | null }>();
    expect(cleaned?.state).toBe('deleted');
    expect(cleaned?.deleted_at).toBeTruthy();
  });

  it('keeps a failed deletion retryable instead of reporting it deleted', async () => {
    const at = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO replay_objects
        (id, game_id, game_version, entry_id, object_key, sha256, state, qualifies,
         expires_at, created_at, updated_at)
      VALUES ('replay_probe_retry', 'partition', ?, NULL, ?, ?, 'ready', 0, ?, ?, ?)
    `).bind(
      GAME_VERSION,
      `archives/partition/${GAME_VERSION}/replay_probe_retry.json`,
      'e'.repeat(64),
      new Date(Date.now() - 60_000).toISOString(),
      at,
      at,
    ).run();
    await env.REPLAYS.put(
      `archives/partition/${GAME_VERSION}/replay_probe_retry.json`,
      '{}',
      { httpMetadata: { contentType: 'application/json' } },
    );

    const failing = Object.create(env) as ArcadeBenchEnv;
    Object.defineProperty(failing, 'REPLAYS', {
      value: {
        put: async () => undefined,
        delete: async () => { throw new Error('r2 delete failed'); },
      },
    });
    await expect(cleanupSharedReplayObjects(failing)).resolves.toEqual({ claimed: 1, deleted: 0 });
    const claimed = await env.DB.prepare('SELECT state, delete_attempts FROM replay_objects WHERE id = ?')
      .bind('replay_probe_retry').first<{ state: string; delete_attempts: number }>();
    expect(claimed).toMatchObject({ state: 'deleting' });
    expect(claimed?.delete_attempts).toBe(1);

    await expect(cleanupSharedReplayObjects(env)).resolves.toMatchObject({ claimed: 1, deleted: 1 });
    expect(await env.REPLAYS.get(`archives/partition/${GAME_VERSION}/replay_probe_retry.json`))
      .toBeNull();
  });

  it('qualifies rank 50, keeps five-day retention at rank 51, and snapshots concurrent placement', async () => {
    const playerName = 'BOUNDARY';
    await allowCallsign(playerName);
    const board = await resolveBoardInstance(env, partitionAdapter, 'level', {
      difficulty: 'medium',
      levelId: 'soft-corners',
    });
    await seedBoard(board, 'Soft Corners · Medium');
    await seedEntries(board, 49);

    const fiftieth = await beginRun('level', { difficulty: 'medium', levelId: 'soft-corners' });
    const fiftiethProof = levelProof(fiftieth.seed, 'medium', 'soft-corners');
    const reached = await submitLevelScore({
      cookie: fiftieth.cookie,
      runId: fiftieth.runId,
      playerName,
      proof: fiftiethProof,
      socialMedia: false,
    });
    expect(reached.status, JSON.stringify(reached.body)).toBe(201);
    expect(reached.body.publication).toEqual({
      rankAtSubmission: 50,
      replaySaved: true,
      expiresAt: null,
    });
    const fiftiethObject = await replayObjectFor(String((reached.body.entry as { id: string }).id));
    expect(fiftiethObject).toMatchObject({ qualifies: 1 });
    expect(fiftiethObject.expires_at).toBeNull();

    // Equal-score submissions can both arrive at rank 51 if the second one's
    // stable tie-break sorts before the first. Historical placement is a snapshot.
    const [left, right] = await Promise.all([
      beginRun('level', { difficulty: 'medium', levelId: 'soft-corners' }),
      beginRun('level', { difficulty: 'medium', levelId: 'soft-corners' }),
    ]);
    const simultaneous = await Promise.all([
      submitLevelScore({
        cookie: left.cookie,
        runId: left.runId,
        playerName,
        proof: levelProof(left.seed, 'medium', 'soft-corners'),
        socialMedia: false,
      }),
      submitLevelScore({
        cookie: right.cookie,
        runId: right.runId,
        playerName,
        proof: levelProof(right.seed, 'medium', 'soft-corners'),
        socialMedia: false,
      }),
    ]);
    expect(simultaneous.map((result) => result.status)).toEqual([201, 201]);
    const ranks = simultaneous
      .map((result) => (result.body.publication as { rankAtSubmission: number }).rankAtSubmission)
      .sort((a, b) => a - b);
    expect(ranks[0]).toBe(51);
    expect([51, 52]).toContain(ranks[1]);
    const finalEntries = await env.DB.prepare(`
      SELECT e.id, p.rank_at_submission
      FROM leaderboard_entries e JOIN entry_publication p ON p.entry_id = e.id
      WHERE e.board_key = ?
      ORDER BY e.rank_1, e.rank_2, e.rank_3, e.rank_4, e.rank_5,
        e.rank_6, e.rank_7, e.rank_8, e.created_at, e.id
    `).bind(board.boardKey).all<{ id: string; rank_at_submission: number }>();
    expect(finalEntries.results[0]?.rank_at_submission).toBe(50);
    expect(finalEntries.results[1]?.rank_at_submission).toBe(51);
    expect([51, 52]).toContain(finalEntries.results[2]?.rank_at_submission);
    expect(new Set(finalEntries.results.slice(1).map((entry) => entry.id))).toEqual(
      new Set(simultaneous.map((result) => String((result.body.entry as { id: string }).id))),
    );

    // Rank 51 is an ordinary candidate: five-day retention and no archive.
    const ordinary = simultaneous
      .find((result) => (result.body.publication as { rankAtSubmission: number }).rankAtSubmission === 51)!;
    const ordinaryEntryId = String((ordinary.body.entry as { id: string }).id);
    const expiresAt = (ordinary.body.publication as { expiresAt: string }).expiresAt;
    expect(ordinary.body.publication).toMatchObject({ replaySaved: false });
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(REPLAY_RETENTION_MS - 60_000);
    const ordinaryObject = await replayObjectFor(ordinaryEntryId);
    expect(ordinaryObject.qualifies).toBe(0);
    expect(ordinaryObject.expires_at).toBe(expiresAt);
    // Activity reports Top 50 achievements; an ordinary score emits no event.
    expect(await eventCount(ordinaryEntryId)).toBe(0);
    const event = await env.DB.prepare('SELECT rank_at_submission FROM activity_events WHERE entry_id = ?')
      .bind(ordinaryEntryId).first<{ rank_at_submission: number }>();
    expect(event).toBeNull();

    const positions = await env.DB.prepare(`
      SELECT COUNT(DISTINCT p.entry_id) AS uniqueEntries, COUNT(*) AS total
      FROM entry_publication p JOIN leaderboard_entries e ON e.id = p.entry_id
      WHERE e.board_key = ?
    `).bind(board.boardKey).first<{ uniqueEntries: number; total: number }>();
    expect(positions).toEqual({ uniqueEntries: 3, total: 3 });

    const cleanup = await cleanupSharedReplayObjects(env, new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
    // Both ordinary candidates expire; the retained Top 50 archive does not.
    expect(cleanup.claimed).toBe(2);
    expect(await env.REPLAYS.get(ordinaryObject.object_key)).toBeNull();
    expect(await env.REPLAYS.get(fiftiethObject.object_key)).not.toBeNull();
  });

  it('applies the new v2 route while the legacy route keeps its five-day policy', async () => {
    const playerName = 'LEGACY PATH';
    await allowCallsign(playerName);
    const started = await workerFetch(`${V1_API}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameVersion: GAME_VERSION,
        boardId: 'level',
        context: { difficulty: 'hard', levelId: 'soft-corners' },
      }),
    });
    expect(started.status).toBe(201);
    const cookie = started.headers.get('set-cookie')!.split(';')[0]!;
    const challenge = await started.json() as { id: string; seed: number };
    const proof = levelProof(challenge.seed, 'hard', 'soft-corners');
    const submitted = await workerFetch(`${V1_API}/leaderboards/level`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        gameVersion: GAME_VERSION,
        runId: challenge.id,
        playerName,
        score: proof.score,
        proof: { replays: [proof.replay] },
      }),
    });
    expect(submitted.status, await submitted.clone().text()).toBe(201);
    const legacyEntry = await submitted.json() as { entry: { id: string } };

    // The legacy route writes no publication and no activity: earlier
    // submissions keep their earlier policy.
    expect(await publication(legacyEntry.entry.id)).toBeNull();
    expect(await eventCount(legacyEntry.entry.id)).toBe(0);
    const detail = await env.DB.prepare(`
      SELECT proof_object_key AS objectKey, proof_expires_at AS expiresAt
      FROM scores WHERE id = ?
    `).bind(legacyEntry.entry.id).first<{ objectKey: string; expiresAt: string }>();
    expect(detail?.objectKey).toBe(`proofs/partition/${GAME_VERSION}/${legacyEntry.entry.id}.json`);
    expect(Date.parse(detail!.expiresAt) - Date.now())
      .toBeGreaterThan(REPLAY_RETENTION_MS - 60_000);
    expect(await env.REPLAYS.get(detail!.objectKey)).not.toBeNull();

    // It still lands on the shared board, ranked with every other score.
    const listed = await listEntries('level', { difficulty: 'hard', levelId: 'soft-corners' });
    expect(listed.entries.map((entry) => entry.id)).toContain(legacyEntry.entry.id);
  });

  it('keeps difficulty and field contexts on separate boards', async () => {
    await allowCallsign('ARCADE MED');
    await allowCallsign('ARCADE HARD');
    const ratings = await Promise.all([
      beginRun('arcade', { difficulty: 'medium' }),
      beginRun('arcade', { difficulty: 'hard' }),
    ]);
    const submitted = await Promise.all([
      submitArcadeScore({
        cookie: ratings[0]!.cookie,
        runId: ratings[0]!.runId,
        playerName: 'ARCADE MED',
        proof: arcadeProof(ratings[0]!.seed, 'medium'),
      }),
      submitArcadeScore({
        cookie: ratings[1]!.cookie,
        runId: ratings[1]!.runId,
        playerName: 'ARCADE HARD',
        proof: arcadeProof(ratings[1]!.seed, 'hard'),
      }),
    ]);
    expect(submitted.map((result) => result.status)).toEqual([201, 201]);
    const medium = await listEntries('arcade', { difficulty: 'medium' });
    const hard = await listEntries('arcade', { difficulty: 'hard' });
    expect(medium.entries.map((entry) => entry.id)).toEqual([
      (submitted[0]!.body.entry as { id: string }).id,
    ]);
    expect(hard.entries.map((entry) => entry.id)).toEqual([
      (submitted[1]!.body.entry as { id: string }).id,
    ]);
    expect(medium.entries[0]?.board).toEqual({
      id: 'arcade',
      label: 'Arcade · Medium',
      context: { difficulty: 'medium' },
    });

    const unknownFilter = await workerFetch(
      `${V2_API}/games/partition/leaderboards/arcade?filter.difficulty=medium&filter.levelId=first-light`,
    );
    expect(unknownFilter.status).toBe(400);
    const missingFilter = await workerFetch(
      `${V2_API}/games/partition/leaderboards/level?filter.levelId=first-light`,
    );
    expect(missingFilter.status).toBe(400);
    await expect(missingFilter.json()).resolves.toEqual({ error: 'Difficulty filter is required.' });
    const missingBoard = await workerFetch(
      `${V2_API}/games/partition/leaderboards/nope?filter.difficulty=medium`,
    );
    expect(missingBoard.status).toBe(404);
    const unknownGame = await workerFetch(`${V2_API}/games/nope/leaderboards/arcade`);
    expect(unknownGame.status).toBe(404);
  });
});

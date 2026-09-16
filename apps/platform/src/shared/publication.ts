import type { ArcadeBenchEnv } from '../env';
import { ApiError, requiredObject } from '../http';
import { rankComponentColumns } from './canonical';
import { PUBLICATION_POLICY_VERSION, TOP_RANK_QUALIFICATION } from './types';

export interface PublicationDecision {
  policyVersion: string;
  socialMedia: boolean;
}

/**
 * The v2 route requires an explicit publication object. Unknown fields
 * (including any training permission), unsupported versions, and non-boolean
 * consent are rejected so an old server refuses the request instead of
 * silently ignoring the policy.
 */
export function parsePublication(value: unknown): PublicationDecision {
  const publication = requiredObject(value, 'Publication policy');
  for (const key of Object.keys(publication)) {
    if (key !== 'policyVersion' && key !== 'socialMedia') {
      throw new ApiError(400, 'Publication policy contains unsupported fields.');
    }
  }
  if (publication.policyVersion !== PUBLICATION_POLICY_VERSION) {
    throw new ApiError(400, 'Publication policy version is not supported.');
  }
  if (typeof publication.socialMedia !== 'boolean') {
    throw new ApiError(400, 'Social-media permission must be true or false.');
  }
  return { policyVersion: PUBLICATION_POLICY_VERSION, socialMedia: publication.socialMedia };
}

export interface PublicationInsert {
  entryId: string;
  boardKey: string;
  decision: PublicationDecision;
  replayObjectId: string;
  retentionDeadline: string;
  createdAt: string;
  rankComponents: readonly number[];
}

/**
 * One statement creates the immutable placement snapshot, the Top 50
 * qualification, and the retention decision. Placement comes from the shared
 * ordering inside the same transaction that inserts the entry; the client
 * cannot supply it. The `entry_publication_requires_pending_object` trigger
 * rejects a claimed or expired replay object here, which rolls the whole
 * submission batch back.
 *
 * Placement uses the inserted entry's actual board and rank vector, including
 * the legacy adapter's projection; request metadata cannot redirect it.
 */
export function insertPublicationStatement(
  env: ArcadeBenchEnv,
  insert: PublicationInsert,
): D1PreparedStatement {
  const order = [...rankComponentColumns(), 'created_at', 'id'];
  return env.DB.prepare(`
    INSERT INTO entry_publication
      (entry_id, policy_version, social_media, rank_at_submission, qualified,
       replay_saved, replay_object_id, expires_at, created_at)
    SELECT ?, ?, ?, p.placement,
      CASE WHEN p.placement <= ? THEN 1 ELSE 0 END,
      CASE WHEN p.placement <= ? THEN 1 ELSE 0 END, ?,
      CASE WHEN p.placement <= ? THEN NULL ELSE ? END, ?
    FROM (
      SELECT (
        SELECT COUNT(*) + 1 FROM leaderboard_entries e
        WHERE e.board_key = candidate.board_key AND e.state = 'eligible'
          AND (${order.map((column) => `e.${column}`).join(', ')})
            < (${order.map((column) => `candidate.${column}`).join(', ')})
      ) AS placement
      FROM leaderboard_entries candidate
      WHERE candidate.id = ? AND candidate.state = 'eligible'
    ) p
  `).bind(
    insert.entryId,
    insert.decision.policyVersion,
    insert.decision.socialMedia ? 1 : 0,
    TOP_RANK_QUALIFICATION,
    TOP_RANK_QUALIFICATION,
    insert.replayObjectId,
    TOP_RANK_QUALIFICATION,
    insert.retentionDeadline,
    insert.createdAt,
    insert.entryId,
  );
}

/**
 * One activity event per qualified entry, snapshotted from the immutable
 * publication placement. The event is independent of the social-media
 * permission: `socialMedia: false` emits exactly the same event.
 */
export function insertEventStatement(
  env: ArcadeBenchEnv,
  event: { id: string; entryId: string },
): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO activity_events
      (id, entry_id, type, game_id, board_key, rank_at_submission, occurred_at)
    SELECT ?, p.entry_id, 'leaderboard.qualified', e.game_id, e.board_key,
      p.rank_at_submission, p.created_at
    FROM entry_publication p
    JOIN leaderboard_entries e ON e.id = p.entry_id
    WHERE p.entry_id = ? AND p.qualified = 1 AND p.replay_saved = 1
      AND e.state = 'eligible'
  `).bind(event.id, event.entryId);
}

/**
 * Finalizes the private replay object only if its publication committed: a
 * qualifying entry keeps its archive without a scheduled expiry, an ordinary
 * entry keeps the five-day cleanup deadline, and a lost challenge race leaves
 * the object pending for cleanup instead of claiming a saved replay.
 *
 * Bind order: entry_id, entry_id, entry_id, updated_at, object id, entry_id,
 * object id.
 */
export function finalizeReplayObjectStatement(
  env: ArcadeBenchEnv,
  finalize: { entryId: string; replayObjectId: string; updatedAt: string },
): D1PreparedStatement {
  return env.DB.prepare(`
    UPDATE replay_objects
    SET state = 'ready',
        entry_id = ?,
        qualifies = (SELECT qualified FROM entry_publication WHERE entry_id = ?),
        expires_at = (SELECT expires_at FROM entry_publication WHERE entry_id = ?),
        updated_at = ?
    WHERE id = ? AND state = 'pending'
      AND EXISTS (
        SELECT 1 FROM entry_publication
        WHERE entry_id = ? AND replay_object_id = ?
      )
  `).bind(
    finalize.entryId,
    finalize.entryId,
    finalize.entryId,
    finalize.updatedAt,
    finalize.replayObjectId,
    finalize.entryId,
    finalize.replayObjectId,
  );
}

import type { ArcadeBenchEnv } from '../env';
import { ARCHIVE_PREFIX } from './types';

export interface PendingReplayObject {
  id: string;
  gameId: string;
  gameVersion: string;
  objectKey: string;
  sha256: string;
  /** Five-day cleanup deadline until the entry qualifies for archival. */
  expiresAt: string;
}

export interface ClaimedReplayObject {
  id: string;
  object_key: string;
  state: string;
}

const DELETED_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * R2 may finish a write after its pending object has already been cleaned up.
 * Requeue only a tombstone or a claimed deletion; an ambiguously committed
 * ready archive belongs to its score and must never be removed here.
 */
export async function requeueLateReplayUpload(
  env: Pick<ArcadeBenchEnv, 'DB'>,
  objectId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE replay_objects SET state = 'deleting',
      expires_at = MIN(COALESCE(expires_at, ?), ?), updated_at = ?
    WHERE id = ? AND state IN ('deleting', 'deleted')
  `).bind(now, now, now, objectId).run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * An ambiguous upload failure can outlive the request itself, leaving no
 * caller to requeue it. Keep the existing SQL tombstones and revisit a bounded
 * oldest-first page of their private keys. Successful checks move to the back
 * of this queue, independently of new expiry work, so neither queue starves.
 */
async function recheckDeletedReplayObjects(
  env: Pick<ArcadeBenchEnv, 'DB' | 'REPLAYS'>,
  now: Date,
): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT id, object_key FROM replay_objects
    WHERE state = 'deleted' AND updated_at <= ?
    ORDER BY updated_at, id LIMIT 200
  `).bind(new Date(now.getTime() - DELETED_RECHECK_INTERVAL_MS).toISOString())
    .all<{ id: string; object_key: string }>();
  if (rows.results.length === 0) return;
  await env.REPLAYS.delete(rows.results.map((row) => row.object_key));
  await env.DB.prepare(`
    UPDATE replay_objects SET updated_at = ?
    WHERE state = 'deleted' AND id IN (SELECT value FROM json_each(?))
  `).bind(now.toISOString(), JSON.stringify(rows.results.map((row) => row.id))).run();
}

/**
 * New-policy replay objects live under archives/, outside the legacy proofs/ and
 * shares/ prefixes, so the R2 lifecycle rules that expire ordinary proofs after
 * five days never delete a retained Top 50 archive. Retention is enforced by the
 * cleanup job below instead.
 */
export function archiveObjectKey(gameId: string, gameVersion: string, objectId: string): string {
  return `${ARCHIVE_PREFIX}/${gameId}/${gameVersion}/${objectId}.json`;
}

export async function createPendingReplayObject(
  env: ArcadeBenchEnv,
  object: PendingReplayObject,
  now: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO replay_objects
      (id, game_id, game_version, entry_id, object_key, sha256, state, qualifies,
       expires_at, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?, 'pending', 0, ?, ?, ?)
  `).bind(
    object.id,
    object.gameId,
    object.gameVersion,
    object.objectKey,
    object.sha256,
    object.expiresAt,
    now,
    now,
  ).run();
}

/**
 * Links the shared entry to its private replay object once the publication has
 * committed. Games whose projection trigger owns shared entry insertion cannot
 * know the object ID at insert time, so this keeps the link uniform for every
 * new-policy entry; the object's own entry_id remains the canonical direction.
 */
export function linkEntryReplayObjectStatement(
  env: ArcadeBenchEnv,
  link: { entryId: string; replayObjectId: string },
): D1PreparedStatement {
  return env.DB.prepare(`
    UPDATE leaderboard_entries SET replay_object_id = ?
    WHERE id = ? AND replay_object_id IS NULL
      AND EXISTS (
        SELECT 1 FROM entry_publication
        WHERE entry_id = ? AND replay_object_id = ?
      )
  `).bind(link.replayObjectId, link.entryId, link.entryId, link.replayObjectId);
}

/**
 * Atomically claims expired or pending objects as deleting, deletes the R2
 * bytes, and only then marks them deleted. A failed deletion leaves the row in
 * deleting and is retried on the next run; a claimed row can never be finalized
 * because the submission guard rejects anything that is not pending.
 */
export async function cleanupSharedReplayObjects(
  env: Pick<ArcadeBenchEnv, 'DB' | 'REPLAYS'>,
  now = new Date(),
): Promise<{ claimed: number; deleted: number }> {
  const nowIso = now.toISOString();
  // Tombstones contain only private object identifiers, never replay payloads.
  // Run this even when the main expiry queue is empty.
  try {
    await recheckDeletedReplayObjects(env, now);
  } catch (error) {
    console.error('ArcadeBench replay tombstone recheck failed',
      error instanceof Error ? error.message : 'unknown');
  }
  const claim = await env.DB.prepare(`
    UPDATE replay_objects
    SET state = 'deleting', delete_attempts = delete_attempts + 1, updated_at = ?
    WHERE id IN (
      SELECT id FROM replay_objects
      WHERE state IN ('pending', 'ready', 'deleting')
        AND expires_at IS NOT NULL AND expires_at <= ?
      ORDER BY expires_at LIMIT 200
    )
      AND state IN ('pending', 'ready', 'deleting')
      AND expires_at IS NOT NULL AND expires_at <= ?
    RETURNING id, object_key, state
  `).bind(nowIso, nowIso, nowIso).all<ClaimedReplayObject>();
  const claimed = claim.results ?? [];
  if (claimed.length === 0) return { claimed: 0, deleted: 0 };

  try {
    await env.REPLAYS.delete([...new Set(claimed.map((row) => row.object_key))]);
  } catch (error) {
    // The claim stays in deleting and is retried; nothing is reported deleted.
    console.error(
      'ArcadeBench replay object deletion failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return { claimed: claimed.length, deleted: 0 };
  }

  const deleted = await env.DB.prepare(`
    UPDATE replay_objects SET state = 'deleted', deleted_at = ?, updated_at = ?
    WHERE state = 'deleting' AND id IN (SELECT value FROM json_each(?))
    RETURNING id
  `).bind(nowIso, nowIso, JSON.stringify(claimed.map((row) => row.id))).all<{ id: string }>();
  return { claimed: claimed.length, deleted: deleted.results?.length ?? 0 };
}

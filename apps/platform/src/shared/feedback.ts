import type { ArcadeBenchEnv } from '../env';
import { ApiError } from '../http';
import {
  FEEDBACK_DEFAULT_CHANNEL,
  FEEDBACK_NOTE_MAX_LENGTH,
  FEEDBACK_NOTE_RETENTION_MS,
  type GameAdapter,
} from './types';

export interface FeedbackSubject {
  kind: string;
  id: string;
}

export interface FeedbackSummary {
  up: number;
  down: number;
  score: number;
  viewerVote: -1 | 0 | 1;
  /** Present only for the signed session that wrote the note. */
  note?: string;
  noteExpiresAt?: string;
}

export function feedbackChannel(adapter: GameAdapter, channel: unknown): string {
  const name = channel === undefined || channel === null || channel === ''
    ? FEEDBACK_DEFAULT_CHANNEL
    : channel;
  if (typeof name !== 'string' || !adapter.feedback.channels.includes(name)) {
    throw new ApiError(400, 'Feedback channel is not registered for this game.');
  }
  return name;
}

export function feedbackSubject(adapter: GameAdapter, kind: unknown, id: unknown): FeedbackSubject {
  if (typeof kind !== 'string' || typeof id !== 'string' || kind.length === 0 || id.length === 0) {
    throw new ApiError(404, 'Feedback subject not found.');
  }
  const definition = Object.hasOwn(adapter.feedback.kinds, kind) ? adapter.feedback.kinds[kind] : undefined;
  if (!definition || !definition.ids.includes(id)) {
    throw new ApiError(404, 'Feedback subject not found.');
  }
  return { kind, id };
}

export function parseFeedbackVote(value: unknown): -1 | 0 | 1 {
  if (value !== -1 && value !== 0 && value !== 1) {
    throw new ApiError(400, 'Feedback must be up, down, or cleared.');
  }
  return value;
}

export function parseFeedbackNote(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ApiError(400, 'A private note must be text.');
  if ([...value].length > FEEDBACK_NOTE_MAX_LENGTH) {
    throw new ApiError(400, `A private note is limited to ${FEEDBACK_NOTE_MAX_LENGTH} characters.`);
  }
  return value;
}

interface FeedbackTotals {
  up: number;
  down: number;
}

interface ViewerVote {
  value: number;
}

interface NoteRow {
  note: string;
  expires_at: string;
}

/**
 * Public aggregates come from the shared projection for every channel, so a
 * legacy vote and a new feedback vote can never be two different values. Note
 * text is separate private storage and only ever leaves the database for the
 * signed session that wrote it.
 */
export async function feedbackSummary(
  env: ArcadeBenchEnv,
  adapter: GameAdapter,
  sessionId: string,
  subject: FeedbackSubject,
  channel: string,
): Promise<FeedbackSummary> {
  const nowIso = new Date().toISOString();
  const [totals, viewer, note] = await env.DB.batch([
    env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS up,
        COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS down
      FROM feedback_votes
      WHERE game_id = ? AND subject_kind = ? AND subject_id = ? AND channel = ?
    `).bind(adapter.gameId, subject.kind, subject.id, channel),
    env.DB.prepare(`
      SELECT value FROM feedback_votes
      WHERE session_id = ? AND game_id = ? AND subject_kind = ? AND subject_id = ? AND channel = ?
    `).bind(sessionId, adapter.gameId, subject.kind, subject.id, channel),
    env.DB.prepare(`
      SELECT note, expires_at FROM feedback_notes
      WHERE session_id = ? AND game_id = ? AND subject_kind = ? AND subject_id = ?
        AND channel = ? AND expires_at > ?
    `).bind(sessionId, adapter.gameId, subject.kind, subject.id, channel, nowIso),
  ]);
  const counts = (totals.results[0] ?? { up: 0, down: 0 }) as FeedbackTotals;
  const up = Number(counts.up);
  const down = Number(counts.down);
  const viewerVote = Number((viewer.results[0] as ViewerVote | undefined)?.value ?? 0) as -1 | 0 | 1;
  const noteRow = note.results[0] as NoteRow | undefined;
  return {
    up,
    down,
    score: up - down,
    viewerVote,
    ...(noteRow ? { note: noteRow.note, noteExpiresAt: noteRow.expires_at } : {}),
  };
}

/**
 * One current vote and one optional private note per session + game + subject +
 * channel. Omitting the note preserves it, an empty note clears it, and a note
 * is private to ArcadeBench operators and never rendered or forwarded.
 */
export async function setFeedback(
  env: ArcadeBenchEnv,
  adapter: GameAdapter,
  sessionId: string,
  subject: FeedbackSubject,
  channel: string,
  vote: -1 | 0 | 1,
  note: string | undefined,
): Promise<FeedbackSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const statements: D1PreparedStatement[] = [];

  // Partition predates the shared feedback service, so its default channel
  // keeps writing the legacy `votes` table that old clients read. The migration
  // projects that table into the shared aggregate, which keeps a single
  // authoritative value for the default channel. Every other game and channel
  // writes the shared table directly.
  const legacyBridge = adapter.legacyVotes === true && channel === FEEDBACK_DEFAULT_CHANNEL;
  const table = legacyBridge ? 'votes' : 'feedback_votes';
  const channelFilter = legacyBridge ? '' : ' AND channel = ?';
  const channelBind = legacyBridge ? [] : [channel];

  if (vote === 0) {
    statements.push(env.DB.prepare(`
      DELETE FROM ${table}
      WHERE session_id = ? AND game_id = ? AND subject_kind = ? AND subject_id = ?${channelFilter}
    `).bind(sessionId, adapter.gameId, subject.kind, subject.id, ...channelBind));
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO ${table}
        (session_id, game_id, subject_kind, subject_id${legacyBridge ? '' : ', channel'},
         value, created_at, updated_at)
      VALUES (?, ?, ?, ?${legacyBridge ? '' : ', ?'}, ?, ?, ?)
      ON CONFLICT ${legacyBridge
        ? '(session_id, game_id, subject_kind, subject_id)'
        : '(session_id, game_id, subject_kind, subject_id, channel)'}
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(
      sessionId,
      adapter.gameId,
      subject.kind,
      subject.id,
      ...channelBind,
      vote,
      nowIso,
      nowIso,
    ));
  }

  if (note !== undefined) {
    if (note === '') {
      statements.push(env.DB.prepare(`
        DELETE FROM feedback_notes
        WHERE session_id = ? AND game_id = ? AND subject_kind = ? AND subject_id = ? AND channel = ?
      `).bind(sessionId, adapter.gameId, subject.kind, subject.id, channel));
    } else {
      const expiresAt = new Date(now.getTime() + FEEDBACK_NOTE_RETENTION_MS).toISOString();
      statements.push(env.DB.prepare(`
        INSERT INTO feedback_notes
          (session_id, game_id, subject_kind, subject_id, channel, note, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (session_id, game_id, subject_kind, subject_id, channel)
        DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at, expires_at = excluded.expires_at
      `).bind(
        sessionId,
        adapter.gameId,
        subject.kind,
        subject.id,
        channel,
        note,
        nowIso,
        nowIso,
        expiresAt,
      ));
    }
  }

  if (statements.length > 0) await env.DB.batch(statements);
  return feedbackSummary(env, adapter, sessionId, subject, channel);
}

/** Notes expire 90 days after the latest explicit note update. */
export async function cleanupExpiredFeedbackNotes(
  env: Pick<ArcadeBenchEnv, 'DB'>,
  now = new Date(),
): Promise<number> {
  const result = await env.DB.prepare('DELETE FROM feedback_notes WHERE expires_at <= ?')
    .bind(now.toISOString()).run();
  return result.meta.changes ?? 0;
}

import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { FEEDBACK_NOTE_RETENTION_MS } from '../src/shared/types';
import { cleanupExpiredFeedbackNotes } from '../src/shared/feedback';
import { GAME_VERSION, V1_API, V2_API, workerFetch } from './support/partition-fixtures';

const SUBJECT = 'level/first-light';

/** Every test uses its own field so aggregates never bleed between subjects. */
function feedbackUrl(subject: string): string {
  return `${V2_API}/games/partition/feedback/${subject}`;
}

interface FeedbackBody {
  up: number;
  down: number;
  score: number;
  viewerVote: number;
  note?: string;
  noteExpiresAt?: string;
}

interface FeedbackCall {
  response: Response;
  text: string;
  body: FeedbackBody & { error?: string };
}

async function readCall(response: Response): Promise<FeedbackCall> {
  const text = await response.text();
  return { response, text, body: JSON.parse(text) as FeedbackBody };
}

async function getFeedback(cookie: string, query = '', subject = SUBJECT): Promise<FeedbackCall> {
  return readCall(await workerFetch(`${feedbackUrl(subject)}${query}`, { headers: { cookie } }));
}

async function setFeedback(
  cookie: string,
  body: Record<string, unknown>,
  query = '',
  subject = SUBJECT,
): Promise<FeedbackCall> {
  return readCall(await workerFetch(`${feedbackUrl(subject)}${query}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ gameVersion: GAME_VERSION, ...body }),
  }));
}

/** Each new session is a fresh anonymous identity sharing a subject. */
async function newSession(subject = SUBJECT): Promise<string> {
  const response = await workerFetch(feedbackUrl(subject));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('shared community feedback', () => {
  it('shares public aggregates while keeping each viewer vote private', async () => {
    const subject = 'level/twin-drift';
    const first = await newSession(subject);
    const second = await newSession(subject);

    expect(await getFeedback(first, '', subject)).toMatchObject({
      response: { status: 200 },
      body: { up: 0, down: 0, score: 0, viewerVote: 0 },
    });
    const up = await setFeedback(first, { vote: 1 }, '', subject);
    expect(up.response.status).toBe(200);
    expect(up.response.headers.get('cache-control')).toBe('no-store');
    expect(up.body).toEqual({ up: 1, down: 0, score: 1, viewerVote: 1 });
    expect(up.body).not.toHaveProperty('note');

    // Another signed session sees the same aggregate and its own empty vote.
    expect((await getFeedback(second, '', subject)).body)
      .toEqual({ up: 1, down: 0, score: 1, viewerVote: 0 });

    const down = await setFeedback(first, { vote: -1 }, '', subject);
    expect(down.body).toEqual({ up: 0, down: 1, score: -1, viewerVote: -1 });
    const cleared = await setFeedback(first, { vote: 0 }, '', subject);
    expect(cleared.body).toEqual({ up: 0, down: 0, score: 0, viewerVote: 0 });
    expect((await getFeedback(second, '', subject)).body)
      .toEqual({ up: 0, down: 0, score: 0, viewerVote: 0 });
  });

  it('keeps private notes readable only by the session that wrote them', async () => {
    const subject = 'level/soft-corners';
    const owner = await newSession(subject);
    const stranger = await newSession(subject);
    const written = await setFeedback(owner, { vote: 1, note: 'the windup is too slow' }, '', subject);
    expect(written.body.note).toBe('the windup is too slow');
    const deadline = Date.parse(written.body.noteExpiresAt!);
    expect(deadline - Date.now()).toBeGreaterThan(FEEDBACK_NOTE_RETENTION_MS - 60_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(FEEDBACK_NOTE_RETENTION_MS);

    const own = await getFeedback(owner, '', subject);
    expect(own.body.note).toBe('the windup is too slow');
    expect(own.body.noteExpiresAt).toBe(written.body.noteExpiresAt);

    const other = await getFeedback(stranger, '', subject);
    expect(other.body).toEqual({ up: 1, down: 0, score: 1, viewerVote: 0 });
    expect(JSON.stringify(other.body)).not.toContain('windup');

    // Notes are never part of an aggregate row, and are never sent to a model.
    const stored = await env.DB.prepare(
      "SELECT note FROM feedback_notes WHERE subject_id = 'soft-corners'",
    ).all<{ note: string }>();
    expect(stored.results?.map((row) => row.note)).toEqual(['the windup is too slow']);
  });

  it('preserves, updates, and clears notes exactly as disclosed', async () => {
    const subject = 'level/garden-gate';
    const cookie = await newSession(subject);
    const created = await setFeedback(cookie, { vote: 1, note: 'first pass' }, '', subject);
    const originalDeadline = created.body.noteExpiresAt;

    // Voting alone neither rewrites nor extends the private note.
    const revoted = await setFeedback(cookie, { vote: -1 }, '', subject);
    expect(revoted.body.note).toBe('first pass');
    expect(revoted.body.noteExpiresAt).toBe(originalDeadline);

    // Age the stored deadline, then update the note text explicitly: only an
    // explicit note update moves the ninety-day window.
    await env.DB.prepare(`
      UPDATE feedback_notes SET expires_at = ? WHERE subject_id = 'garden-gate' AND note = 'first pass'
    `).bind(new Date(Date.now() + 1000).toISOString()).run();
    const updated = await setFeedback(cookie, { vote: -1, note: 'second pass' }, '', subject);
    expect(updated.body.note).toBe('second pass');
    expect(Date.parse(updated.body.noteExpiresAt!)).toBeGreaterThan(Date.now() + 1000);

    // Clearing the vote keeps the note; clearing the note keeps the vote.
    const voteCleared = await setFeedback(cookie, { vote: 0 }, '', subject);
    expect(voteCleared.body.note).toBe('second pass');
    expect(voteCleared.body.viewerVote).toBe(0);
    const noteCleared = await setFeedback(cookie, { vote: 0, note: '' }, '', subject);
    expect(noteCleared.body).toEqual({ up: 0, down: 0, score: 0, viewerVote: 0 });
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM feedback_notes WHERE subject_id = 'garden-gate' AND note = 'second pass'",
    ).first<{ count: number }>();
    expect(rows?.count).toBe(0);
  });

  it('rejects unregistered subjects, channels, votes, and oversized notes', async () => {
    const subject = 'level/quiet-islands';
    const cookie = await newSession(subject);
    const unknownLevel = await workerFetch(
      `${V2_API}/games/partition/feedback/level/no-such-field`,
      { headers: { cookie } },
    );
    expect(unknownLevel.status).toBe(404);
    const unknownKind = await workerFetch(
      `${V2_API}/games/partition/feedback/map/first-light`,
      { headers: { cookie } },
    );
    expect(unknownKind.status).toBe(404);
    const unknownGame = await workerFetch(`${V2_API}/games/nope/feedback/level/first-light`);
    expect(unknownGame.status).toBe(404);

    const unknownChannel = await setFeedback(cookie, { vote: 1 }, '?channel=fun', subject);
    expect(unknownChannel.response.status).toBe(400);
    expect(unknownChannel.body).toEqual({
      error: 'Feedback channel is not registered for this game.',
    });
    expect((await getFeedback(cookie, '?channel=overall', subject)).response.status).toBe(200);

    const badVote = await setFeedback(cookie, { vote: 2 }, '', subject);
    expect(badVote.response.status).toBe(400);
    const missingVote = await setFeedback(cookie, {}, '', subject);
    expect(missingVote.response.status).toBe(400);
    const longNote = await setFeedback(cookie, { vote: 0, note: 'x'.repeat(1001) }, '', subject);
    expect(longNote.response.status).toBe(400);
    // Exactly at the documented limit is accepted.
    const maximumNote = await setFeedback(cookie, { vote: 0, note: 'y'.repeat(1000) }, '', subject);
    expect(maximumNote.response.status).toBe(200);
    expect(maximumNote.body.note!.length).toBe(1000);

    const crossOrigin = await workerFetch(feedbackUrl(subject), {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie,
        origin: 'https://example.com',
      },
      body: JSON.stringify({ gameVersion: GAME_VERSION, vote: 1 }),
    });
    expect(crossOrigin.status).toBe(403);
  });

  it('answers legacy votes and new feedback with one authoritative value', async () => {
    const cookie = await newSession();
    const legacyVote = await workerFetch(`${V1_API}/votes/level/hollow-core`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ gameVersion: GAME_VERSION, value: 1 }),
    });
    expect(legacyVote.status).toBe(200);
    await expect(legacyVote.json()).resolves.toEqual({ up: 1, down: 0, score: 1, viewerVote: 1 });

    // The shared feedback service reports the legacy vote unchanged.
    const shared = await getFeedback(cookie, '', 'level/hollow-core');
    expect(shared.body).toMatchObject({ up: 1, down: 0, score: 1, viewerVote: 1 });

    // A new feedback vote is immediately the value the legacy route returns.
    await setFeedback(cookie, { vote: -1 }, '', 'level/hollow-core');
    const legacyRead = await workerFetch(`${V1_API}/votes/level/hollow-core`, {
      headers: { cookie },
    });
    expect(legacyRead.status).toBe(200);
    await expect(legacyRead.json()).resolves.toEqual({ up: 0, down: 1, score: -1, viewerVote: -1 });

    const legacyRow = await env.DB.prepare(`
      SELECT value FROM votes
      WHERE game_id = 'partition' AND subject_kind = 'level' AND subject_id = 'hollow-core'
        AND session_id = ?
    `).bind(cookie.replace('ab_session=', '').split('.')[0]!).first<{ value: number }>();
    const projected = await env.DB.prepare(`
      SELECT value FROM feedback_votes
      WHERE subject_id = 'hollow-core' AND channel = 'overall' AND session_id = ?
    `).bind(cookie.replace('ab_session=', '').split('.')[0]!).first<{ value: number }>();
    expect(projected?.value).toBe(-1);
    expect(legacyRow?.value).toBe(projected?.value);

    // The legacy envelope never grows a private note field.
    const noteCookie = await newSession('level/hollow-core');
    await setFeedback(noteCookie, { vote: 1, note: 'legacy clients never see this' }, '', 'level/hollow-core');
    const legacyWithNote = await workerFetch(`${V1_API}/votes/level/hollow-core`, {
      headers: { cookie: noteCookie },
    });
    const legacyBody = await legacyWithNote.json() as Record<string, unknown>;
    expect(Object.keys(legacyBody).sort()).toEqual(['down', 'score', 'up', 'viewerVote']);
  });

  it('stops returning and finally deletes expired notes', async () => {
    const subject = 'level/crosswind';
    const cookie = await newSession(subject);
    const sessionId = cookie.replace('ab_session=', '').split('.')[0]!;
    await setFeedback(cookie, { vote: 0, note: 'about to expire' }, '', subject);
    await env.DB.prepare(`
      UPDATE feedback_notes SET expires_at = ? WHERE session_id = ?
    `).bind(new Date(Date.now() - 1000).toISOString(), sessionId).run();

    const read = await getFeedback(cookie, '', subject);
    expect(read.body).not.toHaveProperty('note');

    const deleted = await cleanupExpiredFeedbackNotes(env);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const remaining = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM feedback_notes WHERE session_id = ?',
    ).bind(sessionId).first<{ count: number }>();
    expect(remaining?.count).toBe(0);
  });
});

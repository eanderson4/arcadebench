-- Shared ArcadeBench platform: one versioned leaderboard/rank-vector authority,
-- private replay objects, publication policy, global activity, and flexible
-- community feedback for every registered game.
--
-- This migration is additive and independent of pending Maltline migrations.
-- Partition's existing `scores` table stays the compatibility/detail store; the
-- projection triggers below keep exactly one ranking authority (the shared
-- tables) for both legacy-era and new writes.
--
-- SQL/TypeScript parity: the board key is the canonical JSON tuple
--   [gameId, gameVersion, authorityId, rankingPolicyVersion, seasonId, boardId, sortedFlatContext]
-- and must produce identical bytes from SQL and from `canonicalBoardKey()` in
-- apps/platform/src/shared/canonical.ts. `json_array`/`json_object` write the
-- same compact form (no whitespace, insertion-ordered keys) that the TypeScript
-- canonical stringifier writes, and the context keys are authored in sorted
-- order here so both sides agree byte for byte.
--
-- Float note: SQLite's JSON functions print REAL values with 15 significant
-- digits, which does not round-trip IEEE-754 doubles. `result_json` is therefore
-- assembled by concatenation and every float is written through
-- `printf('%!.17g', ...)`, the round-trip-exact form. Plain `json_object`
-- formatting would silently change verified Partition fractions.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Board identity
-- ---------------------------------------------------------------------------

CREATE TABLE leaderboard_boards (
  board_key TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  ranking_policy_version TEXT NOT NULL,
  season_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  context_json TEXT NOT NULL,
  label TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'hidden')),
  created_at TEXT NOT NULL
);

CREATE INDEX leaderboard_board_game ON leaderboard_boards (game_id, board_id);
CREATE INDEX leaderboard_board_season ON leaderboard_boards (season_id);

-- ---------------------------------------------------------------------------
-- Private replay objects (leaderboard proofs and retained archives)
-- ---------------------------------------------------------------------------

CREATE TABLE replay_objects (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  entry_id TEXT,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'deleting', 'deleted')),
  qualifies INTEGER NOT NULL DEFAULT 0 CHECK (qualifies IN (0, 1)),
  -- NULL means "retained without a scheduled expiry" (Top 50 archives).
  expires_at TEXT,
  delete_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX replay_object_cleanup ON replay_objects (state, expires_at);
CREATE INDEX replay_object_entry ON replay_objects (entry_id);
CREATE INDEX replay_object_deleted_recheck ON replay_objects (updated_at, id)
  WHERE state = 'deleted';

-- ---------------------------------------------------------------------------
-- Verified score envelope (game independent) and its rank vector
-- ---------------------------------------------------------------------------

CREATE TABLE leaderboard_entries (
  id TEXT PRIMARY KEY,
  board_key TEXT NOT NULL REFERENCES leaderboard_boards(board_key),
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  season_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  result_json TEXT NOT NULL,
  rank_1 REAL NOT NULL DEFAULT 0,
  rank_2 REAL NOT NULL DEFAULT 0,
  rank_3 REAL NOT NULL DEFAULT 0,
  rank_4 REAL NOT NULL DEFAULT 0,
  rank_5 REAL NOT NULL DEFAULT 0,
  rank_6 REAL NOT NULL DEFAULT 0,
  rank_7 REAL NOT NULL DEFAULT 0,
  rank_8 REAL NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('eligible', 'hidden', 'removed')),
  moderation_key TEXT REFERENCES callsign_moderation_cache(moderation_key),
  run_id TEXT,
  replay_object_id TEXT REFERENCES replay_objects(id),
  created_at TEXT NOT NULL
);

-- The shared ordering index: board + eligibility + rank vector + stable ties.
-- Every listing, placement count, and Top 50 decision uses this one ordering.
CREATE INDEX leaderboard_rank ON leaderboard_entries (
  board_key, state,
  rank_1, rank_2, rank_3, rank_4, rank_5, rank_6, rank_7, rank_8,
  created_at, id
);

CREATE INDEX leaderboard_entry_game ON leaderboard_entries (game_id, created_at DESC);
CREATE INDEX leaderboard_entry_replay ON leaderboard_entries (replay_object_id);
CREATE UNIQUE INDEX leaderboard_entry_run
  ON leaderboard_entries (game_id, run_id) WHERE run_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Publication policy, immutable placement, retention decision
-- ---------------------------------------------------------------------------

CREATE TABLE entry_publication (
  entry_id TEXT PRIMARY KEY REFERENCES leaderboard_entries(id),
  policy_version TEXT NOT NULL,
  social_media INTEGER NOT NULL CHECK (social_media IN (0, 1)),
  rank_at_submission INTEGER NOT NULL,
  qualified INTEGER NOT NULL CHECK (qualified IN (0, 1)),
  replay_saved INTEGER NOT NULL CHECK (replay_saved IN (0, 1)),
  replay_object_id TEXT REFERENCES replay_objects(id),
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX entry_publication_object ON entry_publication (replay_object_id);

-- Finalization invariant, enforced inside SQL so a losing race rolls the whole
-- submission batch back instead of being noticed after the commit.
CREATE TRIGGER entry_publication_requires_pending_object
BEFORE INSERT ON entry_publication
WHEN NEW.replay_object_id IS NOT NULL
BEGIN
  -- Parentheses keep D1's remote statement splitter from treating this CASE's
  -- END as the end of the trigger body.
  SELECT (CASE
    WHEN (SELECT state FROM replay_objects WHERE id = NEW.replay_object_id) IS NOT 'pending'
      THEN RAISE(ABORT, 'replay object is not finalizable')
    WHEN (SELECT expires_at FROM replay_objects WHERE id = NEW.replay_object_id) IS NOT NULL
      AND (SELECT expires_at FROM replay_objects WHERE id = NEW.replay_object_id) <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      THEN RAISE(ABORT, 'replay object expired before finalization')
    WHEN NOT EXISTS (
      SELECT 1 FROM leaderboard_entries e
      JOIN leaderboard_boards b ON b.board_key = e.board_key
      JOIN seasons s ON s.id = e.season_id
      WHERE e.id = NEW.entry_id AND e.state = 'eligible' AND b.state = 'visible'
        AND s.state = 'active' AND s.game_id = e.game_id AND s.game_version = e.game_version
        AND b.game_id = e.game_id AND b.game_version = e.game_version
        AND b.season_id = e.season_id AND b.board_id = e.board_id
    ) THEN RAISE(ABORT, 'ranked board closed before finalization')
  END);
END;

-- ---------------------------------------------------------------------------
-- Global activity stream (one shared event table for every game)
-- ---------------------------------------------------------------------------

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES leaderboard_entries(id),
  type TEXT NOT NULL,
  game_id TEXT NOT NULL,
  board_key TEXT NOT NULL,
  rank_at_submission INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (entry_id, type)
);

CREATE INDEX activity_time ON activity_events (occurred_at DESC, id DESC);
CREATE INDEX activity_game_time ON activity_events (game_id, occurred_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Community feedback: shared public aggregates, private operator notes
-- ---------------------------------------------------------------------------

CREATE TABLE feedback_votes (
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  game_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, game_id, subject_kind, subject_id, channel)
);

CREATE INDEX feedback_vote_summary
  ON feedback_votes (game_id, subject_kind, subject_id, channel, value);

CREATE TABLE feedback_notes (
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  game_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (session_id, game_id, subject_kind, subject_id, channel)
);

CREATE INDEX feedback_note_expiry ON feedback_notes (expires_at);

-- ---------------------------------------------------------------------------
-- Generic one-time ranked challenges (games without a legacy challenge table)
-- ---------------------------------------------------------------------------

CREATE TABLE shared_run_challenges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  season_id TEXT NOT NULL,
  board_key TEXT NOT NULL,
  board_id TEXT NOT NULL,
  context_json TEXT NOT NULL,
  seed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_entry_id TEXT
);

CREATE INDEX shared_run_challenge_session ON shared_run_challenges (session_id, expires_at DESC);
CREATE INDEX shared_run_challenge_expiry ON shared_run_challenges (expires_at)
  WHERE consumed_entry_id IS NULL;

-- ---------------------------------------------------------------------------
-- Legacy bridge: Partition `scores` projects into the shared tables
-- ---------------------------------------------------------------------------
--
-- The trigger owns shared entry insertion for Partition so legacy-client and
-- rollback-era writes keep the same ranking authority. It creates no
-- publication, retention decision, or activity event: earlier submissions keep
-- their earlier policy, and no old replay silently gains archival or social
-- permission.

INSERT INTO leaderboard_boards
  (board_key, game_id, game_version, authority_id, ranking_policy_version, season_id,
   board_id, context_json, label, state, created_at)
SELECT
  json_array(s.game_id, s.game_version, 'partition-authored-v1',
    CASE s.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
    s.season_id, s.board_id,
    CASE s.board_id WHEN 'arcade' THEN json_object('difficulty', s.difficulty)
      ELSE json_object('difficulty', s.difficulty, 'levelId', s.level_id) END),
  s.game_id, s.game_version, 'partition-authored-v1',
  CASE s.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
  s.season_id, s.board_id,
  CASE s.board_id WHEN 'arcade' THEN json_object('difficulty', s.difficulty)
    ELSE json_object('difficulty', s.difficulty, 'levelId', s.level_id) END,
  CASE s.board_id WHEN 'arcade' THEN 'Arcade'
    ELSE COALESCE(s.level_title, s.level_id) END,
  'visible', MIN(s.created_at)
FROM scores s
WHERE s.game_id = 'partition'
GROUP BY json_array(s.game_id, s.game_version, 'partition-authored-v1',
    CASE s.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
    s.season_id, s.board_id,
    CASE s.board_id WHEN 'arcade' THEN json_object('difficulty', s.difficulty)
      ELSE json_object('difficulty', s.difficulty, 'levelId', s.level_id) END)
ON CONFLICT (board_key) DO NOTHING;

INSERT INTO leaderboard_entries
  (id, board_key, game_id, game_version, season_id, board_id, player_name, normalized_name,
   result_json, rank_1, rank_2, rank_3, rank_4, rank_5, rank_6, rank_7, rank_8,
   state, moderation_key, run_id, replay_object_id, created_at)
SELECT
  s.id,
  json_array(s.game_id, s.game_version, 'partition-authored-v1',
    CASE s.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
    s.season_id, s.board_id,
    CASE s.board_id WHEN 'arcade' THEN json_object('difficulty', s.difficulty)
      ELSE json_object('difficulty', s.difficulty, 'levelId', s.level_id) END),
  s.game_id, s.game_version, s.season_id, s.board_id, s.player_name, s.normalized_name,
  CASE s.board_id WHEN 'arcade' THEN
    '{"completed":' || CASE WHEN s.completed = 1 THEN 'true' ELSE 'false' END ||
    ',"difficulty":' || json_quote(s.difficulty) ||
    ',"elapsedMs":' || CAST(s.elapsed_ms AS INTEGER) ||
    ',"partitions":' || CAST(s.partitions AS INTEGER) ||
    ',"scope":"arcade"' ||
    ',"stageReached":' || CAST(s.stage_reached AS INTEGER) ||
    ',"stagesCleared":' || CAST(s.stages_cleared AS INTEGER) || '}'
  ELSE
    '{"capturedFraction":' || printf('%!.17g', COALESCE(s.captured_fraction, 0)) ||
    ',"difficulty":' || json_quote(s.difficulty) ||
    ',"elapsedMs":' || CAST(s.elapsed_ms AS INTEGER) ||
    ',"levelId":' || json_quote(s.level_id) ||
    ',"levelNumber":' || CAST(s.level_number AS INTEGER) ||
    ',"levelTitle":' || json_quote(s.level_title) ||
    ',"partitions":' || CAST(s.partitions AS INTEGER) ||
    ',"scope":"level"' ||
    ',"won":' || CASE WHEN s.won = 1 THEN 'true' ELSE 'false' END || '}'
  END,
  CASE s.board_id WHEN 'arcade' THEN -s.stage_reached ELSE -s.won END,
  CASE s.board_id WHEN 'arcade' THEN -s.completed
    ELSE CASE WHEN s.won = 0 AND COALESCE(s.captured_fraction, 0) <> 0
      THEN -s.captured_fraction ELSE 0 END END,
  s.elapsed_ms, s.partitions, 0, 0, 0, 0,
  'eligible', s.moderation_key, s.run_id, NULL, s.created_at
FROM scores s
WHERE s.game_id = 'partition'
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER scores_project_shared_entry
AFTER INSERT ON scores
WHEN NEW.game_id = 'partition'
BEGIN
  INSERT INTO leaderboard_boards
    (board_key, game_id, game_version, authority_id, ranking_policy_version, season_id,
     board_id, context_json, label, state, created_at)
  VALUES (
    json_array(NEW.game_id, NEW.game_version, 'partition-authored-v1',
      CASE NEW.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
      NEW.season_id, NEW.board_id,
      CASE NEW.board_id WHEN 'arcade' THEN json_object('difficulty', NEW.difficulty)
        ELSE json_object('difficulty', NEW.difficulty, 'levelId', NEW.level_id) END),
    NEW.game_id, NEW.game_version, 'partition-authored-v1',
    CASE NEW.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
    NEW.season_id, NEW.board_id,
    CASE NEW.board_id WHEN 'arcade' THEN json_object('difficulty', NEW.difficulty)
      ELSE json_object('difficulty', NEW.difficulty, 'levelId', NEW.level_id) END,
    CASE NEW.board_id WHEN 'arcade' THEN 'Arcade'
      ELSE COALESCE(NEW.level_title, NEW.level_id) END,
    'visible', NEW.created_at
  )
  ON CONFLICT (board_key) DO NOTHING;

  INSERT INTO leaderboard_entries
    (id, board_key, game_id, game_version, season_id, board_id, player_name, normalized_name,
     result_json, rank_1, rank_2, rank_3, rank_4, rank_5, rank_6, rank_7, rank_8,
     state, moderation_key, run_id, replay_object_id, created_at)
  VALUES (
    NEW.id,
    json_array(NEW.game_id, NEW.game_version, 'partition-authored-v1',
      CASE NEW.board_id WHEN 'arcade' THEN 'arcade-v1' ELSE 'field-v1' END,
      NEW.season_id, NEW.board_id,
      CASE NEW.board_id WHEN 'arcade' THEN json_object('difficulty', NEW.difficulty)
        ELSE json_object('difficulty', NEW.difficulty, 'levelId', NEW.level_id) END),
    NEW.game_id, NEW.game_version, NEW.season_id, NEW.board_id, NEW.player_name, NEW.normalized_name,
    CASE NEW.board_id WHEN 'arcade' THEN
      '{"completed":' || CASE WHEN NEW.completed = 1 THEN 'true' ELSE 'false' END ||
      ',"difficulty":' || json_quote(NEW.difficulty) ||
      ',"elapsedMs":' || CAST(NEW.elapsed_ms AS INTEGER) ||
      ',"partitions":' || CAST(NEW.partitions AS INTEGER) ||
      ',"scope":"arcade"' ||
      ',"stageReached":' || CAST(NEW.stage_reached AS INTEGER) ||
      ',"stagesCleared":' || CAST(NEW.stages_cleared AS INTEGER) || '}'
    ELSE
      '{"capturedFraction":' || printf('%!.17g', COALESCE(NEW.captured_fraction, 0)) ||
      ',"difficulty":' || json_quote(NEW.difficulty) ||
      ',"elapsedMs":' || CAST(NEW.elapsed_ms AS INTEGER) ||
      ',"levelId":' || json_quote(NEW.level_id) ||
      ',"levelNumber":' || CAST(NEW.level_number AS INTEGER) ||
      ',"levelTitle":' || json_quote(NEW.level_title) ||
      ',"partitions":' || CAST(NEW.partitions AS INTEGER) ||
      ',"scope":"level"' ||
      ',"won":' || CASE WHEN NEW.won = 1 THEN 'true' ELSE 'false' END || '}'
    END,
    CASE NEW.board_id WHEN 'arcade' THEN -NEW.stage_reached ELSE -NEW.won END,
    CASE NEW.board_id WHEN 'arcade' THEN -NEW.completed
      ELSE CASE WHEN NEW.won = 0 AND COALESCE(NEW.captured_fraction, 0) <> 0
        THEN -NEW.captured_fraction ELSE 0 END END,
    NEW.elapsed_ms, NEW.partitions, 0, 0, 0, 0,
    'eligible', NEW.moderation_key, NEW.run_id, NULL, NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;
END;

-- Source score deletion removes the shared entry; the dependent-row trigger
-- below then removes its publication and activity and schedules cleanup of any
-- retained private object.
CREATE TRIGGER scores_remove_shared_entry
AFTER DELETE ON scores
WHEN OLD.game_id = 'partition'
BEGIN
  DELETE FROM leaderboard_entries WHERE id = OLD.id;
END;

CREATE TRIGGER leaderboard_entry_remove_dependents
AFTER DELETE ON leaderboard_entries
BEGIN
  DELETE FROM activity_events WHERE entry_id = OLD.id;
  DELETE FROM entry_publication WHERE entry_id = OLD.id;
  UPDATE replay_objects
  SET state = 'deleting',
      expires_at = COALESCE(expires_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE entry_id = OLD.id AND state IN ('pending', 'ready');
END;

-- ---------------------------------------------------------------------------
-- Legacy vote bridge: `votes` stays the write authority for the default
-- channel, and `feedback_votes` is the shared projection every reader uses, so
-- old vote requests and new feedback cannot diverge.
-- ---------------------------------------------------------------------------

INSERT INTO feedback_votes
  (session_id, game_id, subject_kind, subject_id, channel, value, created_at, updated_at)
SELECT session_id, game_id, subject_kind, subject_id, 'overall', value, created_at, updated_at
FROM votes
WHERE game_id = 'partition'
ON CONFLICT (session_id, game_id, subject_kind, subject_id, channel)
DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

CREATE TRIGGER votes_project_feedback_insert
AFTER INSERT ON votes
BEGIN
  INSERT INTO feedback_votes
    (session_id, game_id, subject_kind, subject_id, channel, value, created_at, updated_at)
  VALUES (NEW.session_id, NEW.game_id, NEW.subject_kind, NEW.subject_id, 'overall',
    NEW.value, NEW.created_at, NEW.updated_at)
  ON CONFLICT (session_id, game_id, subject_kind, subject_id, channel)
  DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
END;

CREATE TRIGGER votes_project_feedback_update
AFTER UPDATE ON votes
BEGIN
  INSERT INTO feedback_votes
    (session_id, game_id, subject_kind, subject_id, channel, value, created_at, updated_at)
  VALUES (NEW.session_id, NEW.game_id, NEW.subject_kind, NEW.subject_id, 'overall',
    NEW.value, NEW.created_at, NEW.updated_at)
  ON CONFLICT (session_id, game_id, subject_kind, subject_id, channel)
  DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
END;

CREATE TRIGGER votes_project_feedback_delete
AFTER DELETE ON votes
BEGIN
  DELETE FROM feedback_votes
  WHERE session_id = OLD.session_id AND game_id = OLD.game_id
    AND subject_kind = OLD.subject_kind AND subject_id = OLD.subject_id
    AND channel = 'overall';
END;

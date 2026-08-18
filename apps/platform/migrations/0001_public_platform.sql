PRAGMA foreign_keys = ON;

CREATE TABLE anonymous_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'archived')),
  starts_at TEXT NOT NULL,
  ends_at TEXT
);

CREATE UNIQUE INDEX one_active_season_per_game
  ON seasons (game_id) WHERE state = 'active';

INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
VALUES ('partition-0-1-0-launch', 'partition', '0.1.0', 'Launch board', 'active', '2026-08-18T00:00:00.000Z');

CREATE TABLE run_challenges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  board_id TEXT NOT NULL CHECK (board_id IN ('arcade', 'level')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'impossible')),
  level_id TEXT,
  seed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_score_id TEXT
);

CREATE INDEX run_challenges_session ON run_challenges (session_id, expires_at DESC);

CREATE TABLE callsign_moderation_cache (
  moderation_key TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)),
  category TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES run_challenges(id),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  board_id TEXT NOT NULL CHECK (board_id IN ('arcade', 'level')),
  player_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  level_id TEXT,
  level_number INTEGER,
  level_title TEXT,
  won INTEGER,
  stage_reached INTEGER,
  stages_cleared INTEGER,
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  elapsed_ms INTEGER NOT NULL,
  partitions INTEGER NOT NULL,
  captured_fraction REAL,
  proof_object_key TEXT NOT NULL,
  proof_sha256 TEXT NOT NULL,
  moderation_key TEXT NOT NULL REFERENCES callsign_moderation_cache(moderation_key),
  created_at TEXT NOT NULL
);

CREATE INDEX arcade_score_rank ON scores (
  game_id, game_version, season_id, difficulty,
  stage_reached DESC, completed DESC, elapsed_ms ASC, partitions ASC, created_at ASC
) WHERE board_id = 'arcade';

CREATE INDEX level_score_rank ON scores (
  game_id, game_version, season_id, difficulty, level_id,
  won DESC, captured_fraction DESC, elapsed_ms ASC, partitions ASC, created_at ASC
) WHERE board_id = 'level';

CREATE TABLE replay_shares (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  game_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX replay_share_expiry ON replay_shares (expires_at);
CREATE INDEX replay_share_dedupe ON replay_shares (session_id, sha256, expires_at DESC);

CREATE TABLE votes (
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  game_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('game', 'level')),
  subject_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, game_id, subject_kind, subject_id)
);

CREATE INDEX vote_summary ON votes (game_id, subject_kind, subject_id, value);

CREATE TABLE rate_windows (
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (session_id, action, window_start)
);

CREATE INDEX rate_window_cleanup ON rate_windows (window_start);

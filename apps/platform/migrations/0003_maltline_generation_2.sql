-- Maltline has a replay-backed ranking contract that is intentionally kept
-- separate from the existing Partition challenge/score rows. This migration
-- is additive so Partition's public schema and retained rows remain unchanged.

INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
VALUES (
  'maltline-generation-2',
  'maltline',
  '0.1.0',
  'Generation 2',
  'active',
  '2026-09-10T00:00:00.000Z'
);

CREATE TABLE maltline_run_challenges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  game_id TEXT NOT NULL CHECK (game_id = 'maltline'),
  game_version TEXT NOT NULL,
  board_id TEXT NOT NULL CHECK (board_id = 'arcade'),
  authority_schema_version INTEGER NOT NULL CHECK (authority_schema_version > 0),
  ruleset_version INTEGER NOT NULL CHECK (ruleset_version > 0),
  campaign_generation INTEGER NOT NULL CHECK (campaign_generation > 0),
  configuration_sha256 TEXT NOT NULL CHECK (
    length(configuration_sha256) = 64
    AND configuration_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  proof_schema_version INTEGER NOT NULL CHECK (proof_schema_version > 0),
  envelope_version INTEGER NOT NULL CHECK (envelope_version > 0),
  nonce INTEGER NOT NULL CHECK (
    typeof(nonce) = 'integer'
    AND nonce BETWEEN 0 AND 4294967295
  ),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_score_id TEXT UNIQUE,
  CHECK (
    (consumed_at IS NULL AND consumed_score_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_score_id IS NOT NULL)
  )
);

CREATE INDEX maltline_run_challenges_session
  ON maltline_run_challenges (session_id, expires_at DESC);

CREATE INDEX maltline_run_challenges_unconsumed
  ON maltline_run_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TRIGGER maltline_challenge_requires_maltline_season
BEFORE INSERT ON maltline_run_challenges
WHEN NOT EXISTS (
  SELECT 1
  FROM seasons
  WHERE id = NEW.season_id
    AND game_id = NEW.game_id
    AND game_version = NEW.game_version
)
BEGIN
  SELECT RAISE(ABORT, 'Maltline challenge season context does not match');
END;

CREATE TRIGGER maltline_challenge_identity_is_immutable
BEFORE UPDATE OF
  id, session_id, season_id, game_id, game_version, board_id,
  authority_schema_version, ruleset_version, campaign_generation,
  configuration_sha256, proof_schema_version, envelope_version, nonce,
  created_at, expires_at
ON maltline_run_challenges
BEGIN
  SELECT RAISE(ABORT, 'Maltline challenge identity is immutable');
END;

CREATE TRIGGER maltline_challenge_consumption_moves_forward
BEFORE UPDATE OF consumed_at, consumed_score_id ON maltline_run_challenges
WHEN OLD.consumed_at IS NOT NULL
  AND (
    NEW.consumed_at IS NOT OLD.consumed_at
    OR NEW.consumed_score_id IS NOT OLD.consumed_score_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Maltline challenge consumption is immutable');
END;

CREATE TABLE maltline_scores (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES maltline_run_challenges(id),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  game_id TEXT NOT NULL CHECK (game_id = 'maltline'),
  game_version TEXT NOT NULL,
  board_id TEXT NOT NULL CHECK (board_id = 'arcade'),
  authority_schema_version INTEGER NOT NULL CHECK (authority_schema_version > 0),
  ruleset_version INTEGER NOT NULL CHECK (ruleset_version > 0),
  campaign_generation INTEGER NOT NULL CHECK (campaign_generation > 0),
  configuration_sha256 TEXT NOT NULL CHECK (
    length(configuration_sha256) = 64
    AND configuration_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  proof_schema_version INTEGER NOT NULL CHECK (proof_schema_version > 0),
  envelope_version INTEGER NOT NULL CHECK (envelope_version > 0),
  nonce INTEGER NOT NULL CHECK (
    typeof(nonce) = 'integer'
    AND nonce BETWEEN 0 AND 4294967295
  ),
  player_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,

  -- Every ranking/summary value below is written from verifier output, never
  -- accepted from a submission body.
  score INTEGER NOT NULL CHECK (
    typeof(score) = 'integer' AND score BETWEEN 0 AND 9007199254740991
  ),
  lives INTEGER NOT NULL CHECK (typeof(lives) = 'integer' AND lives BETWEEN 0 AND 20),
  stage_reached INTEGER NOT NULL CHECK (
    typeof(stage_reached) = 'integer' AND stage_reached BETWEEN 1 AND 8
  ),
  stages_cleared INTEGER NOT NULL CHECK (
    typeof(stages_cleared) = 'integer' AND stages_cleared BETWEEN 0 AND 8
  ),
  completed INTEGER NOT NULL CHECK (
    typeof(completed) = 'integer' AND completed IN (0, 1)
  ),
  total_ticks INTEGER NOT NULL CHECK (
    typeof(total_ticks) = 'integer' AND total_ticks BETWEEN 1 AND 60000
  ),
  fulfilled INTEGER NOT NULL CHECK (
    typeof(fulfilled) = 'integer' AND fulfilled BETWEEN 0 AND 60000
  ),
  service_actions INTEGER NOT NULL CHECK (
    typeof(service_actions) = 'integer' AND service_actions BETWEEN 0 AND 60000
  ),
  walkouts INTEGER NOT NULL CHECK (
    typeof(walkouts) = 'integer' AND walkouts BETWEEN 0 AND 60000
  ),
  resolved INTEGER NOT NULL CHECK (
    typeof(resolved) = 'integer' AND resolved BETWEEN 0 AND 60000
  ),
  exited INTEGER NOT NULL CHECK (
    typeof(exited) = 'integer' AND exited BETWEEN 0 AND 60000
  ),

  proof_object_key TEXT NOT NULL UNIQUE,
  proof_sha256 TEXT NOT NULL CHECK (
    length(proof_sha256) = 64
    AND proof_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  proof_state TEXT NOT NULL CHECK (proof_state IN ('pending', 'ready', 'failed')),
  proof_state_updated_at TEXT NOT NULL,
  proof_ready_at TEXT,
  proof_failed_at TEXT,
  proof_failure_code TEXT,
  proof_expires_at TEXT NOT NULL,
  proof_deleted_at TEXT,
  moderation_key TEXT NOT NULL REFERENCES callsign_moderation_cache(moderation_key),
  created_at TEXT NOT NULL,

  CHECK (
    proof_object_key =
      'proofs/maltline/ruleset-' || ruleset_version ||
      '/campaign-' || campaign_generation ||
      '/' || configuration_sha256 ||
      '/runs/' || run_id ||
      '/envelope-v' || envelope_version || '.json'
  ),
  CHECK (
    (proof_state = 'pending'
      AND proof_ready_at IS NULL
      AND proof_failed_at IS NULL
      AND proof_failure_code IS NULL)
    OR (proof_state = 'ready'
      AND proof_ready_at IS NOT NULL
      AND proof_failed_at IS NULL
      AND proof_failure_code IS NULL)
    OR (proof_state = 'failed'
      AND proof_ready_at IS NULL
      AND proof_failed_at IS NOT NULL
      AND length(proof_failure_code) BETWEEN 1 AND 64)
  )
);

-- The first five columns exactly mirror the frozen generation-2 authority.
-- Stable creation/id tie-breaks make every page boundary deterministic.
CREATE INDEX maltline_arcade_score_rank ON maltline_scores (
  season_id,
  completed DESC,
  stage_reached DESC,
  score DESC,
  total_ticks ASC,
  fulfilled DESC,
  created_at ASC,
  id ASC
) WHERE board_id = 'arcade' AND proof_state = 'ready';

CREATE INDEX maltline_proof_reconciliation
  ON maltline_scores (proof_state, proof_state_updated_at, id)
  WHERE proof_state != 'ready';

CREATE INDEX maltline_proof_expiry
  ON maltline_scores (proof_expires_at, id)
  WHERE proof_deleted_at IS NULL;

-- A score is self-describing for retention, but its duplicated protocol
-- identity must remain byte-for-byte aligned with the consumed challenge.
CREATE TRIGGER maltline_score_requires_matching_challenge
BEFORE INSERT ON maltline_scores
WHEN NOT EXISTS (
  SELECT 1
  FROM maltline_run_challenges
  WHERE id = NEW.run_id
    AND consumed_at IS NOT NULL
    AND consumed_score_id = NEW.id
    AND season_id = NEW.season_id
    AND game_id = NEW.game_id
    AND game_version = NEW.game_version
    AND board_id = NEW.board_id
    AND authority_schema_version = NEW.authority_schema_version
    AND ruleset_version = NEW.ruleset_version
    AND campaign_generation = NEW.campaign_generation
    AND configuration_sha256 = NEW.configuration_sha256
    AND proof_schema_version = NEW.proof_schema_version
    AND envelope_version = NEW.envelope_version
    AND nonce = NEW.nonce
)
BEGIN
  SELECT RAISE(ABORT, 'Maltline score context does not match challenge');
END;

CREATE TRIGGER maltline_verified_score_is_immutable
BEFORE UPDATE OF
  id, run_id, season_id, game_id, game_version, board_id,
  authority_schema_version, ruleset_version, campaign_generation,
  configuration_sha256, proof_schema_version, envelope_version, nonce,
  player_name, normalized_name, score, lives, stage_reached, stages_cleared,
  completed, total_ticks, fulfilled, service_actions, walkouts, resolved,
  exited, proof_object_key, proof_sha256, proof_expires_at, moderation_key,
  created_at
ON maltline_scores
BEGIN
  SELECT RAISE(ABORT, 'Maltline verified score is immutable');
END;

-- The route will create a pending score while atomically consuming its
-- challenge, upload the canonical envelope at proof_object_key, then move the
-- row to ready. A reconciler may promote a stranded pending row only after the
-- object bytes match proof_sha256, or mark it failed. Ready and failed are
-- terminal; only ready rows rank. Object expiry records proof_deleted_at but
-- does not erase the verifier-derived leaderboard result.
CREATE TRIGGER maltline_proof_state_moves_forward
BEFORE UPDATE OF proof_state ON maltline_scores
WHEN NEW.proof_state != OLD.proof_state
  AND NOT (OLD.proof_state = 'pending' AND NEW.proof_state IN ('ready', 'failed'))
BEGIN
  SELECT RAISE(ABORT, 'Maltline proof state cannot move backward');
END;

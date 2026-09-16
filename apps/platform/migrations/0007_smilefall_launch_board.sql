-- Smilefall launches on one current board. Automated monthly rollover remains
-- disabled until archive browsing ships, as required by the versioning policy.
UPDATE seasons SET state = 'archived'
WHERE game_id = 'smilefall' AND state = 'active';

INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
VALUES (
  'smilefall-launch-1',
  'smilefall',
  '1.0.0',
  'Launch Board',
  'active',
  '2026-09-01T00:00:00.000Z'
);

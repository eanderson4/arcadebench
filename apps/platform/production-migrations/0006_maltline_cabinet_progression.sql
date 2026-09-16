-- Roll over only the previous cabinet season. Generation-two installations
-- retain their active authority until an explicit release activates cabinet-2.
UPDATE seasons SET state = 'archived'
WHERE id = 'maltline-cabinet-1' AND game_id = 'maltline'
  AND game_version = 'cabinet-1' AND state = 'active';

INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
VALUES ('maltline-cabinet-2', 'maltline', 'cabinet-2', 'Second Shift',
  CASE WHEN EXISTS (SELECT 1 FROM seasons WHERE game_id = 'maltline' AND state = 'active')
    THEN 'archived' ELSE 'active' END,
  '2026-09-15T00:00:00.000Z');

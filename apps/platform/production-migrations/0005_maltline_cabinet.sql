-- Independent cabinet authority. Uses only seasons (0001) and shared services
-- (0004); never requires the unreleased generation-2 tables in 0003.
-- The first Maltline season opens on installations without an active season.
-- Existing generation-2 installations retain their current active authority.
INSERT INTO seasons (id, game_id, game_version, name, state, starts_at)
VALUES ('maltline-cabinet-1', 'maltline', 'cabinet-1', 'First Shift',
  CASE WHEN EXISTS (SELECT 1 FROM seasons WHERE game_id = 'maltline' AND state = 'active')
    THEN 'archived' ELSE 'active' END,
  '2026-09-15T00:00:00.000Z');

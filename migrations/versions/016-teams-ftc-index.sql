-- 016-teams-ftc-index.sql — fast "which workspace owns FTC team #N" lookups
-- (one workspace per FTC number). Not UNIQUE: production already has a few
-- workspaces sharing a number from before the rule, and nothing is changed
-- automatically. The app refuses new duplicates.

CREATE INDEX IF NOT EXISTS idx_teams_ftc_number ON teams(ftc_team_number);

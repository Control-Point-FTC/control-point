-- 141-pit-display.sql — the pit display: one secret no-login link per team for
-- a spare screen (/pit/<token>). Admins create, replace or turn it off; the
-- token is the only credential and a new one retires the old link.

CREATE TABLE IF NOT EXISTS pit_displays (
  team_id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

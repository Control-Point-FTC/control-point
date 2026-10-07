-- 017-scouting-entries.sql — manual scouting (audit H-4). Entries are made
-- on a device (often offline at an event) and synced later; each carries a
-- client UUID so a re-sent entry updates instead of duplicating. Deletes are
-- kept as tombstones so every device learns about them. Additive only.

CREATE TABLE IF NOT EXISTS scouting_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  season INTEGER NOT NULL,
  scouted_team INTEGER NOT NULL,
  event_code TEXT,
  match_label TEXT,
  template_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  scout_member_id INTEGER,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scouting_entries_uuid ON scouting_entries(team_id, uuid);
CREATE INDEX IF NOT EXISTS idx_scouting_entries_season ON scouting_entries(team_id, season, scouted_team);

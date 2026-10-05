-- 008-scouting-shortlist.sql — Team Stats → Analyze: scouting shortlist.
-- Shared by everyone in a workspace (team_id), per FTC season. Purely
-- additive: a new table + index, nothing existing is touched.

CREATE TABLE IF NOT EXISTS scouting_shortlist (
  team_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  team_number INTEGER NOT NULL,
  team_name TEXT NOT NULL DEFAULT '',
  event_code TEXT,
  notes TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  scout_next INTEGER NOT NULL DEFAULT 0,
  strengths TEXT NOT NULL DEFAULT '[]',
  weaknesses TEXT NOT NULL DEFAULT '[]',
  updated_by INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, season, team_number),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scouting_shortlist_season ON scouting_shortlist(team_id, season);

-- 102-access-code-events.sql — who revealed or replaced a workspace's access
-- code, and when (audit M-2: mask by default, click to reveal, log views and
-- regenerations). Additive only.

CREATE TABLE IF NOT EXISTS access_code_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  member_id INTEGER,
  action TEXT NOT NULL,     -- 'view' | 'regenerate'
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_code_events_team ON access_code_events(team_id, id);

-- 012-client-errors.sql — errors reported by users' browsers (render crashes,
-- uncaught exceptions, stale-chunk loads), so the owner can see what breaks in
-- the field. Additive only. The server keeps the newest few thousand rows.

CREATE TABLE IF NOT EXISTS client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  member_id INTEGER,
  team_id INTEGER,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  component_stack TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  release TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at);

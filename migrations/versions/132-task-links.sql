-- 132-task-links.sql — links between tasks (server/taskLinks.ts):
--   kind 'blocks':  from_id blocks to_id (to_id can't really start until
--                   from_id is done; "blocked" is computed, never stored)
--   kind 'relates': the two tasks are related; stored once, smaller id first
-- Rows go when either task is deleted (the delete route removes them).

BEGIN;

CREATE TABLE IF NOT EXISTS task_links (
  team_id INTEGER NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('blocks', 'relates')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_id, to_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_task_links_to ON task_links (to_id, kind);
CREATE INDEX IF NOT EXISTS idx_task_links_team ON task_links (team_id);

COMMIT;

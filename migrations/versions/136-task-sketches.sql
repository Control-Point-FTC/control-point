-- 136-task-sketches.sql — sketches on a task (src/types/taskSketch.ts):
-- ink strokes in the notebook's format, stored as JSON after validation.
-- Rows go with their task (cascading key), and so with a deleted workspace.

BEGIN;

CREATE TABLE IF NOT EXISTS task_sketches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  member_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  strokes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  updated_by INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_sketches_task ON task_sketches (task_id, created_at);

COMMIT;

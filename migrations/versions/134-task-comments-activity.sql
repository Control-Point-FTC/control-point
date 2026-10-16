-- 134-task-comments-activity.sql — a task's discussion and history
-- (server/taskActivity.ts):
--   task_comments: comments on a task (soft-deleted, so the thread keeps its shape)
--   task_activity: what changed and who changed it (status, people, dates…)
--   task_watchers: an explicit choice to follow (watching = 1) or stop
--                  following (watching = 0) a task; assignees follow by default
-- Rows go with their task (cascading keys), and so with a deleted workspace.

BEGIN;

CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  member_id INTEGER,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments (task_id, created_at);

CREATE TABLE IF NOT EXISTS task_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  member_id INTEGER,
  kind TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity (task_id, created_at);

CREATE TABLE IF NOT EXISTS task_watchers (
  task_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  watching INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (task_id, member_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

COMMIT;

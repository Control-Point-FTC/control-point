-- 006-task-assignees.sql — allow multiple assignees per task.
-- Keeps tasks.assigned_to as the legacy single-assignee column; the join
-- table is the source of truth going forward. Backfills existing assignments.

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, member_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_member ON task_assignees(member_id);

-- Backfill from the legacy single-assignee column (idempotent: INSERT OR IGNORE).
INSERT OR IGNORE INTO task_assignees (task_id, member_id)
SELECT id, assigned_to FROM tasks WHERE assigned_to IS NOT NULL;

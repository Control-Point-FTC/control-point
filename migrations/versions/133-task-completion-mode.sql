-- 133-task-completion-mode.sql — "everyone assigned completes it separately".
--   tasks.completion_mode: 'each' = every assignee finishes their own part
--     and the task is done once they all have; NULL = one shared deliverable
--     (the old behavior, for every existing task).
--   task_assignee_done: who has finished their part of an 'each' task. Kept
--     apart from task_assignees (which is rewritten when people change), and
--     cleared when the task is reopened. Rows go with their task or member
--     (cascading keys, like task_assignees), and so with a deleted workspace.

BEGIN;

ALTER TABLE tasks ADD COLUMN completion_mode TEXT;

CREATE TABLE IF NOT EXISTS task_assignee_done (
  task_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (task_id, member_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

COMMIT;

-- 106-task-priority-recurrence-review.sql — V3.5 tasks.
--   priority:      'low' | 'medium' | 'high' | 'urgent' (NULL = none). Quick-add
--                  and Bruno put "high priority" here instead of the description.
--   recurrence:    JSON {"freq":"daily|weekly|monthly","interval":n}. Completing a
--                  recurring task creates the next one (next_task_id points to it,
--                  so completing twice never makes two).
--   review_status: done tasks wait for a manager: 'pending' -> 'approved', or
--                  'changes_requested' (sent back to the assignees with a note).
-- Additive only.

ALTER TABLE tasks ADD COLUMN priority TEXT;
ALTER TABLE tasks ADD COLUMN recurrence TEXT;
ALTER TABLE tasks ADD COLUMN next_task_id INTEGER;
ALTER TABLE tasks ADD COLUMN review_status TEXT;
ALTER TABLE tasks ADD COLUMN review_note TEXT;
ALTER TABLE tasks ADD COLUMN reviewed_by INTEGER;
ALTER TABLE tasks ADD COLUMN reviewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_team_review ON tasks(team_id, status, review_status);

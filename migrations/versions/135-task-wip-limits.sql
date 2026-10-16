-- 135-task-wip-limits.sql — work-in-progress limits for the task board's
-- status columns (src/types/taskStatus.ts): a JSON object such as
-- {"todo": 12, "in-progress": 4}. NULL (every existing team) = no limits.

ALTER TABLE teams ADD COLUMN task_wip_limits TEXT;

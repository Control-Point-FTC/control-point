-- 131-task-tags-start-date.sql — tasks get a start date and three tag lists
-- (src/types/taskTags.ts), each a JSON array of strings:
--   subsystems: names from the team's robot subsystem list
--   awards:     FTC judged-award ids (think, connect, reach, ...)
--   labels:     free-form labels
-- All NULL for existing tasks (no tags, no start date).

BEGIN;

ALTER TABLE tasks ADD COLUMN start_date TEXT;
ALTER TABLE tasks ADD COLUMN subsystems TEXT;
ALTER TABLE tasks ADD COLUMN awards TEXT;
ALTER TABLE tasks ADD COLUMN labels TEXT;

COMMIT;

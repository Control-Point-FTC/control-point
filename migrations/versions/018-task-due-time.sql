-- 018-task-due-time.sql — optional time of day a task is due (HH:MM, the
-- team's local time), for second-by-second countdowns. Null means "end of
-- the due date", as before. Additive only.

ALTER TABLE tasks ADD COLUMN due_time TEXT;

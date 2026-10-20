-- 148-task-part-review.sql — task_assignee_done.needs_review: on an
-- each-person task, whether that person's part needs a manager's review
-- (Bruno didn't pass it). The task closes approved only if no current
-- assignee's part does. Its own file so databases that already ran 147 get it.
ALTER TABLE task_assignee_done ADD COLUMN needs_review INTEGER;

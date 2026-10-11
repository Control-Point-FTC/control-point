-- 124-task-completion-history.sql — every completion of a task, with its proof.
--
-- tasks.completion_notes is overwritten each time a task is finished again
-- (after a manager sends it back), so earlier proof was lost. Each finish now
-- appends {by, at, notes, images} to completion_history (a JSON array), and a
-- review stamps the latest entry with its outcome.
--
-- Backfill: a task that already has proof gets one entry from what is stored.
-- One transaction, so a failed backfill leaves no column behind and the
-- migration can simply run again.

BEGIN;

ALTER TABLE tasks ADD COLUMN completion_history TEXT;

UPDATE tasks
SET completion_history = json_array(json_object(
  'by', completed_by,
  'at', COALESCE(completed_at, reviewed_at),
  'notes', completion_notes,
  'images', json(CASE WHEN json_valid(completion_images) THEN completion_images ELSE '[]' END),
  'review', json(CASE WHEN review_status IN ('approved', 'changes_requested') THEN json_object(
    'status', review_status, 'by', reviewed_by, 'at', reviewed_at, 'note', review_note) END)
))
WHERE completion_history IS NULL
  AND (completion_notes IS NOT NULL OR (completion_images IS NOT NULL AND completion_images NOT IN ('', '[]')));

COMMIT;

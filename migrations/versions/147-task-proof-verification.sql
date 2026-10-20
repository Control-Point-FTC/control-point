-- 147-task-proof-verification.sql — Bruno checks completion proof.
--   tasks.proof_requirement: what proof finishing the task takes: 'photo',
--     'link', 'note', 'none', or NULL/'auto' (Bruno decides from the title).
--   tasks.completion_link: the link submitted with the latest finish.
--   tasks.completion_ai_note: what Bruno said about the latest finish, shown
--     to the manager reviewing it.

BEGIN;

ALTER TABLE tasks ADD COLUMN proof_requirement TEXT;
ALTER TABLE tasks ADD COLUMN completion_link TEXT;
ALTER TABLE tasks ADD COLUMN completion_ai_note TEXT;

COMMIT;

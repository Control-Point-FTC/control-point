-- 122-bruno-access.sql — per-member switches for what Bruno may use.
--   members.bruno_notebook: 1 = Bruno can read and propose edits to the team
--                           notebook for this member (default on).
--   members.bruno_sticky:   1 = Bruno can read and propose edits to this
--                           member's own sticky notes (default on).
-- Additive only.

ALTER TABLE members ADD COLUMN bruno_notebook INTEGER DEFAULT 1;
ALTER TABLE members ADD COLUMN bruno_sticky INTEGER DEFAULT 1;

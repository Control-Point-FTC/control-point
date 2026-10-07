-- 013-team-timezone.sql — a workspace's own timezone (IANA name, e.g.
-- America/Chicago). Bruno states today's date, weekdays and "next meeting" in
-- it; when unset, the viewer's browser timezone is used. Additive; NULL for
-- every existing workspace.

ALTER TABLE teams ADD COLUMN timezone TEXT;

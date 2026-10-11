-- 125-member-last-used.sql — when each membership (workspace) was last used.
--
-- "The workspace you used last" was read from sessions.last_activity, but a
-- workspace switch moves this device's one session row to the new
-- membership, so the workspace you came from left no trace. Deleting a
-- workspace then landed on whichever other workspace happened to have a
-- session (V5 audit Low 10, still seen on production). Each sign-in, switch
-- and session refresh now stamps the membership here.
--
-- Backfill from the sessions that exist today.

BEGIN;

CREATE TABLE IF NOT EXISTS member_last_used (
  member_id INTEGER PRIMARY KEY,
  used_at TEXT NOT NULL
);

INSERT OR IGNORE INTO member_last_used (member_id, used_at)
SELECT member_id, MAX(last_activity) FROM sessions WHERE member_id IS NOT NULL GROUP BY member_id;

COMMIT;

-- 128-team-calendar-sync.sql — Google Calendar sync becomes a per-team switch,
-- and every existing calendar link is reset.
--
-- The switch was one global `settings` row, so any team's admin turned sync
-- on or off for every workspace. It is now a column on teams; teams keep the
-- state the global switch had.
--
-- Links made before this release are reset (owner's request): the server
-- deletes each member's Google copies, revokes the grant at Google and
-- removes the link, then the row here. Only a link still holding the
-- snapshotted linked_at is reset, so one made after the deploy stays.

BEGIN;

ALTER TABLE teams ADD COLUMN google_calendar_sync INTEGER NOT NULL DEFAULT 0;
UPDATE teams SET google_calendar_sync = 1
WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'google_calendar_sync' AND value = '1');
DELETE FROM settings WHERE key = 'google_calendar_sync';

CREATE TABLE IF NOT EXISTS calendar_links_to_reset (
  member_id INTEGER PRIMARY KEY,
  linked_at TEXT
);
INSERT OR IGNORE INTO calendar_links_to_reset (member_id, linked_at)
SELECT member_id, linked_at FROM google_calendar_links;

COMMIT;

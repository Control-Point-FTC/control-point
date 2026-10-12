-- 128-team-calendar-sync.sql — Google Calendar sync becomes a per-team switch,
-- and every existing calendar link is reset.
--
-- The switch was one global `settings` row, so any team's admin turned sync
-- on or off for every workspace. It is now a column on teams; teams keep the
-- state the global switch had.
--
-- Links made before this release are reset (owner's request): the server
-- turns each into a disconnect job (below), which deletes the member's
-- Google copies and revokes the grant at Google. Only a link still holding
-- the snapshotted linked_at is reset, so one made after the deploy stays.

BEGIN;

ALTER TABLE teams ADD COLUMN google_calendar_sync INTEGER NOT NULL DEFAULT 0;
UPDATE teams SET google_calendar_sync = 1
WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'google_calendar_sync' AND value = '1');
DELETE FROM settings WHERE key = 'google_calendar_sync';

-- Disconnecting a calendar is a durable job: the (encrypted) refresh token
-- and the Google ids of the copies to delete stay here until the copies are
-- deleted and the grant revoked, so a slow Google or a restart only delays it.
CREATE TABLE IF NOT EXISTS calendar_disconnects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  refresh_token TEXT,
  google_event_ids TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT, -- NULL = due now; set after a failed try (backoff)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_links_to_reset (
  member_id INTEGER PRIMARY KEY,
  linked_at TEXT
);
INSERT OR IGNORE INTO calendar_links_to_reset (member_id, linked_at)
SELECT member_id, linked_at FROM google_calendar_links;

COMMIT;

-- 007-google-calendar.sql — per-member Google Calendar linking + team event sync.
-- Members link their Google account (calendar.events scope) in Settings;
-- the admin's `google_calendar_sync` setting controls whether team events
-- push out to every linked member's personal calendar.

CREATE TABLE IF NOT EXISTS google_calendar_links (
  member_id INTEGER PRIMARY KEY,
  google_email TEXT DEFAULT '',
  refresh_token TEXT NOT NULL,
  linked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Tracks which team events were pushed to which member's Google Calendar,
-- so updates/deletes can target the right Google event.
CREATE TABLE IF NOT EXISTS event_calendar_sync (
  event_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  google_event_id TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_calendar_sync_member ON event_calendar_sync(member_id);

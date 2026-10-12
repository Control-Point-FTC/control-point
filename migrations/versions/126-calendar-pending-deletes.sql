-- 126-calendar-pending-deletes.sql — Google Calendar copies still to delete.
--
-- Calendar tokens are encrypted with CALENDAR_TOKEN_KEY. While that key is
-- missing or wrong, deleting a team event can't reach Google, and the event's
-- sync rows go with the event. The Google copy is queued here instead and
-- deleted once the member's token can be read again.

CREATE TABLE IF NOT EXISTS calendar_pending_deletes (
  member_id INTEGER NOT NULL,
  google_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, google_event_id)
);

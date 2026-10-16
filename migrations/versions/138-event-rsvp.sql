-- 138-event-rsvp.sql — RSVPs and attendees on calendar events (src/types/eventRsvp.ts):
--   events.rsvp_mode       'none' | 'decline_only' | 'full'
--   events.attendee_roles  JSON array of role ids; NULL = the whole team
--   event_rsvps            each member's answer; excused_date is the attendance
--                          day this RSVP excused (so changing it can undo that)
-- Rows go with their event (cascading key).

BEGIN;

ALTER TABLE events ADD COLUMN rsvp_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE events ADD COLUMN attendee_roles TEXT;

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  excused_date TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_team ON event_rsvps (team_id, event_id);

COMMIT;

-- 138-event-rsvp.sql — RSVPs and attendees on calendar events (src/types/eventRsvp.ts):
--   events.rsvp_mode          'none' | 'decline_only' | 'full'
--   events.attendee_roles     JSON array of role ids; NULL = the whole team
--   event_rsvps               each member's answer (cascades with its event)
--   attendance.rsvp_event_id  set on an excused record an RSVP made; any
--                             attendance write by a person clears it
--
-- "Can't make it" with a reason excuses the member on the event's day, unless
-- attendance for that day already exists. The triggers below keep those
-- records in step in the same transaction as the change, whoever makes it
-- (the API, a series edit, Bruno): a new or changed answer, a moved event,
-- a deleted answer or event. Only records still owned by the RSVP are touched,
-- and they never carry the private reason (only "Can't make it (RSVP)").

BEGIN;

ALTER TABLE events ADD COLUMN rsvp_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE events ADD COLUMN attendee_roles TEXT;
ALTER TABLE attendance ADD COLUMN rsvp_event_id INTEGER;

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_team ON event_rsvps (team_id, event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_rsvp_event ON attendance (rsvp_event_id);

CREATE TRIGGER IF NOT EXISTS rsvp_excuse_insert AFTER INSERT ON event_rsvps BEGIN
  DELETE FROM attendance WHERE rsvp_event_id = NEW.event_id AND member_id = NEW.member_id;
  INSERT OR IGNORE INTO attendance (team_id, member_id, date, status, reason, is_excused, rsvp_event_id)
    SELECT e.team_id, NEW.member_id, e.date, 'E', 'Can''t make it (RSVP)', 1, e.id
    FROM events e WHERE e.id = NEW.event_id AND NEW.status = 'not_going' AND NEW.reason != '';
END;

CREATE TRIGGER IF NOT EXISTS rsvp_excuse_update AFTER UPDATE ON event_rsvps BEGIN
  DELETE FROM attendance WHERE rsvp_event_id = OLD.event_id AND member_id = OLD.member_id;
  INSERT OR IGNORE INTO attendance (team_id, member_id, date, status, reason, is_excused, rsvp_event_id)
    SELECT e.team_id, NEW.member_id, e.date, 'E', 'Can''t make it (RSVP)', 1, e.id
    FROM events e WHERE e.id = NEW.event_id AND NEW.status = 'not_going' AND NEW.reason != '';
END;

CREATE TRIGGER IF NOT EXISTS rsvp_excuse_delete AFTER DELETE ON event_rsvps BEGIN
  DELETE FROM attendance WHERE rsvp_event_id = OLD.event_id AND member_id = OLD.member_id;
END;

CREATE TRIGGER IF NOT EXISTS rsvp_excuse_event_delete AFTER DELETE ON events BEGIN
  DELETE FROM attendance WHERE rsvp_event_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS rsvp_excuse_event_move AFTER UPDATE OF date ON events WHEN NEW.date IS NOT OLD.date BEGIN
  DELETE FROM attendance WHERE rsvp_event_id = NEW.id;
  INSERT OR IGNORE INTO attendance (team_id, member_id, date, status, reason, is_excused, rsvp_event_id)
    SELECT NEW.team_id, r.member_id, NEW.date, 'E', 'Can''t make it (RSVP)', 1, NEW.id
    FROM event_rsvps r WHERE r.event_id = NEW.id AND r.status = 'not_going' AND r.reason != '';
END;

COMMIT;

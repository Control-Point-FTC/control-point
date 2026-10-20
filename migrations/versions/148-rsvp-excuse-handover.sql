-- 148-rsvp-excuse-handover.sql — a member who can't make two events on the
-- same day keeps that day's excuse while either answer stands.
-- The day has one attendance record, owned by the first decline (138). When
-- that answer is withdrawn or changed, or its event is deleted or moved, the
-- record is handed over to the member's next "can't make it" (with a reason)
-- on that day instead of being deleted, and deleted only when none is left.
-- Only records an RSVP owns (rsvp_event_id set) are touched, as before.

BEGIN;

DROP TRIGGER IF EXISTS rsvp_excuse_update;
CREATE TRIGGER rsvp_excuse_update AFTER UPDATE ON event_rsvps BEGIN
  UPDATE attendance SET rsvp_event_id = (
      SELECT e.id FROM event_rsvps r JOIN events e ON e.id = r.event_id
      WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
        AND e.id != OLD.event_id AND r.status = 'not_going' AND r.reason != '' ORDER BY e.id LIMIT 1)
    WHERE rsvp_event_id = OLD.event_id AND member_id = OLD.member_id
      AND NOT (NEW.status = 'not_going' AND NEW.reason != '')
      AND EXISTS (SELECT 1 FROM event_rsvps r JOIN events e ON e.id = r.event_id
        WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
          AND e.id != OLD.event_id AND r.status = 'not_going' AND r.reason != '');
  DELETE FROM attendance WHERE rsvp_event_id = OLD.event_id AND member_id = OLD.member_id;
  INSERT OR IGNORE INTO attendance (team_id, member_id, date, status, reason, is_excused, rsvp_event_id)
    SELECT e.team_id, NEW.member_id, e.date, 'E', 'Can''t make it (RSVP)', 1, e.id
    FROM events e WHERE e.id = NEW.event_id AND NEW.status = 'not_going' AND NEW.reason != '';
END;

DROP TRIGGER IF EXISTS rsvp_excuse_delete;
CREATE TRIGGER rsvp_excuse_delete AFTER DELETE ON event_rsvps BEGIN
  UPDATE attendance SET rsvp_event_id = (
      SELECT e.id FROM event_rsvps r JOIN events e ON e.id = r.event_id
      WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
        AND e.id != OLD.event_id AND r.status = 'not_going' AND r.reason != '' ORDER BY e.id LIMIT 1)
    WHERE rsvp_event_id = OLD.event_id AND member_id = OLD.member_id
      AND EXISTS (SELECT 1 FROM event_rsvps r JOIN events e ON e.id = r.event_id
        WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
          AND e.id != OLD.event_id AND r.status = 'not_going' AND r.reason != '');
  DELETE FROM attendance WHERE rsvp_event_id = OLD.event_id AND member_id = OLD.member_id;
END;

DROP TRIGGER IF EXISTS rsvp_excuse_event_delete;
CREATE TRIGGER rsvp_excuse_event_delete AFTER DELETE ON events BEGIN
  UPDATE attendance SET rsvp_event_id = (
      SELECT e.id FROM event_rsvps r JOIN events e ON e.id = r.event_id
      WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
        AND e.id != OLD.id AND r.status = 'not_going' AND r.reason != '' ORDER BY e.id LIMIT 1)
    WHERE rsvp_event_id = OLD.id
      AND EXISTS (SELECT 1 FROM event_rsvps r JOIN events e ON e.id = r.event_id
        WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
          AND e.id != OLD.id AND r.status = 'not_going' AND r.reason != '');
  DELETE FROM attendance WHERE rsvp_event_id = OLD.id;
END;

DROP TRIGGER IF EXISTS rsvp_excuse_event_move;
CREATE TRIGGER rsvp_excuse_event_move AFTER UPDATE OF date ON events WHEN NEW.date IS NOT OLD.date BEGIN
  UPDATE attendance SET rsvp_event_id = (
      SELECT e.id FROM event_rsvps r JOIN events e ON e.id = r.event_id
      WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
        AND e.id != NEW.id AND r.status = 'not_going' AND r.reason != '' ORDER BY e.id LIMIT 1)
    WHERE rsvp_event_id = NEW.id
      AND EXISTS (SELECT 1 FROM event_rsvps r JOIN events e ON e.id = r.event_id
        WHERE r.member_id = attendance.member_id AND e.team_id = attendance.team_id AND e.date = attendance.date
          AND e.id != NEW.id AND r.status = 'not_going' AND r.reason != '');
  DELETE FROM attendance WHERE rsvp_event_id = NEW.id;
  INSERT OR IGNORE INTO attendance (team_id, member_id, date, status, reason, is_excused, rsvp_event_id)
    SELECT NEW.team_id, r.member_id, NEW.date, 'E', 'Can''t make it (RSVP)', 1, NEW.id
    FROM event_rsvps r WHERE r.event_id = NEW.id AND r.status = 'not_going' AND r.reason != '';
END;

COMMIT;

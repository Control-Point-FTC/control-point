-- 139-event-first-code.sql — calendar events imported from FIRST (FTC Events / FTC Scout)
-- remember their official event code, so importing again never duplicates them.

BEGIN;

ALTER TABLE events ADD COLUMN first_event_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_first_code ON events (team_id, first_event_code) WHERE first_event_code IS NOT NULL;

COMMIT;

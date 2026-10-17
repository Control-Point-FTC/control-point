-- 139-event-first-code.sql — calendar events imported from FIRST (FTC Events / FTC Scout)
-- remember their official event code and season, so importing again never
-- duplicates them. Codes repeat from season to season (the same qualifier
-- each year), so the season is part of the key.

BEGIN;

ALTER TABLE events ADD COLUMN first_event_code TEXT;
ALTER TABLE events ADD COLUMN first_event_season INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_first_code ON events (team_id, first_event_season, first_event_code) WHERE first_event_code IS NOT NULL;

COMMIT;

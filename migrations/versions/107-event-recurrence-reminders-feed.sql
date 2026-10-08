-- 107-event-recurrence-reminders-feed.sql — V3.5 calendar.
--   recurrence:        JSON {"freq":"daily|weekly|monthly","interval":n,"count"|"until"}
--                      on every occurrence of a repeating event.
--   series_id:         id of the first occurrence; shared by the whole series.
--                      Each occurrence is its own row (finite series, capped).
--   reminder_minutes:  lead time for the reminder notification (NULL = none).
--   reminder_sent_at:  set once the reminder went out (cleared when the time changes).
--   calendar_feeds:    one secret ICS subscribe URL per membership.
-- Additive only.

ALTER TABLE events ADD COLUMN recurrence TEXT;
ALTER TABLE events ADD COLUMN series_id INTEGER;
ALTER TABLE events ADD COLUMN reminder_minutes INTEGER;
ALTER TABLE events ADD COLUMN reminder_sent_at TEXT;
CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id, date);
CREATE INDEX IF NOT EXISTS idx_events_reminder_due ON events(date) WHERE reminder_minutes IS NOT NULL AND reminder_sent_at IS NULL;

CREATE TABLE IF NOT EXISTS calendar_feeds (
  member_id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

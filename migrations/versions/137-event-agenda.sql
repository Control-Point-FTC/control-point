-- 137-event-agenda.sql — an agenda on calendar events (src/types/eventTypes.ts),
-- separate from the event's notes.

ALTER TABLE events ADD COLUMN agenda TEXT NOT NULL DEFAULT '';

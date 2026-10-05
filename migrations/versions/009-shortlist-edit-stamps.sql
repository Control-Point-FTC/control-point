-- 009-shortlist-edit-stamps.sql — scouting shortlist: per-field edit times.
-- field_ts holds {field: client edit time (ms)} so a delayed or retried save
-- can't overwrite a newer edit; deleted = 1 is a tombstone so a late save
-- can't resurrect a removed team. Purely additive (two new columns).

ALTER TABLE scouting_shortlist ADD COLUMN field_ts TEXT NOT NULL DEFAULT '{}';
ALTER TABLE scouting_shortlist ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;

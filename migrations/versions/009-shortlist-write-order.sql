-- 009-shortlist-write-order.sql — scouting shortlist write ordering.
-- field_ts holds, per field/tag, the origin {client, seq} of the last write
-- applied, so one client's delayed request can't overwrite its newer edit;
-- deleted = 1 is a tombstone so a late save can't resurrect a removed team.
-- Purely additive (two new columns).

ALTER TABLE scouting_shortlist ADD COLUMN field_ts TEXT NOT NULL DEFAULT '{}';
ALTER TABLE scouting_shortlist ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;

-- 010-team-hidden-dates.sql — attendance "hidden dates" become per-workspace.
-- The original hidden_dates table had no team_id, so any workspace's
-- attendance manager hid or unhid dates for every workspace. The new table is
-- keyed by (team_id, date). Backfill copies today's global set to every
-- existing workspace, so nothing any team sees changes on deploy. The old
-- table is left untouched (no longer read or written) for rollback.

CREATE TABLE IF NOT EXISTS team_hidden_dates (
  team_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (team_id, date),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO team_hidden_dates (team_id, date)
SELECT t.id, h.date FROM teams t CROSS JOIN hidden_dates h;

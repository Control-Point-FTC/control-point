-- 140-member-unavailability.sql — when members can't be there (src/utils/unavailability.ts):
--   a date range (start_date..end_date, weekday NULL) or a weekly slot
--   (weekday 0 = Sunday, from start_date until end_date or for good), all day
--   or between start_time and end_time. The note is private to the member and
--   attendance managers. Rows go with their member.

BEGIN;

CREATE TABLE IF NOT EXISTS member_unavailability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  weekday INTEGER,
  start_time TEXT,
  end_time TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_unavailability_team ON member_unavailability (team_id, start_date);
CREATE INDEX IF NOT EXISTS idx_unavailability_member ON member_unavailability (member_id);

COMMIT;

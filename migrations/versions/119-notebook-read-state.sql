-- Per-member read state for notebook pages (Mark as Read / unread highlights).
-- A page is unread when someone else changed it after this member last saw
-- it. The baseline row is written on a member's first notebook visit so
-- pages that existed before then don't all start unread.
CREATE TABLE IF NOT EXISTS notebook_reads (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  read_revision INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (team_id, member_id, page_id)
);
CREATE TABLE IF NOT EXISTS notebook_read_baselines (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL,
  baseline_at TEXT NOT NULL,
  PRIMARY KEY (team_id, member_id)
);

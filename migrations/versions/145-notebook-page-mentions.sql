-- 145-notebook-page-mentions.sql — "@Jenny" typed in a notebook page
-- (picked from the member list) pings that member: one row per ping, shown
-- in the notebook's Mentions inbox, with a notification that opens the page.
BEGIN;

CREATE TABLE IF NOT EXISTS notebook_page_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mentioned_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS notebook_page_mentions_member ON notebook_page_mentions(team_id, member_id, created_at);
CREATE INDEX IF NOT EXISTS notebook_page_mentions_page ON notebook_page_mentions(team_id, page_id, member_id, created_at);

COMMIT;

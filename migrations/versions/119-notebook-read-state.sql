-- Notebook History: per-member read state (Mark as Read / unread highlights)
-- and a lasting record of who changed each page (Find by author).
-- A page is unread when someone else changed it after this member last saw
-- it. The baseline row is written on a member's first notebook visit so
-- pages that existed before then don't all start unread.
-- Page rows cascade: purging a page removes its read and contributor rows.
CREATE TABLE IF NOT EXISTS notebook_reads (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
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
-- Kept independently of the 50 retained revisions, so earlier contributors
-- stay findable after their versions age out.
CREATE TABLE IF NOT EXISTS notebook_contributors (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL,
  last_at TEXT NOT NULL,
  PRIMARY KEY (team_id, page_id, member_id)
);
CREATE INDEX IF NOT EXISTS notebook_contributors_member ON notebook_contributors(team_id, member_id, last_at);
-- Backfill from the history that exists today: retained revisions, then each
-- page's creator and latest editor.
INSERT OR IGNORE INTO notebook_contributors(team_id, page_id, member_id, last_at)
  SELECT v.team_id, v.page_id, v.author_id, MAX(v.saved_at) FROM notebook_versions v
  JOIN notebook_pages p ON p.id = v.page_id AND p.team_id = v.team_id
  WHERE v.author_id IS NOT NULL GROUP BY v.team_id, v.page_id, v.author_id;
INSERT OR IGNORE INTO notebook_contributors(team_id, page_id, member_id, last_at)
  SELECT team_id, id, created_by, created_at FROM notebook_pages WHERE created_by IS NOT NULL;
INSERT INTO notebook_contributors(team_id, page_id, member_id, last_at)
  SELECT team_id, id, updated_by, updated_at FROM notebook_pages WHERE updated_by IS NOT NULL AND 1
  ON CONFLICT(team_id, page_id, member_id) DO UPDATE SET last_at = MAX(last_at, excluded.last_at);

CREATE TABLE IF NOT EXISTS notebook_links (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source_page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  target_page_id INTEGER NOT NULL,
  target_block_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (team_id,source_page_id,target_page_id,target_block_id)
);
CREATE INDEX IF NOT EXISTS notebook_links_target ON notebook_links(team_id,target_page_id);

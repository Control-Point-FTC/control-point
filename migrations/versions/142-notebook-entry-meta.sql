-- 142-notebook-entry-meta.sql — notebook entry metadata (src/notebook/entryMeta.ts):
-- when the work happened, entry type, design-process stage, robot subsystems
-- and judged awards. One row per page that has any; it goes with its page.

CREATE TABLE IF NOT EXISTS notebook_page_meta (
  page_id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,
  work_date TEXT,
  entry_type TEXT,
  stage TEXT,
  subsystems TEXT NOT NULL DEFAULT '[]',
  awards TEXT NOT NULL DEFAULT '[]',
  updated_by INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES notebook_pages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notebook_page_meta_team ON notebook_page_meta (team_id);

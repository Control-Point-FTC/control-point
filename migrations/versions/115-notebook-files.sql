BEGIN;
CREATE TABLE IF NOT EXISTS notebook_files (
  file_id INTEGER PRIMARY KEY REFERENCES stored_files(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  uploaded_page_id INTEGER REFERENCES notebook_pages(id) ON DELETE SET NULL,
  uploaded_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notebook_files_page ON notebook_files(team_id,uploaded_page_id);
CREATE TABLE IF NOT EXISTS notebook_file_refs (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES notebook_files(file_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(team_id,page_id,file_id,revision)
);
CREATE INDEX IF NOT EXISTS notebook_file_refs_file ON notebook_file_refs(team_id,file_id,page_id);
COMMIT;

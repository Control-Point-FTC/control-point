-- Team notebooks intentionally use new tables: never adopt the abandoned
-- account-private/password-lock schema. Authors do not own shared content.
CREATE TABLE notebook_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL, color TEXT, position INTEGER NOT NULL DEFAULT 0,
  starter INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX notebook_starter ON notebook_books(team_id) WHERE starter = 1;
CREATE INDEX notebook_books_team ON notebook_books(team_id);
CREATE TABLE notebook_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  notebook_id INTEGER NOT NULL REFERENCES notebook_books(id) ON DELETE CASCADE,
  title TEXT NOT NULL, color TEXT, position INTEGER NOT NULL DEFAULT 0,
  protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX notebook_sections_team ON notebook_sections(team_id, notebook_id);
CREATE TABLE notebook_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES notebook_sections(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES notebook_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
  protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),
  content TEXT NOT NULL DEFAULT '[]', canvas TEXT NOT NULL DEFAULT '{}',
  plain TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX notebook_pages_team ON notebook_pages(team_id, section_id, parent_id);
CREATE INDEX notebook_pages_parent ON notebook_pages(team_id, parent_id);
CREATE INDEX notebook_pages_search ON notebook_pages(team_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE TABLE notebook_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL, canvas TEXT NOT NULL,
  revision INTEGER NOT NULL,
  author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  saved_at TEXT NOT NULL,
  UNIQUE(page_id, revision)
);
CREATE INDEX notebook_versions_page ON notebook_versions(team_id, page_id, revision);
-- New capabilities are independently assignable. Reading follows membership.
UPDATE roles SET permissions = json_insert(permissions, '$[#]', 'edit_notebook', '$[#]', 'organize_notebook')
WHERE is_system = 1 AND name IN ('Member', 'Verified Member') AND json_valid(permissions)
  AND NOT EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'edit_notebook');

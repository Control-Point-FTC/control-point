-- 111-personal-notebook.sql — V3.5 personal notebook (private to one account).
--   Rows belong to an account, not a workspace: `owner` is the account's
--   lower-cased email, so the notebook follows the person across workspaces
--   and nobody else (teammates, admins) can reach it.
--   nb_notebooks → nb_sections (colour, optional password) → nb_pages
--   (parent_id = subpage). A page keeps its block content, its freeform
--   canvas (text boxes, images, ink) and a plain-text copy for search.
--   nb_page_versions: snapshots for page history.
-- Additive only.

CREATE TABLE IF NOT EXISTS nb_notebooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  color TEXT,
  sort REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nb_notebooks_owner ON nb_notebooks(owner, sort);

CREATE TABLE IF NOT EXISTS nb_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  notebook_id INTEGER NOT NULL REFERENCES nb_notebooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT,
  sort REAL NOT NULL DEFAULT 0,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nb_sections_owner ON nb_sections(owner, notebook_id, sort);

CREATE TABLE IF NOT EXISTS nb_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  section_id INTEGER NOT NULL REFERENCES nb_sections(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES nb_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  canvas TEXT,
  plain TEXT NOT NULL DEFAULT '',
  sort REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nb_pages_owner ON nb_pages(owner, section_id, sort);
CREATE INDEX IF NOT EXISTS idx_nb_pages_parent ON nb_pages(parent_id);

CREATE TABLE IF NOT EXISTS nb_page_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  page_id INTEGER NOT NULL REFERENCES nb_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  canvas TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nb_page_versions_page ON nb_page_versions(page_id, id);

CREATE TABLE IF NOT EXISTS notebook_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
  anchor TEXT NOT NULL DEFAULT '{"kind":"page"}',
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES members(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS notebook_threads_page ON notebook_threads(team_id,page_id,id);
CREATE TABLE IF NOT EXISTS notebook_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES notebook_threads(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS notebook_comments_thread ON notebook_comments(team_id,thread_id,id);
CREATE TABLE IF NOT EXISTS notebook_mentions (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES notebook_comments(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  read_at TEXT,
  PRIMARY KEY(team_id,comment_id,member_id)
);
CREATE INDEX IF NOT EXISTS notebook_mentions_member ON notebook_mentions(team_id,member_id,created_at);

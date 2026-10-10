-- Notebook top bar → Sticky Notes: personal scratch notes, not tied to any
-- notebook page and visible only to the member who wrote them.
CREATE TABLE IF NOT EXISTS sticky_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'volt',
  x INTEGER NOT NULL DEFAULT 80,
  y INTEGER NOT NULL DEFAULT 120,
  width INTEGER NOT NULL DEFAULT 260,
  height INTEGER NOT NULL DEFAULT 220,
  open INTEGER NOT NULL DEFAULT 1 CHECK(open IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sticky_notes_owner ON sticky_notes(team_id, member_id, updated_at);

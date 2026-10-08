-- 108-changelog-entries.sql — owner-edited What's new (V3.5).
-- The owner writes releases in the Owner console. Lists are JSON arrays of
-- strings. posted_at records the last post to the Discord changelog webhook.
-- The built-in list in src/utils/changelog.ts seeds the table once when empty.

CREATE TABLE IF NOT EXISTS changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  added TEXT NOT NULL DEFAULT '[]',
  improved TEXT NOT NULL DEFAULT '[]',
  fixed TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  posted_at TEXT
);

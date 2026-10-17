-- 144-notebook-reviews.sql — mentor review of notebook entries (server/notebookReviews.ts):
-- a member asks for review; a reviewer approves or asks for changes with a
-- comment. A page has at most one pending request at a time.

CREATE TABLE IF NOT EXISTS notebook_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  requested_by INTEGER NOT NULL,
  requested_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id INTEGER,
  reviewed_at TEXT,
  comment TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (page_id) REFERENCES notebook_pages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notebook_reviews_team ON notebook_reviews (team_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_reviews_open ON notebook_reviews (page_id) WHERE status = 'pending';

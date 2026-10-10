-- One row per confirmed Bruno notebook card: a retried confirm (lost
-- response, double tap) replays the stored result instead of writing twice.
CREATE TABLE IF NOT EXISTS bruno_notebook_receipts (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  receipt_key TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, receipt_key)
);
CREATE INDEX IF NOT EXISTS bruno_notebook_receipts_age ON bruno_notebook_receipts(created_at);

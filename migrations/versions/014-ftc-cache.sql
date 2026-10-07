-- 014-ftc-cache.sql — last-good copies of FTC upstream payloads (FIRST
-- Events / FTC Scout), so Team Stats, Predict and Analyze can still show data
-- after a restart while the feeds are unreachable. Pure cache: safe to empty.

CREATE TABLE IF NOT EXISTS ftc_cache (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ftc_cache_at ON ftc_cache(at);

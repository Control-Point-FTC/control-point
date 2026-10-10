-- First-party pageview counter for public pages: daily totals per page only.
-- Nothing about visitors is stored (no IP, user agent, cookie or id).
CREATE TABLE IF NOT EXISTS page_views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

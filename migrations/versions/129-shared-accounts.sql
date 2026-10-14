-- 129-shared-accounts.sql — one account shared with Control Scout.
--
-- Control Point has no account entity: an account is an email across
-- `members` rows. Control Scout users usually have no team, so the shared
-- store is this small table, keyed by lower-cased, trimmed email. Its id is
-- the person's account id in both apps. Nothing here touches members,
-- verified_emails or proven_passwords.
-- Contract: control-scout docs/shared-accounts.md.

BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,         -- lower-cased, trimmed
  display_name TEXT,
  verified_by TEXT NOT NULL,          -- first proof seen: control-point | scout-email-code | google
  created_at TEXT NOT NULL,           -- ISO
  last_seen_at TEXT                   -- ISO, touched on resolve / hand-off
);

-- "Continue with Control Point": a single-use code (sha256-hashed, 2-minute
-- TTL) that Control Scout redeems server to server with the matching state.
CREATE TABLE IF NOT EXISTS scout_handoff_codes (
  code_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  state TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

COMMIT;

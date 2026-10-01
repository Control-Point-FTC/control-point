-- 001: email verification for email+password signups.
--
-- verified_emails: account-level verification, keyed by email (the app's
-- identity is account-wide by email; memberships are per-team rows).
-- email_verification_codes: outstanding OTP codes. Only the newest code per
-- email is valid; codes are stored as SHA-256 hashes, never plaintext.
--
-- Backfill: every address already in members is grandfathered as verified —
-- those accounts were created before verification existed and their owners
-- are already using the app. Locking them out would be wrong.

CREATE TABLE IF NOT EXISTS verified_emails (
  email TEXT PRIMARY KEY,
  verified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verify_codes_email ON email_verification_codes(email);

-- Grandfather existing accounts: they signed up before verification existed.
INSERT INTO verified_emails (email, verified_at)
SELECT DISTINCT email, datetime('now') FROM members WHERE email IS NOT NULL AND email != ''
ON CONFLICT(email) DO NOTHING;

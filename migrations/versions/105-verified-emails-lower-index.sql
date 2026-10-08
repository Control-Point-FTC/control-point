-- 105-verified-emails-lower-index.sql — the roster hides unverified email
-- signups (V3-M3) with a case-insensitive check, LOWER(ve.email) =
-- LOWER(m.email). Older rows may keep their original casing, so the
-- comparison stays case-insensitive; this expression index keeps it a lookup
-- instead of a scan of every verified address. Additive only.

CREATE INDEX IF NOT EXISTS idx_verified_emails_lower ON verified_emails(LOWER(email));

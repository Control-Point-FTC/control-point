-- 123-proven-passwords.sql — passwords the email's owner has proven (V5 audit H1).
--
-- A password signup stores the hash before the email is verified, so a
-- stranger could register someone else's address. If the real owner later
-- proved the email through Google/Discord/GitHub, the stranger's password
-- used to start working. A hash now counts only once the owner has proven
-- it: set or confirmed with an emailed code, or changed while signed in.
-- Keyed by (email, hash), so copies of a hash onto other memberships of the
-- same account need nothing extra.
--
-- Backfill: every password already on a verified email is grandfathered as
-- proven — those owners are signed in and using the app today.

CREATE TABLE IF NOT EXISTS proven_passwords (
  email TEXT NOT NULL,
  hash TEXT NOT NULL,
  proven_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, hash)
);

INSERT OR IGNORE INTO proven_passwords (email, hash, proven_at)
SELECT DISTINCT LOWER(m.email), m.password, datetime('now')
FROM members m
WHERE m.password IS NOT NULL AND m.password != '' AND m.email IS NOT NULL
  AND EXISTS (SELECT 1 FROM verified_emails ve WHERE LOWER(ve.email) = LOWER(m.email));

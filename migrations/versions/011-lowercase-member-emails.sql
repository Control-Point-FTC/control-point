-- 011-lowercase-member-emails.sql — one account per email, whatever its casing.
-- Signup used to keep the typed casing while verification and owner checks
-- compared case-insensitively, so "Owner@x.com" could open a separate account
-- that the owner checks treated as the owner. Every write now lowercases;
-- this brings existing rows in line.
--
-- Non-destructive: a row is only rewritten when no other row in the same
-- workspace already holds the lowercased address (UNIQUE(team_id, email)).
-- Any such case-only duplicates are left as they are and reported at boot
-- for manual review — never merged automatically.

UPDATE members
SET email = LOWER(TRIM(email))
WHERE email != LOWER(TRIM(email))
  AND NOT EXISTS (
    SELECT 1 FROM members m2
    WHERE m2.id != members.id
      AND m2.team_id IS members.team_id
      AND LOWER(TRIM(m2.email)) = LOWER(TRIM(members.email))
  );

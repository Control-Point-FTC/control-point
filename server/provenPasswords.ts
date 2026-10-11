// Proven passwords (V5 audit H1, account pre-hijacking).
//
// A password signup stores the hash before the email is verified, so a
// stranger could register someone else's address with a password of their
// own. When the real owner later proved the email through Google, Discord or
// GitHub, OAuth linked those rows and marked the email verified — and the
// stranger's password started working.
//
// A hash now counts only once the email's owner has proven it
// (migrations/versions/123-proven-passwords.sql):
//   - an emailed verify code proves the passwords on the account's rows
//     (whoever set them received the code);
//   - a reset code, or a change while signed in, proves the new hash;
//   - OAuth proves the EMAIL, never a password: it drops unproven hashes.
// Login and signup sessions on a verified email need a proven hash.

export interface ProvenDeps {
  dbRun: (sql: string, ...args: any[]) => Promise<any>;
  dbGet: (sql: string, ...args: any[]) => Promise<any>;
}

const norm = (email: string) => String(email || "").trim().toLowerCase();

/** The account's current passwords were set by whoever just proved the email. */
export async function provePasswords(email: string, deps: ProvenDeps): Promise<void> {
  const e = norm(email);
  if (!e) return;
  await deps.dbRun(
    `INSERT OR IGNORE INTO proven_passwords (email, hash, proven_at)
     SELECT DISTINCT ?, password, datetime('now') FROM members
     WHERE LOWER(email) = ? AND password IS NOT NULL AND password != ''`,
    e, e,
  );
}

/** A new hash the owner set with proof (reset code, change while signed in).
 *  Call BEFORE writing it to the rows, so nothing can drop it in between. */
export async function proveHash(email: string, hash: string, deps: ProvenDeps): Promise<void> {
  const e = norm(email);
  if (!e || !hash) return;
  await deps.dbRun("INSERT OR IGNORE INTO proven_passwords (email, hash, proven_at) VALUES (?, ?, datetime('now'))", e, hash);
}

export async function isProvenHash(email: string, hash: string, deps: ProvenDeps): Promise<boolean> {
  const e = norm(email);
  if (!e || !hash) return false;
  return !!(await deps.dbGet("SELECT 1 AS ok FROM proven_passwords WHERE email = ? AND hash = ?", e, hash));
}

/** OAuth proved the email: passwords nobody proved are dropped, in one
 *  statement (a proven hash written meanwhile is never touched). The owner
 *  then gets the usual "set your password" code on their next password login. */
export async function dropUnprovenPasswords(email: string, deps: ProvenDeps): Promise<number> {
  const e = norm(email);
  if (!e) return 0;
  const info = await deps.dbRun(
    `UPDATE members SET password = NULL
     WHERE LOWER(email) = ? AND password IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM proven_passwords p WHERE p.email = ? AND p.hash = members.password)`,
    e, e,
  );
  return Number(info?.changes) || 0;
}

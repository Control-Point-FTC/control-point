// Account pre-hijacking guard (V5 audit H1). A password signup creates the
// member row before the email is proven, so someone could register a
// victim's address with a password of their own. When the victim later
// signs in with Google, Discord or GitHub, OAuth links that row and marks
// the email verified — and the stranger's password would start working.
//
// So the first time an OAuth provider proves an email, passwords set on its
// rows while the address was still unproven are dropped. The real owner can
// set one through the emailed reset code; nobody else ever could.

export interface OAuthLinkDeps {
  isEmailVerified: (email: string) => Promise<boolean>;
  dbRun: (sql: string, ...args: any[]) => Promise<any>;
}

/** Call before marking the email verified. Returns how many passwords were dropped. */
export async function forgetUnprovenPasswords(email: string, deps: OAuthLinkDeps): Promise<number> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return 0;
  if (await deps.isEmailVerified(normalized)) return 0;
  const info = await deps.dbRun(
    "UPDATE members SET password = NULL WHERE LOWER(email) = ? AND password IS NOT NULL",
    normalized,
  );
  return Number(info?.changes) || 0;
}

// Password rules for new passwords (signup, reset, change). Shared by the
// forms (shown as a live checklist) and the server (enforced). Existing
// passwords keep working: the rules apply only when one is set.

export const PASSWORD_MIN = 8;
/** bcrypt only reads the first 72 bytes; longer would be silently cut. */
export const PASSWORD_MAX = 72;

export interface PasswordRule { label: string; ok: boolean }

export function passwordRules(pw: string): PasswordRule[] {
  return [
    { label: `At least ${PASSWORD_MIN} characters`, ok: pw.length >= PASSWORD_MIN },
    { label: 'A letter', ok: /\p{L}/u.test(pw) },
    { label: 'A number or symbol', ok: /[^\p{L}\s]/u.test(pw) },
  ];
}

/** Why a new password isn't allowed, or null when it is. */
export function passwordProblem(pw: unknown): string | null {
  const s = typeof pw === 'string' ? pw : '';
  if (new TextEncoder().encode(s).length > PASSWORD_MAX) return `Passwords can be at most ${PASSWORD_MAX} characters.`;
  const missing = passwordRules(s).filter((r) => !r.ok);
  if (!missing.length) return null;
  return `Password needs: ${missing.map((r) => r.label.toLowerCase()).join(', ')}.`;
}

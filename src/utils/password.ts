// Password rules for new passwords (signup, reset, change). Shared by the
// forms (shown as a live checklist) and the server (enforced). Existing
// passwords keep working: the rules apply only when one is set.

export const PASSWORD_MIN = 8;
/** bcrypt only reads the first 72 bytes; longer would be silently cut. */
export const PASSWORD_MAX = 72;

export interface PasswordRule { label: string; ok: boolean }

const bytes = (s: string) => new TextEncoder().encode(s).length;
/** Shown only once it's broken (it rarely matters): bcrypt's 72-byte limit. */
export const TOO_LONG_LABEL = 'Not too long (up to 72 bytes; accented letters and emoji count as 2–4)';

export function passwordRules(pw: string): PasswordRule[] {
  const rules = [
    { label: `At least ${PASSWORD_MIN} characters`, ok: pw.length >= PASSWORD_MIN },
    { label: 'A letter', ok: /\p{L}/u.test(pw) },
    { label: 'A number or symbol', ok: /[^\p{L}\s]/u.test(pw) },
  ];
  if (bytes(pw) > PASSWORD_MAX) rules.push({ label: TOO_LONG_LABEL, ok: false });
  return rules;
}

/** Why a new password isn't allowed, or null when it is. */
export function passwordProblem(pw: unknown): string | null {
  const s = typeof pw === 'string' ? pw : '';
  if (bytes(s) > PASSWORD_MAX) return `That password is too long: up to ${PASSWORD_MAX} bytes (accented letters and emoji count as 2–4 each).`;
  const missing = passwordRules(s).filter((r) => !r.ok);
  if (!missing.length) return null;
  return `Password needs: ${missing.map((r) => r.label.toLowerCase()).join(', ')}.`;
}

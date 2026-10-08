import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';

// Point the db layer at a scratch file BEFORE email-verify (and db.js) load.
const scratchDb = join(tmpdir(), `verify-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${scratchDb}`;

const mod = await import('../email-verify.js');
const { dbRun, dbExec } = await import('../db.js');

const {
  generateCode,
  hashCode,
  isEmailVerified,
  markEmailVerified,
  issueVerificationCode,
  checkVerificationCode,
  sendVerificationEmail,
  VERIFY_MAX_ATTEMPTS,
} = mod;

const DDL = `
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
);`;

function extractCodeFromSubject(fetchMock: any): string {
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  const m = /(\d{6})/.exec(body.subject);
  if (!m) throw new Error('no code in subject: ' + body.subject);
  return m[1];
}

beforeEach(async () => {
  await dbExec(DDL);
  await dbRun('DELETE FROM email_verification_codes');
  await dbRun('DELETE FROM verified_emails');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Test <test@example.com>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  // NOTE: don't delete the scratch DB file — the libsql client opened at
  // import time still holds it. Rows are cleared in beforeEach instead.
});

describe('email verification codes', () => {
  it('generates 6-digit numeric codes and stable sha256 hashes', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(code)).toBe(hashCode(code));
    expect(hashCode('000001')).not.toBe(hashCode('000002'));
  });

  it('issues a code by email and the emailed code verifies', async () => {
    const result = await issueVerificationCode('newbie@example.com');
    expect(result).toEqual({ sent: true });

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse((init as any).body);
    expect(body.to).toEqual(['newbie@example.com']);

    const code = extractCodeFromSubject(fetchMock);
    const check = await checkVerificationCode('newbie@example.com', code);
    expect(check).toEqual({ ok: true });
  });

  it('rejects wrong codes and locks out after max attempts', async () => {
    await issueVerificationCode('locked@example.com');
    const code = extractCodeFromSubject(vi.mocked(globalThis.fetch));
    const wrong = code === '000000' ? '000001' : '000000';

    for (let i = 0; i < VERIFY_MAX_ATTEMPTS - 1; i++) {
      const r = await checkVerificationCode('locked@example.com', wrong);
      expect(r).toEqual({ ok: false, reason: 'invalid' });
    }
    // The max-th wrong guess locks the code.
    const locked = await checkVerificationCode('locked@example.com', wrong);
    expect(locked).toEqual({ ok: false, reason: 'locked' });
    // Even the right code no longer works once locked.
    const after = await checkVerificationCode('locked@example.com', code);
    expect(after.ok).toBe(false);
  });

  it('rejects expired codes', async () => {
    const code = '424242';
    const pastIso = new Date(Date.now() - 60 * 1000).toISOString();
    await dbRun(
      'INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)',
      'old@example.com',
      hashCode(code),
      pastIso
    );
    const r = await checkVerificationCode('old@example.com', code);
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('enforces a resend cooldown', async () => {
    const first = await issueVerificationCode('eager@example.com');
    expect(first).toEqual({ sent: true });
    const second = await issueVerificationCode('eager@example.com');
    expect(second.sent).toBe(false);
    if (second.sent === false) {
      expect(second.cooldownSeconds).toBeGreaterThan(0);
      expect(second.cooldownSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('marks an email verified and consumes outstanding codes', async () => {
    await issueVerificationCode('done@example.com');
    expect(await isEmailVerified('done@example.com')).toBe(false);
    await markEmailVerified('done@example.com');
    expect(await isEmailVerified('done@example.com')).toBe(true);
    // Idempotent — marking twice is fine.
    await markEmailVerified('done@example.com');
    expect(await isEmailVerified('done@example.com')).toBe(true);
    // Outstanding codes are gone.
    const r = await checkVerificationCode('done@example.com', '000000');
    expect(r.ok).toBe(false);
  });

  it('throws a useful error when the email provider rejects the send', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'bad key' } as any);
    await expect(sendVerificationEmail('x@example.com', '123456')).rejects.toThrow(/401/);
  });

  it('a code that failed to send does not hold the resend cooldown (V3-H1)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'provider down' } as any);
    await expect(issueVerificationCode('late@example.com')).rejects.toThrow(/500/);
    // Nothing was stored for the failed send, so an immediate resend goes out.
    expect(await issueVerificationCode('late@example.com')).toEqual({ sent: true });
  });

  it('reports send health for the owner console', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'domain not verified' } as any);
    await expect(sendVerificationEmail('x@example.com', '123456')).rejects.toThrow();
    let h = mod.getEmailHealth();
    expect(h.configured).toBe(true);
    expect(h.lastError).toMatch(/403.*domain not verified/);
    await sendVerificationEmail('x@example.com', '123456');
    h = mod.getEmailHealth();
    expect(h.lastOkAt && h.lastErrorAt && h.lastOkAt >= h.lastErrorAt).toBe(true);
  });

  it('records a provider that cannot be reached at all', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.resend.com'));
    await expect(sendVerificationEmail('x@example.com', '123456')).rejects.toThrow(/ENOTFOUND/);
    expect(mod.getEmailHealth().lastError).toMatch(/Could not reach the email provider.*ENOTFOUND/);
  });
});

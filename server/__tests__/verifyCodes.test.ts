// Guess limiting for email codes (signup verification + password reset).
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point db.ts at a throwaway database BEFORE it's imported.
const dir = mkdtempSync(path.join(tmpdir(), "cp-verify-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

let ev: typeof import("../../email-verify");
let db: typeof import("../../db");

beforeAll(async () => {
  db = await import("../../db");
  ev = await import("../../email-verify");
  await db.dbExec(`CREATE TABLE IF NOT EXISTS email_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`);
});

async function seed(email: string, code: string) {
  await db.dbRun("DELETE FROM email_verification_codes WHERE email = ?", email);
  await db.dbRun(
    "INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)",
    email, ev.hashCode(code), new Date(Date.now() + 10 * 60_000).toISOString(), new Date().toISOString(),
  );
}

describe("verification code guess limit", () => {
  it("never compares more than VERIFY_MAX_ATTEMPTS guesses, even when they overlap", async () => {
    await seed("a@example.test", "123456");
    // 20 simultaneous guesses, one of them correct and sent last.
    const guesses = Array.from({ length: 19 }, (_, i) => String(100000 + i)).concat("123456");
    const results = await Promise.all(guesses.map((g) => ev.consumeVerificationCode("a@example.test", g)));
    const accepted = results.filter((r) => r.ok).length;
    const counted = results.filter((r) => r.ok === true || r.reason !== "locked").length;
    // Only the first 5 reserved attempts are ever compared; the rest are locked out.
    expect(counted).toBeLessThanOrEqual(ev.VERIFY_MAX_ATTEMPTS);
    expect(accepted).toBeLessThanOrEqual(1);
  });

  it("accepts a correct code within the limit and consumes it once", async () => {
    await seed("b@example.test", "654321");
    expect((await ev.consumeVerificationCode("b@example.test", "000000")).ok).toBe(false);
    const [r1, r2] = await Promise.all([
      ev.consumeVerificationCode("b@example.test", "654321"),
      ev.consumeVerificationCode("b@example.test", "654321"),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBe(1);
  });

  it("locks after the 5th wrong guess", async () => {
    await seed("c@example.test", "111111");
    const reasons: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await ev.checkVerificationCode("c@example.test", "999999");
      reasons.push(r.ok === false ? r.reason : "ok");
    }
    expect(reasons).toEqual(["invalid", "invalid", "invalid", "invalid", "locked"]);
    expect((await ev.checkVerificationCode("c@example.test", "111111")).ok).toBe(false);
  });
});

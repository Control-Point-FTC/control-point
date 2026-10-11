/**
 * V5 audit H1 — account pre-hijacking. A stranger signs up with the
 * victim's email and a password of their own. The victim later proves the
 * email through Google/Discord/GitHub (OAuth marks it verified). The
 * stranger's password must never open the account — whatever the timing.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { startTestServer, type TestServer } from "./helpers/testServer";
import { dropUnprovenPasswords, proveHash, type ProvenDeps } from "../provenPasswords";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let deps: ProvenDeps;
beforeAll(async () => {
  t = await startTestServer("cp-prehijack-");
  deps = {
    dbRun: async (sql, ...args) => ({ changes: (await t.db.execute({ sql, args })).rowsAffected }),
    dbGet: async (sql, ...args) => (await t.db.execute({ sql, args })).rows[0],
  };
}, 120_000);
afterAll(async () => { await t?.stop(); });

const verify = (email: string) => t.db.execute({ sql: "INSERT OR IGNORE INTO verified_emails (email, verified_at) VALUES (?, ?)", args: [email, new Date().toISOString()] });
const seedCode = (email: string, code: string) => t.db.execute({
  sql: "INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)",
  args: [email, createHash("sha256").update(code, "utf8").digest("hex"), new Date(Date.now() + 600_000).toISOString(), new Date().toISOString()],
});
const passwords = async (email: string) => (await t.db.execute({ sql: "SELECT password FROM members WHERE LOWER(email) = ?", args: [email] })).rows.map((r: any) => r.password);
/** Login with the raw response, so the session cookie can be checked. */
const login = async (email: string, password: string) => {
  const res = await fetch(`${t.base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-cp-client": "1" }, body: JSON.stringify({ email, password }) });
  return { status: res.status, body: await res.json().catch(() => ({})), cookie: String(res.headers.get("set-cookie") || "") };
};
const signup = (email: string, password: string, teamName: string) => t.post("/api/auth/signup", { accountType: "admin", name: "Someone", email, password, teamName });

describe("a password set before the email was proven", () => {
  it("never opens the account once OAuth proves the email", async () => {
    const victim = "victim1@pre.test";
    const planted = await signup(victim, "Attacker-pass1", "Planted Team");
    expect(planted.body.needsVerification).toBe(true);
    // What OAuth does for the real owner: the email becomes verified.
    await verify(victim);
    const r = await login(victim, "Attacker-pass1");
    expect(r.status).toBe(200);
    expect(r.body.sessionId).toBeUndefined();
    expect(r.body.needsVerification).toBe(true); // the code goes to the owner's inbox
    expect(r.cookie).not.toContain("cp_session=cps_");
    // OAuth then drops it, so the owner gets the usual set-a-password code.
    expect(await dropUnprovenPasswords(victim, deps)).toBe(1);
    expect(await passwords(victim)).toEqual([null]);
  });

  it("a signup already in flight can't use the copied hash after OAuth proved the email", async () => {
    const victim = "victim2@pre.test";
    await signup(victim, "Attacker-pass2", "First Team");
    await verify(victim);
    // The stranger signs up for another team with the planted password: the hash is copied.
    const again = await signup(victim, "Attacker-pass2", "Second Team");
    expect(again.status).toBe(200);
    expect(again.body.sessionId).toBeUndefined();
    expect(again.body.needsVerification).toBe(true);
  });

  it("a password the owner set with a code survives OAuth's cleanup", async () => {
    const owner = "owner3@pre.test";
    await signup(owner, "Attacker-pass3", "Some Team");
    // The owner resets it with the emailed code (proven before it lands on the rows)…
    await seedCode(owner, "135790");
    const reset = await t.post("/api/auth/reset-password", { email: owner, code: "135790", newPassword: "Owners-pass3" });
    expect(reset.status).toBe(200);
    // …and an OAuth login running at the same time drops nothing of theirs.
    expect(await dropUnprovenPasswords(owner, deps)).toBe(0);
    const r = await login(owner, "Owners-pass3");
    expect(r.cookie).toContain("cp_session=cps_");
  });

  it("the normal flow still works: sign up, enter the code, sign in with the password", async () => {
    const me = "normal4@pre.test";
    expect((await signup(me, "My-own-pass4", "My Team")).body.needsVerification).toBe(true);
    await seedCode(me, "112233");
    const v = await t.post("/api/auth/verify-email", { email: me, code: "112233" });
    expect(v.status).toBe(200);
    const r = await login(me, "My-own-pass4");
    expect(r.cookie).toContain("cp_session=cps_");
  });

  it("Resend still sends a code while a password on a verified email awaits proof", async () => {
    const me = "resend6@pre.test";
    await signup(me, "My-own-pass6", "Resend Team");
    await verify(me);
    const r = await t.post("/api/auth/resend-code", { email: me });
    expect(r.body.alreadyVerified).toBeUndefined();
    // Once the password is proven, there's nothing left to send.
    await seedCode(me, "998877");
    expect((await t.post("/api/auth/verify-email", { email: me, code: "998877" })).status).toBe(200);
    expect((await t.post("/api/auth/resend-code", { email: me })).body.alreadyVerified).toBe(true);
  });

  it("a hash proven for one account isn't proven for another", async () => {
    await proveHash("a5@pre.test", "$2b$10$same", deps);
    const row = await deps.dbGet("SELECT 1 AS ok FROM proven_passwords WHERE email = ? AND hash = ?", "b5@pre.test", "$2b$10$same");
    expect(row).toBeUndefined();
  });
});

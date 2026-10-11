/**
 * V5 audit security Lows:
 *  L1 feedback screenshots were readable by any teammate through /api/files/:id;
 *  L3 the email-verify code still worked after it had been used;
 *  L5 any member could delete any saved link;
 *  L7 message images were served without a sandbox policy.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let aId = 0;
let a = "";
let b = "";
beforeAll(async () => {
  t = await startTestServer("cp-seclows-");
  team = await seedTeam(t.db, "Sec Team");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@sec.test", "admin"));
  aId = await seedMember(t.db, team, "Ann", "ann@sec.test");
  a = await t.session(aId);
  b = await t.session(await seedMember(t.db, team, "Ben", "ben@sec.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const fileStatus = async (id: number, session: string) => {
  const res = await fetch(`${t.base}/api/files/${id}`, { headers: { cookie: `cp_session=${encodeURIComponent(session)}` } });
  return res.status;
};

describe("security Lows", () => {
  it("L1: a feedback screenshot opens for its sender, not for teammates", async () => {
    const id = Number((await t.db.execute({
      sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, 'feedback', 'shot.png', 'image/png', 4, ?)",
      args: [team, aId, new Uint8Array([137, 80, 78, 71])],
    })).lastInsertRowid);
    expect(await fileStatus(id, b)).toBe(403);
    expect(await fileStatus(id, a)).toBe(200);
  });

  it("L3: a verify code works once", async () => {
    const email = "once@sec.test";
    await t.post("/api/auth/signup", { accountType: "admin", name: "Once", email, password: "Once-pass-1", teamName: "Once Team" });
    await t.db.execute({ sql: "DELETE FROM email_verification_codes WHERE email = ?", args: [email] });
    await t.db.execute({
      sql: "INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)",
      args: [email, createHash("sha256").update("424242", "utf8").digest("hex"), new Date(Date.now() + 600_000).toISOString(), new Date().toISOString()],
    });
    expect((await t.post("/api/auth/verify-email", { email, code: "424242" })).status).toBe(200);
    expect((await t.post("/api/auth/verify-email", { email, code: "424242" })).status).toBe(400);
  });

  it("L5: only the person who saved a link, or a docs/members manager, can delete it", async () => {
    const id = Number((await t.db.execute({ sql: "INSERT INTO resources (team_id, url, title, category, created_by) VALUES (?, 'https://gm0.org', 'GM0', 'Other', ?)", args: [team, aId] })).lastInsertRowid);
    expect((await t.api(`/api/resources/${id}`, { method: "DELETE", session: b })).status).toBe(403);
    expect((await t.api(`/api/resources/${id}`, { method: "DELETE", session: a })).status).toBe(200);
    const id2 = Number((await t.db.execute({ sql: "INSERT INTO resources (team_id, url, title, category, created_by) VALUES (?, 'https://ftc-docs.firstinspires.org', 'FTC docs', 'Other', ?)", args: [team, aId] })).lastInsertRowid);
    expect((await t.api(`/api/resources/${id2}`, { method: "DELETE", session: admin })).status).toBe(200);
  });

  it("L7: message images can't run as a page", async () => {
    const ch = Number((await t.db.execute({ sql: "INSERT INTO chat_channels (team_id, name) VALUES (?, 'general')", args: [team] })).lastInsertRowid);
    const msg = Number((await t.db.execute({ sql: "INSERT INTO messages (team_id, sender_id, content, timestamp, channel_id) VALUES (?, ?, 'pic', ?, ?)", args: [team, aId, new Date().toISOString(), ch] })).lastInsertRowid);
    const img = Number((await t.db.execute({ sql: "INSERT INTO message_images (message_id, mime_type, data) VALUES (?, 'image/svg+xml', ?)", args: [msg, new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")] })).lastInsertRowid);
    const res = await fetch(`${t.base}/api/message-images/${img}`, { headers: { cookie: `cp_session=${encodeURIComponent(b)}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

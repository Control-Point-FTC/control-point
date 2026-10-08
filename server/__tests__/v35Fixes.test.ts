/**
 * V3.5 critical fixes: required fields are enforced by the API (not just the
 * forms), and unverified email signups stay off the roster (V3-M3).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
beforeAll(async () => {
  t = await startTestServer("cp-v35-");
  team = await seedTeam(t.db, "Robo");
  await t.db.execute({ sql: "UPDATE teams SET access_code = 'JOIN-35' WHERE id = ?", args: [team] });
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@v35.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("required fields (API)", () => {
  it("tasks need a title, on create and on edit", async () => {
    expect((await t.post("/api/tasks", { title: "   " }, admin)).body).toEqual({ error: "Add a title" });
    const ok = await t.post("/api/tasks", { title: "Wire the hub" }, admin);
    expect(ok.status).toBe(200);
    const id = ok.body.id ?? ok.body.task?.id;
    expect((await t.patch(`/api/tasks/${id}`, { title: "" }, admin)).status).toBe(400);
  });

  it("budget entries need a description and a category", async () => {
    const base = { type: "expense", amount: 12, date: "2026-10-01", category: "Parts", description: "Servos" };
    expect((await t.post("/api/budget", { ...base, description: "" }, admin)).body).toEqual({ error: "Add a description" });
    expect((await t.post("/api/budget", { ...base, category: " " }, admin)).body).toEqual({ error: "Add a category" });
    expect((await t.post("/api/budget", base, admin)).status).toBe(200);
  });

  it("outreach needs a title and date; log entries a contact and subject", async () => {
    expect((await t.post("/api/outreach", { title: "Demo" }, admin)).body).toEqual({ error: "Add a date" });
    expect((await t.post("/api/outreach", { title: "Demo", date: "2026-10-02" }, admin)).status).toBe(200);
    expect((await t.post("/api/communications", { recipient: "Sponsor", subject: "" }, admin)).body).toEqual({ error: "Add a subject" });
    const root = await t.post("/api/communications", { recipient: "Sponsor", subject: "Thanks", body: "" }, admin);
    expect(root.status).toBe(200);
    expect((await t.post("/api/communications", { parent_id: root.body.id, body: "", subject: "" }, admin)).status).toBe(400);
    expect((await t.post("/api/communications", { parent_id: root.body.id, body: "They replied" }, admin)).status).toBe(200);
  });
});

describe("password rules (V3-L4)", () => {
  it("a new password must be 8+ characters with a letter and a number or symbol", async () => {
    for (const password of ["short1", "allletters", "12345678"]) {
      const r = await t.post("/api/auth/signup", { accountType: "student", name: "Weak", email: `weak-${password}@v35.test`, password, accessCode: "JOIN-35" });
      expect(r.status, password).toBe(400);
      expect(r.body.error).toMatch(/^Password needs:/);
    }
    const ok = await t.post("/api/auth/signup", { accountType: "student", name: "Strong", email: "strong@v35.test", password: "goodpass-1", accessCode: "JOIN-35" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const change = await t.post("/api/auth/change-password", { currentPassword: "x", newPassword: "short" }, admin);
    expect(change.status).toBe(400);
    expect(change.body.error).toMatch(/^Password needs:/);
  });
});

describe("public team-number lookup (V3-L2)", () => {
  it("is rate limited per IP, so it can't list every team's workspace", async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await t.api("/api/ftc/lookup-public?number=x")).status;
    expect(last).toBe(429);
  });
});

describe("sign out of other devices", () => {
  it("ends every other session of the account, in every workspace, and keeps this one", async () => {
    const other = await seedTeam(t.db, "Second");
    const id1 = await seedMember(t.db, team, "Sam", "sam@v35.test");
    const id2 = await seedMember(t.db, other, "Sam", "sam@v35.test");
    const here = await t.session(id1);
    const laptop = await t.session(id1);
    const phone = await t.session(id2);
    const bystander = await t.session(await seedMember(t.db, team, "Bea", "bea@v35.test"));
    const r = await t.post("/api/auth/sign-out-others", {}, here);
    expect(r.status).toBe(200);
    expect(r.body.removed).toBe(2);
    const me = (s: string) => t.api("/api/auth/me", { session: s }).then((x) => x.status);
    expect(await me(here)).toBe(200);
    expect(await me(laptop)).toBe(401);
    expect(await me(phone)).toBe(401);
    expect(await me(bystander)).toBe(200);
    expect((await t.post("/api/auth/sign-out-others", {})).status).toBe(401);
  });

  it("closes the other devices' live connections, so they can't keep chatting", async () => {
    const id = await seedMember(t.db, team, "Kim", "kim@v35.test");
    const here = await t.session(id);
    const other = await t.session(id);
    const socket = async (session: string) => {
      const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
      const closed = new Promise<number>((res) => ws.once("close", (code) => res(code)));
      await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
      ws.send(JSON.stringify({ type: "hello", sessionId: session }));
      return { ws, closed };
    };
    const mine = await socket(here);
    const theirs = await socket(other);
    await new Promise((r) => setTimeout(r, 400));
    expect((await t.post("/api/auth/sign-out-others", {}, here)).status).toBe(200);
    expect(await theirs.closed).toBe(4001);
    // A message sent on the closed socket can't land; this device stays connected.
    expect(mine.ws.readyState).toBe(WebSocket.OPEN);
    mine.ws.send(JSON.stringify({ type: "chat", content: "still here" }));
    await new Promise((r) => setTimeout(r, 400));
    const rows = (await t.db.execute({ sql: "SELECT content FROM messages WHERE sender_id = ?", args: [id] })).rows.map((r: any) => r.content);
    expect(rows).toEqual(["still here"]);
    mine.ws.close();
  });
});

describe("workspace time zone", () => {
  it("admins can set and clear it; a made-up zone is refused", async () => {
    const set = (timezone: unknown) => t.patch(`/api/teams/${team}`, { timezone }, admin);
    expect((await set("America/Chicago")).status).toBe(200);
    expect((await t.db.execute({ sql: "SELECT timezone FROM teams WHERE id = ?", args: [team] })).rows[0].timezone).toBe("America/Chicago");
    expect((await set("Mars/Olympus")).status).toBe(400);
    expect((await set(null)).status).toBe(200);
    expect((await t.db.execute({ sql: "SELECT timezone FROM teams WHERE id = ?", args: [team] })).rows[0].timezone).toBeNull();
  });
});

describe("unverified signups (V3-M3)", () => {
  it("stay off the roster until they verify their email", async () => {
    const r = await t.post("/api/auth/signup", {
      accountType: "student", name: "Pending Pat", email: "pat@v35.test", password: "longenough123", accessCode: "JOIN-35",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.needsVerification).toBe(true);
    const names = async () => ((await t.api("/api/members", { session: admin })).body as any[]).map((m) => m.name);
    expect(await names()).not.toContain("Pending Pat");
    await t.db.execute({ sql: "INSERT INTO verified_emails (email, verified_at) VALUES ('pat@v35.test', ?)", args: [new Date().toISOString()] });
    expect(await names()).toContain("Pending Pat");
  });

  it("members added by an admin (no password) are still listed", async () => {
    await seedMember(t.db, team, "Roster Rae", "rae@v35.test");
    const names = ((await t.api("/api/members", { session: admin })).body as any[]).map((m) => m.name);
    expect(names).toContain("Roster Rae");
  });
});

describe("migration 104", () => {
  it("cleans doubled dollar signs and a dangling 'for' in old budget notifications", async () => {
    // The migration already ran at boot; re-run its statements on rows written now.
    const sql = (await import("node:fs")).readFileSync("migrations/versions/104-clean-legacy-budget-notifications.sql", "utf8");
    await t.db.execute({ sql: "INSERT INTO notifications (user_id, content, type, timestamp) VALUES (NULL, 'New budget expense: $$12314324 for', 'system', ?)", args: [new Date().toISOString()] });
    await t.db.execute({ sql: "INSERT INTO notifications (user_id, content, type, timestamp) VALUES (NULL, 'Pay $$ for pizza', 'system', ?)", args: [new Date().toISOString()] });
    await t.db.executeMultiple(sql);
    const rows = (await t.db.execute("SELECT content FROM notifications WHERE user_id IS NULL ORDER BY id")).rows.map((r: any) => r.content);
    expect(rows).toEqual(["New budget expense: $12314324", "Pay $$ for pizza"]);
  });
});

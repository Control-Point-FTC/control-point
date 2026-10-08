// Owner overview: crash count for the attention strip and each workspace's
// last message; the owner deleting a workspace. Owner only.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let owner = "";
let admin = "";
let busy = 0;
let quiet = 0;
beforeAll(async () => {
  t = await startTestServer("cp-owner-overview-", { OWNER_EMAILS: "owner@ov.test" });
  busy = await seedTeam(t.db, "Busy");
  quiet = await seedTeam(t.db, "Quiet");
  const ownerId = await seedMember(t.db, busy, "Sushil", "owner@ov.test", "admin");
  owner = await t.session(ownerId);
  admin = await t.session(await seedMember(t.db, busy, "Ada", "ada@ov.test", "admin"));
  for (const ts of ["2026-10-01T10:00:00.000Z", "2026-10-07T18:30:00.000Z"]) {
    await t.db.execute({ sql: "INSERT INTO messages (sender_id, content, timestamp, team_id) VALUES (?, 'hi', ?, ?)", args: [ownerId, ts, busy] });
  }
  await t.db.execute("INSERT INTO client_errors (kind, message, created_at) VALUES ('render', 'old', datetime('now', '-9 days'))");
  for (let i = 0; i < 3; i++) await t.db.execute("INSERT INTO client_errors (kind, message) VALUES ('render', 'boom')");
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("owner overview", () => {
  it("counts this week's crashes and shows each workspace's last message", async () => {
    const r = await t.api("/api/owner/overview", { session: owner });
    expect(r.status).toBe(200);
    expect(r.body.totals.crashes_7d).toBe(3);
    const byId = Object.fromEntries(r.body.teams.map((w: any) => [w.id, w]));
    expect(byId[busy]).toMatchObject({ message_count: 2, last_message_at: "2026-10-07T18:30:00.000Z" });
    expect(byId[quiet].last_message_at).toBeNull();
  });

  it("is owner only", async () => {
    expect((await t.api("/api/owner/overview", { session: admin })).status).toBe(403);
  });

  it("the owner deletes a workspace, with its name typed back", async () => {
    const doomed = await seedTeam(t.db, "Spam Team");
    const m = await seedMember(t.db, doomed, "Spammer", "spam@ov.test");
    const spam = await t.session(m);
    await t.db.execute({ sql: "INSERT INTO tasks (team_id, title) VALUES (?, 'x')", args: [doomed] });
    const del = (body: any, session = owner) => t.api(`/api/owner/teams/${doomed}`, { method: "DELETE", body: JSON.stringify(body), session });
    expect((await del({ confirm: "Spam Team" }, admin)).status).toBe(403);
    expect((await del({ confirm: "spam team" })).status).toBe(400);
    const r = await del({ confirm: "Spam Team" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.deleted).toMatchObject({ name: "Spam Team", members: 1 });
    const count = async (sql: string) => Number(((await t.db.execute({ sql, args: [doomed] })).rows[0] as any).n);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE id = ?")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM members WHERE team_id = ?")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM tasks WHERE team_id = ?")).toBe(0);
    expect((await t.api("/api/auth/me", { session: spam })).status).toBe(401);
    expect((await del({ confirm: "Spam Team" })).status).toBe(404);
  });

  it("won't delete the workspace the owner is signed in to", async () => {
    const r = await t.api(`/api/owner/teams/${busy}`, { method: "DELETE", body: JSON.stringify({ confirm: "Busy" }), session: owner });
    expect(r.status).toBe(400);
  });
});

// Owner overview: crash count for the attention strip and each workspace's
// last message, owner only.
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
});

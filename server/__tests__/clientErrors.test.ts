// Browser crash reports: stored (bounded, no query strings), readable by the
// app owner only.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let member = "";

beforeAll(async () => {
  t = await startTestServer("cp-clienterr-");
  const team = await seedTeam(t.db, "Crash Team");
  member = await t.session(await seedMember(t.db, team, "M", "m@test.local"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("client error reports", () => {
  it("accepts a report (signed in or not), trims it and drops the query string", async () => {
    const r = await t.post("/api/client-errors", {
      kind: "render", message: "x".repeat(2000), stack: "at Foo", route: "/tasks?secret=abc",
    }, member);
    expect(r.status).toBe(204);
    const anon = await t.post("/api/client-errors", { kind: "bogus-kind", message: "pre-login crash" });
    expect(anon.status).toBe(204);
    const owner = await t.api("/api/owner/client-errors", { session: member });
    expect(owner.status).toBe(403);
  });

  it("is stored bounded and without the query string", async () => {
    await new Promise((r) => setTimeout(r, 300));
    const rows = (await t.db.execute("SELECT kind, message, route, member_id FROM client_errors ORDER BY id")).rows as any[];
    expect(rows.length).toBe(2);
    expect(rows[0].message.length).toBe(500);
    expect(rows[0].route).toBe("/tasks");
    expect(rows[0].member_id).not.toBeNull();
    expect(rows[1].kind).toBe("uncaught"); // unknown kinds are normalised
    expect(rows[1].member_id).toBeNull();
  });

  it("is rate-limited per address (silently)", async () => {
    for (let i = 0; i < 35; i++) await t.post("/api/client-errors", { kind: "uncaught", message: `spam ${i}` });
    await new Promise((r) => setTimeout(r, 300));
    const n = Number(((await t.db.execute("SELECT COUNT(*) AS n FROM client_errors")).rows[0] as any).n);
    expect(n).toBeLessThanOrEqual(30);
  });
});

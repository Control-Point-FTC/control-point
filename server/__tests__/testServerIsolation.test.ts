/**
 * The test harness: every suite's server is its own. Servers bind a port the
 * system picks when they listen (PORT=0) and report it, so two suites booting
 * at once can't end up talking to one server; and session tokens are unique
 * per server, so a request that reached the wrong server fails to sign in
 * instead of silently writing to another suite's database. (Before, a port
 * picked and released by the harness could be taken by another suite's
 * server; the pit display test then saw its Bruno change return 200 while its
 * own database never changed.)
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 60_000 });

const servers: TestServer[] = [];
afterAll(async () => { await Promise.all(servers.map((s) => s.stop())); });

describe("test servers", () => {
  it("booted together, each answers from its own database", async () => {
    servers.push(...await Promise.all([startTestServer("cp-iso-a-"), startTestServer("cp-iso-b-")]));
    const [a, b] = servers;
    expect(a.port).not.toBe(b.port);
    expect(a.port).toBeGreaterThan(0);
    const sessions = await Promise.all(servers.map(async (s, i) => {
      const team = await seedTeam(s.db, `Team ${i}`);
      // Same member id on both servers: tokens must still differ.
      return s.session(await seedMember(s.db, team, "Ada", `ada${i}@iso.test`, "admin"));
    }));
    expect(sessions[0]).not.toBe(sessions[1]);
    // A change through server A lands in A's database only.
    expect((await a.post("/api/events", { title: "Only on A", date: "2026-11-01" }, sessions[0])).status).toBe(200);
    const count = async (s: TestServer) => Number(((await s.db.execute("SELECT COUNT(*) AS n FROM events WHERE title = 'Only on A'")).rows[0] as any).n);
    expect(await count(a)).toBe(1);
    expect(await count(b)).toBe(0);
    // Each server knows only its own session.
    expect((await a.api("/api/auth/me", { session: sessions[0] })).status).toBe(200);
    expect((await b.api("/api/auth/me", { session: sessions[0] })).status).toBe(401);
  });
});

/**
 * Feature parity, Phase 2.4: importing official FIRST competitions into the
 * calendar. The plan is pure (no network); the route's guards are checked on
 * a real server without reaching FIRST.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { planFirstImport } from "../firstImport";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

describe("planFirstImport", () => {
  it("adds each new event once, with a real date; skips ones imported before (any case)", () => {
    const plan = planFirstImport([
      { code: "USNJCMP", name: "NJ Championship", date: "2027-03-06T00:00:00", type: "Championship" },
      { code: "usnjscr", name: "Fall Scrimmage", date: "2026-11-01", type: "Scrimmage" },
      { code: "USNJQ1", name: "Qualifier 1", date: "2026-12-05" },
      { code: "USNJQ1", name: "Qualifier 1 (dup)", date: "2026-12-05" },
      { code: "NODATE", name: "No date" },
      { code: "", name: "No code", date: "2026-12-06" },
    ], ["usnjq1"]);
    expect(plan).toEqual([
      { code: "USNJCMP", title: "NJ Championship", date: "2027-03-06", event_type: "competition" },
      { code: "usnjscr", title: "Fall Scrimmage", date: "2026-11-01", event_type: "scrimmage" },
    ]);
  });
});

let t: TestServer;
let team = 0;
let admin = "", member = "";
beforeAll(async () => {
  t = await startTestServer("cp-first-import-");
  team = await seedTeam(t.db, "Robo");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@fi.test", "admin"));
  member = await t.session(await seedMember(t.db, team, "Ana", "ana@fi.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("POST /api/events/import-first", () => {
  it("needs calendar access and a team number", async () => {
    expect((await t.post("/api/events/import-first", {}, member)).status).toBe(403);
    await t.db.execute({ sql: "UPDATE teams SET ftc_team_number = NULL WHERE id = ?", args: [team] });
    const r = await t.post("/api/events/import-first", {}, admin);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/FTC team number/);
  });
  it("one event per code per team (the unique index backs the skip)", async () => {
    await t.db.execute({ sql: "INSERT INTO events (title, date, team_id, first_event_code) VALUES ('Q1', '2026-12-05', ?, 'USNJQ1')", args: [team] });
    await expect(t.db.execute({ sql: "INSERT INTO events (title, date, team_id, first_event_code) VALUES ('Q1 again', '2026-12-05', ?, 'USNJQ1')", args: [team] })).rejects.toThrow();
  });
});

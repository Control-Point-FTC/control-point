/**
 * Bruno adds lines to the CAD Parts List through a confirmed card (same rules
 * as the Parts List page), and reads the list with a "parts" lookup.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer;
let team = 0, ana = "", anaId = 0;
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];

beforeAll(async () => {
  t = await startTestServer("cp-bruno-parts-");
  team = await seedTeam(t.db, "Robo");
  anaId = await seedMember(t.db, team, "Ana", "ana@parts.test");
  ana = await t.session(anaId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("Bruno and the CAD parts list", () => {
  it("a confirmed parts card adds the lines as the member", async () => {
    const link = "https://www.gobilda.com/3614-series-rhino-wheel-14mm-bore-72mm-diameter-30a-durometer/";
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "part", items: [
      { name: "goBILDA 3614 Rhino Wheel 72mm", section: "drivetrain", quantity: 4, source: "gobilda", unit_cost: 12.99, notes: link },
    ] }] }, ana);
    expect(r.status).toBe(200);
    expect(r.body.applied.part).toBe(1);
    const [p] = await rows("SELECT * FROM cad_parts WHERE team_id = ?", team);
    expect(p).toMatchObject({ name: "goBILDA 3614 Rhino Wheel 72mm", section: "Drivetrain", quantity: 4, source: "gobilda", status: "to_order", notes: link, created_by: anaId });
    expect(Number(p.unit_cost)).toBeCloseTo(12.99);
  });
  it("a line without a name saves nothing from the card", async () => {
    const before = (await rows("SELECT COUNT(*) AS n FROM cad_parts WHERE team_id = ?", team))[0].n;
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "part", items: [{ name: "Servo" }, { name: "" }] }] }, ana);
    expect(r.status).toBe(400);
    expect((await rows("SELECT COUNT(*) AS n FROM cad_parts WHERE team_id = ?", team))[0].n).toBe(before);
  });
  it("the parts lookup lists lines with quantity, section, status and cost", async () => {
    const out = await runLookups(((sql: string, ...a: any[]) => rows(sql, ...a)) as any, team, "UTC", [{ kind: "parts" } as any]);
    expect(out).toMatch(/4× goBILDA 3614 Rhino Wheel 72mm \[Drivetrain\] gobilda, to order, \$12\.99 each/);
    expect(out).toMatch(/Listed cost of these lines: \$51\.96/);
  });
});

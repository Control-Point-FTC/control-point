/**
 * Audit M-2: the workspace access code is masked by default. The team list
 * never carries it; people who manage the workspace reveal it on demand, and
 * every reveal and regeneration is logged.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let member = "";

beforeAll(async () => {
  t = await startTestServer("cp-code-");
  team = await seedTeam(t.db, "Robo");
  await t.db.execute({ sql: "UPDATE teams SET access_code = 'JOIN-42' WHERE id = ?", args: [team] });
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@c.test", "admin"));
  member = await t.session(await seedMember(t.db, team, "Grace", "grace@c.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("access code (M-2)", () => {
  it("the team list never carries it, not even for admins", async () => {
    for (const s of [admin, member]) {
      const r = await t.api("/api/teams", { session: s });
      expect(r.status).toBe(200);
      expect(r.body.find((x: any) => x.id === team)).not.toHaveProperty("access_code");
    }
  });

  it("admins reveal it (logged); members can't", async () => {
    const r = await t.post(`/api/teams/${team}/access-code/reveal`, {}, admin);
    expect(r.status).toBe(200);
    expect(r.body.access_code).toBe("JOIN-42");
    expect((await t.post(`/api/teams/${team}/access-code/reveal`, {}, member)).status).toBe(403);
    expect((await t.api(`/api/teams/${team}/access-code/events`, { session: member })).status).toBe(403);
  });

  it("logs reveals and regenerations with who did them", async () => {
    const regen = await t.post("/api/teams/regenerate-code", {}, admin);
    expect(regen.status).toBe(200);
    const ev = await t.api(`/api/teams/${team}/access-code/events`, { session: admin });
    expect(ev.status).toBe(200);
    expect(ev.body.slice(0, 2)).toEqual([
      expect.objectContaining({ action: "regenerate", member_name: "Ada" }),
      expect.objectContaining({ action: "view", member_name: "Ada" }),
    ]);
  });
});

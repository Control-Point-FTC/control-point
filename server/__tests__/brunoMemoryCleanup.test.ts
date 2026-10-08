/**
 * Bruno's personal facts go with the person: deleting a member (owner
 * console) or an account removes their facts and morning-summary records;
 * team facts stay with the team.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let owner = "";
let team = 0;
beforeAll(async () => {
  t = await startTestServer("cp-bruno-mem-clean-", { OWNER_EMAILS: "owner@memclean.test" });
  team = await seedTeam(t.db, "Robo");
  owner = await t.session(await seedMember(t.db, team, "Sushil", "owner@memclean.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const facts = async (memberId: number) => (await t.db.execute({ sql: "SELECT scope FROM bruno_memories WHERE member_id = ? OR (scope = 'team' AND created_by = ?)", args: [memberId, memberId] })).rows.map((r: any) => r.scope).sort();

describe("memory cleanup", () => {
  it("owner deleting a member removes their personal facts, not the team's", async () => {
    const id = await seedMember(t.db, team, "Arnav", "arnav@memclean.test");
    const s = await t.session(id);
    expect((await t.post("/api/bruno/memories", { content: "Prefers Java" }, s)).status).toBe(200);
    await t.db.execute({ sql: "INSERT INTO bruno_memories (team_id, member_id, scope, content, created_by, created_at) VALUES (?, NULL, 'team', 'We run mecanum', ?, ?)", args: [team, id, new Date().toISOString()] });
    await t.db.execute({ sql: "INSERT INTO bruno_nudges_sent (member_id, day) VALUES (?, '2026-10-08')", args: [id] });
    expect(await facts(id)).toEqual(["team", "user"]);
    expect((await t.api(`/api/owner/users/${id}`, { method: "DELETE", session: owner })).status).toBe(200);
    expect(await facts(id)).toEqual(["team"]);
    expect((await t.db.execute({ sql: "SELECT 1 FROM bruno_nudges_sent WHERE member_id = ?", args: [id] })).rows).toHaveLength(0);
  });

  it("deleting an account (no teams left) removes its personal facts", async () => {
    const id = await seedMember(t.db, team, "Lin", "lin@memclean.test");
    const s = await t.session(id);
    expect((await t.post("/api/bruno/memories", { content: "Drives the robot" }, s)).status).toBe(200);
    // Left every team: the membership is inactive, the account remains.
    await t.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [id] });
    const r = await t.api("/api/auth/account", { method: "DELETE", session: s });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await facts(id)).toEqual([]);
  });
});

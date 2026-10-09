/**
 * V3.5: workspace delete and leave. A workspace full of real data (QR
 * check-in sessions, CAD docs and reviews, call moderation history) must
 * delete cleanly: rows that point at members without ON DELETE CASCADE used
 * to make the foreign key refuse the whole batch, so the delete never worked.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
afterAll(async () => { await t?.stop(); });
beforeAll(async () => { t = await startTestServer("cp-ws-"); }, 120_000);

const now = new Date().toISOString();
async function fillWorkspace(team: number, adminId: number, memberId: number) {
  const run = (sql: string, args: any[]) => t.db.execute({ sql, args });
  await run("INSERT INTO checkin_sessions (team_id, token, code, created_by, expires_at) VALUES (?, ?, ?, ?, ?)", [team, `tok-${team}`, "123456", memberId, now]);
  await run("INSERT INTO cad_docs (team_id, name, url, created_by, created_at) VALUES (?, 'Drivetrain', 'https://cad.onshape.com/x', ?, ?)", [team, memberId, now]);
  const review = await run("INSERT INTO cad_reviews (team_id, title, created_by, created_at, updated_at) VALUES (?, 'Intake v2', ?, ?, ?)", [team, memberId, now, now]);
  await run("INSERT INTO cad_review_comments (review_id, team_id, author_id, comment, created_at) VALUES (?, ?, ?, 'Looks good', ?)", [Number(review.lastInsertRowid), team, memberId, now]);
  await run("INSERT INTO cad_snapshots (team_id, title, file_url, file_name, file_type, created_by, created_at) VALUES (?, 'v1', '/f', 'a.step', 'step', ?, ?)", [team, memberId, now]);
  await run("INSERT INTO cad_parts (team_id, name, created_by, created_at, updated_at) VALUES (?, 'Servo', ?, ?, ?)", [team, memberId, now, now]);
  await run("INSERT INTO call_moderation_log (team_id, actor_id, target_id, action) VALUES (?, ?, ?, 'mute')", [team, adminId, memberId]);
}

describe("delete a workspace", () => {
  it("works with check-in sessions, CAD and call history, and removes the data", async () => {
    const keep = await seedTeam(t.db, "Keep");
    const doomed = await seedTeam(t.db, "Doomed");
    const adminKeep = await seedMember(t.db, keep, "Ada", "ada@ws.test", "admin");
    const adminDoomed = await seedMember(t.db, doomed, "Ada", "ada@ws.test", "admin");
    const member = await seedMember(t.db, doomed, "Grace", "grace@ws.test");
    await fillWorkspace(doomed, adminDoomed, member);
    for(const [team,owner] of [[doomed,adminDoomed],[keep,adminKeep]])await t.db.execute({sql:"INSERT INTO stored_files(team_id,member_id,kind,filename,mime_type,size,data) VALUES(?,?,'notebook','pending.pdf','application/pdf',4,?)",args:[team,owner,new Uint8Array([37,80,68,70])]});
    const s = await t.session(adminDoomed);

    const r = await t.api(`/api/teams/${doomed}`, { method: "DELETE", session: s });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.switched?.team?.id ?? r.body.switched?.user?.team_id).toBe(keep);
    for (const table of ["teams", "checkin_sessions", "cad_docs", "cad_reviews", "cad_parts", "call_moderation_log"]) {
      const col = table === "teams" ? "id" : "team_id";
      const n = (await t.db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`, args: [doomed] })).rows[0] as any;
      expect(Number(n.n), table).toBe(0);
    }
    // The other workspace is untouched.
    expect(Number((await t.db.execute({sql:"SELECT COUNT(*) AS n FROM stored_files WHERE team_id=? AND kind='notebook'",args:[doomed]})).rows[0].n)).toBe(0);
    expect(Number((await t.db.execute({sql:"SELECT COUNT(*) AS n FROM stored_files WHERE team_id=? AND kind='notebook'",args:[keep]})).rows[0].n)).toBe(1);
    expect(((await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM members WHERE id = ? AND is_active = 1", args: [adminKeep] })).rows[0] as any).n).toBe(1);
  });

  it("only someone who manages that workspace can delete it", async () => {
    const team = await seedTeam(t.db, "Guarded");
    await seedMember(t.db, team, "Boss", "boss@ws.test", "admin");
    const s = await t.session(await seedMember(t.db, team, "Kid", "kid@ws.test"));
    expect((await t.api(`/api/teams/${team}`, { method: "DELETE", session: s })).status).toBe(403);
  });
});

describe("leave a workspace", () => {
  it("members can leave; the last admin is asked to hand over first", async () => {
    const team = await seedTeam(t.db, "Leavers");
    const adminId = await seedMember(t.db, team, "Solo", "solo@ws.test", "admin");
    const memberId = await seedMember(t.db, team, "Max", "max@ws.test");
    const m = await t.session(memberId);
    const left = await t.post("/api/teams/leave", { team_id: team }, m);
    expect(left.status).toBe(200);
    expect(left.body.teamless).toBe(true);
    const a = await t.session(adminId);
    const blocked = await t.post("/api/teams/leave", { team_id: team }, a);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/last admin/);
  });
});

// Tasks can be due at a time of day (for second-by-second countdowns).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let admin = "";
beforeAll(async () => {
  t = await startTestServer("cp-duetime-");
  const team = await seedTeam(t.db, "Due Team");
  admin = await t.session(await seedMember(t.db, team, "Admin", "admin@test.local", "admin"));
  await t.api("/api/auth/me", { session: admin });
}, 120_000);
afterAll(async () => { await t?.stop(); });

const row = async (id: number) => (await t.db.execute({ sql: "SELECT due_date, due_time FROM tasks WHERE id = ?", args: [id] })).rows[0] as any;

describe("task due time", () => {
  it("saves a valid time with a date, rejects a bad one", async () => {
    const ok = await t.post("/api/tasks", { title: "Wire the arm", due_date: "2026-10-20", due_time: "15:30" }, admin);
    expect(ok.status).toBe(200);
    expect(await row(ok.body.id)).toMatchObject({ due_date: "2026-10-20", due_time: "15:30" });
    expect((await t.post("/api/tasks", { title: "x", due_date: "2026-10-20", due_time: "25:99" }, admin)).status).toBe(400);
  });

  it("a time without a date is ignored; clearing the date clears the time", async () => {
    const r = await t.post("/api/tasks", { title: "No date", due_time: "09:00" }, admin);
    expect((await row(r.body.id)).due_time).toBeNull();
    const d = await t.post("/api/tasks", { title: "Dated", due_date: "2026-10-21", due_time: "08:15" }, admin);
    await t.patch(`/api/tasks/${d.body.id}`, { due_date: null }, admin);
    expect(await row(d.body.id)).toMatchObject({ due_date: null, due_time: null });
  });

  it("edits the time", async () => {
    const d = await t.post("/api/tasks", { title: "Edit me", due_date: "2026-10-22" }, admin);
    await t.patch(`/api/tasks/${d.body.id}`, { due_date: "2026-10-22", due_time: "18:45" }, admin);
    expect((await row(d.body.id)).due_time).toBe("18:45");
    expect((await t.patch(`/api/tasks/${d.body.id}`, { due_time: "7pm" }, admin)).status).toBe(400);
  });

  it("a time sent for an undated task is not stored; setting only the date keeps a stored time", async () => {
    const r = await t.post("/api/tasks", { title: "Undated" }, admin);
    await t.patch(`/api/tasks/${r.body.id}`, { due_time: "09:00" }, admin);
    expect((await row(r.body.id)).due_time).toBeNull();
    await t.patch(`/api/tasks/${r.body.id}`, { due_date: "2026-10-23" }, admin);
    expect(await row(r.body.id)).toMatchObject({ due_date: "2026-10-23", due_time: null }); // end of day, no hidden 09:00
    await t.patch(`/api/tasks/${r.body.id}`, { due_time: "10:30" }, admin);
    await t.patch(`/api/tasks/${r.body.id}`, { due_date: "2026-10-24" }, admin);
    expect(await row(r.body.id)).toMatchObject({ due_date: "2026-10-24", due_time: "10:30" });
  });
});

/**
 * Owner-edited What's new: seeded once from the built-in list, readable by
 * anyone, written only by the owner, validated, newest version first.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { CHANGELOG } from "../../src/utils/changelog";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let owner = "";
let admin = "";
beforeAll(async () => {
  t = await startTestServer("cp-changelog-", { OWNER_EMAILS: "owner@cl.test" });
  const team = await seedTeam(t.db, "Robo");
  owner = await t.session(await seedMember(t.db, team, "Sushil", "owner@cl.test", "admin"));
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@cl.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const put = (path: string, body: any, session: string) => t.api(path, { method: "PUT", body: JSON.stringify(body), session });
const del = (path: string, session: string) => t.api(path, { method: "DELETE", session });

describe("changelog", () => {
  it("is seeded from the built-in list and public, newest first", async () => {
    const r = await t.api("/api/changelog");
    expect(r.status).toBe(200);
    expect(r.body.map((e: any) => e.version)).toEqual(CHANGELOG.map((e) => e.version));
    expect(r.body[0]).not.toHaveProperty("id");
  });

  it("only the owner can write", async () => {
    expect((await t.api("/api/owner/changelog", { session: admin })).status).toBe(403);
    expect((await t.post("/api/owner/changelog", { version: "9.9", date: "2026-10-09", title: "x", added: ["y"] }, admin)).status).toBe(403);
  });

  it("owner publishes, edits, rejects junk and duplicates, and deletes", async () => {
    const made = await t.post("/api/owner/changelog", { version: "v3.10", date: "2026-10-09", title: "Notebook", added: "Personal notebook\n- Bruno can write pages\n\n", improved: [], fixed: [] }, owner);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body.entry).toMatchObject({ version: "3.10", title: "Notebook", added: ["Personal notebook", "Bruno can write pages"] });
    // 3.10 sorts above 3.5.0.
    expect((await t.api("/api/changelog")).body[0].version).toBe("3.10");

    expect((await t.post("/api/owner/changelog", { version: "3.10", date: "2026-10-09", title: "Dup", added: ["a"] }, owner)).status).toBe(409);
    expect((await t.post("/api/owner/changelog", { version: "three", date: "2026-10-09", title: "x", added: ["a"] }, owner)).status).toBe(400);
    expect((await t.post("/api/owner/changelog", { version: "3.11", date: "2026-10-09", title: "x" }, owner)).status).toBe(400);

    const id = made.body.entry.id;
    const edited = await put(`/api/owner/changelog/${id}`, { version: "3.6.0", date: "2026-10-10", title: "Notebook + calendar", added: ["Personal notebook"], fixed: ["Phone month view"] }, owner);
    expect(edited.status).toBe(200);
    expect(edited.body.entry).toMatchObject({ version: "3.6.0", fixed: ["Phone month view"] });
    const list = (await t.api("/api/owner/changelog", { session: owner })).body;
    expect(list.entries[0].version).toBe("3.6.0");
    expect(list.discord).toBe(false);
    // Discord needs the webhook configured.
    expect((await t.post(`/api/owner/changelog/${id}/discord`, {}, owner)).status).toBe(400);

    expect((await del(`/api/owner/changelog/${id}`, owner)).status).toBe(200);
    expect((await t.api("/api/changelog")).body[0].version).toBe(CHANGELOG[0].version);
  });
});

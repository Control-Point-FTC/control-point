/**
 * Feature parity, Phase 4.1: Checklists. Templates (starters or the team's
 * own), runs that anyone checks off (who and when recorded), N/A and partial
 * states, finish / reopen / reset, and Bruno: a lookup, a facts line and a
 * card that starts runs and checks items off.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "", ana = "", stranger = "";
let anaId = 0;
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const put = (path: string, body: any, session: string) => t.api(path, { method: "PUT", session, body: JSON.stringify(body), headers: { "x-cp-client": "1" } });

beforeAll(async () => {
  t = await startTestServer("cp-checklists-");
  team = await seedTeam(t.db, "Robo");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@ck.test", "admin"));
  anaId = await seedMember(t.db, team, "Ana", "ana@ck.test");
  ana = await t.session(anaId);
  stranger = await t.session(await seedMember(t.db, await seedTeam(t.db, "Other"), "Zed", "zed@ck.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("checklists", () => {
  let templateId = 0, runId = 0, firstItem = "", secondItem = "";

  it("templates: starters and the team's own; only managers change them", async () => {
    const overview = (await t.api("/api/checklists", { session: ana })).body;
    expect(overview.starters.find((s: any) => s.key === "pre-match").itemCount).toBe(24);
    expect((await t.post("/api/checklists/templates", { starter: "post-match" }, ana)).status).toBe(403);
    const r = await t.post("/api/checklists/templates", { starter: "post-match" }, admin);
    expect(r.status).toBe(200);
    templateId = r.body.id;
    expect((await t.post("/api/checklists/templates", { title: "", items: ["x"] }, admin)).status).toBe(400);
    const own = await t.post("/api/checklists/templates", { title: "Lab close", sections: [{ title: "Power", items: ["Chargers off"] }] }, admin);
    expect(own.status).toBe(200);
    const list = (await t.api("/api/checklists", { session: ana })).body.templates;
    expect(list.map((x: any) => x.title)).toEqual(["Lab close", "Post-match"]);
    expect((await t.api("/api/checklists", { session: stranger })).body.templates).toEqual([]);
  });

  it("runs: anyone starts one and checks items off; N/A leaves the total; who and when are kept", async () => {
    const r = await t.post("/api/checklists/runs", { templateId, title: "Post-match Q4" }, ana);
    expect(r.status).toBe(200);
    runId = r.body.id;
    const run = (await t.api(`/api/checklists/runs/${runId}`, { session: ana })).body;
    [firstItem, secondItem] = run.sections[0].items.map((i: any) => i.id);
    const checked = await put(`/api/checklists/runs/${runId}/items/${firstItem}`, { state: "done" }, ana);
    expect(checked.body.items[firstItem]).toMatchObject({ state: "done", setByName: "Ana" });
    await put(`/api/checklists/runs/${runId}/items/${secondItem}`, { state: "na" }, ana);
    expect((await put(`/api/checklists/runs/${runId}/items/${secondItem}`, { assigneeId: anaId }, ana)).body.items[secondItem]).toMatchObject({ state: "na", assigneeName: "Ana" });
    expect((await put(`/api/checklists/runs/${runId}/items/${secondItem}`, { state: "maybe" }, ana)).status).toBe(400);
    expect((await put(`/api/checklists/runs/${runId}/items/nope`, { state: "done" }, ana)).status).toBe(404);
    const after = (await t.api(`/api/checklists/runs/${runId}`, { session: ana })).body;
    expect(after.progress).toEqual({ done: 1, total: 8, partial: 0, na: 1 });
    expect((await t.api(`/api/checklists/runs/${runId}`, { session: stranger })).status).toBe(404);
  });

  it("editing the template never changes a run; finish, reopen and reset", async () => {
    await put(`/api/checklists/templates/${templateId}`, { title: "Post-match", items: ["Only one item now"] }, admin);
    expect((await t.api(`/api/checklists/runs/${runId}`, { session: ana })).body.sections[0].items).toHaveLength(9);
    expect((await t.post(`/api/checklists/runs/${runId}/finish`, {}, ana)).body.status).toBe("finished");
    expect((await put(`/api/checklists/runs/${runId}/items/${firstItem}`, { state: "open" }, ana)).status).toBe(400);
    expect((await t.post(`/api/checklists/runs/${runId}/reopen`, {}, ana)).body.status).toBe("open");
    const reset = (await t.post(`/api/checklists/runs/${runId}/reset`, {}, ana)).body;
    expect(reset.progress.done).toBe(0);
    expect(await rows("SELECT * FROM checklist_run_items WHERE run_id = ?", runId)).toHaveLength(0);
    expect((await t.api(`/api/checklists/runs/${runId}`, { method: "DELETE", session: ana, headers: { "x-cp-client": "1" } })).status).toBe(403);
  });

  it("Bruno: lookup shows open runs and what's left; facts list them; a card starts a run and checks items off", async () => {
    const db = ((sql: string, ...a: any[]) => rows(sql, ...a)) as any;
    const out = await runLookups(db, team, "UTC", [{ kind: "checklists" } as any]);
    expect(out).toMatch(/checklist template #\d+ "Lab close"/);
    expect(out).toMatch(new RegExp(`checklist run #${runId} "Post-match Q4" open: 0 of 9 done`));
    expect(out).toMatch(new RegExp(`\\[${firstItem}\\]`));
    const { loadWorkspaceFacts, formatWorkspaceFacts } = await import("../workspaceFacts");
    const fdb = { dbGet: async (sql: string, ...a: any[]) => (await rows(sql, ...a))[0], dbAll: async (sql: string, ...a: any[]) => rows(sql, ...a) };
    const facts = (await loadWorkspaceFacts(fdb as any, team, "UTC", new Date()))!;
    const factsText = formatWorkspaceFacts(facts);
    expect(factsText).toMatch(/Open checklist runs .*Post-match Q4"? \(0 of 9 done\)/);

    const card = await t.post("/api/ai/apply-actions", { actions: [{ kind: "checklist", items: [{ start: "lab close", title: "Lab close Friday" }, { run: runId, items: [firstItem], state: "done" }] }] }, ana);
    expect(card.status).toBe(200);
    expect(card.body.applied.checklist).toBe(2);
    expect((await rows("SELECT * FROM checklist_runs WHERE title = 'Lab close Friday'"))).toHaveLength(1);
    expect((await rows("SELECT set_by FROM checklist_run_items WHERE run_id = ? AND item_id = ?", runId, firstItem))[0].set_by).toBe(anaId);
    // A bad reference saves nothing.
    const bad = await t.post("/api/ai/apply-actions", { actions: [{ kind: "checklist", items: [{ start: "Lab close" }, { run: runId, items: ["not an item"] }] }] }, ana);
    expect(bad.status).toBe(400);
    expect((await rows("SELECT * FROM checklist_runs WHERE title = 'Lab close'"))).toHaveLength(0);
    // A card that deletes the event a new run is for is refused before anything is written.
    const ev = (await t.post("/api/events", { title: "Qualifier", date: "2099-12-05" }, admin)).body.id;
    const clash = await t.post("/api/ai/apply-actions", { actions: [{ kind: "delete-event", items: [{ id: ev }] }, { kind: "checklist", items: [{ start: "Lab close", event: ev }] }] }, admin);
    expect(clash.status).toBe(400);
    expect(await rows("SELECT id FROM events WHERE id = ?", ev)).toHaveLength(1);
    // The lookup filters templates by name.
    const only = await runLookups(db, team, "UTC", [{ kind: "checklists", query: "lab" } as any]);
    expect(only).toMatch(/"Lab close"/);
    expect(only).not.toMatch(/template #\d+ "Post-match"/);
  });

  it("the run log pages through finished runs", async () => {
    const tpl = (await rows("SELECT id FROM checklist_templates WHERE title = 'Lab close'"))[0].id;
    for (let i = 0; i < 52; i++) {
      const id = (await t.post("/api/checklists/runs", { templateId: tpl, title: `Old ${i}` }, ana)).body.id;
      await t.db.execute({ sql: "UPDATE checklist_runs SET status = 'finished', finished_at = ? WHERE id = ?", args: [new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), id] });
    }
    const first = (await t.api("/api/checklists", { session: ana })).body;
    const finished = first.runs.filter((r: any) => r.status === "finished");
    expect(finished).toHaveLength(50);
    expect(first.logMore).toBe(true);
    expect(first.runs.some((r: any) => r.status === "open")).toBe(true);
    const next = (await t.api(`/api/checklists/log?before=${encodeURIComponent(finished[49].finishedAt)}`, { session: ana })).body;
    expect(next.runs.length).toBeGreaterThanOrEqual(2);
    expect(next.more).toBe(false);
  });
});

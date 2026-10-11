// Bruno and the member's own sticky notes: reads only their notes, proposals
// are checked and confirmed like notebook cards (one transaction, receipts),
// and Settings → Bruno → My sticky notes switches it all off.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore } from "../notebook";
import { StickyNotes } from "../stickyNotes";
import { applyStickyOps, isStickyCard, parseStickyOps, previewStickyOps, stickyLookup } from "../brunoStickyActions";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore, notes: StickyNotes;
let team: number, ana: number, ben: number, anaSession: string;
let n = 0;
const key = () => `test_receipt_sticky_${String(++n).padStart(6, "0")}_${Date.now()}`;

beforeAll(async () => {
  t = await startTestServer("cp-bruno-sticky-");
  store = new NotebookStore(t.db);
  notes = new StickyNotes(t.db);
  team = await seedTeam(t.db, "Robotics");
  ana = await seedMember(t.db, team, "Ana", "ana@sticky.test");
  ben = await seedMember(t.db, team, "Ben", "ben@sticky.test");
  anaSession = await t.session(ana);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("parsing", () => {
  it("tells sticky cards apart and keeps them from mixing with page changes", () => {
    expect(isStickyCard([{ op: "sticky_create", body: "x" }])).toBe(true);
    expect(isStickyCard([{ op: "sticky_create", body: "x" }, { op: "append", page: 1, markdown: "y" }])).toBe(false);
    expect(() => parseStickyOps([{ op: "sticky_create", body: "x" }, { op: "append", page: 1, markdown: "y" }])).toThrow(/separate cards/);
    expect(parseStickyOps([{ op: "sticky_edit", note: "4", color: "sky" }])).toEqual([{ op: "sticky_edit", note: 4, color: "sky" }]);
    for (const bad of [[{ op: "sticky_create", body: " " }], [{ op: "sticky_edit", note: 1 }], [{ op: "sticky_delete" }], [{ op: "sticky_create", body: "x", color: "neon" }], [{ op: "sticky_create", body: "y".repeat(10_001) }]])
      expect(() => parseStickyOps(bad), JSON.stringify(bad).slice(0, 50)).toThrow();
  });
});

describe("reading and changing a member's own notes", () => {
  it("looks up only the asking member's notes", async () => {
    await notes.create(team, ana, { body: "Order M3 bolts" });
    await notes.create(team, ben, { body: "Ben's private reminder" });
    const mine = await stickyLookup(notes, team, ana);
    expect(mine.lines.join("\n")).toContain("Order M3 bolts");
    expect(mine.lines.join("\n")).not.toContain("Ben's private reminder");
    expect((await stickyLookup(notes, team, ana, "bolts")).lines).toHaveLength(1);
    expect((await stickyLookup(notes, team, ana, "servo")).lines).toHaveLength(0);
  });

  it("previews against the member's notes; someone else's note is unavailable", async () => {
    const benNote = (await notes.list(team, ben))[0];
    const anaNote = (await notes.list(team, ana))[0];
    const previews = await previewStickyOps(notes, { teamId: team, memberId: ana }, parseStickyOps([
      { op: "sticky_edit", note: anaNote.id, body: "Order M3 and M4 bolts" }, { op: "sticky_delete", note: benNote.id },
    ]));
    expect(previews[0]).toMatchObject({ before: "Order M3 bolts", after: "Order M3 and M4 bolts" });
    expect(previews[1].error).toMatch(/isn't yours/);
    expect(JSON.stringify(previews)).not.toContain("Ben's private reminder");
  });

  it("applies a confirmed card once, even when the confirm is retried", async () => {
    const ctx = { memberId: ana, teamId: team, source: "bruno_confirmed" as const };
    const ops = parseStickyOps([{ op: "sticky_create", body: "Charge batteries", color: "mint" }]);
    const receipt = key();
    const first = await applyStickyOps(store, ctx, ops, receipt);
    const again = await applyStickyOps(store, ctx, ops, receipt);
    expect(again.replayed).toBe(true);
    expect(again.result).toEqual(first.result);
    expect((await notes.list(team, ana)).filter(x => x.body === "Charge batteries")).toHaveLength(1);
  });

  it("rolls the whole card back when one change fails, and never touches another member's note", async () => {
    const ctx = { memberId: ana, teamId: team, source: "bruno_confirmed" as const };
    const benNote = (await notes.list(team, ben))[0];
    await expect(applyStickyOps(store, ctx, parseStickyOps([{ op: "sticky_create", body: "Should roll back" }, { op: "sticky_delete", note: benNote.id }]), key())).rejects.toThrow(/not found/);
    expect((await notes.list(team, ana)).some(x => x.body === "Should roll back")).toBe(false);
    expect((await notes.list(team, ben)).some(x => x.id === benNote.id)).toBe(true);
  });
});

describe("Settings → Bruno → My sticky notes", () => {
  it("off blocks sticky cards only; the notebook switch doesn't affect sticky cards", async () => {
    const card = { ops: [{ op: "sticky_create", body: "From Bruno" }] };
    expect((await t.post("/api/ai/notebook/preview", card, anaSession)).status).toBe(200);
    await t.patch("/api/profile", { name: "Ana", bruno_sticky: false }, anaSession);
    const off = await t.post("/api/ai/notebook/preview", card, anaSession);
    expect(off.status).toBe(403);
    expect(off.body.error).toMatch(/sticky notes access is turned off/);
    expect((await t.post("/api/ai/notebook/preview", { ops: [{ op: "create", title: "Plan" }] }, anaSession)).status).not.toBe(403);
    await t.patch("/api/profile", { name: "Ana", bruno_sticky: true, bruno_notebook: false }, anaSession);
    expect((await t.post("/api/ai/notebook/preview", card, anaSession)).status).toBe(200);
    const applied = await t.post("/api/ai/notebook/apply", { ...card, receipt: key() }, anaSession);
    expect(applied.status).toBe(200);
    expect(applied.body.results[0]).toMatchObject({ op: "sticky_create", title: "From Bruno" });
  });
});

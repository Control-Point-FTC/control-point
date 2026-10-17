/**
 * Feature parity, Phase 3.1: notebook entry metadata. A page carries when the
 * work happened, an entry type, a design stage, subsystem and award tags, a
 * read time and a byline. Bruno reads them and can set them through a card.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { applyNotebookOps, parseNotebookOps, previewNotebookOps } from "../brunoNotebookActions";
import { notebookLookup } from "../brunoNotebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";
import { cleanEntryMetaPatch, readMinutes } from "../../src/notebook/entryMeta";

vi.setConfig({ testTimeout: 30_000 });

describe("entry metadata rules", () => {
  it("validates each field and refuses typos instead of dropping them", () => {
    const team = ["Drivetrain", "Intake"];
    expect(cleanEntryMetaPatch({ type: "Test", stage: "iterate", workDate: "2026-10-15", subsystems: ["intake"], awards: ["Think"] }, team))
      .toEqual({ patch: { type: "test", stage: "iterate", workDate: "2026-10-15", subsystems: ["Intake"], awards: ["think"] } });
    expect(cleanEntryMetaPatch({ type: null, workDate: "" }, team)).toEqual({ patch: { type: null, workDate: null } });
    expect(cleanEntryMetaPatch({ type: "Dance" }, team)).toHaveProperty("error");
    expect(cleanEntryMetaPatch({ workDate: "2026-02-30" }, team)).toHaveProperty("error");
    expect(cleanEntryMetaPatch({ subsystems: ["Intake", "Lift"] }, team)).toHaveProperty("error");
    expect(cleanEntryMetaPatch({ awards: ["Best hair"] }, team)).toHaveProperty("error");
    expect(cleanEntryMetaPatch({}, team)).toHaveProperty("error");
  });
  it("estimates read time at about 200 words a minute", () => {
    expect(readMinutes("")).toBe(0);
    expect(readMinutes("one two")).toBe(1);
    expect(readMinutes(Array(1000).fill("w").join(" "))).toBe(5);
  });
});

let t: TestServer, store: NotebookStore;
let team: number, member: number, peer: number, admin: number;
let memberSession: string;
let section: number;
const ctx = (memberId: number, source: NotebookContext["source"] = "human"): NotebookContext => ({ memberId, teamId: team, source });
const api = (path: string, init: any = {}) => t.api(`/api/notebook${path}`, { session: memberSession, ...init });

beforeAll(async () => {
  t = await startTestServer("cp-nb-meta-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  member = await seedMember(t.db, team, "Ana", "ana@meta.test");
  peer = await seedMember(t.db, team, "Lee", "lee@meta.test");
  admin = await seedMember(t.db, team, "Ada", "ada@meta.test", "admin");
  memberSession = await t.session(member);
  section = (await api("/tree")).body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("notebook entry metadata", () => {
  it("saves only the fields sent, with a byline and read time", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Intake test", content: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "We ran the intake ten times." }] }] }, memberSession)).body;
    const empty = (await api(`/pages/${p.id}/meta`)).body;
    expect(empty.meta).toEqual({ workDate: null, type: null, stage: null, subsystems: [], awards: [] });
    expect(empty).toMatchObject({ readMinutes: 1, writtenBy: ["Ana"], canEdit: true });
    expect(empty.teamSubsystems.length).toBeGreaterThan(0);
    const sub = empty.teamSubsystems[0];
    const put = (body: any) => api(`/pages/${p.id}/meta`, { method: "PUT", body: JSON.stringify(body) });
    expect((await put({ type: "test", stage: "test", workDate: "2026-10-15" })).status).toBe(200);
    expect((await put({ subsystems: [sub], awards: ["think"] })).body.meta).toEqual({ workDate: "2026-10-15", type: "test", stage: "test", subsystems: [sub], awards: ["think"] });
    expect((await put({ stage: null })).body.meta.stage).toBeNull();
    expect((await put({ type: "Dance" })).status).toBe(400);
    expect((await api(`/pages/${p.id}/meta`)).body.meta.type).toBe("test");
    // Another member edits the page: the byline lists both, last edited by them.
    await store.save(ctx(peer), p.id, { baseRevision: (await store.page(ctx(peer), p.id)).revision, title: "Intake test v2" });
    const after = (await api(`/pages/${p.id}/meta`)).body;
    expect(after.writtenBy).toEqual(["Ana", "Lee"]);
    expect(after.lastEditedBy).toBe("Lee");
  });

  it("protected pages stay hidden, and other teams can't reach them", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Secret" }, memberSession)).body;
    await store.protect(ctx(admin), "page", p.id, true);
    expect((await api(`/pages/${p.id}/meta`)).status).toBe(404);
    const stranger = await t.session(await seedMember(t.db, await seedTeam(t.db, "Other"), "Zed", "zed@meta.test", "admin"));
    expect((await t.api(`/api/notebook/pages/${p.id}/meta`, { session: stranger })).status).toBe(404);
  });

  it("Bruno reads the details and tags a page through a confirmed card", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Arm iteration", content: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "New wrist." }] }] }, memberSession)).body;
    const sub = (await api(`/pages/${p.id}/meta`)).body.teamSubsystems[0];
    const ops = parseNotebookOps([{ op: "tag", page: p.id, type: "prototype", stage: "iterate", work_date: "2026-10-12", subsystems: [sub], awards: ["innovate"] }]);
    const preview = await previewNotebookOps(store, ctx(member), ops);
    expect(preview[0]).toMatchObject({ op: "tag" });
    expect(preview[0].summary).toMatch(/type Prototype · stage Iterate · work happened on 2026-10-12/);
    expect(preview[0].error).toBeUndefined();
    // A subsystem not on the team's list shows an error on the card and can't be applied.
    const badOps = parseNotebookOps([{ op: "tag", page: p.id, subsystems: ["Hovercraft"] }]);
    expect((await previewNotebookOps(store, ctx(member), badOps))[0].error).toMatch(/team's list/);
    await expect(applyNotebookOps(store, ctx(member), badOps, "receipt-bad-tag-000001")).rejects.toMatchObject({ status: 400 });
    expect(() => parseNotebookOps([{ op: "tag", page: p.id, type: "Dance" }])).toThrow();
    const r = await applyNotebookOps(store, ctx(member), ops, "receipt-tag-0000000001");
    expect(JSON.stringify(r)).toMatch(/"op":"tag"/);
    const read = await notebookLookup(store, ctx(member), { kind: "notebook_page", page: p.id } as any);
    expect(read.lines[0]).toMatch(/entry: type Prototype · stage Iterate · work happened on 2026-10-12 · subsystems .* · awards Innovate · written by Ana/);
  });
});

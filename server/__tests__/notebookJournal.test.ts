/**
 * Feature parity, Phase 3.2: the notebook journal — every visible entry with
 * its date (work date first), excerpt, details and authors, newest first;
 * protected pages stay out. Bruno reads it with a notebook_journal lookup.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { notebookLookup } from "../brunoNotebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team = 0, member = 0, admin = 0, session = "", section = 0;
const ctx = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
const doc = (text: string) => ({ type: "doc", content: [{ id: "b1", type: "paragraph", content: [{ type: "text", text }] }] });

beforeAll(async () => {
  t = await startTestServer("cp-nb-journal-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  member = await seedMember(t.db, team, "Ana", "ana@j.test");
  admin = await seedMember(t.db, team, "Ada", "ada@j.test", "admin");
  session = await t.session(member);
  section = (await t.api("/api/notebook/tree", { session })).body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("notebook journal", () => {
  it("lists entries newest first by work date, with details and authors; protected pages stay out", async () => {
    const a = (await t.post("/api/notebook/pages", { sectionId: section, title: "Intake test", content: doc("Ran the intake ten times.") }, session)).body;
    const b = (await t.post("/api/notebook/pages", { sectionId: section, title: "Kickoff notes", content: doc("Game reveal.") }, session)).body;
    const secret = (await t.post("/api/notebook/pages", { sectionId: section, title: "Secret" }, session)).body;
    await t.api(`/api/notebook/pages/${a.id}/meta`, { method: "PUT", session, body: JSON.stringify({ type: "test", workDate: "2099-01-10", awards: ["think"] }) });
    await t.api(`/api/notebook/pages/${b.id}/meta`, { method: "PUT", session, body: JSON.stringify({ workDate: "2099-01-03" }) });
    await store.protect(ctx(admin), "page", secret.id, true);
    const { entries } = (await t.api("/api/notebook/journal", { session })).body;
    expect(entries.map((e: any) => e.title)).toEqual(["Intake test", "Kickoff notes"]);
    expect(entries[0]).toMatchObject({ date: "2099-01-10", workDate: "2099-01-10", type: "test", awards: ["think"], authors: ["Ana"], excerpt: "Ran the intake ten times." });
  });

  it("filters run across the whole notebook and pages on; accents and newline-separated words count", async () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`).join("\n");
    const big = (await t.post("/api/notebook/pages", { sectionId: section, title: "ÉQUIPE notes", content: doc(words) }, session)).body;
    await t.api(`/api/notebook/pages/${big.id}/meta`, { method: "PUT", session, body: JSON.stringify({ workDate: "2098-01-01", awards: ["design"] }) });
    const page = (q: string) => t.api(`/api/notebook/journal?${q}`, { session }).then((r) => r.body);
    const accent = await page("q=%C3%A9quipe");
    expect(accent.entries.map((e: any) => e.title)).toEqual(["ÉQUIPE notes"]);
    expect(accent.entries[0].readMinutes).toBe(5);
    expect((await page("award=design")).entries.map((e: any) => e.title)).toEqual(["ÉQUIPE notes"]);
    expect((await page("author=Ana&type=test")).entries.map((e: any) => e.title)).toEqual(["Intake test"]);
    const first = await page("limit=1");
    expect(first).toMatchObject({ more: true, nextOffset: 1 });
    expect(first.facets.authors).toEqual(["Ana"]);
    const second = await page("limit=1&offset=1");
    expect(second.entries[0].id).not.toBe(first.entries[0].id);
  });

  it("Bruno's notebook_journal lookup filters by date and words", async () => {
    const all = await notebookLookup(store, ctx(member), { kind: "notebook_journal" });
    expect(all.lines[0]).toMatch(/page #\d+ "Intake test" 2099-01-10 \(work date\) · type Test · awards Think · by Ana: "Ran the intake ten times\."/);
    expect(all.lines.join("\n")).not.toMatch(/Secret/);
    const jan5 = await notebookLookup(store, ctx(member), { kind: "notebook_journal", from: "2099-01-05" });
    expect(jan5.lines).toHaveLength(1);
    const words = await notebookLookup(store, ctx(member), { kind: "notebook_journal", query: "think" });
    expect(words.lines.join("\n")).toMatch(/Intake test/);
    expect(words.lines.join("\n")).not.toMatch(/Kickoff/);
    // Nothing found is no rows, so the lookup reads as "none found", not "1 found".
    expect((await notebookLookup(store, ctx(member), { kind: "notebook_journal", query: "zebra unicorn" })).lines).toEqual([]);
  });
});

// Section merge: one transaction, pages keep their subpages, and the source is
// trashed only when nothing at all is left in it (hidden pages included).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, admin: number, organizer: number, book: number;
const human = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
const section = (title: string) => store.create(human(admin), "section", { notebookId: book, title }) as Promise<any>;
const page = (sectionId: number, title: string, extra: any = {}) => store.create(human(admin), "page", { sectionId, title, ...extra }) as Promise<any>;

beforeAll(async () => {
  t = await startTestServer("cp-notebook-merge-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  admin = await seedMember(t.db, team, "Admin", "admin@merge.test", "admin");
  organizer = await seedMember(t.db, team, "Olu", "olu@merge.test");
  const role = await t.db.execute({ sql: "INSERT INTO roles(team_id,name,permissions) VALUES(?, 'Organizer', ?)", args: [team, JSON.stringify(["edit_notebook", "organize_notebook", "delete_notebook"])] });
  await t.db.execute({ sql: "INSERT INTO member_roles(member_id,role_id) VALUES(?,?)", args: [organizer, Number(role.lastInsertRowid)] });
  book = (await store.tree(human(admin))).notebooks[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("merge a section into another", () => {
  it("moves pages with their subpages to the end of the target and trashes the empty source", async () => {
    const from = await section("Old build"), into = await section("Build");
    const kept = await page(into.id, "Existing");
    const a = await page(from.id, "Drive"), sub = await page(from.id, "Motor tests", { parentId: a.id }), b = await page(from.id, "Intake");
    expect(await store.mergeSection(human(organizer), from.id, into.id)).toEqual({ moved: 2, trashed: true });
    const tree = await store.tree(human(organizer));
    expect(tree.sections.some(s => s.id === from.id)).toBe(false);
    const top = tree.pages.filter(p => p.sectionId === into.id && !p.parentId).map(p => p.title);
    expect(top).toEqual([kept.title, "Drive", "Intake"]);
    expect(tree.pages.find(p => p.id === sub.id)).toMatchObject({ sectionId: into.id, parentId: a.id });
    expect(tree.pages.find(p => p.id === b.id)?.sectionId).toBe(into.id);
  });

  it("keeps the source when it still holds a page this member can't see", async () => {
    const from = await section("Mixed"), into = await section("Target");
    const open = await page(from.id, "Open notes");
    const secret = await page(from.id, "Admin plan");
    await store.protect(human(admin), "page", secret.id, true);
    expect(await store.mergeSection(human(organizer), from.id, into.id)).toEqual({ moved: 1, trashed: false });
    const adminTree = await store.tree(human(admin));
    expect(adminTree.sections.some(s => s.id === from.id)).toBe(true);
    expect(adminTree.pages.find(p => p.id === secret.id)?.sectionId).toBe(from.id);
    expect(adminTree.pages.find(p => p.id === open.id)?.sectionId).toBe(into.id);
  });

  it("rejects merging a section into itself and works over HTTP", async () => {
    const one = await section("Solo"), two = await section("Other");
    await expect(store.mergeSection(human(admin), one.id, one.id)).rejects.toThrow(/another section/);
    await page(one.id, "Note");
    const res = await t.post(`/api/notebook/sections/${one.id}/merge`, { into: two.id }, await t.session(admin));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ moved: 1, trashed: true });
  });
});

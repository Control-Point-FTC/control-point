// Make subpage / Promote: placement must not be thrown off by sibling pages
// the member can't see (protected pages).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, admin: number, section: number;
const ctx = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
const page = async (title: string, parentId?: number) => (await store.create(ctx(admin), "page", { sectionId: section, title, ...(parentId ? { parentId } : {}) }) as any).id as number;
const order = async (parentId: number | null) => (await store.tree(ctx(admin))).pages.filter(p => p.sectionId === section && p.parentId === parentId).map(p => p.title);

beforeAll(async () => {
  t = await startTestServer("cp-notebook-move-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  admin = await seedMember(t.db, team, "Admin", "admin@move.test", "admin");
  section = (await store.tree(ctx(admin))).sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("relative page placement", () => {
  it("promotes right after the former parent and appends subpages last, counting hidden pages", async () => {
    const hidden = await page("Hidden");
    await store.protect(ctx(admin), "page", hidden, true);
    const parent = await page("Parent");
    await page("Next");
    const child = await page("Child", parent);
    const secretChild = await page("Secret child", parent);
    await store.protect(ctx(admin), "page", secretChild, true);

    await store.move(ctx(admin), "page", child, { parentId: null, afterId: parent }, 0);
    expect(await order(null)).toEqual(["Hidden", "Parent", "Child", "Next"]);

    await store.move(ctx(admin), "page", child, { parentId: parent }, "end");
    expect(await order(parent)).toEqual(["Secret child", "Child"]);

    await expect(store.move(ctx(admin), "page", child, { parentId: null, afterId: 999999 }, 0)).rejects.toThrow("same level");
    await expect(store.move(ctx(admin), "page", child, { parentId: null }, "start")).rejects.toThrow("Invalid position");
  });
});

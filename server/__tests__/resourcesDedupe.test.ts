/**
 * V3.5 phase 5 resources: an import marks links the library already has,
 * and a save skips the same page saved another way (www, https, trailing
 * slash, tracking parameters, YouTube link forms), even when two saves of
 * the same links arrive at once.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let ada = "";
let team = 0;
beforeAll(async () => {
  t = await startTestServer("cp-res-dedupe-");
  team = await seedTeam(t.db, "Robo");
  ada = await t.session(await seedMember(t.db, team, "Ada", "ada@res.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const count = async () => Number(((await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM resources WHERE team_id = ?", args: [team] })).rows[0] as any).n);

describe("resource duplicates", () => {
  it("a save skips the same page saved another way, and reports it", async () => {
    const first = await t.post("/api/resources", { items: [{ url: "https://www.gm0.org/en/latest/", title: "gm0" }, { url: "https://youtu.be/dQw4w9WgXcQ", title: "Reveal" }] }, ada);
    expect(first.body).toMatchObject({ count: 2, skipped: [] });
    const again = await t.post("/api/resources", { items: [
      { url: "http://gm0.org/en/latest?utm_source=discord", title: "gm0 again" },
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Reveal again" },
      { url: "https://ftc-docs.firstinspires.org/", title: "Docs" },
      { url: "https://ftc-docs.firstinspires.org", title: "Docs twice" },
    ] }, ada);
    expect(again.body.count).toBe(1);
    expect(again.body.skipped.map((s: any) => s.title)).toEqual(["gm0 again", "Reveal again", "Docs twice"]);
    expect(await count()).toBe(3);
  });

  it("two saves of the same new link at once keep one copy", async () => {
    const both = await Promise.all([1, 2, 3].map(() => t.post("/api/resources", { items: [{ url: "https://cad.onshape.com/doc/1", title: "CAD" }] }, ada)));
    expect(both.map((r) => r.body.count).sort()).toEqual([0, 0, 1]);
    expect(await count()).toBe(4);
  });

  it("the import preview marks what's already saved and what repeats", async () => {
    const r = await t.post("/api/resources/parse", { text: "see https://gm0.org/en/latest and https://new.example/a and again https://new.example/a/" }, ada);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const byUrl = Object.fromEntries(r.body.items.map((i: any) => [i.url, i.duplicate ?? null]));
    expect(byUrl["https://gm0.org/en/latest"]).toBe("saved");
    expect(byUrl["https://new.example/a"]).toBeNull();
    expect(byUrl["https://new.example/a/"]).toBe("repeat");
    expect(r.body).toMatchObject({ fresh: 1, duplicates: 2 });
  });
});

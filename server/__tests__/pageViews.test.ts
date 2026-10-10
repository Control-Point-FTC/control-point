// Cookieless public pageview counter.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PageViews, optedOut, publicPagePath } from "../pageViews";
import { startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer;
beforeAll(async () => { t = await startTestServer("cp-pageviews-"); }, 120_000);
afterAll(async () => { await t?.stop(); });

describe("public pageviews", () => {
  it("counts only the public pages", () => {
    expect(publicPagePath("/")).toBe("/");
    expect(publicPagePath("/Privacy/")).toBe("/privacy");
    expect(publicPagePath("/terms?ref=x")).toBe("/terms");
    expect(publicPagePath("/predict/how-it-works")).toBe("/predict/how-it-works");
    for (const p of ["/notebook", "/notebook/p/4", "/tasks", "/api/pv", "", 42, null, "/" + "a".repeat(200)]) expect(publicPagePath(p)).toBeNull();
  });

  it("respects Do Not Track and Global Privacy Control", () => {
    expect(optedOut({ dnt: "1" })).toBe(true);
    expect(optedOut({ "sec-gpc": "1" })).toBe(true);
    expect(optedOut({})).toBe(false);
  });

  it("keeps daily totals per page and limits floods without storing who sent them", async () => {
    const views = new PageViews(t.db);
    await views.count("/", "2026-10-09"); await views.count("/", "2026-10-10"); await views.count("/", "2026-10-10"); await views.count("/terms", "2026-10-10");
    const rows = (await t.db.execute("SELECT * FROM page_views ORDER BY day, path")).rows;
    expect(rows.map(r => [r.day, r.path, Number(r.views)])).toEqual([["2026-10-09", "/", 1], ["2026-10-10", "/", 2], ["2026-10-10", "/terms", 1]]);
    expect(Object.keys(rows[0]).sort()).toEqual(["day", "path", "views"]); // nothing about visitors
    let allowed = 0;
    for (let i = 0; i < 40; i++) if (views.allow("1.2.3.4", 1000)) allowed++;
    expect(allowed).toBe(30);
    expect(views.allow("1.2.3.4", 1000 + 61_000)).toBe(true); // a new minute
  });

  it("reports totals for the owner", async () => {
    const views = new PageViews(t.db);
    const today = new Date().toISOString().slice(0, 10);
    await views.count("/privacy", today);
    const summary = await views.summary(30);
    expect(summary.totals["/privacy"]).toBeGreaterThanOrEqual(1);
    expect(summary.days.some(d => d.day === today && d.path === "/privacy")).toBe(true);
  });
});

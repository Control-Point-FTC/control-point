// Public pageview counter over HTTP: what's counted, opt-outs, the article
// page, and owner-only reporting.
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PageViews } from "../pageViews";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, owner: string, member: string;
const views = async (path: string) => Number((await t.db.execute({ sql: "SELECT COALESCE(SUM(views),0) AS n FROM page_views WHERE path=?", args: [path] })).rows[0].n);
const beacon = (path: string, headers: Record<string, string> = {}) => fetch(`${t.base}/api/pv`, { method: "POST", headers: { "Content-Type": "application/json", "X-CP-Client": "1", ...headers }, body: JSON.stringify({ path }) });

beforeAll(async () => {
  t = await startTestServer("cp-pv-http-", { OWNER_EMAILS: "owner@pv.test" });
  const team = await seedTeam(t.db, "Robotics");
  owner = await t.session(await seedMember(t.db, team, "Owner", "owner@pv.test", "admin"));
  member = await t.session(await seedMember(t.db, team, "Member", "member@pv.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("pageviews over HTTP", () => {
  it("counts public pages and ignores everything else and opted-out browsers", async () => {
    expect((await beacon("/")).status).toBe(204);
    expect((await beacon("/notebook/p/4")).status).toBe(204);
    await beacon("/terms", { DNT: "1" });
    await beacon("/terms", { "Sec-GPC": "1" });
    expect(await views("/")).toBe(1);
    expect(await views("/notebook/p/4")).toBe(0);
    expect(await views("/terms")).toBe(0);
  });

  it("counts the Predict article only for real browser page loads", async () => {
    await fetch(`${t.base}/predict/how-it-works`);
    expect(await views("/predict/how-it-works")).toBe(0);
    // fetch() drops Sec-Fetch-* (forbidden headers); a raw request sends what a browser does.
    await new Promise<void>((resolve, reject) => { http.get(`${t.base}/predict/how-it-works`, { headers: { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" } }, res => { res.resume(); res.on("end", () => resolve()); }).on("error", reject); });
    await new Promise(r => setTimeout(r, 200));
    expect(await views("/predict/how-it-works")).toBe(1);
  });

  it("shows totals to the owner only", async () => {
    expect((await t.api("/api/owner/pageviews")).status).toBe(401);
    expect((await t.api("/api/owner/pageviews", { session: member })).status).toBe(403);
    const res = await t.api("/api/owner/pageviews", { session: owner });
    expect(res.status).toBe(200);
    expect(res.body.totals["/"]).toBe(1);
  });

  it("forgets addresses after about a minute", () => {
    const pv = new PageViews(t.db);
    pv.allow("10.0.0.1", 0); pv.allow("10.0.0.2", 30_000);
    pv.prune(61_000);
    expect(pv.remembered).toBe(1);
    pv.prune(91_000);
    expect(pv.remembered).toBe(0);
  });
});

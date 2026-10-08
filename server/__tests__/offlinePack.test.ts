/** Offline region pack: built from stored FTC Scout events, filtered by region, served gzipped. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPack, detectRegion, listRegions, packEvent, OfflinePackBuilder } from "../offline/pack";
import { PredictStore, STORE_FORMAT } from "../predict/store";
import { currentFtcSeason } from "../../src/components/FtcStats";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";

vi.setConfig({ testTimeout: 30_000 });
const SEASON = currentFtcSeason();

const sc = (np: number, pen = 0) => ({ totalPoints: np + pen, totalPointsNp: np, autoPoints: 10, dcPoints: np - 10, dcBasePoints: 5, dcParkPoints: 5, egPoints: 5, penaltyPointsCommitted: pen });
const team = (n: number, name: string | null, rank: number | null) => ({
  teamNumber: n, ...(name ? { team: { name, location: { city: "Edison", state: "NJ" } } } : {}),
  stats: { rank, rp: 2.5, wins: 3, losses: 1, ties: 0, qualMatchesPlayed: 4 },
});
function rawEvent(code: string, region: string, teams: [number, string | null][], opts: { remote?: boolean; name?: string } = {}) {
  const [a, b, c, d] = teams.map((t) => t[0]);
  return { data: { eventByCode: {
    code, name: opts.name ?? `Event ${code}`, type: "Qualifier", start: `${SEASON + 1}-01-10`, end: `${SEASON + 1}-01-10`, remote: !!opts.remote, hybrid: false,
    regionCode: region, location: { state: "NJ", country: "USA" },
    awards: [{ type: "Inspire", placement: 1, teamNumber: a }],
    teams: teams.map(([n, name], i) => team(n, name, i + 1)),
    matches: [
      { matchNum: 2, series: 0, tournamentLevel: "Quals", hasBeenPlayed: false, scheduledStartTime: null, teams: [
        { teamNumber: a, alliance: "Red" }, { teamNumber: c, alliance: "Red" }, { teamNumber: b, alliance: "Blue" }, { teamNumber: d, alliance: "Blue" }], scores: null },
      { matchNum: 1, series: 0, tournamentLevel: "Quals", hasBeenPlayed: true, actualStartTime: `${SEASON + 1}-01-10T15:00:00Z`, teams: [
        { teamNumber: a, alliance: "Red" }, { teamNumber: b, alliance: "Red", surrogate: true }, { teamNumber: c, alliance: "Blue" }, { teamNumber: d, alliance: "Blue", dq: true }],
        scores: { red: sc(120, 10), blue: sc(80) } },
    ],
  } } };
}

describe("packEvent / buildPack", () => {
  it("keeps names, ranks, scores and surrogates in the compact layout", () => {
    const p = packEvent(rawEvent("USNJQ1", "USNJ", [[4215, "Mech"], [1111, "Robo"], [2222, null], [3333, "Gears"]]), SEASON)!;
    expect(p.event.region).toBe("USNJ");
    expect(p.event.teams[0]).toEqual([4215, 1, 2.5, 3, 1, 0, 4]);
    expect(p.event.awards).toEqual([["Inspire", 1, 4215]]);
    // Sorted: Q-1 (played) then Q-2 (scheduled).
    expect(p.event.matches.map((m) => m.n)).toEqual([1, 2]);
    const [played, next] = p.event.matches;
    expect(played).toMatchObject({ l: "q", r: [4215, 1111], b: [2222, 3333], sur: [1111], dq: [3333] });
    expect(played.rs).toEqual([130, 120, 10, 105, 5, 10]);
    expect(next.rs).toBeNull();
    expect(p.names.get(4215)).toEqual([4215, "Mech", "Edison", "NJ"]);
    expect(p.names.has(2222)).toBe(false);
    expect(packEvent(rawEvent("REMOTE", "USNJ", [[1, "a"], [2, "b"], [3, "c"], [4, "d"]], { remote: true }), SEASON)).toBeNull();
    expect(packEvent({ errors: [] }, SEASON)).toBeNull();
  });

  it("filters by region, names visiting teams from other events, and finds the team's region", () => {
    const nj = packEvent(rawEvent("USNJQ1", "USNJ", [[4215, "Mech"], [1111, "Robo"], [2222, null], [3333, "Gears"]]), SEASON)!;
    const ny = packEvent(rawEvent("USNYQ1", "USNYNY", [[2222, "Visitors"], [5555, "Five"], [6666, "Six"], [7777, "Seven"]]), SEASON)!;
    const pack = buildPack([nj, ny], SEASON, "USNJ", "2026-10-08T00:00:00.000Z");
    expect(pack.regionName).toBe("New Jersey");
    expect(pack.events.map((e) => e.code)).toEqual(["USNJQ1"]);
    // 2222's name only appears at its New York event.
    expect(pack.teams).toEqual([[1111, "Robo", "Edison", "NJ"], [2222, "Visitors", "Edison", "NJ"], [3333, "Gears", "Edison", "NJ"], [4215, "Mech", "Edison", "NJ"]]);
    expect(buildPack([nj, ny], SEASON, "ALL", null).events).toHaveLength(2);

    const evs = [nj, ny].map((e) => ({ region: e.event.region, teams: e.event.teams.map((t) => t[0]) }));
    expect(detectRegion(evs, 4215)).toBe("USNJ");
    expect(detectRegion(evs, 9999)).toBeNull();
    const list = listRegions([nj, ny], SEASON, null, "USNJ");
    expect(list.detected).toEqual({ code: "USNJ", name: "New Jersey", events: 1, teams: 4 });
    expect(list.regions.map((r) => r.name)).toEqual(["New Jersey", "New York – NYC"]);
    expect(list.all).toEqual({ events: 2, teams: 7 });
  });
});

describe("PredictStore layout upgrade", () => {
  it("re-downloads events stored before team names were kept, once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-store-fmt-"));
    try {
      const calls: string[] = [];
      let failCode = "B";
      const scout = async (q: string, v: any) => {
        if (q.includes("eventsSearch")) return { data: { eventsSearch: [{ code: "A", type: "Qualifier", updatedAt: "1" }, { code: "B", type: "Qualifier", updatedAt: "1" }] } };
        calls.push(v.code);
        if (v.code === failCode) throw new Error("HTTP 502");
        return { data: { eventByCode: { code: v.code } } };
      };
      const store = new PredictStore(dir, { scout, advancement: async () => null, gapMs: 0 });
      // An old install: both events stored, no layout marks.
      const sdir = join(dir, "scout", String(SEASON));
      mkdirSync(sdir, { recursive: true });
      for (const c of ["A", "B"]) writeFileSync(join(sdir, `${c}.json`), "{}");
      writeFileSync(join(sdir, "_index.json"), JSON.stringify({ A: { code: "A", type: "Qualifier", updatedAt: "1" }, B: { code: "B", type: "Qualifier", updatedAt: "1" } }));
      writeFileSync(join(sdir, "_status.json"), JSON.stringify({ complete: true, lastSync: "2026-01-01T00:00:00.000Z", failed: 0 }));
      expect(store.isComplete(SEASON)).toBe(false);

      await store.syncScout(SEASON);
      expect(calls).toEqual(["A", "B"]);
      // B failed: not complete in the new layout yet; A isn't fetched again.
      expect(store.isComplete(SEASON)).toBe(false);
      failCode = "";
      await store.syncScout(SEASON);
      expect(calls).toEqual(["A", "B", "B"]);
      expect(store.isComplete(SEASON)).toBe(true);
      expect(JSON.parse(readFileSync(join(sdir, "_status.json"), "utf8")).format).toBe(STORE_FORMAT);
      await store.syncScout(SEASON);
      expect(calls).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the builder re-reads only changed files", async () => {
    const files = [{ code: "USNJQ1", path: "a", mtimeMs: 1 }];
    let reads = 0;
    const b = new OfflinePackBuilder({
      hasSeason: () => true, eventFiles: () => files, lastSync: () => null,
      readEventFile: () => { reads++; return rawEvent("USNJQ1", "USNJ", [[1, "a"], [2, "b"], [3, "c"], [4, "d"]]); },
    });
    const first = await b.events(SEASON);
    expect(first.events).toHaveLength(1);
    expect((await b.events(SEASON)).version).toBe(first.version);
    expect(reads).toBe(1);
    // A rewritten file (e.g. by a sync where other events failed): new version.
    files[0] = { ...files[0], mtimeMs: 2 };
    expect((await b.events(SEASON)).version).not.toBe(first.version);
    expect(reads).toBe(2);
  });
});

describe("offline routes", () => {
  let t: TestServer;
  let session = "";
  let dataDir = "";
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cp-offline-data-"));
    const sdir = join(dataDir, "scout", String(SEASON));
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "USNJQ1.json"), JSON.stringify(rawEvent("USNJQ1", "USNJ", [[4215, "Mech"], [1111, "Robo"], [2222, null], [3333, "Gears"]])));
    writeFileSync(join(sdir, "USNYQ1.json"), JSON.stringify(rawEvent("USNYQ1", "USNYNY", [[2222, "Visitors"], [5555, "Five"], [6666, "Six"], [7777, "Seven"]])));
    writeFileSync(join(sdir, "_index.json"), "{}");
    writeFileSync(join(sdir, "_status.json"), JSON.stringify({ complete: true, lastSync: "2026-10-08T06:00:00.000Z", failed: 0, format: STORE_FORMAT }));
    t = await startTestServer("cp-offline-", { PREDICT_DATA_DIR: dataDir });
    const team = await seedTeam(t.db, "Mech");
    await t.db.execute({ sql: "UPDATE teams SET ftc_team_number = '4215' WHERE id = ?", args: [team] });
    session = await t.session(await seedMember(t.db, team, "Ada", "ada@offline.test", "admin"));
  }, 120_000);
  afterAll(async () => { await t?.stop(); rmSync(dataDir, { recursive: true, force: true }); });

  it("lists regions with the team's own detected", async () => {
    expect((await t.api("/api/offline/regions")).status).toBe(401);
    const r = await t.api("/api/offline/regions", { session });
    expect(r.status).toBe(200);
    expect(r.body.detected).toMatchObject({ code: "USNJ", name: "New Jersey", events: 1 });
    expect(r.body.dataAsOf).toBe("2026-10-08T06:00:00.000Z");
    expect(r.body.season).toBe(SEASON);
  });

  it("serves a region pack gzipped, and refuses unknown regions", async () => {
    const headers = new Headers({ "Accept-Encoding": "gzip" });
    withSession(headers, session);
    const res = await fetch(`${t.base}/api/offline/pack?region=usnj`, { headers });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const pack = await res.json();
    expect(pack.region).toBe("USNJ");
    expect(pack.events.map((e: any) => e.code)).toEqual(["USNJQ1"]);
    expect(pack.teams.find((x: any) => x[0] === 2222)[1]).toBe("Visitors");
    const all = await t.api("/api/offline/pack?region=ALL", { session });
    expect(all.body.events).toHaveLength(2);
    expect((await t.api("/api/offline/pack?region=USCA", { session })).status).toBe(404);
    expect((await t.api("/api/offline/pack?region=../x", { session })).status).toBe(400);
  });
});

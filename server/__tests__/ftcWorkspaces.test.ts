/**
 * One workspace per FTC team number (UX-9 / UX-10): creating or connecting
 * a number another workspace already holds is refused with a way to ask to
 * join instead; pre-existing duplicates are only listed, never changed.
 * FTC Scout is replaced by a local stand-in so lookups are deterministic.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

const KNOWN: Record<number, { name: string; schoolName: string }> = {
  4215: { name: "Hypnotic", schoolName: "Test High" },
  11115: { name: "Gluten Free", schoolName: "Test Middle" },
  20000: { name: "Fresh Bots", schoolName: "New School" },
  20001: { name: "Race Bots", schoolName: "Race School" },
};

let scout: Server;
let t: TestServer;
let admin = "";
let student = "";
let owner = "";
let ownedTeam = 0;

beforeAll(async () => {
  scout = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const n = Number(JSON.parse(body || "{}")?.variables?.number);
      const team = KNOWN[n] ? { number: n, ...KNOWN[n], rookieYear: 2015, location: { city: "X", state: "Y", country: "USA" } } : null;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: { teamByNumber: team } }));
    });
  });
  await new Promise<void>((r) => scout.listen(0, "127.0.0.1", () => r()));
  const scoutUrl = `http://127.0.0.1:${(scout.address() as any).port}/graphql`;
  t = await startTestServer("cp-ftcws-", { FTC_SCOUT_URL: scoutUrl, OWNER_EMAILS: "owner@test.local" });

  ownedTeam = await seedTeam(t.db, "Hypnotic Workspace");
  await t.db.execute({ sql: "UPDATE teams SET ftc_team_number = 4215 WHERE id = ?", args: [ownedTeam] });
  const adminId = await seedMember(t.db, ownedTeam, "Admin", "admin@test.local", "admin");
  admin = await t.session(adminId);
  await t.api("/api/auth/me", { session: admin });

  const other = await seedTeam(t.db, "Elsewhere");
  student = await t.session(await seedMember(t.db, other, "Student", "student@test.local"));
  await t.api("/api/auth/me", { session: student });

  // Two pre-existing workspaces share #11115 (from before the rule).
  for (const name of ["Dupe A", "Dupe B"]) {
    const id = await seedTeam(t.db, name);
    await t.db.execute({ sql: "UPDATE teams SET ftc_team_number = 11115 WHERE id = ?", args: [id] });
  }
  const ownerTeam = await seedTeam(t.db, "Owner Team");
  owner = await t.session(await seedMember(t.db, ownerTeam, "Owner", "owner@test.local", "admin"));
}, 120_000);
afterAll(async () => {
  await t?.stop();
  await new Promise((r) => scout?.close(r));
});

describe("one workspace per FTC number", () => {
  it("the public lookup says when a number is already claimed", async () => {
    const taken = await t.api("/api/ftc/lookup-public?number=4215");
    expect(taken.body).toMatchObject({ name: "Hypnotic", claimed: true });
    const free = await t.api("/api/ftc/lookup-public?number=20000");
    expect(free.body).toMatchObject({ name: "Fresh Bots", claimed: false });
  });

  it("any signed-in account can create a workspace from its FTC number; a taken number is refused", async () => {
    const taken = await t.post("/api/teams", { ftc_number: "4215" }, student);
    expect(taken.status).toBe(409);
    expect(taken.body.ftcTaken).toEqual({ number: 4215 });
    const created = await t.post("/api/teams", { ftc_number: "20000" }, student);
    expect(created.status).toBe(200);
    expect(created.body.team).toMatchObject({ name: "Fresh Bots", ftc_team_number: 20000 });
    // And now #20000 is claimed too.
    expect((await t.post("/api/teams", { ftc_number: "20000" }, admin)).status).toBe(409);
  });

  it("two simultaneous claims of a free number: exactly one wins", async () => {
    const side = await seedTeam(t.db, "Racers");
    const s1 = await t.session(await seedMember(t.db, side, "Racer 1", "racer1@test.local"));
    const s2 = await t.session(await seedMember(t.db, side, "Racer 2", "racer2@test.local"));
    const [a, b] = await Promise.all([
      t.post("/api/teams", { ftc_number: "20001" }, s1),
      t.post("/api/teams", { ftc_number: "20001" }, s2),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const n = (await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM teams WHERE ftc_team_number = 20001", args: [] })).rows[0] as any;
    expect(Number(n.n)).toBe(1);
  });

  it("a workspace without an FTC number still needs a name", async () => {
    expect((await t.post("/api/teams", {}, student)).status).toBe(400);
    const r = await t.post("/api/teams", { name: "Garage Club" }, student);
    expect(r.status).toBe(200);
    expect(r.body.team.ftc_team_number).toBeNull();
  });

  it("admin signup with a taken number is refused; asking to join files a request", async () => {
    const r = await t.post("/api/auth/signup", { accountType: "admin", name: "Late", email: "late@test.local", password: "pass-word-1", teamNumber: "4215" });
    expect(r.status).toBe(409);
    expect(r.body.ftcTaken.number).toBe(4215);
    const ask = await t.post("/api/auth/signup", { accountType: "student", name: "Late", email: "late@test.local", password: "pass-word-1", requestFtcNumber: 4215 });
    expect(ask.status).toBe(200);
    expect(ask.body).toMatchObject({ pendingApproval: true, team: { name: "Hypnotic Workspace" } });
    const reqs = await t.api("/api/join-requests", { session: admin });
    expect(reqs.body.find((x: any) => x.email === "late@test.local")).toMatchObject({ source: "ftc" });
    // No account exists until someone approves.
    const n = (await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM members WHERE email = 'late@test.local'", args: [] })).rows[0] as any;
    expect(Number(n.n)).toBe(0);
  });

  it("a signed-in account can ask to join by number", async () => {
    const r = await t.post("/api/teams/request-join", { ftc_number: 4215 }, student);
    expect(r.status).toBe(200);
    expect(r.body.pendingApproval).toBe(true);
    expect((await t.post("/api/teams/request-join", { ftc_number: 4215 }, admin)).status).toBe(400); // already in
    expect((await t.post("/api/teams/request-join", { ftc_number: 31337 }, student)).status).toBe(404);
  });

  it("connecting a number held by another workspace is refused; existing duplicates keep theirs", async () => {
    const r = await t.patch(`/api/teams/${ownedTeam}`, { ftc_team_number: 11115 }, admin);
    expect(r.status).toBe(409);
    // A save that fails validation changes nothing, not even a free number.
    const bad = await t.patch(`/api/teams/${ownedTeam}`, { ftc_team_number: 20000 + 99, timezone: "Mars/Olympus" }, admin);
    expect(bad.status).toBe(400);
    const still = (await t.db.execute({ sql: "SELECT ftc_team_number FROM teams WHERE id = ?", args: [ownedTeam] })).rows[0] as any;
    expect(Number(still.ftc_team_number)).toBe(4215);
    // Re-saving its own number is fine.
    expect((await t.patch(`/api/teams/${ownedTeam}`, { ftc_team_number: 4215 }, admin)).status).toBe(200);
  });

  it("the owner can list pre-existing duplicates (read-only)", async () => {
    expect((await t.api("/api/owner/ftc-duplicates", { session: admin })).status).toBe(403);
    const r = await t.api("/api/owner/ftc-duplicates", { session: owner });
    expect(r.status).toBe(200);
    const g = r.body.find((x: any) => x.ftc === 11115);
    expect(g.teams.map((x: any) => x.name)).toEqual(["Dupe A", "Dupe B"]);
  });
});

/**
 * Feature parity, Phase 0: per-workspace module switches and robot
 * subsystems. Admins set them in Settings or by confirming Bruno's
 * ```workspace card; everyone else is refused. Bruno's workspace facts list
 * them so it can answer questions and avoid hidden pages.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { loadWorkspaceFacts, formatWorkspaceFacts } from "../workspaceFacts";
import { nextDisabledModules, parseWorkspaceChange } from "../brunoWorkspace";
import { DEFAULT_SUBSYSTEMS, cleanSubsystems, isNavIdDisabled, parseDisabledModules, parseSubsystems } from "../../src/types/teamModules";

vi.setConfig({ testTimeout: 30_000 });

describe("teamModules helpers", () => {
  it("parses stored switches, ignoring unknown ids and bad JSON", () => {
    expect(parseDisabledModules(null)).toEqual([]);
    expect(parseDisabledModules("not json")).toEqual([]);
    expect(parseDisabledModules('["code","nope","code","predict"]')).toEqual(["code", "predict"]);
  });
  it("CAD sub-pages follow the CAD switch; Dashboard and Members can't be switched off", () => {
    expect(isNavIdDisabled("cad-parts", ["cad"])).toBe(true);
    expect(isNavIdDisabled("cad", ["code"])).toBe(false);
    expect(isNavIdDisabled("dashboard", ["dashboard"])).toBe(false);
    expect(isNavIdDisabled("teams", ["teams"])).toBe(false);
  });
  it("subsystems default until saved, and are cleaned", () => {
    expect(parseSubsystems(null)).toEqual([...DEFAULT_SUBSYSTEMS]);
    expect(parseSubsystems('["Lift"]')).toEqual(["Lift"]);
    expect(cleanSubsystems(["  Lift ", "lift", "", 4, "A".repeat(50)])).toEqual(["Lift", "A".repeat(32)]);
  });
  it("Bruno's change: switching on wins over off, unknown ids are dropped", () => {
    expect(parseWorkspaceChange({ disable: ["code", "predict", "zzz"], enable: ["predict"] })).toEqual({ disable: ["code"], enable: ["predict"] });
    expect(parseWorkspaceChange({ disable: ["zzz"] })).toBeNull();
    expect(parseWorkspaceChange({ subsystems: [] })).toBeNull();
    expect(nextDisabledModules(["budget", "predict"], { disable: ["code"], enable: ["predict"] }).sort()).toEqual(["budget", "code"]);
  });
});

let t: TestServer;
let team = 0;
let admin = "";
let student = "";
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const dbGet = async (sql: string, ...args: any[]) => (await dbAll(sql, ...args))[0];

beforeAll(async () => {
  t = await startTestServer("cp-modules-");
  team = await seedTeam(t.db, "Modules Team");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@mod.test", "admin"));
  student = await t.session(await seedMember(t.db, team, "Sam", "sam@mod.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("PATCH /api/teams/:id — modules and subsystems", () => {
  it("admins switch modules off and on; the team list carries them", async () => {
    let r = await t.patch(`/api/teams/${team}`, { disabled_modules: ["code", "predict"] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = (await t.api("/api/teams", { session: admin })).body;
    expect(parseDisabledModules(list.find((x: any) => x.id === team).disabled_modules)).toEqual(["code", "predict"]);
    r = await t.patch(`/api/teams/${team}`, { disabled_modules: [] }, admin);
    expect(r.status).toBe(200);
    expect((await dbGet("SELECT disabled_modules FROM teams WHERE id = ?", team)).disabled_modules).toBeNull();
  });

  it("refuses unknown modules, bad subsystem lists and non-admins", async () => {
    expect((await t.patch(`/api/teams/${team}`, { disabled_modules: ["dashboard"] }, admin)).status).toBe(400);
    expect((await t.patch(`/api/teams/${team}`, { subsystems: [] }, admin)).status).toBe(400);
    expect((await t.patch(`/api/teams/${team}`, { subsystems: Array.from({ length: 21 }, (_, i) => `S${i}`) }, admin)).status).toBe(400);
    expect((await t.patch(`/api/teams/${team}`, { disabled_modules: ["code"] }, student)).status).toBe(403);
  });

  it("saves cleaned subsystems; null restores the defaults", async () => {
    expect((await t.patch(`/api/teams/${team}`, { subsystems: ["Drivetrain", " Lift ", "lift"] }, admin)).status).toBe(200);
    expect(JSON.parse((await dbGet("SELECT subsystems FROM teams WHERE id = ?", team)).subsystems)).toEqual(["Drivetrain", "Lift"]);
    expect((await t.patch(`/api/teams/${team}`, { subsystems: null }, admin)).status).toBe(200);
    expect((await dbGet("SELECT subsystems FROM teams WHERE id = ?", team)).subsystems).toBeNull();
  });
});

describe("Bruno: workspace settings", () => {
  it("an admin's confirmed card switches modules and replaces subsystems", async () => {
    await t.patch(`/api/teams/${team}`, { disabled_modules: ["budget"] }, admin);
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ disable: ["code"], enable: ["budget"], subsystems: ["Drivetrain", "Lift"] }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.applied).toEqual({ workspace: 1 });
    const row = await dbGet("SELECT disabled_modules, subsystems FROM teams WHERE id = ?", team);
    expect(parseDisabledModules(row.disabled_modules)).toEqual(["code"]);
    expect(JSON.parse(row.subsystems)).toEqual(["Drivetrain", "Lift"]);
  });

  it("applies every change the card showed, and a subsystem-only change leaves the switches alone", async () => {
    await t.patch(`/api/teams/${team}`, { disabled_modules: ["code"] }, admin);
    let r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ disable: ["predict"] }, { disable: ["budget"] }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(parseDisabledModules((await dbGet("SELECT disabled_modules FROM teams WHERE id = ?", team)).disabled_modules).sort()).toEqual(["budget", "code", "predict"]);
    await t.patch(`/api/teams/${team}`, { disabled_modules: ["code"] }, admin);
    const before = (await dbGet("SELECT disabled_modules FROM teams WHERE id = ?", team)).disabled_modules;
    r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ subsystems: ["Drivetrain", "Lift"] }] }] }, admin);
    expect(r.status).toBe(200);
    expect((await dbGet("SELECT disabled_modules FROM teams WHERE id = ?", team)).disabled_modules).toBe(before);
  });

  it("two admins confirming at once both land", async () => {
    await t.patch(`/api/teams/${team}`, { disabled_modules: ["code"] }, admin);
    const [a, b] = await Promise.all([
      t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ disable: ["predict"] }] }] }, admin),
      t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ disable: ["budget"] }] }] }, admin),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(parseDisabledModules((await dbGet("SELECT disabled_modules FROM teams WHERE id = ?", team)).disabled_modules).sort()).toEqual(["budget", "code", "predict"]);
    await t.patch(`/api/teams/${team}`, { disabled_modules: ["code"] }, admin);
  });

  it("a member without admin rights is refused and nothing changes", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ enable: ["code"] }] }] }, student);
    expect(r.status).toBe(403);
    expect(parseDisabledModules((await dbGet("SELECT disabled_modules FROM teams WHERE id = ?", team)).disabled_modules)).toEqual(["code"]);
  });

  it("workspace facts tell Bruno which modules are off and the subsystems", async () => {
    const facts = await loadWorkspaceFacts({ dbGet, dbAll }, team, "America/New_York");
    expect(facts?.disabledModules).toEqual(["code"]);
    expect(facts?.subsystems).toEqual(["Drivetrain", "Lift"]);
    const text = formatWorkspaceFacts(facts!);
    expect(text).toMatch(/Modules switched off for this team .*Code \(code\)/);
    expect(text).toMatch(/Robot subsystems .*"Drivetrain", "Lift"/);
  });
});

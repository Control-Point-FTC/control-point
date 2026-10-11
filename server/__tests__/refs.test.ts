// Stable links: every type resolves to its route for someone who can see it,
// and to the same "unavailable" for hidden, missing or other-team records, so
// a link never confirms that something hidden exists.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, other: number, admin: number, student: number, outsider: number;
let adminSession: string, studentSession: string, outsiderSession: string;
const human = (memberId: number, teamId = team): NotebookContext => ({ memberId, teamId, source: "human" });
const insert = async (sql: string, ...args: any[]) => Number((await t.db.execute({ sql, args })).lastInsertRowid);
const ref = async (session: string, type: string, id: number, linkTeam?: number) => (await t.api(`/api/refs/${type}/${id}${linkTeam ? `?team=${linkTeam}` : ""}`, { session })).body;
const now = new Date().toISOString();

beforeAll(async () => {
  t = await startTestServer("cp-refs-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  other = await seedTeam(t.db, "Rivals");
  admin = await seedMember(t.db, team, "Admin", "admin@refs.test", "admin");
  student = await seedMember(t.db, team, "Sam", "sam@refs.test");
  outsider = await seedMember(t.db, other, "Olu", "olu@refs.test");
  adminSession = await t.session(admin);
  studentSession = await t.session(student);
  outsiderSession = await t.session(outsider);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("resolving each type", () => {
  it("opens tasks, events and inventory in their pages, and hides them from other teams", async () => {
    const task = await insert("INSERT INTO tasks(team_id,title) VALUES(?,?)", team, "Wire drivetrain");
    const event = await insert("INSERT INTO events(team_id,title,date) VALUES(?,?,?)", team, "Build day", "2026-10-20");
    const part = await insert("INSERT INTO inventory(team_id,name,sku,date_added) VALUES(?,?,?,?)", team, "M3 bolts", `sku-${Date.now()}`, now);
    expect(await ref(studentSession, "task", task)).toEqual({ status: "ok", type: "task", id: task, label: "Wire drivetrain", href: `/tasks?task=${task}` });
    expect(await ref(studentSession, "event", event)).toMatchObject({ status: "ok", label: "Build day", href: `/calendar?event=${event}` });
    expect(await ref(studentSession, "inventory", part)).toMatchObject({ status: "ok", label: "M3 bolts", href: `/inventory?item=${part}` });
    for (const [type, id] of [["task", task], ["event", event], ["inventory", part]] as const)
      expect(await ref(outsiderSession, type, id)).toEqual({ status: "unavailable", type, id });
  });

  it("keeps board tasks from non-admins without confirming they exist", async () => {
    const board = await insert("INSERT INTO tasks(team_id,title,is_board) VALUES(?,?,1)", team, "Budget vote");
    expect(await ref(adminSession, "task", board)).toMatchObject({ status: "ok", label: "Budget vote" });
    expect(await ref(studentSession, "task", board)).toEqual(await ref(studentSession, "task", 999_999).then(r => ({ ...r, id: board })));
  });

  it("follows notebook rules: protected is unavailable, trash is deleted only for those who could see it", async () => {
    const tree = await store.tree(human(admin));
    const section = tree.sections[0].id;
    const open: any = await store.create(human(admin), "page", { sectionId: section, title: "Drive notes" });
    const secret: any = await store.create(human(admin), "page", { sectionId: section, title: "Sponsor plan" });
    await store.protect(human(admin), "page", secret.id, true);
    const gone: any = await store.create(human(admin), "page", { sectionId: section, title: "Old intake" });
    await store.remove(human(admin), "page", gone.id);
    const goneSecret: any = await store.create(human(admin), "page", { sectionId: section, title: "Old sponsor plan" });
    await store.protect(human(admin), "page", goneSecret.id, true);
    await store.remove(human(admin), "page", goneSecret.id);
    expect(await ref(studentSession, "page", open.id)).toMatchObject({ status: "ok", label: "Drive notes", href: `/notebook/p/${open.id}` });
    expect(await ref(studentSession, "section", section)).toMatchObject({ status: "ok", href: `/notebook?section=${section}` });
    expect(await ref(studentSession, "page", secret.id)).toEqual({ status: "unavailable", type: "page", id: secret.id });
    expect(await ref(adminSession, "page", secret.id)).toMatchObject({ status: "ok", label: "Sponsor plan" });
    expect(await ref(studentSession, "page", gone.id)).toEqual({ status: "deleted", type: "page", id: gone.id, label: "Old intake" });
    expect(await ref(studentSession, "page", goneSecret.id)).toEqual({ status: "unavailable", type: "page", id: goneSecret.id });
    expect(await ref(adminSession, "page", goneSecret.id)).toMatchObject({ status: "deleted", label: "Old sponsor plan" });
  });

  it("opens teammates, shows removed ones as gone, and never reveals another team's people", async () => {
    const left = await seedMember(t.db, team, "Lee", "lee@refs.test");
    await t.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [left] });
    expect(await ref(studentSession, "member", admin)).toMatchObject({ status: "ok", label: "Admin", href: `/teams?member=${admin}` });
    expect(await ref(studentSession, "member", left)).toEqual({ status: "deleted", type: "member", id: left, label: "Lee" });
    expect(await ref(studentSession, "member", outsider)).toEqual({ status: "unavailable", type: "member", id: outsider });
  });

  it("opens files (not notebook attachments), CAD records and scouting entries", async () => {
    const file = await insert("INSERT INTO stored_files(team_id,member_id,kind,filename,mime_type,size,data) VALUES(?,?,?,?,?,?,?)", team, admin, "task", "wiring.pdf", "application/pdf", 3, new Uint8Array([1, 2, 3]));
    const attachment = await insert("INSERT INTO stored_files(team_id,member_id,kind,filename,mime_type,size,data) VALUES(?,?,?,?,?,?,?)", team, admin, "notebook", "page.pdf", "application/pdf", 3, new Uint8Array([1, 2, 3]));
    expect(await ref(studentSession, "file", file)).toMatchObject({ status: "ok", label: "wiring.pdf", href: `/api/files/${file}` });
    expect(await ref(studentSession, "file", attachment)).toEqual({ status: "unavailable", type: "file", id: attachment });
    const doc = await insert("INSERT INTO cad_docs(team_id,name,url,created_at) VALUES(?,?,?,?)", team, "Drivetrain CAD", "https://cad.onshape.com/x", now);
    const part = await insert("INSERT INTO cad_parts(team_id,name,created_at,updated_at) VALUES(?,?,?,?)", team, "Hex shaft", now, now);
    const review = await insert("INSERT INTO cad_reviews(team_id,title,created_at,updated_at) VALUES(?,?,?,?)", team, "Intake v2", now, now);
    const snap = await insert("INSERT INTO cad_snapshots(team_id,title,file_url,file_name,file_type,created_at) VALUES(?,?,?,?,?,?)", team, "Arm", "/api/files/1", "arm.step", "step", now);
    expect(await ref(studentSession, "cad_doc", doc)).toMatchObject({ status: "ok", label: "Drivetrain CAD", href: `/cad-docs?id=${doc}` });
    expect(await ref(studentSession, "cad_part", part)).toMatchObject({ status: "ok", href: `/cad-parts?id=${part}` });
    expect(await ref(studentSession, "cad_review", review)).toMatchObject({ status: "ok", href: `/cad-reviews?id=${review}` });
    expect(await ref(studentSession, "cad_snapshot", snap)).toMatchObject({ status: "ok", href: `/cad-snapshots?id=${snap}` });
    const entry = await insert("INSERT INTO scouting_entries(team_id,uuid,season,scouted_team,match_label,event_code,template_id,updated_at) VALUES(?,?,?,?,?,?,?,?)", team, `u-${Date.now()}`, 2025, 12345, "Q12", "USCAFFL", "default", Date.now());
    expect(await ref(studentSession, "scout", entry)).toMatchObject({ status: "ok", label: "Q12 · team 12345 · USCAFFL", href: `/stats?mode=scout&entry=${entry}` });
    await t.db.execute({ sql: "UPDATE scouting_entries SET deleted = 1 WHERE id = ?", args: [entry] });
    expect(await ref(studentSession, "scout", entry)).toMatchObject({ status: "deleted" });
  });
});

describe("links into another team", () => {
  it("asks to switch when the person belongs there and can see it, otherwise reads as unavailable", async () => {
    const twin = await seedMember(t.db, other, "Sam", "sam@refs.test");
    const theirs = await insert("INSERT INTO tasks(team_id,title) VALUES(?,?)", other, "Rival scouting sheet");
    const theirBoard = await insert("INSERT INTO tasks(team_id,title,is_board) VALUES(?,?,1)", other, "Rival budget");
    expect(await ref(studentSession, "task", theirs, other)).toEqual({ status: "switch_team", type: "task", id: theirs, teamId: other, teamName: "Rivals" });
    expect(await ref(studentSession, "task", theirBoard, other)).toEqual({ status: "unavailable", type: "task", id: theirBoard });
    expect(await ref(adminSession, "task", theirs, other)).toEqual({ status: "unavailable", type: "task", id: theirs });
    expect(twin).toBeGreaterThan(0);
  });

  it("rejects malformed links and requires sign-in", async () => {
    expect((await t.api("/api/refs/spaceship/1", { session: studentSession })).status).toBe(400);
    expect((await t.api("/api/refs/task/abc", { session: studentSession })).status).toBe(400);
    expect((await t.api("/api/refs/task/1")).status).toBe(401);
  });
});

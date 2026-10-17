/**
 * Feature parity, Phase 2.5: the pit display. Admins make one secret no-login
 * link per team; the screen shows this week's events, #announcements, the
 * check-in QR while a session runs and the next match at a live event. A new
 * link retires the old one; turning it off ends it. Bruno sees whether it's
 * on and can turn it on or off through the workspace card.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { nextMatchFor, pitText } from "../pitDisplay";

vi.setConfig({ testTimeout: 30_000 });

const m = (label: string, number: number, red: number[], blue: number[], played = false, scores?: [number, number]) => ({
  key: `qual::${number}`, level: "qual" as const, series: null, number, label, description: null, time: null, played,
  red: { teams: red.map((n) => ({ number: n, name: "" })), score: scores ? { total: scores[0] } as any : null },
  blue: { teams: blue.map((n) => ({ number: n, name: "" })), score: scores ? { total: scores[1] } as any : null },
  breakdownSource: null,
});

describe("pit display helpers", () => {
  it("finds our next unplayed match and how the last one went", () => {
    const matches = [
      m("Q-3", 3, [5, 6], [11115, 7]),
      m("Q-1", 1, [11115, 2], [3, 4], true, [80, 60]),
      m("Q-2", 2, [8, 9], [10, 12], true, [10, 20]),
    ];
    const r = nextMatchFor(matches as any, 11115);
    expect(r.next).toMatchObject({ label: "Q-3", alliance: "blue", partners: [7], opponents: [5, 6] });
    expect(r.last).toMatchObject({ label: "Q-1", alliance: "red", result: { us: 80, them: 60, outcome: "W" } });
    expect(nextMatchFor([] as any, 11115)).toEqual({ next: null, last: null });
  });
  it("turns a chat post into plain text for a big screen", () => {
    expect(pitText("**Bus leaves at 7** — see [the plan](https://x.y) @[Ana Lee]")).toBe("Bus leaves at 7 — see the plan @Ana Lee");
    expect(pitText("x".repeat(400)).length).toBe(280);
  });
});

let t: TestServer;
let team = 0;
let admin = "", member = "";
let adminId = 0;

beforeAll(async () => {
  t = await startTestServer("cp-pit-");
  team = await seedTeam(t.db, "Robo");
  adminId = await seedMember(t.db, team, "Ada", "ada@pit.test", "admin");
  admin = await t.session(adminId);
  member = await t.session(await seedMember(t.db, team, "Ana", "ana@pit.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("pit display link", () => {
  it("admins make, replace and turn off the link; members can't", async () => {
    expect((await t.api("/api/pit-display", { session: member })).status).toBe(403);
    expect((await t.post("/api/pit-display", {}, member)).status).toBe(403);
    expect((await t.api("/api/pit-display", { session: admin })).body.url).toBeNull();
    const first = (await t.post("/api/pit-display", {}, admin)).body.url as string;
    expect(first).toMatch(/\/pit\/[A-Za-z0-9_-]{24,64}$/);
    // Asking again keeps the same link; reset replaces it.
    expect((await t.post("/api/pit-display", {}, admin)).body.url).toBe(first);
    const second = (await t.post("/api/pit-display", { reset: true }, admin)).body.url as string;
    expect(second).not.toBe(first);
    expect((await t.api(`/api/pit/${first.split("/pit/")[1]}`)).status).toBe(404);
    expect((await t.api(`/api/pit/${second.split("/pit/")[1]}`)).status).toBe(200);
    expect((await t.api("/api/pit-display", { method: "DELETE", session: admin, headers: { "x-cp-client": "1" } })).status).toBe(200);
    expect((await t.api(`/api/pit/${second.split("/pit/")[1]}`)).status).toBe(404);
    expect((await t.api("/api/pit/not-a-token")).status).toBe(404);
  });

  it("shows this week's events, #announcements and the live check-in, with no sign-in", async () => {
    const token = ((await t.post("/api/pit-display", {}, admin)).body.url as string).split("/pit/")[1];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const plus = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    await t.post("/api/events", { title: "Build night", date: plus(1), start_time: "18:00", end_time: "20:00", location: "Shop" }, admin);
    await t.post("/api/events", { title: "Too far out", date: plus(10) }, admin);
    const ch = Number((await t.db.execute({ sql: "INSERT INTO chat_channels (team_id, name) VALUES (?, 'announcements')", args: [team] })).lastInsertRowid);
    const gen = Number((await t.db.execute({ sql: "INSERT INTO chat_channels (team_id, name) VALUES (?, 'general')", args: [team] })).lastInsertRowid);
    const ts = new Date().toISOString();
    await t.db.execute({ sql: "INSERT INTO messages (team_id, sender_id, content, timestamp, channel_id) VALUES (?, ?, '**Bring safety glasses**', ?, ?)", args: [team, adminId, ts, ch] });
    await t.db.execute({ sql: "INSERT INTO messages (team_id, sender_id, content, timestamp, channel_id) VALUES (?, ?, 'just chatting', ?, ?)", args: [team, adminId, ts, gen] });
    await t.db.execute({ sql: "INSERT INTO messages (team_id, sender_id, content, timestamp, channel_id, deleted_at) VALUES (?, ?, 'deleted one', ?, ?, ?)", args: [team, adminId, ts, ch, ts] });
    await t.post("/api/attendance/qr-session", { durationMinutes: 60 }, admin);

    const r = await t.api(`/api/pit/${token}`);
    expect(r.status).toBe(200);
    expect(r.body.team.name).toBe("Robo");
    expect(r.body.events.map((e: any) => e.title)).toEqual(["Build night"]);
    expect(r.body.announcements).toEqual([expect.objectContaining({ text: "Bring safety glasses", by: "Ada" })]);
    expect(r.body.checkin).toMatchObject({ code: expect.any(String), url: expect.stringMatching(/\/checkin\//) });
    expect(r.body.match).toBeNull(); // no live official event
  });

  it("Bruno: facts say whether it's on, and the workspace card turns it on or off", async () => {
    const db = { dbGet: async (sql: string, ...a: any[]) => (await t.db.execute({ sql, args: a })).rows[0], dbAll: async (sql: string, ...a: any[]) => (await t.db.execute({ sql, args: a })).rows as any[] };
    const { loadWorkspaceFacts, formatWorkspaceFacts } = await import("../workspaceFacts");
    const facts = async () => formatWorkspaceFacts((await loadWorkspaceFacts(db as any, team, "UTC", new Date()))!);
    expect(await facts()).toMatch(/Pit display .*: on/);
    // Members can't change it through Bruno either.
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ pit_display: false }] }] }, member)).status).toBe(403);
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ pit_display: false }] }] }, admin)).status).toBe(200);
    expect(await facts()).toMatch(/Pit display .*: off/);
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ pit_display: true }] }] }, admin)).status).toBe(200);
    expect((await t.api("/api/pit-display", { session: admin })).body.url).toMatch(/\/pit\//);
    // On again keeps the same link.
    const url = (await t.api("/api/pit-display", { session: admin })).body.url;
    await t.post("/api/ai/apply-actions", { actions: [{ kind: "workspace", items: [{ pit_display: true }] }] }, admin);
    expect((await t.api("/api/pit-display", { session: admin })).body.url).toBe(url);
  });
});

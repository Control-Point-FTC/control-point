/**
 * Notification controls (audit item 26): team updates follow each member's
 * choice (instant / digest / off), digests arrive as one summary, @everyone
 * respects opt-outs and a per-sender cap, and admin changes to your roles
 * always reach you.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { DEFAULT_PREFS, PingLimiter, digestText, parsePrefs, prefsPatch } from "../notifyPrefs";

vi.setConfig({ testTimeout: 30_000 });

describe("notifyPrefs helpers", () => {
  it("defaults anything missing or invalid", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"team_updates":"loud","everyone_pings":"yes"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"team_updates":"off","everyone_pings":false}')).toEqual({ team_updates: "off", everyone_pings: false });
  });
  it("validates patches", () => {
    expect(prefsPatch({ team_updates: "instant" })).toEqual({ patch: { team_updates: "instant" } });
    expect(prefsPatch({ team_updates: "sometimes" })).toHaveProperty("error");
    expect(prefsPatch({ everyone_pings: "no" })).toHaveProperty("error");
    expect(prefsPatch({ other: 1 })).toHaveProperty("error");
  });
  it("writes a readable digest", () => {
    expect(digestText("Robo", ["budget", "outreach", "budget", "event"])).toBe("Robo: 2 budget entries, 1 outreach event and 1 calendar event were added.");
    expect(digestText("Robo", ["event"])).toBe("Robo: 1 calendar event was added.");
    expect(digestText("Robo", [])).toBe("");
  });
  it("caps pings per sender per window", () => {
    const l = new PingLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => l.allow(1, 7, 0))).toEqual([true, true, true, false]);
    expect(l.allow(1, 8, 0)).toBe(true); // someone else
    expect(l.allow(1, 7, 1500)).toBe(true); // window passed
  });
});

let t: TestServer;
let team = 0;
const ids: Record<string, number> = {};
const sess: Record<string, string> = {};

beforeAll(async () => {
  t = await startTestServer("cp-notify-", { NOTIFY_DIGEST_FLUSH_MS: "300" });
  team = await seedTeam(t.db, "Robo");
  ids.admin = await seedMember(t.db, team, "Admin", "admin@n.test", "admin");
  ids.instant = await seedMember(t.db, team, "Instant", "instant@n.test");
  ids.digest = await seedMember(t.db, team, "Digest", "digest@n.test");
  ids.off = await seedMember(t.db, team, "Off", "off@n.test");
  // A second workspace row for the same person: prefs follow the account.
  const other = await seedTeam(t.db, "Other");
  ids.instantElsewhere = await seedMember(t.db, other, "Instant", "instant@n.test");
  for (const k of ["admin", "instant", "digest", "off"]) sess[k] = await t.session(ids[k]);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const count = async (sql: string, ...args: any[]) => Number(((await t.db.execute({ sql, args })).rows[0] as any).n);
// Read notifications through the API: a second process polling the SQLite
// file while the server writes can make those writes fail with SQLITE_BUSY.
const notes = async (who: string) => {
  const r = await t.api(`/api/notifications/${ids[who]}`, { session: sess[who] });
  return Array.isArray(r.body) ? r.body.length : 0;
};
const lastNote = async (who: string) => {
  const r = await t.api(`/api/notifications/${ids[who]}`, { session: sess[who] });
  const list = Array.isArray(r.body) ? r.body : [];
  return list.reduce((a: any, b: any) => (!a || Number(b.id) > Number(a.id) ? b : a), null);
};
const queued = (id: number) => count("SELECT COUNT(*) AS n FROM notification_digest WHERE member_id = ?", id);
/** Poll until `check` holds (fire-and-forget writes can lag under load). */
const until = async (check: () => Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await new Promise((r) => setTimeout(r, 250)); }
};

describe("preferences API", () => {
  it("reads defaults, validates, and saves on every row of the account", async () => {
    const r = await t.api("/api/notification-prefs", { session: sess.instant });
    expect(r.body).toEqual(DEFAULT_PREFS);
    expect((await t.patch("/api/notification-prefs", { team_updates: "loud" }, sess.instant)).status).toBe(400);
    const ok = await t.patch("/api/notification-prefs", { team_updates: "instant" }, sess.instant);
    expect(ok.body).toEqual({ team_updates: "instant", everyone_pings: true });
    const elsewhere = (await t.db.execute({ sql: "SELECT notify_prefs FROM members WHERE id = ?", args: [ids.instantElsewhere] })).rows[0] as any;
    expect(parsePrefs(elsewhere.notify_prefs).team_updates).toBe("instant");
    await t.patch("/api/notification-prefs", { team_updates: "off", everyone_pings: false }, sess.off);
  });
});

describe("team updates", () => {
  it("instant notifies now, digest queues, off stays quiet, and the actor is skipped", async () => {
    const before = { admin: await notes('admin'), instant: await notes('instant'), digest: await notes('digest'), off: await notes('off') };
    const r = await t.post("/api/outreach", { title: "Library demo", date: "2026-11-01", location: "Library" }, sess.admin);
    expect(r.status).toBe(200);
    await until(async () => (await notes('instant')) === before.instant + 1);
    await new Promise((res) => setTimeout(res, 300)); // the queue insert lands with it
    expect(await notes('instant')).toBe(before.instant + 1);
    expect(await notes('off')).toBe(before.off);
    expect(await notes('admin')).toBe(before.admin);
    expect(await queued(ids.digest)).toBe(1);
    expect(await queued(ids.off)).toBe(0);
  });

  it("a due digest arrives as one summary and empties the queue", async () => {
    // Count first, then queue the extra item and age the whole queue past the
    // digest window in one statement: the flush runs every 300 ms, and if it
    // fired between separate statements it would send a partial digest early.
    const before = await notes('digest');
    await t.db.execute({
      sql: "INSERT INTO notification_digest (member_id, team_id, kind, content, meta, created_at) VALUES (?, ?, 'event', 'x', '{\"count\":2}', ?)",
      args: [ids.digest, team, new Date().toISOString()],
    });
    await t.db.execute({ sql: "UPDATE notification_digest SET created_at = ? WHERE member_id = ?", args: [new Date(Date.now() - 5 * 3600_000).toISOString(), ids.digest] });
    await until(async () => (await notes('digest')) === before + 1);
    expect(await notes('digest')).toBe(before + 1);
    expect(await queued(ids.digest)).toBe(0);
    const last = await lastNote('digest');
    expect(last.content).toBe("Robo: 1 outreach event and 2 calendar events were added.");
  });
});

describe("@everyone", () => {
  it("skips members who opted out and stops fanning out after 3 pings an hour", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: sess.admin }));
    await new Promise((r) => setTimeout(r, 400));
    const before = { instant: await notes('instant'), off: await notes('off') };
    for (let i = 0; i < 4; i++) {
      ws.send(JSON.stringify({ type: "chat", content: `@everyone standup ${i}` }));
      await new Promise((r) => setTimeout(r, 250));
    }
    await until(async () => (await notes('instant')) >= before.instant + 3);
    await new Promise((r) => setTimeout(r, 300)); // a 4th fan-out would land by now
    ws.close();
    expect(await notes('instant')).toBe(before.instant + 3);
    expect(await notes('off')).toBe(before.off);
    // All four messages still posted.
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE content LIKE '@everyone standup %'")).toBe(4);
  });
});

describe("admin changes to your roles", () => {
  it("are always delivered to the member they affect", async () => {
    const role = (await t.db.execute({ sql: "SELECT id FROM roles WHERE team_id = ? AND is_system = 0 LIMIT 1", args: [team] })).rows[0] as any
      ?? { id: Number((await t.post("/api/roles", { name: "Drive Team", color: "#3B82F6", permissions: [] }, sess.admin)).body.id) };
    const before = await notes('off'); // even with team updates off
    const r = await t.post(`/api/members/${ids.off}/roles`, { role_id: Number(role.id) }, sess.admin);
    expect(r.status).toBe(200);
    await until(async () => (await notes('off')) === before + 1);
    expect(await notes('off')).toBe(before + 1);
  });
});

describe("review regressions", () => {
  it("a workspace joined after saving inherits the choice", async () => {
    await t.patch("/api/notification-prefs", { everyone_pings: false }, sess.digest);
    const third = await seedTeam(t.db, "Third");
    ids.digestThird = await seedMember(t.db, third, "Digest", "digest@n.test");
    sess.digestThird = await t.session(ids.digestThird);
    const r = await t.api("/api/notification-prefs", { session: sess.digestThird });
    expect(r.body.everyone_pings).toBe(false);
    await t.patch("/api/notification-prefs", { everyone_pings: true }, sess.digest);
  });

  it("two quick saves both stick", async () => {
    const [a, b] = await Promise.all([
      t.patch("/api/notification-prefs", { team_updates: "instant" }, sess.digest),
      t.patch("/api/notification-prefs", { everyone_pings: false }, sess.digest),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const r = await t.api("/api/notification-prefs", { session: sess.digest });
    expect(r.body).toEqual({ team_updates: "instant", everyone_pings: false });
    await t.patch("/api/notification-prefs", { team_updates: "digest", everyone_pings: true }, sess.digest);
  });

  it("turning updates off drops what is already queued", async () => {
    await t.post("/api/outreach", { title: "Queued demo", date: "2026-11-02", location: "Gym" }, sess.admin);
    await new Promise((res) => setTimeout(res, 600));
    expect(await queued(ids.digest)).toBeGreaterThan(0);
    await t.patch("/api/notification-prefs", { team_updates: "off" }, sess.digest);
    expect(await queued(ids.digest)).toBe(0);
    await t.patch("/api/notification-prefs", { team_updates: "digest" }, sess.digest);
  });

  it("deleting or editing a whole role tells its holders", async () => {
    const created = await t.post("/api/roles", { name: "Pit Crew", color: "#22C55E", permissions: [] }, sess.admin);
    const roleId = Number(created.body.id);
    await t.post(`/api/members/${ids.instant}/roles`, { role_id: roleId }, sess.admin);
    await until(async () => (await lastNote("instant"))?.content?.includes("Pit Crew"));
    await t.patch(`/api/roles/${roleId}`, { permissions: ["view_ai"] }, sess.admin);
    await until(async () => String((await lastNote("instant"))?.content || "").includes("permissions changed"));
    expect((await lastNote("instant")).content).toBe("The Pit Crew role's permissions in Robo changed.");
    expect((await t.api(`/api/roles/${roleId}`, { method: "DELETE", session: sess.admin })).status).toBe(200);
    await until(async () => String((await lastNote("instant"))?.content || "").includes("was deleted"));
    expect((await lastNote("instant")).content).toBe("The Pit Crew role in Robo was deleted, so you no longer have it.");
  });
});

/**
 * Manual scouting (audit H-4): entries sync from devices, idempotently,
 * last-write-wins, author-only edits, tombstoned deletes, validated data.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "crypto";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { cleanScoutData, cleanScoutEntry, summarizeScouting, templateFor } from "../../src/utils/scouting";

vi.setConfig({ testTimeout: 30_000 });

const entry = (over: any = {}) => ({
  uuid: crypto.randomUUID(), season: 2025, scoutedTeam: 4215, eventCode: "USNJ1", matchLabel: "Q12",
  templateId: "decode-2025", data: { auto_leave: true, auto_artifacts: 3, teleop_artifacts: 12, base: "Full", driving: 4 },
  notes: "fast cycles", updatedAt: Date.now(), ...over,
});

describe("scouting data rules", () => {
  it("keeps only template fields, coerced and bounded", () => {
    const t = templateFor(2025);
    expect(cleanScoutData(t, { auto_artifacts: "7", teleop_artifacts: 99999, base: "Sideways", driving: 9, evil: "x", auto_leave: "true" }))
      .toEqual({ auto_artifacts: 7, teleop_artifacts: 200, auto_leave: true });
  });
  it("unknown seasons use the generic template; future clocks are clamped", () => {
    expect(templateFor(2031).id).toBe("generic");
    const c = cleanScoutEntry(entry({ updatedAt: Date.now() + 10 * 86400000 })) as any;
    expect(c.entry.updatedAt).toBeLessThanOrEqual(Date.now());
    expect((cleanScoutEntry(entry({ uuid: "nope" })) as any).error).toBeTruthy();
  });
  it("summarises per team", () => {
    const a = (cleanScoutEntry(entry({ data: { teleop_artifacts: 10, auto_leave: true, base: "Full" } })) as any).entry;
    const b = (cleanScoutEntry(entry({ data: { teleop_artifacts: 20, auto_leave: false, base: "Full" } })) as any).entry;
    const s = summarizeScouting([a, b, { ...a, uuid: crypto.randomUUID(), deleted: true }]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ team: 4215, entries: 2, averages: { teleop_artifacts: 15 }, shares: { auto_leave: 0.5 }, modes: { base: "Full" } });
  });
});

describe("scouting API", () => {
  let t: TestServer;
  let admin = "", scoutA = "", scoutB = "", ghost = "";
  beforeAll(async () => {
    t = await startTestServer("cp-scout-");
    const team = await seedTeam(t.db, "Scout Team");
    admin = await t.session(await seedMember(t.db, team, "Admin", "admin@test.local", "admin"));
    scoutA = await t.session(await seedMember(t.db, team, "A", "a@test.local"));
    scoutB = await t.session(await seedMember(t.db, team, "B", "b@test.local"));
    await t.api("/api/auth/me", { session: admin });
    const gone = await seedTeam(t.db, "Gone");
    const gid = await seedMember(t.db, gone, "Ghost", "ghost@test.local");
    ghost = await t.session(gid);
    await t.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [gid] });
  }, 120_000);
  afterAll(async () => { await t?.stop(); });

  it("syncs an entry, and re-sending it doesn't duplicate", async () => {
    const e = entry();
    const r1 = await t.post("/api/scouting/sync", { season: 2025, entries: [e] }, scoutA);
    expect(r1.status).toBe(200);
    expect(r1.body.results).toEqual([{ uuid: e.uuid, ok: true }]);
    const r2 = await t.post("/api/scouting/sync", { season: 2025, entries: [e] }, scoutA);
    expect(r2.body.entries.filter((x: any) => x.uuid === e.uuid)).toHaveLength(1);
    const got = r2.body.entries.find((x: any) => x.uuid === e.uuid);
    expect(got).toMatchObject({ scoutedTeam: 4215, eventCode: "USNJ1", scoutName: "A" });
  });

  it("last write wins: a late, older edit is ignored", async () => {
    const e = entry({ updatedAt: 2000 });
    await t.post("/api/scouting/sync", { season: 2025, entries: [e] }, scoutA);
    await t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, notes: "newer", updatedAt: 3000 }] }, scoutA);
    const r = await t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, notes: "older", updatedAt: 2500 }] }, scoutA);
    expect(r.body.entries.find((x: any) => x.uuid === e.uuid).notes).toBe("newer");
  });

  it("only the author or an admin can change an entry; deletes are tombstones", async () => {
    const e = entry();
    await t.post("/api/scouting/sync", { season: 2025, entries: [e] }, scoutA);
    const bad = await t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, notes: "hijack", updatedAt: Date.now() }] }, scoutB);
    expect(bad.body.results[0].ok).toBe(false);
    const del = await t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, deleted: true, updatedAt: Date.now() }] }, admin);
    expect(del.body.results[0].ok).toBe(true);
    const list = await t.api("/api/scouting/entries?season=2025", { session: scoutB });
    expect(list.body.entries.find((x: any) => x.uuid === e.uuid).deleted).toBe(true);
  });

  it("the same new entry arriving twice at once is saved once, newest version wins", async () => {
    const e = entry({ updatedAt: 5000 });
    const [a, b] = await Promise.all([
      t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, notes: "older", updatedAt: 5000 }] }, scoutA),
      t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, notes: "newer", updatedAt: 6000 }] }, scoutA),
    ]);
    expect(a.body.results[0].ok && b.body.results[0].ok).toBe(true);
    const list = await t.api("/api/scouting/entries?season=2025", { session: scoutA });
    const rows = list.body.entries.filter((x: any) => x.uuid === e.uuid);
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe("newer");
  });

  it("an entry's season never changes after it is saved", async () => {
    const e = entry();
    await t.post("/api/scouting/sync", { season: 2025, entries: [e] }, scoutA);
    await t.post("/api/scouting/sync", { season: 2025, entries: [{ ...e, season: 2024, updatedAt: Date.now() + 1 }] }, scoutA);
    const in2024 = await t.api("/api/scouting/entries?season=2024", { session: scoutA });
    expect(in2024.body.entries.find((x: any) => x.uuid === e.uuid)).toBeUndefined();
  });

  it("rejects bad input and teamless accounts", async () => {
    expect((await t.post("/api/scouting/sync", { entries: "x" }, scoutA)).status).toBe(400);
    const r = await t.post("/api/scouting/sync", { season: 2025, entries: [entry({ scoutedTeam: -1 })] }, scoutA);
    expect(r.body.results[0]).toMatchObject({ ok: false });
    expect((await t.api("/api/scouting/entries?season=2025", { session: ghost })).status).toBe(400);
    expect((await t.post("/api/scouting/sync", { entries: Array.from({ length: 201 }, () => entry()) }, scoutA)).status).toBe(400);
  });
});

// The durable FTC cache: write-through to the database and a last-good copy
// that survives a restart (a fresh in-memory map). Source-health tracking.
import { describe, it, expect, beforeEach } from "vitest";
import { DurableFtcCache, recordSourceOk, recordSourceFailure, sourceHealth, resetSourceHealth } from "../ftcStore";

function fakeDb() {
  const rows = new Map<string, { at: number; data: string }>();
  return {
    rows,
    dbGet: async (_sql: string, key: string) => {
      const r = rows.get(key);
      return r ? { at: r.at, data: r.data } : undefined;
    },
    dbRun: async (_sql: string, key: string, at: number, data: string) => {
      rows.set(key, { at, data });
    },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("DurableFtcCache", () => {
  it("writes through and serves the last good copy after a restart", async () => {
    const db = fakeDb();
    const before = new DurableFtcCache().attach(db);
    before.set("ftc:4215:2025", { at: 1000, data: { source: "first-events", data: { name: "Hypnotic" } } });
    await flush();
    expect(db.rows.has("ftc:4215:2025")).toBe(true);

    const after = new DurableFtcCache().attach(db); // process restarted
    expect(after.get("ftc:4215:2025")).toBeUndefined();
    const loaded = await after.load("ftc:4215:2025");
    expect(loaded).toEqual({ at: 1000, data: { source: "first-events", data: { name: "Hypnotic" } } });
    expect(after.get("ftc:4215:2025")).toEqual(loaded); // now in memory too
  });

  it("a missing key or a broken row is just a miss", async () => {
    const db = fakeDb();
    db.rows.set("bad", { at: 1, data: "{not json" });
    const c = new DurableFtcCache().attach(db);
    expect(await c.load("nope")).toBeUndefined();
    expect(await c.load("bad")).toBeUndefined();
  });

  it("works without a database (pure memory)", async () => {
    const c = new DurableFtcCache();
    c.set("k", { at: 1, data: 1 });
    expect(await c.load("k")).toEqual({ at: 1, data: 1 });
  });
});

describe("source health", () => {
  beforeEach(() => resetSourceHealth());
  it("is degraded after three straight failures and recovers on success", () => {
    expect(sourceHealth()["first-events"].status).toBe("unknown");
    recordSourceFailure("first-events", "timeout");
    recordSourceFailure("first-events", "timeout");
    expect(sourceHealth()["first-events"].status).toBe("ok");
    recordSourceFailure("first-events", "upstream 503");
    expect(sourceHealth()["first-events"]).toMatchObject({ status: "degraded", lastError: "upstream 503", consecutiveFailures: 3 });
    recordSourceOk("first-events");
    expect(sourceHealth()["first-events"]).toMatchObject({ status: "ok", consecutiveFailures: 0 });
  });
});

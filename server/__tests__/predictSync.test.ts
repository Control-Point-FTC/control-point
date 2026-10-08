/** Predict background sync: one season's outage never blocks the others. */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSeasons, dataAsOf } from "../predict/sync";
import { PredictStore } from "../predict/store";

describe("syncSeasons", () => {
  it("keeps going after a season fails and reports which one", async () => {
    const done: number[] = [];
    const store = {
      isComplete: (s: number) => s === 2023,
      syncScout: async (s: number) => { if (s === 2024) throw new Error("FTC Scout responded with HTTP 502"); done.push(s); return 1; },
      syncAdvancement: async () => 0,
    };
    const r = await syncSeasons(store, [2023, 2024, 2025], 2025);
    // 2023 is finished and two seasons back: skipped. 2024 failed; 2025 still synced.
    expect(done).toEqual([2025]);
    expect(r.errors).toEqual([{ season: 2024, message: "FTC Scout responded with HTTP 502" }]);
  });
});

describe("dataAsOf", () => {
  it("is the newest season's last download, read back from disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-predict-sync-"));
    try {
      const events = { data: { eventsSearch: [] } };
      const store = new PredictStore(dir, { scout: async () => events, advancement: async () => null, gapMs: 0 });
      expect(dataAsOf((s) => store.lastSync(s), [2024, 2025])).toBeNull();
      await store.syncScout(2024);
      const old = store.lastSync(2024);
      expect(old).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(dataAsOf((s) => store.lastSync(s), [2024, 2025])).toBe(old);
      await new Promise((r) => setTimeout(r, 5));
      await store.syncScout(2025);
      expect(dataAsOf((s) => store.lastSync(s), [2024, 2025])).toBe(store.lastSync(2025));
      // A sync where an event fails doesn't move the clock either.
      const done = store.lastSync(2025);
      const partial = new PredictStore(dir, {
        scout: async (q: string) => (q.includes("eventsSearch") ? { data: { eventsSearch: [{ code: "X1", type: "Qualifier", updatedAt: "1" }] } } : { errors: [{ message: "down" }] }),
        advancement: async () => null, gapMs: 0,
      });
      await new Promise((r) => setTimeout(r, 5));
      await partial.syncScout(2025);
      expect(partial.lastSync(2025)).toBe(done);
      // A failed download (event list unavailable) doesn't move the clock.
      const broken = new PredictStore(dir, { scout: async () => ({ errors: [{ message: "down" }] }), advancement: async () => null, gapMs: 0 });
      await expect(broken.syncScout(2025)).rejects.toThrow(/event list unavailable/);
      expect(broken.lastSync(2025)).toBe(store.lastSync(2025));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

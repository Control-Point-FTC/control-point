/**
 * Durable FTC data cache.
 *
 * Team Stats, Predict, Analyze and the dashboard season card all sit on
 * upstream feeds (FIRST Events, FTC Scout). The in-memory cache served the
 * last good copy when they failed — but only until the next restart or
 * deploy. This keeps the same Map-shaped hot path and writes every good
 * payload through to the database, so "last known good" survives restarts
 * and can be served during an outage at a competition.
 *
 * Also tracks per-source health (last success / failure and why), which the
 * API exposes so the UI can say *which* feed is down instead of guessing.
 */

export type CacheEntry = { at: number; data: any };
type DbFns = {
  dbGet: (sql: string, ...args: any[]) => Promise<any>;
  dbRun: (sql: string, ...args: any[]) => Promise<any>;
};

export class DurableFtcCache extends Map<string, CacheEntry> {
  private db: DbFns | null = null;
  private lastWriteErrorLog = 0;
  private loading = new Map<string, Promise<CacheEntry | undefined>>();

  attach(db: DbFns) {
    this.db = db;
    return this;
  }

  /** Memory first; otherwise the persisted last-good copy (loaded into memory). */
  async load(key: string): Promise<CacheEntry | undefined> {
    const mem = super.get(key);
    if (mem || !this.db) return mem;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const row = await this.db!.dbGet("SELECT at, data FROM ftc_cache WHERE key = ?", key);
        if (!row) return undefined;
        const entry: CacheEntry = { at: Number(row.at), data: JSON.parse(String(row.data)) };
        if (!super.has(key)) super.set(key, entry);
        return super.get(key);
      } catch {
        return undefined; // table missing pre-migration, or corrupt row: behave as a miss
      } finally {
        this.loading.delete(key);
      }
    })();
    this.loading.set(key, p);
    return p;
  }

  /** Store in memory and write through to the database (best effort). */
  override set(key: string, entry: CacheEntry): this {
    super.set(key, entry);
    if (this.db) {
      let json: string;
      try { json = JSON.stringify(entry.data); } catch { return this; }
      // Very large payloads (a full event with every match) are still fine
      // for SQLite, but cap them so one bad response can't bloat the table.
      if (json.length <= 2_000_000) {
        this.db.dbRun(
          "INSERT INTO ftc_cache (key, at, data) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at, data = excluded.data",
          key, entry.at, json,
        ).catch((e: any) => {
          // Requests still work from memory, but the restart fallback has
          // stopped being saved — say so (at most once a minute).
          const now = Date.now();
          if (now - this.lastWriteErrorLog > 60_000) {
            this.lastWriteErrorLog = now;
            console.error(`[ftc] saving the FTC cache failed (served from memory only): ${e?.message || e}`);
          }
        });
      }
    }
    return this;
  }
}

export type FtcSourceName = "first-events" | "ftc-scout";
export interface SourceHealth {
  lastOkAt: string | null;
  lastFailAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

const health: Record<FtcSourceName, SourceHealth> = {
  "first-events": { lastOkAt: null, lastFailAt: null, lastError: null, consecutiveFailures: 0 },
  "ftc-scout": { lastOkAt: null, lastFailAt: null, lastError: null, consecutiveFailures: 0 },
};

export function recordSourceOk(source: FtcSourceName) {
  const h = health[source];
  h.lastOkAt = new Date().toISOString();
  h.consecutiveFailures = 0;
}

export function recordSourceFailure(source: FtcSourceName, reason: string) {
  const h = health[source];
  h.lastFailAt = new Date().toISOString();
  h.lastError = String(reason || "unknown").slice(0, 200);
  h.consecutiveFailures++;
}

/** "ok" until a source has failed 3+ times in a row since its last success. */
export function sourceHealth(): Record<FtcSourceName, SourceHealth & { status: "ok" | "degraded" | "unknown" }> {
  const out: any = {};
  for (const [k, h] of Object.entries(health) as [FtcSourceName, SourceHealth][]) {
    const status = h.consecutiveFailures >= 3 ? "degraded" : h.lastOkAt || h.lastFailAt ? "ok" : "unknown";
    out[k] = { ...h, status };
  }
  return out;
}

/** Test hook. */
export function resetSourceHealth() {
  for (const h of Object.values(health)) Object.assign(h, { lastOkAt: null, lastFailAt: null, lastError: null, consecutiveFailures: 0 });
}

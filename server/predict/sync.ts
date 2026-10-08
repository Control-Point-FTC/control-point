// Predict — one background sync pass. Each season downloads on its own, so
// an FTC Scout outage on one season never stops the others, and the ratings
// are always rebuilt from whatever is on disk afterwards.

export interface SyncSource {
  isComplete(season: number): boolean;
  syncScout(season: number): Promise<number>;
  syncAdvancement(season: number): Promise<number>;
}

export interface SyncResult {
  /** Seasons whose download failed, with the reason. */
  errors: { season: number; message: string }[];
}

export async function syncSeasons(store: SyncSource, seasons: number[], currentSeason: number, log: (m: string) => void = () => {}): Promise<SyncResult> {
  const errors: SyncResult["errors"] = [];
  for (const s of seasons) {
    // Older seasons don't change: stop once a sync completed without failures.
    if (s < currentSeason - 1 && store.isComplete(s)) continue;
    try {
      const n = await store.syncScout(s);
      const a = await store.syncAdvancement(s);
      if (n || a) log(`[predict] ${s}: ${n} events, ${a} advancement lists updated`);
    } catch (e) {
      const message = (e as Error)?.message || String(e);
      errors.push({ season: s, message });
      log(`[predict] ${s} sync failed: ${message}`);
    }
  }
  return { errors };
}

/** When the ratings' data was last downloaded: the newest season's last sync. */
export function dataAsOf(lastSync: (season: number) => string | null, seasons: number[]): string | null {
  for (const s of [...seasons].sort((a, b) => b - a)) {
    const at = lastSync(s);
    if (at) return at;
  }
  return null;
}

// What's new data: the owner-edited releases from /api/changelog, with the
// built-in list as the fallback until (or unless) that loads. One shared copy
// for the dialog, the Settings button and the new-version popup.
import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from '../services/api';
import { CHANGELOG, compareVersions, type ChangelogEntry } from './changelog';

let entries: ChangelogEntry[] = CHANGELOG;
let loading: Promise<ChangelogEntry[]> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getChangelog = () => entries;
export const latestVersion = () => entries[0]?.version || '';

/** Fetch the releases once (again after `force`); keeps the current list on failure. */
export function loadChangelog(force = false): Promise<ChangelogEntry[]> {
  if (loading && !force) return loading;
  const run = (async () => {
    try {
      const res = await apiFetch('/api/changelog', { timeoutMs: 10_000 } as any);
      const body = res.ok ? await res.json() : null;
      // An empty list is a real answer (the owner deleted every release).
      if (!Array.isArray(body)) throw new Error('changelog unavailable');
      entries = body
        .filter((e: any) => e && typeof e.version === 'string')
        .map((e: any) => ({ version: e.version, date: e.date, title: e.title, added: e.added || [], improved: e.improved || [], fixed: e.fixed || [] }))
        .sort((a: ChangelogEntry, b: ChangelogEntry) => compareVersions(a.version, b.version));
      emit();
    } catch {
      // Offline or not deployed yet: keep what we have, and let the next visit try again.
      if (loading === run) loading = null;
    }
    return entries;
  })();
  loading = run;
  return run;
}

/** Owner edits replace the list right away. */
export function setChangelog(list: ChangelogEntry[]) {
  entries = [...list].sort((a, b) => compareVersions(a.version, b.version));
  emit();
}

export function useChangelog(): ChangelogEntry[] {
  const list = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getChangelog, getChangelog);
  useEffect(() => { void loadChangelog(); }, []);
  return list;
}

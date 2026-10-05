// Scouting shortlist edits are field-level patches so two members editing
// different parts of the same entry (notes vs priority, or adding different
// tags) don't overwrite each other. Shared by the client (optimistic update)
// and the server (merge into the stored row).
import type { ShortlistEntry, ShortlistPriority } from '../types/ftcScout';

export interface ShortlistPatch {
  /** Client edit time (ms since epoch); orders concurrent or delayed saves. */
  editedAt?: number;
  season: number;
  teamNumber: number;
  teamName?: string;
  eventCode?: string | null;
  notes?: string;
  priority?: ShortlistPriority;
  scoutNext?: boolean;
  addStrengths?: string[];
  removeStrengths?: string[];
  addWeaknesses?: string[];
  removeWeaknesses?: string[];
}

export const SHORTLIST_PRIORITY_VALUES: ShortlistPriority[] = ['high', 'medium', 'low'];
const MAX_TAGS = 10;

export function cleanTag(t: unknown): string {
  return typeof t === 'string' ? t.trim().slice(0, 40) : '';
}

function applyTags(current: string[], add: unknown, remove: unknown): string[] {
  const rm = new Set((Array.isArray(remove) ? remove : []).map(cleanTag).filter(Boolean));
  const next = current.filter((t) => !rm.has(t));
  for (const t of (Array.isArray(add) ? add : []).map(cleanTag)) {
    if (t && !next.includes(t) && next.length < MAX_TAGS) next.push(t);
  }
  return next;
}

/** Apply a patch to an entry (or create one). Only fields present change. */
export function applyShortlistPatch(existing: ShortlistEntry | null, patch: ShortlistPatch, updatedAt: string): ShortlistEntry {
  const base: ShortlistEntry = existing ?? {
    teamNumber: patch.teamNumber,
    teamName: `Team ${patch.teamNumber}`,
    season: patch.season,
    eventCode: null,
    notes: '',
    priority: 'medium',
    scoutNext: false,
    strengths: [],
    weaknesses: [],
    updatedAt,
  };
  return {
    ...base,
    teamName: typeof patch.teamName === 'string' && patch.teamName.trim() ? patch.teamName.trim().slice(0, 120) : base.teamName,
    eventCode: patch.eventCode !== undefined ? patch.eventCode : base.eventCode,
    notes: typeof patch.notes === 'string' ? patch.notes.slice(0, 2000) : base.notes,
    priority: patch.priority && SHORTLIST_PRIORITY_VALUES.includes(patch.priority) ? patch.priority : base.priority,
    scoutNext: typeof patch.scoutNext === 'boolean' ? patch.scoutNext : base.scoutNext,
    strengths: applyTags(base.strengths, patch.addStrengths, patch.removeStrengths),
    weaknesses: applyTags(base.weaknesses, patch.addWeaknesses, patch.removeWeaknesses),
    updatedAt,
  };
}

// ---- Server-side merge with per-field edit times ----
//
// Each patch carries the client's edit time. A field (or a single tag) only
// changes if this edit is at least as new as the last one applied to it, so
// a delayed or retried save can't overwrite a newer edit no matter when it
// arrives. Deletes leave a tombstone with their time: older saves can't
// resurrect the entry, newer ones re-add it.

export type FieldStamps = Record<string, number>;

export interface StoredShortlistEntry {
  entry: ShortlistEntry | null;
  stamps: FieldStamps;
  deleted: boolean;
}

const SCALAR_FIELDS = ['teamName', 'eventCode', 'notes', 'priority', 'scoutNext'] as const;

/** Result of a stamped merge, or null when the patch is older than a delete. */
export function mergeStampedPatch(
  stored: StoredShortlistEntry,
  patch: ShortlistPatch,
  editedAt: number,
  updatedAt: string
): { entry: ShortlistEntry; stamps: FieldStamps } | null {
  const deletedAt = stored.stamps._deleted ?? 0;
  if (stored.deleted && editedAt < deletedAt) return null;
  const reviving = stored.deleted || !stored.entry;
  const stamps: FieldStamps = reviving ? { _deleted: deletedAt } : { ...stored.stamps };
  const newer = (key: string) => editedAt >= (stamps[key] ?? 0);
  const allowed: ShortlistPatch = { season: patch.season, teamNumber: patch.teamNumber };
  for (const k of SCALAR_FIELDS) {
    if (patch[k] === undefined || !newer(k)) continue;
    (allowed as unknown as Record<string, unknown>)[k] = patch[k];
    stamps[k] = editedAt;
  }
  const tagOps = (list: string[] | undefined, prefix: string) => {
    const out = (list ?? []).map(cleanTag).filter((t) => t && newer(`${prefix}:${t}`));
    out.forEach((t) => { stamps[`${prefix}:${t}`] = editedAt; });
    return out.length ? out : undefined;
  };
  allowed.addStrengths = tagOps(patch.addStrengths, 's');
  allowed.removeStrengths = tagOps(patch.removeStrengths, 's');
  allowed.addWeaknesses = tagOps(patch.addWeaknesses, 'w');
  allowed.removeWeaknesses = tagOps(patch.removeWeaknesses, 'w');
  const entry = applyShortlistPatch(reviving ? null : stored.entry, allowed, updatedAt);
  return { entry, stamps };
}

/** Stamps after a delete, or null when an edit newer than the delete exists. */
export function mergeStampedDelete(stored: StoredShortlistEntry, editedAt: number): FieldStamps | null {
  const newest = Math.max(0, ...Object.entries(stored.stamps).filter(([k]) => k !== '_deleted').map(([, v]) => v));
  if (!stored.deleted && newest > editedAt) return null;
  return { ...stored.stamps, _deleted: Math.max(editedAt, stored.stamps._deleted ?? 0) };
}

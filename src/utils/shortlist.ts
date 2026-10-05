// Scouting shortlist edits are field-level patches so two members editing
// different parts of the same entry (notes vs priority, or adding different
// tags) don't overwrite each other. Shared by the client (optimistic update)
// and the server (merge into the stored row).
import type { ShortlistEntry, ShortlistPriority } from '../types/ftcScout';

export interface ShortlistPatch {
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

// ---- Server-side merge: per-client write ordering ----
//
// The shortlist is shared, so edits from different members apply in the
// order the server receives them (the server serializes each entry's
// read-merge-write). What must not happen is one client's *own* delayed or
// retried request (e.g. a save that timed out but still arrives) overwriting
// a newer edit that client already made. So every write carries an origin:
// a random per-tab client id plus a sequence number that only ever goes up
// in that tab. For each field (and each tag) the server remembers the highest
// sequence it has applied from every client, and ignores a write that isn't
// newer than that client's previous one — even if other members wrote the
// field in between. No device clocks are involved.

export interface WriteOrigin { client: string; seq: number }
/** field/tag key → client id → highest sequence applied from that client. */
export type FieldStamps = Record<string, Record<string, number>>;

export interface StoredShortlistEntry {
  entry: ShortlistEntry | null;
  stamps: FieldStamps;
  deleted: boolean;
}

const SCALAR_FIELDS = ['teamName', 'eventCode', 'notes', 'priority', 'scoutNext'] as const;

/** Is `o` newer than anything this client already wrote to `key`? */
function supersedes(stamps: FieldStamps, key: string, o: WriteOrigin): boolean {
  const seen = stamps[key]?.[o.client];
  return seen === undefined || o.seq > seen;
}

function stamp(stamps: FieldStamps, key: string, o: WriteOrigin): void {
  stamps[key] = { ...stamps[key], [o.client]: o.seq };
}

/**
 * Merge a patch into the stored entry. Null = ignore it: it's an older
 * request from the client that has since deleted the entry.
 */
export function mergeStampedPatch(
  stored: StoredShortlistEntry,
  patch: ShortlistPatch,
  origin: WriteOrigin,
  updatedAt: string
): { entry: ShortlistEntry; stamps: FieldStamps } | null {
  if (stored.deleted && !supersedes(stored.stamps, '_deleted', origin)) return null;
  // Stamps survive a delete + re-add, so a pre-delete request arriving late
  // still can't touch fields written after it.
  const stamps: FieldStamps = { ...stored.stamps };
  const allowed: ShortlistPatch = { season: patch.season, teamNumber: patch.teamNumber };
  for (const k of SCALAR_FIELDS) {
    if (patch[k] === undefined || !supersedes(stamps, k, origin)) continue;
    (allowed as unknown as Record<string, unknown>)[k] = patch[k];
    stamp(stamps, k, origin);
  }
  const tagOps = (list: string[] | undefined, prefix: string) => {
    const out = (list ?? []).map(cleanTag).filter((t) => t && supersedes(stamps, `${prefix}:${t}`, origin));
    out.forEach((t) => stamp(stamps, `${prefix}:${t}`, origin));
    return out.length ? out : undefined;
  };
  allowed.addStrengths = tagOps(patch.addStrengths, 's');
  allowed.removeStrengths = tagOps(patch.removeStrengths, 's');
  allowed.addWeaknesses = tagOps(patch.addWeaknesses, 'w');
  allowed.removeWeaknesses = tagOps(patch.removeWeaknesses, 'w');
  const entry = applyShortlistPatch(stored.deleted ? null : stored.entry, allowed, updatedAt);
  return { entry, stamps };
}

/**
 * Stamps after a delete. Null = ignore it: the same client already made a
 * newer edit to this entry (its delete request arrived late).
 */
export function mergeStampedDelete(stored: StoredShortlistEntry, origin: WriteOrigin): FieldStamps | null {
  const newerOwnEdit = Object.values(stored.stamps).some((byClient) => (byClient[origin.client] ?? -1) > origin.seq);
  if (newerOwnEdit) return null;
  const stamps = { ...stored.stamps };
  stamp(stamps, '_deleted', origin);
  return stamps;
}

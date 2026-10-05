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

// Notebook entry metadata (feature parity 3.1): when the work happened, what
// kind of entry it is, where it sits in the design process, and which robot
// subsystems and judged awards it is evidence for. Kept beside the page (not
// in its document), so it's searchable and never collides with live editing.
// Shared by the notebook editor, the server and Bruno.
import { awardById, cleanAwards, cleanRecordSubsystems, isRealDate } from '../types/taskTags';

export const ENTRY_TYPES = [
  { id: 'prototype', label: 'Prototype' },
  { id: 'build', label: 'Build' },
  { id: 'code', label: 'Code' },
  { id: 'test', label: 'Test' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'competition', label: 'Competition' },
  { id: 'failure', label: 'Failure' },
] as const;

export const ENTRY_STAGES = [
  { id: 'identify', label: 'Identify problem' },
  { id: 'brainstorm', label: 'Brainstorm' },
  { id: 'research', label: 'Research' },
  { id: 'design', label: 'Design' },
  { id: 'build', label: 'Build' },
  { id: 'program', label: 'Program' },
  { id: 'test', label: 'Test' },
  { id: 'iterate', label: 'Iterate' },
] as const;

export type EntryMeta = {
  /** "Work happened on" (YYYY-MM-DD); null = not set (the page's created date applies). */
  workDate: string | null;
  type: string | null;
  stage: string | null;
  subsystems: string[];
  awards: string[];
};

export const EMPTY_ENTRY_META: EntryMeta = { workDate: null, type: null, stage: null, subsystems: [], awards: [] };

const pick = (list: readonly { id: string; label: string }[], v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const key = v.trim().toLowerCase();
  return list.find((x) => x.id === key || x.label.toLowerCase() === key)?.id ?? null;
};

/**
 * A change to a page's metadata, validated: only fields present are changed;
 * null or "" clears one. Unknown types/stages and subsystems not on the
 * team's list are refused (never silently dropped), so a typo doesn't erase.
 */
export function cleanEntryMetaPatch(input: any, teamSubsystems: readonly string[]): { patch: Partial<EntryMeta> } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Nothing to change' };
  const patch: Partial<EntryMeta> = {};
  const empty = (v: unknown) => v === null || v === '';
  if ('workDate' in input) {
    if (empty(input.workDate)) patch.workDate = null;
    else if (isRealDate(input.workDate)) patch.workDate = input.workDate;
    else return { error: 'Pick a real date for when the work happened' };
  }
  if ('type' in input) {
    const t = pick(ENTRY_TYPES, input.type);
    if (!t && !empty(input.type)) return { error: `Entry type is one of: ${ENTRY_TYPES.map((x) => x.label).join(', ')}` };
    patch.type = t;
  }
  if ('stage' in input) {
    const s = pick(ENTRY_STAGES, input.stage);
    if (!s && !empty(input.stage)) return { error: `Stage is one of: ${ENTRY_STAGES.map((x) => x.label).join(', ')}` };
    patch.stage = s;
  }
  if ('subsystems' in input) {
    if (!Array.isArray(input.subsystems)) return { error: 'Subsystems are a list' };
    const clean = cleanRecordSubsystems(input.subsystems, teamSubsystems);
    if (clean.length !== new Set(input.subsystems.map((v: unknown) => String(v).trim().toLowerCase())).size) return { error: `Subsystems must be on the team's list: ${teamSubsystems.join(', ')}` };
    patch.subsystems = clean;
  }
  if ('awards' in input) {
    if (!Array.isArray(input.awards)) return { error: 'Awards are a list' };
    const clean = cleanAwards(input.awards);
    if (clean.length !== new Set(input.awards.map((v: unknown) => String(v).trim().toLowerCase())).size) return { error: 'Awards are Think, Connect, Reach, Sustain, Innovate, Control, Design or Inspire' };
    patch.awards = clean;
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to change' };
  return { patch };
}

/** Minutes to read a page's text at about 200 words a minute (at least 1 when there's any text). */
export function readMinutes(plain: string | null | undefined): number {
  const words = String(plain ?? '').trim().split(/\s+/).filter(Boolean).length;
  return words ? Math.max(1, Math.round(words / 200)) : 0;
}

/** "Test · Iterate · work on Oct 15 · Intake · Think award", for cards and Bruno; "cleared" fields say so. */
export function entryMetaSummary(m: Partial<EntryMeta>): string {
  const bits: string[] = [];
  if ('type' in m) bits.push(m.type ? `type ${entryTypeLabel(m.type)}` : 'no type');
  if ('stage' in m) bits.push(m.stage ? `stage ${entryStageLabel(m.stage)}` : 'no stage');
  if ('workDate' in m) bits.push(m.workDate ? `work happened on ${m.workDate}` : 'no work date');
  if ('subsystems' in m) bits.push(m.subsystems?.length ? `subsystems ${m.subsystems.join(', ')}` : 'no subsystems');
  if ('awards' in m) bits.push(m.awards?.length ? `awards ${m.awards.map((a) => awardById(a)?.name ?? a).join(', ')}` : 'no awards');
  return bits.join(' · ');
}

export const entryTypeLabel = (id: string | null | undefined) => ENTRY_TYPES.find((t) => t.id === id)?.label ?? null;
export const entryStageLabel = (id: string | null | undefined) => ENTRY_STAGES.find((t) => t.id === id)?.label ?? null;

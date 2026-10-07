// Manual scouting (audit H-4): game-agnostic entries described by a
// per-season template. Shared by the client (form + summaries) and the
// server (validation), so both agree on exactly what a field accepts.
//
// An entry is keyed by a client-made UUID: it is saved on the device first
// and synced later, so the same entry can arrive more than once (retries,
// a second tab) without duplicating.

export type ScoutFieldType = 'counter' | 'toggle' | 'choice' | 'rating' | 'text';

export interface ScoutField {
  id: string;
  label: string;
  type: ScoutFieldType;
  /** Section heading in the form (Auto, TeleOp, Endgame, Overall). */
  phase: 'auto' | 'teleop' | 'endgame' | 'overall';
  /** For `choice`. */
  options?: string[];
  /** For `counter` (default 0–200). */
  max?: number;
}

export interface ScoutTemplate {
  id: string;
  name: string;
  /** FTC season start year (2025 = 2025–26), or null for the generic one. */
  season: number | null;
  fields: ScoutField[];
}

const OVERALL: ScoutField[] = [
  { id: 'driving', label: 'Driving', type: 'rating', phase: 'overall' },
  { id: 'defense', label: 'Played defense', type: 'toggle', phase: 'overall' },
  { id: 'broke_down', label: 'Broke down / disconnected', type: 'toggle', phase: 'overall' },
  { id: 'penalties', label: 'Penalties seen', type: 'counter', phase: 'overall', max: 50 },
];

export const SCOUT_TEMPLATES: ScoutTemplate[] = [
  {
    id: 'decode-2025',
    name: 'DECODE (2025–26)',
    season: 2025,
    fields: [
      { id: 'auto_leave', label: 'Left the launch line', type: 'toggle', phase: 'auto' },
      { id: 'auto_artifacts', label: 'Artifacts scored', type: 'counter', phase: 'auto' },
      { id: 'auto_pattern', label: 'Pattern matches', type: 'counter', phase: 'auto', max: 9 },
      { id: 'teleop_artifacts', label: 'Artifacts scored', type: 'counter', phase: 'teleop' },
      { id: 'teleop_pattern', label: 'Pattern matches', type: 'counter', phase: 'teleop', max: 9 },
      { id: 'base', label: 'Base at the end', type: 'choice', phase: 'endgame', options: ['None', 'Partial', 'Full'] },
      ...OVERALL,
    ],
  },
  {
    id: 'into-the-deep-2024',
    name: 'INTO THE DEEP (2024–25)',
    season: 2024,
    fields: [
      { id: 'auto_samples', label: 'Samples scored', type: 'counter', phase: 'auto' },
      { id: 'auto_specimens', label: 'Specimens hung', type: 'counter', phase: 'auto' },
      { id: 'teleop_samples', label: 'Samples scored', type: 'counter', phase: 'teleop' },
      { id: 'teleop_specimens', label: 'Specimens hung', type: 'counter', phase: 'teleop' },
      { id: 'ascent', label: 'Ascent', type: 'choice', phase: 'endgame', options: ['None', 'Park', 'Level 1', 'Level 2', 'Level 3'] },
      ...OVERALL,
    ],
  },
  {
    id: 'generic',
    name: 'Any game',
    season: null,
    fields: [
      { id: 'auto_points', label: 'Auto points (estimate)', type: 'counter', phase: 'auto', max: 500 },
      { id: 'teleop_points', label: 'TeleOp points (estimate)', type: 'counter', phase: 'teleop', max: 500 },
      { id: 'endgame_points', label: 'Endgame points (estimate)', type: 'counter', phase: 'endgame', max: 500 },
      ...OVERALL,
    ],
  },
];

/** The season's template, or the generic one. */
export function templateFor(season: number): ScoutTemplate {
  return SCOUT_TEMPLATES.find((t) => t.season === season) || SCOUT_TEMPLATES.find((t) => t.id === 'generic')!;
}

export function templateById(id: unknown): ScoutTemplate | null {
  return SCOUT_TEMPLATES.find((t) => t.id === id) || null;
}

export type ScoutValue = number | boolean | string;

/**
 * Keep only the template's fields, each coerced to its type and bounded.
 * Unknown keys are dropped; a missing value is left out (not guessed).
 */
export function cleanScoutData(template: ScoutTemplate, raw: unknown): Record<string, ScoutValue> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, ScoutValue> = {};
  for (const f of template.fields) {
    const v = src[f.id];
    if (v === undefined || v === null || v === '') continue;
    switch (f.type) {
      case 'counter': {
        const n = Math.round(Number(v));
        if (Number.isFinite(n)) out[f.id] = Math.min(Math.max(n, 0), f.max ?? 200);
        break;
      }
      case 'rating': {
        const n = Math.round(Number(v));
        if (Number.isFinite(n) && n >= 1 && n <= 5) out[f.id] = n;
        break;
      }
      case 'toggle':
        out[f.id] = v === true || v === 'true' || v === 1;
        break;
      case 'choice':
        if (typeof v === 'string' && f.options?.includes(v)) out[f.id] = v;
        break;
      case 'text':
        out[f.id] = String(v).slice(0, 500);
        break;
    }
  }
  return out;
}

export interface ScoutEntry {
  uuid: string;
  season: number;
  scoutedTeam: number;
  eventCode: string | null;
  matchLabel: string | null;
  templateId: string;
  data: Record<string, ScoutValue>;
  notes: string;
  /** ms since epoch, set by the device that last edited it. */
  updatedAt: number;
  deleted?: boolean;
  scoutName?: string | null;
  scoutMemberId?: number | null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate one incoming entry (from the client or the outbox). */
export function cleanScoutEntry(raw: any, now = Date.now()): { entry: ScoutEntry } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Bad entry' };
  const uuid = String(raw.uuid || '');
  if (!UUID_RE.test(uuid)) return { error: 'Bad entry id' };
  const season = Number(raw.season);
  if (!Number.isInteger(season) || season < 2015 || season > 2100) return { error: 'Bad season' };
  const scoutedTeam = Number(raw.scoutedTeam);
  if (!Number.isInteger(scoutedTeam) || scoutedTeam <= 0 || scoutedTeam > 999999) return { error: 'Enter the team number you scouted' };
  const template = templateById(raw.templateId) || templateFor(season);
  const updatedAt = Number(raw.updatedAt);
  return {
    entry: {
      uuid: uuid.toLowerCase(),
      season,
      scoutedTeam,
      eventCode: raw.eventCode ? String(raw.eventCode).trim().slice(0, 40) || null : null,
      matchLabel: raw.matchLabel ? String(raw.matchLabel).trim().slice(0, 20) || null : null,
      templateId: template.id,
      data: cleanScoutData(template, raw.data),
      notes: String(raw.notes || '').slice(0, 2000),
      // A device clock in the future can't make its edit win forever.
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.min(updatedAt, now) : now,
      deleted: raw.deleted === true,
    },
  };
}

export interface ScoutTeamSummary {
  team: number;
  entries: number;
  /** Mean of each counter / rating; share (0–1) of each toggle; most common choice. */
  averages: Record<string, number>;
  shares: Record<string, number>;
  modes: Record<string, string>;
  lastEvent: string | null;
}

/** Per-team rollup of live (not deleted) entries. */
export function summarizeScouting(entries: ScoutEntry[]): ScoutTeamSummary[] {
  const byTeam = new Map<number, ScoutEntry[]>();
  for (const e of entries) {
    if (e.deleted) continue;
    const list = byTeam.get(e.scoutedTeam) || [];
    list.push(e);
    byTeam.set(e.scoutedTeam, list);
  }
  const out: ScoutTeamSummary[] = [];
  for (const [team, list] of byTeam) {
    const sums: Record<string, { s: number; n: number }> = {};
    const toggles: Record<string, { y: number; n: number }> = {};
    const choices: Record<string, Record<string, number>> = {};
    for (const e of list) {
      const t = templateById(e.templateId);
      for (const f of t?.fields || []) {
        const v = e.data[f.id];
        if (v === undefined) continue;
        if (f.type === 'counter' || f.type === 'rating') {
          const a = (sums[f.id] ||= { s: 0, n: 0 }); a.s += Number(v); a.n++;
        } else if (f.type === 'toggle') {
          const a = (toggles[f.id] ||= { y: 0, n: 0 }); a.y += v ? 1 : 0; a.n++;
        } else if (f.type === 'choice') {
          const a = (choices[f.id] ||= {}); a[String(v)] = (a[String(v)] || 0) + 1;
        }
      }
    }
    const averages = Object.fromEntries(Object.entries(sums).map(([k, a]) => [k, a.s / a.n]));
    const shares = Object.fromEntries(Object.entries(toggles).map(([k, a]) => [k, a.y / a.n]));
    const modes = Object.fromEntries(Object.entries(choices).map(([k, c]) => [k, Object.entries(c).sort((x, y) => y[1] - x[1])[0][0]]));
    const latest = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    out.push({ team, entries: list.length, averages, shares, modes, lastEvent: latest?.eventCode ?? null });
  }
  return out.sort((a, b) => b.entries - a.entries || a.team - b.team);
}

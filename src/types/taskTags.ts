/**
 * Tags shared by tasks (and, later, notebook entries, outreach and events):
 * robot subsystems (the team's list, src/types/teamModules.ts), FTC judged
 * awards, and free-form labels. Stored as JSON arrays on each record.
 *
 * Shared by the client (pickers, chips) and the server (validation, Bruno).
 */
import { cleanSubsystems } from './teamModules';

export interface FtcAward {
  id: string;
  name: string;
  /** One line on what judges look for, shown on hover. */
  criteria: string;
}

/** The judged FTC awards a team can collect evidence for. */
export const FTC_AWARDS: readonly FtcAward[] = [
  { id: 'think', name: 'Think', criteria: 'An engineering notebook that clearly shows the design process: problems, ideas, tests and what was learned.' },
  { id: 'connect', name: 'Connect', criteria: 'Real connections with engineers, mentors and the wider STEM community, and what the team learned from them.' },
  { id: 'reach', name: 'Reach', criteria: 'Bringing FIRST and STEM to new people, and growing the program in the community.' },
  { id: 'sustain', name: 'Sustain', criteria: 'A plan that keeps the team going: funding, sponsors, recruiting and passing on knowledge.' },
  { id: 'innovate', name: 'Innovate', criteria: 'A creative, original robot design that works well and was developed on purpose.' },
  { id: 'control', name: 'Control', criteria: 'Smart use of software, sensors and control to make the robot reliable, especially in autonomous.' },
  { id: 'design', name: 'Design', criteria: 'Industrial design: a robot that is well built, good-looking and easy to maintain.' },
  { id: 'inspire', name: 'Inspire', criteria: 'A role-model team across the board: robot, notebook, outreach and how the team works together.' },
];

export function awardById(id: string): FtcAward | undefined {
  return FTC_AWARDS.find((a) => a.id === id);
}

/** Known award ids (case-insensitive, names accepted), de-duplicated, in taxonomy order. */
export function cleanAwards(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const want = new Set(list.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase()));
  return FTC_AWARDS.filter((a) => want.has(a.id) || want.has(a.name.toLowerCase())).map((a) => a.id);
}

export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 24;

/** Trimmed, de-duplicated (case-insensitive) labels, at most 10 of 24 characters. */
export function cleanLabels(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const name = v.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}

/**
 * Subsystems for a record: only names on the team's list (matched
 * case-insensitively, saved with the team's spelling).
 */
export function cleanRecordSubsystems(list: unknown, teamList: readonly string[]): string[] {
  const byKey = new Map(teamList.map((n) => [n.toLowerCase(), n]));
  return cleanSubsystems(list).map((n) => byKey.get(n.toLowerCase())).filter((n): n is string => !!n);
}

/** A stored JSON array of strings (bad input → []). */
export function parseTagList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

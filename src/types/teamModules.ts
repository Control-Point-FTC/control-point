/**
 * Per-workspace module switches and robot subsystems.
 *
 * A team can turn off the parts of Control Point it doesn't use, so the
 * sidebar only shows what it needs. Nothing is deleted: a module that is off
 * keeps its data and comes back exactly as it was when switched on again.
 * Dashboard, Members and Settings are always on.
 *
 * Shared by the client (nav, settings) and the server (validation, Bruno).
 */

export interface TeamModule {
  /** Stored in teams.disabled_modules. */
  id: string;
  label: string;
  description: string;
  /** Nav/route ids this module hides when off (CAD has sub-pages). */
  navIds: string[];
}

export const TEAM_MODULES: readonly TeamModule[] = [
  { id: 'chat', label: 'Messaging', description: 'Team chat channels and voice calls', navIds: ['chat'] },
  { id: 'calendar', label: 'Calendar', description: 'Meetings, competitions and the calendar feed', navIds: ['calendar'] },
  { id: 'attendance', label: 'Attendance', description: 'Check-ins, attendance grid and history', navIds: ['attendance'] },
  { id: 'tasks', label: 'Tasks', description: 'Task board, list and insights', navIds: ['tasks'] },
  { id: 'notebook', label: 'Notebook', description: 'Engineering notebook', navIds: ['notebook'] },
  { id: 'comm', label: 'Communication', description: 'Log of emails and announcements with sponsors and partners', navIds: ['comm'] },
  { id: 'inventory', label: 'Inventory', description: 'Parts, quantities and locations', navIds: ['inventory'] },
  { id: 'cad', label: 'CAD', description: 'Onshape docs, design reviews, snapshots and parts list', navIds: ['cad', 'cad-docs', 'cad-reviews', 'cad-snapshots', 'cad-parts'] },
  { id: 'code', label: 'Code', description: 'Robot code editor and GitHub sync', navIds: ['code'] },
  { id: 'stats', label: 'Team Stats', description: 'Match scouting, event history and team analysis', navIds: ['stats'] },
  { id: 'predict', label: 'Predict', description: 'Match and event forecasts', navIds: ['predict'] },
  { id: 'outreach', label: 'Outreach', description: 'Outreach events, hours and social channels', navIds: ['outreach'] },
  { id: 'budget', label: 'Budget', description: 'Income and expenses', navIds: ['budget'] },
  { id: 'resources', label: 'Resources', description: 'Shared link library', navIds: ['resources'] },
  { id: 'checklists', label: 'Checklists', description: 'Pre-match, pit and travel checklists and their runs', navIds: ['checklists'] },
];

const MODULE_IDS = new Set(TEAM_MODULES.map((m) => m.id));

export function isTeamModuleId(id: unknown): id is string {
  return typeof id === 'string' && MODULE_IDS.has(id);
}

/** Parse the stored JSON (or an array) into known module ids, de-duplicated. Bad input → none off. */
export function parseDisabledModules(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(isTeamModuleId))];
}

/** The module a nav/route id belongs to, if it can be switched off. */
export function moduleForNavId(navId: string): TeamModule | undefined {
  return TEAM_MODULES.find((m) => m.navIds.includes(navId));
}

/** Is this nav/route id hidden by the team's switches? */
export function isNavIdDisabled(navId: string, disabled: readonly string[]): boolean {
  const m = moduleForNavId(navId);
  return !!m && disabled.includes(m.id);
}

/** Default robot subsystems for a new team (FTC-shaped; teams edit them). */
export const DEFAULT_SUBSYSTEMS: readonly string[] = [
  'Drivetrain', 'Intake', 'Outtake', 'Arm', 'Autonomous', 'Electrical', 'Chassis', 'Sensors',
];

export const MAX_SUBSYSTEMS = 20;
export const MAX_SUBSYSTEM_LENGTH = 32;

/** Trimmed, de-duplicated (case-insensitive), length-capped names. */
export function cleanSubsystems(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const name = v.replace(/\s+/g, ' ').trim().slice(0, MAX_SUBSYSTEM_LENGTH);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_SUBSYSTEMS) break;
  }
  return out;
}

/** The team's subsystems: the saved list, or the defaults when never set. */
export function parseSubsystems(raw: unknown): string[] {
  if (raw == null || raw === '') return [...DEFAULT_SUBSYSTEMS];
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return [...DEFAULT_SUBSYSTEMS]; }
  }
  return Array.isArray(list) ? cleanSubsystems(list) : [...DEFAULT_SUBSYSTEMS];
}

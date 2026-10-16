// Bruno's workspace settings action (```workspace block): switch modules on
// or off and replace the robot subsystem list. Bruno only proposes it; the
// member confirms the card and /api/ai/apply-actions applies it with the
// same rules as PATCH /api/teams/:id (admins only, known modules, 1–20 names).
import { cleanSubsystems, isTeamModuleId, MAX_SUBSYSTEMS } from "../src/types/teamModules.js";
import { cleanWipLimits, type WipLimits } from "../src/types/taskStatus.js";

export interface WorkspaceChange {
  disable: string[];
  enable: string[];
  /** The full new list, when it changes. */
  subsystems?: string[];
  /** The task board's column limits, replacing the old ones ({} clears them). */
  wipLimits?: WipLimits;
}

/** Validate one proposed change. Unknown modules are dropped; null when nothing valid is left. */
export function parseWorkspaceChange(raw: unknown): WorkspaceChange | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isTeamModuleId))] : []);
  const enable = ids(r.enable);
  // Asked both ways: switching on wins (nothing is hidden by mistake).
  const disable = ids(r.disable).filter((id) => !enable.includes(id));
  const out: WorkspaceChange = { disable, enable };
  if (r.subsystems !== undefined) {
    if (!Array.isArray(r.subsystems) || r.subsystems.length > MAX_SUBSYSTEMS) return null;
    const list = cleanSubsystems(r.subsystems);
    if (!list.length) return null;
    out.subsystems = list;
  }
  if (r.wip_limits !== undefined) {
    // null or {} clears; otherwise only valid limits (1–99 for todo / in-progress).
    out.wipLimits = r.wip_limits === null ? {} : cleanWipLimits(r.wip_limits);
  }
  return disable.length || enable.length || out.subsystems || out.wipLimits ? out : null;
}

/** The team's switched-off modules after applying a change. */
export function nextDisabledModules(current: readonly string[], change: WorkspaceChange): string[] {
  const off = new Set(current);
  for (const id of change.disable) off.add(id);
  for (const id of change.enable) off.delete(id);
  return [...off];
}

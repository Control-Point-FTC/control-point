// Smart assignee groups: "Everyone", "Coaches & mentors" and "Alumni", worked
// out from the roster and role names (teams have no separate mentor or alumni
// flag). Shared by the task editor's assignee picker and Bruno's role matching
// (which treats a group like a role), so both mean the same people. A team role
// with the same name wins, and a group nobody is in is left out.

export type SmartGroup = { key: 'everyone' | 'coaches' | 'alumni'; name: string; memberIds: number[] };

const GROUPS: { key: SmartGroup['key']; name: string; match: RegExp | null }[] = [
  { key: 'everyone', name: 'Everyone', match: null },
  { key: 'coaches', name: 'Coaches & mentors', match: /\b(coach|mentor)/i },
  { key: 'alumni', name: 'Alumni', match: /\balum/i },
];

export function smartGroups(
  members: { id: number; roleNames: string[] }[],
  roleNames: string[] = [],
): SmartGroup[] {
  const taken = new Set(roleNames.map((n) => n.trim().toLowerCase()));
  const out: SmartGroup[] = [];
  for (const g of GROUPS) {
    if (taken.has(g.name.toLowerCase())) continue;
    const ids = members.filter((m) => !g.match || m.roleNames.some((r) => g.match!.test(r))).map((m) => m.id);
    if (ids.length) out.push({ key: g.key, name: g.name, memberIds: [...new Set(ids)] });
  }
  return out;
}

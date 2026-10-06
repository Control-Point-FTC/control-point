// Modern navigation model. It is derived from the SAME visible nav items the
// Legacy sidebar uses (App's `visibleTabs`, already filtered by role, scope,
// permission and owner rules), so visibility can never differ between modes.
import type { ComponentType } from 'react';

export interface NavItemLike {
  id: string;
  path: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  group?: string;
  pinned?: boolean;
  badge?: string;
  children?: NavItemLike[];
}

export interface ModernNavItem {
  id: string;
  path: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
  /** Route ids that count as "this item" for the active highlight. */
  matches: string[];
}

export interface ModernNavSection {
  id: string;
  label: string;
  items: ModernNavItem[];
}

/** Legacy group -> Modern section. Communication moves to Operations. */
const SECTION_OF: Record<string, string> = {
  teams: 'team', attendance: 'team', calendar: 'team', tasks: 'team',
  stats: 'compete', predict: 'compete',
  cad: 'build', code: 'build', inventory: 'build',
  outreach: 'ops', comm: 'ops', budget: 'ops', resources: 'ops',
  owner: 'admin',
};
const SECTION_LABELS: Record<string, string> = { team: 'Team', compete: 'Compete', build: 'Build', ops: 'Operations', admin: 'Admin' };
const SECTION_ORDER = ['team', 'compete', 'build', 'ops', 'admin'];
/** Primary items above the sections (Inbox and Bruno are actions, added by the shell). */
export const PRIMARY_IDS = ['dashboard', 'chat'];

function toItem(t: NavItemLike): ModernNavItem {
  const kids = t.children ?? [];
  return { id: t.id, path: t.path, labelKey: t.labelKey, icon: t.icon, badge: t.badge, matches: [t.id, ...kids.map((k) => k.id)] };
}

export function buildModernNav(visible: NavItemLike[]): { primary: ModernNavItem[]; sections: ModernNavSection[] } {
  const primary = PRIMARY_IDS.map((id) => visible.find((t) => t.id === id)).filter(Boolean).map((t) => toItem(t!));
  const buckets: Record<string, ModernNavItem[]> = {};
  for (const t of visible) {
    if (PRIMARY_IDS.includes(t.id)) continue;
    const sec = SECTION_OF[t.id] ?? 'ops';
    // Members & Roles: Modern lists Roles as its own item under Team (until the
    // Members page gets its Roles tab); CAD's sub-pages stay inside the CAD page.
    if (t.id === 'teams' && t.children?.length) {
      for (const k of t.children) (buckets[sec] ??= []).push({ ...toItem(k), matches: [k.id] });
      continue;
    }
    (buckets[sec] ??= []).push(toItem(t));
  }
  // Keep a stable, intentional order inside each section.
  const ORDER = ['teams', 'roles', 'attendance', 'calendar', 'tasks', 'stats', 'predict', 'cad', 'code', 'inventory', 'outreach', 'comm', 'budget', 'resources', 'owner'];
  const sections = SECTION_ORDER
    .filter((id) => buckets[id]?.length)
    .map((id) => ({
      id,
      label: SECTION_LABELS[id],
      items: buckets[id].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)),
    }));
  return { primary, sections };
}

/** Flat list of every reachable item (for the command menu). */
export function flattenNav(nav: { primary: ModernNavItem[]; sections: ModernNavSection[] }): (ModernNavItem & { section?: string })[] {
  return [...nav.primary, ...nav.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })))];
}

export function isActive(item: ModernNavItem, activeTab: string): boolean {
  return item.matches.includes(activeTab);
}

// Phone tab bar (owner spec): Home / Compete / Tasks / Bruno / More by
// default; the first three slots can be changed per device. Bruno and More
// always stay.
import {
  Boxes, CalendarDays, CheckSquare, ClipboardCheck, DollarSign, Home, MessageSquare, Sparkles, Trophy, Users,
  type LucideIcon,
} from 'lucide-react';

export interface MobileTabChoice { id: string; label: string; icon: LucideIcon }

export const MOBILE_TAB_CHOICES: MobileTabChoice[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'stats', label: 'Compete', icon: Trophy },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'chat', label: 'Messages', icon: MessageSquare },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'attendance', label: 'Check in', icon: ClipboardCheck },
  { id: 'predict', label: 'Predict', icon: Sparkles },
  { id: 'teams', label: 'People', icon: Users },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'budget', label: 'Budget', icon: DollarSign },
];

export const DEFAULT_MOBILE_TABS = ['dashboard', 'stats', 'tasks'];
export const MOBILE_TAB_SLOTS = 3;
const KEY = 'cp-mobile-tabs';

export function readMobileTabs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.slice(0, MOBILE_TAB_SLOTS);
  } catch { /* storage unavailable or corrupt */ }
  return DEFAULT_MOBILE_TABS;
}

export function saveMobileTabs(ids: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MOBILE_TAB_SLOTS))); } catch { /* storage unavailable */ }
}

/**
 * The tabs to show: the saved picks this account can open (no duplicates),
 * topped up from the defaults and then any other allowed choice.
 */
export function resolveMobileTabs(saved: string[], allowed: (id: string) => boolean): MobileTabChoice[] {
  const out: string[] = [];
  for (const id of [...saved, ...DEFAULT_MOBILE_TABS, ...MOBILE_TAB_CHOICES.map((c) => c.id)]) {
    if (out.length >= MOBILE_TAB_SLOTS) break;
    if (!out.includes(id) && allowed(id) && MOBILE_TAB_CHOICES.some((c) => c.id === id)) out.push(id);
  }
  return out.map((id) => MOBILE_TAB_CHOICES.find((c) => c.id === id)!);
}

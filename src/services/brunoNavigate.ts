// Bruno's navigation action: "show me my tasks" / "open the BOM page" ends
// Bruno's reply with
//   ```navigate
//   {"to":"notebook","page":42}
//   ```
// and the app goes there as soon as the reply finishes (like the appearance
// switch, src/services/brunoAppearance.ts). Opening a page changes nothing,
// so it needs no confirm card. Only this app's own pages are reachable:
// "to" must be one of PAGES, and ids must be whole numbers.
//
// The same channel opens a record Bruno just created: a ```tasks or ```event
// item with "open": true goes to it once the member confirms the card.

import { extractActionProposals } from './aiService';
import { extractNotebookOps, extractStickyOps } from './notebookProposals';

const BLOCK = /```navigate\s*\r?\n([\s\S]*?)\r?\n```/;

/** Pages Bruno can open, by the name he uses. */
export const PAGES: Record<string, string> = {
  dashboard: '/dashboard',
  inbox: '/inbox',
  messages: '/chat',
  bruno: '/bruno',
  members: '/teams',
  attendance: '/attendance',
  calendar: '/calendar',
  tasks: '/tasks',
  notebook: '/notebook',
  stats: '/stats',
  predict: '/predict',
  code: '/code',
  cad: '/cad',
  'cad-docs': '/cad-docs',
  'cad-parts': '/cad-parts',
  'cad-reviews': '/cad-reviews',
  inventory: '/inventory',
  checklists: '/checklists',
  outreach: '/outreach',
  communications: '/comm',
  budget: '/budget',
  resources: '/resources',
  settings: '/settings',
};

/** Which record a page can open, and the query parameter it reads. */
const RECORD_PARAM: Record<string, { key: string; param: string }> = {
  tasks: { key: 'task', param: 'task' },
  calendar: { key: 'event', param: 'event' },
  notebook: { key: 'page', param: 'page' },
  members: { key: 'member', param: 'member' },
  inventory: { key: 'item', param: 'item' },
};

const id = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** The in-app path a navigate request points at, or null if it isn't one. */
export function navigatePath(req: any): string | null {
  if (!req || typeof req !== 'object') return null;
  const to = String(req.to || '').trim().toLowerCase();
  const base = Object.prototype.hasOwnProperty.call(PAGES, to) ? PAGES[to] : null;
  if (!base) return null;
  const rec = RECORD_PARAM[to];
  const rid = rec ? id(req[rec.key]) : null;
  if (rec && rid) return `${base}?${rec.param}=${rid}`;
  if (to === 'notebook') {
    const section = id(req.section);
    if (section) return `${base}?section=${section}`;
  }
  if (to === 'settings' && typeof req.section === 'string' && /^[a-z][a-z-]{0,39}$/.test(req.section)) {
    return `${base}?section=${req.section}`;
  }
  return base;
}

/** Where a finished reply asks to go, or null. */
export function navigateRequest(text: string): string | null {
  const m = BLOCK.exec(String(text || ''));
  if (!m) return null;
  try {
    return navigatePath(JSON.parse(m[1]));
  } catch {
    return null;
  }
}

export const BRUNO_NAVIGATE_EVENT = 'cp:bruno-navigate';

/** Ask the app (App.tsx listens) to open an in-app path. */
export function brunoGo(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return;
  window.dispatchEvent(new CustomEvent(BRUNO_NAVIGATE_EVENT, { detail: { to: path } }));
}

/** Goes where a finished reply's navigate block points; returns the path. */
export function applyNavigateFromReply(text: string): string | null {
  const to = navigateRequest(text);
  if (to) brunoGo(to);
  return to;
}

/** Does the reply carry a confirm card (changes waiting for the member)? */
export function hasConfirmCards(text: string): boolean {
  return extractActionProposals(text).length > 0 || extractNotebookOps(text).length > 0 || extractStickyOps(text).length > 0;
}

/**
 * For a chat that lives on its own page (the Bruno page, the dashboard bar):
 * leaving it would drop a card the member hasn't confirmed yet, so a reply
 * with cards stays put. ("…then show it to me" opens the new record once the
 * card is confirmed instead.) The side panel keeps its cards across pages
 * and uses applyNavigateFromReply.
 */
export function applyNavigateKeepingCards(text: string): string | null {
  return hasConfirmCards(text) ? null : applyNavigateFromReply(text);
}

/**
 * After a confirmed card: the record Bruno was asked to show ("…then open
 * it"), from the ids the server returned. A task wins over an event when
 * both were asked for; the other is a link on the card.
 */
export function createdToOpen(proposals: { kind: string; items: any[] }[], created: Record<string, number[]>): string | null {
  // The server returns new ids in item order, so the flagged item's id is at
  // its position, as long as every item was saved. If some weren't, the
  // positions can't be trusted: open nothing rather than the wrong record.
  const flaggedId = (kind: string): number | null => {
    const items = proposals.filter((p) => p.kind === kind).flatMap((p) => p.items);
    const at = items.findIndex((it) => it && it.open === true);
    if (at < 0) return null;
    const ids = (created[kind] ?? []).map(id);
    return ids.length === items.length ? ids[at] ?? null : null;
  };
  const task = flaggedId('task');
  if (task) return `/tasks?task=${task}`;
  const event = flaggedId('event');
  if (event) return `/calendar?event=${event}`;
  return null;
}

// Lets a page tell Bruno's sidebar what the user is looking at.
// Team Stats → Analyze sets a scouting context (season / event / selected
// team); BrunoPanel sends it with each message and the server turns it into
// a scouting brief from its own cached FTC data. Nothing heavy is sent.
import type { ScoutingContextRequest } from '../types/ftcScout';
import type { ScreenContextRequest } from '../types/screenContext';

type Listener = () => void;

let scouting: ScoutingContextRequest | null = null;
const listeners = new Set<Listener>();

export function setScoutingContext(ctx: ScoutingContextRequest | null): void {
  const same = JSON.stringify(ctx) === JSON.stringify(scouting);
  scouting = ctx;
  if (!same) listeners.forEach((l) => l());
}

export function getScoutingContext(): ScoutingContextRequest | null {
  return scouting;
}

export function subscribeScoutingContext(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export const BRUNO_OPEN_EVENT = 'cp:bruno-open';

export interface BrunoOpenDetail {
  /** Shown as Bruno's opening message when the chat is empty. */
  greeting?: string;
  /** Optional message to send immediately (e.g. "Scout team 14481 with me"). */
  prompt?: string;
  /** Scouting context for that one prompt (the team it's about), without
   *  changing the page's own context. */
  scouting?: ScoutingContextRequest;
}

/** Ask the app to open Bruno's sidebar (App listens for this). */
export function openBruno(detail: BrunoOpenDetail = {}): void {
  window.dispatchEvent(new CustomEvent<BrunoOpenDetail>(BRUNO_OPEN_EVENT, { detail }));
}

export const ANALYZE_GREETING =
  "I'm ready to help analyze teams, identify scouting priorities, and find teams that complement your robot's strengths and weaknesses. Pick an event or a team and ask away.";

// ---- Screen context: what page / record the user has open ----
// App sets the route + page name on every navigation; each page reports the
// record it has open (task, event, channel, code file) and clears it when it
// closes or unmounts — pages own their key, so route changes and effect
// order (children run before App) can't drop or leak a record. Sent with
// every Bruno message; the server resolves the ids itself, scoped to the
// caller's active workspace.

type ScreenEntities = Omit<ScreenContextRequest, 'route' | 'view'>;
let page: { route: string; view: string } | null = null;
let entities: ScreenEntities = {};

/** Called by App on every navigation. */
export function setScreenRoute(route: string, view: string): void {
  page = { route, view };
}

/** A page reports (or clears, with null) the record it has open. */
export function setScreenEntity<K extends keyof ScreenEntities>(key: K, value: ScreenEntities[K] | null): void {
  const next = { ...entities };
  if (value == null) delete next[key];
  else next[key] = value;
  entities = next;
}

export function getScreenContext(): ScreenContextRequest | null {
  if (page?.route === '/notebook') return { route: '/notebook', view: 'Team notebook' };
  return page ? { ...page, ...entities } : null;
}

/** Workspace switch / logout. */
export function clearScreenContext(): void {
  page = null;
  entities = {};
}

// Lets a page tell Bruno's sidebar what the user is looking at.
// Team Stats → Analyze sets a scouting context (season / event / selected
// team); BrunoPanel sends it with each message and the server turns it into
// a scouting brief from its own cached FTC data. Nothing heavy is sent.
import type { ScoutingContextRequest } from '../types/ftcScout';

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
}

/** Ask the app to open Bruno's sidebar (App listens for this). */
export function openBruno(detail: BrunoOpenDetail = {}): void {
  window.dispatchEvent(new CustomEvent<BrunoOpenDetail>(BRUNO_OPEN_EVENT, { detail }));
}

export const ANALYZE_GREETING =
  "I'm ready to help analyze teams, identify scouting priorities, and find teams that complement your robot's strengths and weaknesses. Pick an event or a team and ask away.";

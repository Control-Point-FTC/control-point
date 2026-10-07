// Notification controls (audit item 26, the scale finding): one active user
// must not spray everyone's inbox. Each member chooses how team updates
// (budget entries, outreach events, calendar events) reach them, and whether
// @everyone / @here pings do; and one person's @everyone pings are capped.
// Mentions by name, task assignments and changes to your own roles always
// arrive. Pure helpers; server.ts does the I/O.

export type TeamUpdateMode = 'instant' | 'digest' | 'off';
export type UpdateKind = 'budget' | 'outreach' | 'event';

export interface NotifyPrefs {
  /** Budget, outreach and calendar updates: right away, bundled, or never. */
  team_updates: TeamUpdateMode;
  /** Whether @everyone / @here pings notify you. */
  everyone_pings: boolean;
}

export const DEFAULT_PREFS: NotifyPrefs = { team_updates: 'digest', everyone_pings: true };
const MODES: readonly TeamUpdateMode[] = ['instant', 'digest', 'off'];

/** A member's stored prefs (JSON text or null), with defaults for anything missing or bad. */
export function parsePrefs(raw: unknown): NotifyPrefs {
  let obj: any = null;
  if (typeof raw === 'string' && raw.trim()) {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  } else if (raw && typeof raw === 'object') {
    obj = raw;
  }
  return {
    team_updates: MODES.includes(obj?.team_updates) ? obj.team_updates : DEFAULT_PREFS.team_updates,
    everyone_pings: typeof obj?.everyone_pings === 'boolean' ? obj.everyone_pings : DEFAULT_PREFS.everyone_pings,
  };
}

/** Validate a PATCH body; only known keys with valid values are accepted. */
export function prefsPatch(body: any): { patch: Partial<NotifyPrefs> } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Expected an object' };
  const patch: Partial<NotifyPrefs> = {};
  if ('team_updates' in body) {
    if (!MODES.includes(body.team_updates)) return { error: 'team_updates must be instant, digest or off' };
    patch.team_updates = body.team_updates;
  }
  if ('everyone_pings' in body) {
    if (typeof body.everyone_pings !== 'boolean') return { error: 'everyone_pings must be true or false' };
    patch.everyone_pings = body.everyone_pings;
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to change' };
  return { patch };
}

/** How long updates wait in the digest before one summary is sent. */
export const DIGEST_WINDOW_MS = 4 * 60 * 60 * 1000;

const NOUN: Record<UpdateKind, [string, string]> = {
  budget: ['budget entry', 'budget entries'],
  outreach: ['outreach event', 'outreach events'],
  event: ['calendar event', 'calendar events'],
};

/** "Robo: 3 budget entries, 2 outreach events and 1 calendar event were added." */
export function digestText(teamName: string, kinds: UpdateKind[]): string {
  const counts = new Map<UpdateKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) || 0) + 1);
  const parts = (['budget', 'outreach', 'event'] as UpdateKind[])
    .filter((k) => counts.get(k))
    .map((k) => { const n = counts.get(k)!; return `${n} ${NOUN[k][n === 1 ? 0 : 1]}`; });
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const total = kinds.length;
  return `${teamName || 'Your team'}: ${list} ${total === 1 ? 'was' : 'were'} added.`;
}

/** Caps how often one member's @everyone / @here pings notify the team.
 *  The message still posts; past the cap it just doesn't fan out. */
export class PingLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max = 3, private windowMs = 60 * 60 * 1000) {}
  allow(teamId: number, memberId: number, now = Date.now()): boolean {
    const key = `${teamId}:${memberId}`;
    const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
  sweep(now = Date.now()) {
    for (const [k, v] of this.hits) {
      const recent = v.filter((t) => now - t < this.windowMs);
      if (recent.length) this.hits.set(k, recent); else this.hits.delete(k);
    }
  }
}

// Bruno citations (audit: "whenever Bruno's answer draws on FIRST Events /
// FTC Scout data — or any external source — it must show the source links it
// actually used, as inline citations"). The page each data source publishes
// for a team or an event, so a claim can be checked in one click.

export type LinkSource = 'first-events' | 'ftc-scout' | 'cache';

/** Which site a payload's numbers came from (a cache entry keeps its origin). */
export function siteOf(source: string | undefined, origin?: string): 'first-events' | 'ftc-scout' {
  const s = source === 'cache' ? origin : source;
  return s === 'first-events' ? 'first-events' : 'ftc-scout';
}

export function siteName(site: 'first-events' | 'ftc-scout'): string {
  return site === 'first-events' ? 'FIRST Events' : 'FTC Scout';
}

/** The public page for a team's season. */
export function teamUrl(site: 'first-events' | 'ftc-scout', season: number, team: number): string {
  return site === 'first-events'
    ? `https://ftc-events.firstinspires.org/${season}/team/${team}`
    : `https://ftcscout.org/teams/${team}?season=${season}`;
}

/** The public page for an event. */
export function eventUrl(site: 'first-events' | 'ftc-scout', season: number, code: string): string {
  const c = encodeURIComponent(String(code).trim());
  return site === 'first-events'
    ? `https://ftc-events.firstinspires.org/${season}/${c}`
    : `https://ftcscout.org/events/${season}/${c}`;
}

/** An inline markdown citation: "[FTC Scout](https://…)". */
export function cite(site: 'first-events' | 'ftc-scout', url: string): string {
  return `[${siteName(site)}](${url})`;
}

// FIRST Events publishes teams, records and standings but no OPR; OPR (and
// the score breakdowns built on it) always come from FTC Scout. So a team or
// event whose details came from FIRST Events cites both sites, each for the
// part it supplied.

/** Citation for a team's numbers: records from `site`, OPR from FTC Scout. */
export function citeTeam(site: 'first-events' | 'ftc-scout', season: number, team: number, hasOpr: boolean): string {
  if (site === 'ftc-scout' || !hasOpr) return cite(site, teamUrl(site, season, team));
  return `records: ${cite('first-events', teamUrl('first-events', season, team))}; OPR: ${cite('ftc-scout', teamUrl('ftc-scout', season, team))}`;
}

/** Citation for an event: standings from `site`, OPR/score stats from FTC Scout. */
export function citeEvent(site: 'first-events' | 'ftc-scout', season: number, code: string, hasStats: boolean): string {
  if (site === 'ftc-scout' || !hasStats) return cite(site, eventUrl(site, season, code));
  return `standings: ${cite('first-events', eventUrl('first-events', season, code))}; OPR and scores: ${cite('ftc-scout', eventUrl('ftc-scout', season, code))}`;
}

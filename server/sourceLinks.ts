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

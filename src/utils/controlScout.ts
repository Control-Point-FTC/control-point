// Control Scout (controlscout.org): the sister app for FTC stats and match
// predictions, one account with Control Point (docs: server/sharedAccounts.ts).
// Linked from the sidebar, from team/event stats, and named on the sign-in
// page when someone arrives from Scout's "Continue with Control Point".
export const CONTROL_SCOUT_URL = 'https://controlscout.org';
/** Scout's icon (the yellow mark on the dark square), 96 px. */
export const CONTROL_SCOUT_ICON = '/control-scout-icon.png';

export const controlScoutTeamUrl = (team: number, season: number) => `${CONTROL_SCOUT_URL}/teams/${team}?season=${season}`;
export const controlScoutEventUrl = (code: string, season: number) => `${CONTROL_SCOUT_URL}/events/${season}/${encodeURIComponent(code.toUpperCase())}`;

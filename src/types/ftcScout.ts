// Shared shapes for the FTC scouting features (Team Stats → Compete / Analyze).
// Season-generic: the server maps each season's FTC Scout / FIRST Events
// fields onto these, so the UI never deals with per-season schemas.

export type FtcDataSource = 'first-events' | 'ftc-scout' | 'cache';

/** Freshness metadata carried by every scouting payload / section. */
export interface FtcFreshness {
  source: FtcDataSource;
  /** Where cached data originally came from (only when source === 'cache'). */
  origin?: Exclude<FtcDataSource, 'cache'>;
  fetchedAt: string;
  cached?: boolean;
  /** Served from cache because every live source was unreachable. */
  stale?: boolean;
  /** Some sub-requests failed; parts of the payload may be missing. */
  partial?: boolean;
}

/** Points split used everywhere (OPRs, averages, alliance scores). */
export interface FtcPointSplit {
  total: number | null;      // incl. penalties received
  totalNp: number | null;    // no-penalty total
  auto: number | null;
  teleop: number | null;     // driver-controlled, excluding endgame
  endgame: number | null;
  penaltiesCommitted: number | null; // points given to the opponent
  penaltiesByOpp: number | null;     // points received from opponent fouls
}

/** One team's stats at one event. */
export interface FtcTeamEventStats {
  teamNumber: number;
  name: string;
  rank: number | null;
  rp: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  qualMatchesPlayed: number | null;
  opr: FtcPointSplit | null;
  avg: FtcPointSplit | null;
  awards: string[];
}

export interface FtcAllianceScore {
  teams: { number: number; name: string; surrogate?: boolean; dq?: boolean }[];
  score: FtcPointSplit | null;
}

export interface FtcMatchFull {
  /** level:series:number — unique within an event. */
  key: string;
  level: 'qual' | 'playoff';
  series: number | null;
  number: number;
  /** Short label: Q-12, M-3 (playoff match). */
  label: string;
  description: string | null;
  time: string | null;
  played: boolean;
  red: FtcAllianceScore;
  blue: FtcAllianceScore;
  /** Which source supplied the score breakdown (auto/teleop/endgame/penalties). */
  breakdownSource: Exclude<FtcDataSource, 'cache'> | null;
}

export interface FtcAllianceSelection {
  number: number;
  name: string | null;
  captain: number | null;
  picks: number[];
}

export interface FtcEventFull extends FtcFreshness {
  code: string;
  season: number;
  name: string;
  type: string | null;
  start: string | null;
  end: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  /** Every team at the event with its event stats (FIRST rankings merged). */
  field: FtcTeamEventStats[];
  matches: FtcMatchFull[];
  alliances: FtcAllianceSelection[];
}

export interface FtcTeamEventSummary {
  code: string;
  name: string;
  date: string | null;
  type: string | null;
  city: string | null;
  state: string | null;
  stats: FtcTeamEventStats | null;
}

export interface FtcSeasonStat { value: number | null; rank: number | null }

export interface FtcTeamProfile extends FtcFreshness {
  number: number;
  name: string;
  school: string | null;
  sponsors: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  rookieYear: number | null;
  season: number;
  seasons: number[];
  /** Teams with season stats, for percentiles. */
  totalTeams: number | null;
  opr: { tot: FtcSeasonStat | null; auto: FtcSeasonStat | null; dc: FtcSeasonStat | null; eg: FtcSeasonStat | null };
  oprSource: 'ftc-scout' | null;
  events: FtcTeamEventSummary[];
}

export interface FtcTeamSearchHit {
  number: number;
  name: string;
  city: string | null;
  state: string | null;
}

export type ShortlistPriority = 'high' | 'medium' | 'low';

export interface ShortlistEntry {
  teamNumber: number;
  teamName: string;
  season: number;
  eventCode: string | null;
  notes: string;
  priority: ShortlistPriority;
  scoutNext: boolean;
  strengths: string[];
  weaknesses: string[];
  updatedAt: string;
}

/** What the Analyze page tells Bruno it's looking at (the server builds the pack). */
export interface ScoutingContextRequest {
  mode: 'analyze';
  season: number;
  eventCode: string | null;
  selectedTeam: number | null;
}

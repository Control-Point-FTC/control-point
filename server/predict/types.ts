// Predict — shared types. Season-generic: every game is reduced to the same
// components (auto, TeleOp without endgame, endgame, penalties committed),
// so the model and simulator run unchanged across seasons.

/** One alliance's result in a played match. All points are non-penalty unless named. */
export interface AllianceResult {
  /** Robots that actually played (excludes the sitting-out third team; includes surrogates). */
  teams: number[];
  /** Surrogate robots: they score with the alliance but the match doesn't count toward their rank. */
  surrogates?: number[];
  auto: number;
  teleop: number;
  endgame: number;
  /** Non-penalty total = auto + teleop + endgame. */
  np: number;
  /** Penalty points this alliance gave away (added to the other alliance's score). */
  penCommitted: number;
  /** Final score (np + the other alliance's committed penalties). */
  total: number;
  /** 2025+ bonus ranking points, when the season has them. */
  bonusRp?: { movement: boolean; goal: boolean; pattern: boolean };
}

export interface MatchRecord {
  season: number;
  eventCode: string;
  level: "qual" | "playoff";
  series: number;
  number: number;
  /** Epoch ms used to order matches (actual start, else scheduled, else event start + order). */
  time: number;
  red: AllianceResult;
  blue: AllianceResult;
}

export interface EventRecord {
  season: number;
  code: string;
  type: string;
  /** FTC region code (e.g. "USNJ"), when known. */
  region?: string;
  start: string; // YYYY-MM-DD
  end: string;
  /** Epoch ms of the event start (UTC midnight of `start`). */
  startTime: number;
  teams: number[];
  /** Official final quals rank per team (FTC Scout). */
  ranks: Map<number, number>;
  awards: { type: string; placement: number; team: number }[];
  matches: MatchRecord[];
}

/** A team's rating: expected contribution per component, plus how sure we are. */
export interface TeamRating {
  auto: number;
  teleop: number;
  endgame: number;
  pen: number;
  /** Matches folded into this rating this season. */
  n: number;
  /** Extra prediction variance from not knowing this team well (points²). */
  uncertainty: number;
  /** Epoch ms the rating was last brought up to date (for season growth). */
  asOf?: number;
  /** Experience used for the update gain, when a break between events has
   *  lowered it below `n` (see RatingParams.rebuildGapWeeks). */
  gainN?: number;
}

export const COMPONENTS = ["auto", "teleop", "endgame", "pen"] as const;
export type Component = (typeof COMPONENTS)[number];

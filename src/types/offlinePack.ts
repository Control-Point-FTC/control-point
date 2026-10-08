// Offline region pack (V3.5 phase 6b): a server-built, versioned snapshot of
// one FTC region's season (teams, events, match results) that the browser
// keeps so team search, team and event pages work with no connection.
// Compact on purpose: a region is a few hundred KB, the full pack a few MB.

import type { RatingBookData } from '../../server/predict/rating';
import type { AdvancementRecord, PredictModel } from '../../server/predict/forecast';
import type { AwardRecord } from '../../server/predict/awards';

/** Bumped when the layout changes; older packs on a device are re-downloaded. */
export const OFFLINE_PACK_FORMAT = 1;

/** Alliance score: total (with penalties), non-penalty total, auto, teleop (no endgame), endgame, penalty points given away. */
export type PackScore = [number, number, number, number, number, number];

export interface PackMatch {
  /** q = qualification, p = playoff. */
  l: 'q' | 'p';
  /** Playoff series (0 for quals). */
  s: number;
  n: number;
  /** Start time (actual, else scheduled). */
  t: string | null;
  r: number[];
  b: number[];
  /** Scores once played. */
  rs: PackScore | null;
  bs: PackScore | null;
  /** Surrogate robots in this match. */
  sur?: number[];
}

/** Team at an event: number, quals rank, ranking score, wins, losses, ties, quals played. */
export type PackEntry = [number, number | null, number | null, number | null, number | null, number | null, number | null];

export interface PackEvent {
  code: string;
  name: string;
  type: string | null;
  start: string | null;
  end: string | null;
  region: string | null;
  state: string | null;
  country: string | null;
  teams: PackEntry[];
  /** Award type, placement, team. */
  awards: [string, number, number][];
  matches: PackMatch[];
}

/** Team: number, name, city, state. */
export type PackTeam = [number, string, string | null, string | null];

/** What the device needs to forecast the pack's events offline. */
export interface OfflinePredict {
  model: PredictModel;
  /** The season's ratings for the pack's teams. */
  book: RatingBookData;
  /** FIRST advancement for the season and the one before (rows only for the pack's teams). */
  advancement: Record<number, AdvancementRecord[]>;
  /** Typical award line-up per event type (spaces removed). */
  awardSlots: Record<string, { type: string; placement: number }[]>;
  /** Award history of the pack's teams. */
  awards: [number, AwardRecord[]][];
}

export interface OfflinePack {
  format: number;
  /** Region code ("USNJ"), or "ALL" for every region. */
  region: string;
  regionName: string;
  season: number;
  /** When the server built this pack. */
  builtAt: string;
  /** When the match data in it was last downloaded from FTC Scout. */
  dataAsOf: string | null;
  teams: PackTeam[];
  events: PackEvent[];
  /** Ratings and model for offline Predict (missing until the server has ratings). */
  predict?: OfflinePredict;
}

/** What Settings shows before a download. */
export interface OfflineRegion { code: string; name: string; events: number; teams: number }
export interface OfflineRegions {
  season: number;
  dataAsOf: string | null;
  /** The workspace team's region, from the events it played. */
  detected: OfflineRegion | null;
  regions: OfflineRegion[];
  all: { events: number; teams: number };
}

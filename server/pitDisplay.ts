// The pit display (a no-login kiosk screen at /pit/<token>): which match is
// next for the team at a live event, and how its last one went. Pure, so it's
// tested without FIRST's data feeds.
import type { FtcMatchFull } from "../src/types/ftcScout.js";

export type PitMatch = {
  label: string;
  time: string | null;
  alliance: "red" | "blue";
  partners: number[];
  opponents: number[];
  /** Played matches only. */
  result?: { us: number; them: number; outcome: "W" | "L" | "T" };
};

const LEVEL_ORDER: Record<string, number> = { qual: 0, playoff: 1 };

function order(a: FtcMatchFull, b: FtcMatchFull): number {
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  return (LEVEL_ORDER[a.level] ?? 2) - (LEVEL_ORDER[b.level] ?? 2) || (a.series ?? 0) - (b.series ?? 0) || a.number - b.number;
}

function asPit(m: FtcMatchFull, team: number): PitMatch | null {
  const red = m.red.teams.map((t) => t.number);
  const blue = m.blue.teams.map((t) => t.number);
  const side = red.includes(team) ? "red" : blue.includes(team) ? "blue" : null;
  if (!side) return null;
  const ours = side === "red" ? red : blue;
  const out: PitMatch = { label: m.label, time: m.time, alliance: side, partners: ours.filter((n) => n !== team), opponents: side === "red" ? blue : red };
  const us = (side === "red" ? m.red : m.blue).score?.total;
  const them = (side === "red" ? m.blue : m.red).score?.total;
  if (m.played && typeof us === "number" && typeof them === "number") out.result = { us, them, outcome: us > them ? "W" : us < them ? "L" : "T" };
  return out;
}

/** The team's next unplayed match and its most recent played one at an event. */
export function nextMatchFor(matches: FtcMatchFull[], team: number): { next: PitMatch | null; last: PitMatch | null } {
  const ours = [...(matches || [])].sort(order).filter((m) => asPit(m, team));
  const next = ours.find((m) => !m.played);
  const played = ours.filter((m) => m.played);
  return { next: next ? asPit(next, team) : null, last: played.length ? asPit(played[played.length - 1], team) : null };
}

/** Plain text for a chat announcement on a big screen: no markdown marks, mentions as names, clipped. */
export function pitText(raw: unknown, max = 280): string {
  const t = String(raw ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/@\[([^\]]+)\]/g, "@$1")
    .replace(/[*_~`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

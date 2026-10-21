// Reliability index (Control Scout's, via GET /api/ftc/reliability): a 0–100 estimate from public match
// data, shown next to OPR where picks are made, and the source of the engine's recent-record reasons on
// predictions. Missing (offline, Scout down, a team with no matches) means no number, never an error.
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';
import { createTtlCache, SCOUT_TTL_MS } from './ftcScoutApi';
import type { ReliabilityAnswer, TeamReliability } from '../../server/scoutReliability';

export type { ReliabilityAnswer, TeamReliability };

const cache = createTtlCache<ReliabilityAnswer>(SCOUT_TTL_MS);

export async function fetchReliability(season: number, teams: number[]): Promise<ReliabilityAnswer> {
  const key = `${season}:${[...new Set(teams)].sort((a, b) => a - b).join(',')}`;
  return cache.get(key, async () => {
    const res = await apiFetch(`/api/ftc/reliability?season=${season}&teams=${key.split(':')[1]}`);
    if (!res.ok) throw new Error(`reliability ${res.status}`);
    return (await res.json()) as ReliabilityAnswer;
  });
}

/** Team → reliability for the teams given (empty until it loads, and on any failure). */
export function useReliability(season: number | null, teams: number[]): { by: Map<number, TeamReliability>; fieldIndex: number | null } {
  const list = useMemo(() => [...new Set(teams.filter((t) => t > 0))].sort((a, b) => a - b).slice(0, 100), [teams]);
  const key = list.join(',');
  const [answer, setAnswer] = useState<ReliabilityAnswer | null>(null);
  useEffect(() => {
    let alive = true;
    setAnswer(null);
    if (season && list.length) fetchReliability(season, list).then((a) => { if (alive) setAnswer(a); }).catch(() => { /* no number */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, key]);
  return useMemo(() => ({ by: new Map((answer?.teams ?? []).map((r) => [r.team, r])), fieldIndex: answer?.fieldIndex ?? null }), [answer]);
}

/** "Reliability 79/100 (est., 26 quals)" for a title or caption. */
export const reliabilityTitle = (r: TeamReliability) =>
  `Reliability estimate ${r.index}/100 from ${r.matches} qualification matches (Control Scout): ${r.noShows} no-show${r.noShows === 1 ? '' : 's'}, ${r.dqs} DQ, ${r.nearZero} near-zero. A near-zero match isn't proof of a dead robot: defense or a partner's carry looks the same.`;

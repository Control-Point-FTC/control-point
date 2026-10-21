// Reliability index (Control Scout's, via GET /api/ftc/reliability): a 0–100 estimate from public match
// data, shown next to OPR where picks are made, and the source of the engine's recent-record reasons on
// predictions. Missing (offline, Scout down, a team with no matches) means no number, never an error.
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';
import { createTtlCache } from './ftcScoutApi';
import { CACHE_MS, MAX_TEAMS_PER_REQUEST, type ReliabilityAnswer, type TeamReliability } from '../../server/scoutReliability';

export type { ReliabilityAnswer, TeamReliability };

// No longer than the server keeps a row fresh (server/scoutReliability.ts CACHE_MS), so the browser never
// shows a number the server itself would have stopped serving.
const cache = createTtlCache<ReliabilityAnswer>(CACHE_MS);
/** At most this many reliability requests at once (a big field is split into requests of 100). */
export const MAX_PARALLEL = 3;

export async function fetchReliability(season: number, teams: number[]): Promise<ReliabilityAnswer> {
  const key = `${season}:${[...new Set(teams)].sort((a, b) => a - b).join(',')}`;
  return cache.get(key, async () => {
    const res = await apiFetch(`/api/ftc/reliability?season=${season}&teams=${key.split(':')[1]}`);
    if (!res.ok) throw new Error(`reliability ${res.status}`);
    return (await res.json()) as ReliabilityAnswer;
  });
}

/**
 * Any number of teams: split into requests of MAX_TEAMS_PER_REQUEST, at most MAX_PARALLEL in flight, merged.
 * A failed chunk gives no numbers for its teams; the others still show.
 */
export async function fetchReliabilityAll(season: number, teams: number[], fetchChunk: typeof fetchReliability = fetchReliability): Promise<ReliabilityAnswer> {
  const list = [...new Set(teams.filter((t) => t > 0))].sort((a, b) => a - b);
  const chunks: number[][] = [];
  for (let i = 0; i < list.length; i += MAX_TEAMS_PER_REQUEST) chunks.push(list.slice(i, i + MAX_TEAMS_PER_REQUEST));
  const answers: (ReliabilityAnswer | null)[] = new Array(chunks.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      answers[i] = await fetchChunk(season, chunks[i]).catch(() => null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, chunks.length) }, worker));
  return {
    season,
    fieldIndex: answers.find((a) => a?.fieldIndex != null)?.fieldIndex ?? null,
    teams: answers.flatMap((a) => a?.teams ?? []),
  };
}

/** Team → reliability for the teams given (empty until it loads, and on any failure). */
export function useReliability(season: number | null, teams: number[]): { by: Map<number, TeamReliability>; fieldIndex: number | null } {
  const list = useMemo(() => [...new Set(teams.filter((t) => t > 0))].sort((a, b) => a - b), [teams]);
  const key = list.join(',');
  const [answer, setAnswer] = useState<ReliabilityAnswer | null>(null);
  useEffect(() => {
    let alive = true;
    setAnswer(null);
    if (season && list.length) fetchReliabilityAll(season, list).then((a) => { if (alive) setAnswer(a); }).catch(() => { /* no number */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, key]);
  return useMemo(() => ({ by: new Map((answer?.teams ?? []).map((r) => [r.team, r])), fieldIndex: answer?.fieldIndex ?? null }), [answer]);
}

/** "Reliability 79/100 (est., 26 quals)" for a title or caption. */
export const reliabilityTitle = (r: TeamReliability) =>
  `Reliability estimate ${r.index}/100 from ${r.matches} qualification matches (Control Scout): ${r.noShows} no-show${r.noShows === 1 ? '' : 's'}, ${r.dqs} DQ, ${r.nearZero} near-zero. A near-zero match isn't proof of a dead robot: defense or a partner's carry looks the same.`;

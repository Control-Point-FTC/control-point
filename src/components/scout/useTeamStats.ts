// Team Stats page state shared by Legacy TeamStatsView and Modern
// TeamStatsPage: Compete / Analyze mode (?mode=analyze), the season, our team
// number (for Analyze) and a team handed from Compete to Analyze.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchScoutTeam } from '../../services/ftcScoutApi';
import { currentFtcSeason } from '../FtcStats';

export type TeamStatsMode = 'compete' | 'analyze';

export function useTeamStats() {
  const [params, setParams] = useSearchParams();
  const mode: TeamStatsMode = params.get('mode') === 'analyze' ? 'analyze' : 'compete';
  const [season, setSeason] = useState(currentFtcSeason);
  const [myTeam, setMyTeam] = useState<number | null>(null);
  const [focusTeam, setFocusTeam] = useState<{ number: number; name: string } | null>(null);
  // Our team number (for Analyze). On a direct ?mode=analyze visit before the
  // new season has data, step back once to the latest season we played.
  const stepBack = useRef(params.get('mode') === 'analyze');
  useEffect(() => {
    let alive = true;
    fetchScoutTeam(season).then((p) => {
      if (!alive) return;
      setMyTeam(p.number);
      const prev = p.seasons.filter((s) => s < season).sort((a, b) => b - a)[0];
      if (stepBack.current && !p.events.length && prev) setSeason(prev);
      stepBack.current = false;
    }).catch(() => { stepBack.current = false; /* not connected / no data: Analyze still works by search */ });
    return () => { alive = false; };
  }, [season]);
  const setMode = (m: TeamStatsMode) => setParams((p) => { const n = new URLSearchParams(p); if (m === 'analyze') n.set('mode', 'analyze'); else n.delete('mode'); return n; });
  /** From Compete: open a team in Analyze. */
  const viewTeam = (n: number, name?: string) => { setFocusTeam({ number: n, name: name ?? `Team ${n}` }); setMode('analyze'); };
  return { mode, setMode, season, setSeason, myTeam, focusTeam, viewTeam };
}

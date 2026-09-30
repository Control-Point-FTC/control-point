import { Trophy } from 'lucide-react';
import { useFtcTeam, seasonLabel } from '../FtcStats';
import { Card, Button } from '../ui';

interface TeamPerformanceProps {
  onNavigate: (path: string) => void;
}

/**
 * The full FTC picture: team badge, season switcher pills, and the OPR
 * breakdown grid (Total / Auto / TeleOp / Endgame with world ranks).
 * Links out to the full Team Stats view.
 */
export default function TeamPerformance({ onNavigate }: TeamPerformanceProps) {
  const ftc = useFtcTeam();

  return (
    <Card
      title="Team Performance"
      subtitle={ftc.data ? `${ftc.data.name} · ftc-scout.org` : 'FTC Scout integration'}
      icon={Trophy}
      className="md:col-span-2 xl:col-span-8"
    >
      {ftc.loading ? (
        <div className="flex items-center gap-3 py-6">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted animate-pulse">Loading stats…</p>
        </div>
      ) : ftc.notConnected ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-2">
          <p className="text-sm text-text-muted flex-1">Connect your FTC team number to see live OPR, rankings, and event history here.</p>
          <Button onClick={() => onNavigate('/settings')} className="text-sm w-fit">Connect team</Button>
        </div>
      ) : ftc.data ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => onNavigate('/stats')} className="flex items-center gap-2.5 min-w-0 text-left group">
              <span className="bg-accent text-accent-ink font-display font-bold px-2.5 py-0.5 rounded-lg text-sm shrink-0">#{ftc.data.number}</span>
              <div className="min-w-0">
                <p className="text-white font-bold leading-tight text-sm truncate group-hover:text-accent transition-colors">{ftc.data.name}</p>
                <p className="text-[10px] text-text-muted truncate">{[ftc.data.school, ftc.data.city, ftc.data.state].filter(Boolean).join(' · ')}</p>
              </div>
            </button>
            <div className="flex items-center gap-1.5">
              <div className="flex flex-wrap gap-1">
                {ftc.data.seasons.map((s: number) => (
                  <button
                    key={s}
                    onClick={() => ftc.setSeason(s)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${s === ftc.season ? 'bg-accent text-accent-ink' : 'bg-white/5 text-text-muted hover:text-white border border-white/10'}`}
                  >
                    {s}–{String(s + 1).slice(2)}
                  </button>
                ))}
              </div>
              <button onClick={() => onNavigate('/stats')} className="text-[11px] font-bold text-accent hover:opacity-80 whitespace-nowrap">Full stats →</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Total OPR', ftc.data.opr.tot], ['Auto', ftc.data.opr.auto], ['TeleOp', ftc.data.opr.dc], ['Endgame', ftc.data.opr.eg]].map(([label, stat]: any) => (
              <button
                key={label as string}
                onClick={() => onNavigate('/stats')}
                className="px-2 py-1.5 bg-white/5 rounded-lg border border-white/5 min-w-0 text-left hover:border-accent/30 transition-colors"
              >
                <p className="text-[9px] text-text-muted uppercase font-bold tracking-wider truncate">{label}</p>
                <p className="text-base font-display font-bold text-white leading-tight truncate">
                  {stat?.value ?? '—'} <span className="text-[10px] text-accent font-bold">{stat?.rank != null ? `#${stat.rank.toLocaleString()}` : ''}</span>
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 py-4">
          <p className="text-sm text-text-muted flex-1">{ftc.error || 'Stats unavailable.'}</p>
          <Button variant="secondary" onClick={ftc.refresh} className="text-sm">Retry</Button>
        </div>
      )}
    </Card>
  );
}

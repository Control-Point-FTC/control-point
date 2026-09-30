import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useFtcTeam, seasonLabel } from '../FtcStats';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center px-3">
      <p className="text-lg font-display font-bold text-white leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mt-1">{label}</p>
    </div>
  );
}

/**
 * Compact, secondary competition snapshot. The FTC detail lives in
 * Team Stats; this is just the headline numbers.
 */
export default function CompetitionSnapshot() {
  const navigate = useNavigate();
  const ftc = useFtcTeam();
  const opr = ftc.data?.opr;

  return (
    <button
      onClick={() => navigate('/stats')}
      className="card-surface mt-4 w-full p-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-left shadow-[0_8px_30px_rgba(0,0,0,0.35)] hover:border-accent/40 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-accent/12 p-2.5 shrink-0">
          <Trophy className="w-5 h-5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Competition snapshot</p>
          <p className="text-xs text-text-muted">
            {ftc.loading
              ? 'Loading…'
              : opr?.tot
                ? `#${opr.tot.rank?.toLocaleString() ?? '–'} · ${seasonLabel(ftc.season)}`
                : 'Connect your team in Settings to see live standings'}
          </p>
        </div>
      </div>

      {opr?.tot && (
        <div className="flex items-center divide-x divide-white/10">
          <Stat label="OPR" value={String(opr.tot.value ?? '–')} />
          <Stat label="Auto" value={String(opr.auto?.value ?? '–')} />
          <Stat label="TeleOp" value={String(opr.dc?.value ?? '–')} />
          <Stat label="Endgame" value={String(opr.eg?.value ?? '–')} />
        </div>
      )}

      <span className="ml-auto text-xs font-bold text-accent group-hover:opacity-80 whitespace-nowrap">
        View team stats →
      </span>
    </button>
  );
}

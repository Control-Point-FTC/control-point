import { memo } from 'react';
import { Trophy, Sparkles, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../i18n';
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
function TeamPerformance({ onNavigate }: TeamPerformanceProps) {
  const { t } = useTranslation();
  const ftc = useFtcTeam();

  const oprLabels: [string, any][] = [
    [t('dashboard.totalOpr'), ftc.data?.opr.tot],
    [t('dashboard.autoPhase'), ftc.data?.opr.auto],
    [t('dashboard.teleopPhase'), ftc.data?.opr.dc],
    [t('dashboard.endgamePhase'), ftc.data?.opr.eg],
  ];

  return (
    <Card
      title={t('dashboard.teamPerformance')}
      subtitle={ftc.data ? `${ftc.data.name} · ftcscout.org` : t('dashboard.ftcScoutIntegration')}
      icon={Trophy}
      className="md:col-span-2 xl:col-span-5 p-5 gap-3"
    >
      {ftc.loading ? (
        <div className="flex items-center gap-3 py-6">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted animate-pulse">{t('dashboard.loadingStats')}</p>
        </div>
      ) : ftc.notConnected ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-2">
          <p className="text-sm text-text-muted flex-1">{t('dashboard.connectFtcTeam')}</p>
          <Button onClick={() => onNavigate('/settings?section=workspace')} className="text-sm w-fit">{t('dashboard.connectTeam')}</Button>
        </div>
      ) : ftc.data ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => onNavigate('/stats')} className="flex items-center gap-3 min-w-0 text-left group">
              <span className="bg-accent text-accent-ink font-display font-bold px-3 py-1 rounded-lg text-base shrink-0">#{ftc.data.number}</span>
              <div className="min-w-0">
                <p className="text-text-base font-bold leading-tight text-lg truncate group-hover:text-accent transition-colors">{ftc.data.name}</p>
                <p className="text-xs text-text-muted truncate">{[ftc.data.school, ftc.data.city, ftc.data.state].filter(Boolean).join(' · ')}</p>
              </div>
            </button>
            <div className="flex items-center gap-1.5">
              <div className="flex flex-wrap gap-1">
                {ftc.data.seasons.map((s: number) => (
                  <button
                    key={s}
                    onClick={() => ftc.setSeason(s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${s === ftc.season ? 'bg-accent text-accent-ink' : 'bg-text-base/5 text-text-muted hover:text-text-base border border-text-base/10'}`}
                  >
                    {s}–{String(s + 1).slice(2)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {oprLabels.map(([label, stat]: any) => (
              <button
                key={label as string}
                onClick={() => onNavigate('/stats')}
                className="px-3 py-2.5 bg-text-base/5 rounded-xl border border-text-base/5 min-w-0 text-left hover:border-accent/30 transition-colors"
              >
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider truncate">{label}</p>
                <p className="text-2xl font-display font-bold text-text-base leading-tight truncate">
                  {stat?.value ?? '—'} <span className="text-xs text-accent font-bold">{stat?.rank != null ? `#${stat.rank.toLocaleString()}` : ''}</span>
                </p>
              </button>
            ))}
          </div>
          {/* Jump into the Compete pages. */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => onNavigate('/stats')}
              className="group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-accent text-accent-ink font-bold text-sm hover:brightness-105 active:scale-[0.98] transition-all min-w-0"
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span className="truncate">{t('nav.teamStats')}</span>
              <ChevronRight className="w-4 h-4 ml-auto shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => onNavigate('/predict')}
              className="group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-text-base/[0.06] border border-text-base/10 text-text-base font-bold text-sm hover:border-accent/40 active:scale-[0.98] transition-all min-w-0"
            >
              <Sparkles className="w-4 h-4 shrink-0 text-accent" />
              <span className="truncate">{t('nav.predict')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-sky-500 text-white text-[9px] font-black tracking-wider leading-none shrink-0">BETA</span>
              <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-text-muted group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 py-4">
          <p className="text-sm text-text-muted flex-1">{ftc.error || t('dashboard.statsUnavailable')}</p>
          <Button variant="secondary" onClick={ftc.refresh} className="text-sm">{t('dashboard.retry')}</Button>
        </div>
      )}
    </Card>
  );
}

export default memo(TeamPerformance);

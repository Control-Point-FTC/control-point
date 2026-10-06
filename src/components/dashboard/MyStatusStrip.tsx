import { useState, memo } from 'react';
import { format } from 'date-fns';
import { CalendarCheck, CheckSquare, Clock, LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import { useSelfReport } from './useSelfReport';
import { Card, Button, cn } from '../ui';

interface MyStatusStripProps {
  currentUser: any;
  attendance: any[];
  isLoading: boolean;
  setLoading: (v: boolean) => void;
  isAiLoading: boolean;
  ThinkingIndicator: any;
  onRefresh: () => void;
  setAttendance?: (fn: (prev: any[]) => any[]) => void;
}

/**
 * The member's own check-in for today as a slim strip under the KPI row:
 * Present / Late / Out. Out opens a modal to log the reason (saved as
 * unexcused; an admin can flip it to excused from the Attendance view).
 */
function MyStatusStrip({
  currentUser,
  attendance,
  isLoading,
  setLoading,
  isAiLoading,
  ThinkingIndicator,
  onRefresh,
  setAttendance,
}: MyStatusStripProps) {
  const { t } = useTranslation();
  const [showOut, setShowOut] = useState(false);
  const [outReason, setOutReason] = useState('');

  // Shared check-in logic (also used by the Modern Home).
  const { myStatus, report } = useSelfReport({
    currentUser, attendance, setAttendance, setLoading, onRefresh,
    absenceLoggedMessage: t('dashboard.absenceLogged'),
  });

  const statusLabel =
    myStatus?.status === 'P' ? t('dashboard.statusPresent')
    : myStatus?.status === 'A' ? t('dashboard.statusAbsent')
    : myStatus?.status === 'E' ? t('dashboard.statusExcused')
    : myStatus?.status === 'L' ? t('dashboard.statusLate')
    : t('dashboard.statusOther');

  const handleSelfReport = async (status: string, reason?: string) => {
    const ok = await report(status, reason);
    if (ok) setShowOut(false);
  };

  return (
    <>
      <div className="card-surface px-4 py-3 flex flex-wrap items-center gap-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent/12 p-1.5">
            <User className="w-4 h-4 text-accent" />
          </div>
          <span className="text-sm font-bold text-text-base">{t('dashboard.myStatus')}</span>
          <span className="text-[11px] text-text-muted">{t('dashboard.todaysCheckin')}</span>
        </div>
        <div className="flex-1" />
        {myStatus ? (
          <div className={cn(
            'px-3 py-1.5 rounded-xl border flex items-center gap-3 text-sm font-bold',
            myStatus.status === 'P' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            myStatus.status === 'A' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
            myStatus.status === 'L' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
            'bg-blue-500/10 border-blue-500/30 text-blue-400'
          )}>
            <span className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4" />
              {statusLabel}
            </span>
            <button onClick={() => handleSelfReport('-')} className="text-[11px] opacity-60 hover:opacity-100 font-medium">{t('dashboard.reset')}</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => handleSelfReport('P')} variant="outline" className="text-xs border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10" disabled={isAiLoading || isLoading}>
              <CheckSquare className="w-3.5 h-3.5" /> {t('dashboard.imHere')}
            </Button>
            <Button onClick={() => handleSelfReport('L')} variant="outline" className="text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10" disabled={isAiLoading || isLoading}>
              <Clock className="w-3.5 h-3.5" /> {t('dashboard.statusLate')}
            </Button>
            <Button onClick={() => setShowOut(true)} variant="secondary" className="text-xs" disabled={isAiLoading || isLoading}>
              <LogOut className="w-3.5 h-3.5" /> {t('dashboard.out')}
            </Button>
          </div>
        )}
      </div>

      {showOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={t('dashboard.logAbsence')} className="w-full max-w-md">
            <div className="space-y-4">
              <p className="text-sm text-text-muted">{t('dashboard.absenceWhy')}</p>
              <textarea
                className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-24 disabled:opacity-50"
                placeholder={t('dashboard.absenceReasonPlaceholder')}
                value={outReason}
                onChange={(e) => setOutReason(e.target.value)}
                disabled={isAiLoading}
              />
              {isAiLoading && <div className="flex justify-center"><ThinkingIndicator /></div>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowOut(false)} disabled={isAiLoading}>{t('common.cancel')}</Button>
                <Button onClick={() => handleSelfReport('O', outReason)} disabled={isAiLoading || !outReason}>{t('dashboard.submit')}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export default memo(MyStatusStrip);

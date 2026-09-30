import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarCheck, CheckSquare, Clock, LogOut, User } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { notify } from '../dialog';
import { Card, Button, cn } from '../ui';

interface MyStatusCardProps {
  currentUser: any;
  attendance: any[];
  isLoading: boolean;
  setLoading: (v: boolean) => void;
  isAiLoading: boolean;
  ThinkingIndicator: any;
  onRefresh: () => void;
}

/**
 * The member's own check-in for today: Present / Late / Out.
 * Out opens a modal to log the reason (saved as unexcused; an admin
 * can flip it to excused from the Attendance view).
 */
export default function MyStatusCard({
  currentUser,
  attendance,
  isLoading,
  setLoading,
  isAiLoading,
  ThinkingIndicator,
  onRefresh,
}: MyStatusCardProps) {
  const [showOut, setShowOut] = useState(false);
  const [outReason, setOutReason] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const myStatus = attendance?.find((r: any) => r.member_id === currentUser?.id && r.date === today);

  const handleSelfReport = async (status: string, reason?: string) => {
    setLoading(true);
    try {
      let finalStatus = status;
      if (status === 'O' && reason) {
        finalStatus = 'U';
      }
      const res = await apiFetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          records: [{ member_id: currentUser.id, status: finalStatus, reason }]
        })
      });
      if (res.ok) {
        setShowOut(false);
        onRefresh();
        if (reason) notify('Absence logged. An admin can mark it excused from the Attendance view.', 'success');
      }
    } finally {
      setLoading(false);
    }
  };

  const statusLabel =
    myStatus?.status === 'P' ? 'Present'
    : myStatus?.status === 'A' ? 'Absent'
    : myStatus?.status === 'E' ? 'Excused'
    : myStatus?.status === 'L' ? 'Late'
    : 'Other';

  return (
    <>
      <Card title="My status" subtitle="Your check-in for today" icon={User} className="xl:col-span-5">
        {myStatus ? (
          <div className="flex items-center justify-between gap-3">
            <div className={cn(
              'px-4 py-2.5 rounded-xl border flex items-center gap-3 text-sm font-bold flex-1',
              myStatus.status === 'P' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              myStatus.status === 'A' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
              myStatus.status === 'L' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
              'bg-blue-500/10 border-blue-500/30 text-blue-400'
            )}>
              <CalendarCheck className="w-4 h-4" />
              <span>{statusLabel}</span>
            </div>
            <button
              onClick={() => handleSelfReport('-')}
              className="text-[11px] font-bold text-text-muted hover:text-white px-2 py-2"
            >
              Change
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-text-muted mb-3">You haven't checked in yet today.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleSelfReport('P')}
                variant="outline"
                className="text-xs border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                disabled={isAiLoading || isLoading}
              >
                <CheckSquare className="w-3.5 h-3.5" /> Present
              </Button>
              <Button
                onClick={() => handleSelfReport('L')}
                variant="outline"
                className="text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                disabled={isAiLoading || isLoading}
              >
                <Clock className="w-3.5 h-3.5" /> Late
              </Button>
              <Button
                onClick={() => setShowOut(true)}
                variant="secondary"
                className="text-xs"
                disabled={isAiLoading || isLoading}
              >
                <LogOut className="w-3.5 h-3.5" /> Out
              </Button>
            </div>
          </div>
        )}
      </Card>

      {showOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Absence" className="w-full max-w-md">
            <div className="space-y-4">
              <p className="text-sm text-text-muted">Let the team know why you'll be missing today's session.</p>
              <textarea
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24 disabled:opacity-50"
                placeholder="Reason for absence..."
                value={outReason}
                onChange={(e) => setOutReason(e.target.value)}
                disabled={isAiLoading}
              />
              {isAiLoading && <div className="flex justify-center"><ThinkingIndicator /></div>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowOut(false)} disabled={isAiLoading}>Cancel</Button>
                <Button onClick={() => handleSelfReport('O', outReason)} disabled={isAiLoading || !outReason}>Submit</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// Shared "my check-in today" logic (Legacy MyStatusStrip + Modern Home).
// Behavior is unchanged from the original MyStatusStrip: optimistic update,
// POST /api/attendance/batch, rollback on failure, 'O' + reason → 'U'.
import { useState } from 'react';
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { notify } from '../dialog';

export function useSelfReport({ currentUser, attendance, setAttendance, setLoading, onRefresh, absenceLoggedMessage }: {
  currentUser: any;
  attendance: any[];
  setAttendance?: (fn: (prev: any[]) => any[]) => void;
  setLoading: (v: boolean) => void;
  onRefresh: () => void;
  /** Toast shown after logging an absence with a reason. */
  absenceLoggedMessage: string;
}) {
  const [saving, setSaving] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const myStatus = attendance?.find((r: any) => r.member_id === currentUser?.id && r.date === today);

  /** status: 'P' | 'L' | '-' (reset) | 'O' (out, requires reason). Returns true when saved. */
  const report = async (status: string, reason?: string): Promise<boolean> => {
    let finalStatus = status;
    if (status === 'O' && reason) finalStatus = 'U';
    const prev = attendance;
    if (setAttendance) {
      const optimistic = { member_id: currentUser.id, date: today, status: finalStatus, reason: reason || '' };
      setAttendance((p: any[]) => {
        const idx = p.findIndex((r: any) => r.member_id === currentUser.id && r.date === today);
        if (idx >= 0) {
          const next = [...p];
          next[idx] = { ...next[idx], ...optimistic };
          return next;
        }
        return [...p, optimistic];
      });
    }
    setLoading(true);
    setSaving(true);
    try {
      const res = await apiFetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, records: [{ member_id: currentUser.id, status: finalStatus, reason }] }),
      });
      if (res.ok) {
        onRefresh();
        if (reason) notify(absenceLoggedMessage, 'success');
        return true;
      }
      if (setAttendance) setAttendance(() => prev);
      return false;
    } catch {
      if (setAttendance) setAttendance(() => prev);
      return false;
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  return { today, myStatus, report, saving };
}

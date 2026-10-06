// Shared Attendance logic for the Legacy AttendanceView and the Modern
// Attendance page. Extracted from AttendanceView: the same endpoints
// (/api/attendance/batch, /api/hidden-dates…), optimistic cell saves and the
// meeting-day (hidden dates) rules. Also the QR session and student check-in
// hooks, which back QrSessionPanel and StudentCheckinView.
import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { notify } from '../dialog';
import { useDraft } from '../../modern/drafts';

export const ATTENDANCE_STATUSES = ['-', 'P', 'L', 'E', 'U', 'S'] as const;
export const STATUS_LABELS: Record<string, string> = {
  P: 'Present', L: 'Late', E: 'Excused', U: 'Unexcused', S: 'School event', '-': 'Not marked',
};

/** Parse 'yyyy-MM-dd' as a LOCAL date (plain new Date(str) is UTC midnight,
 *  which shifts the weekday back a day in US timezones). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const weekdayOf = (dateStr: string): number => parseLocalDate(dateStr).getDay();

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h > 0 ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// The grid always shows at least MIN_VISIBLE_DATES columns: it scans the
// 14-day window, then keeps scanning forward (skipping hidden days) until it
// has enough. Sunday-only teams see 5 consecutive Sundays; Mon–Fri teams see
// their weekdays in order with weekends skipped.
const MIN_VISIBLE_DATES = 5;
const MAX_LOOKAHEAD_DAYS = 365;

export function useAttendanceController({ attendance, refresh, hasScope }: {
  attendance: any[];
  refresh: { attendance: () => any };
  hasScope: (s: string) => boolean;
}) {
  const isAdmin = hasScope('attendance');
  const [sessions, setSessions] = useState<string[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [calendarStart, setCalendarStart] = useState(0); // 2-week pages from today
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Optimistic cell values, keyed "memberId|date" (so several cells for one
  // member can be in flight at once).
  const [pendingChanges, setPendingChanges] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchExtraData = async () => {
      try {
        const [sess, summ, hidden] = await Promise.all([
          apiFetch('/api/attendance/sessions').then((r) => r.json()),
          apiFetch('/api/attendance/summary').then((r) => r.json()),
          apiFetch('/api/hidden-dates').then((r) => r.json()),
        ]);
        if (Array.isArray(sess)) setSessions(sess);
        if (Array.isArray(summ)) setSummary(summ);
        if (Array.isArray(hidden)) setHiddenDates(hidden);
      } catch { /* offline — keep what we have */ }
    };
    fetchExtraData();
  }, [attendance]);

  const visibleDates = useMemo(() => {
    const dates: string[] = [];
    const d = new Date();
    d.setDate(d.getDate() + calendarStart * 14);
    for (let i = 0; i < MAX_LOOKAHEAD_DAYS && (i < 14 || dates.length < MIN_VISIBLE_DATES); i++) {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (!hiddenDates.includes(dateStr)) dates.push(dateStr);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }, [calendarStart, hiddenDates]);

  // Date-range label follows the dates actually shown.
  const rangeLabel = useMemo(() => {
    if (visibleDates.length > 0) {
      return `${format(parseLocalDate(visibleDates[0]), 'MMM dd')} - ${format(parseLocalDate(visibleDates[visibleDates.length - 1]), 'MMM dd')}`;
    }
    const s = new Date();
    s.setDate(s.getDate() + calendarStart * 14);
    const e = new Date(s);
    e.setDate(e.getDate() + 13);
    return `${format(s, 'MMM dd')} - ${format(e, 'MMM dd')}`;
  }, [visibleDates, calendarStart]);

  const hasMoreDates = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + (calendarStart + 1) * 14);
    return next < new Date(new Date().getFullYear() + 1, 0, 1); // up to next year
  }, [calendarStart]);

  // Per-cell request sequence, and the value the server accepted since the
  // last attendance snapshot. A failed save rolls back to that confirmed value
  // or else to the server data — never to another unsaved value. The server
  // acknowledges a save before the client can see a later snapshot, so any new
  // snapshot is authoritative and clears the confirmed cache.
  const cellSeq = useRef(new Map<string, number>());
  const confirmed = useRef(new Map<string, string>());
  const confirmedSeq = useRef(new Map<string, number>());

  // Drop optimistic values once the server data agrees with them.
  useEffect(() => {
    confirmed.current.clear(); // (confirmedSeq persists so a late, older ack can't re-confirm)
    setPendingChanges((m) => {
      if (!m.size) return m;
      const n = new Map(m);
      for (const [k, v] of m) {
        const [mid, date] = k.split('|');
        const server = attendance.find((r: any) => r.member_id === Number(mid) && r.date === date)?.status || '-';
        if (server === v) n.delete(k);
      }
      return n.size === m.size ? m : n;
    });
  }, [attendance]);

  const getStatus = (memberId: number, date: string) => {
    const k = `${memberId}|${date}`;
    if (pendingChanges.has(k)) return pendingChanges.get(k)!;
    return attendance.find((r: any) => r.member_id === memberId && r.date === date)?.status || '-';
  };

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  /** Set one cell (optimistic) — same POST /api/attendance/batch as before. */
  const setStatus = async (memberId: number, date: string, nextStatus: string) => {
    if (!isAdmin) return;
    const k = `${memberId}|${date}`;
    const seq = (cellSeq.current.get(k) ?? 0) + 1;
    cellSeq.current.set(k, seq);
    setPendingChanges((m) => new Map(m).set(k, nextStatus));
    setSavingStatus('saving');
    const rollback = () => {
      if (cellSeq.current.get(k) !== seq) return; // a newer edit owns this cell
      setPendingChanges((m) => {
        const n = new Map(m);
        if (confirmed.current.has(k)) n.set(k, confirmed.current.get(k)!); else n.delete(k);
        return n;
      });
    };
    try {
      const res = await apiFetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, records: [{ member_id: memberId, status: nextStatus === '-' ? null : nextStatus }] }),
      });
      if (res.ok) {
        // Remember what the server accepted, unless an older save finished
        // after a newer one already succeeded.
        const ack = confirmedSeq.current.get(k) ?? 0;
        if (seq >= ack) { confirmed.current.set(k, nextStatus); confirmedSeq.current.set(k, seq); }
        setSavingStatus('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSavingStatus('idle'), 2000);
        refresh.attendance(); // keep the optimistic value; reconcile in background
      } else {
        rollback();
        setSavingStatus('idle');
        notify('Failed to save attendance', 'error');
      }
    } catch {
      rollback();
      setSavingStatus('idle');
      notify('Error saving attendance', 'error');
    }
  };

  /** Legacy click: cycle - → P → L → E → U → S → -. */
  const toggleStatus = (memberId: number, date: string) => {
    const current = getStatus(memberId, date);
    const i = ATTENDANCE_STATUSES.indexOf(current as any);
    return setStatus(memberId, date, ATTENDANCE_STATUSES[(i + 1) % ATTENDANCE_STATUSES.length]);
  };

  const hideDate = async (dateStr: string) => {
    setHiddenDates((h) => [...h, dateStr]);
    try {
      await apiFetch('/api/hidden-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: dateStr }) });
    } catch (error) {
      console.error('Error hiding date:', error);
      setHiddenDates((h) => h.filter((d) => d !== dateStr));
    }
  };

  const unhideDate = async (dateStr: string) => {
    setHiddenDates((h) => h.filter((d) => d !== dateStr));
    try {
      await apiFetch(`/api/hidden-dates/${dateStr}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error unhiding date:', error);
      setHiddenDates((h) => [...h, dateStr]);
    }
  };

  const isWeekdayHidden = (dayIndex: number) => hiddenDates.some((d) => weekdayOf(d) === dayIndex);

  const hideByDayOfWeek = async (dayIndex: number) => {
    // dayIndex: 0=Sunday … 6=Saturday; covers the past and next year.
    const newHidden = [...hiddenDates];
    const toAdd: string[] = [];
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365);
    for (let i = 0; i < 730; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      if (checkDate.getDay() === dayIndex) {
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        if (!newHidden.includes(dateStr)) { newHidden.push(dateStr); toAdd.push(dateStr); }
      }
    }
    setHiddenDates(newHidden);
    if (toAdd.length > 0) {
      await apiFetch('/api/hidden-dates/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: toAdd }) }).catch(console.error);
    }
  };

  const unhideByDayOfWeek = async (dayIndex: number) => {
    const removed = hiddenDates.filter((d) => weekdayOf(d) === dayIndex);
    setHiddenDates(hiddenDates.filter((d) => weekdayOf(d) !== dayIndex));
    if (removed.length > 0) {
      await apiFetch('/api/hidden-dates/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: removed }) }).catch(console.error);
    }
  };

  const toggleWeekday = (dayIndex: number) => (isWeekdayHidden(dayIndex) ? unhideByDayOfWeek(dayIndex) : hideByDayOfWeek(dayIndex));

  const hideAll = async () => {
    const all = new Set<string>();
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365);
    for (let i = 0; i < 730; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      all.add(format(checkDate, 'yyyy-MM-dd'));
    }
    const newHidden = Array.from(all);
    const toAdd = newHidden.filter((d) => !hiddenDates.includes(d));
    setHiddenDates(newHidden);
    if (toAdd.length > 0) {
      await apiFetch('/api/hidden-dates/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: toAdd }) }).catch(console.error);
    }
  };

  const unhideAll = async () => {
    const removed = [...hiddenDates];
    setHiddenDates([]);
    if (removed.length > 0) {
      await apiFetch('/api/hidden-dates/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: removed }) }).catch(console.error);
    }
  };

  return {
    isAdmin, sessions, summary, hiddenDates, calendarStart, setCalendarStart, savingStatus,
    visibleDates, rangeLabel, hasMoreDates, getStatus, setStatus, toggleStatus,
    hideDate, unhideDate, isWeekdayHidden, hideByDayOfWeek, unhideByDayOfWeek, toggleWeekday, hideAll, unhideAll,
  };
}

export const QR_DURATIONS: { label: string; value: number | 'today' }[] = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '3 hours', value: 180 },
  { label: 'Rest of today', value: 'today' },
];

/** Admin QR check-in session: load / start / stop and a live countdown. */
export function useQrSession() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<number | 'today'>(60);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/attendance/qr-session');
        const data = await res.json();
        if (res.ok) setSession(data.session);
      } catch { /* offline — leave as-is */ }
      finally { setLoading(false); }
    })();
  }, []);
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.token]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/attendance/qr-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start session');
      setSession(data.session);
      setNow(Date.now());
      notify('Check-in session is live — project the QR.', 'success');
    } catch (e: any) {
      notify(e.message || 'Could not start session', 'error');
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/attendance/qr-session/stop', { method: 'POST' });
      setSession(null);
      notify('Check-in session ended.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const remaining = session ? new Date(session.expiresAt).getTime() - now : 0;
  useEffect(() => {
    if (session && remaining <= 0) setSession(null);
  }, [remaining]);

  return { session, loading, busy, duration, setDuration, start, stop, remaining };
}

/** Student check-in: scan a QR token or type the day code. The typed code
 *  is drafted so it survives a Legacy/Modern switch. */
export function useStudentCheckin({ attendance, currentUser, refresh, onRefresh }: {
  attendance: any[];
  currentUser: any;
  refresh?: { attendance?: () => any };
  onRefresh?: () => any;
}) {
  const [code, setCode] = useDraft<string>('attendance:checkin-code', '');
  const [codeBusy, setCodeBusy] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const myRecords = (attendance || [])
    .filter((r: any) => r.member_id === currentUser?.id)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  const todayRecord = myRecords.find((r: any) => r.date === today);
  const checkedIn = !!todayRecord && (todayRecord.status === 'P' || todayRecord.status === 'L');

  const reload = async () => {
    if (refresh?.attendance) await refresh.attendance();
    else await onRefresh?.();
  };

  const checkinWithToken = async (token: string) => {
    try {
      const res = await apiFetch(`/api/attendance/checkin/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      notify(data.already ? 'You were already checked in.' : 'Checked in — welcome!', 'success');
      await reload();
      return true;
    } catch (e: any) {
      notify(e.message || 'Check-in failed', 'error');
      return false;
    }
  };

  const normalizeCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  const submitCode = async () => {
    if (!code.trim() || codeBusy) return false;
    setCodeBusy(true);
    try {
      const res = await apiFetch('/api/attendance/checkin-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      notify(data.already ? 'You were already checked in.' : 'Checked in — welcome!', 'success');
      setCode('');
      await reload();
      return true;
    } catch (e: any) {
      notify(e.message || 'Check-in failed', 'error');
      return false;
    } finally {
      setCodeBusy(false);
    }
  };

  return { code, setCode: (v: string) => setCode(normalizeCode(v)), codeBusy, submitCode, checkinWithToken, myRecords, todayRecord, checkedIn, today };
}

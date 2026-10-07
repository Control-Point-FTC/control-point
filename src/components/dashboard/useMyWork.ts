// Shared "my work" logic (Legacy StudentDashboardView + Modern Home): my
// tasks, my attendance stats, upcoming events, and the task done-toggle.
// Behavior is unchanged from the original StudentDashboardView.
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { notify } from '../dialog';
import { isTaskOverdue } from '../../utils/countdown';

export function assigneeIds(t: any): any[] {
  return Array.isArray(t.assignee_ids) ? t.assignee_ids : (t.assigned_to ? [t.assigned_to] : []);
}

export function useMyWork({ tasks, setTasks, attendance, events, currentUser, onRequestComplete }: {
  tasks: any[];
  setTasks: (v: any) => void;
  attendance: any[];
  events: any[];
  currentUser: any;
  onRequestComplete?: (task: any) => void;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(new Date(Date.now() + 864e5), 'yyyy-MM-dd');
  const myTasks = (tasks || []).filter((t: any) => assigneeIds(t).includes(currentUser?.id));
  const openTasks = myTasks.filter((t: any) => t.status !== 'done');
  // Past the full deadline: a task due today at 15:30 is overdue at 16:00.
  const overdueMine = openTasks.filter((t: any) => isTaskOverdue(t));
  const myAttendance = (attendance || []).filter((r: any) => r.member_id === currentUser?.id);
  const todayRecord = myAttendance.find((r: any) => r.date === today);
  const checkedIn = !!(todayRecord && (todayRecord.status === 'P' || todayRecord.status === 'L'));
  const presentCount = myAttendance.filter((r: any) => r.status === 'P').length;
  const lateCount = myAttendance.filter((r: any) => r.status === 'L').length;
  const excusedCount = myAttendance.filter((r: any) => r.status === 'E').length;
  const attendanceRate = myAttendance.length > 0
    ? Math.round((presentCount + lateCount + excusedCount) / myAttendance.length * 100)
    : null;
  const upcomingEvents = (events || [])
    .filter((e: any) => e.date >= today)
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const toggleTask = async (task: any) => {
    // Moving to done requires proof: open the shared completion dialog.
    // (The server rejects direct PATCH transitions to done.)
    const next = task.status === 'done' ? 'todo' : 'done';
    if (next === 'done' && onRequestComplete) {
      onRequestComplete(task);
      return;
    }
    // Optimistic: flip instantly, roll back on failure. No global spinner.
    const prev = tasks;
    setTasks((ts: any[]) => ts.map((t: any) => t.id === task.id
      ? { ...t, status: next, completed_at: next === 'done' ? new Date().toISOString() : null }
      : t));
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setTasks(prev);
        notify('Could not update task — try again.', 'error');
      }
    } catch {
      setTasks(prev);
      notify('Could not update task — try again.', 'error');
    }
  };

  const dayLabel = (dateStr: string) =>
    dateStr === today ? 'Today' : dateStr === tomorrow ? 'Tomorrow' : format(new Date(dateStr + 'T12:00:00'), 'EEEE');

  return {
    today, myTasks, openTasks, overdueMine, myAttendance, todayRecord, checkedIn,
    presentCount, lateCount, excusedCount, attendanceRate, upcomingEvents, toggleTask, dayLabel,
  };
}

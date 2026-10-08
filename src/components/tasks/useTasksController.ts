// Shared Tasks logic for the Legacy TasksView and the Modern Tasks page.
// Extracted verbatim from TasksView (same endpoints, permissions and
// optimistic updates). The editor and bulk-import text live in the shared
// draft store, so an open, half-written task survives a Legacy/Modern switch.
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { notify, confirmDialog } from '../dialog';
import { setScreenEntity } from '../../services/brunoContext';
import { useDraft, getDraft, setDraft, newSessionId } from '../../modern/drafts';
import { bulkDelete, runBulk } from '../../modern/ui/selection';
import { readRecurrence, type Recurrence } from '../../utils/quickAdd';

export interface TaskForm {
  team_id: any;
  title: string;
  description: string;
  assignee_ids: number[];
  due_date: string;
  /** Optional HH:MM; empty = end of the due date. */
  due_time: string;
  status: string;
  /** '' | low | medium | high | urgent */
  priority?: string;
  /** '' | daily | weekly | biweekly | monthly | custom */
  repeat?: string;
  /** The stored rule when it isn't one of the menu's (e.g. every 3 weeks). */
  repeatRule?: Recurrence | null;
}

/** Form repeat choice <-> stored rule. */
export const REPEAT_OPTIONS = [
  { value: '', label: "Doesn't repeat" },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
];
export function repeatToRule(v: string | undefined, custom?: Recurrence | null): Recurrence | null {
  if (v === 'custom') return custom ?? null;
  return v === 'daily' ? { freq: 'daily', interval: 1 } : v === 'weekly' ? { freq: 'weekly', interval: 1 }
    : v === 'biweekly' ? { freq: 'weekly', interval: 2 } : v === 'monthly' ? { freq: 'monthly', interval: 1 } : null;
}
export function ruleToRepeat(v: unknown): string {
  const r = readRecurrence(v);
  if (!r) return '';
  if (r.freq === 'daily' && r.interval === 1) return 'daily';
  if (r.freq === 'monthly' && r.interval === 1) return 'monthly';
  if (r.freq === 'weekly' && r.interval === 1) return 'weekly';
  if (r.freq === 'weekly' && r.interval === 2) return 'biweekly';
  // Anything else (every 3 weeks, every 2 days…) is kept exactly as stored.
  return 'custom';
}
export const PRIORITY_META: Record<string, { label: string; tone: string }> = {
  urgent: { label: 'Urgent', tone: 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300' },
  high: { label: 'High', tone: 'border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-300' },
  medium: { label: 'Medium', tone: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  low: { label: 'Low', tone: 'border-border text-muted-foreground' },
};
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

export function defaultTeamId(teams: any[], currentUser: any): any {
  const tid = currentUser?.team_id;
  if (tid == null || tid === '') return '';
  return teams.some((t: any) => String(t.id) === String(tid)) ? tid : '';
}

export function taskAssigneeIds(t: any): number[] {
  return Array.isArray(t.assignee_ids) && t.assignee_ids.length > 0 ? t.assignee_ids : (t.assigned_to ? [t.assigned_to] : []);
}

export const TASK_COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
] as const;

const EMPTY_FORM: TaskForm = { team_id: '', title: '', description: '', assignee_ids: [], due_date: '', due_time: '', status: 'todo', priority: '', repeat: '' };
const EMPTY_LIST: any[] = [];

/** Completed-per-day for the last 7 days. */
export function completionTrendsOf(tasks: any[]) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();
  return last7Days.map((date) => ({
    date: format(new Date(date), 'MMM dd'),
    completed: tasks.filter((t: any) => t.status === 'done' && t.completed_at?.startsWith(date)).length,
  }));
}

/** Per-member task counts by status (members with at least one task). */
export function memberCapacityOf(tasks: any[], members: any[]) {
  return members.map((m: any) => {
    const memberTasks = tasks.filter((t: any) => {
      const ids = Array.isArray(t.assignee_ids) ? t.assignee_ids : (t.assigned_to ? [t.assigned_to] : []);
      return ids.includes(m.id);
    });
    return {
      name: m.name,
      total: memberTasks.length,
      todo: memberTasks.filter((t: any) => t.status === 'todo').length,
      inProgress: memberTasks.filter((t: any) => t.status === 'in-progress').length,
      done: memberTasks.filter((t: any) => t.status === 'done').length,
    };
  }).filter((m: any) => m.total > 0);
}

/** Average days from created to done (string with 1 decimal, or 0). */
export function avgCompletionDaysOf(tasks: any[]) {
  const completedTasks = tasks.filter((t: any) => t.status === 'done' && t.completed_at && t.created_at);
  if (completedTasks.length === 0) return 0;
  const totalTime = completedTasks.reduce((acc: number, t: any) => acc + (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()), 0);
  return (totalTime / completedTasks.length / (1000 * 60 * 60 * 24)).toFixed(1);
}

export function useTasksController({ tasks, setTasks, teams, members, refresh, currentUser, hasScope, onRequestComplete }: {
  tasks: any[];
  setTasks: (v: any) => void;
  teams: any[];
  members: any[];
  refresh: { tasks: () => void };
  currentUser: any;
  hasScope: (s: string) => boolean;
  onRequestComplete?: (task: any) => void;
}) {
  // Editor (drafted: survives remounts / mode switches)
  const [showAddTask, setShowAddTask] = useDraft<boolean>('tasks:editor-open', false);
  const [editingTaskId, setEditingTaskId] = useDraft<number | null>('tasks:editing-id', null);
  const [newTask, setNewTask] = useDraft<TaskForm>('tasks:form', EMPTY_FORM);
  const [isBoardTask, setIsBoardTask] = useDraft<boolean>('tasks:is-board', false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  // Bruno screen context: the task open in the editor.
  useEffect(() => {
    setScreenEntity('taskId', editingTaskId);
    return () => setScreenEntity('taskId', null);
  }, [editingTaskId]);
  const [filterTeam, setFilterTeam] = useState('all');
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // Bruno bulk import: paste notes/chat, AI extracts tasks, preview/edit, save all.
  const [showBulk, setShowBulk] = useDraft<boolean>('tasks:bulk-open', false);
  const [bulkText, setBulkText] = useDraft<string>('tasks:bulk-text', '');
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkPreview, setBulkPreview] = useDraft<any[] | null>('tasks:bulk-preview', null);
  const [bulkRoster, setBulkRoster] = useDraft<any[]>('tasks:bulk-roster', EMPTY_LIST);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // In-flight saves are drafted too: a page that remounts mid-save (mode
  // switch, navigation) still sees "saving" and can't submit twice.
  const [bulkSaving, setBulkSaving] = useDraft<boolean>('tasks:bulk-saving', false);
  const [editorSaving, setEditorSaving] = useDraft<boolean>('tasks:editor-saving', false);
  // Each editor / bulk session gets a generation number. A save only cleans
  // up its draft if its session is still the current one, so a request that
  // finishes late can never wipe a newer draft.
  const bumpGen = (key: string) => setDraft(key, newSessionId());
  const EDITOR_GEN = 'tasks:editor-gen';
  const BULK_GEN = 'tasks:bulk-gen';
  // AI quick-add: type natural language, Bruno parses it into task fields.
  const [aiTaskOpen, setAiTaskOpen] = useState(false);
  const [aiTaskText, setAiTaskText] = useDraft<string>('tasks:ai-text', '');
  const [aiTaskBusy, setAiTaskBusy] = useState(false);
  const [aiTaskNote, setAiTaskNote] = useState<string | null>(null);
  const [aiTaskProposals, setAiTaskProposals] = useState<any[]>([]);
  const markPending = (id: number, on: boolean) => setPendingIds((prev) => {
    const s = new Set(prev);
    if (on) s.add(id); else s.delete(id);
    return s;
  });

  const isAdmin = hasScope('admin');
  const canManageTasks = hasScope('tasks');

  const resetAiTask = () => { setAiTaskText(''); setAiTaskNote(null); setAiTaskProposals([]); };

  const openNewTask = (status = 'todo') => {
    bumpGen(EDITOR_GEN);
    setEditingTaskId(null);
    setNewTask({ team_id: defaultTeamId(teams, currentUser), title: '', description: '', assignee_ids: [], due_date: '', due_time: '', status });
    setIsBoardTask(false);
    resetAiTask();
    setAiTaskOpen(false);
    setShowAddTask(true);
  };

  const openEditTask = (task: any) => {
    bumpGen(EDITOR_GEN);
    setEditingTaskId(task.id);
    setNewTask({
      team_id: task.team_id?.toString() || '',
      title: task.title || '',
      description: task.description || '',
      assignee_ids: taskAssigneeIds(task),
      due_date: task.due_date || '',
      due_time: task.due_time || '',
      status: task.status || 'todo',
      priority: task.priority || '',
      repeat: ruleToRepeat(task.recurrence),
      repeatRule: readRecurrence(task.recurrence),
    });
    setIsBoardTask(!!task.is_board);
    setShowAddTask(true);
  };

  const closeTaskModal = () => {
    bumpGen(EDITOR_GEN);
    setShowAddTask(false);
    setEditingTaskId(null);
    setNewTask(EMPTY_FORM);
  };

  const handleAddTask = async () => {
    if (editorSaving) return;
    if (!String(newTask.title || '').trim()) { notify('Add a title', 'error'); return; }
    setEditorSaving(true);
    const gen = getDraft<number>(EDITOR_GEN, 0);
    const stillCurrent = () => getDraft<number>(EDITOR_GEN, 0) === gen;
    try {
      if (editingTaskId) {
        const res = await apiFetch(`/api/tasks/${editingTaskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newTask.title,
            description: newTask.description,
            assignee_ids: newTask.assignee_ids,
            due_date: newTask.due_date || null,
            due_time: newTask.due_date && newTask.due_time ? newTask.due_time : null,
            is_board: isBoardTask ? 1 : 0,
            priority: newTask.priority || null,
            recurrence: repeatToRule(newTask.repeat, newTask.repeatRule),
          }),
        });
        if (res.ok) {
          if (stillCurrent()) closeTaskModal();
          refresh.tasks();
        } else {
          notify('Could not save task — try again.', 'error');
        }
        return;
      }
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTask, repeat: undefined, repeatRule: undefined, is_board: isBoardTask ? 1 : 0,
          due_time: newTask.due_date && newTask.due_time ? newTask.due_time : null,
          priority: newTask.priority || null, recurrence: repeatToRule(newTask.repeat, newTask.repeatRule),
        }),
      });
      if (res.ok) {
        if (stillCurrent()) closeTaskModal();
        refresh.tasks();
      } else {
        notify('Could not create task — try again.', 'error');
      }
    } finally {
      setEditorSaving(false);
    }
  };

  // ---- Bruno bulk import ----
  const handleBulkParse = async () => {
    const text = bulkText.trim();
    if (!text || bulkParsing) return;
    setBulkParsing(true);
    setBulkError(null);
    try {
      const res = await apiFetch('/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tz: browserTz() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not read tasks');
      const list = Array.isArray(d.items) ? d.items : [];
      if (!list.length) {
        setBulkError('No tasks found in that text — try pasting notes with actionable items.');
        setBulkPreview(null);
      } else {
        setBulkPreview(list);
        setBulkRoster(Array.isArray(d.roster) ? d.roster : members.map((m: any) => ({ id: m.id, name: m.name })));
      }
    } catch (e: any) {
      setBulkError(e?.message || 'Could not extract tasks.');
      setBulkPreview(null);
    } finally {
      setBulkParsing(false);
    }
  };

  const updateBulkRow = (idx: number, patch: any) => {
    setBulkPreview((prev) => (prev ? prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : prev));
  };
  const removeBulkRow = (idx: number) => {
    setBulkPreview((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleBulkSave = async () => {
    if (!bulkPreview?.length || bulkSaving) return;
    setBulkSaving(true);
    const gen = getDraft<number>(BULK_GEN, 0);
    setBulkError(null);
    try {
      const res = await apiFetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: bulkPreview }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save tasks');
      notify(`Saved ${d.count || 0} task${(d.count || 0) === 1 ? '' : 's'}.`, 'success');
      if (getDraft<number>(BULK_GEN, 0) === gen) {
        setShowBulk(false);
        setBulkText('');
        setBulkPreview(null);
      }
      refresh.tasks();
    } catch (e: any) {
      setBulkError(e?.message || 'Could not save tasks.');
    } finally {
      setBulkSaving(false);
    }
  };

  const closeBulkModal = () => {
    bumpGen(BULK_GEN);
    setShowBulk(false);
    setBulkText('');
    setBulkPreview(null);
    setBulkError(null);
  };

  // ---- AI quick-add for the task form ----
  const applyAiTaskToForm = (t: any) => {
    setNewTask((prev) => ({
      ...prev,
      title: t.title || prev.title,
      description: t.description || prev.description,
      due_date: t.due_date || prev.due_date,
      // Time, priority and repeat land in their fields (V3.5 quick-add fix).
      due_time: t.due_time || (t.due_date ? '' : prev.due_time),
      priority: t.priority || prev.priority || '',
      repeat: t.recurrence ? ruleToRepeat(t.recurrence) : prev.repeat || '',
      repeatRule: t.recurrence ? readRecurrence(t.recurrence) : prev.repeatRule ?? null,
      status: ['todo', 'in-progress', 'done'].includes(t.status) ? t.status : prev.status,
      assignee_ids: Array.isArray(t.assignee_ids) && t.assignee_ids.length ? t.assignee_ids : t.assigned_to ? [t.assigned_to] : prev.assignee_ids,
    }));
  };

  /** Review a finished task: approve it, or send it back with a note. */
  const reviewTask = async (id: number, action: 'approve' | 'send_back', note = '') => {
    const res = await apiFetch(`/api/tasks/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { notify(d.error || 'Could not save the review — try again.', 'error'); return false; }
    if (d.task) setTasks((ts: any[]) => ts.map((t: any) => (t.id === id ? { ...t, ...d.task, assignee_ids: d.task.assignee_ids ?? t.assignee_ids } : t)));
    notify(action === 'approve' ? 'Approved.' : 'Sent back to the assignees.', 'success');
    return true;
  };

  const handleAiTaskParse = async () => {
    const text = aiTaskText.trim();
    if (!text || aiTaskBusy) return;
    setAiTaskBusy(true);
    setAiTaskNote(null);
    setAiTaskProposals([]);
    try {
      const res = await apiFetch('/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tz: browserTz() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not read tasks');
      const list = Array.isArray(d.items) ? d.items : [];
      if (list.length === 1) {
        applyAiTaskToForm(list[0]);
        setAiTaskNote('Bruno filled in the form below — review it and hit Create Task.');
        setAiTaskOpen(false);
      } else if (list.length > 1) {
        setAiTaskProposals(list);
        setAiTaskNote(`Bruno found ${list.length} tasks — pick one to fill the form, or use bulk import for all of them.`);
      } else {
        setAiTaskNote('Bruno could not find any tasks in that text — try adding an action and a date.');
      }
    } catch (e: any) {
      setAiTaskNote(e?.message || "Bruno isn't reachable right now — try again in a moment.");
    } finally {
      setAiTaskBusy(false);
    }
  };

  const filteredTasks = tasks.filter((t: any) => {
    const boardCheck = t.is_board ? isAdmin : true;
    const teamCheck = filterTeam === 'all' || t.team_id?.toString() === filterTeam;
    return boardCheck && teamCheck;
  });

  const updateStatus = async (id: number, status: string) => {
    if (pendingIds.has(id)) return;
    // Moving to done requires proof: open the shared completion dialog.
    // (The server rejects direct PATCH transitions to done.)
    if (status === 'done') {
      const task = tasks.find((t: any) => t.id === id);
      if (task && task.status !== 'done' && onRequestComplete) {
        onRequestComplete(task);
        return;
      }
    }
    // Optimistic: flip the status instantly, roll back if the server rejects.
    const prev = tasks;
    setTasks((ts: any[]) => ts.map((t: any) => t.id === id
      ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null }
      : t));
    markPending(id, true);
    try {
      const res = await apiFetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setTasks(prev);
        notify('Could not update task — try again.', 'error');
      }
    } catch {
      setTasks(prev);
      notify('Could not update task — try again.', 'error');
    } finally {
      markPending(id, false);
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete task', message: 'Delete this task?', confirmLabel: 'Delete', danger: true }))) return false;
    if (pendingIds.has(id)) return false;
    // Optimistic: remove instantly, restore on failure.
    const prev = tasks;
    setTasks((ts: any[]) => ts.filter((t: any) => t.id !== id));
    markPending(id, true);
    try {
      const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setTasks(prev);
        notify('Could not delete task — try again.', 'error');
        return false;
      }
      return true;
    } catch {
      setTasks(prev);
      notify('Could not delete task — try again.', 'error');
      return false;
    } finally {
      markPending(id, false);
    }
  };

  // ---- Bulk actions on a selection (V3.5) ----
  // One request per task through the same endpoints as a single edit, so the
  // server's permission checks, notifications and live updates all apply.
  const patchTask = async (id: number, body: any) => {
    const res = await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    return !!res?.ok;
  };
  /** Move tasks to To Do / In Progress. Done needs proof, one task at a time. */
  const bulkSetStatus = async (ids: number[], status: 'todo' | 'in-progress') => {
    const ok = await runBulk(ids, (id) => patchTask(Number(id), { status }), { verb: 'Moved', noun: 'task' });
    const moved = new Set(ok.map(Number));
    setTasks((ts: any[]) => ts.map((t: any) => (moved.has(t.id) ? { ...t, status, completed_at: null } : t)));
  };
  /** Add one person to each task (keeps who is already on it); null clears everyone. */
  const bulkAssign = async (ids: number[], memberId: number | null) => {
    const byId = new Map(tasks.map((t: any) => [t.id, t]));
    const nextOf = (id: number) => (memberId == null ? [] : [...new Set([...taskAssigneeIds(byId.get(id) || {}), memberId])]);
    const ok = await runBulk(ids, (id) => patchTask(Number(id), { assignee_ids: nextOf(Number(id)) }), {
      verb: memberId == null ? 'Unassigned' : 'Assigned', noun: 'task',
    });
    const done = new Set(ok.map(Number));
    setTasks((ts: any[]) => ts.map((t: any) => {
      if (!done.has(t.id)) return t;
      const next = nextOf(t.id);
      return { ...t, assignee_ids: next, assigned_to: next[0] ?? null };
    }));
  };
  /** Approve many finished tasks at once (Completed view). */
  const bulkApprove = async (ids: number[]) => {
    const ok = await runBulk(ids, async (id) => {
      const res = await apiFetch(`/api/tasks/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }).catch(() => null);
      return !!res?.ok;
    }, { verb: 'Approved', noun: 'task' });
    const done = new Set(ok.map(Number));
    setTasks((ts: any[]) => ts.map((t: any) => (done.has(t.id) ? { ...t, review_status: 'approved' } : t)));
  };
  const bulkDeleteTasks = async (ids: number[]) => {
    const ok = await bulkDelete(ids, async (id) => {
      const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }).catch(() => null);
      return !!res?.ok;
    }, { noun: 'task' });
    if (ok === false) return false;
    const gone = new Set(ok.map(Number));
    setTasks((ts: any[]) => ts.filter((t: any) => !gone.has(t.id)));
    return true;
  };

  // Analytics data (all visible-to-Legacy tasks; Modern recomputes for its filters)
  const completionTrends = useMemo(() => completionTrendsOf(tasks), [tasks]);
  const memberCapacity = useMemo(() => memberCapacityOf(tasks, members), [tasks, members]);
  const avgCompletionTime = useMemo(() => avgCompletionDaysOf(tasks), [tasks]);

  // Callers read pendingIds.has(-1) for "editor saving" (Legacy JSX + Modern).
  const pendingView = useMemo(() => (editorSaving ? new Set([...pendingIds, -1]) : pendingIds), [pendingIds, editorSaving]);

  return {
    // permissions
    isAdmin, canManageTasks,
    // editor
    showAddTask, setShowAddTask, editingTaskId, setEditingTaskId, newTask, setNewTask, isBoardTask, setIsBoardTask,
    openNewTask, openEditTask, closeTaskModal, handleAddTask,
    // view state
    showAnalytics, setShowAnalytics, filterTeam, setFilterTeam, pendingIds: pendingView, filteredTasks,
    // bulk
    showBulk, setShowBulk, bulkText, setBulkText, bulkParsing, bulkPreview, setBulkPreview, bulkRoster, bulkError,
    bulkSaving, handleBulkParse, updateBulkRow, removeBulkRow, handleBulkSave, closeBulkModal,
    // ai quick-add
    aiTaskOpen, setAiTaskOpen, aiTaskText, setAiTaskText, aiTaskBusy, aiTaskNote, setAiTaskNote, aiTaskProposals, setAiTaskProposals,
    resetAiTask, applyAiTaskToForm, handleAiTaskParse,
    // mutations
    updateStatus, handleDeleteTask, bulkSetStatus, bulkAssign, bulkDeleteTasks, bulkApprove, reviewTask,
    // analytics
    completionTrends, memberCapacity, avgCompletionTime,
  };
}

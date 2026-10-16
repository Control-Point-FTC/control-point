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
import { parseTagList } from '../../types/taskTags';
import { teamToday } from '../../utils/dueShortcuts';
import { readRecurrence, type Recurrence } from '../../utils/quickAdd';
import { recordedCompletions } from '../../utils/taskCompletions';

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
  /** YYYY-MM-DD; '' = none. */
  start_date?: string;
  /** 'each' = every assignee completes it separately; '' = one shared deliverable. */
  completion_mode?: string;
  /** Robot subsystems, FTC award ids and labels (src/types/taskTags.ts). */
  subsystems?: string[];
  awards?: string[];
  labels?: string[];
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
/** Cancelled tasks are kept but hidden; the board shows this column on request. */
export const CANCELLED_COLUMN = { id: 'cancelled', label: 'Cancelled' } as const;

const EMPTY_FORM: TaskForm = { team_id: '', title: '', description: '', assignee_ids: [], due_date: '', due_time: '', status: 'todo', priority: '', repeat: '', start_date: '', subsystems: [], awards: [], labels: [], completion_mode: '' };
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

/** The PATCH body an edit saves (auto-save diffs it against the task as opened). */
export function editPayload(f: any, isBoard: boolean): Record<string, unknown> {
  return {
    title: f.title,
    description: f.description,
    assignee_ids: f.assignee_ids,
    due_date: f.due_date || null,
    due_time: f.due_date && f.due_time ? f.due_time : null,
    is_board: isBoard ? 1 : 0,
    priority: f.priority || null,
    recurrence: repeatToRule(f.repeat, f.repeatRule),
    start_date: f.start_date || null,
    subsystems: f.subsystems ?? [],
    awards: f.awards ?? [],
    labels: f.labels ?? [],
    completion_mode: f.completion_mode === 'each' ? 'each' : null,
  };
}

/** Edit saves run one at a time (module-wide, so a remount keeps the order). */
let saveChain: Promise<unknown> = Promise.resolve();

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

  // Auto-save of an edit: idle → saving → saved, or error (with the reason).
  const EDIT_BASE = 'tasks:edit-baseline';
  const [autoSave, setAutoSave] = useDraft<{ state: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>('tasks:autosave', { state: 'idle' });

  const isAdmin = hasScope('admin');
  const canManageTasks = hasScope('tasks');

  const resetAiTask = () => { setAiTaskText(''); setAiTaskNote(null); setAiTaskProposals([]); };

  const openNewTask = (status = 'todo') => {
    bumpGen(EDITOR_GEN);
    setEditingTaskId(null);
    setNewTask({ ...EMPTY_FORM, team_id: defaultTeamId(teams, currentUser), status });
    setIsBoardTask(false);
    resetAiTask();
    setAiTaskOpen(false);
    setShowAddTask(true);
  };

  const openEditTask = (task: any) => {
    bumpGen(EDITOR_GEN);
    setEditingTaskId(task.id);
    const form = {
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
      start_date: task.start_date || '',
      subsystems: parseTagList(task.subsystems),
      awards: parseTagList(task.awards),
      labels: parseTagList(task.labels),
      completion_mode: task.completion_mode === 'each' ? 'each' : '',
    };
    setNewTask(form);
    // What the task was when opened: edits save only the fields that changed from it,
    // so a teammate's change to another field isn't overwritten.
    setDraft(EDIT_BASE, editPayload(form, !!task.is_board));
    setAutoSave({ state: 'idle' });
    setIsBoardTask(!!task.is_board);
    setShowAddTask(true);
  };

  /**
   * Save an edit's changed fields (auto-save, Done and closing). Saves run one
   * after another, and each reads the form as it is when it runs, so a change
   * made while an earlier save was in flight is never lost. False when it couldn't.
   */
  const autosaveEdit = (): Promise<boolean> => {
    const run = saveChain.then(() => saveEditNow());
    saveChain = run.catch(() => false);
    return run;
  };
  const saveEditNow = async (): Promise<boolean> => {
    const id = getDraft<number | null>('tasks:editing-id', null);
    if (!id) return true;
    const gen = getDraft<number>(EDITOR_GEN, 0);
    const base = getDraft<Record<string, unknown> | null>(EDIT_BASE, null) ?? {};
    const payload = editPayload(getDraft<TaskForm>('tasks:form', EMPTY_FORM), getDraft<boolean>('tasks:is-board', false));
    const diff = Object.fromEntries(Object.entries(payload).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k])));
    if (!Object.keys(diff).length) { if (getDraft<number>(EDITOR_GEN, 0) === gen && getDraft<any>('tasks:autosave', null)?.state === 'saving') setAutoSave({ state: 'saved' }); return true; }
    if ('title' in diff && !String(diff.title || '').trim()) { setAutoSave({ state: 'error', message: 'Add a title to save' }); return false; }
    // A due time only means something with its date.
    if ('due_time' in diff || 'due_date' in diff) { diff.due_date = payload.due_date; diff.due_time = payload.due_time; }
    setAutoSave({ state: 'saving' });
    try {
      const res = await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diff) });
      if (!res.ok) {
        const message = (await res.json().catch(() => ({})))?.error || 'Could not save — try again';
        if (getDraft<number>(EDITOR_GEN, 0) === gen) setAutoSave({ state: 'error', message });
        return false;
      }
      if (getDraft<number>(EDITOR_GEN, 0) === gen) {
        // The baseline is what the server now has (what was sent), not the form.
        setDraft(EDIT_BASE, { ...base, ...diff });
        setAutoSave({ state: 'saved' });
      }
      refresh.tasks();
      return true;
    } catch {
      if (getDraft<number>(EDITOR_GEN, 0) === gen) setAutoSave({ state: 'error', message: 'Could not save — check your connection' });
      return false;
    }
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
        // Done: whatever hasn't auto-saved yet is saved now (only changed fields).
        if (await autosaveEdit()) { if (stillCurrent()) closeTaskModal(); }
        else notify('Could not save task — try again.', 'error');
        return;
      }
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTask, repeat: undefined, repeatRule: undefined, is_board: isBoardTask ? 1 : 0, start_date: newTask.start_date || null,
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
    const completions = recordedCompletions(tasks.find((t: any) => t.id === id));
    const res = await apiFetch(`/api/tasks/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note, completions }) }).catch(() => null);
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

  // Every loaded task by id: blockers count even when a filter hides them.
  const taskById = useMemo(() => new Map<number, any>(tasks.map((t: any) => [Number(t.id), t])), [tasks]);

  const updateStatus = async (id: number, status: string) => {
    if (pendingIds.has(id)) return;
    // Cancelling and restoring are a manager's call (the server refuses
    // anyone else), so they're never offered as a move that bounces back.
    const current = tasks.find((t: any) => t.id === id);
    if (!canManageTasks && (status === 'cancelled' || current?.status === 'cancelled')) {
      notify('Only team managers can cancel or restore tasks.', 'error');
      return;
    }
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
        const data = await res.json().catch(() => ({}));
        notify(res.status === 403 && data?.error ? data.error : 'Could not update task — try again.', 'error');
      }
    } catch {
      setTasks(prev);
      notify('Could not update task — try again.', 'error');
    } finally {
      markPending(id, false);
    }
  };

  /** Add or remove one link (blocked by / blocks / related); the server refuses loops. */
  const editLink = async (taskId: number, kind: string, otherId: number, add: boolean): Promise<boolean> => {
    try {
      const res = add
        ? await apiFetch(`/api/tasks/${taskId}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, other_id: otherId }) })
        : await apiFetch(`/api/tasks/${taskId}/links?kind=${encodeURIComponent(kind)}&other_id=${otherId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify(data?.error || 'Could not update the link — try again.', 'error');
        return false;
      }
      refresh.tasks();
      return true;
    } catch {
      notify('Could not update the link — try again.', 'error');
      return false;
    }
  };
  const addLink = (taskId: number, kind: string, otherId: number) => editLink(taskId, kind, otherId, true);
  /** A copy of a task (same details, people and tags; not its progress or history). */
  const duplicateTask = async (task: any): Promise<number | null> => {
    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: task.team_id, title: `${task.title} (copy)`, description: task.description || '', assignee_ids: taskAssigneeIds(task),
          due_date: task.due_date || null, due_time: task.due_date ? task.due_time || null : null, priority: task.priority || null,
          recurrence: task.recurrence ? readRecurrence(task.recurrence) : null, is_board: task.is_board ? 1 : 0,
          start_date: task.start_date || null, subsystems: parseTagList(task.subsystems), awards: parseTagList(task.awards), labels: parseTagList(task.labels),
          completion_mode: task.completion_mode === 'each' ? 'each' : null,
        }),
      });
      if (!res.ok) { notify('Could not duplicate the task — try again.', 'error'); return null; }
      const body = await res.json().catch(() => ({}));
      refresh.tasks();
      notify('Task duplicated.', 'success');
      return Number(body?.id) || null;
    } catch {
      notify('Could not duplicate the task — try again.', 'error');
      return null;
    }
  };
  /** Follow or stop following a task (comment and change notifications). */
  const setWatching = async (taskId: number, watching: boolean): Promise<boolean> => {
    const res = await apiFetch(`/api/tasks/${taskId}/watch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watching }) }).catch(() => null);
    if (!res?.ok) { notify('Could not update — try again.', 'error'); return false; }
    return true;
  };

  /** Finish a task each assignee completes separately, for everyone (managers). */
  const completeForEveryone = (task: any) => onRequestComplete?.({ ...task, __whole: true });
  const removeLink = (taskId: number, kind: string, otherId: number) => editLink(taskId, kind, otherId, false);

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
  /** Set or clear one board column's work-in-progress limit (admins; team setting). */
  const setWipLimit = async (status: 'todo' | 'in-progress', limit: number | null): Promise<boolean> => {
    const team = teams.find((t: any) => String(t.id) === String(currentUser?.team_id));
    if (!team) return false;
    try {
      // Only this column: the server merges it, so another column's save isn't undone.
      const res = await apiFetch(`/api/teams/${team.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wip_limit: { column: status, limit } }) });
      if (!res.ok) { notify((await res.json().catch(() => ({})))?.error || 'Could not save the limit.', 'error'); return false; }
      return true;
    } catch {
      notify('Could not save the limit.', 'error');
      return false;
    }
  };
  /** The team's today (its timezone), for due-date shortcuts. */
  const todayForTeam = () => teamToday(teams.find((t: any) => String(t.id) === String(currentUser?.team_id))?.timezone);
  /** Set one task's due date (the sheet's "Tomorrow"), optimistic; its time is kept. */
  const setDueDate = async (id: number, due_date: string) => {
    if (!canManageTasks) { notify('Only team managers can change due dates.', 'error'); return; }
    const before = tasks.find((t: any) => t.id === id)?.due_date ?? null;
    setTasks((ts: any[]) => ts.map((t: any) => (t.id === id ? { ...t, due_date } : t)));
    const res = await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date }) }).catch(() => null);
    if (!res?.ok) {
      setTasks((ts: any[]) => ts.map((t: any) => (t.id === id && t.due_date === due_date ? { ...t, due_date: before } : t)));
      notify((await res?.json().catch(() => ({})))?.error || 'Could not update the due date — try again.', 'error');
    }
  };
  /** Set one task's priority (the board's Priority columns), optimistic. */
  const setPriority = async (id: number, priority: string | null) => {
    if (!canManageTasks) { notify('Only team managers can change priority.', 'error'); return; }
    const before = tasks.find((t: any) => t.id === id)?.priority ?? null;
    setTasks((ts: any[]) => ts.map((t: any) => (t.id === id ? { ...t, priority } : t)));
    if (!(await patchTask(id, { priority }))) {
      // Undo only this change, and only if nothing newer replaced it meanwhile.
      setTasks((ts: any[]) => ts.map((t: any) => (t.id === id && (t.priority ?? null) === priority ? { ...t, priority: before } : t)));
      notify('Could not update task — try again.', 'error');
    }
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
      const completions = recordedCompletions(tasks.find((t: any) => t.id === id));
      const res = await apiFetch(`/api/tasks/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', completions }) }).catch(() => null);
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
    isAdmin, canManageTasks, setPriority, setWipLimit, setDueDate, todayForTeam, addLink, removeLink, taskById, completeForEveryone, duplicateTask, setWatching, currentUserId: currentUser?.id as number | undefined,
    // editor
    showAddTask, setShowAddTask, editingTaskId, setEditingTaskId, newTask, setNewTask, isBoardTask, setIsBoardTask,
    openNewTask, openEditTask, closeTaskModal, handleAddTask, autosaveEdit, autoSave,
    /** The editor's session: changes whenever it opens or closes (to drop late closes). */
    editorSession: () => getDraft<number>(EDITOR_GEN, 0),
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

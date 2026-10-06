// Shared Tasks logic for the Legacy TasksView and the Modern Tasks page.
// Extracted verbatim from TasksView (same endpoints, permissions and
// optimistic updates). The editor and bulk-import text live in the shared
// draft store, so an open, half-written task survives a Legacy/Modern switch.
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { notify, confirmDialog } from '../dialog';
import { setScreenEntity } from '../../services/brunoContext';
import { useDraft, getDraft, setDraft } from '../../modern/drafts';

export interface TaskForm {
  team_id: any;
  title: string;
  description: string;
  assignee_ids: number[];
  due_date: string;
  status: string;
}

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

const EMPTY_FORM: TaskForm = { team_id: '', title: '', description: '', assignee_ids: [], due_date: '', status: 'todo' };
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
  const bumpGen = (key: string) => setDraft(key, getDraft<number>(key, 0) + 1);
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
    setNewTask({ team_id: defaultTeamId(teams, currentUser), title: '', description: '', assignee_ids: [], due_date: '', status });
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
      status: task.status || 'todo',
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
            is_board: isBoardTask ? 1 : 0,
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
        body: JSON.stringify({ ...newTask, is_board: isBoardTask ? 1 : 0 }),
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
        body: JSON.stringify({ text }),
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
      status: ['todo', 'in-progress', 'done'].includes(t.status) ? t.status : prev.status,
      assignee_ids: t.assigned_to ? [t.assigned_to] : prev.assignee_ids,
    }));
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
        body: JSON.stringify({ text }),
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
    updateStatus, handleDeleteTask,
    // analytics
    completionTrends, memberCapacity, avgCompletionTime,
  };
}

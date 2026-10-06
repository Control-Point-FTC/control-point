// Shared Budget logic for Legacy BudgetView and the Modern Budget page.
// Extracted from BudgetView: same /api/budget endpoints and bodies, the
// optimistic delete with rollback, duplicate-as-new and the right-click menu.
// The entry form is drafted (it survives a mode switch), and a save only
// closes the form it submitted.
import { useState } from 'react';
import { format } from 'date-fns';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { getDraft, useDraft } from '../../modern/drafts';
import { useContextMenu } from '../contextmenu/ContextMenuProvider';
import { defaultTeamId } from '../tasks/useTasksController';

export interface BudgetForm { team_id: string; type: string; amount: string; category: string; description: string; date: string }
const today = () => format(new Date(), 'yyyy-MM-dd');
const FORM_KEY = 'budget:form';

export function useBudgetController({ budget, setBudget, teams, refresh, hasScope, currentUser }: {
  budget: any[]; setBudget: (v: any) => void; teams: any[]; refresh: { budget: () => any }; hasScope: (s: string) => boolean; currentUser: any;
}) {
  const [showAdd, setShowAdd] = useDraft<boolean>('budget:open', false);
  const [editingId, setEditingId] = useDraft<number | null>('budget:editing', null);
  const [newItem, setNewItem] = useDraft<BudgetForm>(FORM_KEY, { team_id: '', type: 'expense', amount: '', category: '', description: '', date: today() });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = hasScope('budget');

  const openNewEntry = () => {
    setEditingId(null);
    setNewItem({ team_id: defaultTeamId(teams, currentUser), type: 'expense', amount: '', category: '', description: '', date: today() });
    setShowAdd(true);
  };
  const openEditEntry = (item: any) => {
    setEditingId(item.id);
    setNewItem({
      team_id: item.team_id?.toString() || '',
      type: item.type || 'expense',
      amount: item.amount?.toString() || '',
      category: item.category || '',
      description: item.description || '',
      date: item.date || today(),
    });
    setShowAdd(true);
  };
  const openDuplicateEntry = (item: any) => {
    setEditingId(null);
    setNewItem({
      team_id: defaultTeamId(teams, currentUser),
      type: item.type || 'expense',
      amount: item.amount?.toString() || '',
      category: item.category || '',
      description: item.description || '',
      date: today(),
    });
    setShowAdd(true);
  };
  const closeEntryModal = () => {
    setShowAdd(false);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (busy) return;
    setBusy(true);
    const submitted = getDraft<BudgetForm>(FORM_KEY, newItem);
    const id = editingId;
    // Only close the form this save came from (not one opened or edited since).
    const closeIfUnchanged = () => { if (getDraft(FORM_KEY, submitted) === submitted) closeEntryModal(); };
    try {
      const payload = { ...submitted, amount: parseFloat(submitted.amount) };
      const res = await apiFetch(id ? `/api/budget/${id}` : '/api/budget', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (res?.ok) {
        closeIfUnchanged();
        refresh.budget();
      } else {
        notify(id ? 'Could not save entry — try again.' : 'Could not log entry — try again.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete transaction', message: 'Delete this transaction?', confirmLabel: 'Delete', danger: true }))) return;
    if (deleting) return;
    setDeleting(true);
    // Optimistic: drop the row instantly, restore on failure.
    const prev = budget;
    setBudget((bs: any[]) => bs.filter((b: any) => b.id !== id));
    try {
      const res = await apiFetch(`/api/budget/${id}`, { method: 'DELETE' });
      if (res.ok) refresh.budget();
      else {
        setBudget(prev);
        notify('Could not delete entry — try again.', 'error');
      }
    } catch {
      setBudget(prev);
      notify('Could not delete entry — try again.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  useContextMenu('budget-tx', (el) => {
    if (!isAdmin) return null;
    const id = Number(el.dataset.cmId);
    const item = budget.find((b: any) => b.id === id);
    if (!item) return null;
    return [
      { label: 'Edit transaction', icon: Pencil, action: () => openEditEntry(item) },
      { label: 'Duplicate transaction', icon: Copy, action: () => openDuplicateEntry(item) },
      { separator: true },
      { label: 'Delete transaction', icon: Trash2, danger: true, action: () => handleDelete(id) },
    ];
  });

  const totalIncome = budget.filter((i: any) => i.type === 'income').reduce((acc: number, i: any) => acc + i.amount, 0);
  const totalExpense = budget.filter((i: any) => i.type === 'expense').reduce((acc: number, i: any) => acc + i.amount, 0);

  return {
    isAdmin, showAdd, editingId, newItem, setNewItem, busy, deleting,
    openNewEntry, openEditEntry, openDuplicateEntry, closeEntryModal, handleAdd, handleDelete,
    totalIncome, totalExpense,
  };
}

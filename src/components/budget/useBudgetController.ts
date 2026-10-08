// Shared Budget logic for Legacy BudgetView and the Modern Budget page.
// Extracted from BudgetView: same /api/budget endpoints and bodies, the
// optimistic delete with rollback, duplicate-as-new and the right-click menu.
// The entry form and its in-flight save lock are drafted (they survive a
// mode switch, so a returning page can't send the same entry twice); views
// freeze the form while it saves, and a save only closes the form it
// submitted. A failed delete restores just that row, keeping newer changes.
import { useState } from 'react';
import { format } from 'date-fns';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { getDraft, inEpoch, useDraft } from '../../modern/drafts';
import { useContextMenu } from '../contextmenu/ContextMenuProvider';
import { defaultTeamId } from '../tasks/useTasksController';
import { MONEY_CONFIRM_AT, REQUIRED, formatMoney, parseMoney, requiredTextError } from '../../utils/validation';

export interface BudgetForm { team_id: string; type: string; amount: string; category: string; description: string; date: string }
const today = () => format(new Date(), 'yyyy-MM-dd');

/** Put a row back at (about) its old position unless the list already has it. */
export function restoreRow<T extends { id: unknown }>(list: T[], row: T, index: number): T[] {
  if (list.some((x) => x.id === row.id)) return list;
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), row, ...list.slice(at)];
}
const FORM_KEY = 'budget:form';

export function useBudgetController({ budget, setBudget, teams, refresh, hasScope, currentUser }: {
  budget: any[]; setBudget: (v: any) => void; teams: any[]; refresh: { budget: () => any }; hasScope: (s: string) => boolean; currentUser: any;
}) {
  const [showAdd, setShowAdd] = useDraft<boolean>('budget:open', false);
  const [editingId, setEditingId] = useDraft<number | null>('budget:editing', null);
  const [newItem, setNewItem] = useDraft<BudgetForm>(FORM_KEY, { team_id: '', type: 'expense', amount: '', category: '', description: '', date: today() });
  const [busy, setBusy] = useDraft<boolean>('budget:saving', false);
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
    if (getDraft('budget:saving', false)) return;
    const form = getDraft<BudgetForm>(FORM_KEY, newItem);
    const money = parseMoney(form.amount);
    if (money.ok === false) { notify(money.error, 'error'); return; }
    const missing = requiredTextError(form as any, REQUIRED.budget);
    if (missing) { notify(missing, 'error'); return; }
    // Large entries are usually a typo (an extra zero) — ask before saving.
    if (money.value >= MONEY_CONFIRM_AT && !(await confirmDialog({
      title: 'Large amount',
      message: `Log ${formatMoney(money.value)}? Double-check the amount — this is much larger than a typical entry.`,
      confirmLabel: `Yes, log ${formatMoney(money.value)}`,
    }))) return;
    if (getDraft('budget:saving', false)) return;
    setBusy(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it.
    const unlock = inEpoch(() => setBusy(false));
    const submitted = getDraft<BudgetForm>(FORM_KEY, newItem);
    const id = editingId;
    // Only close the form this save came from (not one opened or edited since).
    const closeIfUnchanged = () => { if (getDraft(FORM_KEY, submitted) === submitted) closeEntryModal(); };
    try {
      const payload = { ...submitted, amount: money.value };
      const res = await apiFetch(id ? `/api/budget/${id}` : '/api/budget', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (res?.ok) {
        closeIfUnchanged();
        refresh.budget();
      } else {
        // Show the server's reason when it refused the entry (validation).
        const data = res ? await res.json().catch(() => ({})) : {};
        notify(res?.status === 400 && data?.error ? data.error : id ? 'Could not save entry — try again.' : 'Could not log entry — try again.', 'error');
      }
    } finally {
      unlock();
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete transaction', message: 'Delete this transaction?', confirmLabel: 'Delete', danger: true }))) return;
    if (deleting) return;
    setDeleting(true);
    // Optimistic: drop the row instantly; on failure put back only that row
    // (a save may have refreshed the list meanwhile).
    const idx = budget.findIndex((b: any) => b.id === id);
    const removed = budget[idx];
    setBudget((bs: any[]) => bs.filter((b: any) => b.id !== id));
    const restore = () => { if (removed) setBudget((cur: any[]) => restoreRow(cur, removed, idx)); };
    try {
      const res = await apiFetch(`/api/budget/${id}`, { method: 'DELETE' });
      if (res.ok) refresh.budget();
      else {
        restore();
        notify('Could not delete entry — try again.', 'error');
      }
    } catch {
      restore();
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

  // Field edits are ignored while the form saves (frozen in both modes).
  const editForm: typeof setNewItem = (v) => { if (!getDraft('budget:saving', false)) setNewItem(v); };

  return {
    isAdmin, showAdd, editingId, newItem, setNewItem: editForm, busy, deleting,
    openNewEntry, openEditEntry, openDuplicateEntry, closeEntryModal, handleAdd, handleDelete,
    totalIncome, totalExpense,
  };
}

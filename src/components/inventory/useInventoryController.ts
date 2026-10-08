// Shared Inventory logic for Legacy InventoryView and the Modern Inventory
// page. Extracted from InventoryView: same /api/inventory endpoints and
// bodies (add, edit, optimistic delete, REV link import, invoice parse →
// review → confirm, auto-categorize), search / category filter and totals.
// The add / edit forms, the invoice review and their in-flight locks are
// drafted (they survive a mode switch, so a returning page can't send the
// same part or invoice twice); views freeze a form while it saves, a save
// only closes the form it submitted, async results are dropped after a
// sign-out or workspace switch, and a failed delete restores just that row.
import { useRef, useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { getDraft, inEpoch, useDraft } from '../../modern/drafts';
import { useContextMenu } from '../contextmenu/ContextMenuProvider';
import { defaultTeamId } from '../tasks/useTasksController';
import { restoreRow } from '../budget/useBudgetController';
import { bulkDelete, runBulk } from '../../modern/ui/selection';

export const INVENTORY_CATEGORIES = [
  'Structure', 'Motion', 'Wheels', 'Electronics', 'Sensors', 'Power',
  'Hardware', 'Tools', 'Raw Material', '3D Printing', 'Field', 'Other',
];
export interface NewPart { team_id: string; name: string; part_number: string; sku: string; quantity: string; assigned_to: string; location: string; category: string; description: string; cost: string }
export const blankPart = (team_id = ''): NewPart => ({ team_id, name: '', part_number: '', sku: '', quantity: '1', assigned_to: '', location: '', category: '', description: '', cost: '' });
const NEW_KEY = 'inv:new';

/** Why a part's numbers can't be saved (whole, non-negative stock; non-negative cost), or null. */
export function partNumbersError(quantity: unknown, cost: unknown): string | null {
  const q = quantity === '' || quantity == null ? 0 : Number(quantity);
  if (!Number.isInteger(q) || q < 0) return 'Quantity must be a whole number, 0 or more.';
  const c = cost === '' || cost == null ? 0 : Number(cost);
  if (!Number.isFinite(c) || c < 0) return "Cost can't be negative.";
  return null;
}
const EDIT_KEY = 'inv:edit';

export function useInventoryController({ inventory, setInventory, teams, refresh, currentUser, hasScope }: {
  inventory: any[]; setInventory: (v: any) => void; teams: any[]; refresh: { inventory: () => any }; currentUser: any; hasScope?: (s: string) => boolean;
}) {
  const canManage = hasScope ? hasScope('inventory') : false;
  const [showAdd, setShowAdd] = useDraft<boolean>('inv:add-open', false);
  const [showEdit, setShowEdit] = useDraft<any>(EDIT_KEY, null);
  const [newPart, setNewPart] = useDraft<NewPart>(NEW_KEY, blankPart());
  const [invoiceItems, setInvoiceItems] = useDraft<any[]>('inv:invoice-items', []);
  const [showInvoicePreview, setShowInvoicePreview] = useDraft<boolean>('inv:invoice-open', false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [revLink, setRevLink] = useState('');
  const [isLoadingRev, setIsLoadingRev] = useState(false);
  const [invoiceParsing, setInvoiceParsing] = useState<string | null>(null); // null = idle, string = status text
  const [invoiceConfirming, setInvoiceConfirming] = useDraft<boolean>('inv:invoice-confirming', false);
  const [autoCategorizing, setAutoCategorizing] = useState(false);
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useDraft<boolean>('inv:saving', false);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => { setNewPart(blankPart(defaultTeamId(teams, currentUser))); setShowAdd(true); };

  const handleAdd = async () => {
    const submitted = getDraft<NewPart>(NEW_KEY, newPart);
    if (!submitted.name || !submitted.sku) {
      notify('Name and SKU are required', 'error');
      return;
    }
    const numbersError = partNumbersError(submitted.quantity, submitted.cost);
    if (numbersError) { notify(numbersError, 'error'); return; }
    if (getDraft('inv:saving', false)) return;
    setBusy(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it.
    const unlock = inEpoch(() => setBusy(false));
    try {
      const res = await apiFetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submitted,
          team_id: submitted.team_id ? parseInt(submitted.team_id) : null,
          quantity: parseInt(submitted.quantity) || 0,
          assigned_to: submitted.assigned_to ? parseInt(submitted.assigned_to) : null,
          cost: parseFloat(submitted.cost) || 0,
        }),
      });
      if (res.ok) {
        // Only clear the form this save came from (not one edited since).
        if (getDraft(NEW_KEY, submitted) === submitted) {
          setShowAdd(false);
          setNewPart(blankPart());
        }
        refresh.inventory();
      } else {
        const err = await res.json().catch(() => ({}));
        notify('Error: ' + (err.error || 'Could not add part'), 'error');
      }
    } catch (error) {
      notify('Error adding part: ' + error, 'error');
    } finally {
      unlock();
    }
  };

  const handleUpdate = async () => {
    const submitted = getDraft<any>(EDIT_KEY, showEdit);
    if (!submitted) return;
    const numbersError = partNumbersError(submitted.quantity, submitted.cost);
    if (numbersError) { notify(numbersError, 'error'); return; }
    if (getDraft('inv:saving', false)) return;
    setBusy(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it.
    const unlock = inEpoch(() => setBusy(false));
    try {
      const res = await apiFetch(`/api/inventory/${submitted.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submitted,
          team_id: submitted.team_id ? parseInt(submitted.team_id) : null,
          assigned_to: submitted.assigned_to ? parseInt(submitted.assigned_to) : null,
          cost: parseFloat(submitted.cost) || 0,
        }),
      });
      if (res.ok) {
        if (getDraft(EDIT_KEY, submitted) === submitted) setShowEdit(null);
        refresh.inventory();
      } else {
        const err = await res.json().catch(() => ({}));
        notify('Error: ' + (err.error || 'Could not save part'), 'error');
      }
    } catch (error) {
      notify('Error updating part: ' + error, 'error');
    } finally {
      unlock();
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete part', message: 'Delete this part?', confirmLabel: 'Delete', danger: true }))) return;
    if (deleting) return;
    setDeleting(true);
    // Optimistic: drop the row instantly; on failure put back only that row
    // (a save may have refreshed the list meanwhile).
    const idx = inventory.findIndex((p: any) => p.id === id);
    const removed = inventory[idx];
    setInventory((ps: any[]) => ps.filter((p: any) => p.id !== id));
    const restore = () => { if (removed) setInventory((cur: any[]) => restoreRow(cur, removed, idx)); };
    try {
      const res = await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' });
      if (res.ok) refresh.inventory();
      else {
        restore();
        notify('Could not delete part — try again.', 'error');
      }
    } catch {
      restore();
      notify('Could not delete part — try again.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  useContextMenu('inventory-part', (el) => {
    if (!canManage) return null;
    const id = Number(el.dataset.cmId);
    const part = inventory.find((p: any) => p.id === id);
    if (!part) return null;
    return [
      { label: 'Edit part', icon: Edit2, action: () => setShowEdit(part) },
      { label: 'Delete part', icon: Trash2, danger: true, action: () => handleDelete(id) },
    ];
  });

  const handleImportRev = async () => {
    if (!revLink.trim()) {
      notify('Please enter a REV Robotics link', 'info');
      return;
    }
    setIsLoadingRev(true);
    // Fill the form only if nobody signed out / switched workspace meanwhile.
    const fill = inEpoch((data: any) => setNewPart((p) => ({
      ...p,
      name: data.name || p.name,
      sku: data.sku || p.sku,
      part_number: data.part_number || p.part_number,
      cost: data.cost ? data.cost.toString() : p.cost,
      category: data.category || p.category,
    })));
    try {
      const res = await apiFetch('/api/inventory/scrape-rev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: revLink }),
      });
      if (res.ok) {
        fill(await res.json());
        setRevLink('');
        notify('Product imported! Review and save when ready.', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        notify('Error: ' + (err.error || 'Import failed'), 'error');
      }
    } catch (error) {
      notify('Error importing from REV: ' + error, 'error');
    } finally {
      setIsLoadingRev(false);
    }
  };

  const handleInvoiceFiles = async (files: File[]) => {
    if (!files.length) return;
    const allItems: any[] = [];
    const show = inEpoch((items: any[]) => { setInvoiceItems(items); setShowInvoicePreview(true); });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setInvoiceParsing(files.length > 1 ? `Reading ${i + 1} of ${files.length}...` : 'Reading file...');
        const form = new FormData();
        form.append('file', file);
        const res = await apiFetch('/api/inventory/import-invoice/parse', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notify(`Couldn't read ${file.name}: ` + (data.error || 'Unsupported file'), 'error');
          continue;
        }
        if (!data.items || data.items.length === 0) {
          notify(`No line items found in ${file.name}`, 'error');
          continue;
        }
        for (const it of data.items) allItems.push({ ...it, selected: true });
      }
      if (allItems.length === 0) {
        notify('No line items found in the selected file(s)', 'error');
        return;
      }
      show(allItems);
    } catch (error) {
      notify('Error reading file: ' + error, 'error');
    } finally {
      setInvoiceParsing(null);
    }
  };
  const handleInvoiceFile = (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    void handleInvoiceFiles(files);
  };

  const updateInvoiceItem = (index: number, patch: any) => {
    if (getDraft('inv:invoice-confirming', false)) return; // frozen while importing
    setInvoiceItems((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const handleInvoiceConfirm = async () => {
    const submitted = getDraft<any[]>('inv:invoice-items', invoiceItems);
    const selected = submitted.filter((it: any) => it.selected);
    if (!selected.length) {
      notify('Select at least one item to import', 'info');
      return;
    }
    const bad = selected.map((it: any) => partNumbersError(it.quantity, it.unitPrice)).find(Boolean);
    if (bad) { notify(bad, 'error'); return; }
    if (getDraft('inv:invoice-confirming', false)) return;
    setInvoiceConfirming(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it.
    const unlock = inEpoch(() => setInvoiceConfirming(false));
    try {
      const res = await apiFetch('/api/inventory/import-invoice/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((it: any) => ({
            sku: it.sku,
            name: it.name,
            quantity: parseInt(it.quantity, 10) || 0,
            cost: parseFloat(it.unitPrice) || 0,
            category: it.category || 'Other',
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify('Error: ' + (data.error || 'Import failed'), 'error');
        return;
      }
      if (getDraft('inv:invoice-items', submitted) === submitted) {
        setShowInvoicePreview(false);
        setInvoiceItems([]);
      }
      refresh.inventory();
      const parts = [`${data.added} added`, `${data.merged} restocked`];
      if (data.skipped?.length) parts.push(`${data.skipped.length} skipped`);
      notify('Import complete: ' + parts.join(', '), 'success');
    } catch (error) {
      notify('Error importing: ' + error, 'error');
    } finally {
      unlock();
    }
  };

  const handleAutoCategorize = async () => {
    if (autoCategorizing) return;
    setAutoCategorizing(true);
    try {
      const res = await apiFetch('/api/inventory/auto-categorize', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify('Error: ' + (data.error || 'Auto-categorize failed'), 'error');
        return;
      }
      refresh.inventory();
      notify(data.categorized > 0 ? `Categorized ${data.categorized} part${data.categorized === 1 ? '' : 's'}` : 'Everything is already categorized', 'success');
    } catch (error) {
      notify('Error: ' + error, 'error');
    } finally {
      setAutoCategorizing(false);
    }
  };

  const categories = [...new Set(inventory.map((p: any) => p.category).filter((c: any) => c))] as string[];
  const term = searchTerm.toLowerCase();
  const filteredParts = inventory.filter((p: any) => {
    const matchSearch = (p.name || '').toLowerCase().includes(term) || (p.sku || '').toLowerCase().includes(term) || (p.part_number || '').toLowerCase().includes(term);
    const matchCategory = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCategory;
  });
  const totalValue = inventory.reduce((acc: number, p: any) => acc + (p.cost * p.quantity), 0);

  // Field edits are ignored while a part saves (frozen in both modes);
  // closing the edit form (null) is always allowed.
  const saving = () => getDraft('inv:saving', false);
  const editNewPart: typeof setNewPart = (v) => { if (!saving()) setNewPart(v); };
  const editPart: typeof setShowEdit = (v) => { if (v === null || !saving()) setShowEdit(v); };

  // ---- Bulk actions on a selection (V3.5) ----
  const bulkSetCategory = async (ids: number[], category: string) => {
    const ok = await runBulk(ids, async (id) => {
      const res = await apiFetch(`/api/inventory/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }) }).catch(() => null);
      return !!res?.ok;
    }, { verb: 'Recategorized', noun: 'part' });
    const done = new Set(ok.map(Number));
    setInventory((ps: any[]) => ps.map((p: any) => (done.has(p.id) ? { ...p, category } : p)));
  };
  const bulkDeleteParts = async (ids: number[]) => {
    const ok = await bulkDelete(ids, async (id) => {
      const res = await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' }).catch(() => null);
      return !!res?.ok;
    }, { noun: 'part' });
    if (ok === false) return false;
    const gone = new Set(ok.map(Number));
    setInventory((ps: any[]) => ps.filter((p: any) => !gone.has(p.id)));
    refresh.inventory();
    return true;
  };

  return {
    bulkSetCategory, bulkDeleteParts,
    canManage, showAdd, setShowAdd, openAdd, showEdit, setShowEdit: editPart, newPart, setNewPart: editNewPart,
    searchTerm, setSearchTerm, filterCategory, setFilterCategory, revLink, setRevLink, isLoadingRev,
    invoiceParsing, invoiceConfirming, autoCategorizing, invoiceItems, showInvoicePreview, setShowInvoicePreview, invoiceFileRef,
    busy, deleting, handleAdd, handleUpdate, handleDelete, handleImportRev, handleInvoiceFile, handleInvoiceFiles, updateInvoiceItem,
    handleInvoiceConfirm, handleAutoCategorize, categories, filteredParts, totalValue,
  };
}

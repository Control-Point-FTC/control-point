// Shared CAD logic for Legacy CadView and the Modern CAD pages. Extracted
// from CadView: the same team-scoped /api/cad/* endpoints and bodies, the
// review workflow (who may move a design to which status), snapshot
// ownership and the Bruno invoice import into the BOM.
//
// Every form (doc link, design review, snapshot, part, invoice review, review
// comments) and its open state is drafted so it survives a mode switch. Each
// save holds a drafted lock that only its own request releases (inEpoch), the
// form's fields are frozen while it saves, and async results are dropped
// after a sign-out or workspace switch. Lists refresh through a small CAD
// event bus, so a save that finishes after the page was left (mode switch)
// still refreshes whichever page is mounted now.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { notify, confirmDialog } from '../dialog';
import { deleteDraft, getDraft, inEpoch, setDraft, useDraft } from '../../modern/drafts';

export const CAD_SECTIONS = ['Intake', 'Outtake', 'Drivetrain', 'Chassis', 'End Game', 'Electronics', 'Other'];
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  concept: 'Concept', in_review: 'In Review', approved: 'Approved', changes_requested: 'Changes Requested', built: 'Built',
};
export const PART_SOURCE_LABELS: Record<string, string> = { printed: '3D Printed', purchased: 'Purchased', gobilda: 'goBILDA', other: 'Other' };
export const PART_STATUS_LABELS: Record<string, string> = { to_order: 'To Order', ordered: 'Ordered', received: 'Received', printed: 'Printed', installed: 'Installed' };

export function fmtSize(bytes: any) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
export function fmtDate(iso: any) {
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return ''; }
}

/** Group rows by subsystem in CAD_SECTIONS order. */
function bySection<T extends { section: string }>(rows: T[]) {
  const g: Record<string, T[]> = {};
  for (const r of rows) (g[r.section] = g[r.section] || []).push(r);
  return CAD_SECTIONS.filter((s) => g[s]).map((s) => ({ section: s, items: g[s] }));
}

// Tell every mounted list for `url` to reload (works across remounts).
const cadBus = new EventTarget();
export function cadChanged(url: string) { cadBus.dispatchEvent(new Event(url)); }

/** Load a list with latest-wins (a slow older load can't overwrite a newer one). */
function useList<T>(url: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const r = await apiFetch(url);
      if (r.ok) { const d = await r.json(); if (id === seq.current) setRows(d); }
    } catch { /* keep the last list */ } finally {
      if (id === seq.current) setLoaded(true);
    }
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const on = () => { void load(); };
    cadBus.addEventListener(url, on);
    return () => cadBus.removeEventListener(url, on);
  }, [url, load]);
  return { rows, setRows, load, loaded };
}

/**
 * A drafted save lock. `begin()` takes it and returns a release that only
 * works in the same draft epoch (after a sign-out / workspace switch a newer
 * save may hold the lock).
 */
function useLock(key: string) {
  const [busy, setBusy] = useDraft<boolean>(key, false);
  const held = () => getDraft(key, false);
  const begin = () => { setBusy(true); return inEpoch(() => setBusy(false)); };
  return { busy, held, begin };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function useCadDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch('/api/cad/dashboard');
        if (r.ok) { const d = await r.json(); if (alive) setData(d); }
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);
  return { data, loading };
}

// ---------------------------------------------------------------------------
// Onshape docs
// ---------------------------------------------------------------------------

export function useCadDocs() {
  const { rows: docs, setRows: setDocs, loaded } = useList<any>('/api/cad/docs');
  const [name, rawSetName] = useDraft<string>('cad:doc-name', '');
  const [url, rawSetUrl] = useDraft<string>('cad:doc-url', '');
  const lock = useLock('cad:doc-saving');
  const setName = (v: string) => { if (!lock.held()) rawSetName(v); };
  const setUrl = (v: string) => { if (!lock.held()) rawSetUrl(v); };
  const add = async () => {
    const n = getDraft('cad:doc-name', name), u = getDraft('cad:doc-url', url);
    if (!n.trim() || !u.trim()) { notify('Give the document a name and URL.', 'error'); return; }
    if (lock.held()) return;
    const release = lock.begin();
    const clear = inEpoch(() => { rawSetName(''); rawSetUrl(''); });
    try {
      const r = await apiFetch('/api/cad/docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, url: u }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Could not link the document.', 'error'); return; }
      clear(); cadChanged('/api/cad/docs'); notify('Onshape doc linked.', 'success');
    } catch { notify('Could not link the document.', 'error'); } finally { release(); }
  };
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Unlink document?', message: 'This removes the link for the whole team.', confirmLabel: 'Unlink' }))) return;
    const r = await apiFetch(`/api/cad/docs/${id}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) { setDocs((p) => p.filter((d) => d.id !== id)); cadChanged('/api/cad/docs'); notify('Document unlinked.', 'success'); }
    else notify('Could not unlink.', 'error');
  };
  return { docs, loaded, name, setName, url, setUrl, busy: lock.busy, add, remove };
}

// ---------------------------------------------------------------------------
// Design reviews
// ---------------------------------------------------------------------------

export const REVIEW_FILTERS = ['all', 'concept', 'in_review', 'approved', 'changes_requested', 'built'];

export function useCadReviews({ currentUser, isAdmin }: { currentUser?: any; isAdmin: boolean }) {
  const { rows: reviews, setRows: setReviews, load, loaded } = useList<any>('/api/cad/reviews');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useDraft<boolean>('cad:review-form-open', false);
  const visible = useMemo(() => (filter === 'all' ? reviews : reviews.filter((r) => r.status === filter)), [reviews, filter]);
  const setStatus = async (id: number, status: string) => {
    const r = await apiFetch(`/api/cad/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { notify(d.error || 'Status change failed.', 'error'); return; }
    setReviews((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    cadChanged('/api/cad/reviews');
    notify(`Marked as ${REVIEW_STATUS_LABELS[status]}.`, 'success');
  };
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete review?', message: 'This removes the review and its comments.', confirmLabel: 'Delete' }))) return;
    const r = await apiFetch(`/api/cad/reviews/${id}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) { setReviews((p) => p.filter((x) => x.id !== id)); cadChanged('/api/cad/reviews'); notify('Review deleted.', 'success'); }
    else notify('Could not delete.', 'error');
  };
  /** Who may move a design to a status: admins anything (but never re-mark or leave Built); authors only submit / re-submit. */
  const canAct = (review: any, to: string) => {
    if (review.status === to || review.status === 'built') return false;
    if (isAdmin) return true;
    const isAuthor = review.created_by === currentUser?.id;
    if (!isAuthor) return false;
    return (review.status === 'concept' && to === 'in_review') || (review.status === 'changes_requested' && to === 'in_review');
  };
  /** The status moves available on a review, in display order. */
  const actionsFor = (review: any) => {
    const out: { to: string; label: string; primary?: boolean }[] = [];
    if (canAct(review, 'in_review')) out.push({ to: 'in_review', label: review.status === 'concept' ? 'Submit for Review' : 'Re-submit for Review', primary: true });
    if (canAct(review, 'approved')) out.push({ to: 'approved', label: 'Approve', primary: true });
    if (canAct(review, 'changes_requested')) out.push({ to: 'changes_requested', label: 'Request Changes' });
    if (canAct(review, 'built')) out.push({ to: 'built', label: 'Mark Built' });
    return out;
  };
  return { reviews, loaded, load, filter, setFilter, visible, setStatus, remove, canAct, actionsFor, showForm, setShowForm };
}

export interface ReviewFormState { title: string; section: string; onshapeUrl: string; description: string; shot: File | null }
const REVIEW_KEY = 'cad:review-form';
const blankReview = (): ReviewFormState => ({ title: '', section: 'Intake', onshapeUrl: '', description: '', shot: null });

export function useReviewForm(onDone: () => void) {
  const [form, rawSet] = useDraft<ReviewFormState>(REVIEW_KEY, blankReview());
  const lock = useLock('cad:review-saving');
  const set = (patch: Partial<ReviewFormState>) => { if (!lock.held()) rawSet((f) => ({ ...f, ...patch })); };
  const submit = async () => {
    const f = getDraft<ReviewFormState>(REVIEW_KEY, form);
    if (!f.title.trim()) { notify('Give the design a title.', 'error'); return; }
    if (lock.held()) return;
    const release = lock.begin();
    const finish = inEpoch(() => { rawSet(blankReview()); onDone(); cadChanged('/api/cad/reviews'); });
    try {
      const fd = new FormData();
      fd.append('title', f.title.trim());
      fd.append('section', f.section);
      fd.append('onshape_url', f.onshapeUrl.trim());
      fd.append('description', f.description.trim());
      if (f.shot) fd.append('screenshot', f.shot);
      const r = await apiFetch('/api/cad/reviews', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Could not submit the design.', 'error'); return; }
      notify('Design submitted for review.', 'success');
      finish();
    } catch { notify('Could not submit the design.', 'error'); } finally { release(); }
  };
  return { form, set, busy: lock.busy, submit };
}

export function useReviewComments(reviewId: number, onChanged: () => void) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, rawSetText] = useDraft<string>(`cad:comment:${reviewId}`, '');
  const lock = useLock(`cad:comment-sending:${reviewId}`);
  const setText = (v: string) => { if (!lock.held()) rawSetText(v); };
  const url = `/api/cad/reviews/${reviewId}/comments`;
  const load = useCallback(async () => {
    const r = await apiFetch(url).catch(() => null);
    if (r?.ok) setComments(await r.json());
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const on = () => { void load(); };
    cadBus.addEventListener(url, on);
    return () => cadBus.removeEventListener(url, on);
  }, [url, load]);
  const send = async () => {
    const t = getDraft(`cad:comment:${reviewId}`, text).trim();
    if (!t || lock.held()) return;
    const release = lock.begin();
    const clear = inEpoch(() => rawSetText(''));
    try {
      const r = await apiFetch(`/api/cad/reviews/${reviewId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: t }) });
      if (r.ok) { clear(); cadChanged(url); cadChanged('/api/cad/reviews'); onChanged(); }
      else notify('Could not post the comment.', 'error');
    } catch { notify('Could not post the comment.', 'error'); } finally { release(); }
  };
  return { comments, text, setText, sending: lock.busy, send };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export function useCadSnapshots({ currentUser, isAdmin }: { currentUser?: any; isAdmin: boolean }) {
  const { rows: snaps, setRows: setSnaps, load, loaded } = useList<any>('/api/cad/snapshots');
  const [showForm, setShowForm] = useDraft<boolean>('cad:snap-form-open', false);
  const grouped = useMemo(() => bySection(snaps), [snaps]);
  const canDelete = (s: any) => isAdmin || s.created_by === currentUser?.id;
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete snapshot?', message: 'The 3D file is removed for everyone.', confirmLabel: 'Delete' }))) return;
    try {
      const r = await apiFetch(`/api/cad/snapshots/${id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setSnaps((p) => p.filter((x) => x.id !== id)); cadChanged('/api/cad/snapshots'); notify('Snapshot deleted.', 'success'); }
      else notify(d.error || `Could not delete (HTTP ${r.status}).`, 'error');
    } catch (e: any) {
      notify(`Delete failed: ${e?.message || 'network error'}`, 'error');
    }
  };
  return { snaps, loaded, load, grouped, canDelete, remove, showForm, setShowForm };
}

export interface SnapshotFormState { title: string; section: string; model: File | null; shot: File | null; notes: string }
const SNAP_KEY = 'cad:snap-form';
const blankSnap = (): SnapshotFormState => ({ title: '', section: 'Intake', model: null, shot: null, notes: '' });

export function useSnapshotForm(onDone: () => void) {
  const [form, rawSet] = useDraft<SnapshotFormState>(SNAP_KEY, blankSnap());
  const lock = useLock('cad:snap-saving');
  const set = (patch: Partial<SnapshotFormState>) => { if (!lock.held()) rawSet((f) => ({ ...f, ...patch })); };
  const submit = async () => {
    const f = getDraft<SnapshotFormState>(SNAP_KEY, form);
    if (!f.model) { notify('Choose a STEP or STL file.', 'error'); return; }
    if (!/\.(step|stp|stl)$/i.test(f.model.name)) { notify('Model must be .step/.stp or .stl.', 'error'); return; }
    if (lock.held()) return;
    const release = lock.begin();
    const finish = inEpoch(() => { rawSet(blankSnap()); onDone(); cadChanged('/api/cad/snapshots'); });
    try {
      const fd = new FormData();
      fd.append('model', f.model);
      if (f.shot) fd.append('screenshot', f.shot);
      fd.append('title', f.title.trim() || f.model.name);
      fd.append('section', f.section);
      fd.append('notes', f.notes.trim());
      const r = await apiFetch('/api/cad/snapshots', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Upload failed.', 'error'); return; }
      notify('Snapshot uploaded.', 'success');
      finish();
    } catch { notify('Upload failed.', 'error'); } finally { release(); }
  };
  return { form, set, busy: lock.busy, submit };
}

// ---------------------------------------------------------------------------
// Parts / BOM
// ---------------------------------------------------------------------------

export function useCadParts() {
  const { rows: parts, setRows: setParts, load, loaded } = useList<any>('/api/cad/parts');
  // The part form: null = closed, 'new', or the part being edited.
  const [editing, setEditing] = useDraft<any>('cad:part-open', null);
  const [showInvoice, setShowInvoice] = useDraft<boolean>('cad:invoice-open', false);
  const grouped = useMemo(() => bySection(parts), [parts]);
  const total = parts.reduce((a, p) => a + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete part?', message: 'Removes it from the BOM.', confirmLabel: 'Delete' }))) return;
    const r = await apiFetch(`/api/cad/parts/${id}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) { setParts((p) => p.filter((x) => x.id !== id)); cadChanged('/api/cad/parts'); notify('Part deleted.', 'success'); }
    else notify('Could not delete.', 'error');
  };
  return { parts, loaded, load, grouped, total, remove, editing, setEditing, showInvoice, setShowInvoice };
}

export interface PartFormState { name: string; section: string; quantity: string; source: string; unitCost: string; status: string; assignee: string; notes: string }
const partFormFrom = (p?: any): PartFormState => ({
  name: p?.name || '', section: p?.section || 'Intake', quantity: String(p?.quantity ?? 1), source: p?.source || 'purchased',
  unitCost: String(p?.unit_cost ?? 0), status: p?.status || 'to_order', assignee: p?.assignee || '', notes: p?.notes || '',
});

/** Why a BOM line can't be saved (whole quantity ≥ 1, cost ≥ 0), or null. */
export function bomNumbersError(quantity: unknown, cost: unknown): string | null {
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < 1) return 'Quantity must be a whole number, 1 or more.';
  const c = cost === '' || cost == null ? 0 : Number(cost);
  if (!Number.isFinite(c) || c < 0) return "Unit cost can't be negative.";
  return null;
}

export function usePartForm(initial: any | null, onDone: () => void) {
  const key = `cad:part-form:${initial?.id ?? 'new'}`;
  const [form, rawSet] = useDraft<PartFormState>(key, partFormFrom(initial));
  const lock = useLock('cad:part-saving');
  const set = (patch: Partial<PartFormState>) => { if (!lock.held()) rawSet((f) => ({ ...f, ...patch })); };
  const submit = async () => {
    const f = getDraft<PartFormState>(key, form);
    if (!f.name.trim()) { notify('Part name is required.', 'error'); return; }
    const bad = bomNumbersError(f.quantity, f.unitCost);
    if (bad) { notify(bad, 'error'); return; }
    if (lock.held()) return;
    const release = lock.begin();
    const finish = inEpoch(() => { deleteDraft(key); onDone(); cadChanged('/api/cad/parts'); });
    try {
      const body = { name: f.name.trim(), section: f.section, quantity: Number(f.quantity) || 1, source: f.source, unit_cost: Number(f.unitCost) || 0, status: f.status, assignee: f.assignee.trim(), notes: f.notes.trim() };
      const r = await apiFetch(initial ? `/api/cad/parts/${initial.id}` : '/api/cad/parts', {
        method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Could not save the part.', 'error'); return; }
      notify(initial ? 'Part updated.' : 'Part added.', 'success');
      finish();
    } catch { notify('Could not save the part.', 'error'); } finally { release(); }
  };
  /** Close without saving: drop this form's draft. */
  const discard = () => { if (!lock.held()) deleteDraft(key); };
  return { form, set, busy: lock.busy, submit, discard };
}

// ---------------------------------------------------------------------------
// Invoice import (Bruno reads a vendor invoice into BOM rows)
// ---------------------------------------------------------------------------

const INVOICE_ITEMS_KEY = 'cad:invoice-items';
const INVOICE_PARSING_KEY = 'cad:invoice-parsing';
const INVOICE_SEQ_KEY = 'cad:invoice-parse-seq';

export function useCadInvoiceImport(onDone: () => void) {
  const [files, setFiles] = useDraft<File[]>('cad:invoice-files', []);
  // Drafted so a returning page can't start a second parse on top; only the
  // newest parse may fill the review.
  const [parsing, setParsing] = useDraft<string | null>(INVOICE_PARSING_KEY, null);
  const [items, rawSetItems] = useDraft<any[]>(INVOICE_ITEMS_KEY, []);
  const lock = useLock('cad:invoice-importing');
  const edit = (fn: (xs: any[]) => any[]) => { if (!lock.held()) rawSetItems(fn); };

  const parse = async () => {
    if (!files.length || getDraft(INVOICE_PARSING_KEY, null) || lock.held()) return;
    const seq = getDraft<number>(INVOICE_SEQ_KEY, 0) + 1;
    setDraft(INVOICE_SEQ_KEY, seq);
    const latest = () => getDraft<number>(INVOICE_SEQ_KEY, 0) === seq;
    const status = inEpoch((s: string | null) => { if (latest()) setParsing(s); });
    const found: any[] = [];
    const show = inEpoch((rows: any[]) => { if (latest()) rawSetItems(rows); });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        status(files.length > 1 ? `Reading ${i + 1} of ${files.length}…` : 'Bruno is reading the invoice…');
        const form = new FormData();
        form.append('file', file);
        const r = await apiFetch('/api/cad/parts/import-invoice/parse', { method: 'POST', body: form });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { notify(`Couldn't read ${file.name}: ` + (d.error || 'Unsupported file'), 'error'); continue; }
        for (const it of d.items || []) {
          found.push({
            selected: true,
            name: String(it.name || ''),
            quantity: Number(it.quantity) || 1,
            unitCost: Number(it.unitPrice) || 0,
            section: 'Other',
            source: 'purchased',
            status: 'to_order',
            notes: it.sku ? `SKU: ${it.sku}` : '',
          });
        }
      }
      if (!found.length) { notify('No line items found in the selected file(s).', 'error'); return; }
      show(found);
    } catch (e: any) {
      notify('Error reading file: ' + (e?.message || e), 'error');
    } finally {
      status(null);
    }
  };

  const updateItem = (index: number, patch: any) => edit((xs) => xs.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const removeItem = (index: number) => edit((xs) => xs.filter((_, i) => i !== index));
  const toggleAll = (v: boolean) => edit((xs) => xs.map((it) => ({ ...it, selected: v })));

  const importSelected = async () => {
    const selected = getDraft<any[]>(INVOICE_ITEMS_KEY, items).filter((it) => it.selected && String(it.name || '').trim());
    if (!selected.length) { notify('Select at least one item with a name to import.', 'info'); return; }
    const bad = selected.map((it) => bomNumbersError(it.quantity, it.unitCost)).find(Boolean);
    if (bad) { notify(bad, 'error'); return; }
    if (lock.held()) return;
    const release = lock.begin();
    const finish = inEpoch(() => { rawSetItems([]); setFiles([]); onDone(); cadChanged('/api/cad/parts'); });
    try {
      const results = await Promise.all(selected.map((it) =>
        apiFetch('/api/cad/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: String(it.name).trim(),
            section: it.section,
            quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
            source: it.source,
            unit_cost: Math.max(0, Number(it.unitCost) || 0),
            status: it.status,
            assignee: '',
            notes: String(it.notes || '').trim(),
          }),
        }).then((r) => r.ok).catch(() => false)
      ));
      const ok = results.filter(Boolean).length;
      if (ok === selected.length) notify(`Imported ${ok} part${ok === 1 ? '' : 's'} into the BOM.`, 'success');
      else if (ok > 0) notify(`Imported ${ok} of ${selected.length} parts — ${selected.length - ok} failed.`, 'error');
      else { notify('Import failed. Check the rows and try again.', 'error'); return; }
      finish();
    } finally {
      release();
    }
  };
  /** Close the import: drop the reviewed rows. */
  const discard = () => {
    if (lock.held()) return;
    // Invalidate a parse still running so it can't bring the rows back.
    setDraft(INVOICE_SEQ_KEY, getDraft<number>(INVOICE_SEQ_KEY, 0) + 1);
    setParsing(null);
    rawSetItems([]);
    setFiles([]);
  };
  const selectedCount = items.filter((it) => it.selected).length;
  return { files, setFiles, parsing, items, importing: lock.busy, parse, updateItem, removeItem, toggleAll, importSelected, discard, selectedCount };
}

// Shared Communication-log logic for the Legacy CommunicationView and the
// Modern Communication page. Extracted from CommunicationView: same
// /api/communications endpoints and bodies, threading, optimistic delete and
// the "did they respond?" follow-up. The open forms (new log, reply, edit) are
// drafted, and a save only clears the form it submitted.
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { communicationError } from '../../utils/validation';
import { bulkDelete } from '../../modern/ui/selection';
import { getDraft, useDraft } from '../../modern/drafts';
import { useContextMenu } from '../contextmenu/ContextMenuProvider';

export interface NewComm { recipient: string; subject: string; body: string; type: string; date: string }
export interface ReplyForm { body: string; date: string; direction: string }
export interface EditForm { recipient: string; subject: string; body: string; date: string; type: string; direction: string }
const now = () => format(new Date(), 'yyyy-MM-dd HH:mm');
export const blankComm = (): NewComm => ({ recipient: '', subject: '', body: '', type: 'email', date: now() });
export const blankReply = (): ReplyForm => ({ body: '', date: now(), direction: 'inbound' });
const BLANK_EDIT: EditForm = { recipient: '', subject: '', body: '', date: '', type: 'email', direction: 'outbound' };

export function useCommunicationController({ communications, setCommunications, refresh, hasScope }: {
  communications: any[]; setCommunications: (v: any) => void; refresh: { communications: () => any }; hasScope?: (s: string) => boolean;
}) {
  const canManage = hasScope ? hasScope('communications') : false;
  const [showAdd, setShowAdd] = useDraft<boolean>('comm:add-open', false);
  const [showImport, setShowImport] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newComm, setNewComm] = useDraft<NewComm>('comm:new', blankComm());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useDraft<any>('comm:replying', null);
  const [replyForm, setReplyForm] = useDraft<ReplyForm>('comm:reply', blankReply());
  const [askResponded, setAskResponded] = useState<any>(null);
  const [editingEntry, setEditingEntry] = useDraft<any>('comm:editing', null);
  const [editForm, setEditForm] = useDraft<EditForm>('comm:edit', BLANK_EDIT);
  // Group entries into threads: roots (no parent_id) + their replies, chronological.
  const threads = useMemo(() => {
    const list = communications || [];
    const byId = new Map(list.map((c: any) => [c.id, c]));
    const roots = list.filter((c: any) => c.parent_id == null || !byId.has(c.parent_id));
    return roots.map((root: any) => {
      const replies = list
        .filter((c: any) => c.parent_id === root.id)
        .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
      // Sort the whole chain (root included) chronologically: reply dates are
      // editable, so a backdated reply must not reorder the root to the end or
      // masquerade as the latest activity.
      const allSorted = [root, ...replies].sort((a: any, b: any) =>
        String(a.date).localeCompare(String(b.date)) || a.id - b.id);
      const lastDate = allSorted[allSorted.length - 1].date;
      return { root, replies, all: allSorted, count: allSorted.length, lastDate };
    }).sort((a: any, b: any) => String(b.lastDate).localeCompare(String(a.lastDate)) || b.root.id - a.root.id);
  }, [communications]);

  // Right-click on a log entry: delete.
  useContextMenu('comm', (el) => {
    if (!canManage) return null;
    const id = Number(el.dataset.cmId);
    const comm = (communications || []).find((x: any) => x.id === id);
    if (!comm) return null;
    const isRoot = comm.parent_id == null;
    return [
      { label: isRoot ? 'Delete thread' : 'Delete reply', icon: Trash2, danger: true, action: () => handleDelete(comm.id, isRoot) },
    ];
  });

  const handleAdd = async () => {
    const submitted = getDraft<NewComm>('comm:new', newComm);
    const missing = communicationError(submitted as any, false);
    if (missing) { notify(missing, 'error'); return; }
    let res: any = null;
    try {
      res = await apiFetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComm)
      });
    } catch { res = null; }
    if (!res || !res.ok) {
      notify('Could not log message — try again. Your draft is kept.', 'error');
      return;
    }
    const data = await res.json().catch(() => ({}));
    const saved = { ...submitted };
    // Only clear the form this save came from (not one edited since).
    if (getDraft('comm:new', submitted) === submitted) {
      setShowAdd(false);
      setNewComm(blankComm());
    }
    refresh.communications();
    // Ask whether they responded so the reply can be logged right away.
    if (data && data.id) {
      setAskResponded({ id: data.id, recipient: saved.recipient, subject: saved.subject, type: saved.type });
    }
  };

  const handleReply = async () => {
    if (!replyingTo || !replyForm.body.trim()) return;
    const submitted = getDraft<ReplyForm>('comm:reply', replyForm);
    let res: any = null;
    try {
      res = await apiFetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: replyingTo.root.recipient,
          subject: replyingTo.root.subject,
          body: replyForm.body.trim(),
          date: replyForm.date,
          type: replyingTo.root.type,
          parent_id: replyingTo.root.id,
          direction: replyForm.direction,
        })
      });
    } catch { res = null; }
    if (!res || !res.ok) {
      notify('Could not save reply — try again. Your draft is kept.', 'error');
      return;
    }
    if (getDraft('comm:reply', submitted) === submitted) {
      setReplyingTo(null);
      setReplyForm(blankReply());
    }
    refresh.communications();
  };

  const openReply = (thread: any, direction: string) => {
    setReplyingTo(thread);
    setReplyForm({ ...blankReply(), direction });
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setEditForm({
      recipient: entry.recipient || '',
      subject: entry.subject || '',
      body: entry.body || '',
      date: entry.date || format(new Date(), 'yyyy-MM-dd HH:mm'),
      type: entry.type || 'email',
      direction: entry.direction === 'inbound' ? 'inbound' : 'outbound',
    });
  };

  const handleEdit = async () => {
    if (!editingEntry) return;
    const submitted = getDraft<EditForm>('comm:edit', editForm);
    const missing = communicationError(submitted as any, editingEntry.parent_id != null);
    if (missing) { notify(missing, 'error'); return; }
    let res: any = null;
    try {
      res = await apiFetch(`/api/communications/${editingEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
    } catch { res = null; }
    if (!res || !res.ok) {
      notify('Could not save changes — try again.', 'error');
      return;
    }
    if (getDraft('comm:edit', submitted) === submitted) setEditingEntry(null);
    refresh.communications();
  };

  const handleDelete = async (id: number, isRoot: boolean) => {
    const msg = isRoot ? 'Delete this entire thread including all replies?' : 'Delete this reply?';
    if (!(await confirmDialog({ title: isRoot ? 'Delete thread' : 'Delete reply', message: msg, confirmLabel: 'Delete', danger: true }))) return;
    // Optimistic: remove instantly, restore on failure.
    const prev = communications;
    setCommunications((cs: any[]) => cs.filter((c: any) => c.id !== id && c.parent_id !== id));
    try {
      const res = await apiFetch(`/api/communications/${id}`, { method: 'DELETE' });
      if (res.ok) refresh.communications();
      else {
        setCommunications(prev);
        notify('Could not delete — try again.', 'error');
      }
    } catch {
      setCommunications(prev);
      notify('Could not delete — try again.', 'error');
    }
  };

  /** Delete whole threads (each root takes its replies with it). */
  const bulkDeleteThreads = async (rootIds: number[]) => {
    const ok = await bulkDelete(rootIds, async (id) => {
      const res = await apiFetch(`/api/communications/${id}`, { method: 'DELETE' }).catch(() => null);
      return !!res?.ok;
    }, { noun: 'conversation', detail: `This permanently deletes ${rootIds.length === 1 ? 'the conversation' : `${rootIds.length} conversations`} and every reply in ${rootIds.length === 1 ? 'it' : 'them'}. This can't be undone.` });
    if (ok === false) return false;
    const gone = new Set(ok.map(Number));
    setCommunications((cs: any[]) => cs.filter((c: any) => !gone.has(c.id) && !gone.has(c.parent_id)));
    refresh.communications();
    return true;
  };

  return { bulkDeleteThreads, canManage, showAdd, setShowAdd, showImport, setShowImport, showQuickAdd, setShowQuickAdd, newComm, setNewComm, expandedId, setExpandedId, replyingTo, setReplyingTo, replyForm, setReplyForm, askResponded, setAskResponded, editingEntry, setEditingEntry, editForm, setEditForm, threads, handleAdd, handleReply, openReply, openEdit, handleEdit, handleDelete };
}

// Shared Outreach logic for Legacy OutreachView and the Modern Outreach
// page. Extracted from OutreachView: same /api/outreach and
// /api/outreach/social endpoints and bodies, optimistic delete / unlink /
// pin / reorder with rollback, the TikTok OAuth result banner, totals, and
// the Bruno AI bulk log (quick local parse or "Parse with Bruno"). Logging
// events is open to every member (as on the server); social profiles need
// the outreach permission. The event form, the bulk-log box and their
// in-flight locks are drafted (they survive a mode switch, so a returning
// page can't log the same events twice); fields freeze while saving, a save
// only closes the form it submitted, and a failed delete or unlink restores
// just that row.
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { extractActionProposals, streamBuildHelper } from '../../services/aiService';
import { confirmDialog, notify } from '../dialog';
import { draftEpoch, getDraft, inEpoch, setDraft, useDraft } from '../../modern/drafts';
import { useContextMenu } from '../contextmenu/ContextMenuProvider';
import { parseOutreachRows } from './parseOutreachRows';

export const OUTREACH_PRESETS = ['Demo', 'Workshop', 'Volunteering', 'Fundraiser', 'Presentation', 'Competition'];
export interface OutreachForm { title: string; description: string; date: string; hours: string; location: string; attendees: string; funds_raised: string }
export const emptyOutreachForm = (): OutreachForm => ({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '2', location: '', attendees: '', funds_raised: '' });
const FORM_KEY = 'outreach:form';
const BULK_ROWS_KEY = 'outreach:bulk-rows';
const SAVING_KEY = 'outreach:saving';
const BULK_BUSY_KEY = 'outreach:bulk-busy';
const PARSE_SEQ_KEY = 'outreach:bulk-parse-seq';
const BULK_SAVING_KEY = 'outreach:bulk-saving';

/** Put a row back at (about) its old position unless the list already has it. */
function restoreRow<T extends { id: unknown }>(list: T[], row: T, index: number): T[] {
  if (list.some((x) => x.id === row.id)) return list;
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), row, ...list.slice(at)];
}

export function useOutreachController({ outreach, setOutreach, socialProfiles, setSocialProfiles, currentUser, onRefresh, refresh, hasScope }: {
  outreach: any[]; setOutreach: (v: any) => void; socialProfiles: any[]; setSocialProfiles: (v: any) => void; currentUser: any;
  onRefresh: () => void; refresh: { outreach: () => any; socialProfiles: () => any }; hasScope?: (s: string) => boolean;
}) {
  const isAdminSocial = hasScope ? hasScope('outreach') : (currentUser as any)?.account_type === 'admin';
  const [showLinkYT, setShowLinkYT] = useState(false);
  const [ytInput, setYtInput] = useState('');
  const [linkingYT, setLinkingYT] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const [showForm, setShowForm] = useDraft<boolean>('outreach:form-open', false);
  const [editingId, setEditingId] = useDraft<number | null>('outreach:editing', null);
  const [form, setForm] = useDraft<OutreachForm>(FORM_KEY, emptyOutreachForm());
  const [saving, setSaving] = useDraft<boolean>(SAVING_KEY, false);

  // Bruno AI log: paste a table/text, parse rows, preview, log them all.
  const [bulkOpen, setBulkOpen] = useDraft<boolean>('outreach:bulk-open', false);
  const [bulkText, setBulkText] = useDraft<string>('outreach:bulk-text', '');
  const [bulkRows, setBulkRows] = useDraft<any[]>(BULK_ROWS_KEY, []);
  const [bulkBusy, setBulkBusy] = useDraft<boolean>(BULK_BUSY_KEY, false);
  const [bulkSaving, setBulkSaving] = useDraft<boolean>(BULK_SAVING_KEY, false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  // TikTok OAuth result (?social=connected|error|cancelled|tiktok_unavailable)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('social');
    if (!s) return;
    if (s === 'connected') notify('TikTok connected — stats synced.', 'success');
    else if (s === 'cancelled') notify('TikTok connection cancelled.', 'error');
    else if (s === 'tiktok_unavailable') notify('TikTok is temporarily unavailable.', 'error');
    else if (s === 'error') notify('TikTok connection failed — try again.', 'error');
    params.delete('social');
    window.history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    if (s === 'connected') onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLinkYouTube = async () => {
    if (!ytInput.trim()) { notify('Enter a channel handle, URL, or channel ID.', 'error'); return; }
    setLinkingYT(true);
    try {
      const res = await apiFetch('/api/outreach/social/youtube', { method: 'POST', body: JSON.stringify({ input: ytInput.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not link channel');
      notify('YouTube channel linked — stats synced.', 'success');
      setYtInput('');
      setShowLinkYT(false);
      refresh.socialProfiles();
    } catch (e: any) {
      notify(e.message || 'Could not link channel', 'error');
    } finally {
      setLinkingYT(false);
    }
  };

  const handleUnlinkProfile = async (id: number) => {
    if (!(await confirmDialog({ title: 'Unlink profile', message: 'Unlink this profile? Its sync history will be removed.', confirmLabel: 'Unlink', danger: true }))) return;
    // Optimistic: drop instantly; on failure put back only that profile.
    const idx = (socialProfiles || []).findIndex((p: any) => p.id === id);
    const removed = (socialProfiles || [])[idx];
    setSocialProfiles((ps: any[]) => (ps || []).filter((p: any) => p.id !== id));
    const restore = () => { if (removed) setSocialProfiles((cur: any[]) => restoreRow(cur || [], removed, idx)); };
    try {
      const res = await apiFetch(`/api/outreach/social/${id}`, { method: 'DELETE' });
      if (res.ok) refresh.socialProfiles();
      else {
        restore();
        notify('Could not unlink profile — try again.', 'error');
      }
    } catch {
      restore();
      notify('Could not unlink profile — try again.', 'error');
    }
  };

  const handlePinProfile = async (id: number, pinned: boolean) => {
    // Optimistic: flip instantly; on failure flip back only that profile.
    const flip = (to: boolean) => setSocialProfiles((ps: any[]) => (ps || []).map((p: any) => (p.id === id ? { ...p, is_pinned: to } : p)));
    flip(!pinned);
    try {
      const res = await apiFetch(`/api/outreach/social/${id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !pinned }) });
      if (res.ok) refresh.socialProfiles();
      else {
        flip(pinned);
        notify('Could not update pin — try again.', 'error');
      }
    } catch {
      flip(pinned);
      notify('Could not update pin — try again.', 'error');
    }
  };

  const handleMoveProfile = async (id: number, dir: -1 | 1) => {
    const ids = (socialProfiles || []).map((p: any) => p.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Optimistic: reorder instantly (the id order is already computed above).
    const prev = socialProfiles;
    const order = new Map<number, number>(ids.map((pid: number, idx: number) => [pid, idx]));
    setSocialProfiles((ps: any[]) => [...(ps || [])].sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    try {
      const res = await apiFetch('/api/outreach/social/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
      if (res.ok) refresh.socialProfiles();
      else {
        setSocialProfiles(prev);
        notify('Could not reorder — try again.', 'error');
      }
    } catch {
      setSocialProfiles(prev);
      notify('Could not reorder — try again.', 'error');
    }
  };

  const handleSyncNow = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await apiFetch(`/api/outreach/social/${id}/sync`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Sync failed');
      notify('Stats updated.', 'success');
      refresh.socialProfiles();
    } catch (e: any) {
      notify(e.message || 'Sync failed', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  // TikTok is temporarily disabled until Login Kit is verified — hide any
  // linked TikTok profiles from the UI (their data stays in the DB).
  const profiles = (socialProfiles || []).filter((p: any) => p.platform !== 'tiktok');

  /** Start a parse: newer parses win, and nothing re-parses while a batch is logging. */
  const nextParse = () => {
    const seq = getDraft<number>(PARSE_SEQ_KEY, 0) + 1;
    setDraft(PARSE_SEQ_KEY, seq);
    return () => getDraft<number>(PARSE_SEQ_KEY, 0) === seq;
  };

  const handleBulkParse = () => {
    if (getDraft(BULK_SAVING_KEY, false)) return;
    nextParse(); // supersedes any Bruno parse still running
    const rows = parseOutreachRows(bulkText);
    setBulkRows(rows);
    setBulkNote(rows.length
      ? `Found ${rows.length} event${rows.length === 1 ? '' : 's'} — review and log them all.`
      : 'No events found — try the AI parse, or format rows as: title | date | hours | location | attendees | funds');
  };

  const handleBulkAiParse = async () => {
    const text = bulkText.trim();
    if (!text || getDraft(BULK_BUSY_KEY, false) || getDraft(BULK_SAVING_KEY, false)) return;
    // Bruno's rows land only if this is still the newest parse (a quick
    // parse or a remount + new parse may have replaced it) and nobody signed
    // out / switched workspace meanwhile. The busy flag is drafted, so a
    // returning page can't start a second Bruno parse on top.
    const latest = nextParse();
    setBulkBusy(true);
    const done = inEpoch(() => setBulkBusy(false));
    setBulkNote(null);
    setBulkRows([]);
    const showRows = inEpoch((rows: any[]) => { if (latest()) setBulkRows(rows); });
    const note = (n: string) => { if (latest()) setBulkNote(n); };
    let agg = '';
    try {
      await streamBuildHelper([
        { role: 'user', text: `You are helping bulk-log outreach events (demos, workshops, volunteering, fundraisers, presentations). The user pasted the text below into the "Bruno AI" box and clicked "Parse with Bruno" — that click is their confirmation that they want the entries proposed. Extract EVERY outreach event mentioned and propose them with the \`\`\`outreach block exactly as your outreach log skill specifies. Resolve relative dates against today's date from your context — do not ask clarifying questions for dates you can resolve. Only ask a short clarifying question (no block) if a date is truly impossible to determine.\n\nText to parse:\n"""${text}"""` },
      ], (chunk) => { agg += chunk; }, undefined, { persona: 'bruno' });
      const proposals = extractActionProposals(agg);
      const items = proposals.find((p) => p.kind === 'outreach')?.items || [];
      const reply = agg.replace(/```outreach[\s\S]*?(```|$)/g, '').replace(/```[\s\S]*?(```|$)/g, '').trim();
      if (items.length) {
        showRows(items.map((e: any) => ({
          title: e.title || '', description: e.description || '', date: e.date || '',
          hours: e.hours != null && e.hours !== '' ? String(e.hours) : '',
          location: e.location || '', attendees: e.attendees != null && e.attendees !== '' ? String(e.attendees) : '',
          funds_raised: e.funds_raised != null && e.funds_raised !== '' ? String(e.funds_raised) : '',
        })));
        note(`Bruno found ${items.length} event${items.length === 1 ? '' : 's'} — review and log them all.`);
      } else {
        note(reply || 'Bruno could not find any events in that text — try adding dates.');
      }
    } catch (e: any) {
      note(e?.serverError || e?.message || "Bruno isn't reachable right now — try again in a moment.");
    } finally {
      done();
    }
  };

  const removeBulkRow = (i: number) => { if (!getDraft(BULK_SAVING_KEY, false)) setBulkRows((rows) => rows.filter((_, j) => j !== i)); };

  const handleBulkLogAll = async () => {
    const submitted = getDraft<any[]>(BULK_ROWS_KEY, bulkRows);
    if (!submitted.length || getDraft(BULK_SAVING_KEY, false)) return;
    setBulkSaving(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it.
    const unlock = inEpoch(() => setBulkSaving(false));
    // Clean up only in the same session/workspace: after clearDrafts() the
    // identity check below would pass (getDraft falls back to `submitted`)
    // and could write these rows into the next account's box.
    const sameSession = inEpoch((fn: () => void) => fn());
    const epoch = draftEpoch();
    let done = 0;
    const failed: any[] = [];
    try {
      for (const r of submitted) {
        // Stop as soon as the account / workspace changes: each request uses
        // the current session, so the rest would land in the new workspace.
        if (draftEpoch() !== epoch) break;
        const payload = {
          title: r.title, description: r.description || '', date: r.date,
          hours: r.hours === '' ? 0 : Number(r.hours) || 0,
          location: r.location || '',
          attendees: r.attendees === '' ? 0 : Math.max(0, parseInt(r.attendees, 10) || 0),
          funds_raised: r.funds_raised === '' ? 0 : Math.max(0, parseFloat(r.funds_raised) || 0),
        };
        const res = await apiFetch('/api/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
        if (res?.ok) done++;
        else failed.push(r);
      }
      notify(`Logged ${done} of ${submitted.length} outreach events.`, done === submitted.length ? 'success' : 'error');
      // Only touch the box these rows came from (not one re-parsed meanwhile):
      // all saved → clear it; some failed → keep just those rows (and the
      // pasted text) so they can be retried.
      sameSession(() => {
        if (getDraft(BULK_ROWS_KEY, submitted) !== submitted) return;
        if (!failed.length) { setBulkRows([]); setBulkText(''); setBulkNote(null); setBulkOpen(false); }
        else { setBulkRows(failed); setBulkNote(`${failed.length} event${failed.length === 1 ? '' : 's'} couldn't be logged — try again.`); }
      });
      if (done) refresh.outreach();
    } finally {
      unlock();
    }
  };

  // Field edits are ignored while the event saves (frozen in both modes).
  const editForm: typeof setForm = (v) => { if (!getDraft(SAVING_KEY, false)) setForm(v); };
  const set = (k: keyof OutreachForm) => (e: any) => editForm((f) => ({ ...f, [k]: e.target.value }));

  const totals = useMemo(() => {
    const list = outreach || [];
    return {
      events: list.length,
      hours: list.reduce((s: number, e: any) => s + (Number(e.hours) || 0), 0),
      attendees: list.reduce((s: number, e: any) => s + (Number(e.attendees) || 0), 0),
      funds: list.reduce((s: number, e: any) => s + (Number(e.funds_raised) || 0), 0),
    };
  }, [outreach]);

  const openAdd = () => { setEditingId(null); setForm(emptyOutreachForm()); setShowForm(true); };
  const openEdit = (event: any) => {
    setEditingId(event.id);
    setForm({
      title: event.title || '',
      description: event.description || '',
      date: (event.date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
      hours: event.hours != null && event.hours !== '' ? String(event.hours) : '',
      location: event.location || '',
      attendees: event.attendees ? String(event.attendees) : '',
      funds_raised: event.funds_raised ? String(event.funds_raised) : '',
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleSubmit = async () => {
    const submitted = getDraft<OutreachForm>(FORM_KEY, form);
    const id = editingId;
    if (!submitted.title.trim()) { notify('Give the event a title.', 'error'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submitted.date)) { notify('Pick a valid date.', 'error'); return; }
    if (getDraft(SAVING_KEY, false)) return;
    setSaving(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it.
    const unlock = inEpoch(() => setSaving(false));
    try {
      const payload = {
        title: submitted.title.trim(),
        description: submitted.description.trim(),
        date: submitted.date,
        hours: Math.max(0, Math.round((parseFloat(submitted.hours) || 0) * 100) / 100),
        location: submitted.location.trim(),
        attendees: Math.max(0, parseInt(submitted.attendees) || 0),
        funds_raised: Math.max(0, Math.round((parseFloat(submitted.funds_raised) || 0) * 100) / 100),
      };
      const res = id
        ? await apiFetch(`/api/outreach/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await apiFetch('/api/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('save failed');
      // Only close the form this save came from (not one edited since).
      if (getDraft(FORM_KEY, submitted) === submitted) closeForm();
      refresh.outreach();
      notify(id ? 'Event updated.' : 'Event logged.');
    } catch {
      notify('Could not save the event.', 'error');
    } finally {
      unlock();
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete event', message: 'Delete this outreach event?', confirmLabel: 'Delete', danger: true }))) return;
    // Optimistic: remove instantly; on failure put back only that event
    // (a save may have refreshed the list meanwhile).
    const idx = (outreach || []).findIndex((e: any) => e.id === id);
    const removed = (outreach || [])[idx];
    setOutreach((es: any[]) => es.filter((e: any) => e.id !== id));
    const restore = () => { if (removed) setOutreach((cur: any[]) => restoreRow(cur || [], removed, idx)); };
    try {
      const res = await apiFetch(`/api/outreach/${id}`, { method: 'DELETE' });
      if (res.ok) refresh.outreach();
      else {
        restore();
        notify('Could not delete event — try again.', 'error');
      }
    } catch {
      restore();
      notify('Could not delete event — try again.', 'error');
    }
  };

  // Right-click on an outreach event card: edit or delete.
  useContextMenu('outreach', (el) => {
    if (!isAdminSocial) return null;
    const id = Number(el.dataset.cmId);
    const event = (outreach || []).find((x: any) => x.id === id);
    if (!event) return null;
    return [
      { label: 'Edit event', icon: Pencil, action: () => openEdit(event) },
      { label: 'Delete event', icon: Trash2, danger: true, action: () => handleDelete(event.id) },
    ];
  });

  return {
    isAdminSocial, profiles, showLinkYT, setShowLinkYT, ytInput, setYtInput, linkingYT, syncingId,
    handleLinkYouTube, handleUnlinkProfile, handlePinProfile, handleMoveProfile, handleSyncNow,
    showForm, editingId, form, setForm: editForm, set, saving, openAdd, openEdit, closeForm, handleSubmit, handleDelete, totals,
    bulkOpen, setBulkOpen, bulkText, setBulkText, bulkRows, setBulkRows, removeBulkRow, bulkBusy, bulkSaving, bulkNote,
    handleBulkParse, handleBulkAiParse, handleBulkLogAll,
  };
}

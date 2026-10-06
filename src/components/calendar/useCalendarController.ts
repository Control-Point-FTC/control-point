// Shared Calendar logic for the Legacy CalendarView and the Modern Calendar
// page. Extracted verbatim from CalendarView (same endpoints, optimistic
// updates, Bruno quick-add). The editor and quick-add text are drafted so an
// open, half-written event survives a Legacy/Modern switch.
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../services/api';
import { notify, confirmDialog } from '../dialog';
import { setScreenEntity } from '../../services/brunoContext';
import { streamBuildHelper, extractActionProposals, applyActionProposals, notifyBrunoDataChanged, type ActionProposal } from '../../services/aiService';
import { useDraft, getDraft, newSessionId } from '../../modern/drafts';

export interface EventForm {
  title: string; description: string; date: string; start_time: string; end_time: string;
  location: string; event_type: string; team_id: string;
}
const EMPTY_EVENT: EventForm = { title: '', description: '', date: '', start_time: '', end_time: '', location: '', event_type: 'meeting', team_id: '' };
const EMPTY_LIST: any[] = [];

export const EVENT_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'competition', label: 'Competition' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'social', label: 'Social' },
  { value: 'other', label: 'Other' },
] as const;

export const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function useCalendarController({ events, setEvents, refresh, currentUser, hasScope }: {
  events: any[];
  setEvents: (v: any) => void;
  refresh: { events: () => void };
  currentUser: any;
  hasScope?: (s: string) => boolean;
}) {
  const canManageCalendar = hasScope ? hasScope('calendar') : false;
  const [cursor, setCursor] = useState(() => new Date());
  const [showModal, setShowModal] = useDraft<boolean>('calendar:editor-open', false);
  const [editingId, setEditingId] = useDraft<number | null>('calendar:editing-id', null);
  const [form, setForm] = useDraft<EventForm>('calendar:form', EMPTY_EVENT);
  // Editor session counter: bumped whenever the editor opens or closes, so a
  // Bruno reply that lands after its session ended (even in the other mode)
  // never writes into a newer draft.
  const [, setGen] = useDraft<number>('calendar:editor-gen', 0);
  const bumpGen = () => setGen(newSessionId());
  const currentGen = () => getDraft<number>('calendar:editor-gen', 0);
  // Bruno screen context: the event open in the editor.
  useEffect(() => {
    setScreenEntity('eventId', showModal ? editingId : null);
    return () => setScreenEntity('eventId', null);
  }, [showModal, editingId]);

  // AI quick-add: paste/type natural language, Bruno parses it into event
  // proposals. One proposal fills the form; several get a bulk-create preview.
  const [aiOpen, setAiOpen] = useDraft<boolean>('calendar:ai-open', false);
  const [aiText, setAiText] = useDraft<string>('calendar:ai-text', '');
  // Busy flags are drafted too, so a mode switch mid-request can't start a
  // second parse or a duplicate bulk create.
  const [aiBusy, setAiBusy] = useDraft<boolean>('calendar:ai-busy', false);
  const [aiNote, setAiNote] = useDraft<string | null>('calendar:ai-note', null);
  const [aiProposals, setAiProposals] = useDraft<any[]>('calendar:ai-proposals', EMPTY_LIST);
  const [aiCreating, setAiCreating] = useDraft<boolean>('calendar:ai-creating', false);

  const resetAi = () => { setAiText(''); setAiNote(null); setAiProposals(EMPTY_LIST); };

  const handleAiParse = async () => {
    const text = aiText.trim();
    if (!text || getDraft('calendar:ai-busy', false)) return;
    const gen = currentGen();
    setAiBusy(true);
    setAiNote(null);
    setAiProposals(EMPTY_LIST);
    let agg = '';
    try {
      await streamBuildHelper([
        { role: 'user', text: `You are helping fill in a calendar event form. The user pasted the text below into the "AI quick-add" box and clicked Parse — that click is their confirmation that they want the events proposed. Extract EVERY calendar event mentioned and propose them with the \`\`\`event block exactly as your team calendar skill specifies. Resolve relative dates (tomorrow, this Friday, etc.) against today's date from your context — do not ask clarifying questions for dates you can resolve. Only ask a short clarifying question (no block) if a date is truly impossible to determine.\n\nText to parse:\n"""${text}"""` },
      ], (chunk) => { agg += chunk; }, undefined, { persona: 'bruno' });
      if (currentGen() !== gen) return; // that editor session has ended
      const proposals = extractActionProposals(agg);
      const items = proposals.find((p) => p.kind === 'event')?.items || [];
      const note = agg.replace(/```event[\s\S]*?(```|$)/g, '').replace(/```[\s\S]*?(```|$)/g, '').trim();
      if (items.length === 1) {
        const e = items[0];
        setForm((f) => ({
          ...f,
          title: e.title || f.title,
          description: e.notes || f.description,
          date: e.date || f.date,
          start_time: e.time || f.start_time,
        }));
        setAiNote('Bruno filled in the form below — review it and hit Create Event.');
        setAiOpen(false);
      } else if (items.length > 1) {
        setAiProposals(items);
        setAiNote(`Bruno found ${items.length} events — review and create them all at once.`);
      } else {
        setAiNote(note || 'Bruno could not find any events in that text — try adding dates and times.');
      }
    } catch (e: any) {
      if (currentGen() !== gen) return;
      setAiNote(e?.serverError || e?.message || "Bruno isn't reachable right now — try again in a moment.");
    } finally {
      setAiBusy(false);
    }
  };

  const handleAiCreateAll = async () => {
    if (!aiProposals.length || getDraft('calendar:ai-creating', false)) return;
    const gen = currentGen();
    const items = aiProposals;
    setAiCreating(true);
    try {
      const applied = await applyActionProposals([{ kind: 'event', items } as ActionProposal]);
      notifyBrunoDataChanged(['calendar']);
      notify(`Created ${applied.event || items.length} events.`, 'success');
      refresh.events();
      // Only close the editor that started this batch.
      if (currentGen() === gen) closeEditor();
    } catch (e: any) {
      if (currentGen() !== gen) return;
      setAiNote(e?.message || "Couldn't create those events — please try again.");
    } finally {
      setAiCreating(false);
    }
  };

  const todayKey = toDateKey(new Date());

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of events) (map[e.date] = map[e.date] || []).push(e);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    return map;
  }, [events]);

  const openNew = (dateKey: string) => {
    bumpGen();
    setEditingId(null);
    setForm({ ...EMPTY_EVENT, date: dateKey });
    resetAi();
    setAiOpen(false);
    setShowModal(true);
  };

  const openEdit = (e: any) => {
    bumpGen();
    setEditingId(e.id);
    resetAi();
    setAiOpen(false);
    setForm({
      title: e.title, description: e.description || '', date: e.date,
      start_time: e.start_time || '', end_time: e.end_time || '',
      location: e.location || '', event_type: e.event_type || 'meeting',
      team_id: e.team_id ? String(e.team_id) : '',
    });
    setShowModal(true);
  };

  function closeEditor() {
    bumpGen();
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_EVENT);
    setAiOpen(false);
    resetAi();
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) return;
    const payload = { ...form, team_id: form.team_id ? Number(form.team_id) : null, created_by: currentUser?.id };
    const id = editingId;
    // The editor closes immediately (optimistic), so its draft is cleared now.
    closeEditor();
    const prev = events;
    if (id) {
      setEvents((es: any[]) => es.map((e: any) => (e.id === id ? { ...e, ...payload } : e)));
      try {
        const res = await apiFetch(`/api/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error();
        refresh.events();
      } catch {
        setEvents(prev);
        notify('Could not save event — try again.', 'error');
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      setEvents((es: any[]) => [...es, { ...payload, id: tempId }]);
      try {
        const res = await apiFetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error();
        refresh.events();
      } catch {
        setEvents((es: any[]) => es.filter((e: any) => e.id !== tempId));
        notify('Could not save event — try again.', 'error');
      }
    }
  };

  /** Delete with confirm + optimistic removal. `onConfirmed` runs right after
   *  the user confirms (the editor/sheet closes before the request, as before). */
  const deleteEvent = async (id: number, title?: string, onConfirmed?: () => void) => {
    if (!(await confirmDialog({ title: 'Delete event', message: title ? `Delete "${title}"?` : 'Delete this event?', confirmLabel: 'Delete', danger: true }))) return false;
    onConfirmed?.();
    const prev = events;
    setEvents((es: any[]) => es.filter((e: any) => e.id !== id));
    try {
      const res = await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
      if (res.ok) { refresh.events(); return true; }
      setEvents(prev);
      notify('Could not delete event — try again.', 'error');
    } catch {
      setEvents(prev);
      notify('Could not delete event — try again.', 'error');
    }
    return false;
  };

  const handleDelete = async () => {
    if (!editingId) return;
    await deleteEvent(editingId, undefined, closeEditor);
  };

  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // An event is finished if its date is past, or it's today and the end time (or start time) has passed.
  const isEventFinished = (e: any) => {
    if (!e) return false;
    if (e.date < todayKey) return true;
    if (e.date === todayKey) {
      const endTime = e.end_time || e.start_time || '';
      if (endTime && endTime <= nowTime) return true;
    }
    return false;
  };

  /** Next unfinished events (optionally filtered first), soonest first. */
  const upcomingWhere = (keep: (e: any) => boolean = () => true, limit = 8) => [...events]
    .filter((e: any) => e.date >= todayKey && !isEventFinished(e) && keep(e))
    .sort((a: any, b: any) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
    .slice(0, limit);
  const upcoming = upcomingWhere();

  return {
    canManageCalendar, cursor, setCursor, todayKey, byDate, upcoming, upcomingWhere, isEventFinished,
    showModal, setShowModal, editingId, form, setForm, openNew, openEdit, closeEditor, handleSave, handleDelete, deleteEvent,
    aiOpen, setAiOpen, aiText, setAiText, aiBusy, aiNote, aiProposals, setAiProposals, aiCreating, resetAi, handleAiParse, handleAiCreateAll,
  };
}

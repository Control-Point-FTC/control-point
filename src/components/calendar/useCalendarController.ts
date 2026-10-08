// Shared Calendar logic for the Legacy CalendarView and the Modern Calendar
// page. Extracted verbatim from CalendarView (same endpoints, optimistic
// updates, Bruno quick-add). The editor and quick-add text are drafted so an
// open, half-written event survives a Legacy/Modern switch.
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { notify, confirmDialog } from '../dialog';
import { setScreenEntity } from '../../services/brunoContext';
import { streamBuildHelper, extractActionProposals, applyActionProposals, notifyBrunoDataChanged, type ActionProposal } from '../../services/aiService';
import { useDraft, getDraft, newSessionId } from '../../modern/drafts';
import { eventTimeError } from '../../utils/validation';
import { readEventRepeat, cleanReminder, DEFAULT_COUNT, type EventRepeat } from '../../utils/eventSeries';

export type RepeatChoice = '' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export interface EventForm {
  title: string; description: string; date: string; start_time: string; end_time: string;
  location: string; event_type: string; team_id: string;
  /** How often it repeats ('' = doesn't). 'custom' keeps a rule set elsewhere (Bruno). */
  repeat: RepeatChoice;
  /** The rule behind 'custom' (and the stored rule when editing). */
  repeat_rule: EventRepeat | null;
  repeat_end: 'count' | 'until';
  repeat_count: string;
  repeat_until: string;
  /** Reminder lead time in minutes ('' = none). */
  reminder: string;
  /** Editing a repeating event: just this one, or this and the later ones. */
  scope: 'one' | 'following';
}
const EMPTY_EVENT: EventForm = {
  title: '', description: '', date: '', start_time: '', end_time: '', location: '', event_type: 'meeting', team_id: '',
  repeat: '', repeat_rule: null, repeat_end: 'count', repeat_count: String(DEFAULT_COUNT), repeat_until: '', reminder: '', scope: 'one',
};

export function repeatChoiceOf(r: EventRepeat | null): RepeatChoice {
  if (!r) return '';
  if (r.freq === 'daily' && r.interval === 1) return 'daily';
  if (r.freq === 'weekly' && r.interval === 1) return 'weekly';
  if (r.freq === 'weekly' && r.interval === 2) return 'biweekly';
  if (r.freq === 'monthly' && r.interval === 1) return 'monthly';
  return 'custom';
}

/** The repeat rule the form describes, or null for a one-off event. */
export function repeatFromForm(f: EventForm): EventRepeat | null {
  const base: Pick<EventRepeat, 'freq' | 'interval'> | null =
    f.repeat === 'daily' ? { freq: 'daily', interval: 1 }
      : f.repeat === 'weekly' ? { freq: 'weekly', interval: 1 }
        : f.repeat === 'biweekly' ? { freq: 'weekly', interval: 2 }
          : f.repeat === 'monthly' ? { freq: 'monthly', interval: 1 }
            : f.repeat === 'custom' && f.repeat_rule ? { freq: f.repeat_rule.freq, interval: f.repeat_rule.interval }
              : null;
  if (!base) return null;
  return readEventRepeat(f.repeat_end === 'until' && f.repeat_until ? { ...base, until: f.repeat_until } : { ...base, count: Number(f.repeat_count) || DEFAULT_COUNT });
}

/** Problems with the repeat fields, for the editor. Only when the rule can
 *  change here (a new or one-off event, or "this and following") and was
 *  actually changed: a series' own end date may already be behind a later
 *  occurrence. */
export function repeatError(f: EventForm, editing?: any): string | null {
  if (!f.repeat) return null;
  if (editing?.series_id && f.scope !== 'following') return null;
  if (editing && JSON.stringify(repeatFromForm(f)) === JSON.stringify(readEventRepeat(editing.recurrence))) return null;
  if (f.repeat_end === 'until') {
    if (!f.repeat_until) return 'Pick the last date it repeats on';
    if (f.date && f.repeat_until <= f.date) return 'The last date must be after the first event';
  } else {
    const n = Number(f.repeat_count);
    if (!Number.isInteger(n) || n < 2 || n > 100) return 'Repeat 2 to 100 times';
  }
  return null;
}
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
  const [storedForm, setForm] = useDraft<EventForm>('calendar:form', EMPTY_EVENT);
  // Drafts saved before a field existed still get its default.
  const form: EventForm = { ...EMPTY_EVENT, ...storedForm };
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
          // "from 3 to 5pm": the end time lands in Ends, not in the notes.
          end_time: e.end || (e.time ? '' : f.end_time),
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
      ...repeatFields(readEventRepeat(e.recurrence)),
      reminder: cleanReminder(e.reminder_minutes) != null ? String(e.reminder_minutes) : '',
      scope: 'one',
    });
    setShowModal(true);
  };

  function repeatFields(r: EventRepeat | null): Pick<EventForm, 'repeat' | 'repeat_rule' | 'repeat_end' | 'repeat_count' | 'repeat_until'> {
    return {
      repeat: repeatChoiceOf(r), repeat_rule: r,
      repeat_end: r?.until ? 'until' : 'count',
      repeat_count: String(r?.count || DEFAULT_COUNT), repeat_until: r?.until || '',
    };
  }

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
    const editingEvent = editingId ? (events || []).find((e: any) => e.id === editingId) : null;
    const timeError = eventTimeError(form.start_time, form.end_time) || repeatError(form, editingEvent);
    if (timeError) { notify(timeError, 'error'); return; }
    const inSeries = !!editingEvent?.series_id;
    const following = inSeries && form.scope === 'following';
    const fields = {
      title: form.title, description: form.description, date: form.date, start_time: form.start_time, end_time: form.end_time,
      location: form.location, event_type: form.event_type,
      team_id: form.team_id ? Number(form.team_id) : null, created_by: currentUser?.id,
      reminder_minutes: cleanReminder(form.reminder),
    };
    // The repeat rule is only sent where it can change: a new event, a
    // one-off being made repeating, or "this and following".
    const rule = repeatFromForm(form);
    const payload = {
      ...fields,
      ...(!inSeries || following ? { repeat: rule } : {}),
      ...(following ? { scope: 'following' } : {}),
    };
    const id = editingId;
    // The editor closes immediately (optimistic), so its draft is cleared now.
    closeEditor();
    const prev = events;
    if (id) {
      setEvents((es: any[]) => es.map((e: any) => (e.id === id ? { ...e, ...fields } : e)));
      try {
        const res = await apiFetch(`/api/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || '');
        refresh.events();
      } catch (err: any) {
        setEvents(prev);
        notify((!(err instanceof TypeError) && err?.message) || 'Could not save event — try again.', 'error');
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      setEvents((es: any[]) => [...es, { ...fields, id: tempId }]);
      try {
        const res = await apiFetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || '');
        if (body?.count > 1) notify(`Added ${body.count} events to the calendar.`, 'success');
        refresh.events();
      } catch (err: any) {
        setEvents((es: any[]) => es.filter((e: any) => e.id !== tempId));
        notify((!(err instanceof TypeError) && err?.message) || 'Could not save event — try again.', 'error');
      }
    }
  };

  /** Delete with confirm + optimistic removal. `onConfirmed` runs right after
   *  the user confirms (the editor/sheet closes before the request, as before). */
  /** `scope` (repeating events): 'following' = this and later ones, 'all' = the whole series. */
  const deleteEvent = async (id: number, title?: string, onConfirmed?: () => void, scope: 'one' | 'following' | 'all' = 'one') => {
    const target = (events || []).find((e: any) => e.id === id);
    const sid = target?.series_id;
    const what = !sid || scope === 'one' ? (title ? `Delete "${title}"?` : 'Delete this event?')
      : scope === 'all' ? `Delete every "${title || 'event'}" in this series?` : `Delete this "${title || 'event'}" and every one after it?`;
    if (!(await confirmDialog({ title: scope === 'all' && sid ? 'Delete series' : 'Delete event', message: what, confirmLabel: 'Delete', danger: true }))) return false;
    onConfirmed?.();
    const prev = events;
    const gone = (e: any) => e.id === id || (!!sid && e.series_id === sid && (scope === 'all' || (scope === 'following' && e.date >= target.date)));
    setEvents((es: any[]) => es.filter((e: any) => !gone(e)));
    try {
      const res = await apiFetch(`/api/events/${id}${sid && scope !== 'one' ? `?scope=${scope}` : ''}`, { method: 'DELETE' });
      if (res.ok) { refresh.events(); return true; }
      setEvents(prev);
      notify('Could not delete event — try again.', 'error');
    } catch {
      setEvents(prev);
      notify('Could not delete event — try again.', 'error');
    }
    return false;
  };

  /** Move an event to another day by drag-and-drop: only its date changes
   *  (times stay). Optimistic; on failure that event goes back. */
  // One move per event at a time: a second drag while the first save is in
  // flight is ignored, so a late failure can never undo a newer move.
  const movingIds = useRef(new Set<number | string>());
  const moveEvent = async (id: number | string, dateKey: string) => {
    const ev = (events || []).find((e: any) => e.id === id);
    if (!ev || ev.date === dateKey || String(id).startsWith('temp-')) return;
    if (movingIds.current.has(id)) { notify('Still saving the last move — try again in a moment.', 'info'); return; }
    movingIds.current.add(id);
    const from = ev.date;
    const setDate = (d: string) => setEvents((es: any[]) => es.map((e: any) => (e.id === id ? { ...e, date: d } : e)));
    setDate(dateKey);
    try {
      const res = await apiFetch(`/api/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: dateKey }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || '');
      refresh.events();
    } catch (err: any) {
      setDate(from);
      notify((!(err instanceof TypeError) && err?.message) || 'Could not move the event — try again.', 'error');
    } finally {
      movingIds.current.delete(id);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    await deleteEvent(editingId, form.title, closeEditor, form.scope === 'following' ? 'following' : 'one');
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
    events, canManageCalendar, cursor, setCursor, todayKey, byDate, upcoming, upcomingWhere, isEventFinished,
    showModal, setShowModal, editingId, form, setForm, openNew, openEdit, closeEditor, handleSave, handleDelete, deleteEvent, moveEvent,
    aiOpen, setAiOpen, aiText, setAiText, aiBusy, aiNote, aiProposals, setAiProposals, aiCreating, resetAi, handleAiParse, handleAiCreateAll,
  };
}

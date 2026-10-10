// Insert → Task or meeting: find one of your team's tasks or calendar
// events and link it here, or drop a meeting's details into the page.
import React, { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label } from '../../components/ui-kit';
import { apiJson } from '../../services/api';
import { eventHref, eventWhen, insertMeetingDetails, insertRecordLink, taskHref, type EventRecord, type TaskRecord } from '../recordLinks';

type Kind = 'task' | 'event';
const LIMIT = 30;

export function RecordLinkDialog({ editor, open, onOpenChange }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<Kind>('task');
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<{ task?: TaskRecord[]; event?: EventRecord[] }>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || records[kind]) return;
    const abort = new AbortController();
    setError('');
    apiJson<(TaskRecord | EventRecord)[]>(kind === 'task' ? '/api/tasks' : '/api/events', { cache: 'no-store', signal: abort.signal })
      .then(list => { if (!abort.signal.aborted) setRecords(r => ({ ...r, [kind]: Array.isArray(list) ? list : [] })); })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load these records.'); });
    return () => abort.abort();
  }, [open, kind, records]);
  useEffect(() => { if (!open) { setQuery(''); setRecords({}); } }, [open]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (records[kind] ?? []) as (TaskRecord | EventRecord)[];
    const matching = list.filter(r => !q || (r.title ?? '').toLowerCase().includes(q));
    // Open tasks first; for meetings, upcoming first then most recent.
    const today = new Date().toISOString().slice(0, 10);
    const sorted = kind === 'task'
      ? [...matching].sort((a, b) => Number((a as TaskRecord).status === 'done') - Number((b as TaskRecord).status === 'done'))
      : [...matching].sort((a, b) => { const da = (a as EventRecord).date ?? '', db = (b as EventRecord).date ?? ''; const fa = da >= today, fb = db >= today; return fa !== fb ? (fa ? -1 : 1) : fa ? da.localeCompare(db) : db.localeCompare(da); });
    return sorted.slice(0, LIMIT);
  }, [records, kind, query]);
  const done = () => onOpenChange(false);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>Link a task or meeting</DialogTitle><DialogDescription>Links open the record in Control Point for anyone who can see it.</DialogDescription></DialogHeader>
    <div className="nb-record-picker">
      <div role="radiogroup" aria-label="Record type" className="nb-record-kinds">
        {(['task', 'event'] as Kind[]).map(k => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{k === 'task' ? 'Tasks' : 'Meetings & events'}</button>)}
      </div>
      <Label htmlFor="nb-record-search">Search</Label>
      <Input id="nb-record-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={kind === 'task' ? 'Task title…' : 'Event title…'} />
      {error && <p role="alert" className="nb-small">{error}</p>}
      {!records[kind] && !error && <p role="status" className="nb-small">Loading…</p>}
      {records[kind] && !shown.length && <p className="nb-small">Nothing matches.</p>}
      <ul className="nb-record-list">{shown.map(r => <li key={r.id}>
        {kind === 'task'
          ? <button type="button" onClick={() => { insertRecordLink(editor, taskHref(r.id), r.title); done(); }}><strong>{r.title}</strong><span>{[(r as TaskRecord).status === 'done' ? 'Done' : (r as TaskRecord).status === 'in-progress' ? 'In progress' : 'To do', (r as TaskRecord).due_date ? `due ${(r as TaskRecord).due_date}` : ''].filter(Boolean).join(' · ')}</span></button>
          : <span className="nb-record-event"><button type="button" onClick={() => { insertRecordLink(editor, eventHref(r.id), r.title); done(); }}><strong>{r.title}</strong><span>{eventWhen(r as EventRecord)}</span></button>
            <Button variant="ghost" onClick={() => { insertMeetingDetails(editor, r as EventRecord); done(); }}>Meeting details</Button></span>}
      </li>)}</ul>
    </div>
  </DialogContent></Dialog>;
}

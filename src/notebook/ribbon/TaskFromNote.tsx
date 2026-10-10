// Home → Create task: turn the line you're on (an action item, a to-do)
// into a real Control Point task with assignees, priority and a due date.
// The task links back to that exact line, and the line gets a link to the
// task, so either side leads to the other.
import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '../../components/ui-kit';
import { apiJson } from '../../services/api';
import { notebookPageLink } from '../pageLinks';
import { taskHref } from '../recordLinks';

type Member = { id: number; name: string };
export type TaskDraft = { title: string; blockId: string | null };

/** The line under the cursor: its text and the id of its block. */
export function currentLine(editor: Editor): TaskDraft {
  const { $from } = editor.state.selection;
  let blockId: string | null = null;
  for (let d = $from.depth; d > 0 && !blockId; d--) { const id = $from.node(d).attrs.id; if (typeof id === 'string') blockId = id; }
  return { title: $from.parent.textContent.trim().slice(0, 200), blockId };
}

/** Add " (task)" linked to the new task at the end of that line. */
export function linkLineToTask(editor: Editor, blockId: string | null, taskId: number) {
  if (!blockId || !editor.isEditable) return false;
  let end: number | null = null;
  editor.state.doc.descendants((node: PMNode, pos: number) => {
    if (end !== null) return false;
    if (node.attrs.id !== blockId) return true;
    if (node.isTextblock) { end = pos + node.nodeSize - 1; return false; }
    node.descendants((child, offset) => { if (end === null && child.isTextblock) end = pos + 1 + offset + child.nodeSize - 1; return end === null; });
    return false;
  });
  if (end === null) return false;
  return editor.chain().insertContentAt(end, [{ type: 'text', text: ' ' }, { type: 'text', text: 'task', marks: [{ type: 'link', attrs: { href: taskHref(taskId) } }] }]).run();
}

export function TaskFromNote({ editor, pageId, pageTitle, open, onOpenChange, notify }: { editor: Editor; pageId: number; pageTitle: string; open: boolean; onOpenChange: (open: boolean) => void; notify: (message: string) => void }) {
  const [draft, setDraft] = useState<TaskDraft>({ title: '', blockId: null });
  const [members, setMembers] = useState<Member[]>([]);
  const [assignees, setAssignees] = useState<number[]>([]);
  const [priority, setPriority] = useState('medium');
  const [due, setDue] = useState(''), [time, setTime] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // After a failed attempt the task may still have been created (the answer
  // got lost). The attempted request is kept as sent, the form is locked, and
  // a retry first looks for that exact task (by its reference) so it is never
  // made twice and later edits can't be silently dropped.
  const attempted = useRef<{ title: string; description: string; body: string; blockId: string | null } | null>(null);
  const locked = attempted.current !== null;
  useEffect(() => {
    if (!open) return;
    setDraft(currentLine(editor)); attempted.current = null; setAssignees([]); setPriority('medium'); setDue(''); setTime(''); setError('');
    const abort = new AbortController();
    apiJson<Member[]>('/api/members', { cache: 'no-store', signal: abort.signal }).then(list => { if (!abort.signal.aborted) setMembers(Array.isArray(list) ? list : []); }).catch(() => undefined);
    return () => abort.abort();
  }, [open, editor]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || busy) return;
    setBusy(true); setError('');
    try {
      let request = attempted.current, existing: { id: number } | undefined;
      if (request) {
        // A failed lookup throws: without proof the task doesn't exist, don't post it again.
        const tasks = await apiJson<{ id: number; title: string; description?: string | null }[]>('/api/tasks', { cache: 'no-store' });
        existing = (Array.isArray(tasks) ? tasks : []).find(t => t.title === request!.title && t.description === request!.description);
      } else {
        const source = `${window.location.origin}${notebookPageLink(pageId, draft.blockId)}`;
        const ref = Math.random().toString(36).slice(2, 10);
        const title = draft.title.trim(), description = `From the notebook page “${pageTitle || 'Untitled'}”: ${source} (ref ${ref})`;
        request = { title, description, blockId: draft.blockId, body: JSON.stringify({
          title, description, assignee_ids: assignees, priority, ...(due ? { due_date: due, ...(time ? { due_time: time } : {}) } : {}),
        }) };
        attempted.current = request;
      }
      const created = existing ?? await apiJson<{ id: number }>('/api/tasks', { method: 'POST', body: request.body });
      attempted.current = null;
      const linked = linkLineToTask(editor, request.blockId, created.id);
      notify(linked ? 'Task created and linked on this line.' : 'Task created. The line changed, so add a link to it from Insert → Task or meeting.');
      onOpenChange(false);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Could not create the task.'} It may have been saved anyway, so the details are locked: Retry checks for it first.`);
    } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}><DialogContent>
    <DialogHeader><DialogTitle>Create a task</DialogTitle><DialogDescription>The task links back to this line, and this line links to the task.</DialogDescription></DialogHeader>
    <form className="nb-form" onSubmit={submit}>
      <Label htmlFor="nb-task-title">Task</Label>
      <fieldset disabled={locked} className="contents">
      <Input id="nb-task-title" required maxLength={200} value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
      <Label htmlFor="nb-task-assignees">Assign to</Label>
      <select id="nb-task-assignees" multiple size={Math.min(5, Math.max(2, members.length))} value={assignees.map(String)} onChange={e => setAssignees([...e.target.selectedOptions].map(o => Number(o.value)))}>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <Label htmlFor="nb-task-priority">Priority</Label>
      <select id="nb-task-priority" value={priority} onChange={e => setPriority(e.target.value)}>{['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select>
      <Label htmlFor="nb-task-due">Due date</Label>
      <Input id="nb-task-due" type="date" value={due} onChange={e => { setDue(e.target.value); if (!e.target.value) setTime(''); }} />
      <Label htmlFor="nb-task-time">Due time</Label>
      <Input id="nb-task-time" type="time" disabled={!due} value={time} onChange={e => setTime(e.target.value)} />
      </fieldset>
      {error && <p role="alert" className="text-rose-500">{error}</p>}
      <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy || !draft.title.trim()}>{busy ? 'Creating…' : locked ? 'Retry' : 'Create task'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

// A task's discussion and history on its sheet: comments and what changed,
// oldest first, with a comment box. Mention people with @First or
// @[Full Name]; everyone following the task is notified. Live: a comment
// anywhere reloads the timeline of the open task.
import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { History, Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { Button, Label, Textarea } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';
import { describeActivity } from '../../../utils/taskActivityText';
import { MemberAvatar } from './AssigneePicker';

export interface Timeline {
  comments: { id: number; member_id: number | null; author_name: string | null; body: string; created_at: string; edited_at: string | null; deleted_at: string | null }[];
  activity: { id: number; member_id: number | null; kind: string; detail: any; created_at: string }[];
  watchers: number[];
  watching: boolean;
}

/** Load (and keep fresh) a task's timeline. `key` changes when the task itself changes. */
export function useTaskTimeline(taskId: number | null, key: string) {
  const [data, setData] = useState<Timeline | null>(null);
  // The task shown now: a reply for a task you've since left is dropped.
  const current = useRef(taskId);
  current.current = taskId;
  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/timeline`);
      if (!res.ok) return;
      const body = await res.json();
      if (current.current === taskId) setData(body);
    } catch { /* offline: keep what we have */ }
  }, [taskId]);
  useEffect(() => { setData(null); }, [taskId]);
  useEffect(() => { void load(); }, [load, key]);
  useEffect(() => {
    const onEvent = (e: Event) => { if (Number((e as CustomEvent).detail?.taskId) === taskId) void load(); };
    window.addEventListener('task-timeline', onEvent);
    return () => window.removeEventListener('task-timeline', onEvent);
  }, [taskId, load]);
  return { data, reload: load, setData };
}

export function TaskTimeline({ taskId, timeline, reload, members, currentUserId, canModerate }: {
  taskId: number;
  timeline: Timeline | null;
  reload: () => Promise<void>;
  members: any[];
  currentUserId?: number;
  canModerate: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const memberById = new Map(members.map((m: any) => [Number(m.id), m]));
  const nameOf = (id: number | null | undefined) => (id != null && memberById.get(Number(id))?.name) || 'Someone';

  const post = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      if (!res.ok) { notify((await res.json().catch(() => ({})))?.error || 'Could not post the comment.', 'error'); return; }
      setDraft('');
      await reload();
    } finally {
      setPosting(false);
    }
  };
  const saveEdit = async () => {
    if (!editing?.body.trim()) return;
    const res = await apiFetch(`/api/tasks/${taskId}/comments/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: editing.body }) });
    if (!res.ok) { notify((await res.json().catch(() => ({})))?.error || 'Could not save the comment.', 'error'); return; }
    setEditing(null);
    await reload();
  };
  const remove = async (id: number) => {
    const res = await apiFetch(`/api/tasks/${taskId}/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) { notify((await res.json().catch(() => ({})))?.error || 'Could not delete the comment.', 'error'); return; }
    await reload();
  };

  const entries = [
    ...(timeline?.comments ?? []).map((c) => ({ at: c.created_at, type: 'comment' as const, c })),
    ...(timeline?.activity ?? []).map((a) => ({ at: a.created_at, type: 'activity' as const, a })),
  ].sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : format(d, 'MMM d, h:mm a'); };

  return (
    <section aria-label="Comments and activity" className="space-y-3">
      <Label className="block">Activity</Label>
      {!timeline ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => e.type === 'activity' ? (
            <li key={`a-${e.a.id}`} className="flex items-start gap-2 text-xs text-muted-foreground">
              <History className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{describeActivity(e.a, nameOf)} · {when(e.a.created_at)}</span>
            </li>
          ) : (
            <li key={`c-${e.c.id}`} className="flex items-start gap-2.5">
              <MemberAvatar member={memberById.get(Number(e.c.member_id)) ?? { name: e.c.author_name || '?' }} className="size-7" />
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{e.c.author_name || nameOf(e.c.member_id)}</span>
                  <span>{when(e.c.created_at)}{e.c.edited_at && !e.c.deleted_at ? ' · edited' : ''}</span>
                  {!e.c.deleted_at && (Number(e.c.member_id) === currentUserId || canModerate) && editing?.id !== e.c.id && (
                    <span className="ml-auto flex gap-1">
                      {Number(e.c.member_id) === currentUserId && (
                        <button type="button" aria-label="Edit comment" onClick={() => setEditing({ id: e.c.id, body: e.c.body })} className="rounded p-0.5 hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
                      )}
                      <button type="button" aria-label="Delete comment" onClick={() => void remove(e.c.id)} className="rounded p-0.5 hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </span>
                  )}
                </p>
                {e.c.deleted_at ? (
                  <p className="mt-1 text-sm italic text-muted-foreground">Comment deleted</p>
                ) : editing?.id === e.c.id ? (
                  <div className="mt-1.5 space-y-2">
                    <Textarea value={editing.body} onChange={(ev) => setEditing({ id: e.c.id, body: ev.target.value })} aria-label="Edit comment" className="min-h-16" />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => void saveEdit()} disabled={!editing.body.trim()}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{e.c.body}</p>
                )}
              </div>
            </li>
          ))}
          {!entries.length && <li className="text-sm text-muted-foreground">No comments yet.</li>}
        </ol>
      )}
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void post(); }}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void post(); } }}
          placeholder="Leave a comment… (@ a name to mention someone)"
          aria-label="Comment"
          className="min-h-20"
          maxLength={4000}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to post. Everyone following this task is notified.</p>
          <Button type="submit" size="sm" disabled={!draft.trim() || posting}>{posting ? <Loader2 className="animate-spin" /> : <Send />} Comment</Button>
        </div>
      </form>
    </section>
  );
}

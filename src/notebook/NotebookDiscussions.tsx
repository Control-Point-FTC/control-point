import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { apiJson } from '../services/api';
import { Button } from '../components/ui-kit';
import { confirmDialog } from '../components/dialog';
import type { NotebookSync } from './NotebookSync';
import { useSearchParams } from 'react-router-dom';

export type CommentAnchor = { kind: 'page' | 'block' | 'text' | 'canvas' | 'image' | 'pdf'; targetId?: string; quote?: string; start?: number; end?: number };
type Comment = { id: number; author: string; body: string; deleted: boolean; createdAt: string; editedAt: string | null; canEdit: boolean; canDelete: boolean; mentions: number[] };
type Thread = { id: number; anchor: CommentAnchor; orphaned: boolean; resolved: boolean; comments: Comment[]; commentsBefore: number | null };
type Threads = { items: Thread[]; next: number | null; canComment: boolean };
export function selectionCommentAnchor(editor: Editor | null): CommentAnchor {
  if (!editor) return { kind: 'page' };
  const { $from, $to, empty } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth), id = node.attrs.id;
    if (!id) continue;
    if (!empty && $from.sameParent($to) && depth === $from.depth) return { kind: 'text', targetId: id, start: $from.parentOffset, end: $to.parentOffset, quote: editor.state.doc.textBetween($from.pos, $to.pos, ' ').slice(0, 500) };
    return { kind: 'block', targetId: id };
  }
  return { kind: 'page' };
}
export function NotebookDiscussions({ sync, editor }: { sync: NotebookSync; editor: Editor | null }) {
  const [params] = useSearchParams();
  const highlightedThread = Number(params.get('thread'));
  const [threads, setThreads] = useState<Threads>({ items: [], next: null, canComment: false });
  const [olderComments, setOlderComments] = useState<Record<number, { items: Comment[]; next: number | null }>>({});
  const expandedThreads = useRef(new Set<number>());
  const loadedThrough = useRef<number | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string }[]>([]);
  const [body, setBody] = useState(''), [reply, setReply] = useState<number | null>(null), [editing, setEditing] = useState<Comment | null>(null);
  const [anchor, setAnchor] = useState<CommentAnchor>({ kind: 'page' });
  const [recipients, setRecipients] = useState<number[]>([]), [memberQuery, setMemberQuery] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [showResolved, setShowResolved] = useState(false);
  const base = `/api/notebook/pages/${sync.pageId}`;
  const headers = sync.scope ? { 'X-CP-Notebook-Team': String(sync.scope.teamId) } : undefined;
  const request = <T,>(path: string, options: RequestInit = {}) => apiJson<T>(`${base}${path}`, { ...options, headers, cache: 'no-store' });
  const threadPath = Number.isSafeInteger(highlightedThread) && highlightedThread > 0 ? `/threads?thread=${highlightedThread}` : '/threads';
  const loadedRange = async (path: string, signal?: AbortSignal) => {
    const first = await request<Threads>(path, { signal });
    const byId = new Map(first.items.map(t => [t.id, t])); let next = first.next;
    // Refresh every explicitly loaded page, including older roots and replies.
    // Responses stay bounded to the server's 30-thread pages.
    for (let page = 0; page < 34 && loadedThrough.current && next && next >= loadedThrough.current; page++) {
      const more = await request<Threads>(`/threads?before=${next}`, { signal });
      more.items.forEach(t => byId.set(t.id, t)); next = more.next;
    }
    return { ...first, items: [...byId.values()].sort((a,b) => b.id-a.id), next };
  };
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      try {
        const [value, people] = await Promise.all([loadedRange(threadPath, abort.signal), request<typeof members>('/mention-members', { signal: abort.signal })]);
        const expanded: Record<number, { items: Comment[]; next: number | null }> = {};
        for (const id of expandedThreads.current) expanded[id] = await request(`/threads/${id}/comments?limit=100`, { signal: abort.signal });
        if (!abort.signal.aborted) { setThreads(value); setMembers(people); setOlderComments(expanded); }
      } catch (e) { if (!abort.signal.aborted) { setThreads({ items: [], next: null, canComment: false }); setMembers([]); setOlderComments({}); expandedThreads.current.clear(); setError(e instanceof Error ? e.message : 'Cannot load comments'); } }
    };
    void load(); const timer = setInterval(() => { if (!document.querySelector('.nb-discussions textarea:focus')) void load(); }, 5000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [sync, threadPath]);
  const refresh = async (focus?: number) => {
    const value = await loadedRange(focus ? `/threads?thread=${focus}` : threadPath);
    if (focus && expandedThreads.current.has(focus)) { const expanded = await request<{ items: Comment[]; next: number | null }>(`/threads/${focus}/comments?limit=100`); setOlderComments(previous => ({ ...previous, [focus]: expanded })); }
    setThreads(value);
  };
  const mutate = async (work: () => Promise<void>, focus?: number) => {
    setBusy(true); setError(''); try { await work(); await refresh(focus); } catch (e) { setError(e instanceof Error ? e.message : 'Cannot update discussion'); } finally { setBusy(false); }
  };
  const reset = () => { setBody(''); setReply(null); setEditing(null); setAnchor({ kind: 'page' }); setRecipients([]); setMemberQuery(''); };
  const submit = () => mutate(async () => {
    if (sync.pending && !await sync.flush()) throw new Error('Save the page before adding this comment. Your draft stays here.');
    await request(editing ? `/comments/${editing.id}` : '/comments', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ body, mentions: recipients, ...(reply ? { threadId: reply } : { anchor }) }) }); reset();
  }, reply ?? undefined);
  const canWrite = threads.canComment && !['conflict', 'error', 'unavailable', 'offline'].includes(sync.status);
  useEffect(() => {
    if (!Number.isSafeInteger(highlightedThread) || highlightedThread < 1) return;
    const target = document.getElementById(`notebook-thread-${highlightedThread}`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedThread, threads.items.length]);
  return <section className="nb-discussions" aria-label="Page discussions">
    <div className="nb-discussion-heading"><h2>Discussions</h2><label><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Show resolved</label></div>
    {error && <p role="alert" className="nb-alert">{error}</p>}
    {!threads.items.filter(t => showResolved || !t.resolved).length && <p>No open discussions. Add a thought or question for your team.</p>}
    {threads.items.filter(t => showResolved || !t.resolved || t.id === highlightedThread).map(t => <article key={t.id} id={`notebook-thread-${t.id}`} className={`nb-thread${t.id === highlightedThread ? ' nb-linked-block' : ''}`}>
      <div className="nb-discussion-heading"><span>{t.resolved ? 'Resolved' : 'Open'} · {t.anchor.kind === 'page' ? 'Page discussion' : t.orphaned ? 'Original target removed' : `${t.anchor.kind} discussion`}</span>
        {canWrite && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void mutate(async () => { await request(`/threads/${t.id}/resolved`, { method: 'PUT', body: JSON.stringify({ resolved: !t.resolved }) }); }, t.id); }}>{t.resolved ? 'Reopen' : 'Resolve'}</Button>}
      </div>
      {t.anchor.quote && <blockquote>{t.anchor.quote}</blockquote>}
      {!t.orphaned && t.anchor.targetId && <Button size="sm" variant="ghost" onClick={() => editor?.view.dom.querySelector(`[data-id="${t.anchor.targetId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Go to target</Button>}
      {(olderComments[t.id] ? olderComments[t.id].next : t.commentsBefore) && <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); try {
          const more = await request<{ items: Comment[]; next: number | null }>(`/threads/${t.id}/comments?limit=100`);
          expandedThreads.current.add(t.id); setOlderComments(previous => ({ ...previous, [t.id]: more }));
        } catch (e) { setError(e instanceof Error ? e.message : 'Cannot load earlier replies'); } finally { setBusy(false); }
      }}>Earlier replies</Button>}
      {[...(olderComments[t.id]?.items ?? []).filter(c => !t.comments.some(latest => latest.id === c.id)), ...t.comments].map(c => <div className="nb-comment" key={c.id}>
        <div><strong>{c.author}</strong> <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{new Date(c.createdAt).toLocaleDateString()}</time>{c.editedAt && <span> · edited</span>}</div>
        <p>{c.deleted ? 'Comment deleted' : c.body}</p>
        {canWrite && c.canEdit && <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setBody(c.body); setRecipients(c.mentions); setReply(t.id); }}>Edit</Button>}
        {c.canDelete && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
          if (await confirmDialog({ title: 'Delete comment?', message: 'The comment will be removed, while replies stay in the discussion.', confirmLabel: 'Delete', danger: true })) void mutate(async () => { await request(`/comments/${c.id}`, { method: 'DELETE' }); setOlderComments(previous => ({ ...previous, [t.id]: { next: previous[t.id]?.next ?? null, items: (previous[t.id]?.items ?? []).map(item => item.id === c.id ? { ...item, deleted: true, body: '', canDelete: false, canEdit: false } : item) } })); }, t.id);
        }}>Delete</Button>}
      </div>)}
      {canWrite && !t.resolved && <Button size="sm" variant="outline" onClick={() => { reset(); setReply(t.id); document.getElementById(`nb-comment-input-${sync.pageId}`)?.focus(); }}>Reply</Button>}
    </article>)}
    {threads.next && <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); try { const more = await request<Threads>(`/threads?before=${threads.next}`); if (more.items.length) loadedThrough.current = Math.min(...more.items.map(t => t.id)); setThreads(value => ({ ...more, items: [...new Map([...value.items, ...more.items].map(t => [t.id,t])).values()].sort((a,b)=>b.id-a.id) })); }
      catch (e) { setError(e instanceof Error ? e.message : 'Cannot load older discussions'); } finally { setBusy(false); }
    }}>Older discussions</Button>}
    {canWrite ? <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <label htmlFor={`nb-comment-input-${sync.pageId}`}>{editing ? 'Edit comment' : reply ? 'Reply to discussion' : 'New discussion'}</label>
      {!reply && !editing && <div><Button type="button" size="sm" variant="ghost" onClick={() => setAnchor(selectionCommentAnchor(editor))}>Anchor to selected text or block</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAnchor({ kind: 'page' })}>Discuss whole page</Button><span>{anchor.kind === 'page' ? 'Whole page' : anchor.quote || 'Selected block'}</span></div>}
      <textarea id={`nb-comment-input-${sync.pageId}`} value={body} maxLength={10_000} rows={3} required onChange={e => setBody(e.target.value)} placeholder="Share a thought with your team…" />
      <details><summary>Mention teammates{recipients.length ? ` (${recipients.length})` : ''}</summary>
        <input aria-label="Find teammate to mention" placeholder="Search teammates" value={memberQuery} onChange={e => setMemberQuery(e.target.value)} />
        <div className="nb-mention-members">{members.filter(m => m.name.toLowerCase().includes(memberQuery.toLowerCase())).map(m => <label key={m.id}><input type="checkbox" checked={recipients.includes(m.id)} onChange={e => setRecipients(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} />{m.name}</label>)}</div>
      </details>
      <Button type="submit" disabled={busy || !body.trim()}>{editing ? 'Save comment' : reply ? 'Post reply' : 'Post discussion'}</Button>
      {(reply || editing || body) && <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>}
    </form> : <p>Comments require notebook editing permission and an online connection.</p>}
  </section>;
}

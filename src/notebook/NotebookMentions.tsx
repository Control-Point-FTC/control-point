import React, { useEffect, useState } from 'react';
import { AtSign } from 'lucide-react';
import { apiJson } from '../services/api';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui-kit';
import type { CommentAnchor } from './NotebookDiscussions';
type Mention = { commentId: number; threadId: number; pageId: number; title: string; snippet: string; anchor: CommentAnchor; createdAt: string; read: boolean };
export function NotebookMentions({ teamId, visiblePageIds, onNavigate }: { teamId: number; visiblePageIds: number[]; onNavigate: (pageId: number, blockId?: string, threadId?: number) => Promise<boolean> }) {
  const [mentions, setMentions] = useState<Mention[]>([]), [open, setOpen] = useState(false), [error, setError] = useState('');
  const headers = { 'X-CP-Notebook-Team': String(teamId) };
  useEffect(() => {
    const abort = new AbortController();
    const load = () => { void apiJson<Mention[]>('/api/notebook/mentions', { cache: 'no-store', signal: abort.signal, headers }).then(items => { if (!abort.signal.aborted) setMentions(items); }).catch(e => { if (!abort.signal.aborted) { setMentions([]); setError(e instanceof Error ? e.message : 'Cannot load mentions'); } }); };
    load(); const timer = setInterval(load, 5000);
    return () => { clearInterval(timer); abort.abort(); };
  }, [teamId]);
  const visible = mentions.filter(m => visiblePageIds.includes(m.pageId)), unread = visible.filter(m => !m.read).length;
  return <><Button variant="ghost" aria-label={`Notebook mentions${unread ? `, ${unread} unread` : ''}`} title="Mentions" onClick={() => setOpen(true)}><AtSign size={16} /><span className="nb-mentions-label">Mentions</span>{unread ? <span className="nb-mentions-count">{unread}</span> : null}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Notebook mentions</DialogTitle><DialogDescription>Discussions mentioning you in pages you can currently access.</DialogDescription></DialogHeader>
      {error && <p role="alert">{error}</p>}
      <div className="nb-mention-inbox">{visible.length ? visible.map(m => <Button key={m.commentId} variant="ghost" className="nb-mention-item" onClick={async () => {
        try {
          // Recheck access before navigating or exposing an anchor from a stale
          // notification list after a protection change.
          await apiJson(`/api/notebook/mentions/${m.commentId}/read`, { method: 'PUT', cache: 'no-store', headers });
          if (!await onNavigate(m.pageId, m.anchor.targetId, m.threadId)) return;
          setMentions(items => items.map(item => item.commentId === m.commentId ? { ...item, read: true } : item)); setOpen(false);
        } catch (e) { setMentions(items => items.filter(item => item.commentId !== m.commentId)); setError(e instanceof Error ? e.message : 'This discussion is unavailable'); }
      }}><strong>{!m.read && '● '}{m.title}</strong><span>{m.snippet}</span><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time></Button>) : <p>No visible mentions yet.</p>}</div>
    </DialogContent></Dialog>
  </>;
}

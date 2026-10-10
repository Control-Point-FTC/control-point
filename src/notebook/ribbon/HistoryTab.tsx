// History: page versions (the existing panel), the notebook recycle bin,
// Recent Edits, Find by Author and Mark as Read. Every list comes from the
// server filtered to pages this member may see; read state is personal.
import React, { useRef, useState } from 'react';
import { apiJson } from '../../services/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui-kit';
import { useNotebookWorkspace } from '../workspaceContext';
import { RibbonButton, RibbonGroup, RibbonItem, RibbonMenu, RibbonSplit } from './RibbonParts';

type Edit = { id: number; sectionId: number; title: string; at: string; authorId: number | null; authorName: string };
type Author = { id: number; name: string; pages: number };
const RANGES: [string, number | null][] = [['Today', 0], ['Since yesterday', 1], ['Last 7 days', 7], ['Last 14 days', 14], ['Last 30 days', 30], ['Last 6 months', 182], ['All pages', null]];

function since(days: number | null): string {
  if (days === null) return new Date(0).toISOString();
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - days); return d.toISOString();
}
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function HistoryTab({ versions, pageId, notify }: { versions: React.ReactNode; pageId: number; notify: (message: string) => void }) {
  const workspace = useNotebookWorkspace();
  const [list, setList] = useState<{ title: string; edits: Edit[] | null; error?: string } | null>(null);
  const [authors, setAuthors] = useState<Author[] | null>(null);
  const headers = workspace?.teamId ? { 'X-CP-Notebook-Team': String(workspace.teamId) } : undefined;
  const sectionId = workspace?.tree?.pages.find(p => p.id === pageId)?.sectionId;
  const notebookId = workspace?.tree?.sections.find(s => s.id === sectionId)?.notebookId;

  // Only the latest request may change the dialog; closing it cancels the rest.
  const request = useRef<AbortController | null>(null);
  const begin = () => { request.current?.abort(); request.current = new AbortController(); return request.current; };
  const close = () => { request.current?.abort(); request.current = null; setList(null); setAuthors(null); };
  const showEdits = async (title: string, query: string) => {
    const call = begin();
    setList({ title, edits: null });
    try { const edits = await apiJson<Edit[]>(`/api/notebook/recent?${query}`, { headers, cache: 'no-store', signal: call.signal }); if (!call.signal.aborted) setList({ title, edits }); }
    catch (e) { if (!call.signal.aborted) setList({ title, edits: [], error: e instanceof Error ? e.message : 'Could not load recent edits.' }); }
  };
  const findByAuthor = async () => {
    const call = begin();
    setAuthors(null); setList({ title: 'Find by author', edits: [] });
    try { const people = await apiJson<Author[]>('/api/notebook/authors', { headers, cache: 'no-store', signal: call.signal }); if (!call.signal.aborted) setAuthors(people); }
    catch (e) { if (!call.signal.aborted) setList({ title: 'Find by author', edits: [], error: e instanceof Error ? e.message : 'Could not load authors.' }); }
  };
  const mark = async (target: Record<string, unknown>, read: boolean, done: string) => {
    try { await apiJson('/api/notebook/read', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...target, read }) }); workspace?.refreshTree(); notify(done); }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not update read state.'); }
  };

  return <>
    <RibbonGroup label="Page versions">{versions}</RibbonGroup>
    <RibbonGroup label="Recycle bin">
      <RibbonButton label="Notebook recycle bin" icon="Trash" showLabel disabled={!workspace} onClick={() => workspace?.openTrash()} />
    </RibbonGroup>
    <RibbonGroup label="Changes">
      <RibbonMenu label="Recent edits" icon="Recent" showLabel disabled={!workspace}>
        {RANGES.map(([label, days]) => <RibbonItem key={label} onSelect={() => { void showEdits(`Recent edits · ${label.toLowerCase()}`, `since=${encodeURIComponent(since(days))}`); }}>{label}</RibbonItem>)}
      </RibbonMenu>
      <RibbonButton label="Find by author" icon="Author" showLabel disabled={!workspace} onClick={() => { void findByAuthor(); }} />
    </RibbonGroup>
    <RibbonGroup label="Unread">
      <RibbonSplit label="Mark as read" icon="Read" showLabel menuLabel="Mark as read options" disabled={!workspace} onClick={() => { void mark({ pageIds: [pageId] }, true, 'Page marked as read.'); }}>
        <RibbonItem onSelect={() => { void mark({ pageIds: [pageId] }, true, 'Page marked as read.'); }}>Mark page as read</RibbonItem>
        <RibbonItem onSelect={() => { void mark({ pageIds: [pageId] }, false, 'Page marked as unread.'); }}>Mark page as unread</RibbonItem>
        {sectionId && <RibbonItem onSelect={() => { void mark({ sectionId }, true, 'Section marked as read.'); }}>Mark section as read</RibbonItem>}
        {notebookId && <RibbonItem onSelect={() => { void mark({ notebookId }, true, 'Notebook marked as read.'); }}>Mark notebook as read</RibbonItem>}
      </RibbonSplit>
    </RibbonGroup>
    <Dialog open={!!list} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{list?.title}</DialogTitle><DialogDescription>Only pages you can open are listed.</DialogDescription></DialogHeader>
        {authors && <label className="nb-rfield">Person <select className="nb-rselect" defaultValue="" onChange={e => { const a = authors.find(x => x.id === Number(e.target.value)); if (a) void showEdits(`Pages changed by ${a.name}`, `author=${a.id}&since=${encodeURIComponent(since(null))}`).then(() => setAuthors(authors)); }}>
          <option value="" disabled>Choose a person…</option>{authors.map(a => <option key={a.id} value={a.id}>{a.name} · {a.pages} {a.pages === 1 ? 'page' : 'pages'}</option>)}
        </select></label>}
        {list?.error && <p role="alert" className="nb-small">{list.error}</p>}
        {list?.edits === null && <p role="status" className="nb-small">Loading…</p>}
        {list?.edits && !list.error && <ul className="nb-edit-list" aria-label={list.title}>
          {list.edits.length === 0 && !authors && <li className="nb-small">No changes in this period.</li>}
          {list.edits.map(e => <li key={e.id}><button type="button" onClick={() => { workspace?.openPage(e.id); close(); }}>
            <strong>{e.title}</strong><span>{workspace?.tree?.sections.find(s => s.id === e.sectionId)?.title} · {e.authorName} · {when(e.at)}</span>
          </button></li>)}
        </ul>}
      </DialogContent>
    </Dialog>
  </>;
}

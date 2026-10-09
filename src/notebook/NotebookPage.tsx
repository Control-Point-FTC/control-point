import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useMatch } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronRight, FileText, Folder, Lock, MoreHorizontal, PanelLeft, Plus, Search, Star } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui-kit';
import { apiJson } from '../services/api';
import { NotebookEditor, downloadNotebookJSON } from './NotebookEditor';
import { NotebookSync } from './NotebookSync';
import type { NotebookTree, NotebookPageItem } from './types';
import './notebook.css';
import { NOTEBOOK_TEMPLATES, notebookTemplate } from './templates';
import { notebookDrop, notebookSiblings, type NotebookDrag } from './treeActions';
import { notebookPageLink } from './pageLinks';
import { registerNotebookSession } from './notebookRuntime';

type Kind = 'notebook' | 'section' | 'page';
type Item = { id: number; title: string; color?: string | null; protected?: boolean; ownProtected?: boolean; sectionId?: number; parentId?: number | null; notebookId?: number };
type EditDialog = { action: 'create' | 'rename' | 'delete' | 'move'; kind: Kind; item?: Item; sectionId?: number; parentId?: number; notebookId?: number };
const plural = { notebook: 'notebooks', section: 'sections', page: 'pages' };
const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
function readPreference(key: string): number[] { try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter(Number.isSafeInteger) : []; } catch { return []; } }
function savePreference(key: string, value: number[]) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage optional */ } }

export function NotebookPage({ activeTeamId, currentUserId }: { activeTeamId?: number | null; currentUserId?: number }) {
  // A team change unmounts every document/pending request before the new tree.
  return <TeamNotebook key={`${currentUserId}:${activeTeamId ?? 'none'}`} teamId={activeTeamId} memberId={currentUserId} />;
}
function TeamNotebook({ teamId, memberId }: { teamId?: number | null; memberId?: number }) {
  const [params, setParams] = useSearchParams();
  const pageRoute = useMatch('/notebook/p/:pageId');
  const selected = Number(params.get('page') ?? pageRoute?.params.pageId) || null;
  const [tree, setTree] = useState<NotebookTree | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<NotebookDrag | null>(null);
  const [drop, setDrop] = useState<{ kind: Kind; id: number; zone: 'before' | 'inside' | 'after' } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<EditDialog | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [color, setColor] = useState('#3b82f6');
  const [targetSection, setTargetSection] = useState('');
  const [targetParent, setTargetParent] = useState('');
  const [targetBook, setTargetBook] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<(NotebookPageItem & { snippet: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState('all');
  const starKey = `cp-notebook-stars:${memberId}:${teamId}`;
  const collapsedKey = `cp-notebook-open:${memberId}:${teamId}`;
  const [stars, setStars] = useState(() => readPreference(starKey));
  const [collapsed, setCollapsed] = useState(() => readPreference(collapsedKey));
  const [sync, setSync] = useState<NotebookSync | null>(null);
  const syncRef = useRef<NotebookSync | null>(null);
  useEffect(() => sync ? registerNotebookSession(sync) : undefined, [sync]);
  const mounted = useRef(true);
  const loadTree = useCallback(async () => {
    try {
      const value = await apiJson<NotebookTree>('/api/notebook/tree', { cache: 'no-store' });
      if (!mounted.current) return;
      setTree(value);
      const current = syncRef.current;
      if (current && !value.pages.some(p => p.id === current.pageId)) {
        current.destroy(); syncRef.current = null; setSync(null); setError('This page is no longer available.');
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Cannot load notebooks'); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (teamId) void loadTree();
    const timer = setInterval(() => { if (teamId) void loadTree(); }, 5000);
    return () => { mounted.current = false; clearInterval(timer); void syncRef.current?.release(); syncRef.current = null; };
  }, [loadTree, teamId]);
  useEffect(() => {
    if (!selected) { void syncRef.current?.release(); syncRef.current = null; setSync(null); return; }
    if (!selected || !tree?.pages.some(p => p.id === selected)) return;
    if (syncRef.current?.pageId === selected) return;
    void syncRef.current?.release();
    const next = new NotebookSync(selected, memberId && teamId ? { memberId, teamId } : undefined);
    syncRef.current = next; setSync(next);
    void next.start();
  }, [selected, tree]);
  useEffect(() => {
    if (!query.trim()) { setHits([]); setSearching(false); return; }
    const abort = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void apiJson<typeof hits>(`/api/notebook/search?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store', signal: abort.signal }).then(setHits).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query]);
  const leave = async () => {
    const current = syncRef.current;
    if (current?.pending && !await current.flush()) { setError('Your changes have not reached the server. Reconnect or download recovery changes before leaving this page.'); return false; }
    return true;
  };
  const pick = async (id: number, blockId?: string) => { if (!await leave()) return; setParams({ page: String(id), ...(blockId ? { block: blockId } : {}) }); setDrawer(false); setError(''); };
  const onTitle = useCallback((title: string) => { const id = syncRef.current?.pageId; setTree(t => t ? { ...t, pages: t.pages.map(p => p.id === id ? { ...p, title } : p) } : t); }, []);
  const open = (value: EditDialog) => {
    setName(value.action === 'create' ? '' : value.item?.title ?? ''); setColor(value.item?.color ?? '#3b82f6');
    setTemplate('blank');
    setTargetBook(String(value.notebookId ?? value.item?.notebookId ?? tree?.notebooks[0]?.id ?? ''));
    setTargetSection(String(value.sectionId ?? value.item?.sectionId ?? tree?.sections[0]?.id ?? ''));
    setTargetParent(value.parentId ? String(value.parentId) : ''); setDialog(value); setError('');
  };
  const mutate = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); await loadTree(); setDialog(null); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Notebook action failed'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!dialog || !await leave()) return;
    const { action, kind, item } = dialog;
    await mutate(async () => {
      const base = `/api/notebook/${plural[kind]}`;
      if (action === 'delete') { await apiJson(`${base}/${item!.id}`, { method: 'DELETE' }); if (kind === 'page' && item?.id === selected) { syncRef.current?.destroy(); syncRef.current = null; setSync(null); setParams({}); } }
      if (action === 'create') {
        const res = await apiJson(`${base}`, { method: 'POST', body: JSON.stringify({ title: name, color: kind !== 'page' ? color : undefined, notebookId: Number(targetBook), sectionId: Number(targetSection), parentId: dialog.parentId ?? null, content: kind === 'page' ? notebookTemplate(template) : undefined }) });
        if (kind === 'page') { setParams({ page: String(res.id) }); setDrawer(false); }
      }
      if (action === 'rename') {
        if (kind === 'page' && syncRef.current?.pageId === item!.id) { syncRef.current.doc.getMap('meta').set('title', name.trim()); if (!await syncRef.current.flush()) throw new Error('Title has not been saved yet'); }
        else if (kind === 'page') { const p = await apiJson(`${base}/${item!.id}`, { cache: 'no-store' }); await apiJson(`${base}/${item!.id}`, { method: 'PUT', body: JSON.stringify({ title: name, baseRevision: p.revision }) }); }
        else await apiJson(`${base}/${item!.id}`, { method: 'PATCH', body: JSON.stringify({ title: name, color }) });
      }
      if (action === 'move') await apiJson('/api/notebook/move', { method: 'POST', body: JSON.stringify({ kind, id: item!.id, to: kind === 'section' ? { notebookId: Number(targetBook) } : { sectionId: Number(targetSection), parentId: targetParent ? Number(targetParent) : null }, index: 0 }) });
    });
  };
  const toggleStar = (id: number) => { const value = stars.includes(id) ? stars.filter(n => n !== id) : [...stars, id]; setStars(value); savePreference(starKey, value); };
  const toggleCollapse = (id: number) => { const value = collapsed.includes(id) ? collapsed.filter(n => n !== id) : [...collapsed, id]; setCollapsed(value); savePreference(collapsedKey, value); };
  const reorder = async (kind: Kind, item: Item, direction: -1 | 1) => {
    if (!tree || !await leave()) return;
    const siblings = notebookSiblings(tree, { kind, id: item.id }); const index = siblings.indexOf(item.id) + direction;
    if (index < 0 || index >= siblings.length) return;
    await mutate(() => apiJson('/api/notebook/move', { method: 'POST', body: JSON.stringify({ kind, id: item.id, to: {}, index }) }));
    setAnnouncement(`${item.title} moved to position ${index + 1} of ${siblings.length}`);
  };
  const rowEvents = (kind: Kind, item: Item): React.HTMLAttributes<HTMLDivElement> => ({
    draggable: !!tree?.permissions.organize && !busy,
    onDragStart: e => { setDragging({ kind, id: item.id }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-cp-notebook', JSON.stringify({ kind, id: item.id })); },
    onDragEnd: () => { setDragging(null); setDrop(null); },
    onDragOver: e => {
      if (!dragging) return; e.preventDefault(); e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect(); const fraction = (e.clientY - rect.top) / rect.height;
      const zone = kind === 'notebook' && dragging.kind === 'section' || kind === 'section' && dragging.kind === 'page' ? 'inside' : fraction < .25 ? 'before' : fraction > .75 ? 'after' : kind === 'page' && dragging.kind === 'page' ? 'inside' : fraction < .5 ? 'before' : 'after';
      setDrop({ kind, id: item.id, zone });
    },
    onDrop: e => {
      e.preventDefault(); e.stopPropagation();
      const source = dragging, destination = drop; setDragging(null); setDrop(null);
      if (!tree || !source || !destination || !tree.permissions.organize) return;
      void (async () => {
        if (!await leave()) return;
        try { const { to, index } = notebookDrop(tree, source, destination, destination.zone); await mutate(() => apiJson('/api/notebook/move', { method: 'POST', body: JSON.stringify({ kind: source.kind, id: source.id, to, index }) })); }
        catch (e) { setError(e instanceof Error ? e.message : 'Cannot move this item'); }
      })();
    },
    onKeyDown: e => {
      if ((e.target as HTMLElement).closest('button[data-nb-focus]') == null) return;
      if (e.altKey && e.shiftKey && ['ArrowUp','ArrowDown'].includes(e.key) && tree?.permissions.organize) { e.preventDefault(); void reorder(kind, item, e.key === 'ArrowUp' ? -1 : 1); return; }
      if (e.key === 'F2' && (kind === 'page' ? tree?.permissions.edit : tree?.permissions.organize)) { e.preventDefault(); open({ action: 'rename', kind, item }); return; }
      if (e.key === 'Delete' && tree?.permissions.delete) { e.preventDefault(); open({ action: 'delete', kind, item }); return; }
      if (kind === 'section' && ['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); if (collapsed.includes(item.id) !== (e.key === 'ArrowLeft')) toggleCollapse(item.id); return; }
      if (['ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
        e.preventDefault();
        const root = e.currentTarget.closest('.nb-tree-scroll'); const nodes = Array.from(root?.querySelectorAll<HTMLButtonElement>('button[data-nb-focus]') ?? []);
        const current = nodes.indexOf(e.target as HTMLButtonElement);
        nodes[e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : Math.min(nodes.length - 1, Math.max(0, current + (e.key === 'ArrowUp' ? -1 : 1)))]?.focus();
      }
    },
  });
  const dropClass = (kind: Kind, id: number) => drop?.kind === kind && drop.id === id ? `nb-drop-${drop.zone}` : '';
  const options = (kind: Kind, item: Item) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${item.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {kind === 'page' && <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(new URL(notebookPageLink(item.id), window.location.origin).href).then(() => setAnnouncement('Page link copied')).catch(() => setError('Clipboard unavailable')); }}>Copy page link</DropdownMenuItem>}
      {tree?.permissions.edit && kind === 'page' && <DropdownMenuItem onClick={() => open({ action: 'rename', kind, item })}>Rename page</DropdownMenuItem>}
      {tree?.permissions.organize && kind !== 'page' && <DropdownMenuItem onClick={() => open({ action: 'rename', kind, item })}>Rename / color</DropdownMenuItem>}
      {tree?.permissions.organize && kind !== 'notebook' && <DropdownMenuItem onClick={() => open({ action: 'move', kind, item })}>Move…</DropdownMenuItem>}
      {tree?.permissions.organize && <><DropdownMenuItem onClick={() => { void reorder(kind, item, -1); }}>Move up</DropdownMenuItem><DropdownMenuItem onClick={() => { void reorder(kind, item, 1); }}>Move down</DropdownMenuItem></>}
      {tree?.permissions.organize && kind === 'page' && item.parentId && <DropdownMenuItem onClick={() => { void (async () => { if (await leave()) await mutate(() => apiJson('/api/notebook/move', { method: 'POST', body: JSON.stringify({ kind, id: item.id, to: { parentId: tree.pages.find(p => p.id === item.parentId)?.parentId ?? null }, index: 0 }) })); })(); }}>Promote page</DropdownMenuItem>}
      {tree?.permissions.edit && kind === 'page' && <DropdownMenuItem onClick={() => { void (async () => { if (await leave()) await mutate(async () => { const p = await apiJson(`/api/notebook/pages/${item.id}/duplicate`, { method: 'POST', body: '{}' }); setParams({ page: String(p.id) }); }); })(); }}>Duplicate page only</DropdownMenuItem>}
      {tree?.permissions.edit && kind !== 'notebook' && <DropdownMenuItem onClick={() => open({ action: 'create', kind: 'page', sectionId: kind === 'section' ? item.id : item.sectionId, parentId: kind === 'page' ? item.id : undefined })}>Add {kind === 'page' ? 'subpage' : 'page'}</DropdownMenuItem>}
      {tree?.permissions.protect && kind !== 'notebook' && <DropdownMenuItem onClick={() => { void (async () => { if (await leave()) await mutate(() => apiJson(`/api/notebook/${plural[kind]}/${item.id}/protection`, { method: 'PUT', body: JSON.stringify({ protected: !(kind === 'page' ? item.ownProtected : item.protected) }) })); })(); }}>{(kind === 'page' ? item.ownProtected : item.protected) ? 'Remove direct admin protection' : 'Protect for admins'}</DropdownMenuItem>}
      {tree?.permissions.delete && <><DropdownMenuSeparator /><DropdownMenuItem className="text-rose-500" onClick={() => open({ action: 'delete', kind, item })}>Move to trash</DropdownMenuItem></>}
    </DropdownMenuContent></DropdownMenu>;
  const pageRows = (sectionId: number, parentId: number | null = null, depth = 0): React.ReactNode => {
    if (depth >= 6) return null;
    return tree?.pages.filter(p => p.sectionId === sectionId && p.parentId === parentId).map(p => <div key={p.id}>
      <div {...rowEvents('page', p)} className={`nb-tree-row ${selected === p.id ? 'is-selected' : ''} ${dropClass('page', p.id)}`} style={{ paddingInlineStart: `${depth * 14 + 8}px` }}>
        <button data-nb-focus className="nb-tree-label" onClick={() => { void pick(p.id); }} aria-current={selected === p.id ? 'page' : undefined}><FileText size={16} /><span>{p.title}</span>{p.protected && <Lock size={13} aria-label="Admin only" />}</button>
        <button className="nb-star" aria-label={`${stars.includes(p.id) ? 'Unpin' : 'Pin'} ${p.title}`} aria-pressed={stars.includes(p.id)} onClick={() => toggleStar(p.id)}><Star size={14} fill={stars.includes(p.id) ? 'currentColor' : 'none'} /></button>{options('page', p)}
      </div>{pageRows(sectionId, p.id, depth + 1)}
    </div>);
  };
  const explorer = <div className="nb-explorer-inner">
    <div className="nb-search"><Search size={16} /><input aria-label="Search notebook titles and typed text" placeholder="Search notes…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="nb-filters" role="group" aria-label="Notebook page filter">{[['all','Notebooks'],['recent','Recent'],['starred','Pinned']].map(([id,label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setQuery(''); }}>{label}</button>)}</div>
    <div className="nb-tree-scroll">
      {query.trim() ? <><p className="nb-small">{searching ? 'Searching typed notes…' : `${hits.length} results`}</p>{hits.map(h => <button key={h.id} className="nb-search-hit" onClick={() => { void pick(h.id); }}><strong>{h.title}</strong><span>{h.snippet}</span></button>)}</> : filter !== 'all' ? <>{(filter === 'starred' ? tree?.pages.filter(p => stars.includes(p.id)) : [...(tree?.pages ?? [])].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30))?.map(p => <div key={p.id} className="nb-tree-row"><button className="nb-tree-label" onClick={() => { void pick(p.id); }}><FileText size={16} /><span>{p.title}</span>{p.protected && <Lock size={13} />}</button>{options('page', p)}</div>)}</> : tree?.notebooks.map(book => <div key={book.id} className="nb-book">
        <div {...rowEvents('notebook', book)} className={`nb-tree-row nb-book-label ${dropClass('notebook', book.id)}`}><button data-nb-focus className="nb-tree-label" onClick={() => { if (tree.permissions.organize) open({ action: 'rename', kind: 'notebook', item: book }); }}><BookOpen size={17} style={{ color: book.color ?? undefined }} /><strong>{book.title}</strong></button>{options('notebook', book)}</div>
        {tree.sections.filter(s => s.notebookId === book.id).map(section => <div key={section.id}>
          <div {...rowEvents('section', section)} className={`nb-tree-row ${dropClass('section', section.id)}`}><button data-nb-focus className="nb-tree-label" aria-expanded={!collapsed.includes(section.id)} onClick={() => toggleCollapse(section.id)}>{collapsed.includes(section.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<Folder size={16} style={{ color: section.color ?? undefined }} /><span>{section.title}</span>{section.protected && <Lock size={13} aria-label="Admin only" />}</button>{options('section', section)}</div>
          {!collapsed.includes(section.id) && <>{pageRows(section.id)}{tree.permissions.edit && <button className="nb-add" onClick={() => open({ action: 'create', kind: 'page', sectionId: section.id })}><Plus size={14} /> New page</button>}</>}
        </div>)}
        {tree.permissions.organize && <button className="nb-add" onClick={() => open({ action: 'create', kind: 'section', notebookId: book.id })}><Plus size={14} /> New section</button>}
      </div>)}
      {!tree && <p className="nb-small">Loading notebooks…</p>}
      {tree && !tree.notebooks.length && <p className="nb-small">No notebooks yet.</p>}
    </div>
    {tree?.permissions.organize && <Button variant="outline" onClick={() => open({ action: 'create', kind: 'notebook' })}><Plus /> New notebook</Button>}
  </div>;
  if (!teamId) return <div className="nb-empty"><h1>Team notebook</h1><p>Select a workspace to open its shared notes.</p></div>;
  return <div className="nb-shell">
    <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    <header className="nb-header"><Button variant="ghost" size="icon" className="nb-mobile" aria-label="Open notebooks" onClick={() => setDrawer(true)}><PanelLeft /></Button><BookOpen size={20} /><h1>Team notebook</h1><span className="nb-small nb-desktop">Shared with your team</span>
      <div className="nb-header-actions">{tree?.permissions.edit && tree.sections.length > 0 && <Button onClick={() => open({ action: 'create', kind: 'page', sectionId: tree.pages.find(p => p.id === selected)?.sectionId ?? tree.sections[0].id })}><Plus /> New page</Button>}
      <Button variant="ghost" onClick={() => { void (async () => { if (await leave()) await mutate(async () => downloadNotebookJSON(await apiJson('/api/notebook/export', { cache: 'no-store' }), 'team-notebook.json')); })(); }}>Export</Button></div>
    </header>
    {error && <div className="nb-alert" role="alert">{error}<button aria-label="Dismiss notebook error" onClick={() => setError('')}>×</button></div>}
    <div className="nb-body"><aside className="nb-explorer nb-desktop" aria-label="Notebook explorer">{explorer}</aside><main className="nb-main">
      {sync && sync.pageId === selected ? <NotebookEditor key={sync.pageId} sync={sync} onChanged={onTitle} pages={tree?.pages ?? []} onNavigate={(id, blockId) => { void pick(id, blockId); }} /> : selected && tree ? <div className="nb-empty" role="alert"><Lock size={32} /><h2>Page unavailable</h2><p>The page may be protected, deleted or in another workspace.</p><Button onClick={() => setDrawer(true)}>Browse your notebooks</Button></div> : <div className="nb-empty"><BookOpen size={40} /><h2>A place for your team’s thinking</h2><p>Open a page or start one for ideas, build notes and discoveries.</p>{tree?.permissions.edit && tree.sections.length > 0 && <Button onClick={() => open({ action: 'create', kind: 'page', sectionId: tree.sections[0].id })}><Plus /> Create a page</Button>}</div>}
    </main></div>
    <Sheet open={drawer} onOpenChange={setDrawer}><SheetContent side="left" className="w-[min(90vw,350px)]"><SheetHeader><SheetTitle>Notebooks</SheetTitle><SheetDescription>Shared pages in this workspace</SheetDescription></SheetHeader><div className="nb-drawer">{explorer}</div></SheetContent></Sheet>
    <Dialog open={!!dialog} onOpenChange={v => { if (!v && !busy) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog?.action === 'delete' ? 'Move to trash' : dialog?.action === 'move' ? 'Move' : dialog?.action === 'rename' ? 'Rename' : 'New'} {dialog?.kind}</DialogTitle><DialogDescription>{dialog?.action === 'delete' ? `“${dialog.item?.title}” and its descendants will be hidden. Their retained data can be restored from trash.` : 'Changes are shared with your team. Protected content is available only to team admins.'}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="nb-form">
        {dialog && ['create', 'rename'].includes(dialog.action) && <><Label htmlFor="nb-name">Title</Label><Input id="nb-name" autoFocus required maxLength={200} value={name} onChange={e => setName(e.target.value)} />{dialog.kind !== 'page' && <><Label htmlFor="nb-color">Color</Label><input id="nb-color" type="color" value={color || '#3b82f6'} onChange={e => setColor(e.target.value)} /><Button type="button" variant="ghost" onClick={() => setColor('')}>Clear color{!color ? ' · cleared' : ''}</Button></>}</>}
        {dialog?.kind === 'section' && ['create','move'].includes(dialog.action) && <><Label htmlFor="nb-book">Notebook</Label><select id="nb-book" required value={targetBook} onChange={e => setTargetBook(e.target.value)}>{tree?.notebooks.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></>}
        {dialog?.kind === 'page' && ['create','move'].includes(dialog.action) && <><Label htmlFor="nb-section">Section</Label><select id="nb-section" required value={targetSection} disabled={!!dialog.parentId} onChange={e => { setTargetSection(e.target.value); setTargetParent(''); }}>{tree?.sections.map(s => <option key={s.id} value={s.id}>{tree.notebooks.find(b => b.id === s.notebookId)?.title} / {s.title}{s.protected ? ' · Admin only' : ''}</option>)}</select></>}
        {dialog?.action === 'create' && dialog.kind === 'page' && <><Label htmlFor="nb-template">Template</Label><select id="nb-template" value={template} onChange={e => setTemplate(e.target.value)}>{NOTEBOOK_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select><p className="nb-small">{NOTEBOOK_TEMPLATES.find(t => t.id === template)?.description}</p><div className="nb-template-preview" aria-label="Template preview">{NOTEBOOK_TEMPLATES.find(t => t.id === template)?.content.filter(n => n.type === 'heading').map((n,i) => <p key={i}>{n.content?.[0]?.text}</p>)}</div></>}
        {dialog?.action === 'move' && dialog.kind === 'page' && <><Label htmlFor="nb-parent">Parent page</Label><select id="nb-parent" value={targetParent} onChange={e => setTargetParent(e.target.value)}><option value="">Top level</option>{tree?.pages.filter(p => p.sectionId === Number(targetSection) && p.id !== dialog.item?.id).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><p className="nb-small">The page and its subpages move together. Admin protection is retained.</p></>}
        {error && <p role="alert" className="text-rose-500">{error}</p>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" variant={dialog?.action === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog?.action !== 'delete' && dialog?.action !== 'move' && !name.trim())}>{busy ? 'Saving…' : dialog?.action === 'delete' ? 'Move to trash' : 'Save'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </div>;
}

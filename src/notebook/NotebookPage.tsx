import React, { useCallback, useEffect, useRef, useState, useContext } from 'react';
import { useSearchParams, useMatch, useNavigate, UNSAFE_NavigationContext } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronRight, FileText, Lock, MoreHorizontal, PanelLeft, Plus, Search, Star } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui-kit';
import { apiJson as requestNotebookAPI } from '../services/api';
import { NotebookEditor, downloadNotebookJSON } from './NotebookEditor';
import { NotebookSync } from './NotebookSync';
import type { NotebookTree, NotebookPageItem } from './types';
import './notebook.css';
import './notebook-desktop.css';
import { NOTEBOOK_TEMPLATES, notebookTemplate } from './templates';
import { notebookDrop, notebookSiblings, type NotebookDrag } from './treeActions';
import { notebookPageLink } from './pageLinks';
import { findNotebookSession } from './notebookRuntime';
import { NotebookMentions } from './NotebookMentions';
import { useNotebookMobile } from './useNotebookMobile';
import { NotebookGlyph, SectionGlyph } from './NotebookIcons';
import {NotebookTrash} from './NotebookTrash';

type Kind = 'notebook' | 'section' | 'page';
type Item = { id: number; title: string; color?: string | null; protected?: boolean; ownProtected?: boolean; sectionId?: number; parentId?: number | null; notebookId?: number };
type EditDialog = { action: 'rename' | 'delete' | 'move' | 'template' | 'defaults'; kind: Kind; item?: Item; sectionId?: number; parentId?: number; notebookId?: number };
const plural = { notebook: 'notebooks', section: 'sections', page: 'pages' };
const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
// One notebook per season for now. Keep creation and its API intact for re-enabling.
const SHOW_NOTEBOOK_CREATION = false;
function readPreference(key: string): number[] { try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter(Number.isSafeInteger) : []; } catch { return []; } }
function savePreference(key: string, value: number[] | string[]) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage optional */ } }
function readCollapsed(key: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.map(n => Number.isSafeInteger(n) ? `section:${n}` : n).filter(n => typeof n === 'string' && /^(notebook|section|page):[1-9]\d*$/.test(n)) : []; } catch { return []; }
}

export function NotebookPage({ activeTeamId, currentUserId }: { activeTeamId?: number | null; currentUserId?: number }) {
  // A team change unmounts every document/pending request before the new tree.
  return <TeamNotebook key={`${currentUserId}:${activeTeamId ?? 'none'}`} teamId={activeTeamId} memberId={currentUserId} />;
}
function TeamNotebook({ teamId, memberId }: { teamId?: number | null; memberId?: number }) {
  const mobile = useNotebookMobile();
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const apiJson = <T = any,>(path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers); if (teamId) headers.set('X-CP-Notebook-Team', String(teamId));
    return requestNotebookAPI<T>(path, { ...options, headers });
  };
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pageRoute = useMatch('/notebook/p/:pageId');
  const selected = Number(params.get('page') ?? pageRoute?.params.pageId) || null;
  const [tree, setTree] = useState<NotebookTree | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<NotebookDrag | null>(null);
  const [drop, setDrop] = useState<{ kind: Kind; id: number; zone: 'before' | 'inside' | 'after' } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [writingFocus,setWritingFocus]=useState(false);
  const focusExit=useRef<HTMLButtonElement|null>(null),focusEntry=useRef<HTMLButtonElement|null>(null),mobileOpen=useRef<HTMLButtonElement|null>(null),exitFocused=useRef(false),wasWritingFocus=useRef(false);
  const skipFocusReturn = useRef(false);
  useEffect(()=>{if(!mobile){if(writingFocus)focusExit.current?.focus();else {if(wasWritingFocus.current && !skipFocusReturn.current)focusEntry.current?.focus();exitFocused.current=false;}}else if(exitFocused.current){mobileOpen.current?.focus();exitFocused.current=false;}skipFocusReturn.current=false;wasWritingFocus.current=writingFocus;},[writingFocus,mobile]);
  const [dialog, setDialog] = useState<EditDialog | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [defaultTemplate, setDefaultTemplate] = useState<string | null>(null);
  const [dateStamp, setDateStamp] = useState(false);
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
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapsedKey));
  const [renaming, setRenaming] = useState<{ kind: Kind; item: Item; title: string } | null>(null);
  const renameSaving = useRef(false);
  const [sync, setSync] = useState<NotebookSync | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const syncRef = useRef<NotebookSync | null>(null);
  const { navigator } = useContext(UNSAFE_NavigationContext);
  useEffect(() => {
    const originalPush = navigator.push, originalReplace = navigator.replace;
    let navigating = false;
    const guard = (original: typeof navigator.push) => (...args: Parameters<typeof navigator.push>) => {
      const current = syncRef.current;
      if (!current?.pending || current.locallyDurable) { original.apply(navigator, args); return; }
      if (navigating) return; navigating = true;
      void (async () => {
        if (await current.flush() || await current.persist()) original.apply(navigator, args);
        else setError('Save or recover your notebook changes before leaving this page.');
      })().finally(() => { navigating = false; });
    };
    navigator.push = guard(originalPush); navigator.replace = guard(originalReplace);
    return () => { navigator.push = originalPush; navigator.replace = originalReplace; };
  }, [navigator]);
  const mounted = useRef(true);
  const creatingRef = useRef(false); // claimed before leave() so a second click during the save cannot POST a duplicate
  const loadFailedRef = useRef(false); // set when the tree reload inside mutate fails
  const closeDrawerAfterRename = useRef(false); // mobile: keep the drawer open for the rename box, close it when rename ends

  const loadTree = useCallback(async () => {
    try {
      const value = await apiJson<NotebookTree>('/api/notebook/tree', { cache: 'no-store' });
      if (!mounted.current) return;
      loadFailedRef.current = false;
      setTree(value);
      const current = syncRef.current;
      if (current && !value.pages.some(p => p.id === current.pageId)) {
        void current.discardRecovery(); syncRef.current = null; setSync(null); setError('This page is no longer available.');
      }
    } catch (e) { loadFailedRef.current = true; if (mounted.current) setError(e instanceof Error ? e.message : 'Cannot load notebooks'); }
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
    const scope = memberId && teamId ? { memberId, teamId } : undefined;
    const retained = findNotebookSession(selected, scope);
    const next = retained ?? new NotebookSync(selected, scope);
    syncRef.current = next; setSync(next);
    if (retained) retained.resume(); else void next.start();
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
    if (current?.pending && !await current.flush() && !await current.persist()) { setError('Your changes have not reached the server. Reconnect or download recovery changes before leaving this page.'); return false; }
    return true;
  };
  const pick = async (id: number, blockId?: string, threadId?: number) => {
    if (!await leave()) return false;
    const page = tree?.pages.find(p => p.id === id), section = tree?.sections.find(s => s.id === page?.sectionId);
    const openKeys = new Set([`section:${section?.id}`, `notebook:${section?.notebookId}`]);
    let parent = page?.parentId;
    for (let depth = 0; parent && depth < 6; depth++) { openKeys.add(`page:${parent}`); parent = tree?.pages.find(p => p.id === parent)?.parentId; }
    const next = collapsed.filter(key => !openKeys.has(key)); setCollapsed(next); savePreference(collapsedKey, next);
    setParams({ page: String(id), ...(blockId ? { block: blockId } : {}), ...(threadId ? { thread: String(threadId) } : {}) }); setDrawer(false); setError(''); return true;
  };
  const onTitle = useCallback((title: string) => { const id = syncRef.current?.pageId; setTree(t => t ? { ...t, pages: t.pages.map(p => p.id === id ? { ...p, title } : p) } : t); }, []);
  const open = (value: EditDialog) => {
    setName(value.item?.title ?? ''); setColor(value.item?.color ?? '#3b82f6');
    setTemplate('blank');
    const section = value.kind === 'section' ? tree?.sections.find(s => s.id === value.item?.id) : undefined;
    setDefaultTemplate(section?.defaultTemplate ?? null);
    setDateStamp(section?.dateStamp ?? false);
    setTargetBook(String(value.notebookId ?? value.item?.notebookId ?? tree?.notebooks[0]?.id ?? ''));
    setTargetSection(String(value.sectionId ?? value.item?.sectionId ?? tree?.sections[0]?.id ?? ''));
    setTargetParent(value.parentId ? String(value.parentId) : ''); setDialog(value); setError('');
  };
  // OneNote-style instant creation: no modal, no title field, no template picker.
  // The new page/section/notebook is created as "Untitled" and immediately renamed inline.
  const createInstant = (kind: Kind, target: { sectionId?: number; parentId?: number | null; notebookId?: number }, templateId?: string) => {
    if (!tree) return;
    if (kind === 'page' && !tree.permissions.edit) { setError('Notebook editing permission is required.'); return; }
    if (kind !== 'page' && !tree.permissions.organize) { setError('Notebook organizing permission is required.'); return; }
    if (kind === 'page' && !target.sectionId) { setError('Create a notebook section before adding a page.'); return; }
    void (async () => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      try {
        if (!await leave()) return;
        let created = 0;
        loadFailedRef.current = false;
        const ok = await mutate(async () => {
          // Section defaults: explicit templateId wins, else the section's default template.
          // Date stamp prepends today's date when the section has it enabled.
          const section = kind === 'page' ? tree.sections.find(s => s.id === target.sectionId) : undefined;
          const effectiveTemplate = templateId ?? section?.defaultTemplate ?? undefined;
          let content = effectiveTemplate ? notebookTemplate(effectiveTemplate) : undefined;
          if (kind === 'page' && section?.dateStamp) {
            const stamp = { type: 'paragraph', content: [{ type: 'text', text: new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }] };
            content = content ? { type: 'doc', content: [stamp, ...(content.content ?? [])] } : { type: 'doc', content: [stamp, { type: 'paragraph' }] };
          }
          const body = kind === 'page'
            ? { title: 'Untitled', sectionId: target.sectionId, parentId: target.parentId ?? null, content }
            : kind === 'section'
              ? { title: 'Untitled', notebookId: target.notebookId }
              : { title: 'Untitled' };
          const res = await apiJson<{ id: number }>(`/api/notebook/${plural[kind]}`, { method: 'POST', body: JSON.stringify(body) });
          created = res.id;
        });
        // If the reload failed, the error is already shown — do not clear it, and do not
        // navigate/rename against a stale tree where the new row cannot render.
        if (!ok || !created || loadFailedRef.current || !mounted.current) return;
        // Make sure the new row is visible: expand its notebook/section/parent chain.
        const openKeys = new Set<string>();
        if (kind === 'page') {
          const section = tree.sections.find(s => s.id === target.sectionId);
          openKeys.add(`section:${section?.id}`); openKeys.add(`notebook:${section?.notebookId}`);
          let parent = target.parentId ?? null;
          for (let depth = 0; parent && depth < 6; depth++) { openKeys.add(`page:${parent}`); parent = tree.pages.find(p => p.id === parent)?.parentId ?? null; }
        } else if (kind === 'section') {
          openKeys.add(`notebook:${target.notebookId}`);
        }
        const next = collapsed.filter(key => !openKeys.has(key)); setCollapsed(next); savePreference(collapsedKey, next);
        setFilter('all'); setQuery(''); // filtered/search views do not render inline rename
        if (writingFocus) { skipFocusReturn.current = true; setWritingFocus(false); }
        if (kind === 'page') {
          setParams({ page: String(created) });
          // On mobile the drawer holds the rename box — keep it open until rename ends.
          if (mobile) { setDrawer(true); closeDrawerAfterRename.current = true; } else setDrawer(false);
        }
        setError(''); setAnnouncement(`${kind === 'page' ? 'Page' : kind === 'section' ? 'Section' : 'Notebook'} created. Type a name and press Enter.`);
        setRenaming({ kind, item: { id: created, title: 'Untitled' } as Item, title: 'Untitled' });
      } finally {
        creatingRef.current = false;
      }
    })();
  };
  const mutate = async (fn: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true); setError('');
    try { await fn(); await loadTree(); setDialog(null); return true; }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Notebook action failed'); return false; }
    finally { if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    const action = params.get('action'); if (!tree || !action) return;
    const next = new URLSearchParams(params); next.delete('action'); setParams(next, { replace: true });
    if (action === 'search') { setDrawer(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.nb-search input')?.focus()); }
    if (action === 'new-page') {
      createInstant('page', { sectionId });
    }
  }, [params, tree]);
  const savePageTitle = async (id: number, title: string) => {
    const current = syncRef.current;
    if (current?.pageId === id) {
      // Join first: a local title written before the initial remote document
      // arrives can lose to its independently-created Yjs map entry.
      if (!current.data && !await current.flush()) throw new Error('Wait for the page to load before renaming it.');
      if (syncRef.current !== current || !current.data?.editable || current.restoring || ['unavailable', 'conflict', 'error'].includes(current.status)) throw new Error('This page cannot be renamed right now.');
      current.doc.getMap('meta').set('title', title);
      if (!await current.flush()) throw new Error('Title has not reached the server.');
    } else {
      const base = `/api/notebook/pages/${id}`;
      const page = await apiJson(base, { cache: 'no-store' });
      await apiJson(base, { method: 'PUT', body: JSON.stringify({ title, baseRevision: page.revision }) });
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!dialog || !await leave()) return;
    const { action, kind, item } = dialog;
    if (action === 'template' && kind === 'page') {
      // Opt-in template creation: still instant "Untitled" + inline rename, just with template content.
      const sectionId = Number(targetSection), parentId = targetParent ? Number(targetParent) : null;
      setDialog(null);
      createInstant('page', { sectionId, parentId }, template);
      return;
    }
    if (action === 'defaults' && kind === 'section') {
      await mutate(() => apiJson(`/api/notebook/sections/${item!.id}`, { method: 'PATCH', body: JSON.stringify({ defaultTemplate, dateStamp }) }));
      return;
    }
    await mutate(async () => {
      const base = `/api/notebook/${plural[kind]}`;
      if (action === 'delete') { await apiJson(`${base}/${item!.id}`, { method: 'DELETE' }); if (kind === 'page' && item?.id === selected) { syncRef.current?.destroy(); syncRef.current = null; setSync(null); setParams({}); } }
      if (action === 'rename') {
        if (kind === 'page') await savePageTitle(item!.id, name.trim());
        else await apiJson(`${base}/${item!.id}`, { method: 'PATCH', body: JSON.stringify({ title: name, color }) });
      }
      if (action === 'move') await apiJson('/api/notebook/move', { method: 'POST', body: JSON.stringify({ kind, id: item!.id, to: kind === 'section' ? { notebookId: Number(targetBook) } : { sectionId: Number(targetSection), parentId: targetParent ? Number(targetParent) : null }, index: 0 }) });
    });
  };
  const toggleStar = (id: number) => { const value = stars.includes(id) ? stars.filter(n => n !== id) : [...stars, id]; setStars(value); savePreference(starKey, value); };
  const isCollapsed = (kind: Kind, id: number) => collapsed.includes(`${kind}:${id}`);
  const toggleCollapse = (kind: Kind, id: number) => { const key = `${kind}:${id}`; const value = collapsed.includes(key) ? collapsed.filter(n => n !== key) : [...collapsed, key]; setCollapsed(value); savePreference(collapsedKey, value); };
  const renameInput = (kind: Kind, item: Item) => renaming?.kind === kind && renaming.item.id === item.id ? <Input autoFocus aria-label={`Rename ${kind}`} className="nb-inline-rename" maxLength={200} value={renaming.title} onChange={e => setRenaming({ ...renaming, title: e.target.value })} onBlur={() => { void finishRename(); }} onKeyDown={e => {
    e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); endRename(); } if (e.key === 'Enter') { e.preventDefault(); void finishRename(); }
  }} /> : null;
  // Ends inline rename; on mobile after instant creation, also closes the drawer we kept open for the rename box.
  const endRename = () => { setRenaming(null); if (closeDrawerAfterRename.current) { closeDrawerAfterRename.current = false; setDrawer(false); } };
  const finishRename = async () => {
    if (!renaming || renameSaving.current) return;
    const { kind, item, title } = renaming, value = title.trim();
    if (!value) { setError('A title is required.'); return; } if (value === item.title) { endRename(); return; }
    renameSaving.current = true;
    try {
      if (!await leave()) return;
      const saved = await mutate(async () => {
        const base = `/api/notebook/${plural[kind]}/${item.id}`;
        if (kind === 'page') await savePageTitle(item.id, value);
        else await apiJson(base, { method: 'PATCH', body: JSON.stringify({ title: value }) });
        setRenaming(null);
      });
      // Only close the drawer when the save succeeded — a failed save keeps the rename box open for retry.
      if (saved && closeDrawerAfterRename.current) { closeDrawerAfterRename.current = false; setDrawer(false); }
    } finally { renameSaving.current = false; }
  };
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
      if (e.key === 'F2' && (kind === 'page' ? tree?.permissions.edit : tree?.permissions.organize)) { e.preventDefault(); setRenaming({ kind, item, title: item.title }); return; }
      if (e.key === 'Delete' && tree?.permissions.delete) { e.preventDefault(); open({ action: 'delete', kind, item }); return; }
      if (['ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault(); const closing = e.key === 'ArrowLeft';
        const hasChildren = kind === 'page' ? tree?.pages.some(p => p.parentId === item.id) : kind === 'section' ? tree?.pages.some(p => p.sectionId === item.id) : tree?.sections.some(s => s.notebookId === item.id);
        if (hasChildren && isCollapsed(kind, item.id) !== closing) toggleCollapse(kind, item.id);
        else {
          const destination = closing ? kind === 'page' ? (item.parentId ? { kind: 'page', id: item.parentId } : { kind: 'section', id: item.sectionId }) : kind === 'section' ? { kind: 'notebook', id: item.notebookId } : null : kind === 'notebook' ? { kind: 'section', id: tree?.sections.find(s => s.notebookId === item.id)?.id } : kind === 'section' ? { kind: 'page', id: tree?.pages.find(p => p.sectionId === item.id && !p.parentId)?.id } : { kind: 'page', id: tree?.pages.find(p => p.parentId === item.id)?.id };
          if (destination?.id) e.currentTarget.closest('.nb-tree-scroll')?.querySelector<HTMLButtonElement>(`button[data-nb-kind="${destination.kind}"][data-nb-id="${destination.id}"]`)?.focus();
        } return;
      }
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
      {kind === 'page' && <DropdownMenuItem onClick={() => { void window.navigator.clipboard.writeText(new URL(notebookPageLink(item.id), window.location.origin).href).then(() => setAnnouncement('Page link copied')).catch(() => setError('Clipboard unavailable')); }}>Copy page link</DropdownMenuItem>}
      {(kind === 'page' ? tree?.permissions.edit : tree?.permissions.organize) && <DropdownMenuItem onClick={() => setRenaming({ kind, item, title: item.title })}>Rename inline</DropdownMenuItem>}
      {tree?.permissions.organize && kind !== 'page' && <DropdownMenuItem onClick={() => open({ action: 'rename', kind, item })}>Rename / color</DropdownMenuItem>}
      {tree?.permissions.organize && kind === 'section' && <DropdownMenuItem onClick={() => open({ action: 'defaults', kind, item })}>Page defaults…</DropdownMenuItem>}
      {tree?.permissions.organize && kind !== 'notebook' && <DropdownMenuItem onClick={() => open({ action: 'move', kind, item })}>Move…</DropdownMenuItem>}
      {tree?.permissions.organize && <><DropdownMenuItem onClick={() => { void reorder(kind, item, -1); }}>Move up</DropdownMenuItem><DropdownMenuItem onClick={() => { void reorder(kind, item, 1); }}>Move down</DropdownMenuItem></>}
      {tree?.permissions.organize && kind === 'page' && item.parentId && <DropdownMenuItem onClick={() => { void (async () => { if (await leave()) await mutate(() => apiJson('/api/notebook/move', { method: 'POST', body: JSON.stringify({ kind, id: item.id, to: { parentId: tree.pages.find(p => p.id === item.parentId)?.parentId ?? null }, index: 0 }) })); })(); }}>Promote page</DropdownMenuItem>}
      {tree?.permissions.edit && kind === 'page' && <DropdownMenuItem onClick={() => { void (async () => { if (await leave()) await mutate(async () => { const p = await apiJson(`/api/notebook/pages/${item.id}/duplicate`, { method: 'POST', body: '{}' }); setParams({ page: String(p.id) }); }); })(); }}>Duplicate page only</DropdownMenuItem>}
      {tree?.permissions.edit && kind !== 'notebook' && <DropdownMenuItem onClick={() => createInstant('page', { sectionId: kind === 'section' ? item.id : item.sectionId, parentId: kind === 'page' ? item.id : undefined })}>Add {kind === 'page' ? 'subpage' : 'page'}</DropdownMenuItem>}
      {tree?.permissions.edit && kind !== 'notebook' && <DropdownMenuItem onClick={() => open({ action: 'template', kind: 'page', sectionId: kind === 'section' ? item.id : item.sectionId, parentId: kind === 'page' ? item.id : undefined })}>New page from template…</DropdownMenuItem>}
      {tree?.permissions.protect && kind !== 'notebook' && <DropdownMenuItem onClick={() => { void (async () => { if (await leave()) await mutate(() => apiJson(`/api/notebook/${plural[kind]}/${item.id}/protection`, { method: 'PUT', body: JSON.stringify({ protected: !(kind === 'page' ? item.ownProtected : item.protected) }) })); })(); }}>{(kind === 'page' ? item.ownProtected : item.protected) ? 'Remove direct admin protection' : 'Protect for admins'}</DropdownMenuItem>}
      {tree?.permissions.delete && <><DropdownMenuSeparator /><DropdownMenuItem className="text-rose-500" onClick={() => open({ action: 'delete', kind, item })}>Move to trash</DropdownMenuItem></>}
    </DropdownMenuContent></DropdownMenu>;
  const pageRows = (sectionId: number, parentId: number | null = null, depth = 0, baseIndent = 8): React.ReactNode => {
    if (depth >= 6) return null;
    return tree?.pages.filter(p => p.sectionId === sectionId && p.parentId === parentId).map(p => <div key={p.id}>
      <div {...rowEvents('page', p)} className={`nb-tree-row ${selected === p.id ? 'is-selected' : ''} ${dropClass('page', p.id)}`} style={{ paddingInlineStart: `${depth * 14 + baseIndent}px` }}>
        {tree.pages.some(child => child.parentId === p.id) && <button className="nb-star" aria-label={`${isCollapsed('page', p.id) ? 'Expand' : 'Collapse'} ${p.title}`} onClick={() => toggleCollapse('page', p.id)}>{isCollapsed('page', p.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>}
        {renameInput('page', p) ?? <button data-nb-focus data-nb-kind="page" data-nb-id={p.id} className="nb-tree-label" onClick={() => { void pick(p.id); }} aria-current={selected === p.id ? 'page' : undefined}><FileText size={16} /><span>{p.title}</span>{p.protected && <Lock size={13} aria-label="Admin only" />}</button>}
        <button className="nb-star" aria-label={`${stars.includes(p.id) ? 'Unpin' : 'Pin'} ${p.title}`} aria-pressed={stars.includes(p.id)} onClick={() => toggleStar(p.id)}><Star size={14} fill={stars.includes(p.id) ? 'currentColor' : 'none'} /></button>{options('page', p)}
      </div>{!isCollapsed('page', p.id) && pageRows(sectionId, p.id, depth + 1, baseIndent)}
    </div>);
  };
  const sectionId = tree?.sections.find(s => s.id === tree.pages.find(p => p.id === selected)?.sectionId)?.id
    ?? tree?.sections.find(s => s.id === activeSection)?.id ?? tree?.sections[0]?.id;
  const chooseSection = async (id: number) => {
    if (!await leave()) return;
    setActiveSection(id);
    const first = tree?.pages.find(p => p.sectionId === id && !p.parentId);
    if (first) await pick(first.id); else navigate('/notebook');
  };
  const explorer = <div className="nb-explorer-inner">
    {!mobile && <div className="nb-navigation-row"><button ref={focusEntry} aria-label="Expand writing space" title="Hide sections and pages" aria-expanded={!writingFocus} onClick={() => setWritingFocus(true)}><PanelLeft size={18} /></button><span>Notebooks</span><NotebookMentions teamId={teamId!} visiblePageIds={tree?.pages.map(p => p.id) ?? []} onNavigate={pick} /></div>}
    <div className="nb-search"><Search size={16} /><input aria-label="Search notebook titles and typed text" placeholder="Search notes…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="nb-filters" role="group" aria-label="Notebook page filter">{[['all','Notebooks'],['recent','Recent'],['starred','Pinned']].map(([id,label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setQuery(''); }}>{label}</button>)}</div>
    {tree && <div className="nb-filters"><button onClick={() => { setCollapsed([]); savePreference(collapsedKey, []); }}>Expand all</button><button onClick={() => { const keys = [...tree.notebooks.map(n => `notebook:${n.id}`), ...tree.sections.map(n => `section:${n.id}`), ...tree.pages.filter(p => tree.pages.some(child => child.parentId === p.id)).map(n => `page:${n.id}`)]; setCollapsed(keys); savePreference(collapsedKey, keys); }}>Collapse all</button></div>}
    <div className="nb-tree-scroll">
      {query.trim() ? <><p className="nb-small">{searching ? 'Searching typed notes…' : `${hits.length} results`}</p>{hits.map(h => <button key={h.id} className="nb-search-hit" onClick={() => { void pick(h.id); }}><strong>{h.title}</strong><span>{h.snippet}</span></button>)}</> : filter !== 'all' ? <>{(filter === 'starred' ? tree?.pages.filter(p => stars.includes(p.id)) : [...(tree?.pages ?? [])].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30))?.map(p => <div key={p.id} className="nb-tree-row"><button className="nb-tree-label" onClick={() => { void pick(p.id); }}><FileText size={16} /><span>{p.title}</span>{p.protected && <Lock size={13} />}</button>{options('page', p)}</div>)}</> : tree?.notebooks.map(book => <div key={book.id} className="nb-book">
        <div {...rowEvents('notebook', book)} className={`nb-tree-row nb-book-label ${dropClass('notebook', book.id)}`}>{renameInput('notebook', book) ?? <button data-nb-focus data-nb-kind="notebook" data-nb-id={book.id} className="nb-tree-label" aria-expanded={!isCollapsed('notebook', book.id)} onClick={() => toggleCollapse('notebook', book.id)}>{isCollapsed('notebook', book.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<NotebookGlyph color={book.color ?? '#88c900'} /><strong>{book.title}</strong></button>}{options('notebook', book)}</div>
        {!isCollapsed('notebook', book.id) && tree.sections.filter(s => s.notebookId === book.id).map(section => <div key={section.id}>
          <div {...rowEvents('section', section)} className={`nb-tree-row nb-section-row ${!mobile && sectionId === section.id ? 'is-selected' : ''} ${dropClass('section', section.id)}`}>{renameInput('section', section) ?? <button data-nb-focus data-nb-kind="section" data-nb-id={section.id} className="nb-tree-label" aria-expanded={mobile ? !isCollapsed('section', section.id) : undefined} aria-current={!mobile && sectionId === section.id ? 'true' : undefined} onClick={() => { if (mobile) toggleCollapse('section', section.id); else void chooseSection(section.id); }}>{mobile && (isCollapsed('section', section.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />)}<SectionGlyph color={section.color ?? '#00b5dc'} /><span>{section.title}</span>{section.protected && <Lock size={13} aria-label="Admin only" />}</button>}{options('section', section)}</div>
          {mobile && !isCollapsed('section', section.id) && <>{pageRows(section.id,null,0,72)}{tree.permissions.edit && <button className="nb-add nb-add-page" onClick={() => createInstant('page', { sectionId: section.id })}><Plus size={14} /> New page</button>}</>}
        </div>)}
        {tree.permissions.organize && <button className="nb-add nb-add-section" onClick={() => createInstant('section', { notebookId: book.id })}><Plus size={14} /> New section</button>}
      </div>)}
      {!tree && <p className="nb-small">Loading notebooks…</p>}
      {tree && !tree.notebooks.length && <p className="nb-small">No notebooks yet.</p>}
    </div>
    {(SHOW_NOTEBOOK_CREATION || tree?.notebooks.length===0) && tree?.permissions.organize && <Button variant="outline" onClick={() => createInstant('notebook', {})}><Plus /> {tree.notebooks.length ? 'New notebook' : 'Set up team notebook'}</Button>}
    {!mobile&&tree&&<NotebookTrash teamId={teamId!} tree={tree} onRestored={()=>{void loadTree();}}/>}
  </div>;
  if (!teamId) return <div className="nb-empty"><h1>Team notebook</h1><p>Select a workspace to open its shared notes.</p></div>;
  return <div className={`nb-shell ${!mobile&&writingFocus?'nb-writing-focus':''}`}>
    <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    <header className="nb-header"><Button ref={mobileOpen} variant="ghost" size="icon" className="nb-mobile" aria-label="Open notebooks" onClick={() => setDrawer(true)}><PanelLeft /></Button><BookOpen size={20} /><h1>Team notebook</h1><span className="nb-small nb-desktop">Shared with your team</span>
      <div className="nb-header-actions">{tree?.permissions.edit && tree.sections.length > 0 && <Button onClick={() => createInstant('page', { sectionId })}><Plus /> New page</Button>}
      <span className="nb-desktop"><NotebookMentions teamId={teamId} visiblePageIds={tree?.pages.map(p => p.id) ?? []} onNavigate={pick} /></span>
      <Button className="nb-desktop" variant="ghost" onClick={() => { void (async () => { if (await leave()) await mutate(async () => downloadNotebookJSON(await apiJson('/api/notebook/export', { cache: 'no-store' }), 'team-notebook.json')); })(); }}>Export</Button></div>
    </header>
    <div className="nb-ribbon-host" ref={setToolbarHost} />
    {error && <div className="nb-alert" role="alert">{error}<button aria-label="Dismiss notebook error" onClick={() => setError('')}>×</button></div>}
    <div className="nb-body">{!mobile && <><aside hidden={writingFocus} className="nb-explorer nb-desktop" aria-label="Notebook explorer">{explorer}</aside><aside hidden={writingFocus} className="nb-pages-pane nb-desktop" aria-label="Pages in selected section"><div className="nb-pages-heading"><Button variant="ghost" disabled={!tree?.permissions.edit || !sectionId} onClick={() => sectionId && createInstant('page', { sectionId })}><Plus size={17} /> Add Page</Button><span>{tree?.sections.find(s => s.id === sectionId)?.title}</span></div><div className="nb-tree-scroll">{sectionId && pageRows(sectionId)}{sectionId && !tree?.pages.some(p => p.sectionId === sectionId) && <p className="nb-small">No pages in this section yet.</p>}</div><button className="nb-export-link" onClick={() => { void (async () => { if (await leave()) await mutate(async () => downloadNotebookJSON(await apiJson('/api/notebook/export', { cache: 'no-store' }), 'team-notebook.json')); })(); }}>Export notebook</button></aside></>}<main className="nb-main">
      {!mobile&&writingFocus&&<button ref={focusExit} className="nb-focus-exit" onFocus={()=>{exitFocused.current=true;}} onBlur={()=>{exitFocused.current=false;}} onClick={()=>setWritingFocus(false)}><PanelLeft size={16}/> Show sections and pages</button>}
      {sync && sync.pageId === selected ? <NotebookEditor key={sync.pageId} sync={sync} onChanged={onTitle} pages={tree?.pages ?? []} onNavigate={(id, blockId) => { void pick(id, blockId); }} toolbarHost={toolbarHost} onRejoin={() => {
        const next = new NotebookSync(sync.pageId, memberId && teamId ? { memberId, teamId } : undefined);
        syncRef.current = next; setSync(next); setError(''); void next.start(); void loadTree();
      }} /> : selected && tree ? <div className="nb-empty" role="alert"><Lock size={32} /><h2>Page unavailable</h2><p>The page may be protected, deleted or in another workspace.</p><Button onClick={() => setDrawer(true)}>Browse your notebooks</Button></div> : <div className="nb-empty"><BookOpen size={40} /><h2>A place for your team’s thinking</h2><p>Open a page or start one for ideas, build notes and discoveries.</p>{tree?.permissions.edit && tree.sections.length > 0 && <Button onClick={() => createInstant('page', { sectionId: tree.sections[0].id })}><Plus /> Create a page</Button>}</div>}
    </main></div>
    <Sheet open={drawer} onOpenChange={setDrawer}><SheetContent side="left" className="w-[min(90vw,350px)]"><SheetHeader><SheetTitle>Notebooks</SheetTitle><SheetDescription>Shared pages in this workspace</SheetDescription></SheetHeader><div className="nb-drawer">{explorer}</div></SheetContent></Sheet>
    <Dialog open={!!dialog} onOpenChange={v => { if (!v && !busy) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog?.action === 'delete' ? 'Move to trash' : dialog?.action === 'move' ? 'Move' : dialog?.action === 'template' ? 'New page from template' : dialog?.action === 'defaults' ? 'Page defaults' : 'Rename'} {dialog?.action === 'template' || dialog?.action === 'defaults' ? '' : dialog?.kind}</DialogTitle><DialogDescription>{dialog?.action === 'delete' ? `“${dialog.item?.title}” and its descendants will be hidden. Their retained data can be restored from trash.` : dialog?.action === 'template' ? 'Pick a starting layout. The page is created as “Untitled” so you can name it right away.' : dialog?.action === 'defaults' ? 'These apply to every new page created in this section.' : 'Changes are shared with your team. Protected content is available only to team admins.'}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="nb-form">
        {dialog?.action === 'rename' && <><Label htmlFor="nb-name">Title</Label><Input id="nb-name" autoFocus required maxLength={200} value={name} onChange={e => setName(e.target.value)} />{dialog.kind !== 'page' && <><Label htmlFor="nb-color">Color</Label><input id="nb-color" type="color" value={color || '#3b82f6'} onChange={e => setColor(e.target.value)} /><Button type="button" variant="ghost" onClick={() => setColor('')}>Clear color{!color ? ' · cleared' : ''}</Button></>}</>}
        {dialog?.kind === 'section' && dialog?.action === 'move' && <><Label htmlFor="nb-book">Notebook</Label><select id="nb-book" required value={targetBook} onChange={e => setTargetBook(e.target.value)}>{tree?.notebooks.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></>}
        {dialog?.kind === 'page' && dialog?.action === 'move' && <><Label htmlFor="nb-section">Section</Label><select id="nb-section" required value={targetSection} disabled={!!dialog.parentId} onChange={e => { setTargetSection(e.target.value); setTargetParent(''); }}>{tree?.sections.map(s => <option key={s.id} value={s.id}>{tree.notebooks.find(b => b.id === s.notebookId)?.title} / {s.title}{s.protected ? ' · Admin only' : ''}</option>)}</select></>}
        {dialog?.action === 'template' && dialog.kind === 'page' && <><Label htmlFor="nb-template">Template</Label><select id="nb-template" value={template} onChange={e => setTemplate(e.target.value)}>{NOTEBOOK_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select><p className="nb-small">{NOTEBOOK_TEMPLATES.find(t => t.id === template)?.description}</p><div className="nb-template-preview" aria-label="Template preview">{NOTEBOOK_TEMPLATES.find(t => t.id === template)?.content.filter(n => n.type === 'heading').map((n,i) => <p key={i}>{n.content?.[0]?.text}</p>)}</div></>}
        {dialog?.action === 'defaults' && dialog.kind === 'section' && <><Label htmlFor="nb-default-template">Default template for new pages</Label><select id="nb-default-template" value={defaultTemplate ?? ''} onChange={e => setDefaultTemplate(e.target.value || null)}><option value="">None (blank page)</option>{NOTEBOOK_TEMPLATES.filter(t => t.id !== 'blank').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select><p className="nb-small">New pages in this section start from this layout.</p><label className="nb-check"><input type="checkbox" checked={dateStamp} onChange={e => setDateStamp(e.target.checked)} /> Stamp the date on new pages</label><p className="nb-small">Adds today's date at the top of every new page in this section.</p></>}
        {dialog?.action === 'move' && dialog.kind === 'page' && <><Label htmlFor="nb-parent">Parent page</Label><select id="nb-parent" value={targetParent} onChange={e => setTargetParent(e.target.value)}><option value="">Top level</option>{tree?.pages.filter(p => p.sectionId === Number(targetSection) && p.id !== dialog.item?.id).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><p className="nb-small">The page and its subpages move together. Admin protection is retained.</p></>}
        {error && <p role="alert" className="text-rose-500">{error}</p>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" variant={dialog?.action === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog?.action === 'rename' && !name.trim())}>{busy ? 'Saving…' : dialog?.action === 'delete' ? 'Move to trash' : dialog?.action === 'template' ? 'Create page' : 'Save'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </div>;
}

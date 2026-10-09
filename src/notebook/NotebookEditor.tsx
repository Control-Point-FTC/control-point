import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Placeholder from '@tiptap/extension-placeholder';
import { yDocToProsemirrorJSON, yUndoPluginKey } from '@tiptap/y-tiptap';
import { notebookExtensions, safeNotebookLink } from './editorSchema';
import { NotebookSync, type SyncStatus } from './NotebookSync';
import { NotebookToolbar } from './NotebookToolbar';
import { Button } from '../components/ui-kit';
import { apiJson } from '../services/api';
import type { NotebookPageItem, NotebookPageData } from './types';
import { confirmDialog } from '../components/dialog';
import { parseNotebookPageLink } from './pageLinks';
import { useSearchParams } from 'react-router-dom';
import { NotebookDiscussions } from './NotebookDiscussions';
import { useNotebookMobile } from './useNotebookMobile';
import { pasteNotebookText } from './NotebookMobileToolbar';
import { createPortal } from 'react-dom';
import { NotebookHistory } from './NotebookHistory';
const NotebookCanvas = lazy(() => import('./NotebookCanvas'));

const labels: Record<SyncStatus, string> = { joining: 'Joining…', saved: 'All changes saved', saving: 'Saving…', offline: 'Offline · changes stay on this screen', conflict: 'Local changes need recovery', unavailable: 'Page unavailable', error: 'Save needs attention' };
export function downloadNotebookJSON(value: unknown, name = 'notebook-page.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type EditorProps = { sync: NotebookSync; onChanged: (title: string) => void; pages: NotebookPageItem[]; onNavigate: (id: number, blockId?: string) => void; onRejoin?: () => void; toolbarHost?: HTMLElement | null };
export function NotebookEditor({ sync, onChanged, pages, onNavigate, onRejoin, toolbarHost }: EditorProps) {
  const [, redraw] = useState(0);
  const [downloadError, setDownloadError] = useState('');
  useEffect(() => sync.subscribe(() => redraw(v => v + 1)), [sync]);
  if (!sync.data || sync.status === 'unavailable') return <div className="nb-empty" role={sync.error ? 'alert' : 'status'}>
    <h2>{sync.status === 'joining' ? 'Opening your team’s page…' : 'This page cannot be opened'}</h2><p>{sync.error}</p>
    {sync.status === 'error' && <Button variant="outline" onClick={async () => {
      try { const source = await apiJson<NotebookPageData>(`/api/notebook/pages/${sync.pageId}`, { cache: 'no-store' }); downloadNotebookJSON(source, 'notebook-original-page.json'); }
      catch (e) { setDownloadError(e instanceof Error ? e.message : 'Cannot download this page'); }
    }}>Download original page</Button>}
    {downloadError && <p role="alert">{downloadError}</p>}
  </div>;
  return <ConnectedEditor sync={sync} onChanged={onChanged} pages={pages} onNavigate={onNavigate} onRejoin={onRejoin} toolbarHost={toolbarHost} />;
}
function ConnectedEditor({ sync, onChanged, pages, onNavigate, onRejoin, toolbarHost }: EditorProps) {
  const [, redraw] = useState(0);
  const mobile = useNotebookMobile();
  const mobileRef = React.useRef(mobile); mobileRef.current = mobile;
  const blocked = !sync.data?.editable || ['conflict', 'unavailable', 'error'].includes(sync.status);
  const [params] = useSearchParams();
  const [backlinks, setBacklinks] = useState<NotebookPageItem[]>([]);
  const [zoom, setZoom] = useState(100);
  const [ruled, setRuled] = useState(false);
  const [viewError, setViewError] = useState('');
  const [drawPanel, setDrawPanel] = useState<React.ReactNode>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const focusEditor = useCallback((value: Editor) => setActiveEditor(value), []);
  const removeEditor = useCallback((value: Editor) => setActiveEditor(current => current === value ? null : current), []);
  const editor = useEditor({
    extensions: [...notebookExtensions(true, !!sync.data?.editable), Collaboration.configure({ document: sync.doc, field: 'prosemirror' }), CollaborationCaret.configure({ provider: sync, user: { name: sync.data?.peers?.find(p => p.clientId === sync.doc.clientID)?.name ?? 'Team member', color: sync.data?.peers?.find(p => p.clientId === sync.doc.clientID)?.color ?? '#3b82f6' } }), Placeholder.configure({ placeholder: 'Write something worth sharing…' })],
    editable: !blocked,
    editorProps: { attributes: { class: 'nb-prose', 'aria-label': 'Page content', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' }, handlePaste: (view, event) => {
      if (!mobileRef.current || !view.editable) return false;
      const text = event.clipboardData?.getData('text/plain'); if (text === undefined) return true;
      event.preventDefault(); if (editor) pasteNotebookText(editor, text); return true;
    }, handleKeyDown: (_view, event) => {
      if (mobileRef.current && (event.ctrlKey || event.metaKey) && ['b','i','u'].includes(event.key.toLowerCase())) { event.preventDefault(); return true; }
      return false;
    }, handleClick: (_view, _pos, event) => {
      const href = (event.target as Element).closest('a')?.getAttribute('href');
      let internal = href;
      try { if (href && new URL(href, window.location.origin).origin === window.location.origin) internal = new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search; } catch { return false; }
      const link = parseNotebookPageLink(internal);
      if (!link) { if (href && safeNotebookLink(href)) { event.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer'); return true; } return false; }
      event.preventDefault(); onNavigate(link.pageId, link.blockId); return true;
    } },
    onFocus: ({ editor }) => setActiveEditor(editor), onSelectionUpdate: () => redraw(v => v + 1), onTransaction: () => redraw(v => v + 1),
  }, [sync]);
  const title = String(sync.doc.getMap('meta').get('title') ?? '');
  const blockId = params.get('block');
  useEffect(() => {
    if (!blockId || !editor || !/^[\w-]{1,100}$/.test(blockId)) return;
    const target = editor.view.dom.querySelector(`[data-id="${blockId}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.classList.add('nb-linked-block');
    const timer = setTimeout(() => target?.classList.remove('nb-linked-block'), 2500);
    return () => { clearTimeout(timer); target?.classList.remove('nb-linked-block'); };
  }, [blockId, editor]);
  useEffect(() => {
    const abort = new AbortController();
    const load = () => { void apiJson<NotebookPageItem[]>(`/api/notebook/pages/${sync.pageId}/backlinks`, { cache: 'no-store', signal: abort.signal }).then(setBacklinks).catch(() => { if (!abort.signal.aborted) setBacklinks([]); }); };
    load(); const timer = setInterval(load, 5000);
    return () => { clearInterval(timer); abort.abort(); };
  }, [sync]);
  useEffect(() => { editor?.setEditable(!blocked); }, [editor, blocked]);
  useEffect(() => {
    const reset = () => { if (editor) yUndoPluginKey.getState(editor.state)?.undoManager.clear(); };
    sync.on('reset', reset); return () => { sync.off('reset', reset); };
  }, [sync, editor]);
  useEffect(() => {
    const update = () => { redraw(v => v + 1); onChanged(String(sync.doc.getMap('meta').get('title') ?? '')); };
    sync.doc.getMap('meta').observe(update);
    return () => { sync.doc.getMap('meta').unobserve(update); };
  }, [sync, onChanged]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (sync.pending && !sync.locallyDurable) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [sync]);
  return <div className="nb-document">
    <div className="nb-doc-status"><span role="status" aria-live="polite">{sync.status === 'offline' && sync.locallyDurable ? 'Offline · saved on this device, will sync' : labels[sync.status]}</span>
      {sync.data?.protected && <span>Admin-only · Bruno excluded</span>}
      {!sync.data?.editable && <span>Read only</span>}
      <span>Revision {sync.data?.revision}</span>
      <span aria-label="People on this page">{sync.data?.peers?.map(p => p.name).join(', ')}</span>
    </div>
    {sync.storageError && <div className="nb-alert" role="alert">Offline recovery is unavailable: {sync.storageError}. Keep this page open until it saves.
      <Button variant="outline" onClick={() => downloadNotebookJSON({ title, content: yDocToProsemirrorJSON(sync.doc) }, 'notebook-unsaved-recovery.json')}>Download unsaved changes</Button>
    </div>}
    {sync.error && <div role="alert" className="nb-alert"><p>{sync.error}</p>
      {sync.status === 'offline' && <Button variant="outline" onClick={() => sync.retry()}>Reconnect</Button>}
      {['conflict', 'error', 'offline'].includes(sync.status) && <Button variant="outline" onClick={() => downloadNotebookJSON({ title, content: yDocToProsemirrorJSON(sync.doc) }, 'notebook-unsaved-recovery.json')}>Download unsaved changes</Button>}
      {['conflict', 'error'].includes(sync.status) && onRejoin && <Button variant="outline" onClick={async () => {
        if (!await confirmDialog({ title: 'Open the current shared page?', message: 'Your unsaved local changes will be discarded. Download them first if you want to keep them. The shared page will not be changed.', confirmLabel: 'Open shared page', danger: true })) return;
        await sync.discardRecovery(); onRejoin();
      }}>Open current shared page</Button>}
    </div>}
    {(() => {
      const panels = {
        ...(!mobile && drawPanel ? { draw: drawPanel } : {}),
        file: <><button className="nb-tool" onClick={async () => { try { if (sync.pending && !await sync.flush()) throw new Error('Save your changes before exporting.'); const headers = sync.scope ? { 'X-CP-Notebook-Team': String(sync.scope.teamId) } : undefined; downloadNotebookJSON(await apiJson(`/api/notebook/pages/${sync.pageId}`, { headers, cache: 'no-store' })); setViewError(''); } catch (e) { setViewError(e instanceof Error ? e.message : 'Export failed'); } }}>Export page</button><button className="nb-tool" onClick={() => window.print()}>Print page</button></>,
        history: <NotebookHistory sync={sync} />,
        view: <><label>Zoom <select aria-label="Page zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[...new Set([50,75,90,100,110,125,150,175,200,250,300,zoom])].sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n}%</option>)}</select></label><button className="nb-tool" aria-pressed={ruled} onClick={() => setRuled(v => !v)}>Rule lines</button><button className="nb-tool" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setViewError(''); } catch { setViewError('Full-screen mode is unavailable in this browser.'); } }}>Full page view</button></>,
      };
      const toolbar = <NotebookToolbar editor={activeEditor ?? editor} disabled={blocked} pages={pages} pageId={sync.pageId} preferenceKey={`cp-notebook-toolbar:${sync.scope?.memberId}:${sync.scope?.teamId}`} panels={panels} />;
      return toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
    })()}
    {viewError && <div className="nb-alert" role="alert">{viewError}<button aria-label="Dismiss view error" onClick={() => setViewError('')}>×</button></div>}
    <div className="nb-paper-scroll"><article className={`nb-paper ${ruled && !mobile ? 'nb-ruled' : ''}`} style={!mobile ? { zoom: zoom / 100 } : undefined}>
      <input className="nb-title" aria-label="Page title" maxLength={200} disabled={blocked} value={title} placeholder="Untitled page" onChange={e => { if (e.target.value.trim()) sync.doc.getMap('meta').set('title', e.target.value); }} />
      {sync.data?.createdAt && <time className="nb-page-date" dateTime={sync.data.createdAt}>{new Date(sync.data.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<span>{new Date(sync.data.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></time>}
      <Suspense fallback={<EditorContent editor={editor} />}><NotebookCanvas sync={sync} editable={!blocked} mobile={mobile} zoom={zoom} onZoom={setZoom} onRibbon={setDrawPanel} onEditorFocus={focusEditor} onEditorRemoved={removeEditor}><EditorContent editor={editor} /></NotebookCanvas></Suspense>
      <section className="nb-backlinks" aria-label="Backlinks"><h2>Pages linking here</h2>{backlinks.length ? backlinks.map((p, i) => <button key={`${p.id}:${i}`} onClick={() => onNavigate(p.id)}>{p.title}</button>) : <p>No visible pages link here yet.</p>}</section>
      {!mobile && <NotebookDiscussions sync={sync} editor={editor} />}
    </article></div>
  </div>;
}

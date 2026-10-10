import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Placeholder from '@tiptap/extension-placeholder';
import { yDocToProsemirrorJSON, yUndoPluginKey } from '@tiptap/y-tiptap';
import { notebookExtensions, notebookSchema, safeNotebookLink, validatedNotebookDocument } from './editorSchema';
import { useNotebookWorkspace } from './workspaceContext';
import { AutoCapitalize } from './autoCapitalize';
import { ViewControls } from './ribbon/ViewControls';
import { SlashMenu } from './slashMenu';
import { SlashMenuPopup } from './SlashMenuPopup';
import { NotebookSync, type SyncStatus } from './NotebookSync';
import { NotebookRibbonShell, NotebookToolbar } from './NotebookToolbar';
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
import { NotebookFileContext,NotebookFileView,useNotebookUpload } from './NotebookAttachments';
import { getScreenEntity, setScreenEntity } from '../services/brunoContext';
import { registerNotebookSelection, selectedNotebookBlocks } from './brunoScreen';
import { NotebookHistory } from './NotebookHistory';
import {NotebookZoom} from './NotebookZoom';
import {NotebookReader,useNotebookReaderPreferences} from './NotebookReader';
import {NotebookPaperControls,paperViewStyle,useNotebookPaperView} from './NotebookPaperView';
const NotebookCanvas = lazy(() => import('./NotebookCanvas'));

const labels: Record<SyncStatus, string> = { joining: 'Joining…', saved: 'All changes saved', saving: 'Saving…', offline: 'Offline · changes stay on this screen', conflict: 'Local changes need recovery', unavailable: 'Page unavailable', error: 'Save needs attention' };
export function downloadNotebookJSON(value: unknown, name = 'notebook-page.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type EditorProps = { sync: NotebookSync; onChanged: (title: string) => void; pages: NotebookPageItem[]; onNavigate: (id: number, blockId?: string) => void; onRejoin?: () => void; toolbarHost?: HTMLElement | null; toolbarVisible?:boolean;blockTarget?:string|null;threadTarget?:number|null;onOpenOther?:(id:number,blockId?:string)=>void };
export function NotebookEditor({ sync, onChanged, pages, onNavigate, onRejoin, toolbarHost,...paneProps }: EditorProps) {
  const [, redraw] = useState(0);
  const [downloadError, setDownloadError] = useState('');
  useEffect(() => sync.subscribe(() => redraw(v => v + 1)), [sync]);
  if (!sync.data || sync.status === 'unavailable') return <div className="nb-empty" role={sync.error ? 'alert' : 'status'}>
    {/* The ribbon stays in place while a page opens or can't be opened. */}
    {toolbarHost && paneProps.toolbarVisible !== false && createPortal(<NotebookRibbonShell loading={sync.status === 'joining'} />, toolbarHost)}
    <h2>{sync.status === 'joining' ? 'Opening your team’s page…' : 'This page cannot be opened'}</h2><p>{sync.status==='offline'?'This page is not cached on this device. Reconnect to open it.':sync.error}</p>{sync.status==='offline'&&sync.error&&<p>{sync.error}</p>}
    {sync.status === 'error' && <Button variant="outline" onClick={async () => {
      try { const source = await apiJson<NotebookPageData>(`/api/notebook/pages/${sync.pageId}`, { cache: 'no-store' }); downloadNotebookJSON(source, 'notebook-original-page.json'); }
      catch (e) { setDownloadError(e instanceof Error ? e.message : 'Cannot download this page'); }
    }}>Download original page</Button>}
    {downloadError && <p role="alert">{downloadError}</p>}
  </div>;
  return <ConnectedEditor sync={sync} onChanged={onChanged} pages={pages} onNavigate={onNavigate} onRejoin={onRejoin} toolbarHost={toolbarHost} {...paneProps}/>;
}
function ConnectedEditor({ sync, onChanged, pages, onNavigate, onRejoin, toolbarHost,toolbarVisible=true,blockTarget,threadTarget,onOpenOther }: EditorProps) {
  const [, redraw] = useState(0);
  const mobile = useNotebookMobile();
  const mobileRef = React.useRef(mobile); mobileRef.current = mobile;
  const blocked = sync.restoring || !sync.data?.editable || ['conflict', 'unavailable', 'error'].includes(sync.status);
  const [params] = useSearchParams();
  const [backlinks, setBacklinks] = useState<NotebookPageItem[]>([]);
  const [zoom, setZoom] = useState(100);
  const [readerPreferences,setReaderPreferences]=useNotebookReaderPreferences(sync.scope?`cp-notebook-reader:${sync.scope.memberId}:${sync.scope.teamId}`:undefined);
  const [paperView,setPaperView]=useNotebookPaperView(sync.scope?`cp-notebook-paper:${sync.scope.memberId}:${sync.scope.teamId}:${sync.pageId}`:undefined);
  const [viewError, setViewError] = useState('');
  const [drawPanel, setDrawPanel] = useState<React.ReactNode>(null);
  const [drawingScope,setDrawingScopeState]=useState<string|null>(null);
  const [requestedGroup,setRequestedGroup]=useState<{group:string;key:number}>();
  const drawingScopeRef=React.useRef<string|null>(null);
  const setDrawingScope=useCallback((id:string|null)=>{if(id && drawingScopeRef.current!==id)setRequestedGroup(previous=>({group:'draw',key:(previous?.key||0)+1}));drawingScopeRef.current=id;setDrawingScopeState(id);},[]);
  const [canvasTarget, setCanvasTarget] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [printing,setPrinting]=useState(false),[printProgress,setPrintProgress]=useState('');
  const printAbort=React.useRef<AbortController|null>(null),closePrintPreview=React.useRef<(()=>void)|null>(null),paper=React.useRef<HTMLElement|null>(null);
  const fitWidth=()=>{
    const page=paper.current,scroll=page?.parentElement;if(!page||!scroll)return;
    const previous=page.style.zoom;let width=0;
    // Measure authored content at its natural scale; restore before painting.
    try{page.style.zoom='1';width=Math.max(page.scrollWidth,page.getBoundingClientRect().width);}finally{page.style.zoom=previous;}
    const style=getComputedStyle(scroll),available=scroll.clientWidth-parseFloat(style.paddingLeft||'0')-parseFloat(style.paddingRight||'0');
    if(width>0&&available>0)setZoom(Math.max(50,Math.min(300,Math.floor(available/width*100))));
  };
  useEffect(()=>()=>{printAbort.current?.abort();closePrintPreview.current?.();},[sync]);
  const printPage=async()=>{
    if(printing)return;
    if(fileUpload.busy){setViewError('Wait for the attachment upload to finish before printing.');return;}
    const abort=new AbortController();printAbort.current=abort;setPrinting(true);setPrintProgress('Preparing notebook page…');
    try{
      if(sync.pending && !await sync.flush())throw new Error('Save your changes before printing.');
      const headers=sync.scope?{'X-CP-Notebook-Team':String(sync.scope.teamId)}:undefined;
      const snapshot=await apiJson<NotebookPageData>(`/api/notebook/pages/${sync.pageId}`,{headers,cache:'no-store',signal:abort.signal});
      const [{prepareNotebookPrint},{showAnnotatedPdfPrint},{captureNotebookPrintLayout}]=await Promise.all([import('./notebookPrint'),import('./pdfPrint'),import('./printLayout')]);
      const stage=paper.current?.querySelector<HTMLElement>('.nb-canvas-stage');
      if(!stage||!editor)throw new Error('The page layout is unavailable. Reopen the page before printing.');
      const local=notebookSchema.nodeFromJSON(validatedNotebookDocument(yDocToProsemirrorJSON(sync.doc))).toJSON();
      const saved=notebookSchema.nodeFromJSON(validatedNotebookDocument(snapshot.content)).toJSON();
      if(JSON.stringify(local)!==JSON.stringify(saved))throw new Error('The shared page changed. Wait for its saved layout before printing.');
      const markup=await prepareNotebookPrint(sync,snapshot,abort.signal,setPrintProgress,{width:stage.offsetWidth||800,height:stage.scrollHeight||600},captureNotebookPrintLayout(stage,editor.view.dom));
      await apiJson(`/api/notebook/pages/${sync.pageId}`,{headers,cache:'no-store',signal:abort.signal});abort.signal.throwIfAborted();
      if(['unavailable','conflict','error'].includes(sync.status))throw new Error('Page access changed. Reopen the page before printing.');
      closePrintPreview.current?.();closePrintPreview.current=showAnnotatedPdfPrint(markup,'Notebook page print preview');setViewError('');setPrintProgress('Notebook print preview ready.');
    }catch(e){if(!abort.signal.aborted)setViewError(e instanceof Error?e.message:'Cannot prepare this page.');}
    finally{if(!abort.signal.aborted)setPrinting(false);}
  };
  const workspace = useNotebookWorkspace();
  const printSection = async () => {
    if (printing) return;
    const sectionId = pages.find(p => p.id === sync.pageId)?.sectionId;
    const section = workspace?.tree?.sections.find(s => s.id === sectionId);
    if (!section) { setViewError('This page’s section is unavailable. Reopen the notebook and try again.'); return; }
    const abort = new AbortController(); printAbort.current = abort; setPrinting(true); setPrintProgress('Preparing section…');
    try {
      if (sync.pending && !await sync.flush()) throw new Error('Save your changes before printing.');
      const [{ prepareSectionPrint }, { showAnnotatedPdfPrint }] = await Promise.all([import('./sectionPrint'), import('./pdfPrint')]);
      const result = await prepareSectionPrint(section, workspace?.tree?.pages ?? pages, sync.scope, abort.signal, setPrintProgress);
      abort.signal.throwIfAborted();
      closePrintPreview.current?.(); closePrintPreview.current = showAnnotatedPdfPrint(result.markup, 'Notebook section print preview'); setViewError('');
      setPrintProgress(`Section print preview ready: ${result.printed} ${result.printed === 1 ? 'page' : 'pages'}${result.skipped.length ? ` (${result.skipped.length} no longer available)` : ''}.`);
    } catch (e) { if (!abort.signal.aborted) setViewError(e instanceof Error ? e.message : 'Cannot prepare this section.'); }
    finally { if (!abort.signal.aborted) setPrinting(false); }
  };
  // Bruno screen context: the split view reports which page is active; this
  // editor adds the ids of the smallest blocks the selection touches (a table
  // cell's paragraph, not the whole table). Text is resolved server side.
  const reportSelection = (ed: Editor) => {
    if (getScreenEntity('notebookPageId') !== sync.pageId) return;
    setScreenEntity('notebookBlockIds', selectedNotebookBlocks(ed.state));
  };
  const focusEditor = useCallback((value: Editor) => setActiveEditor(value), []);
  const removeEditor = useCallback((value: Editor) => setActiveEditor(current => current === value ? null : current), []);
  const editor = useEditor({
    extensions: [...notebookExtensions(true, !!sync.data?.editable,NotebookFileView), AutoCapitalize, SlashMenu.configure({ enabled: () => !mobileRef.current }), Collaboration.configure({ document: sync.doc, field: 'prosemirror' }), CollaborationCaret.configure({ provider: sync, user: { name: sync.data?.peers?.find(p => p.clientId === sync.doc.clientID)?.name ?? 'Team member', color: sync.data?.peers?.find(p => p.clientId === sync.doc.clientID)?.color ?? '#3b82f6' } }), Placeholder.configure({ placeholder: 'Write something worth sharing…' })],
    editable: !blocked,
    editorProps: { attributes: { class: 'nb-prose', 'aria-label': 'Page content', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' }, handlePaste: (view, event) => {
      if (!mobileRef.current || !view.editable) return false;
      const text = event.clipboardData?.getData('text/plain'); if (text === undefined) return true;
      event.preventDefault(); if (editor) pasteNotebookText(editor, text); return true;
    }, handleKeyDown: (_view, event) => {
      if (mobileRef.current && (event.ctrlKey || event.metaKey) && ['b','i','u'].includes(event.key.toLowerCase())) { event.preventDefault(); return true; }
      return false;
    }, handleDOMEvents:{click: (_view, event) => {
      const href = (event.target as Element).closest('a')?.getAttribute('href');
      let internal = href;
      try { if (href && new URL(href, window.location.origin).origin === window.location.origin) internal = new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search; } catch { return false; }
      const link = parseNotebookPageLink(internal);
      if (!link) { if (href && safeNotebookLink(href)) { event.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer'); return true; } return false; }
      event.preventDefault(); if(event.altKey&&onOpenOther)onOpenOther(link.pageId,link.blockId);else onNavigate(link.pageId, link.blockId); return true;
    }} },
    onFocus: ({ editor }) => { setActiveEditor(editor); reportSelection(editor); }, onSelectionUpdate: ({ editor }) => { redraw(v => v + 1); if (editor.isFocused) reportSelection(editor); }, onTransaction: () => redraw(v => v + 1),
  }, [sync]);
  useEffect(() => editor ? registerNotebookSelection(sync.pageId, () => selectedNotebookBlocks(editor.state)) : undefined, [editor, sync.pageId]);
  const title = String(sync.doc.getMap('meta').get('title') ?? '');
  const blockId = blockTarget===undefined?params.get('block'):blockTarget;
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
  const fileUpload=useNotebookUpload(sync,activeEditor ?? editor);
  return <NotebookFileContext.Provider value={{sync,mobile,editable:!blocked,drawingScope,setDrawingScope,onRibbon:setDrawPanel,onEditorFocus:focusEditor,onEditorRemoved:removeEditor,onSelectionChange:setCanvasTarget}}><div className="nb-document">
    <div className="nb-doc-status"><span role="status" aria-live="polite">{fileUpload.busy ? 'Uploading attachment · not saved yet' : sync.status === 'offline' && sync.locallyDurable ? 'Offline · saved on this device, will sync' : labels[sync.status]}</span>
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
        ...(!mobile && drawPanel ? { draw: <><button className="nb-tool" onClick={()=>setDrawingScope(null)}>Draw on notebook page</button>{drawPanel}</> } : {}),
        insert: fileUpload.controls,
        file: <><button className="nb-tool" onClick={async () => { try { if (sync.pending && !await sync.flush()) throw new Error('Save your changes before exporting.'); const headers = sync.scope ? { 'X-CP-Notebook-Team': String(sync.scope.teamId) } : undefined; downloadNotebookJSON(await apiJson(`/api/notebook/pages/${sync.pageId}`, { headers, cache: 'no-store' })); setViewError(''); } catch (e) { setViewError(e instanceof Error ? e.message : 'Export failed'); } }}>Export page</button><button className="nb-tool" disabled={printing} onClick={printPage}>Print page</button><button className="nb-tool" disabled={printing || !workspace?.tree} onClick={() => { void printSection(); }}>Print section</button>{printing && <button className="nb-tool" onClick={()=>{printAbort.current?.abort();setPrinting(false);setPrintProgress('Print preparation cancelled.');}}>Cancel preparation</button>}{printProgress && <span role="status">{printProgress}</span>}</>,
        history: <NotebookHistory sync={sync} onRejoin={onRejoin} />,
        view: <><ViewControls pageId={sync.pageId}/><NotebookZoom value={zoom} onChange={setZoom} onFit={fitWidth}/><NotebookPaperControls value={paperView} onChange={setPaperView}/><NotebookReader sync={sync} preferences={readerPreferences} onPreferencesChange={setReaderPreferences}/><button className="nb-tool" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setViewError(''); } catch { setViewError('Full-screen mode is unavailable in this browser.'); } }}>Full page view</button></>,
      };
      const toolbar = <div className="nb-pane-ribbon" hidden={!toolbarVisible}><NotebookToolbar editor={activeEditor ?? editor} disabled={blocked} pages={pages} pageId={sync.pageId} preferenceKey={`cp-notebook-toolbar:${sync.scope?.memberId}:${sync.scope?.teamId}`} panels={panels} requestedGroup={requestedGroup}/></div>;
      return toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
    })()}
    {sync.data?.legacyCanvas != null && <div className="nb-alert" role="status">This page has drawings from an older format. Your text remains editable and the original drawing data is retained.<Button variant="outline" onClick={() => downloadNotebookJSON({ canvas:sync.data?.legacyCanvas },'notebook-original-canvas.json')}>Download original drawings</Button></div>}
    {viewError && <div className="nb-alert" role="alert">{viewError}<button aria-label="Dismiss view error" onClick={() => setViewError('')}>×</button></div>}
    <div className="nb-paper-scroll" onClick={e => {
      // Clicking the empty paper margins focuses the editor at the end (linear-document click-anywhere).
      const t = e.target as HTMLElement;
      if (t.closest('.nb-prose, button, a, input, select, textarea, [role="dialog"], .nb-discussions, .nb-canvas-stage')) return;
      (activeEditor ?? editor)?.chain().focus('end').run();
    }}><article ref={paper} className={`nb-paper ${paperView.pattern==='ruled' && !mobile ? 'nb-ruled' : ''}`} style={!mobile ? { ...paperViewStyle(paperView),zoom: zoom / 100 } : undefined}>
      <input hidden={!mobile&&!paperView.showTitle} className="nb-title" aria-label="Page title" maxLength={200} disabled={blocked} value={title} placeholder="Untitled page" onChange={e => { if (e.target.value.trim()) sync.doc.getMap('meta').set('title', e.target.value); }} />
      {sync.data?.createdAt && <time className="nb-page-date" dateTime={sync.data.createdAt}>{new Date(sync.data.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<span>{new Date(sync.data.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></time>}
      <Suspense fallback={<EditorContent editor={editor} />}><NotebookCanvas sync={sync} active={!drawingScope} onActivate={()=>setDrawingScope(null)} editable={!blocked && !sync.data?.legacyCanvas && !drawingScope} mobile={mobile} anchorTarget={blockId} onSelectionChange={setCanvasTarget} zoom={zoom} onZoom={setZoom} onRibbon={setDrawPanel} onEditorFocus={focusEditor} onEditorRemoved={removeEditor}><EditorContent editor={editor} /></NotebookCanvas></Suspense>{!mobile && <SlashMenuPopup editor={editor} />}
      <section className="nb-backlinks" aria-label="Backlinks"><h2>Pages linking here</h2>{backlinks.length ? backlinks.map((p, i) => <button key={`${p.id}:${i}`} onClick={() => onNavigate(p.id)}>{p.title}</button>) : <p>No visible pages link here yet.</p>}</section>
      {!mobile && <NotebookDiscussions sync={sync} editor={activeEditor ?? editor} canvasTarget={canvasTarget} highlightedThreadId={threadTarget}/>}
    </article></div>
  </div></NotebookFileContext.Provider>;
}

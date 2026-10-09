import React, { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import Placeholder from '@tiptap/extension-placeholder';
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap';
import { notebookExtensions } from './editorSchema';
import { NotebookSync, type SyncStatus } from './NotebookSync';
import { NotebookToolbar } from './NotebookToolbar';
import { Button } from '../components/ui-kit';

const labels: Record<SyncStatus, string> = { joining: 'Joining…', saved: 'All changes saved', saving: 'Saving…', offline: 'Offline · changes stay on this screen', conflict: 'Page restored · recovery needed', unavailable: 'Page unavailable', error: 'Save needs attention' };
export function downloadNotebookJSON(value: unknown, name = 'notebook-page.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NotebookEditor({ sync, onChanged }: { sync: NotebookSync; onChanged: (title: string) => void }) {
  const [, redraw] = useState(0);
  useEffect(() => sync.subscribe(() => redraw(v => v + 1)), [sync]);
  if (!sync.data || sync.status === 'unavailable') return <div className="nb-empty" role={sync.error ? 'alert' : 'status'}>
    <h2>{sync.status === 'joining' ? 'Opening your team’s page…' : 'This page cannot be opened'}</h2><p>{sync.error}</p>
  </div>;
  return <ConnectedEditor sync={sync} onChanged={onChanged} />;
}
function ConnectedEditor({ sync, onChanged }: { sync: NotebookSync; onChanged: (title: string) => void }) {
  const [, redraw] = useState(0);
  const blocked = !sync.data?.editable || ['conflict', 'unavailable', 'error'].includes(sync.status);
  const editor = useEditor({
    extensions: [...notebookExtensions(true), Collaboration.configure({ document: sync.doc, field: 'prosemirror' }), Placeholder.configure({ placeholder: 'Write something worth sharing…' })],
    editable: !blocked,
    editorProps: { attributes: { class: 'nb-prose', 'aria-label': 'Page content', role: 'textbox', 'aria-multiline': 'true' } },
    onSelectionUpdate: () => redraw(v => v + 1), onTransaction: () => redraw(v => v + 1),
  }, [sync]);
  const title = String(sync.doc.getMap('meta').get('title') ?? '');
  useEffect(() => { editor?.setEditable(!blocked); }, [editor, blocked]);
  useEffect(() => {
    const update = () => { redraw(v => v + 1); onChanged(String(sync.doc.getMap('meta').get('title') ?? '')); };
    sync.doc.getMap('meta').observe(update);
    return () => { sync.doc.getMap('meta').unobserve(update); };
  }, [sync, onChanged]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (sync.pending) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [sync]);
  return <div className="nb-document">
    <div className="nb-doc-status"><span role="status" aria-live="polite">{labels[sync.status]}</span>
      {sync.data?.protected && <span>Admin-only · Bruno excluded</span>}
      {!sync.data?.editable && <span>Read only</span>}
      <span>Revision {sync.data?.revision}</span>
    </div>
    {sync.error && <div role="alert" className="nb-alert"><p>{sync.error}</p>
      {sync.status === 'offline' && <Button variant="outline" onClick={() => sync.retry()}>Reconnect</Button>}
      {['conflict', 'error'].includes(sync.status) && <Button variant="outline" onClick={() => downloadNotebookJSON({ title, content: yDocToProsemirrorJSON(sync.doc) }, 'notebook-unsaved-recovery.json')}>Download unsaved changes</Button>}
    </div>}
    <NotebookToolbar editor={editor} disabled={blocked} />
    <div className="nb-paper-scroll"><article className="nb-paper">
      <input className="nb-title" aria-label="Page title" maxLength={200} disabled={blocked} value={title} placeholder="Untitled page" onChange={e => { if (e.target.value.trim()) sync.doc.getMap('meta').set('title', e.target.value); }} />
      <EditorContent editor={editor} />
    </article></div>
  </div>;
}

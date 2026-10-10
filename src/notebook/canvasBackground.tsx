// Draw → Format Background: the page's drawing surface, shared with everyone
// on the page (unlike View's paper settings, which are per device). A solid
// color, a picture (uploaded as a page attachment, so it inherits the page's
// permissions and is never served by a raw storage URL), or both.
import React, { useEffect, useRef, useState } from 'react';
import { BACKGROUND_KEY, readBackground, type CanvasBackground } from './canvasModel';
import { apiFetch } from '../services/api';
import { fileBlob } from './NotebookAttachments';
import type { NotebookSync } from './NotebookSync';
import { ColorPalette, RibbonItem, RibbonMenu } from './ribbon/RibbonParts';
export { backgroundStyle } from './backgroundStyle';

export const BACKGROUND_COLORS = ['#ffffff', '#f5f5f4', '#e7e5e4', '#fef9c3', '#dcfce7', '#cffafe', '#dbeafe', '#fce7f3', '#ffedd5', '#1f2937'] as const;
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const FITS: [NonNullable<CanvasBackground['image']>['fit'], string][] = [['cover', 'Fill the page'], ['tile', 'Tile'], ['center', 'Center']];

/** The page's live background value (no download). */
export function useBackgroundValue(sync: NotebookSync) {
  const [background, setBackground] = useState<CanvasBackground | null>(() => readBackground(sync.doc));
  useEffect(() => {
    const meta = sync.doc.getMap('meta');
    const update = () => setBackground(readBackground(sync.doc));
    update(); meta.observe(update);
    return () => meta.unobserve(update);
  }, [sync]);
  return background;
}

/** The live background and an object URL for its picture (for the page stage only). */
export function useCanvasBackground(sync: NotebookSync) {
  const background = useBackgroundValue(sync);
  const [picture, setPicture] = useState('');
  const fileId = background?.image?.fileId;
  useEffect(() => {
    setPicture('');
    if (!fileId) return;
    const abort = new AbortController(); let url = '';
    fileBlob(sync, fileId, abort.signal).then(blob => { if (!abort.signal.aborted) { url = URL.createObjectURL(blob); setPicture(url); } }).catch(() => { /* the color still shows */ });
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [sync, fileId]);
  return { background, picture };
}

export function FormatBackground({ sync, editable, notify }: { sync: NotebookSync; editable: boolean; notify?: (message: string) => void }) {
  const background = useBackgroundValue(sync);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef<AbortController | null>(null);
  const canEdit = useRef(editable); canEdit.current = editable;
  // Leaving the page (or this pane) cancels a picture still uploading.
  useEffect(() => () => { uploading.current?.abort(); }, [sync]);
  /** Change the background from its latest shared value, so a collaborator's
   *  newer change to another part (color vs picture) is kept. */
  const update = (change: (latest: CanvasBackground) => CanvasBackground | null) => {
    const meta = sync.doc.getMap('meta');
    sync.doc.transact(() => {
      const next = change(readBackground(sync.doc) ?? { color: null, image: null });
      if (next && (next.color || next.image)) meta.set(BACKGROUND_KEY, next); else meta.delete(BACKGROUND_KEY);
    });
  };
  const current: CanvasBackground = background ?? { color: null, image: null };
  const upload = async (file: File) => {
    if (!PICTURE_TYPES.includes(file.type)) { notify?.('Choose a PNG, JPEG, GIF or WebP picture.'); return; }
    if (file.size > 25 * 1024 * 1024) { notify?.('Pictures must be 25 MB or smaller.'); return; }
    uploading.current?.abort();
    const call = new AbortController(); uploading.current = call;
    setBusy(true); notify?.(`Uploading ${file.name}…`);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await apiFetch(`/api/notebook/pages/${sync.pageId}/files`, { method: 'POST', body: form, signal: call.signal, headers: sync.scope ? { 'X-CP-Notebook-Team': String(sync.scope.teamId) } : undefined });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !Number.isSafeInteger(uploaded.id)) throw new Error(uploaded.error || 'Upload failed. Try again.');
      // The server's own reading of the file decides, not the browser's label.
      if (!PICTURE_TYPES.includes(uploaded.mimeType)) throw new Error('That file isn’t a picture the notebook can show. Choose a PNG, JPEG, GIF or WebP.');
      if (call.signal.aborted) return;
      if (!canEdit.current || ['unavailable', 'conflict', 'error'].includes(sync.status)) throw new Error('The picture uploaded, but editing is no longer available on this page.');
      update(latest => ({ color: latest.color, image: { type: 'image', fileId: uploaded.id, fit: latest.image?.fit ?? 'cover' } }));
      notify?.('Background picture set.');
    } catch (e) { if (!call.signal.aborted) notify?.(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    finally { if (uploading.current === call) { uploading.current = null; setBusy(false); } }
  };
  return <>
    <RibbonMenu label="Format background" icon="Background" showLabel disabled={!editable || busy}>
      <ColorPalette label="Background color" colors={BACKGROUND_COLORS} value={current.color} onPick={c => update(latest => ({ ...latest, color: c }))} resetLabel="No color" onReset={() => update(latest => ({ ...latest, color: null }))} />
      <RibbonItem onSelect={() => input.current?.click()}>{current.image ? 'Change picture…' : 'Picture…'}</RibbonItem>
      {current.image && FITS.map(([fit, label]) => <RibbonItem key={fit} role="menuitemradio" aria-checked={current.image!.fit === fit} onSelect={() => update(latest => latest.image ? { ...latest, image: { ...latest.image, fit } } : latest)}>{label}</RibbonItem>)}
      {current.image && <RibbonItem onSelect={() => update(latest => ({ ...latest, image: null }))}>Remove picture</RibbonItem>}
      {(current.color || current.image) && <RibbonItem onSelect={() => update(() => null)}>Reset background</RibbonItem>}
    </RibbonMenu>
    <input ref={input} type="file" accept={PICTURE_TYPES.join(',')} hidden aria-hidden="true" tabIndex={-1} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
  </>;
}

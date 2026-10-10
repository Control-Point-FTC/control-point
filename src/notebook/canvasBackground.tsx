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

export const BACKGROUND_COLORS = ['#ffffff', '#f5f5f4', '#e7e5e4', '#fef9c3', '#dcfce7', '#cffafe', '#dbeafe', '#fce7f3', '#ffedd5', '#1f2937'] as const;
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const FITS: [NonNullable<CanvasBackground['image']>['fit'], string][] = [['cover', 'Fill the page'], ['tile', 'Tile'], ['center', 'Center']];

/** The live background of a page and an object URL for its picture. */
export function useCanvasBackground(sync: NotebookSync) {
  const [background, setBackground] = useState<CanvasBackground | null>(() => readBackground(sync.doc));
  const [picture, setPicture] = useState('');
  useEffect(() => {
    const meta = sync.doc.getMap('meta');
    const update = () => setBackground(readBackground(sync.doc));
    update(); meta.observe(update);
    return () => meta.unobserve(update);
  }, [sync]);
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

/** CSS for the drawing surface; ink and text sit above it. */
export function backgroundStyle(background: CanvasBackground | null, picture: string): React.CSSProperties {
  if (!background) return {};
  const fit = background.image?.fit;
  return {
    backgroundColor: background.color ?? undefined,
    ...(picture ? {
      backgroundImage: `url("${picture}")`,
      backgroundRepeat: fit === 'tile' ? 'repeat' : 'no-repeat',
      backgroundSize: fit === 'cover' ? 'cover' : 'auto',
      backgroundPosition: fit === 'tile' ? 'top left' : 'center top',
    } : {}),
  };
}

export function FormatBackground({ sync, editable, notify }: { sync: NotebookSync; editable: boolean; notify?: (message: string) => void }) {
  const { background } = useCanvasBackground(sync);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (next: CanvasBackground | null) => {
    const meta = sync.doc.getMap('meta');
    sync.doc.transact(() => { if (next && (next.color || next.image)) meta.set(BACKGROUND_KEY, next); else meta.delete(BACKGROUND_KEY); });
  };
  const current: CanvasBackground = background ?? { color: null, image: null };
  const upload = async (file: File) => {
    if (!PICTURE_TYPES.includes(file.type)) { notify?.('Choose a PNG, JPEG, GIF or WebP picture.'); return; }
    if (file.size > 25 * 1024 * 1024) { notify?.('Pictures must be 25 MB or smaller.'); return; }
    setBusy(true); notify?.(`Uploading ${file.name}…`);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await apiFetch(`/api/notebook/pages/${sync.pageId}/files`, { method: 'POST', body: form, headers: sync.scope ? { 'X-CP-Notebook-Team': String(sync.scope.teamId) } : undefined });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !Number.isSafeInteger(uploaded.id)) throw new Error(uploaded.error || 'Upload failed. Try again.');
      set({ color: current.color, image: { type: 'image', fileId: uploaded.id, fit: current.image?.fit ?? 'cover' } });
      notify?.('Background picture set.');
    } catch (e) { notify?.(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    finally { setBusy(false); }
  };
  return <>
    <RibbonMenu label="Format background" icon="Background" showLabel disabled={!editable || busy}>
      <ColorPalette label="Background color" colors={BACKGROUND_COLORS} value={current.color} onPick={c => set({ ...current, color: c })} resetLabel="No color" onReset={() => set({ ...current, color: null })} />
      <RibbonItem onSelect={() => input.current?.click()}>{current.image ? 'Change picture…' : 'Picture…'}</RibbonItem>
      {current.image && FITS.map(([fit, label]) => <RibbonItem key={fit} role="menuitemradio" aria-checked={current.image!.fit === fit} onSelect={() => set({ ...current, image: { ...current.image!, fit } })}>{label}</RibbonItem>)}
      {current.image && <RibbonItem onSelect={() => set({ ...current, image: null })}>Remove picture</RibbonItem>}
      {(current.color || current.image) && <RibbonItem onSelect={() => set(null)}>Reset background</RibbonItem>}
    </RibbonMenu>
    <input ref={input} type="file" accept={PICTURE_TYPES.join(',')} hidden aria-hidden="true" tabIndex={-1} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
  </>;
}

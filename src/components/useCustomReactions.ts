// Shared controller for personal custom reactions (Settings → Reactions):
// list, upload and delete the viewer's own reaction images over
// GET/POST/DELETE /api/chat/custom-emoji. Only the uploader can react with
// them (`custom:<id>`); everyone else just sees them on messages. The look
// (Modern settings section) renders from this hook.
import { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { notify, confirmDialog } from './dialog';
import type { CustomEmoji } from './ReactionPicker';

/** The server refuses a 26th reaction (server.ts, POST /api/chat/custom-emoji). */
export const MAX_CUSTOM_REACTIONS = 25;

/** What the name becomes on the server: trimmed, max 32 chars, spaces → `_`. */
export const cleanReactionName = (name: string) => name.trim().slice(0, 32).replace(/\s+/g, '_');

export function useCustomReactions() {
  const [items, setItems] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTry, setLoadTry] = useState(0);

  // The list (again on Try again). A failed load is an error, not an empty
  // list, and uploads wait for it so a late snapshot can't drop a new card.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await apiFetch('/api/chat/custom-emoji');
        const rows = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(rows)) throw new Error(rows?.error || 'Could not load your reactions.');
        if (live) setItems(rows);
      } catch (e: any) {
        if (live) setLoadError(e?.message || 'Could not load your reactions.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [loadTry]);
  const reload = () => setLoadTry((n) => n + 1);
  /** The list is in: uploads and the draft controls are usable. */
  const ready = !loading && !loadError;

  // Revoke the preview's object URL when it changes or on unmount.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = (f: File | null) => {
    if (!f || uploading) return;
    if (!f.type.startsWith('image/')) {
      notify('Pick an image file (PNG, JPG, GIF, WebP).', 'error');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
  };

  const atLimit = items.length >= MAX_CUSTOM_REACTIONS;

  const upload = async () => {
    if (!ready || uploading) return;
    if (atLimit) {
      notify(`You have ${MAX_CUSTOM_REACTIONS} custom reactions — delete one to add another.`, 'error');
      return;
    }
    if (!file) {
      notify('Choose an image first.', 'error');
      return;
    }
    const cleanName = cleanReactionName(name);
    if (!cleanName) {
      notify('Give your reaction a name.', 'error');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('name', cleanName);
      // No Content-Type header: the browser sets the multipart boundary.
      const res = await apiFetch('/api/chat/custom-emoji', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setItems((prev) => [...prev, { id: data.id, name: data.name, image_url: data.image_url }]);
      setName('');
      clearFile();
      notify(`:${data.name ?? cleanName}: added — only you can use it.`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not upload that reaction.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: number, emojiName: string) => {
    const ok = await confirmDialog({
      title: 'Delete custom reaction?',
      message: `Remove :${emojiName}:? It will disappear from any messages that used it.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/chat/custom-emoji/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Delete failed');
      }
      setItems((prev) => prev.filter((c) => c.id !== id));
      notify('Reaction deleted.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not delete that reaction.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return {
    items, loading, loadError, reload, ready, name, setName, file, preview, uploading, deletingId,
    atLimit, slotsLeft: Math.max(0, MAX_CUSTOM_REACTIONS - items.length), max: MAX_CUSTOM_REACTIONS,
    pickFile, clearFile, upload, remove,
  };
}

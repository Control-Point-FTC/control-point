import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2, SmilePlus } from 'lucide-react';
import { cn } from './ui';
import { apiFetch, assetUrl } from '../services/api';
import { notify, confirmDialog } from './dialog';

interface CustomEmoji {
  id: number;
  name: string;
  image_url: string;
}

const MAX_CUSTOM = 25;

/**
 * "Reactions" section for the Discord-style SettingsModal: each user uploads
 * their own personal reaction images (max 25). Only the uploader can use them
 * to react — they show up in everyone's reaction picker read path as
 * `custom:<id>` with the image, but the server 403s anyone else's toggle.
 *
 * Drop-in: render inside SettingsModal as a new section (see integration
 * snippet in the task handoff).
 */
export default function CustomReactionsSettings() {
  const [items, setItems] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/chat/custom-emoji');
      const rows = await res.json().catch(() => []);
      if (res.ok && Array.isArray(rows)) setItems(rows);
    } catch {
      /* leave previous state */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Revoke the object URL when the preview changes/unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      notify('Pick an image file (PNG, JPG, GIF, WebP).', 'error');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file) {
      notify('Choose an image first.', 'error');
      return;
    }
    const cleanName = name.trim().slice(0, 32).replace(/\s+/g, '_');
    if (!cleanName) {
      notify('Give your reaction a name.', 'error');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('name', cleanName);
      // NOTE: no Content-Type header — the browser sets multipart boundaries.
      const res = await apiFetch('/api/chat/custom-emoji', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setItems((prev) => [...prev, { id: data.id, name: data.name, image_url: data.image_url }]);
      setName('');
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      notify(`:${cleanName}: added — only you can use it.`, 'success');
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

  const inputClass =
    'w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm';

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-bold text-text-base mb-1 flex items-center gap-2">
          <SmilePlus className="w-4 h-4 text-accent" />
          My custom reactions
        </h3>
        <p className="text-xs text-text-muted mb-4">
          Upload your own reaction images — stickers, your team mascot, an inside joke. Only you can use them to
          react; everyone else just sees them on messages. ({items.length}/{MAX_CUSTOM} used)
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your reactions…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-text-base/15 bg-primary/50 px-4 py-8 text-center">
            <SmilePlus className="w-8 h-8 mx-auto mb-2 text-text-muted/50" />
            <p className="text-sm text-text-muted">No custom reactions yet — upload your first one below.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {items.map((c) => (
              <div
                key={c.id}
                className="group relative rounded-2xl border border-text-base/10 bg-primary/60 p-2 flex flex-col items-center gap-1.5"
              >
                <img
                  src={assetUrl(c.image_url) ?? undefined}
                  alt={c.name}
                  className="w-14 h-14 object-contain rounded-lg"
                  draggable={false}
                />
                <span className="text-[11px] font-semibold text-text-base/80 truncate max-w-full">:{c.name}:</span>
                <button
                  onClick={() => remove(c.id, c.name)}
                  disabled={deletingId === c.id}
                  title={`Delete :${c.name}:`}
                  aria-label={`Delete :${c.name}:`}
                  className={cn(
                    'absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-primary/90 border border-text-base/10',
                    'text-text-muted hover:text-rose-400 hover:border-rose-400/40 transition-all',
                    'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                  )}
                >
                  {deletingId === c.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-bold text-text-base mb-3">Upload a new reaction</h3>
        <div className="rounded-2xl border border-text-base/10 bg-primary/60 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className={cn(
                'w-20 h-20 rounded-2xl border-2 border-dashed flex-shrink-0 flex items-center justify-center overflow-hidden transition-colors',
                preview ? 'border-accent/50' : 'border-text-base/15 hover:border-accent/50 text-text-muted hover:text-accent'
              )}
              aria-label="Choose reaction image"
            >
              {preview ? (
                <img src={preview} alt="preview" className="w-full h-full object-contain" />
              ) : (
                <ImagePlus className="w-7 h-7" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reaction name (e.g. zog_hype)"
                maxLength={32}
                className={inputClass}
              />
              <p className="text-[11px] text-text-muted mt-1.5">
                Square images work best. GIFs animate. {MAX_CUSTOM - items.length} slot{MAX_CUSTOM - items.length === 1 ? '' : 's'} left.
              </p>
            </div>
          </div>
          <button
            onClick={upload}
            disabled={uploading || !file || items.length >= MAX_CUSTOM}
            className={cn(
              'w-full py-2.5 rounded-xl text-sm font-bold transition-all',
              uploading || !file || items.length >= MAX_CUSTOM
                ? 'bg-text-base/10 text-text-muted cursor-not-allowed'
                : 'bg-accent text-black hover:brightness-110 active:scale-[0.99]'
            )}
          >
            {uploading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
              </span>
            ) : items.length >= MAX_CUSTOM ? (
              `Limit reached (${MAX_CUSTOM}) — delete one first`
            ) : (
              'Upload reaction'
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

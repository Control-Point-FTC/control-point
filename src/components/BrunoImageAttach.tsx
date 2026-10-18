import { FileCode2, FileText, X } from 'lucide-react';
import { notify } from './dialog';
import {
  BRUNO_REQUEST_LIMIT_BYTES, fileExtension, formatBytes, isTextLikeFile, tooLargeMessage,
} from '../utils/brunoFiles';

// Files for a Bruno message: pick several at once, drop them on the
// composer, or paste them (screenshots, copied files). Images (png, jpg,
// webp, gif, …) are downscaled here (1600px long edge, JPEG) so they stay
// small; PDFs go as they are; text and code files are read as text. The
// only limit is the AI provider's own request size (src/utils/brunoFiles.ts).
// A saved chat keeps its images and PDFs beside the message on the server.

export interface AttachedImage {
  mimeType: string; // e.g. 'image/jpeg'
  data: string; // base64, no data: prefix
  name?: string; // original filename
}

export type AttachedFile =
  | { kind: 'pdf'; mimeType: 'application/pdf'; data: string; name: string; size: number }
  | { kind: 'text'; name: string; text: string; size: number };

/** A file saved with an earlier message (GET /api/bruno/chats/:id). */
export interface SavedAttachment {
  id: number;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

function readAsBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

function fileToImage(file: File): Promise<AttachedImage | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); return resolve(null); }
        // Transparent PNGs become JPEG: give them a white page, not black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] || '';
        URL.revokeObjectURL(url);
        if (!data) return resolve(null);
        resolve({ mimeType: 'image/jpeg', data, name: file.name || 'image.jpg' });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

const isPdf = (f: File) => f.type === 'application/pdf' || fileExtension(f.name) === 'pdf';

/** Read picked, dropped or pasted files. `skipped` names the ones Bruno
 *  can't read (a .zip, a video, an image the browser can't decode). */
export async function readAttachments(files: FileList | File[]): Promise<{ images: AttachedImage[]; files: AttachedFile[]; skipped: string[] }> {
  const images: AttachedImage[] = [];
  const out: AttachedFile[] = [];
  const skipped: string[] = [];
  for (const f of Array.from(files || [])) {
    const name = f.name || 'file';
    if (isPdf(f)) {
      const data = await readAsBase64(f);
      if (data) out.push({ kind: 'pdf', mimeType: 'application/pdf', data, name, size: f.size });
      else skipped.push(name);
    } else if (f.type.startsWith('image/')) {
      const img = await fileToImage(f);
      if (img) images.push(img); else skipped.push(name);
    } else if (isTextLikeFile(name, f.type)) {
      try {
        const text = await f.text();
        out.push({ kind: 'text', name, text, size: f.size });
      } catch { skipped.push(name); }
    } else {
      skipped.push(name);
    }
  }
  return { images, files: out, skipped };
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** About how much of one request these attachments take (base64 / text). */
export function attachmentPayloadBytes(images: AttachedImage[], files: AttachedFile[]): number {
  return images.reduce((n, i) => n + i.data.length, 0)
    + files.reduce((n, f) => n + (f.kind === 'pdf' ? f.data.length : utf8Bytes(f.text)), 0);
}

/**
 * Read files and add them to the composer, all or none: if they would take
 * the message past the provider's request size, the member is told and
 * nothing is added (so the message stays sendable). Files Bruno can't read
 * are named in a notice; the rest are still added.
 */
export async function attachPicked(
  list: FileList | File[],
  current: () => { images: AttachedImage[]; files: AttachedFile[] },
  add: (images: AttachedImage[], files: AttachedFile[]) => void,
): Promise<void> {
  const picked = Array.from(list || []);
  if (!picked.length) return;
  const read = await readAttachments(picked);
  if (read.skipped.length) {
    notify(`Bruno reads images, PDFs and text or code files. Skipped: ${read.skipped.join(', ')}.`, 'info');
  }
  if (!read.images.length && !read.files.length) return;
  // What's attached once these are read (more may have been added meanwhile).
  const now = current();
  const total = attachmentPayloadBytes([...now.images, ...read.images], [...now.files, ...read.files]);
  if (total > BRUNO_REQUEST_LIMIT_BYTES) {
    notify(tooLargeMessage(total), 'error');
    return;
  }
  add(read.images, read.files);
}

/** Files in a paste (screenshots, copied files); none for plain text. */
export function filesFromPaste(e: React.ClipboardEvent): File[] {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

/** True while something with files is dragged over (not text). */
export function dragHasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

/** The file input's `accept`: every type Bruno reads. */
export const BRUNO_ACCEPT = 'image/*,application/pdf,.pdf,text/*,.txt,.md,.csv,.tsv,.json,.yaml,.yml,.toml,.xml,.log,.java,.kt,.kts,.py,.ts,.tsx,.js,.jsx,.mjs,.c,.h,.cpp,.hpp,.cs,.go,.rs,.rb,.swift,.gradle,.properties,.sh,.sql,.html,.css';

function FileChip({ label, badge, size, onRemove, code }: { label: string; badge: string; size?: number; onRemove?: () => void; code?: boolean }) {
  const Icon = code ? FileCode2 : FileText;
  return (
    <div className={`relative flex items-center gap-2 pl-2 ${onRemove ? 'pr-7' : 'pr-2.5'} py-1.5 rounded-lg border border-text-base/15 bg-text-base/5 shrink-0 max-w-[220px]`} title={label}>
      <Icon className={code ? 'w-4 h-4 shrink-0 text-sky-400' : 'w-4 h-4 shrink-0 text-rose-400'} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs text-text-base truncate">{label}</span>
        <span className="block text-[10px] text-text-muted uppercase tracking-wide">{badge}{size ? ` · ${formatBytes(size)}` : ''}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="absolute top-1/2 -translate-y-1/2 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

const badgeFor = (name: string, fallback: string) => (fileExtension(name) || fallback).toUpperCase();

/** Everything attached to the next message, each removable. */
export function AttachmentStrip({ images, files, onRemoveImage, onRemoveFile }: {
  images: AttachedImage[];
  files: AttachedFile[];
  onRemoveImage: (idx: number) => void;
  onRemoveFile: (idx: number) => void;
}) {
  if (!images.length && !files.length) return null;
  return (
    <div className="flex gap-2 px-1 pb-2 flex-wrap items-center" role="list" aria-label="Attached files">
      {images.map((img, i) => (
        <div key={`i${i}`} role="listitem" className="relative w-16 h-16 rounded-lg overflow-hidden border border-text-base/15 bg-text-base/5 shrink-0" title={img.name}>
          <img src={`data:${img.mimeType};base64,${img.data}`} alt={img.name || `Attached image ${i + 1}`} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemoveImage(i)}
            aria-label={`Remove ${img.name || 'image'}`}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {files.map((f, i) => (
        <div key={`f${i}`} role="listitem">
          <FileChip label={f.name} badge={f.kind === 'pdf' ? 'PDF' : badgeFor(f.name, 'TXT')} size={f.size} code={f.kind === 'text'} onRemove={() => onRemoveFile(i)} />
        </div>
      ))}
    </div>
  );
}

/** The files of a sent message, as shown in the conversation. */
export function SentAttachments({ images = [], pdfs = [], textFiles = [], saved = [], names = [] }: {
  images?: AttachedImage[];
  pdfs?: { name: string }[];
  textFiles?: { name: string; text: string }[];
  saved?: SavedAttachment[];
  /** "📎 Attached:" names whose files weren't kept (older chats). */
  names?: string[];
}) {
  const shown = new Set([...images.map((i) => i.name), ...pdfs.map((p) => p.name), ...saved.map((s) => s.name)]);
  const leftover = names.filter((n) => !shown.has(n));
  if (!images.length && !pdfs.length && !textFiles.length && !saved.length && !leftover.length) return null;
  return (
    <div className="mt-2 flex gap-2 flex-wrap items-center">
      {images.map((img, i) => (
        <img key={`i${i}`} src={`data:${img.mimeType};base64,${img.data}`} alt={img.name || `Image ${i + 1}`} title={img.name} className="w-20 h-20 rounded-lg object-cover border border-text-base/15" />
      ))}
      {saved.filter((s) => s.mimeType.startsWith('image/')).map((s) => (
        <a key={`s${s.id}`} href={s.url} target="_blank" rel="noreferrer" title={s.name}>
          <img src={s.url} alt={s.name} loading="lazy" className="w-20 h-20 rounded-lg object-cover border border-text-base/15" />
        </a>
      ))}
      {pdfs.map((p, i) => <FileChip key={`p${i}`} label={p.name} badge="PDF" />)}
      {saved.filter((s) => !s.mimeType.startsWith('image/')).map((s) => (
        <a key={`d${s.id}`} href={s.url} target="_blank" rel="noreferrer"><FileChip label={s.name} badge="PDF" size={s.size} /></a>
      ))}
      {textFiles.map((f, i) => <FileChip key={`t${i}`} label={f.name} badge={badgeFor(f.name, 'TXT')} size={utf8Bytes(f.text)} code />)}
      {leftover.map((n, i) => <FileChip key={`n${i}`} label={n} badge={badgeFor(n, 'FILE')} />)}
    </div>
  );
}

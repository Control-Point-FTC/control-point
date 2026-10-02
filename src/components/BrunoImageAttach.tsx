import { X } from 'lucide-react';

// Screenshot attach for Bruno chat: pick files or paste from the clipboard.
// Images are downscaled client-side (max 1600px long edge, JPEG) so the
// request stays small, sent to the AI in-memory only, and never persisted —
// nothing is written to disk or the database, which is what keeps this from
// eating server space.

export interface AttachedImage {
  mimeType: string; // e.g. 'image/jpeg'
  data: string; // base64, no data: prefix
}

export const MAX_BRUNO_IMAGES = 2;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

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
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        URL.revokeObjectURL(url);
        const data = dataUrl.split(',')[1] || '';
        if (!data) return resolve(null);
        resolve({ mimeType: 'image/jpeg', data });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Convert picked files to attached images (skips non-images). */
export async function filesToAttachedImages(files: FileList | File[]): Promise<AttachedImage[]> {
  const list = Array.from(files || []);
  const out: AttachedImage[] = [];
  for (const f of list) {
    if (out.length >= MAX_BRUNO_IMAGES) break;
    const img = await fileToImage(f);
    if (img) out.push(img);
  }
  return out;
}

/** Pull images out of a paste event (screenshots land in clipboardData.items). */
export async function imagesFromPaste(e: React.ClipboardEvent): Promise<AttachedImage[]> {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (!files.length) return [];
  return filesToAttachedImages(files);
}

/** Thumbnail strip with per-image remove buttons. */
export function AttachedImageStrip({ images, onRemove }: {
  images: AttachedImage[];
  onRemove: (idx: number) => void;
}) {
  if (!images.length) return null;
  return (
    <div className="flex gap-2 px-1 pb-2 flex-wrap">
      {images.map((img, i) => (
        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-text-base/15 bg-text-base/5 shrink-0">
          <img
            src={`data:${img.mimeType};base64,${img.data}`}
            alt={`Attached screenshot ${i + 1}`}
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Remove screenshot"
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

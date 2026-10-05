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

export interface AttachedPdf {
  mimeType: 'application/pdf';
  data: string; // base64, no data: prefix
  name: string; // original filename for display
}

export const MAX_BRUNO_IMAGES = 5;
export const MAX_BRUNO_PDFS = 5;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB per PDF

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

/** Read a PDF file as base64 (skips non-PDFs and oversized files). */
export async function filesToAttachedPdfs(files: FileList | File[]): Promise<AttachedPdf[]> {
  const list = Array.from(files || []);
  const out: AttachedPdf[] = [];
  for (const f of list) {
    if (out.length >= MAX_BRUNO_PDFS) break;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) continue;
    if (f.size > MAX_PDF_BYTES) continue;
    const data = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => {
        const url = String(r.result || '');
        const b64 = url.split(',')[1] || '';
        resolve(b64 || null);
      };
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    });
    if (data) out.push({ mimeType: 'application/pdf', data, name: f.name });
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

/** Thumbnail strip for attached PDFs with per-file remove buttons. */
export function AttachedPdfStrip({ pdfs, onRemove }: {
  pdfs: AttachedPdf[];
  onRemove: (idx: number) => void;
}) {
  if (!pdfs.length) return null;
  return (
    <div className="flex gap-2 px-1 pb-2 flex-wrap">
      {pdfs.map((pdf, i) => (
        <div key={i} className="relative flex items-center gap-2 pl-2 pr-7 py-1.5 rounded-lg border border-text-base/15 bg-text-base/5 shrink-0 max-w-[180px]">
          <span className="text-[10px] font-bold text-rose-400 bg-rose-500/15 rounded px-1 py-0.5 shrink-0">PDF</span>
          <span className="text-xs text-text-base truncate">{pdf.name}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Remove PDF"
            className="absolute top-1/2 -translate-y-1/2 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
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

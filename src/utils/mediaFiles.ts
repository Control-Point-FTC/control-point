// Which uploads browsers can show inline, and getting pasted/picked photos
// into a format they can show.

/** Image types every current browser displays. */
export const WEB_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;

/** An attachment shown as a picture: judged by its file name (served paths
 *  like /api/files/12 have no extension), then by the path. */
export function isImageName(name?: string | null, path?: string | null): boolean {
  return IMAGE_EXT.test(String(name || '')) || IMAGE_EXT.test(String(path || ''));
}

/** An attachment shown as a playable video. */
export function isVideoName(name?: string | null, path?: string | null): boolean {
  return VIDEO_EXT.test(String(name || '')) || VIDEO_EXT.test(String(path || ''));
}

/** The image files on a paste or drop: from items (Chrome, Edge) or files
 *  (Safari, Firefox), without counting one twice. */
export function imageFilesFrom(data: { items?: ArrayLike<any> | null; files?: ArrayLike<File> | null } | null | undefined): File[] {
  const out: File[] = [];
  const seen = new Set<string>();
  const add = (f: File | null | undefined) => {
    if (!f || !String(f.type || '').startsWith('image/')) return;
    const key = `${f.name}|${f.size}|${f.type}|${f.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  for (const item of Array.from(data?.items || [])) if (item?.kind === 'file') add(item.getAsFile?.());
  for (const f of Array.from(data?.files || [])) add(f);
  return out;
}

/**
 * A photo browsers can show: web formats pass through; anything else (an
 * iPhone HEIC, a TIFF) is re-drawn as a JPEG when this browser can decode
 * it. Returns null when it can't, so the caller can say so instead of
 * uploading a photo nobody can see.
 */
export async function toWebImage(file: File): Promise<File | null> {
  if (WEB_IMAGE_TYPES.has(String(file.type).toLowerCase())) return file;
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return null;
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return null;
  }
}

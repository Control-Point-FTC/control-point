// Pure chat formatting helpers (same rules as Legacy ChatView): @[Name]
// mention pills, linkified URLs with trailing punctuation stripped, the first
// URL for link previews, day-divider labels, file sizes.
import type { ReactNode } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

export function isImageFile(filepath: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(filepath);
}

export function formatFileSize(bytes: number) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDayDivider(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function extractFirstUrl(text: string): string | null {
  const m = text.match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?)]+$/, '');
  return url.startsWith('http') ? url : `https://${url}`;
}

/** Render message text with mention pills and links. */
export function renderMessageText(text: string, cls: { mention: string; link: string }): ReactNode[] {
  return text.split(/(@\[[^\]]+\])/).map((part, i) => {
    if (part.startsWith('@[') && part.endsWith(']')) {
      return <span key={i} className={cls.mention}>@{part.slice(2, -1)}</span>;
    }
    const urlParts = part.split(URL_RE);
    if (urlParts.length === 1) return part;
    return urlParts.map((up, j) => {
      URL_RE.lastIndex = 0;
      if (!URL_RE.test(up)) return up;
      URL_RE.lastIndex = 0;
      const m = up.match(/^(.*?)([.,;:!?)]+)$/);
      const clean = m ? m[1] : up;
      const trail = m ? m[2] : '';
      const href = clean.startsWith('http') ? clean : `https://${clean}`;
      return (
        <span key={`${i}-${j}`}>
          <a href={href} target="_blank" rel="noopener noreferrer" className={cls.link} onClick={(e) => e.stopPropagation()}>{clean}</a>
          {trail}
        </span>
      );
    });
  });
}

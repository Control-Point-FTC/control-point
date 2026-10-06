// Deterministic saved-email parser (moved out of EmailImport so the shared
// import hook and both looks can use it without a circular import).
import { format } from 'date-fns';

export interface ParsedEmail {
  recipient: string;
  subject: string;
  body: string;
  date: string;
  type: string;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — saved pages are text, not media

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)));
}

/** Decode quoted-printable (common in MHTML parts). Best-effort, never throws. */
function decodeQuotedPrintable(s: string): string {
  try {
    return s
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return s;
  }
}

/** Extract the first text/html part from a saved-page MHTML file. */
function extractMhtmlHtml(mhtml: string): string | null {
  const boundaryMatch = mhtml.match(/boundary=["']?([^"'\r\n;]+)["']?/i);
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1].trim();
  const parts = mhtml.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  for (const part of parts) {
    const headerEnd = part.search(/\r?\n\r?\n/);
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    let content = part.slice(headerEnd).replace(/^\r?\n/, '');
    if (!/content-type:\s*text\/html/i.test(headers)) continue;
    if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
      content = decodeQuotedPrintable(content);
    } else if (/content-transfer-encoding:\s*base64/i.test(headers)) {
      // Saved pages are rarely base64; don't guess — treat as unsupported.
      return null;
    }
    return content;
  }
  return null;
}

/** Strip tags/scripts/styles from HTML and return readable text. */
function htmlToText(html: string): { text: string; title: string } {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim());
  const cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ') // title/meta live here; keep them out of the body text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const text = decodeEntities(cleaned)
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, title };
}

const HEADER_RE = /^(from|to|cc|subject|date|sent)\s*:\s*(.+)$/i;

/** Normalize a raw date-ish string to "yyyy-MM-dd HH:mm"; falls back to now. */
function normalizeDate(raw: string): string {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd HH:mm');
  return format(new Date(), 'yyyy-MM-dd HH:mm');
}

/**
 * Deterministic saved-email parser. Handles:
 * - .mhtml/.mht (Chrome "Save page" multipart) — first text/html part
 * - .html/.htm saved pages
 * - .txt/.eml plain text with To:/Subject:/Date: header lines
 * Never throws — worst case returns empty fields for the user to fill in.
 */
export function parseEmailFile(filename: string, rawText: string): ParsedEmail {
  const name = String(filename || '').toLowerCase();
  let html = '';
  let text = rawText || '';

  if (name.endsWith('.mhtml') || name.endsWith('.mht')) {
    const part = extractMhtmlHtml(text);
    if (part == null) {
      // Unsupported (e.g. base64 part) — return blank for manual entry.
      return { recipient: '', subject: '', body: '', date: format(new Date(), 'yyyy-MM-dd HH:mm'), type: 'email' };
    }
    html = part;
  } else if (name.endsWith('.html') || name.endsWith('.htm')) {
    html = text;
  }

  let title = '';
  if (html) {
    const parsed = htmlToText(html);
    text = parsed.text;
    title = parsed.title;
  }

  // Scan the first chunk of lines for email header fields.
  const lines = text.split('\n');
  const found: Record<string, string> = {};
  let headerEnd = 0;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const m = lines[i].match(HEADER_RE);
    if (m) {
      found[m[1].toLowerCase()] = m[2].trim();
      headerEnd = i + 1;
    } else if (Object.keys(found).length > 0 && lines[i].trim() === '') {
      headerEnd = i + 1; // blank line ends the header block
      break;
    } else if (Object.keys(found).length > 0 && !HEADER_RE.test(lines[i])) {
      break; // first non-header line after headers
    }
  }

  let recipient = found.to || '';
  const subject = found.subject || title || '';
  const date = found.date || found.sent ? normalizeDate(found.date || found.sent || '') : format(new Date(), 'yyyy-MM-dd HH:mm');
  let body = headerEnd > 0 ? lines.slice(headerEnd).join('\n').trim() : text;
  // Drop a leading subject/title line duplicated from the page title.
  if (title && body.startsWith(title)) body = body.slice(title.length).trim();
  // Cap body length — the log is a summary, not an archive.
  if (body.length > 4000) body = body.slice(0, 4000).trim() + '…';

  return { recipient, subject, body, date, type: 'email' };
}

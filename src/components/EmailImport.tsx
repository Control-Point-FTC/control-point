import { useRef, useState } from 'react';
import { Upload, FileText, Sparkles, Check, X, Loader2, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { streamBuildHelper, extractActionProposals } from '../services/aiService';
import { apiUrl, apiFetch } from '../services/api';
import { Select as ThemedSelect } from './Select';

export interface ParsedEmail {
  recipient: string;
  subject: string;
  body: string;
  date: string;
  type: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — saved pages are text, not media

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

export default function EmailImportModal({ onClose, onLogged }: { onClose: () => void; onLogged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd HH:mm'));
  const [type, setType] = useState('email');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const applyParsed = (p: ParsedEmail, name: string) => {
    setRecipient(p.recipient);
    setSubject(p.subject);
    setBody(p.body);
    setDate(p.date);
    setType(p.type);
    setFileName(name);
    setParsed(true);
    setError(p.recipient || p.subject ? null : 'Could not detect the email fields — fill them in below.');
  };

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError('That file is over 5 MB — saved email pages are usually much smaller.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = parseEmailFile(f.name, String(reader.result || ''));
        applyParsed(p, f.name);
      } catch {
        setError('Could not read that file — try pasting the text instead.');
      }
    };
    reader.onerror = () => setError('Could not read that file — try pasting the text instead.');
    reader.readAsText(f);
  };

  const handlePasteParse = () => {
    const t = pasteText.trim();
    if (!t) {
      setError('Paste the saved email text first.');
      return;
    }
    setError(null);
    applyParsed(parseEmailFile('pasted.txt', t), 'pasted text');
  };

  const handleAiParse = async () => {
    const source = body || pasteText;
    if (!source.trim() || aiBusy) return;
    setAiBusy(true);
    setError(null);
    let agg = '';
    try {
      await streamBuildHelper([
        { role: 'user', text: `You are helping import a saved email into the team's communication log. The user opened the "Import email" box and clicked "Parse with Bruno" — that click is their confirmation that they want the entry proposed. Extract the recipient (To), subject, body text, and date from the email below and propose it with the \`\`\`communications block exactly as your communications log skill specifies. Resolve relative dates against today's date from your context. If the recipient is truly impossible to determine, ask one short clarifying question (no block). Do not include the page's navigation chrome or ads in the body — just the email content.\n\nEmail to parse:\n"""${source.slice(0, 6000)}"""` },
      ], (chunk) => { agg += chunk; }, undefined, { persona: 'bruno' });
      const items = extractActionProposals(agg).find((p) => p.kind === 'communication')?.items || [];
      if (items.length) {
        const c = items[0];
        setRecipient(String(c.recipient || ''));
        setSubject(String(c.subject || ''));
        setBody(String(c.body || ''));
        setDate(/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) ? `${c.date} 12:00` : format(new Date(), 'yyyy-MM-dd HH:mm'));
        setType(c.type === 'announcement' ? 'announcement' : 'email');
        setParsed(true);
        setError(null);
      } else {
        const note = agg.replace(/```communications[\s\S]*?(```|$)/g, '').replace(/```[\s\S]*?(```|$)/g, '').trim();
        setError(note || 'Bruno could not pull the email details out — fill in the fields below.');
      }
    } catch (e: any) {
      setError(e?.serverError || e?.message || "Bruno isn't reachable right now — fill in the fields below.");
    } finally {
      setAiBusy(false);
    }
  };

  const handleLog = async () => {
    if (!recipient.trim() || !subject.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Use the shared apiFetch so the real session id (X-Session-ID) travels
      // with the request — a hardcoded storage key here once sent an empty
      // session and the server answered 401 "Not signed in".
      const res = await apiFetch(apiUrl('/api/communications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: recipient.trim(), subject: subject.trim(), body: body.trim(), date, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not log it — try again.');
      onLogged();
    } catch (e: any) {
      setError(e?.message || 'Could not log it — try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-text-base/10 bg-text-base/[0.04] px-3 py-2 text-sm text-text-base placeholder:text-text-base/30 focus:outline-none focus:border-accent/60';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-text-base/10 bg-elevated p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Import saved email"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-accent" /> Import saved email
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text-base/50 hover:text-text-base hover:bg-text-base/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[13px] text-text-base/50 mb-4">
          Attach a saved email page (.html, .mhtml) or text file and Bruno figures out the fields — review before it goes in the log.
        </p>

        {!parsed && (
          <>
            <button
              onClick={() => (pasteMode ? setPasteMode(false) : fileRef.current?.click())}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
              onDragOver={(e) => e.preventDefault()}
              className="w-full rounded-xl border-2 border-dashed border-text-base/15 bg-text-base/[0.03] px-4 py-8 text-center hover:border-accent/50 hover:bg-accent/[0.04] transition-colors"
            >
              <Upload className="w-6 h-6 text-text-base/40 mx-auto mb-2" />
              <p className="text-sm font-semibold text-text-base">Drop a saved email file here, or click to browse</p>
              <p className="text-xs text-text-base/40 mt-1">.html, .htm, .mhtml, .mht, .txt, .eml — up to 5 MB</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,.mhtml,.mht,.txt,.eml"
              className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button onClick={() => setPasteMode((v) => !v)} className="mt-3 text-[13px] text-accent hover:underline flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> {pasteMode ? 'Hide paste box' : 'Or paste the email text instead'}
            </button>
            {pasteMode && (
              <div className="mt-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  placeholder="Paste the saved email here…"
                  className={inputCls + ' resize-y'}
                />
                <button
                  onClick={handlePasteParse}
                  className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink hover:brightness-110"
                >
                  Parse it
                </button>
              </div>
            )}
          </>
        )}

        {parsed && (
          <div className="space-y-3">
            <p className="text-xs text-text-base/40 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Parsed from <span className="text-text-base/70 font-medium">{fileName}</span> — check the fields before logging.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-text-base/60">To / Recipient *</span>
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="who@example.com" className={inputCls + ' mt-1'} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-text-base/60">Date</span>
                <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD HH:mm" className={inputCls + ' mt-1'} />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-text-base/60">Subject *</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" className={inputCls + ' mt-1'} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-text-base/60">Type</span>
              <ThemedSelect value={type} onChange={(e) => setType(e.target.value)} className={inputCls + ' mt-1'}>
                <option value="email">Email</option>
                <option value="announcement">Announcement</option>
              </ThemedSelect>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-text-base/60">Body</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Email content…" className={inputCls + ' mt-1 resize-y'} />
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAiParse}
                disabled={aiBusy}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiBusy ? 'Parsing…' : 'Parse with Bruno'}
              </button>
              <button
                onClick={handleLog}
                disabled={!recipient.trim() || !subject.trim() || saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Logging…' : 'Log to Communication Log'}
              </button>
              <button onClick={() => { setParsed(false); setPasteText(''); }} className="text-[13px] text-text-base/50 hover:text-text-base ml-auto">
                Start over
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-[13px] text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  );
}

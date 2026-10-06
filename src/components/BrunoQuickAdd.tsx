import { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { streamBuildHelper, extractActionProposals } from '../services/aiService';
import { apiFetch } from '../services/api';
import { Button, Input, Card } from './ui';
import { Select as ThemedSelect } from './Select';

export interface QuickAddThread {
  id: number;
  subject: string;
  recipient: string;
  date: string;
}

/**
 * Bruno Quick Add: paste an email (a fresh message, a reply, or a follow-up),
 * Bruno auto-detects recipient, subject, body, date, type, direction
 * (inbound/outbound) and which existing thread it belongs to.
 * Everything is editable before logging.
 */
export default function BrunoQuickAdd({ threads, onClose, onLogged }: {
  threads: QuickAddThread[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const [paste, setPaste] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState('');

  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd HH:mm'));
  const [type, setType] = useState('email');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound');
  const [parentId, setParentId] = useState<number | null>(null);

  const handleParse = async () => {
    const source = paste.trim();
    if (!source || aiBusy) {
      if (!source) setError('Paste the email first.');
      return;
    }
    setAiBusy(true);
    setError(null);
    let agg = '';
    try {
      const threadList = threads.slice(0, 30).map((t) =>
        `- id ${t.id}: "${t.subject}" with ${t.recipient} (${t.date})`
      ).join('\n');
      await streamBuildHelper([
        { role: 'user', text:
`You are helping quick-add an email to the team's communication log. The user pasted an email below and clicked "Parse with Bruno" — that click is their confirmation that they want the entry proposed.

Extract every field and propose it with the \`\`\`communications block exactly as your communications log skill specifies (recipient, subject, body, date, type, direction, parent_id).

- direction: "outbound" if the TEAM sent this email (From is a team member), "inbound" if someone outside wrote to the team.
- The paste may be a single email, a reply, or a follow-up the team sent. If it clearly continues one of these existing threads, set parent_id to that thread's ROOT id. Otherwise omit parent_id (new thread).

Existing threads:
${threadList || '(none yet)'}

Resolve relative dates against today's date from your context. If the recipient is truly impossible to determine, ask one short clarifying question (no block). Just the email content in the body — no signatures from quoted history beyond what's needed.

Email to parse:
"""${source.slice(0, 8000)}"""` },
      ], (chunk) => { agg += chunk; }, undefined, { persona: 'bruno' });
      const items = extractActionProposals(agg).find((p) => p.kind === 'communication')?.items || [];
      if (items.length) {
        const c = items[0];
        setRecipient(String(c.recipient || ''));
        setSubject(String(c.subject || ''));
        setBody(String(c.body || ''));
        setDate(/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) ? `${c.date} 12:00` : format(new Date(), 'yyyy-MM-dd HH:mm'));
        setType(c.type === 'announcement' ? 'announcement' : 'email');
        setDirection(c.direction === 'inbound' ? 'inbound' : 'outbound');
        const pid = Number(c.parent_id);
        setParentId(Number.isInteger(pid) && pid > 0 && threads.some((t) => t.id === pid) ? pid : null);
        setParsed(true);
        setError(null);
      } else {
        const note = agg.replace(/```communications[\s\S]*?(```|$)/g, '').replace(/```[\s\S]*?(```|$)/g, '').trim();
        setError(note || 'Bruno could not pull the details out — fill in the fields below.');
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
      const res = await apiFetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipient.trim(),
          subject: subject.trim(),
          body: body.trim(),
          date,
          type,
          direction,
          parent_id: parentId,
        }),
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

  // Thread picker: search across ALL threads; the AI prompt still gets a
  // capped list to keep the prompt small.
  const threadOptions = (() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      t.subject.toLowerCase().includes(q) || t.recipient.toLowerCase().includes(q)
    );
  })();

  const showFields = parsed || manual;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-text-base/10 bg-elevated p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Bruno quick add"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" /> Bruno quick add
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text-base/50 hover:text-text-base hover:bg-text-base/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Paste an email — a new message, a reply, or a follow-up. Bruno detects the contact, subject, direction, and thread automatically.
        </p>

        {!showFields ? (
          <div className="space-y-3">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"Paste the email here — headers and all…\n\nFrom: sponsors@polymaker.com\nTo: you@team.org\nSubject: Re: Filament sponsorship\n\nHey…"}
              rows={10}
              className={`${inputCls} font-mono text-xs resize-y min-h-[180px]`}
            />
            {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}
            <Button onClick={handleParse} disabled={aiBusy || !paste.trim()} className="w-full">
              {aiBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Bruno is reading…</> : <><Sparkles className="w-4 h-4" /> Parse with Bruno</>}
            </Button>
            <button
              onClick={() => { setManual(true); setError(null); }}
              disabled={aiBusy}
              className="w-full text-center text-xs font-semibold text-text-muted hover:text-accent transition-colors py-1 disabled:opacity-40"
            >
              Or fill in the fields manually
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Recipient</label>
                <Input value={recipient} onChange={(e: any) => setRecipient(e.target.value)} placeholder="Who is this with?" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Date</label>
                <Input value={date} onChange={(e: any) => setDate(e.target.value)} placeholder="YYYY-MM-DD HH:mm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Subject</label>
              <Input value={subject} onChange={(e: any) => setSubject(e.target.value)} placeholder="Subject" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={`${inputCls} resize-y`} placeholder="Email content…" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Direction</label>
                <ThemedSelect value={direction} onChange={(e) => setDirection(e.target.value === 'inbound' ? 'inbound' : 'outbound')} className={inputCls}>
                  <option value="outbound">⬆ We sent it</option>
                  <option value="inbound">⬇ They sent it</option>
                </ThemedSelect>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Type</label>
                <ThemedSelect value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                  <option value="email">Email</option>
                  <option value="announcement">Announcement</option>
                </ThemedSelect>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Thread</label>
                <Input
                  value={threadSearch}
                  onChange={(e: any) => setThreadSearch(e.target.value)}
                  placeholder="Search threads…"
                  className="!py-1.5 !text-xs mb-1.5"
                />
                <ThemedSelect
                  value={parentId == null ? '' : String(parentId)}
                  onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
                  className={inputCls}>
                  <option value="">New thread</option>
                  {threadOptions.slice(0, 100).map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.subject.slice(0, 28)}{t.subject.length > 28 ? '…' : ''} — {t.recipient.slice(0, 20)}</option>
                  ))}
                </ThemedSelect>
                {threadSearch.trim() && threadOptions.length === 0 && (
                  <p className="text-[11px] text-text-muted">No threads match “{threadSearch.trim()}”.</p>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setParsed(false); setManual(false); setError(null); setThreadSearch(''); }} className="flex-1">
                Back
              </Button>
              <Button onClick={handleLog} disabled={saving || !recipient.trim() || !subject.trim()} className="flex-1">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Logging…</> : 'Log it'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

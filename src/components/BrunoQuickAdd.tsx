import { X, Sparkles, Loader2 } from 'lucide-react';
import { clearQuickAddDrafts, useBrunoQuickAdd, type QuickAddThread } from './communication/useBrunoQuickAdd';
import { Button, Input, Card } from './ui';
import { Select as ThemedSelect } from './Select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui-kit';

export type { QuickAddThread } from './communication/useBrunoQuickAdd';

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
  const {
    paste, setPaste, aiBusy, setManual, saving, error, setError, threadSearch, setThreadSearch,
    recipient, setRecipient, subject, setSubject, body, setBody, date, setDate, type, setType, direction, setDirection,
    parentId, setParentId, threadOptions, showFields, handleParse, handleLog, back,
  } = useBrunoQuickAdd({ threads, onLogged });
  // Closing discards the draft (a look switch, which only remounts, keeps it).
  const close = () => { clearQuickAddDrafts(); onClose(); };

  const inputCls = 'w-full rounded-lg border border-text-base/10 bg-text-base/[0.04] px-3 py-2 text-sm text-text-base placeholder:text-text-base/30 focus:outline-none focus:border-accent/60';


  // Radix Dialog: moves focus inside on open, traps Tab, closes on Escape and
  // restores focus to the opener on close.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent showClose={false} className="max-w-xl gap-0 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <DialogTitle className="text-base font-bold text-text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" /> Bruno quick add
          </DialogTitle>
          <button onClick={close} aria-label="Close" className="p-1.5 rounded-lg text-text-base/50 hover:text-text-base hover:bg-text-base/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DialogDescription className="text-xs text-text-muted mb-4">
          Paste an email — a new message, a reply, or a follow-up. Bruno detects the contact, subject, direction, and thread automatically.
        </DialogDescription>

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
              <Button variant="secondary" onClick={back} className="flex-1">
                Back
              </Button>
              <Button onClick={handleLog} disabled={saving || !recipient.trim() || !subject.trim()} className="flex-1">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Logging…</> : 'Log it'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

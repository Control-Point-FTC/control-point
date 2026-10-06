import { useRef } from 'react';
import { Upload, FileText, Sparkles, Check, X, Loader2, Mail } from 'lucide-react';
import { clearEmailImportDrafts, useEmailImport } from './communication/useEmailImport';
import { Select as ThemedSelect } from './Select';

export { MAX_FILE_BYTES, parseEmailFile, type ParsedEmail } from './communication/emailParse';

export default function EmailImportModal({ onClose, onLogged, onRefresh }: { onClose: () => void; onLogged: () => void; onRefresh?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    fileName, error, parsed, recipient, setRecipient, subject, setSubject, body, setBody, date, setDate, type, setType,
    direction, setDirection, aiBusy, saving, pasteMode, setPasteMode, pasteText, setPasteText,
    handleFile, handlePasteParse, handleAiParse, handleLog, startOver,
  } = useEmailImport({ onLogged, onRefresh });
  // Closing discards the draft (a look switch, which only remounts, keeps it).
  const close = () => { clearEmailImportDrafts(); onClose(); };

  const inputCls = 'w-full rounded-lg border border-text-base/10 bg-text-base/[0.04] px-3 py-2 text-sm text-text-base placeholder:text-text-base/30 focus:outline-none focus:border-accent/60';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={close}>
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
          <button onClick={close} aria-label="Close" className="p-1.5 rounded-lg text-text-base/50 hover:text-text-base hover:bg-text-base/10">
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
              <span className="text-xs font-semibold text-text-base/60">Direction</span>
              <ThemedSelect value={direction} onChange={(e) => setDirection(e.target.value === 'inbound' ? 'inbound' : 'outbound')} className={inputCls + ' mt-1'}>
                <option value="outbound">⬆ We sent it</option>
                <option value="inbound">⬇ They sent it</option>
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
              <button onClick={startOver} className="text-[13px] text-text-base/50 hover:text-text-base ml-auto">
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
